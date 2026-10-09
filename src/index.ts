import "dotenv/config";
import { bot } from "./bot";
import { startScheduler } from "./scheduler";

async function main() {
  // Минутният scheduler държи Neon буден. Изключи го (TELEGRAM_SCHEDULER=off),
  // ако ботът се ползва само за разговор, а напомнянията са в сайта.
  if ((process.env.TELEGRAM_SCHEDULER || "on").toLowerCase() === "off") {
    console.log("Telegram scheduler е изключен (TELEGRAM_SCHEDULER=off).");
  } else {
    await startScheduler(bot);
  }
  // bot.launch() резолва чак при спиране (long polling), затова не го await-ваме.
  bot.launch();
  console.log("Коуч-ботът е стартиран и слуша.");
}

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

main().catch((err) => {
  console.error("Фатална грешка при стартиране:", err);
  process.exit(1);
});
