// Привежда външните графици (QStash) в съответствие с желаното състояние:
//   има график  <=>  напомнянето е активно И потребителят не е на пауза
//                    И има поне едно регистрирано устройство за Web Push.
// Никога не хвърля към извикващия — грешките се записват върху напомнянето
// (sync_status = 'error'), за да ги покаже интерфейсът.

import { listReminders } from "../memory";
import { deleteSchedule, isSchedulingConfigured, upsertSchedule } from "./schedule";
import {
  getNotificationPrefs,
  listUserSubscriptions,
  setReminderSync,
} from "./store";
import type { Reminder } from "../db/index";

export type SyncSummary = {
  total: number;
  synced: number;
  idle: number;
  errors: number;
};

function errMessage(err: unknown): string {
  const m = err instanceof Error ? err.message : String(err);
  return m.slice(0, 300);
}

async function reconcileOne(
  r: Reminder,
  ctx: { desiredBase: boolean; timezone: string }
): Promise<"synced" | "idle" | "error"> {
  const wanted = ctx.desiredBase && r.active;
  try {
    if (wanted) {
      if (!isSchedulingConfigured()) {
        await setReminderSync(r.id, {
          scheduleId: r.scheduleId,
          status: "error",
          error: "Планировчикът (QStash) не е настроен на сървъра.",
        });
        return "error";
      }
      const scheduleId = await upsertSchedule({
        id: r.id,
        time: r.time,
        days: r.days,
        timezone: ctx.timezone,
      });
      await setReminderSync(r.id, { scheduleId, status: "synced" });
      return "synced";
    }
    if (r.scheduleId && isSchedulingConfigured()) {
      await deleteSchedule(r.scheduleId);
    }
    if (r.scheduleId || r.syncStatus !== "idle" || r.syncError) {
      await setReminderSync(r.id, { scheduleId: "", status: "idle" });
    }
    return "idle";
  } catch (err) {
    await setReminderSync(r.id, {
      scheduleId: r.scheduleId,
      status: "error",
      error: errMessage(err),
    }).catch(() => {});
    return "error";
  }
}

// Синхронизира всички напомняния на потребителя.
export async function syncUserReminders(userId: number): Promise<SyncSummary> {
  const summary: SyncSummary = { total: 0, synced: 0, idle: 0, errors: 0 };
  try {
    const [prefs, subs, reminders] = await Promise.all([
      getNotificationPrefs(userId),
      listUserSubscriptions(userId, true),
      listReminders(userId, false),
    ]);
    if (!prefs) return summary;
    const desiredBase = !prefs.notificationsPaused && subs.length > 0;
    for (const r of reminders) {
      summary.total++;
      const res = await reconcileOne(r, { desiredBase, timezone: prefs.timezone });
      if (res === "synced") summary.synced++;
      else if (res === "idle") summary.idle++;
      else summary.errors++;
    }
  } catch (err) {
    console.error("syncUserReminders:", err);
    summary.errors++;
  }
  return summary;
}

// Синхронизира едно напомняне (след създаване/промяна/ръчен retry).
export async function syncReminder(userId: number, reminderId: string): Promise<void> {
  try {
    const [prefs, subs, reminders] = await Promise.all([
      getNotificationPrefs(userId),
      listUserSubscriptions(userId, true),
      listReminders(userId, false),
    ]);
    const r = reminders.find((x) => x.id === reminderId);
    if (!prefs || !r) return;
    await reconcileOne(r, {
      desiredBase: !prefs.notificationsPaused && subs.length > 0,
      timezone: prefs.timezone,
    });
  } catch (err) {
    console.error("syncReminder:", err);
  }
}

// Преди изтриване на напомняне: маха външния му график.
export async function removeReminderSchedule(scheduleId: string): Promise<void> {
  if (!scheduleId || !isSchedulingConfigured()) return;
  try {
    await deleteSchedule(scheduleId);
  } catch (err) {
    console.error("removeReminderSchedule:", err);
  }
}
