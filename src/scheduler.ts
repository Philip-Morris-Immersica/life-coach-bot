// ОПЦИОНАЛЕН Telegram scheduler. Ползва се само от отделния процес `npm run bot`
// (никога във Vercel). Уеб напомнянията минават през QStash + Web Push.
// Тук текстът е шаблон (без LLM) и има защита срещу застъпване на tick-овете.

import cron from "node-cron";
import type { Telegraf } from "telegraf";
import { allActiveReminders, markReminderSent, saveMessage } from "./memory";
import { buildReminderPayload } from "./notifications/content";
import { dayMatches, inQuietHours, localParts } from "./notifications/time";
import { db, usersTable } from "./db/index";
import { eq } from "drizzle-orm";

let running = false;

async function tick(bot: Telegraf) {
  if (running) return; // предишният tick още не е приключил
  running = true;
  try {
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
        const u = await db
          .select({
            paused: usersTable.notificationsPaused,
            qs: usersTable.quietHoursStart,
            qe: usersTable.quietHoursEnd,
          })
          .from(usersTable)
          .where(eq(usersTable.id, r.userId))
          .limit(1);
        const prefs = u[0];
        if (prefs?.paused || (prefs && inQuietHours(prefs.qs, prefs.qe, hhmm))) {
          await markReminderSent(r.id, date);
          continue;
        }
        // Маркираме първо — така при грешка няма да спамим всяка минута.
        await markReminderSent(r.id, date);
        const payload = buildReminderPayload(r, { privacyMode: false });
        await bot.telegram.sendMessage(r.telegramId, payload.body);
        await saveMessage(r.userId, "assistant", payload.body, "checkin");
      } catch (err) {
        console.error(`Грешка при напомняне ${r.id} (user ${r.userId}):`, err);
      }
    }
  } finally {
    running = false;
  }
}

export async function startScheduler(bot: Telegraf) {
  cron.schedule("* * * * *", () => tick(bot));
  console.log(
    "Telegram scheduler стартиран (опционален процес): проверка на напомняния всяка минута."
  );
}
