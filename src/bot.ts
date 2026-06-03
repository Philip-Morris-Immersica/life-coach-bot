import "dotenv/config";
import { Telegraf, Markup } from "telegraf";
import {
  endDeep,
  finalizeOnboarding,
  handleUserMessage,
  startDeep,
  startOnboarding,
} from "./core/coach";
import {
  createLinkCode,
  getHabits,
  getOrCreateUser,
} from "./memory";

if (!process.env.TELEGRAM_BOT_TOKEN) {
  throw new Error("Липсва TELEGRAM_BOT_TOKEN в .env");
}

export const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

const finalizeButton = Markup.inlineKeyboard([
  Markup.button.callback("Готови сме — обобщи и постави цели", "finalize"),
]);

const deepEndButton = Markup.inlineKeyboard([
  Markup.button.callback("Приключи дълбоката сесия", "end_deep"),
]);

const offerDeepButton = Markup.inlineKeyboard([
  Markup.button.callback("Да, нека влезем дълбоко", "start_deep"),
]);

// Връща клавиатурата (ако има), която ще покажем след отговор.
function keyboardFor(stage: string, offerDeep?: boolean) {
  if (stage === "onboarding") return finalizeButton;
  if (stage === "deep") return deepEndButton;
  if (offerDeep) return offerDeepButton;
  return undefined;
}

async function send(ctx: any, text: string, stage: string, offerDeep?: boolean) {
  const kb = keyboardFor(stage, offerDeep);
  if (kb) await ctx.reply(text, kb);
  else await ctx.reply(text);
}

bot.start(async (ctx) => {
  const user = await getOrCreateUser(ctx.from.id, ctx.from.first_name);
  if (user.onboardingStage === "done") {
    await ctx.reply(
      `Здравей пак, ${user.name || ""}! Тук съм. Разкажи как си, или ползвай /deep за дълбок разговор.`
    );
    return;
  }
  const reply = await startOnboarding(user.id);
  await send(ctx, reply.text, reply.stage);
});

bot.help(async (ctx) => {
  await ctx.reply(
    [
      "Аз съм твоят личен коуч за навици, вярвания и идентичност.",
      "",
      "Команди:",
      "/deep — започни дълбок коучинг разговор",
      "/end — приключи дълбоката сесия",
      "/habits — виж активните си навици",
      "/checkins on|off — включи/изключи проактивните напомняния",
      "/link — свържи Telegram с уеб профила си",
      "/reset — започни опознаването наново",
    ].join("\n")
  );
});

bot.command("deep", async (ctx) => {
  const user = await getOrCreateUser(ctx.from.id, ctx.from.first_name);
  if (user.onboardingStage !== "done") {
    await ctx.reply("Нека първо завършим опознаването.");
    return;
  }
  const reply = await startDeep(user.id);
  await send(ctx, reply.text, reply.stage);
});

bot.command("end", async (ctx) => {
  const user = await getOrCreateUser(ctx.from.id, ctx.from.first_name);
  const reply = await endDeep(user.id);
  await send(ctx, reply.text, reply.stage);
});

bot.command("habits", async (ctx) => {
  const user = await getOrCreateUser(ctx.from.id, ctx.from.first_name);
  const habits = await getHabits(user.id);
  if (!habits.length) {
    await ctx.reply("Още нямаш активни навици. Започни с /start или /reset.");
    return;
  }
  await ctx.reply(
    "Активни навици:\n" +
      habits
        .map(
          (h, i) =>
            `${i + 1}. ${h.name} (${h.cadence})${h.identityLink ? `\n   -> ${h.identityLink}` : ""}`
        )
        .join("\n")
  );
});

bot.command("checkins", async (ctx) => {
  const user = await getOrCreateUser(ctx.from.id, ctx.from.first_name);
  const arg = ctx.message.text.split(/\s+/)[1]?.toLowerCase();
  if (arg !== "on" && arg !== "off") {
    await ctx.reply("Ползвай: /checkins on  или  /checkins off");
    return;
  }
  const { db, usersTable } = await import("./db/index.js");
  const { eq } = await import("drizzle-orm");
  const on = arg === "on";
  await db
    .update(usersTable)
    .set({ morningCheckin: on, eveningCheckin: on })
    .where(eq(usersTable.id, user.id));
  await ctx.reply(on ? "Напомнянията са ВКЛЮЧЕНИ." : "Напомнянията са ИЗКЛЮЧЕНИ.");
});

bot.command("link", async (ctx) => {
  const user = await getOrCreateUser(ctx.from.id, ctx.from.first_name);
  const code = await createLinkCode(user.id, "link", 15);
  await ctx.reply(
    [
      "Свържи този Telegram акаунт с уеб профила си.",
      "",
      `Код: ${code}`,
      "",
      "Влез в сайта, отвори 'Свържи Telegram' и въведи кода. Валиден е 15 минути.",
    ].join("\n")
  );
});

bot.command("reset", async (ctx) => {
  const user = await getOrCreateUser(ctx.from.id, ctx.from.first_name);
  const reply = await startOnboarding(user.id);
  await send(ctx, reply.text, reply.stage);
});

bot.action("finalize", async (ctx) => {
  await ctx.answerCbQuery("Обобщавам...");
  const user = await getOrCreateUser(ctx.from.id, ctx.from.first_name);
  const reply = await finalizeOnboarding(user.id);
  await send(ctx, reply.text, reply.stage);
});

bot.action("start_deep", async (ctx) => {
  await ctx.answerCbQuery();
  const user = await getOrCreateUser(ctx.from.id, ctx.from.first_name);
  const reply = await startDeep(user.id);
  await send(ctx, reply.text, reply.stage);
});

bot.action("end_deep", async (ctx) => {
  await ctx.answerCbQuery();
  const user = await getOrCreateUser(ctx.from.id, ctx.from.first_name);
  const reply = await endDeep(user.id);
  await send(ctx, reply.text, reply.stage);
});

bot.on("text", async (ctx) => {
  const text = ctx.message.text;
  if (text.startsWith("/")) return;
  const user = await getOrCreateUser(ctx.from.id, ctx.from.first_name);
  await ctx.sendChatAction("typing");
  const reply = await handleUserMessage(user.id, text, {
    onboardingStage: user.onboardingStage,
    mode: user.mode,
  });
  await send(ctx, reply.text, reply.stage, reply.offerDeep);
});
