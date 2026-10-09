import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { randomInt } from "node:crypto";
import {
  db,
  usersTable,
  profilesTable,
  habitsTable,
  sessionsTable,
  messagesTable,
  remindersTable,
  insightsTable,
  checkInsTable,
  type User,
  type Session,
  type Reminder,
  type CheckIn,
} from "./db/index";
import { isValidTimezone } from "./notifications/time";
import type { ChatMsg } from "./openai";

// Гарантира, че за даден потребител има ред в lc_profiles (празен е ОК).
async function ensureProfileRow(userId: number) {
  await db
    .insert(profilesTable)
    .values({ userId })
    .onConflictDoNothing({ target: profilesTable.userId });
}

export async function getOrCreateUser(
  telegramId: number,
  name?: string
): Promise<User> {
  const existing = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.telegramId, telegramId))
    .limit(1);
  if (existing[0]) {
    if (name && existing[0].name !== name) {
      await db
        .update(usersTable)
        .set({ name, lastActiveAt: new Date() })
        .where(eq(usersTable.id, existing[0].id));
    } else {
      await db
        .update(usersTable)
        .set({ lastActiveAt: new Date() })
        .where(eq(usersTable.id, existing[0].id));
    }
    return existing[0];
  }
  const inserted = await db
    .insert(usersTable)
    .values({ telegramId, name })
    .returning();
  await ensureProfileRow(inserted[0].id);
  return inserted[0];
}

// Създава потребител само с имейл/парола (без Telegram все още). Връща
// съществуващия, ако имейлът е зает (UI-то трябва да го хване предварително).
export async function createWebUser(opts: {
  email: string;
  passwordHash: string;
  name?: string;
  isAdmin?: boolean;
}): Promise<User> {
  const existing = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, opts.email.toLowerCase()))
    .limit(1);
  if (existing[0]) return existing[0];
  const inserted = await db
    .insert(usersTable)
    .values({
      email: opts.email.toLowerCase(),
      passwordHash: opts.passwordHash,
      name: opts.name,
      isAdmin: opts.isAdmin ?? false,
    })
    .returning();
  await ensureProfileRow(inserted[0].id);
  return inserted[0];
}

export async function getUserById(userId: number): Promise<User | undefined> {
  const rows = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  return rows[0];
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
  const rows = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase()))
    .limit(1);
  return rows[0];
}

// Свързва съществуващ уеб потребител с Telegram акаунт. Ако вече има друг
// потребител със същия telegram_id (само-Telegram профил), мигрираме данните
// му към уеб потребителя.
export async function linkTelegramToWebUser(
  webUserId: number,
  telegramId: number
): Promise<void> {
  const tgExisting = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.telegramId, telegramId))
    .limit(1);
  if (tgExisting[0] && tgExisting[0].id !== webUserId) {
    // Мигрираме съобщения, навици, прозрения от стария Telegram-only потребител.
    const fromId = tgExisting[0].id;
    await db
      .update(messagesTable)
      .set({ userId: webUserId })
      .where(eq(messagesTable.userId, fromId));
    await db
      .update(habitsTable)
      .set({ userId: webUserId })
      .where(eq(habitsTable.userId, fromId));
    await db
      .update(insightsTable)
      .set({ userId: webUserId })
      .where(eq(insightsTable.userId, fromId));
    // Сесии, напомняния и check-in-и също минават към уеб профила.
    await db
      .update(sessionsTable)
      .set({ userId: webUserId })
      .where(eq(sessionsTable.userId, fromId));
    await db
      .update(remindersTable)
      .set({ userId: webUserId })
      .where(eq(remindersTable.userId, fromId));
    await db
      .update(checkInsTable)
      .set({ userId: webUserId })
      .where(eq(checkInsTable.userId, fromId));
    // Профилът — ако уеб потребителят е празен, копираме от Telegram-only.
    const tgProfile = await db
      .select()
      .from(profilesTable)
      .where(eq(profilesTable.userId, fromId))
      .limit(1);
    if (tgProfile[0]) {
      const webProfile = await db
        .select()
        .from(profilesTable)
        .where(eq(profilesTable.userId, webUserId))
        .limit(1);
      const isEmpty =
        webProfile[0] &&
        !webProfile[0].identityCurrent &&
        !webProfile[0].identityTarget &&
        !webProfile[0].story &&
        !webProfile[0].goals;
      if (isEmpty) {
        await db
          .update(profilesTable)
          .set({
            identityCurrent: tgProfile[0].identityCurrent,
            identityTarget: tgProfile[0].identityTarget,
            beliefsLimiting: tgProfile[0].beliefsLimiting,
            beliefsNew: tgProfile[0].beliefsNew,
            story: tgProfile[0].story,
            problems: tgProfile[0].problems,
            goals: tgProfile[0].goals,
            updatedAt: new Date(),
          })
          .where(eq(profilesTable.userId, webUserId));
      }
      await db.delete(profilesTable).where(eq(profilesTable.userId, fromId));
    }
    // Копираме етапа/режима/чек-ин настройките, ако уеб профилът е "new".
    const web = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, webUserId))
      .limit(1);
    if (web[0]?.onboardingStage === "new") {
      await db
        .update(usersTable)
        .set({
          onboardingStage: tgExisting[0].onboardingStage,
          mode: tgExisting[0].mode,
          morningCheckin: tgExisting[0].morningCheckin,
          eveningCheckin: tgExisting[0].eveningCheckin,
        })
        .where(eq(usersTable.id, webUserId));
    }
    await db.delete(usersTable).where(eq(usersTable.id, fromId));
  }
  await db
    .update(usersTable)
    .set({ telegramId, lastActiveAt: new Date() })
    .where(eq(usersTable.id, webUserId));
}

export async function setStage(userId: number, stage: string) {
  await db
    .update(usersTable)
    .set({ onboardingStage: stage })
    .where(eq(usersTable.id, userId));
}

export async function setMode(userId: number, mode: string) {
  await db.update(usersTable).set({ mode }).where(eq(usersTable.id, userId));
}

export type MessageTelemetry = {
  sessionId?: string | null;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  costUsd?: number;
};

export async function saveMessage(
  userId: number,
  role: "user" | "assistant",
  content: string,
  kind = "chat",
  extra: MessageTelemetry = {}
) {
  await db.insert(messagesTable).values({
    userId,
    role,
    content,
    kind,
    sessionId: extra.sessionId ?? null,
    model: extra.model ?? "",
    promptTokens: extra.promptTokens ?? 0,
    completionTokens: extra.completionTokens ?? 0,
    costUsd: extra.costUsd ?? 0,
  });
}

// Последни съобщения от ежедневния поток (session_id IS NULL).
export async function recentMessages(
  userId: number,
  limit = 12
): Promise<ChatMsg[]> {
  const rows = await db
    .select()
    .from(messagesTable)
    .where(
      and(eq(messagesTable.userId, userId), isNull(messagesTable.sessionId))
    )
    .orderBy(desc(messagesTable.createdAt))
    .limit(limit);
  return rows
    .reverse()
    .map((r) => ({ role: r.role as "user" | "assistant", content: r.content }));
}

// Съобщенията в конкретна сесия (хронологично).
export async function sessionMessages(
  sessionId: string,
  limit = 60
): Promise<ChatMsg[]> {
  const rows = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.sessionId, sessionId))
    .orderBy(desc(messagesTable.createdAt))
    .limit(limit);
  return rows
    .reverse()
    .map((r) => ({ role: r.role as "user" | "assistant", content: r.content }));
}

// ---- Сесии ----

export async function createSession(
  userId: number,
  type: "onboarding" | "short" | "deep",
  focus = ""
): Promise<Session> {
  const rows = await db
    .insert(sessionsTable)
    .values({ userId, type, focus, status: "active" })
    .returning();
  return rows[0];
}

export async function getActiveSession(
  userId: number,
  type?: "onboarding" | "short" | "deep"
): Promise<Session | undefined> {
  const conds = [
    eq(sessionsTable.userId, userId),
    eq(sessionsTable.status, "active"),
  ];
  if (type) conds.push(eq(sessionsTable.type, type));
  const rows = await db
    .select()
    .from(sessionsTable)
    .where(and(...conds))
    .orderBy(desc(sessionsTable.startedAt))
    .limit(1);
  return rows[0];
}

export async function getSessionById(
  id: string
): Promise<Session | undefined> {
  const rows = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.id, id))
    .limit(1);
  return rows[0];
}

export async function getUserSessions(userId: number): Promise<Session[]> {
  return db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.userId, userId))
    .orderBy(desc(sessionsTable.startedAt));
}

export async function completeSession(
  id: string,
  patch: { summary?: string; title?: string; focus?: string }
) {
  await db
    .update(sessionsTable)
    .set({
      status: "completed",
      endedAt: new Date(),
      ...(patch.summary !== undefined ? { summary: patch.summary } : {}),
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.focus ? { focus: patch.focus } : {}),
    })
    .where(eq(sessionsTable.id, id));
}

// ---- Напомняния ----

export async function listReminders(
  userId: number,
  onlyActive = true
): Promise<Reminder[]> {
  const conds = [eq(remindersTable.userId, userId)];
  if (onlyActive) conds.push(eq(remindersTable.active, true));
  return db
    .select()
    .from(remindersTable)
    .where(and(...conds))
    .orderBy(remindersTable.time);
}

export type ReminderInput = {
  id?: string;
  time: string;
  days?: string;
  reason?: string;
  promptHint?: string;
  message?: string;
  target?: string;
  active?: boolean;
};

export async function getReminder(
  userId: number,
  id: string
): Promise<Reminder | undefined> {
  if (!UUID_RE.test(id)) return undefined;
  const rows = await db
    .select()
    .from(remindersTable)
    .where(and(eq(remindersTable.id, id), eq(remindersTable.userId, userId)))
    .limit(1);
  return rows[0];
}

// Създава или обновява напомняне. Всички достъпи са ограничени до userId
// (ownership). След запис викащият трябва да извика syncUserReminders/syncReminder.
export async function upsertReminder(
  userId: number,
  data: ReminderInput
): Promise<Reminder> {
  if (data.id && UUID_RE.test(data.id)) {
    const rows = await db
      .update(remindersTable)
      .set({
        time: data.time,
        ...(data.days !== undefined ? { days: data.days } : {}),
        ...(data.reason !== undefined ? { reason: data.reason } : {}),
        ...(data.promptHint !== undefined
          ? { promptHint: data.promptHint }
          : {}),
        ...(data.message !== undefined ? { message: data.message } : {}),
        ...(data.target !== undefined ? { target: data.target } : {}),
        ...(data.active !== undefined ? { active: data.active } : {}),
      })
      .where(
        and(eq(remindersTable.id, data.id), eq(remindersTable.userId, userId))
      )
      .returning();
    if (rows[0]) return rows[0];
  }
  const rows = await db
    .insert(remindersTable)
    .values({
      userId,
      time: data.time,
      days: data.days ?? "*",
      reason: data.reason ?? "",
      promptHint: data.promptHint ?? "",
      message: data.message ?? "",
      target: data.target ?? "chat",
      active: data.active ?? true,
    })
    .returning();
  return rows[0];
}

// Връща изтрития ред (за да може викащият да махне външния график).
export async function removeReminder(
  userId: number,
  id: string
): Promise<Reminder | undefined> {
  if (!UUID_RE.test(id)) return undefined;
  const rows = await db
    .delete(remindersTable)
    .where(and(eq(remindersTable.id, id), eq(remindersTable.userId, userId)))
    .returning();
  return rows[0];
}

export async function markReminderSent(id: string, dateStr: string) {
  await db
    .update(remindersTable)
    .set({ lastSentOn: dateStr })
    .where(eq(remindersTable.id, id));
}

// Всички активни напомняния (за scheduler-а) — заедно с часовата зона и
// telegram_id на потребителя.
export async function allActiveReminders(): Promise<
  (Reminder & { timezone: string; telegramId: number | null })[]
> {
  const rows = await db
    .select({
      reminder: remindersTable,
      timezone: usersTable.timezone,
      telegramId: usersTable.telegramId,
    })
    .from(remindersTable)
    .innerJoin(usersTable, eq(remindersTable.userId, usersTable.id))
    .where(eq(remindersTable.active, true));
  return rows.map((r) => ({
    ...r.reminder,
    timezone: r.timezone,
    telegramId: r.telegramId,
  }));
}

export async function setUserTimezone(userId: number, timezone: string) {
  if (!isValidTimezone(timezone)) {
    throw new Error(`Невалидна часова зона: ${timezone}`);
  }
  await db
    .update(usersTable)
    .set({ timezone })
    .where(eq(usersTable.id, userId));
}

export async function getProfile(userId: number) {
  const rows = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.userId, userId))
    .limit(1);
  return rows[0];
}

export async function getHabits(userId: number) {
  return db
    .select()
    .from(habitsTable)
    .where(and(eq(habitsTable.userId, userId), eq(habitsTable.active, true)));
}

// Patch на отделни полета на профила (ползва се от инструмента update_profile).
export type ProfilePatch = {
  identityCurrent?: string;
  identityTarget?: string;
  beliefsLimiting?: string;
  beliefsNew?: string;
  story?: string;
  problems?: string;
  goals?: string;
  vision?: string;
  focus?: string;
};

export async function updateProfileFields(userId: number, patch: ProfilePatch) {
  await ensureProfileRow(userId);
  const set: Record<string, unknown> = { updatedAt: new Date() };
  for (const [k, v] of Object.entries(patch)) {
    if (typeof v === "string" && v.trim() !== "") set[k] = v;
  }
  if (Object.keys(set).length === 1) return; // само updatedAt
  await db
    .update(profilesTable)
    .set(set)
    .where(eq(profilesTable.userId, userId));
}

export async function upsertHabit(
  userId: number,
  data: {
    id?: string;
    name: string;
    kind?: "build" | "limiting";
    trigger?: string;
    identityLink?: string;
    cadence?: string;
  }
) {
  if (data.id) {
    const rows = await db
      .update(habitsTable)
      .set({
        name: data.name,
        ...(data.kind ? { kind: data.kind } : {}),
        ...(data.trigger !== undefined ? { trigger: data.trigger } : {}),
        ...(data.identityLink !== undefined
          ? { identityLink: data.identityLink }
          : {}),
        ...(data.cadence ? { cadence: data.cadence } : {}),
        active: true,
      })
      .where(and(eq(habitsTable.id, data.id), eq(habitsTable.userId, userId)))
      .returning();
    if (rows[0]) return rows[0];
  }
  // Ако вече има активен навик със същото име — обновяваме него.
  const existing = await db
    .select()
    .from(habitsTable)
    .where(
      and(
        eq(habitsTable.userId, userId),
        eq(habitsTable.name, data.name),
        eq(habitsTable.active, true)
      )
    )
    .limit(1);
  if (existing[0]) {
    const rows = await db
      .update(habitsTable)
      .set({
        ...(data.kind ? { kind: data.kind } : {}),
        ...(data.trigger !== undefined ? { trigger: data.trigger } : {}),
        ...(data.identityLink !== undefined
          ? { identityLink: data.identityLink }
          : {}),
        ...(data.cadence ? { cadence: data.cadence } : {}),
      })
      .where(eq(habitsTable.id, existing[0].id))
      .returning();
    return rows[0];
  }
  const rows = await db
    .insert(habitsTable)
    .values({
      userId,
      name: data.name,
      kind: data.kind ?? "build",
      trigger: data.trigger ?? "",
      identityLink: data.identityLink ?? "",
      cadence: data.cadence ?? "всеки ден",
    })
    .returning();
  return rows[0];
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function deactivateHabit(userId: number, idOrName: string) {
  // Първо опит по id (ако прилича на uuid), после по име.
  if (UUID_RE.test(idOrName)) {
    const byId = await db
      .update(habitsTable)
      .set({ active: false })
      .where(and(eq(habitsTable.id, idOrName), eq(habitsTable.userId, userId)))
      .returning();
    if (byId[0]) return byId[0];
  }
  const byName = await db
    .update(habitsTable)
    .set({ active: false })
    .where(
      and(eq(habitsTable.userId, userId), eq(habitsTable.name, idOrName))
    )
    .returning();
  return byName[0];
}

export async function getInsights(userId: number, limit = 8): Promise<string[]> {
  const rows = await db
    .select()
    .from(insightsTable)
    .where(eq(insightsTable.userId, userId))
    .orderBy(desc(insightsTable.createdAt))
    .limit(limit);
  return rows.map((r) => r.content);
}

export async function addInsight(userId: number, content: string) {
  await db.insert(insightsTable).values({ userId, content });
}

export type ExtractedHabit = {
  name: string;
  kind?: string;
  trigger?: string;
  identityLink?: string;
  cadence?: string;
};

export type ExtractedProfile = {
  identityCurrent?: string;
  identityTarget?: string;
  beliefsLimiting?: string;
  beliefsNew?: string;
  story?: string;
  problems?: string;
  goals?: string;
  vision?: string;
  focus?: string;
  habits?: ExtractedHabit[];
};

const FOCUS_VALUES = ["habits", "goals", "beliefs", "identity"];

// Записва извлечения профил. Не презаписва вече събрани данни с празни
// стойности (инструментите update_profile може да са ги попълнили по-рано),
// и обновява съществуващите навици вместо да създава дубликати.
export async function saveExtractedProfile(
  userId: number,
  data: ExtractedProfile
) {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const focus = str(data.focus);
  await updateProfileFields(userId, {
    identityCurrent: str(data.identityCurrent),
    identityTarget: str(data.identityTarget),
    beliefsLimiting: str(data.beliefsLimiting),
    beliefsNew: str(data.beliefsNew),
    story: str(data.story),
    problems: str(data.problems),
    goals: str(data.goals),
    vision: str(data.vision),
    focus: FOCUS_VALUES.includes(focus) ? focus : "",
  });

  if (Array.isArray(data.habits)) {
    for (const h of data.habits) {
      const name = str(h?.name);
      if (!name) continue;
      await upsertHabit(userId, {
        name: name.slice(0, 300),
        kind: h.kind === "limiting" ? "limiting" : "build",
        trigger: str(h.trigger) || undefined,
        identityLink: str(h.identityLink) || undefined,
        cadence: str(h.cadence) || undefined,
      });
    }
  }
}

export async function allActiveUsers(): Promise<User[]> {
  return db.select().from(usersTable).where(eq(usersTable.onboardingStage, "done"));
}

// ---- Link кодове за свързване Telegram <-> уеб ----

import { linkCodesTable } from "./db/schema";

function randomCode(len = 8): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // без объркващи знаци
  let out = "";
  for (let i = 0; i < len; i++) {
    out += alphabet[randomInt(alphabet.length)];
  }
  return out;
}

export async function createLinkCode(
  userId: number,
  purpose: "link" | "login" = "link",
  ttlMinutes = 15
): Promise<string> {
  const code = randomCode(8);
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);
  await db.insert(linkCodesTable).values({ code, userId, purpose, expiresAt });
  return code;
}

export async function consumeLinkCode(
  code: string,
  purpose: "link" | "login"
): Promise<number | null> {
  const trimmed = code.trim().toUpperCase();
  const rows = await db
    .select()
    .from(linkCodesTable)
    .where(eq(linkCodesTable.code, trimmed))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.purpose !== purpose) return null;
  if (row.usedAt) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;
  await db
    .update(linkCodesTable)
    .set({ usedAt: new Date() })
    .where(eq(linkCodesTable.code, trimmed));
  return row.userId;
}

// ---- Check-in-и (accountability) ----

export type CheckInStatus = "done" | "partial" | "missed";

export function isCheckInStatus(v: unknown): v is CheckInStatus {
  return v === "done" || v === "partial" || v === "missed";
}

// Намира активен навик по id или (частично) име.
export async function findHabit(userId: number, idOrName: string) {
  const habits = await getHabits(userId);
  if (UUID_RE.test(idOrName)) {
    const byId = habits.find((h) => h.id === idOrName);
    if (byId) return byId;
  }
  const q = idOrName.trim().toLowerCase();
  if (!q) return undefined;
  return (
    habits.find((h) => h.name.toLowerCase() === q) ??
    habits.find((h) => h.name.toLowerCase().includes(q))
  );
}

export async function logCheckIn(
  userId: number,
  data: { habitId?: string | null; status: CheckInStatus; note?: string }
): Promise<CheckIn> {
  const rows = await db
    .insert(checkInsTable)
    .values({
      userId,
      habitId: data.habitId ?? null,
      status: data.status,
      note: data.note?.trim().slice(0, 500) || null,
    })
    .returning();
  return rows[0];
}

export async function getCheckInsSince(
  userId: number,
  since: Date
): Promise<CheckIn[]> {
  return db
    .select()
    .from(checkInsTable)
    .where(and(eq(checkInsTable.userId, userId), gte(checkInsTable.createdAt, since)))
    .orderBy(desc(checkInsTable.createdAt));
}

// ---- Лимит на разхода ----

// Брой съобщения на потребителя от последните 24 часа (за дневен лимит).
export async function userMessagesLast24h(userId: number): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(messagesTable)
    .where(
      and(
        eq(messagesTable.userId, userId),
        eq(messagesTable.role, "user"),
        gte(messagesTable.createdAt, since)
      )
    );
  return rows[0]?.n ?? 0;
}
