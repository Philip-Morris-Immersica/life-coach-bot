import { and, desc, eq } from "drizzle-orm";
import {
  db,
  usersTable,
  profilesTable,
  habitsTable,
  messagesTable,
  insightsTable,
  type User,
} from "./db/index.js";
import type { ChatMsg } from "./openai.js";

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
  await db.insert(profilesTable).values({ userId: inserted[0].id });
  return inserted[0];
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
