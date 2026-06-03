// Helper-и за уеб таблото: дърпат стат-и от паметта.

import "server-only";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import {
  db,
  habitsTable,
  insightsTable,
  messagesTable,
  profilesTable,
  usersTable,
} from "@/src/db";

export type DashboardData = {
  profile: typeof profilesTable.$inferSelect | undefined;
  habits: (typeof habitsTable.$inferSelect)[];
  insights: { id: string; content: string; createdAt: Date }[];
  stats: {
    totalMessages: number;
    deepSessions: number;
    last7DaysMessages: number;
    insightCount: number;
  };
  user: typeof usersTable.$inferSelect | undefined;
};

export async function getDashboardData(userId: number): Promise<DashboardData> {
  const [profileRows, habitRows, insightRows, userRows] = await Promise.all([
    db.select().from(profilesTable).where(eq(profilesTable.userId, userId)).limit(1),
    db
      .select()
      .from(habitsTable)
      .where(and(eq(habitsTable.userId, userId), eq(habitsTable.active, true))),
    db
      .select()
      .from(insightsTable)
      .where(eq(insightsTable.userId, userId))
      .orderBy(desc(insightsTable.createdAt))
      .limit(10),
    db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1),
  ]);

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [{ totalMessages }, { deepSessions }, { last7DaysMessages }] = await Promise.all([
    db
      .select({ totalMessages: sql<number>`count(*)::int` })
      .from(messagesTable)
      .where(eq(messagesTable.userId, userId))
      .then((r) => r[0] ?? { totalMessages: 0 }),
    db
      .select({ deepSessions: sql<number>`count(distinct date(${messagesTable.createdAt}))::int` })
      .from(messagesTable)
      .where(
        and(eq(messagesTable.userId, userId), eq(messagesTable.kind, "deep"))
      )
      .then((r) => r[0] ?? { deepSessions: 0 }),
    db
      .select({ last7DaysMessages: sql<number>`count(*)::int` })
      .from(messagesTable)
      .where(
        and(
          eq(messagesTable.userId, userId),
          gte(messagesTable.createdAt, sevenDaysAgo)
        )
      )
      .then((r) => r[0] ?? { last7DaysMessages: 0 }),
  ]);

  return {
    profile: profileRows[0],
    habits: habitRows,
    insights: insightRows.map((r) => ({
      id: r.id,
      content: r.content,
      createdAt: r.createdAt,
    })),
    stats: {
      totalMessages,
      deepSessions,
      last7DaysMessages,
      insightCount: insightRows.length,
    },
    user: userRows[0],
  };
}
