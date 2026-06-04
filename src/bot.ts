import "dotenv/config";
import { Telegraf, Markup } from "telegraf";
import {
  endDeep,
  finalizeOnboarding,
  handleUserMessage,
  startDeep,
  startOrientation,
  type CoachReply,
} from "./core/coach";
import {
  createLinkCode,
  getHabits,
  getOrCreateUser,
  listReminders,
} from "./memory";

if (!process.env.TELEGRAM_BOT_TOKEN) {
  throw new Error("Липсва TELEGRAM_BOT_TOKEN в .env");
}

export const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Строи inline клавиатура спрямо отговора (опции, предложение за сесия, етап).
function keyboardFor(reply: CoachReply) {
  const rows: any[] = [];
  if (reply.options?.items?.length) {
    for (const o of reply.options.items) {
      const data = `opt:${o.value}`.slice(0, 60);
      rows.push([Markup.button.callback(o.label, data)]);
    }
  }
  if (reply.offer) {
    const label =
      reply.offer.type === "short" ? "Кратка сесия" : "Дълбока сесия";
    rows.push([Markup.button.callback(`Започни: ${label}`, "start_deep")]);
  }
  if (reply.stage === "onboarding") {
    rows.push([
      Markup.button.callback("Готови сме — обобщи и постави цели", "finalize"),
    ]);
  }
  if (reply.stage === "deep") {
    rows.push([Markup.button.callback("Приключи дълбоката сесия", "end_deep")]);
  }
  return rows.length ? Markup.inlineKeyboard(rows) : undefined;
}

async function send(ctx: any, reply: CoachReply) {
  // Ако коучът предлага сесия, добавяме кратко защо + линк към уеб.
  let text = reply.text;
  if (reply.offer?.reason) {
    text += `\n\n${reply.offer.reason}`;
  }
  const kb = keyboardFor(reply);
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
  const reply = await startOrientation(user.id);
  await send(ctx, reply);
});

bot.help(async (ctx) => {
  await ctx.reply(
    [
      "Аз съм твоят личен коуч и ментор за навици, вярвания и идентичност.",
      "",
      "Команди:",
      "/deep — започни дълбок коучинг разговор",
      "/end — приключи дълбоката сесия",
      "/habits — виж активните си навици",
      "/reminders — виж напомнянията си",
      "/link — свържи Telegram с уеб профила си",
      "/reset — започни наново",
    ].join("\n")
  );
});

bot.command("deep", async (ctx) => {
  const user = await getOrCreateUser(ctx.from.id, ctx.from.first_name);
  const reply = await startDeep(user.id);
  await send(ctx, reply);
});

bot.command("end", async (ctx) => {
  const user = await getOrCreateUser(ctx.from.id, ctx.from.first_name);
  const reply = await endDeep(user.id);
  await send(ctx, reply);
});

bot.command("habits", async (ctx) => {
  const user = await getOrCreateUser(ctx.from.id, ctx.from.first_name);
  const habits = await getHabits(user.id);
  if (!habits.length) {
    await ctx.reply("Още нямаш активни навици. Започни с /start.");
    return;
  }
  const building = habits.filter((h) => h.kind !== "limiting");
  const limiting = habits.filter((h) => h.kind === "limiting");
  const lines: string[] = [];
  if (building.length) {
    lines.push("Навици за изграждане:");
    building.forEach((h, i) =>
      lines.push(
        `${i + 1}. ${h.name} (${h.cadence})${h.identityLink ? `\n   -> ${h.identityLink}` : ""}`
      )
    );
  }
  if (limiting.length) {
    lines.push("\nОграничаващи навици:");
    limiting.forEach((h, i) =>
      lines.push(`${i + 1}. ${h.name}${h.trigger ? ` (тригер: ${h.trigger})` : ""}`)
    );
  }
  await ctx.reply(lines.join("\n"));
});

bot.command("reminders", async (ctx) => {
  const user = await getOrCreateUser(ctx.from.id, ctx.from.first_name);
  const list = await listReminders(user.id);
  if (!list.length) {
    await ctx.reply(
      "Нямаш настроени напомняния. Кажи ми кога и за какво да ти пиша и ще ги настроя."
    );
    return;
  }
  await ctx.reply(
    "Напомняния:\n" +
      list
        .map((r) => `- ${r.time}${r.reason ? ` — ${r.reason}` : ""}`)
        .join("\n")
  );
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
  const reply = await startOrientation(user.id);
  await send(ctx, reply);
});

bot.action("finalize", async (ctx) => {
  await ctx.answerCbQuery("Обобщавам...");
  const user = await getOrCreateUser(ctx.from.id, ctx.from.first_name);
  const reply = await finalizeOnboarding(user.id);
  await send(ctx, reply);
});

bot.action("start_deep", async (ctx) => {
  await ctx.answerCbQuery();
  const user = await getOrCreateUser(ctx.from.id, ctx.from.first_name);
  const reply = await startDeep(user.id);
  await send(ctx, reply);
});

bot.action("end_deep", async (ctx) => {
  await ctx.answerCbQuery();
  const user = await getOrCreateUser(ctx.from.id, ctx.from.first_name);
  const reply = await endDeep(user.id);
  await send(ctx, reply);
});

// Клик върху динамична опция → третираме стойността като съобщение.
bot.action(/^opt:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const value = ctx.match[1];
  const user = await getOrCreateUser(ctx.from.id, ctx.from.first_name);
  await ctx.sendChatAction("typing");
  const reply = await handleUserMessage(user.id, value, {
    onboardingStage: user.onboardingStage,
    mode: user.mode,
  });
  await send(ctx, reply);
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
  await send(ctx, reply);
});
