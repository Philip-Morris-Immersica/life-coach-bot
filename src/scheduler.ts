import cron from "node-cron";
import type { Telegraf } from "telegraf";
import { chat, MODEL_FAST, type ChatMsg } from "./openai.js";
import { morningPrompt, eveningPrompt, buildContext } from "./prompts.js";
import {
  allActiveUsers,
  getProfile,
  getHabits,
  getInsights,
  recentMessages,
  saveMessage,
} from "./memory.js";

async function buildCheckin(userId: number, system: string): Promise<string> {
  const [profile, habits, insights, history] = await Promise.all([
    getProfile(userId),
    getHabits(userId),
    getInsights(userId),
    recentMessages(userId, 6),
  ]);
  const ctx = buildContext(profile, habits, insights);
  const messages: ChatMsg[] = [
    { role: "system", content: ctx ? `${system}\n\n${ctx}` : system },
    ...history,
  ];
  return chat(messages, { model: MODEL_FAST, temperature: 0.8 });
}

async function runCheckin(bot: Telegraf, which: "morning" | "evening") {
  const users = await allActiveUsers();
  const system = which === "morning" ? morningPrompt() : eveningPrompt();
  for (const user of users) {
    const enabled =
      which === "morning" ? user.morningCheckin : user.eveningCheckin;
    if (!enabled) continue;
    try {
      const text = await buildCheckin(user.id, system);
      if (!text) continue;
      await bot.telegram.sendMessage(user.telegramId, text);
      await saveMessage(user.id, "assistant", text, "checkin");
    } catch (err) {
      console.error(`Грешка при check-in за user ${user.id}:`, err);
    }
  }
}

export function startScheduler(bot: Telegraf) {
  const tz = process.env.TIMEZONE || "Europe/Sofia";
  const mh = process.env.MORNING_HOUR ?? "8";
  const mm = process.env.MORNING_MINUTE ?? "0";
  const eh = process.env.EVENING_HOUR ?? "21";
  const em = process.env.EVENING_MINUTE ?? "0";

  cron.schedule(`${mm} ${mh} * * *`, () => runCheckin(bot, "morning"), {
    timezone: tz,
  });
  cron.schedule(`${em} ${eh} * * *`, () => runCheckin(bot, "evening"), {
    timezone: tz,
  });

  console.log(
    `Scheduler стартиран (${tz}): сутрин ${mh}:${mm}, вечер ${eh}:${em}`
  );
}
