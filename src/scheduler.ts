import cron from "node-cron";
import type { Telegraf } from "telegraf";
import {
  allActiveReminders,
  markReminderSent,
  saveMessage,
} from "./memory";
import { generateReminderMessage } from "./core/coach";

// Връща локалните час:минута, ден от седмицата и датата (YYYY-MM-DD) за зона.
function localParts(timezone: string): {
  hhmm: string;
  day: string;
  date: string;
} {
  const tz = timezone || "Europe/Sofia";
  let timeStr: string;
  let dateStr: string;
  let weekday: string;
  try {
    timeStr = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date());
    dateStr = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    weekday = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
    })
      .format(new Date())
      .toLowerCase();
  } catch {
    // Невалидна зона — fallback към сървърното време.
    const d = new Date();
    timeStr = d.toTimeString().slice(0, 5);
    dateStr = d.toISOString().slice(0, 10);
    weekday = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][d.getDay()];
  }
  return { hhmm: timeStr, day: weekday, date: dateStr };
}

function dayMatches(days: string, today: string): boolean {
  if (!days || days === "*") return true;
  return days
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .includes(today);
}

// Изпълнява се всяка минута: намира дължимите напомняния и ги изпраща.
async function tick(bot: Telegraf) {
  let reminders;
  try {
    reminders = await allActiveReminders();
  } catch (err) {
    console.error("Грешка при четене на напомняния:", err);
    return;
  }
  for (const r of reminders) {
    if (!r.telegramId) continue; // напомнянията се пращат в Telegram
    const { hhmm, day, date } = localParts(r.timezone);
    if (r.time !== hhmm) continue;
    if (!dayMatches(r.days, day)) continue;
    if (r.lastSentOn === date) continue; // вече изпратено днес

    try {
      const msg = await generateReminderMessage(r.userId, {
        reason: r.reason,
        promptHint: r.promptHint,
      });
      if (msg.text) {
        await bot.telegram.sendMessage(r.telegramId, msg.text);
        await saveMessage(r.userId, "assistant", msg.text, "checkin", {
          model: msg.model,
          promptTokens: msg.promptTokens,
          completionTokens: msg.completionTokens,
          costUsd: msg.costUsd,
        });
      }
      await markReminderSent(r.id, date);
    } catch (err) {
      console.error(`Грешка при напомняне ${r.id} (user ${r.userId}):`, err);
    }
  }
}

export async function startScheduler(bot: Telegraf) {
  // Всяка минута проверяваме персоналните напомняния (timezone-aware).
  cron.schedule("* * * * *", () => tick(bot));
  console.log("Scheduler стартиран: персонални напомняния се проверяват всяка минута.");
}
