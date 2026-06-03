import cron from "node-cron";
import type { Telegraf } from "telegraf";
import { allActiveUsers, saveMessage } from "./memory";
import { generateCheckin } from "./core/coach";
import { getSettings } from "./core/settings";

async function runCheckin(bot: Telegraf, which: "morning" | "evening") {
  const users = await allActiveUsers();
  for (const user of users) {
    const enabled =
      which === "morning" ? user.morningCheckin : user.eveningCheckin;
    if (!enabled) continue;
    if (!user.telegramId) continue; // само за свързани Telegram акаунти
    try {
      const text = await generateCheckin(user.id, which);
      if (!text) continue;
      await bot.telegram.sendMessage(user.telegramId, text);
      await saveMessage(user.id, "assistant", text, "checkin");
    } catch (err) {
      console.error(`Грешка при check-in за user ${user.id}:`, err);
    }
  }
}

export async function startScheduler(bot: Telegraf) {
  const settings = await getSettings();
  const { morningHour, morningMinute, eveningHour, eveningMinute, timezone } =
    settings.checkin;

  cron.schedule(
    `${morningMinute} ${morningHour} * * *`,
    () => runCheckin(bot, "morning"),
    { timezone }
  );
  cron.schedule(
    `${eveningMinute} ${eveningHour} * * *`,
    () => runCheckin(bot, "evening"),
    { timezone }
  );

  console.log(
    `Scheduler стартиран (${timezone}): сутрин ${morningHour}:${morningMinute}, вечер ${eveningHour}:${eveningMinute}`
  );
}
