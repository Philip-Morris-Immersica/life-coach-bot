// Логика за изпращане на напомняне (извиква се от подписан QStash callback).
// Чиста от DB/мрежа чрез интерфейси — лесно за тестване.

import { buildReminderPayload, type PushPayload } from "./content";
import { dayMatches, inQuietHours, localParts } from "./time";

export type DispatchReminder = {
  id: string;
  userId: number;
  time: string;
  days: string;
  reason: string;
  message: string;
  target: string;
  active: boolean;
};

export type DispatchUser = {
  timezone: string;
  notificationsPaused: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  privacyMode: boolean;
};

export type DispatchSub = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type SendResult =
  | { ok: true }
  // gone = абонаментът е изтекъл/отписан (404/410) и трябва да се премахне.
  | { ok: false; gone: boolean; error: string };

export interface DispatchStore {
  getReminder(
    id: string
  ): Promise<{ reminder: DispatchReminder; user: DispatchUser } | null>;
  listSubscriptions(userId: number): Promise<DispatchSub[]>;
  // true = този (напомняне, дата) е наш; false = вече изпратено/в обработка.
  claim(key: string, userId: number, reminderId: string): Promise<boolean>;
  finish(
    key: string,
    status: "sent" | "skipped" | "failed",
    detail: string,
    sentCount: number
  ): Promise<void>;
  // Освобождава claim, за да може retry-ят от QStash да опита отново.
  release(key: string): Promise<void>;
  markSubscriptionSuccess(id: string): Promise<void>;
  markSubscriptionFailure(id: string, gone: boolean): Promise<void>;
  markReminderSent(id: string, date: string): Promise<void>;
}

export type Sender = (sub: DispatchSub, payload: PushPayload) => Promise<SendResult>;

export type DispatchResult =
  | { status: "sent"; sent: number }
  | { status: "skipped"; reason: string }
  // Временна грешка: върни 5xx, за да се опита QStash пак.
  | { status: "retry"; reason: string };

export async function dispatchReminder(
  reminderId: string,
  deps: { store: DispatchStore; send: Sender; now?: Date }
): Promise<DispatchResult> {
  const { store, send } = deps;
  const found = await store.getReminder(reminderId);
  if (!found) return { status: "skipped", reason: "missing" };
  const { reminder, user } = found;
  if (!reminder.active) return { status: "skipped", reason: "inactive" };
  if (user.notificationsPaused) return { status: "skipped", reason: "paused" };

  const local = localParts(user.timezone, deps.now);
  if (!dayMatches(reminder.days, local.day)) {
    return { status: "skipped", reason: "wrong_day" };
  }
  if (inQuietHours(user.quietHoursStart, user.quietHoursEnd, local.hhmm)) {
    return { status: "skipped", reason: "quiet_hours" };
  }

  const key = `${reminder.id}:${local.date}`;
  const claimed = await store.claim(key, reminder.userId, reminder.id);
  if (!claimed) return { status: "skipped", reason: "duplicate" };

  try {
    const subs = await store.listSubscriptions(reminder.userId);
    if (!subs.length) {
      await store.finish(key, "skipped", "no_devices", 0);
      return { status: "skipped", reason: "no_devices" };
    }

    const payload = buildReminderPayload(reminder, { privacyMode: user.privacyMode });
    let sent = 0;
    let transientFailures = 0;
    for (const sub of subs) {
      const res = await send(sub, payload);
      if (res.ok) {
        sent++;
        await store.markSubscriptionSuccess(sub.id);
      } else {
        if (!res.gone) transientFailures++;
        await store.markSubscriptionFailure(sub.id, res.gone);
      }
    }

    if (sent === 0 && transientFailures > 0) {
      await store.release(key);
      return { status: "retry", reason: "all_deliveries_failed" };
    }
    if (sent === 0) {
      await store.finish(key, "failed", "no_valid_devices", 0);
      return { status: "skipped", reason: "no_valid_devices" };
    }
    await store.finish(key, "sent", "", sent);
    await store.markReminderSent(reminder.id, local.date);
    return { status: "sent", sent };
  } catch (err) {
    // Неочаквана грешка: освобождаваме claim, за да е възможен retry.
    await store.release(key).catch(() => {});
    throw err;
  }
}
