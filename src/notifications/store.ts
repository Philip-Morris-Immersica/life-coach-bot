// DB слой за известията: устройства, настройки, журнал на изпращанията.

import { createHash } from "node:crypto";
import { and, eq, lt, sql } from "drizzle-orm";
import {
  db,
  notificationDeliveriesTable,
  pushSubscriptionsTable,
  remindersTable,
  usersTable,
  type PushSubscriptionRow,
} from "../db/index";
import type { DispatchStore } from "./dispatch";
import { isValidTimezone, normalizeTime } from "./time";

// ---------- Устройства ----------

export async function listUserSubscriptions(
  userId: number,
  onlyActive = true
): Promise<PushSubscriptionRow[]> {
  const conds = [eq(pushSubscriptionsTable.userId, userId)];
  if (onlyActive) conds.push(eq(pushSubscriptionsTable.active, true));
  return db
    .select()
    .from(pushSubscriptionsTable)
    .where(and(...conds))
    .orderBy(pushSubscriptionsTable.createdAt);
}

export async function upsertSubscription(
  userId: number,
  data: { endpoint: string; p256dh: string; auth: string; label?: string }
): Promise<PushSubscriptionRow> {
  const rows = await db
    .insert(pushSubscriptionsTable)
    .values({
      userId,
      endpoint: data.endpoint,
      p256dh: data.p256dh,
      auth: data.auth,
      label: (data.label ?? "").slice(0, 120),
    })
    .onConflictDoUpdate({
      target: pushSubscriptionsTable.endpoint,
      // Ако същият браузър се логне с друг акаунт, устройството минава към него.
      set: {
        userId,
        p256dh: data.p256dh,
        auth: data.auth,
        label: (data.label ?? "").slice(0, 120),
        active: true,
        failureCount: 0,
      },
    })
    .returning();
  return rows[0];
}

export async function removeSubscription(
  userId: number,
  id: string
): Promise<boolean> {
  const rows = await db
    .delete(pushSubscriptionsTable)
    .where(
      and(
        eq(pushSubscriptionsTable.id, id),
        eq(pushSubscriptionsTable.userId, userId)
      )
    )
    .returning({ id: pushSubscriptionsTable.id });
  return rows.length > 0;
}

export async function removeSubscriptionByEndpoint(
  userId: number,
  endpoint: string
): Promise<boolean> {
  const rows = await db
    .delete(pushSubscriptionsTable)
    .where(
      and(
        eq(pushSubscriptionsTable.endpoint, endpoint),
        eq(pushSubscriptionsTable.userId, userId)
      )
    )
    .returning({ id: pushSubscriptionsTable.id });
  return rows.length > 0;
}

export async function getUserSubscription(
  userId: number,
  id: string
): Promise<PushSubscriptionRow | undefined> {
  const rows = await db
    .select()
    .from(pushSubscriptionsTable)
    .where(
      and(
        eq(pushSubscriptionsTable.id, id),
        eq(pushSubscriptionsTable.userId, userId)
      )
    )
    .limit(1);
  return rows[0];
}

// Безопасен изглед на устройство за клиента (без ключове и без пълния endpoint).
// `fp` е отпечатък на endpoint-а, с който браузърът разпознава "това устройство".
export type DeviceView = {
  id: string;
  label: string;
  active: boolean;
  failureCount: number;
  lastSuccessAt: string | null;
  createdAt: string;
  fp: string;
};

export function deviceView(row: PushSubscriptionRow): DeviceView {
  return {
    id: row.id,
    label: row.label || "Устройство",
    active: row.active,
    failureCount: row.failureCount,
    lastSuccessAt: row.lastSuccessAt ? new Date(row.lastSuccessAt).toISOString() : null,
    createdAt: new Date(row.createdAt).toISOString(),
    fp: createHash("sha256").update(row.endpoint).digest("hex").slice(0, 16),
  };
}

// ---------- Настройки ----------

export type NotificationPrefs = {
  timezone: string;
  notificationsPaused: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  privacyMode: boolean;
};

export async function getNotificationPrefs(
  userId: number
): Promise<NotificationPrefs | null> {
  const rows = await db
    .select({
      timezone: usersTable.timezone,
      notificationsPaused: usersTable.notificationsPaused,
      quietHoursStart: usersTable.quietHoursStart,
      quietHoursEnd: usersTable.quietHoursEnd,
      privacyMode: usersTable.privacyMode,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  return rows[0] ?? null;
}

// Валидира и записва частичен patch. Хвърля Error със съобщение при грешка.
export async function updateNotificationPrefs(
  userId: number,
  patch: Partial<NotificationPrefs>
): Promise<NotificationPrefs> {
  const set: Partial<NotificationPrefs> = {};
  if (patch.timezone !== undefined) {
    if (!isValidTimezone(patch.timezone)) throw new Error("Невалидна часова зона.");
    set.timezone = patch.timezone;
  }
  if (patch.notificationsPaused !== undefined) {
    set.notificationsPaused = Boolean(patch.notificationsPaused);
  }
  if (patch.privacyMode !== undefined) set.privacyMode = Boolean(patch.privacyMode);

  const hasStart = patch.quietHoursStart !== undefined;
  const hasEnd = patch.quietHoursEnd !== undefined;
  if (hasStart || hasEnd) {
    const start = hasStart ? String(patch.quietHoursStart) : undefined;
    const end = hasEnd ? String(patch.quietHoursEnd) : undefined;
    const ns = start === "" ? "" : start !== undefined ? normalizeTime(start) : undefined;
    const ne = end === "" ? "" : end !== undefined ? normalizeTime(end) : undefined;
    if (ns === null || ne === null) throw new Error("Невалиден час за тихи часове.");
    if (ns !== undefined) set.quietHoursStart = ns;
    if (ne !== undefined) set.quietHoursEnd = ne;
  }
  if (Object.keys(set).length) {
    await db.update(usersTable).set(set).where(eq(usersTable.id, userId));
  }
  const prefs = await getNotificationPrefs(userId);
  if (!prefs) throw new Error("Профилът не е намерен.");
  return prefs;
}

// ---------- Синхронизация на график ----------

export async function setReminderSync(
  id: string,
  data: { scheduleId: string; status: "idle" | "synced" | "error"; error?: string }
) {
  await db
    .update(remindersTable)
    .set({
      scheduleId: data.scheduleId,
      syncStatus: data.status,
      syncError: (data.error ?? "").slice(0, 400),
    })
    .where(eq(remindersTable.id, id));
}

// ---------- Dispatch store (реална реализация) ----------

export const dbDispatchStore: DispatchStore = {
  async getReminder(id) {
    const rows = await db
      .select({ reminder: remindersTable, user: usersTable })
      .from(remindersTable)
      .innerJoin(usersTable, eq(remindersTable.userId, usersTable.id))
      .where(eq(remindersTable.id, id))
      .limit(1);
    const r = rows[0];
    if (!r) return null;
    return {
      reminder: {
        id: r.reminder.id,
        userId: r.reminder.userId,
        time: r.reminder.time,
        days: r.reminder.days,
        reason: r.reminder.reason,
        message: r.reminder.message,
        target: r.reminder.target,
        active: r.reminder.active,
      },
      user: {
        timezone: r.user.timezone,
        notificationsPaused: r.user.notificationsPaused,
        quietHoursStart: r.user.quietHoursStart,
        quietHoursEnd: r.user.quietHoursEnd,
        privacyMode: r.user.privacyMode,
      },
    };
  },

  async listSubscriptions(userId) {
    const subs = await listUserSubscriptions(userId, true);
    return subs.map((s) => ({
      id: s.id,
      endpoint: s.endpoint,
      p256dh: s.p256dh,
      auth: s.auth,
    }));
  },

  async claim(key, userId, reminderId) {
    const inserted = await db
      .insert(notificationDeliveriesTable)
      .values({ userId, reminderId, dedupeKey: key })
      .onConflictDoNothing({ target: notificationDeliveriesTable.dedupeKey })
      .returning({ id: notificationDeliveriesTable.id });
    if (inserted.length) return true;
    // Остарял claim (процесът е прекъснат) — позволяваме повторно поемане.
    const reclaimed = await db
      .update(notificationDeliveriesTable)
      .set({ createdAt: new Date() })
      .where(
        and(
          eq(notificationDeliveriesTable.dedupeKey, key),
          eq(notificationDeliveriesTable.status, "claimed"),
          lt(notificationDeliveriesTable.createdAt, new Date(Date.now() - 2 * 60_000))
        )
      )
      .returning({ id: notificationDeliveriesTable.id });
    return reclaimed.length > 0;
  },

  async finish(key, status, detail, sentCount) {
    await db
      .update(notificationDeliveriesTable)
      .set({ status, detail: detail.slice(0, 400), sentCount })
      .where(eq(notificationDeliveriesTable.dedupeKey, key));
  },

  async release(key) {
    await db
      .delete(notificationDeliveriesTable)
      .where(
        and(
          eq(notificationDeliveriesTable.dedupeKey, key),
          eq(notificationDeliveriesTable.status, "claimed")
        )
      );
  },

  async markSubscriptionSuccess(id) {
    await db
      .update(pushSubscriptionsTable)
      .set({ failureCount: 0, lastSuccessAt: new Date() })
      .where(eq(pushSubscriptionsTable.id, id));
  },

  async markSubscriptionFailure(id, gone) {
    if (gone) {
      await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.id, id));
      return;
    }
    await db
      .update(pushSubscriptionsTable)
      .set({
        failureCount: sql`${pushSubscriptionsTable.failureCount} + 1`,
        active: sql`${pushSubscriptionsTable.failureCount} + 1 < 10`,
      })
      .where(eq(pushSubscriptionsTable.id, id));
  },

  async markReminderSent(id, date) {
    await db
      .update(remindersTable)
      .set({ lastSentOn: date })
      .where(eq(remindersTable.id, id));
  },
};
