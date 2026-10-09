// Коучинг ядро — без Telegram/Next зависимости. Ползва се и от Telegram бота,
// и от уеб API-то. Връща текст + UI-действия (опции/предложение за сесия) +
// идентификатор на сесия; извикващият решава как да ги покаже.

import { complete, computeCost, runConversation, type Turn } from "../llm";
import type { ChatMsg } from "../openai";
import { buildContext } from "../prompts";
import { getSettings } from "./settings";
import { assessRisk, crisisReply, withSafety } from "./safety";
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
  getCheckInsSince,
  getHabits,
  getInsights,
  getProfile,
  getUserById,
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
import { defaultBody } from "../notifications/content";
import { syncUserReminders } from "../notifications/sync";
import { localParts } from "../notifications/time";

export type CoachStage = "orientation" | "onboarding" | "deep" | "short" | "chat";
export type SessionKind = "deep" | "short";

export type CoachReply = {
  text: string;
  stage: CoachStage;
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

function parseJson<T>(raw: string): T {
  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  return JSON.parse(cleaned) as T;
}

// Построява системния промпт + контекстен блок от паметта.
// Неизменяемият блок за безопасност винаги е най-отпред.
async function buildSystemForUser(userId: number, base: string): Promise<string> {
  const [profile, habits, insights, reminders] = await Promise.all([
    getProfile(userId),
    getHabits(userId),
    getInsights(userId),
    listReminders(userId),
  ]);
  const ctx = buildContext(profile, habits, insights, reminders);
  return withSafety(ctx ? `${base}\n\n${ctx}` : base);
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

function sessionKindForMode(mode: string): SessionKind | null {
  return mode === "deep" || mode === "short" ? mode : null;
}

// ---- Публични операции ----

// Първи контакт: ориентация (роля + ползи + опции), не разпит.
export async function startOrientation(userId: number): Promise<CoachReply> {
  const settings = await getSettings();
  await setStage(userId, "oriented");
  await setMode(userId, "idle");
  const { text, ui } = await generateWithTools({
    userId,
    system: withSafety(settings.prompts.orientation),
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

// Започва кратка сесия (5-10 минути, една тема, една стъпка). Ползва бързия модел.
export async function startShort(
  userId: number,
  topic = ""
): Promise<CoachReply> {
  const settings = await getSettings();
  await setMode(userId, "short");
  const session = await createSession(userId, "short", topic);
  await saveMessage(
    userId,
    "user",
    topic
      ? `[Потребителят започна кратка сесия по тема: ${topic}]`
      : "[Потребителят започна кратка сесия]",
    "short",
    { sessionId: session.id }
  );
  const system = await buildSystemForUser(userId, settings.prompts.shortSession);
  const { text, ui } = await generateWithTools({
    userId,
    system,
    history: await sessionMessages(session.id),
    modelId: settings.models.fast,
    temperature: settings.temperatures.fast,
    kind: "short",
    sessionId: session.id,
  });
  return {
    text,
    stage: "short",
    sessionId: session.id,
    options: ui.options,
    offer: ui.offer,
  };
}

// Кратък check-in за навиците (по инициатива на човека или от известие).
export async function startCheckin(userId: number): Promise<CoachReply> {
  const settings = await getSettings();
  const [user, habits] = await Promise.all([getUserById(userId), getHabits(userId)]);
  const tz = user?.timezone || "Europe/Sofia";
  const today = localParts(tz).date;
  const recent = await getCheckInsSince(userId, new Date(Date.now() - 36 * 60 * 60 * 1000));
  const reported = recent
    .filter((c) => localParts(tz, new Date(c.createdAt)).date === today)
    .map((c) => {
      const name = habits.find((h) => h.id === c.habitId)?.name ?? "общо";
      return `${name}: ${c.status}`;
    });

  await saveMessage(userId, "user", "[Потребителят започна check-in]", "chat", {
    sessionId: null,
  });
  let system = await buildSystemForUser(userId, settings.prompts.checkin);
  if (reported.length) {
    system += `\n\nВЕЧЕ ОТЧЕТЕНО ДНЕС (не питай пак): ${reported.join("; ")}.`;
  }
  const { text, ui } = await generateWithTools({
    userId,
    system,
    history: await recentMessages(userId, 6),
    modelId: settings.models.fast,
    temperature: settings.temperatures.checkin,
    kind: "chat",
    sessionId: null,
  });
  return { text, stage: "chat", options: ui.options, offer: ui.offer };
}

// Прекратява сесия (дълбока или кратка): извлича прозрение, заглавие и резюме.
export async function endSession(
  userId: number,
  kind: SessionKind
): Promise<CoachReply> {
  const settings = await getSettings();
  await setMode(userId, "idle");
  const defaultTitle = kind === "short" ? "Кратка сесия" : "Дълбока сесия";
  const session = await getActiveSession(userId, kind);
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
    const data = parseJson<{
      title?: string;
      summary?: string;
      insight?: string;
      focus?: string;
    }>(raw);
    if (session) {
      await completeSession(session.id, {
        title: data.title || defaultTitle,
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
    if (session) await completeSession(session.id, { title: defaultTitle });
    return { text: "Сесията приключи. Връщам се в нормален режим.", stage: "chat" };
  }
}

// Съвместимост със съществуващите извиквания.
export function endDeep(userId: number): Promise<CoachReply> {
  return endSession(userId, "deep");
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
    data = parseJson<ExtractedProfile>(raw);
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
  if (data.vision) lines.push(`Визия: ${data.vision}`);
  if (data.beliefsNew) lines.push(`Нови вярвания: ${data.beliefsNew}`);
  if (data.goals) lines.push(`Цели: ${data.goals}`);
  if (data.habits?.length) {
    lines.push(
      "\nНавици, които градим:\n" +
        data.habits
          .filter((h) => h.kind !== "limiting")
          .map(
            (h, i) =>
              `${i + 1}. ${h.name}${h.identityLink ? ` -> ${h.identityLink}` : ""}`
          )
          .join("\n")
    );
  }
  lines.push(
    "\nНапомнянията са в Настройки — можеш да промениш часовете и да включиш известията на телефона си. Когато усетиш съпротива или искаш да разнищим нещо — кажи и започваме кратка или дълбока сесия. Да започваме."
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
  const sessionKind = sessionKindForMode(user.mode);
  const inOnboarding = !sessionKind && user.onboardingStage !== "done";

  // Сесия (дълбока/кратка) е активна.
  const session = sessionKind ? await getActiveSession(userId, sessionKind) : undefined;
  const sessionId = session?.id ?? null;
  const kind = sessionKind ?? (inOnboarding ? "onboarding" : "chat");
  const stage: CoachStage = sessionKind ?? (inOnboarding ? "onboarding" : "chat");

  await saveMessage(userId, "user", text, kind, { sessionId });

  // Кризисни сигнали се обработват детерминирано, без да се вика моделът.
  const risk = assessRisk(text);
  if (risk.level === "crisis") {
    const reply = crisisReply(risk.reason);
    await saveMessage(userId, "assistant", reply, kind, { sessionId, model: "safety" });
    return { text: reply, stage, sessionId };
  }

  if (sessionKind) {
    const deep = sessionKind === "deep";
    const system = await buildSystemForUser(
      userId,
      deep ? settings.prompts.deepSession : settings.prompts.shortSession
    );
    const history = sessionId
      ? await sessionMessages(sessionId)
      : await recentMessages(userId);
    const { text: reply, ui } = await generateWithTools({
      userId,
      system,
      history,
      modelId: deep ? settings.models.deep : settings.models.fast,
      temperature: deep ? settings.temperatures.deep : settings.temperatures.fast,
      kind,
      sessionId,
    });
    return { text: reply, stage, sessionId, options: ui.options, offer: ui.offer };
  }

  // Нормален поток (ежедневен чат). Преди 'done' ползваме прогресивно опознаване.
  const base = inOnboarding ? settings.prompts.onboarding : settings.prompts.dailyChat;
  const system = await buildSystemForUser(userId, base);
  const { text: reply, ui } = await generateWithTools({
    userId,
    system,
    history: await recentMessages(userId),
    modelId: inOnboarding ? settings.models.deep : settings.models.fast,
    temperature: inOnboarding ? settings.temperatures.deep : settings.temperatures.fast,
    kind,
    sessionId: null,
  });
  return { text: reply, stage, options: ui.options, offer: ui.offer };
}

// Предлага текст за известие (чернова за уеб формата). Не ползва памет на потребителя
// и бързия модел — евтино и без чувствителни данни. При грешка връща шаблона.
export async function draftReminderMessage(
  time: string,
  reason: string
): Promise<string> {
  const fallback = defaultBody(reason, time);
  try {
    const settings = await getSettings();
    const { text } = await complete({
      model: settings.models.fast,
      system:
        "Напиши текст за push известие на български, на 'ти'. До 140 знака, топло и конкретно, " +
        "без емоджита, без кавички, без въпросителни повече от един. Върни САМО текста на известието.",
      user: `Час: ${time}. Тема: ${reason.trim() || "общо напомняне от коуча"}.`,
      temperature: 0.8,
    });
    const clean = text.replace(/^["„“\s]+|["“”\s]+$/g, "").replace(/\s+/g, " ").trim();
    return clean ? clean.slice(0, 240) : fallback;
  } catch {
    return fallback;
  }
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
    target: "checkin",
    promptHint:
      "Как мина денят спрямо навиците, за какво е благодарен, какво да подобри утре.",
  });
  // Графиците се създават само ако вече има регистрирано устройство.
  await syncUserReminders(userId);
}
