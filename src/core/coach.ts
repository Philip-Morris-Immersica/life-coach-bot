// Коучинг ядро — без Telegram/Next зависимости. Ползва се и от Telegram бота,
// и от уеб API-то. Връща текст + UI-действия (опции/предложение за сесия) +
// идентификатор на сесия; извикващият решава как да ги покаже.

import { complete, computeCost, runConversation, type Turn } from "../llm";
import type { ChatMsg } from "../openai";
import { buildContext } from "../prompts";
import { getSettings } from "./settings";
import {
  COACH_TOOLS,
  makeToolExecutor,
  type CoachUiActions,
} from "./tools";
import {
  addInsight,
  completeSession,
  createSession,
  getActiveSession,
  getHabits,
  getInsights,
  getProfile,
  listReminders,
  recentMessages,
  saveExtractedProfile,
  saveMessage,
  sessionMessages,
  setMode,
  setStage,
  upsertReminder,
  type ExtractedProfile,
} from "../memory";

export type CoachReply = {
  text: string;
  stage: "orientation" | "onboarding" | "deep" | "chat";
  sessionId?: string | null;
  // Динамични опции (бутони/чипове) — само при ориентация/предлагане на посока.
  options?: CoachUiActions["options"];
  // Предложение за сесия с линк (Web бутон / Telegram линк).
  offer?: CoachUiActions["offer"];
};

// Превръща {role,content}[] от паметта в Turn[] за LLM слоя.
function toTurns(history: ChatMsg[]): Turn[] {
  return history.map((m) =>
    m.role === "assistant"
      ? { role: "assistant", text: m.content }
      : { role: "user", text: m.content }
  );
}

// Построява системния промпт + контекстен блок от паметта.
async function buildSystemForUser(userId: number, base: string): Promise<string> {
  const [profile, habits, insights, reminders] = await Promise.all([
    getProfile(userId),
    getHabits(userId),
    getInsights(userId),
    listReminders(userId),
  ]);
  const ctx = buildContext(profile, habits, insights, reminders);
  return ctx ? `${base}\n\n${ctx}` : base;
}

// Сърцето: пуска разговора с инструменти, записва отговора с телеметрия,
// и връща текста + събраните UI-действия.
async function generateWithTools(opts: {
  userId: number;
  system: string;
  history: ChatMsg[];
  modelId: string;
  temperature: number;
  kind: string;
  sessionId?: string | null;
}): Promise<{ text: string; ui: CoachUiActions }> {
  const ui: CoachUiActions = {};
  const execute = makeToolExecutor(opts.userId, ui);
  const res = await runConversation({
    model: opts.modelId,
    system: opts.system,
    history: toTurns(opts.history),
    tools: COACH_TOOLS,
    execute,
    temperature: opts.temperature,
  });
  const costUsd = computeCost(
    res.model,
    res.usage.promptTokens,
    res.usage.completionTokens
  );
  const text = res.text || "…";
  await saveMessage(opts.userId, "assistant", text, opts.kind, {
    sessionId: opts.sessionId ?? null,
    model: res.model,
    promptTokens: res.usage.promptTokens,
    completionTokens: res.usage.completionTokens,
    costUsd,
  });
  return { text, ui };
}

// ---- Публични операции ----

// Първи контакт: ориентация (роля + ползи + опции), не разпит.
export async function startOrientation(userId: number): Promise<CoachReply> {
  const settings = await getSettings();
  await setStage(userId, "oriented");
  await setMode(userId, "idle");
  const { text, ui } = await generateWithTools({
    userId,
    system: settings.prompts.orientation,
    history: [],
    modelId: settings.models.deep,
    temperature: settings.temperatures.deep,
    kind: "onboarding",
  });
  return { text, stage: "orientation", options: ui.options, offer: ui.offer };
}

// Започва дълбока сесия — създава отделна сесия и влиза в deep режим.
export async function startDeep(
  userId: number,
  topic = ""
): Promise<CoachReply> {
  const settings = await getSettings();
  await setMode(userId, "deep");
  const session = await createSession(userId, "deep", topic);
  await saveMessage(
    userId,
    "user",
    topic
      ? `[Потребителят започна дълбока сесия по тема: ${topic}]`
      : "[Потребителят започна дълбока сесия]",
    "deep",
    { sessionId: session.id }
  );
  const system = await buildSystemForUser(userId, settings.prompts.deepSession);
  const { text, ui } = await generateWithTools({
    userId,
    system,
    history: await sessionMessages(session.id),
    modelId: settings.models.deep,
    temperature: settings.temperatures.deep,
    kind: "deep",
    sessionId: session.id,
  });
  return {
    text,
    stage: "deep",
    sessionId: session.id,
    options: ui.options,
    offer: ui.offer,
  };
}

// Прекратява дълбоката сесия: извлича прозрение, заглавие и резюме.
export async function endDeep(userId: number): Promise<CoachReply> {
  const settings = await getSettings();
  await setMode(userId, "idle");
  const session = await getActiveSession(userId, "deep");
  const history = session
    ? await sessionMessages(session.id, 60)
    : await recentMessages(userId, 30);
  if (!history.length) {
    if (session) await completeSession(session.id, {});
    return { text: "Сесията приключи. Връщам се в нормален режим.", stage: "chat" };
  }
  const transcript = history.map((m) => `${m.role}: ${m.content}`).join("\n");
  try {
    const { text: raw } = await complete({
      model: settings.models.fast,
      system:
        "Анализирай коучинг сесията по-долу. Върни САМО валиден JSON: " +
        '{"title":"кратко заглавие (до 6 думи)","summary":"2-3 изречения резюме","insight":"едно ключово прозрение/преформулирано вярване","focus":"habits|goals|beliefs|identity"}',
      user: transcript,
      temperature: 0.3,
    });
    const cleaned = raw
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    const data = JSON.parse(cleaned) as {
      title?: string;
      summary?: string;
      insight?: string;
      focus?: string;
    };
    if (session) {
      await completeSession(session.id, {
        title: data.title || "Дълбока сесия",
        summary: data.summary || "",
        focus: data.focus || "",
      });
    }
    if (data.insight) await addInsight(userId, data.insight);
    return {
      text: data.insight
        ? `Записах прозрението от тази сесия:\n"${data.insight}"\n\nЩе го помня и ще го свържа следващия път.`
        : "Сесията приключи. Записах резюмето ѝ.",
      stage: "chat",
    };
  } catch {
    if (session) await completeSession(session.id, { title: "Дълбока сесия" });
    return { text: "Сесията приключи. Връщам се в нормален режим.", stage: "chat" };
  }
}

// Финализира опознаването: извлича структуриран профил, поставя цели и
// seed-ва базови напомняния, ако още няма.
export async function finalizeOnboarding(userId: number): Promise<CoachReply> {
  const settings = await getSettings();
  const history = await recentMessages(userId, 40);
  const transcript = history.map((m) => `${m.role}: ${m.content}`).join("\n");

  let data: ExtractedProfile = {};
  try {
    const { text: raw } = await complete({
      model: settings.models.deep,
      system: settings.prompts.extractProfile,
      user: transcript,
      temperature: 0.2,
    });
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
  await seedDefaultReminders(userId);

  const lines: string[] = ["Ето какво разбрах и целите, които поставяме заедно:\n"];
  if (data.identityTarget) lines.push(`Нова идентичност: ${data.identityTarget}`);
  if ((data as any).vision) lines.push(`Визия: ${(data as any).vision}`);
  if (data.beliefsNew) lines.push(`Нови вярвания: ${data.beliefsNew}`);
  if (data.goals) lines.push(`Цели: ${data.goals}`);
  if (data.habits?.length) {
    lines.push(
      "\nНавици, които градим:\n" +
        data.habits
          .filter((h) => (h as any).kind !== "limiting")
          .map(
            (h, i) =>
              `${i + 1}. ${h.name}${h.identityLink ? ` -> ${h.identityLink}` : ""}`
          )
          .join("\n")
    );
  }
  lines.push(
    "\nОт сега ще ти пиша по уговорения ритъм. Когато усетиш съпротива или искаш да разнищим нещо — кажи и започваме дълбока сесия. Да започваме."
  );
  return { text: lines.join("\n"), stage: "chat" };
}

// Главна входна точка за съобщение от потребителя.
export async function handleUserMessage(
  userId: number,
  text: string,
  user: { onboardingStage: string; mode: string }
): Promise<CoachReply> {
  const settings = await getSettings();

  // Тече дълбока сесия.
  if (user.mode === "deep") {
    const session = await getActiveSession(userId, "deep");
    const sessionId = session?.id ?? null;
    await saveMessage(userId, "user", text, "deep", { sessionId });
    const system = await buildSystemForUser(userId, settings.prompts.deepSession);
    const history = sessionId
      ? await sessionMessages(sessionId)
      : await recentMessages(userId);
    const { text: reply, ui } = await generateWithTools({
      userId,
      system,
      history,
      modelId: settings.models.deep,
      temperature: settings.temperatures.deep,
      kind: "deep",
      sessionId,
    });
    return {
      text: reply,
      stage: "deep",
      sessionId,
      options: ui.options,
      offer: ui.offer,
    };
  }

  // Нормален поток (ежедневен чат). Преди 'done' ползваме прогресивно опознаване.
  const inOnboarding = user.onboardingStage !== "done";
  const kind = inOnboarding ? "onboarding" : "chat";
  await saveMessage(userId, "user", text, kind, { sessionId: null });
  const base = inOnboarding
    ? settings.prompts.onboarding
    : settings.prompts.dailyChat;
  const system = await buildSystemForUser(userId, base);
  const { text: reply, ui } = await generateWithTools({
    userId,
    system,
    history: await recentMessages(userId),
    modelId: inOnboarding ? settings.models.deep : settings.models.fast,
    temperature: inOnboarding
      ? settings.temperatures.deep
      : settings.temperatures.fast,
    kind,
    sessionId: null,
  });
  return {
    text: reply,
    stage: inOnboarding ? "onboarding" : "chat",
    options: ui.options,
    offer: ui.offer,
  };
}

// Генерира текст за персонално напомняне (без вход от потребителя).
export async function generateReminderMessage(
  userId: number,
  reminder: { reason?: string; promptHint?: string }
): Promise<{ text: string; model: string; promptTokens: number; completionTokens: number; costUsd: number }> {
  const settings = await getSettings();
  const [system, history] = await Promise.all([
    buildSystemForUser(userId, settings.prompts.morning),
    recentMessages(userId, 6),
  ]);
  const hint =
    `\n\nТова е автоматично напомняне` +
    (reminder.reason ? ` за: ${reminder.reason}.` : ".") +
    (reminder.promptHint ? ` Насока: ${reminder.promptHint}` : "") +
    `\nНапиши кратко (2-3 изречения), топло, по темата. Завърши с един въпрос.`;
  const turns: Turn[] = toTurns(history);
  const res = await runConversation({
    model: settings.models.fast,
    system: system + hint,
    history: turns.length ? turns : [{ role: "user", text: "(ново напомняне)" }],
    temperature: settings.temperatures.checkin,
    maxRounds: 1,
  });
  return {
    text: res.text,
    model: res.model,
    promptTokens: res.usage.promptTokens,
    completionTokens: res.usage.completionTokens,
    costUsd: computeCost(res.model, res.usage.promptTokens, res.usage.completionTokens),
  };
}

// Seed на разумни базови напомняния, ако потребителят още няма.
async function seedDefaultReminders(userId: number) {
  const existing = await listReminders(userId, false);
  if (existing.length) return;
  await upsertReminder(userId, {
    time: "08:00",
    days: "*",
    reason: "сутрешен фокус",
    promptHint: "Фокус върху идентичността и навиците за деня.",
  });
  await upsertReminder(userId, {
    time: "21:00",
    days: "*",
    reason: "вечерен преглед",
    promptHint:
      "Как мина денят спрямо навиците, за какво е благодарен, какво да подобри утре.",
  });
}
