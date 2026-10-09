import "dotenv/config";
import { Telegraf, Markup } from "telegraf";
import {
  endSession,
  finalizeOnboarding,
  handleUserMessage,
  startCheckin,
  startDeep,
  startOrientation,
  startShort,
  type CoachReply,
} from "./core/coach";
import { checkDailyLimit, LIMIT_MESSAGE, MAX_MESSAGE_CHARS } from "./core/limits";
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

// Allowlist: ако TELEGRAM_ALLOWED_IDS е зададен, само тези потребители могат
// да ползват бота (защита на разхода за LLM).
const allowedIds = (process.env.TELEGRAM_ALLOWED_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
bot.use(async (ctx, next) => {
  if (allowedIds.length && !allowedIds.includes(String(ctx.from?.id ?? ""))) {
    if (ctx.chat) {
      await ctx.reply("Този бот е в затворено тестване.").catch(() => {});
    }
    return;
  }
  return next();
});

// Безопасно съобщение при грешка (без вътрешни детайли).
bot.catch(async (err, ctx) => {
  console.error("Telegram handler error:", err);
  await ctx.reply("Нещо се обърка. Опитай пак след малко.").catch(() => {});
});

// Дневен лимит на съобщения (контрол на разхода). true = блокирано.
async function overLimit(ctx: any, userId: number): Promise<boolean> {
  const status = await checkDailyLimit(userId);
  if (status.ok) return false;
  await ctx.reply(LIMIT_MESSAGE);
  return true;
}

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
    rows.push([
      Markup.button.callback(
        `Започни: ${label}`,
        reply.offer.type === "short" ? "start_short" : "start_deep"
      ),
    ]);
  }
  if (reply.stage === "onboarding") {
    rows.push([
      Markup.button.callback("Готови сме — обобщи и постави цели", "finalize"),
    ]);
  }
  if (reply.stage === "deep") {
    rows.push([Markup.button.callback("Приключи дълбоката сесия", "end_deep")]);
  }
  if (reply.stage === "short") {
    rows.push([Markup.button.callback("Приключи кратката сесия", "end_short")]);
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
      `Здравей пак, ${user.name || ""}! Тук съм. Разкажи как си, или ползвай /short за кратка сесия или /deep за дълбок разговор.`
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
      "/short — кратка сесия (5-10 минути)",
      "/deep — започни дълбок коучинг разговор",
      "/checkin — кратък check-in за навиците",
      "/end — приключи текущата сесия",
      "/habits — виж активните си навици",
      "/reminders — виж напомнянията си",
      "/link — свържи Telegram с уеб профила си",
      "/reset — започни наново",
    ].join("\n")
  );
});

bot.command("deep", async (ctx) => {
  const user = await getOrCreateUser(ctx.from.id, ctx.from.first_name);
  if (await overLimit(ctx, user.id)) return;
  const reply = await startDeep(user.id);
  await send(ctx, reply);
});

bot.command("short", async (ctx) => {
  const user = await getOrCreateUser(ctx.from.id, ctx.from.first_name);
  if (await overLimit(ctx, user.id)) return;
  const reply = await startShort(user.id);
  await send(ctx, reply);
});

bot.command("checkin", async (ctx) => {
  const user = await getOrCreateUser(ctx.from.id, ctx.from.first_name);
  if (user.onboardingStage !== "done") {
    await ctx.reply("Първо да се опознаем малко — пиши ми свободно или започни с /start.");
    return;
  }
  if (await overLimit(ctx, user.id)) return;
  const reply = await startCheckin(user.id);
  await send(ctx, reply);
});

bot.command("end", async (ctx) => {
  const user = await getOrCreateUser(ctx.from.id, ctx.from.first_name);
  const kind = user.mode === "short" ? "short" : "deep";
  const reply = await endSession(user.id, kind);
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
  if (await overLimit(ctx, user.id)) return;
  const reply = await finalizeOnboarding(user.id);
  await send(ctx, reply);
});

bot.action("start_deep", async (ctx) => {
  await ctx.answerCbQuery();
  const user = await getOrCreateUser(ctx.from.id, ctx.from.first_name);
  if (await overLimit(ctx, user.id)) return;
  const reply = await startDeep(user.id);
  await send(ctx, reply);
});

bot.action("start_short", async (ctx) => {
  await ctx.answerCbQuery();
  const user = await getOrCreateUser(ctx.from.id, ctx.from.first_name);
  if (await overLimit(ctx, user.id)) return;
  const reply = await startShort(user.id);
  await send(ctx, reply);
});

bot.action("end_deep", async (ctx) => {
  await ctx.answerCbQuery();
  const user = await getOrCreateUser(ctx.from.id, ctx.from.first_name);
  const reply = await endSession(user.id, "deep");
  await send(ctx, reply);
});

bot.action("end_short", async (ctx) => {
  await ctx.answerCbQuery();
  const user = await getOrCreateUser(ctx.from.id, ctx.from.first_name);
  const reply = await endSession(user.id, "short");
  await send(ctx, reply);
});

// Клик върху динамична опция → третираме стойността като съобщение.
bot.action(/^opt:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const value = ctx.match[1];
  const user = await getOrCreateUser(ctx.from.id, ctx.from.first_name);
  if (await overLimit(ctx, user.id)) return;
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
  if (text.length > MAX_MESSAGE_CHARS) {
    await ctx.reply(`Съобщението е твърде дълго (макс. ${MAX_MESSAGE_CHARS} знака).`);
    return;
  }
  const user = await getOrCreateUser(ctx.from.id, ctx.from.first_name);
  if (await overLimit(ctx, user.id)) return;
  await ctx.sendChatAction("typing");
  const reply = await handleUserMessage(user.id, text, {
    onboardingStage: user.onboardingStage,
    mode: user.mode,
  });
  await send(ctx, reply);
});
