// Стартира Telegram бота заедно с уеб сървъра в ЕДИН процес.
// Изпълнява се автоматично при старт на Next.js сървъра (next start).
export async function register() {
  // Само в Node runtime (не в Edge) и само в production (за да не дублира
  // long-polling-а при локалния `next dev`, където ботът се пуска отделно).
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV !== "production") return;

  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.warn(
      "TELEGRAM_BOT_TOKEN липсва — стартира само уебът, ботът е изключен."
    );
    return;
  }

  try {
    const { bot } = await import("./src/bot");
    const { startScheduler } = await import("./src/scheduler");
    await startScheduler(bot);
    bot.launch();
    console.log("Telegram коуч-ботът стартира заедно с уеб сървъра.");
  } catch (err) {
    console.error("Грешка при стартиране на бота от instrumentation:", err);
  }
}
