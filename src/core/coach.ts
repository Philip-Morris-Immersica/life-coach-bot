// Чисто коучинг ядро — нямa Telegram/Express зависимости, използва се както
// от Telegram бота, така и от уеб API-то. Връща данни (текст + флагове), а
// извикващият решава как да ги покаже на потребителя.

import { chat, type ChatMsg } from "../openai";
import { buildContext } from "../prompts";
import { getSettings } from "./settings";
import {
  addInsight,
  getHabits,
  getInsights,
  getProfile,
  recentMessages,
  saveExtractedProfile,
  saveMessage,
  setMode,
  setStage,
  type ExtractedProfile,
} from "../memory";

export type CoachReply = {
  text: string;
  // Етапът на потребителя след тази стъпка — позволява на клиента да реши
  // дали да покаже бутон "Готови сме за обобщение" / "Приключи дълбоката сесия".
  stage: "onboarding" | "deep" | "chat";
  // Ако последният отговор намеква, че би било добре да влезем в дълбока сесия.
  offerDeep?: boolean;
};

// Построява системния промпт + контекстен блок от паметта.
async function buildSystemForUser(userId: number, base: string): Promise<string> {
  const [profile, habits, insights] = await Promise.all([
    getProfile(userId),
    getHabits(userId),
    getInsights(userId),
  ]);
  const ctx = buildContext(profile, habits, insights);
  return ctx ? `${base}\n\n${ctx}` : base;
}

// Извиква модела с пълна история + системен промпт, и записва отговора.
async function generateAndSave(
  userId: number,
  system: string,
  kind: string,
  model: string,
  temperature: number
): Promise<string> {
  const history = await recentMessages(userId);
  const messages: ChatMsg[] = [{ role: "system", content: system }, ...history];
  const reply = await chat(messages, { model, temperature });
  await saveMessage(userId, "assistant", reply, kind);
  return reply;
}

// Евристика: реплика, която предлага дълбока сесия (за да маркираме offerDeep).
function suggestsDeep(reply: string): boolean {
  const r = reply.toLowerCase();
  return (
    r.includes("дълбок") &&
    (r.includes("сесия") || r.includes("разнищ") || r.includes("разговор"))
  );
}

// ---- Публични операции, ползвани от всички клиенти ----

// Първоначална/рестартирана опознавателна сесия — клиентът я вика, когато
// потребителят натисне Start / Reset. Не очаква вход от потребителя.
export async function startOnboarding(userId: number): Promise<CoachReply> {
  const settings = await getSettings();
  await setStage(userId, "interview");
  await setMode(userId, "idle");
  const text = await generateAndSave(
    userId,
    settings.prompts.onboarding,
    "onboarding",
    settings.models.deep,
    settings.temperatures.deep
  );
  return { text, stage: "onboarding" };
}

// Започва дълбока сесия за вече "завършен" потребител.
export async function startDeep(userId: number): Promise<CoachReply> {
  const settings = await getSettings();
  await setMode(userId, "deep");
  const system = await buildSystemForUser(userId, settings.prompts.deepSession);
  await saveMessage(userId, "user", "[Потребителят започна дълбока сесия]", "deep");
  const text = await generateAndSave(
    userId,
    system,
    "deep",
    settings.models.deep,
    settings.temperatures.deep
  );
  return { text, stage: "deep" };
}

// Прекратява дълбока сесия и извлича прозрение от последните размени.
export async function endDeep(userId: number): Promise<CoachReply> {
  const settings = await getSettings();
  await setMode(userId, "idle");
  const history = await recentMessages(userId, 30);
  if (!history.length) {
    return { text: "Сесията приключи. Връщам се в нормален режим.", stage: "chat" };
  }
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
      { model: settings.models.fast, temperature: 0.3 }
    );
    if (insight) await addInsight(userId, insight);
    return {
      text: `Записах прозрението от тази сесия:\n"${insight}"\n\nЩе го помня и ще го свържа следващия път.`,
      stage: "chat",
    };
  } catch {
    return { text: "Сесията приключи. Връщам се в нормален режим.", stage: "chat" };
  }
}

// Финализира опознавателната сесия — извлича структуриран профил и поставя цели.
// Връща обобщителен текст към потребителя.
export async function finalizeOnboarding(userId: number): Promise<CoachReply> {
  const settings = await getSettings();
  const history = await recentMessages(userId, 40);
  const transcript = history.map((m) => `${m.role}: ${m.content}`).join("\n");

  let data: ExtractedProfile = {};
  try {
    const raw = await chat(
      [
        { role: "system", content: settings.prompts.extractProfile },
        { role: "user", content: transcript },
      ],
      { model: settings.models.deep, temperature: 0.2 }
    );
    const cleaned = raw
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    data = JSON.parse(cleaned);
  } catch {
    return {
      text: "Не успях да структурирам напълно. Нека довършим разговора още малко и пробвай отново.",
      stage: "onboarding",
    };
  }

  await saveExtractedProfile(userId, data);
  await setStage(userId, "done");
  await setMode(userId, "idle");

  const lines: string[] = ["Ето какво разбрах и целите, които поставяме заедно:\n"];
  if (data.identityTarget) lines.push(`Нова идентичност: ${data.identityTarget}`);
  if (data.beliefsNew) lines.push(`Нови вярвания: ${data.beliefsNew}`);
  if (data.goals) lines.push(`Цели: ${data.goals}`);
  if (data.habits?.length) {
    lines.push(
      "\nНавици, които градим:\n" +
        data.habits
          .map(
            (h, i) =>
              `${i + 1}. ${h.name}${h.identityLink ? ` -> ${h.identityLink}` : ""}`
          )
          .join("\n")
    );
  }
  lines.push(
    "\nОт сега ще ти пиша сутрин за фокус и вечер за рефлексия. Когато усетиш съпротива или искаш да разнищим нещо — стартирай дълбока сесия. Да започваме."
  );
  return { text: lines.join("\n"), stage: "chat" };
}

// Главната входна точка за съобщение от потребителя (Telegram или уеб).
// Записва входа, решава режим (onboarding / deep / chat) и връща отговор.
export async function handleUserMessage(
  userId: number,
  text: string,
  user: { onboardingStage: string; mode: string }
): Promise<CoachReply> {
  const settings = await getSettings();

  if (user.onboardingStage !== "done") {
    await saveMessage(userId, "user", text, "onboarding");
    const reply = await generateAndSave(
      userId,
      settings.prompts.onboarding,
      "onboarding",
      settings.models.deep,
      settings.temperatures.deep
    );
    return { text: reply, stage: "onboarding" };
  }

  if (user.mode === "deep") {
    await saveMessage(userId, "user", text, "deep");
    const system = await buildSystemForUser(userId, settings.prompts.deepSession);
    const reply = await generateAndSave(
      userId,
      system,
      "deep",
      settings.models.deep,
      settings.temperatures.deep
    );
    return { text: reply, stage: "deep" };
  }

  await saveMessage(userId, "user", text, "chat");
  const system = await buildSystemForUser(userId, settings.prompts.dailyChat);
  const reply = await generateAndSave(
    userId,
    system,
    "chat",
    settings.models.fast,
    settings.temperatures.fast
  );
  return { text: reply, stage: "chat", offerDeep: suggestsDeep(reply) };
}

// Помощно за scheduler-а: генерира текст за проактивен check-in (без да приема
// вход от потребителя). Връща готовия текст; клиентът решава къде да го прати.
export async function generateCheckin(
  userId: number,
  which: "morning" | "evening"
): Promise<string> {
  const settings = await getSettings();
  const [profile, habits, insights, history] = await Promise.all([
    getProfile(userId),
    getHabits(userId),
    getInsights(userId),
    recentMessages(userId, 6),
  ]);
  const ctx = buildContext(profile, habits, insights);
  const base =
    which === "morning" ? settings.prompts.morning : settings.prompts.evening;
  const messages: ChatMsg[] = [
    { role: "system", content: ctx ? `${base}\n\n${ctx}` : base },
    ...history,
  ];
  return chat(messages, {
    model: settings.models.fast,
    temperature: settings.temperatures.checkin,
  });
}
