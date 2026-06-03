import "dotenv/config";
import { Telegraf, Markup } from "telegraf";
import { chat, MODEL_FAST, MODEL_DEEP, type ChatMsg } from "./openai.js";
import {
  ONBOARDING,
  DAILY_CHAT,
  DEEP_SESSION,
  EXTRACT_PROFILE,
  buildContext,
} from "./prompts.js";
import {
  getOrCreateUser,
  setStage,
  setMode,
  saveMessage,
  recentMessages,
  getProfile,
  getHabits,
  getInsights,
  addInsight,
  saveExtractedProfile,
  type ExtractedProfile,
} from "./memory.js";

if (!process.env.TELEGRAM_BOT_TOKEN) {
  throw new Error("Липсва TELEGRAM_BOT_TOKEN в .env");
}

export const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Построява системния промпт + контекст от паметта за "завършените" потребители.
async function systemWithContext(userId: number, base: string): Promise<string> {
  const [profile, habits, insights] = await Promise.all([
    getProfile(userId),
    getHabits(userId),
    getInsights(userId),
  ]);
  const ctx = buildContext(profile, habits, insights);
  return ctx ? `${base}\n\n${ctx}` : base;
}

// Генерира отговор от модела на база историята и системния промпт, и го запазва.
async function respond(
  userId: number,
  system: string,
  kind: string,
  model: string
): Promise<string> {
  const history = await recentMessages(userId);
  const messages: ChatMsg[] = [{ role: "system", content: system }, ...history];
  const reply = await chat(messages, { model, temperature: 0.7 });
  await saveMessage(userId, "assistant", reply, kind);
  return reply;
}

const finalizeButton = Markup.inlineKeyboard([
  Markup.button.callback("✅ Готови сме — обобщи и постави цели", "finalize"),
]);

const deepEndButton = Markup.inlineKeyboard([
  Markup.button.callback("🏁 Приключи дълбоката сесия", "end_deep"),
]);

const offerDeepButton = Markup.inlineKeyboard([
  Markup.button.callback("🧠 Да, нека влезем дълбоко", "start_deep"),
]);

bot.start(async (ctx) => {
  const user = await getOrCreateUser(ctx.from.id, ctx.from.first_name);
  if (user.onboardingStage === "done") {
    await ctx.reply(
      `Здравей пак, ${user.name || ""}! Тук съм. Разкажи как си, или ползвай /deep за дълбок разговор.`
    );
    return;
  }
  await setStage(user.id, "interview");
  await setMode(user.id, "idle");
  const reply = await respond(user.id, ONBOARDING, "onboarding", MODEL_DEEP);
  await ctx.reply(reply, finalizeButton);
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
      "/reset — започни опознаването наново",
    ].join("\n")
  );
});

bot.command("deep", async (ctx) => {
  const user = await getOrCreateUser(ctx.from.id, ctx.from.first_name);
  if (user.onboardingStage !== "done") {
    await ctx.reply("Нека първо завършим опознаването 🙂");
    return;
  }
  await setMode(user.id, "deep");
  const system = await systemWithContext(user.id, DEEP_SESSION);
  await saveMessage(
    user.id,
    "user",
    "[Потребителят започна дълбока сесия]",
    "deep"
  );
  const reply = await respond(user.id, system, "deep", MODEL_DEEP);
  await ctx.reply(reply, deepEndButton);
});

bot.command("end", async (ctx) => {
  const user = await getOrCreateUser(ctx.from.id, ctx.from.first_name);
  await endDeepSession(ctx, user.id);
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
            `${i + 1}. ${h.name} (${h.cadence})${h.identityLink ? `\n   → ${h.identityLink}` : ""}`
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
  await ctx.reply(on ? "Напомнянията са ВКЛЮЧЕНИ ✅" : "Напомнянията са ИЗКЛЮЧЕНИ 🔕");
});

bot.command("reset", async (ctx) => {
  const user = await getOrCreateUser(ctx.from.id, ctx.from.first_name);
  await setStage(user.id, "interview");
  await setMode(user.id, "idle");
  const reply = await respond(user.id, ONBOARDING, "onboarding", MODEL_DEEP);
  await ctx.reply(reply, finalizeButton);
});

bot.action("finalize", async (ctx) => {
  await ctx.answerCbQuery("Обобщавам...");
  const user = await getOrCreateUser(ctx.from.id, ctx.from.first_name);
  await finalizeOnboarding(ctx, user.id);
});

bot.action("start_deep", async (ctx) => {
  await ctx.answerCbQuery();
  const user = await getOrCreateUser(ctx.from.id, ctx.from.first_name);
  await setMode(user.id, "deep");
  const system = await systemWithContext(user.id, DEEP_SESSION);
  await saveMessage(user.id, "user", "[Потребителят прие дълбока сесия]", "deep");
  const reply = await respond(user.id, system, "deep", MODEL_DEEP);
  await ctx.reply(reply, deepEndButton);
});

bot.action("end_deep", async (ctx) => {
  await ctx.answerCbQuery();
  const user = await getOrCreateUser(ctx.from.id, ctx.from.first_name);
  await endDeepSession(ctx, user.id);
});

bot.on("text", async (ctx) => {
  const text = ctx.message.text;
  if (text.startsWith("/")) return;
  const user = await getOrCreateUser(ctx.from.id, ctx.from.first_name);
  await ctx.sendChatAction("typing");

  if (user.onboardingStage !== "done") {
    await saveMessage(user.id, "user", text, "onboarding");
    const reply = await respond(user.id, ONBOARDING, "onboarding", MODEL_DEEP);
    await ctx.reply(reply, finalizeButton);
    return;
  }

  if (user.mode === "deep") {
    await saveMessage(user.id, "user", text, "deep");
    const system = await systemWithContext(user.id, DEEP_SESSION);
    const reply = await respond(user.id, system, "deep", MODEL_DEEP);
    await ctx.reply(reply, deepEndButton);
    return;
  }

  await saveMessage(user.id, "user", text, "chat");
  const system = await systemWithContext(user.id, DAILY_CHAT);
  const reply = await respond(user.id, system, "chat", MODEL_FAST);
  if (suggestsDeep(reply)) {
    await ctx.reply(reply, offerDeepButton);
  } else {
    await ctx.reply(reply);
  }
});

// Дали отговорът предлага дълбока сесия (за да покажем бутон).
function suggestsDeep(reply: string): boolean {
  const r = reply.toLowerCase();
  return (
    r.includes("дълбок") &&
    (r.includes("сесия") || r.includes("разнищ") || r.includes("разговор"))
  );
}

async function endDeepSession(ctx: any, userId: number) {
  await setMode(userId, "idle");
  const history = await recentMessages(userId, 30);
  if (history.length) {
    try {
      const insight = await chat(
        [
          {
            role: "system",
            content:
              "От разговора по-долу извлечи едно кратко (1-2 изречения) ключово прозрение/преформулирано вярване на български. Върни само прозрението, без увод.",
          },
          {
            role: "user",
            content: history.map((m) => `${m.role}: ${m.content}`).join("\n"),
          },
        ],
        { model: MODEL_FAST, temperature: 0.3 }
      );
      if (insight) await addInsight(userId, insight);
      await ctx.reply(
        `Записах прозрението от тази сесия 🧠:\n"${insight}"\n\nЩе го помня и ще го свържа следващия път.`
      );
    } catch {
      await ctx.reply("Сесията приключи. Връщам се в нормален режим.");
    }
  } else {
    await ctx.reply("Сесията приключи. Връщам се в нормален режим.");
  }
}

async function finalizeOnboarding(ctx: any, userId: number) {
  const history = await recentMessages(userId, 40);
  const transcript = history.map((m) => `${m.role}: ${m.content}`).join("\n");
  let data: ExtractedProfile = {};
  try {
    const raw = await chat(
      [
        { role: "system", content: EXTRACT_PROFILE },
        { role: "user", content: transcript },
      ],
      { model: MODEL_DEEP, temperature: 0.2 }
    );
    const cleaned = raw
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    data = JSON.parse(cleaned);
  } catch {
    await ctx.reply(
      "Не успях да структурирам напълно. Нека довършим разговора още малко и пробвай отново."
    );
    return;
  }

  await saveExtractedProfile(userId, data);
  await setStage(userId, "done");
  await setMode(userId, "idle");

  const lines: string[] = ["Ето какво разбрах и целите, които поставяме заедно:\n"];
  if (data.identityTarget)
    lines.push(`🎯 Нова идентичност: ${data.identityTarget}`);
  if (data.beliefsNew) lines.push(`💡 Нови вярвания: ${data.beliefsNew}`);
  if (data.goals) lines.push(`🧭 Цели: ${data.goals}`);
  if (data.habits?.length) {
    lines.push(
      "\n🔁 Навици, които градим:\n" +
        data.habits
          .map((h, i) => `${i + 1}. ${h.name}${h.identityLink ? ` → ${h.identityLink}` : ""}`)
          .join("\n")
    );
  }
  lines.push(
    "\nОт сега ще ти пиша сутрин за фокус и вечер за рефлексия. Когато усетиш съпротива или искаш да разнищим нещо — /deep. Да започваме 💪"
  );
  await ctx.reply(lines.join("\n"));
}
