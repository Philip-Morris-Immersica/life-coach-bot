import "dotenv/config";
import { bot } from "./bot";
import { startScheduler } from "./scheduler";

async function main() {
  await startScheduler(bot);
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
