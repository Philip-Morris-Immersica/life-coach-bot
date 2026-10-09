import { describe, expect, it } from "vitest";
import {
  dispatchReminder,
  type DispatchReminder,
  type DispatchStore,
  type DispatchSub,
  type DispatchUser,
  type SendResult,
} from "@/src/notifications/dispatch";
import type { PushPayload } from "@/src/notifications/content";

// Събота 2026-07-04 07:30 локално (София, UTC+3).
const NOW = new Date("2026-07-04T04:30:00Z");

function makeStore(opts: {
  reminder?: Partial<DispatchReminder>;
  user?: Partial<DispatchUser>;
  subs?: DispatchSub[];
}) {
  const reminder: DispatchReminder = {
    id: "rem-1",
    userId: 1,
    time: "07:30",
    days: "*",
    reason: "Медитация",
    message: "",
    target: "chat",
    active: true,
    ...opts.reminder,
  };
  const user: DispatchUser = {
    timezone: "Europe/Sofia",
    notificationsPaused: false,
    quietHoursStart: "",
    quietHoursEnd: "",
    privacyMode: false,
    ...opts.user,
  };
  const subs = opts.subs ?? [{ id: "s1", endpoint: "https://push/1", p256dh: "k", auth: "a" }];
  const claims = new Set<string>();
  const log = {
    finished: [] as { key: string; status: string; sent: number }[],
    success: [] as string[],
    failure: [] as { id: string; gone: boolean }[],
    marked: [] as string[],
  };
  const store: DispatchStore = {
    async getReminder() {
      return { reminder, user };
    },
    async listSubscriptions() {
      return subs;
    },
    async claim(key) {
      if (claims.has(key)) return false;
      claims.add(key);
      return true;
    },
    async finish(key, status, _detail, sent) {
      log.finished.push({ key, status, sent });
    },
    async release(key) {
      claims.delete(key);
    },
    async markSubscriptionSuccess(id) {
      log.success.push(id);
    },
    async markSubscriptionFailure(id, gone) {
      log.failure.push({ id, gone });
    },
    async markReminderSent(_id, date) {
      log.marked.push(date);
    },
  };
  return { store, log, claims };
}

const ok: SendResult = { ok: true };

describe("dispatchReminder", () => {
  it("изпраща до всички устройства и записва резултата", async () => {
    const { store, log } = makeStore({
      subs: [
        { id: "s1", endpoint: "https://push/1", p256dh: "k", auth: "a" },
        { id: "s2", endpoint: "https://push/2", p256dh: "k", auth: "a" },
      ],
    });
    const payloads: PushPayload[] = [];
    const res = await dispatchReminder("rem-1", {
      store,
      now: NOW,
      send: async (_s, p) => {
        payloads.push(p);
        return ok;
      },
    });
    expect(res).toEqual({ status: "sent", sent: 2 });
    expect(payloads).toHaveLength(2);
    expect(payloads[0].url).toBe("/chat");
    expect(log.finished[0]).toMatchObject({ key: "rem-1:2026-07-04", status: "sent", sent: 2 });
    expect(log.marked).toEqual(["2026-07-04"]);
  });

  it("е идемпотентен: повторно викане същия ден не праща втори път", async () => {
    const { store } = makeStore({});
    let calls = 0;
    const send = async () => {
      calls++;
      return ok;
    };
    const first = await dispatchReminder("rem-1", { store, now: NOW, send });
    const second = await dispatchReminder("rem-1", { store, now: NOW, send });
    expect(first.status).toBe("sent");
    expect(second).toEqual({ status: "skipped", reason: "duplicate" });
    expect(calls).toBe(1);
  });

  it("пропуска при пауза", async () => {
    const { store } = makeStore({ user: { notificationsPaused: true } });
    const res = await dispatchReminder("rem-1", { store, now: NOW, send: async () => ok });
    expect(res).toEqual({ status: "skipped", reason: "paused" });
  });

  it("пропуска неактивно напомняне", async () => {
    const { store } = makeStore({ reminder: { active: false } });
    const res = await dispatchReminder("rem-1", { store, now: NOW, send: async () => ok });
    expect(res).toEqual({ status: "skipped", reason: "inactive" });
  });

  it("пропуска в тихи часове (и през полунощ)", async () => {
    const { store } = makeStore({ user: { quietHoursStart: "22:00", quietHoursEnd: "08:00" } });
    const res = await dispatchReminder("rem-1", { store, now: NOW, send: async () => ok });
    expect(res).toEqual({ status: "skipped", reason: "quiet_hours" });
  });

  it("пропуска в грешен ден", async () => {
    const { store } = makeStore({ reminder: { days: "mon,tue" } });
    const res = await dispatchReminder("rem-1", { store, now: NOW, send: async () => ok });
    expect(res).toEqual({ status: "skipped", reason: "wrong_day" });
  });

  it("в режим Поверителност изпраща общ текст", async () => {
    const { store } = makeStore({ user: { privacyMode: true } });
    let payload: PushPayload | undefined;
    await dispatchReminder("rem-1", {
      store,
      now: NOW,
      send: async (_s, p) => {
        payload = p;
        return ok;
      },
    });
    expect(payload?.title).toBe("Life Coach");
    expect(payload?.body).not.toContain("Медитация");
  });

  it("при временна грешка освобождава claim и иска retry", async () => {
    const { store, claims } = makeStore({});
    const res = await dispatchReminder("rem-1", {
      store,
      now: NOW,
      send: async () => ({ ok: false, gone: false, error: "timeout" }),
    });
    expect(res.status).toBe("retry");
    expect(claims.size).toBe(0);

    // retry-ят успява, защото claim-ът е свободен.
    const again = await dispatchReminder("rem-1", { store, now: NOW, send: async () => ok });
    expect(again.status).toBe("sent");
  });

  it("маркира изтекли устройства и не иска retry", async () => {
    const { store, log } = makeStore({});
    const res = await dispatchReminder("rem-1", {
      store,
      now: NOW,
      send: async () => ({ ok: false, gone: true, error: "410" }),
    });
    expect(res).toEqual({ status: "skipped", reason: "no_valid_devices" });
    expect(log.failure).toEqual([{ id: "s1", gone: true }]);
  });

  it("при смесен резултат е успешно, ако поне едно устройство получи", async () => {
    const { store } = makeStore({
      subs: [
        { id: "s1", endpoint: "https://push/1", p256dh: "k", auth: "a" },
        { id: "s2", endpoint: "https://push/2", p256dh: "k", auth: "a" },
      ],
    });
    const res = await dispatchReminder("rem-1", {
      store,
      now: NOW,
      send: async (s) => (s.id === "s1" ? ok : { ok: false, gone: false, error: "x" }),
    });
    expect(res).toEqual({ status: "sent", sent: 1 });
  });

  it("без устройства пропуска", async () => {
    const { store } = makeStore({ subs: [] });
    const res = await dispatchReminder("rem-1", { store, now: NOW, send: async () => ok });
    expect(res).toEqual({ status: "skipped", reason: "no_devices" });
  });
});
