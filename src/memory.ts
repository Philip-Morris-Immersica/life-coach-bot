import { and, desc, eq } from "drizzle-orm";
import {
  db,
  usersTable,
  profilesTable,
  habitsTable,
  messagesTable,
  insightsTable,
  type User,
} from "./db/index";
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

export async function saveMessage(
  userId: number,
  role: "user" | "assistant",
  content: string,
  kind = "chat"
) {
  await db.insert(messagesTable).values({ userId, role, content, kind });
}

export async function recentMessages(
  userId: number,
  limit = 12
): Promise<ChatMsg[]> {
  const rows = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.userId, userId))
    .orderBy(desc(messagesTable.createdAt))
    .limit(limit);
  return rows
    .reverse()
    .map((r) => ({ role: r.role as "user" | "assistant", content: r.content }));
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

export type ExtractedProfile = {
  identityCurrent?: string;
  identityTarget?: string;
  beliefsLimiting?: string;
  beliefsNew?: string;
  story?: string;
  problems?: string;
  goals?: string;
  habits?: { name: string; identityLink?: string; cadence?: string }[];
};

export async function saveExtractedProfile(
  userId: number,
  data: ExtractedProfile
) {
  await db
    .update(profilesTable)
    .set({
      identityCurrent: data.identityCurrent ?? "",
      identityTarget: data.identityTarget ?? "",
      beliefsLimiting: data.beliefsLimiting ?? "",
      beliefsNew: data.beliefsNew ?? "",
      story: data.story ?? "",
      problems: data.problems ?? "",
      goals: data.goals ?? "",
      updatedAt: new Date(),
    })
    .where(eq(profilesTable.userId, userId));

  if (data.habits?.length) {
    for (const h of data.habits) {
      if (!h.name) continue;
      await db.insert(habitsTable).values({
        userId,
        name: h.name,
        identityLink: h.identityLink ?? "",
        cadence: h.cadence ?? "всеки ден",
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
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
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
