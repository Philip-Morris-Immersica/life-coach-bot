"use client";

import { useState } from "react";
import {
  buildReminderPayload,
  REMINDER_TARGETS,
  type ReminderTarget,
} from "@/src/notifications/content";
import { DAY_SHORT_BG, describeDays, WEEK_ORDER, type DayKey } from "@/src/notifications/time";

export type ReminderView = {
  id: string;
  time: string;
  days: string;
  reason: string;
  message: string;
  target: string;
  active: boolean;
  syncStatus: string;
  syncError: string;
};

export function toReminderView(r: any): ReminderView {
  return {
    id: String(r.id),
    time: String(r.time),
    days: String(r.days || "*"),
    reason: String(r.reason || ""),
    message: String(r.message || ""),
    target: String(r.target || "chat"),
    active: Boolean(r.active),
    syncStatus: String(r.syncStatus || "idle"),
    syncError: String(r.syncError || ""),
  };
}

type Draft = {
  id: string | null;
  time: string;
  days: Set<DayKey>;
  reason: string;
  message: string;
  target: ReminderTarget;
};

const ALL_DAYS = new Set<DayKey>(WEEK_ORDER);
const PRESETS: { label: string; days: DayKey[] }[] = [
  { label: "Всеки ден", days: [...WEEK_ORDER] },
  { label: "Делници", days: ["mon", "tue", "wed", "thu", "fri"] },
  { label: "Уикенд", days: ["sat", "sun"] },
];

function emptyDraft(): Draft {
  return {
    id: null,
    time: "08:00",
    days: new Set(ALL_DAYS),
    reason: "",
    message: "",
    target: "chat",
  };
}

function toDraft(r: ReminderView): Draft {
  const days: Set<DayKey> =
    r.days === "*" ? new Set(ALL_DAYS) : new Set(r.days.split(",").map((d) => d.trim() as DayKey));
  return {
    id: r.id,
    time: r.time,
    days,
    reason: r.reason,
    message: r.message,
    target: (REMINDER_TARGETS.some((t) => t.value === r.target) ? r.target : "chat") as ReminderTarget,
  };
}

function daysValue(days: Set<DayKey>): string {
  if (days.size === 7) return "*";
  return WEEK_ORDER.filter((d) => days.has(d)).join(",");
}

export default function RemindersManager({
  initial,
  deviceCount,
  paused,
  privacyMode,
}: {
  initial: ReminderView[];
  deviceCount: number;
  paused: boolean;
  privacyMode: boolean;
}) {
  const [items, setItems] = useState<ReminderView[]>(initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function reload() {
    const res = await fetch("/api/reminders");
    if (res.ok) setItems(((await res.json()).reminders as any[]).map(toReminderView));
  }

  async function call(url: string, init: RequestInit, key: string): Promise<boolean> {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(url, {
        ...init,
        headers: { "Content-Type": "application/json", ...(init.headers || {}) },
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || "Нещо се обърка. Опитай пак.");
        return false;
      }
      await reload();
      return true;
    } catch {
      setError("Няма връзка със сървъра.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!draft) return;
    if (draft.days.size === 0) {
      setError("Избери поне един ден.");
      return;
    }
    const body = JSON.stringify({
      time: draft.time,
      days: daysValue(draft.days),
      reason: draft.reason,
      message: draft.message,
      target: draft.target,
    });
    const ok = draft.id
      ? await call(`/api/reminders/${draft.id}`, { method: "PATCH", body }, "save")
      : await call("/api/reminders", { method: "POST", body }, "save");
    if (ok) setDraft(null);
  }

  async function toggle(r: ReminderView) {
    await call(
      `/api/reminders/${r.id}`,
      { method: "PATCH", body: JSON.stringify({ active: !r.active }) },
      r.id
    );
  }

  async function remove(r: ReminderView) {
    if (!confirm(`Да изтрия ли напомнянето в ${r.time}?`)) return;
    await call(`/api/reminders/${r.id}`, { method: "DELETE" }, r.id);
  }

  async function retry(r: ReminderView) {
    await call(`/api/reminders/${r.id}/sync`, { method: "POST", body: "{}" }, r.id);
  }

  async function sendNow(r: ReminderView) {
    setBusy(r.id);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(`/api/reminders/${r.id}/test`, { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) setError(j.error || "Неуспешно изпращане.");
      else setInfo("Изпратено. Провери известието на устройството.");
    } finally {
      setBusy(null);
    }
  }

  async function aiDraft() {
    if (!draft) return;
    setBusy("draft");
    setError(null);
    try {
      const res = await fetch("/api/reminders/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ time: draft.time, reason: draft.reason }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) setError(j.error || "Не успях да предложа текст.");
      else setDraft({ ...draft, message: String(j.message || "") });
    } finally {
      setBusy(null);
    }
  }

  function statusBadge(r: ReminderView) {
    if (!r.active) return <span className="badge">изключено</span>;
    if (r.syncStatus === "error") return <span className="badge badge-err">проблем с графика</span>;
    if (paused) return <span className="badge badge-warn">на пауза</span>;
    if (deviceCount === 0) return <span className="badge badge-warn">няма устройство</span>;
    if (r.syncStatus === "synced") return <span className="badge badge-ok">насрочено</span>;
    return <span className="badge badge-warn">чака синхронизация</span>;
  }

  const preview = draft
    ? buildReminderPayload(
        {
          id: draft.id ?? "new",
          time: draft.time,
          reason: draft.reason,
          message: draft.message,
          target: draft.target,
        },
        { privacyMode }
      )
    : null;

  return (
    <section id="reminders" className="card space-y-4 scroll-mt-4" aria-labelledby="reminders-title">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 id="reminders-title" className="section-title">
            Напомняния
          </h2>
          <p className="muted text-sm mt-1">
            Всяко напомняне е отделен график в часовата ти зона. Текстът е готов шаблон — без
            забавяне и без разход в часа на изпращане.
          </p>
        </div>
        {!draft && (
          <button className="btn" onClick={() => setDraft(emptyDraft())}>
            Ново напомняне
          </button>
        )}
      </div>

      {error && (
        <p className="notice notice-err text-sm" role="alert">
          {error}
        </p>
      )}

      {info && (
        <p className="text-success text-sm" role="status">
          {info}
        </p>
      )}

      {draft && (
        <div className="card-soft space-y-4" aria-label="Редакция на напомняне">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="field-label" htmlFor="rem-time">
                Час
              </label>
              <input
                id="rem-time"
                type="time"
                className="input"
                value={draft.time}
                onChange={(e) => setDraft({ ...draft, time: e.target.value })}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="rem-target">
                Какво да отвори
              </label>
              <select
                id="rem-target"
                className="select"
                value={draft.target}
                onChange={(e) => setDraft({ ...draft, target: e.target.value as ReminderTarget })}
              >
                {REMINDER_TARGETS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <span className="field-label">Дни</span>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Дни от седмицата">
              {WEEK_ORDER.map((d) => (
                <button
                  key={d}
                  type="button"
                  className="chip"
                  aria-pressed={draft.days.has(d)}
                  onClick={() => {
                    const next = new Set(draft.days);
                    if (next.has(d)) next.delete(d);
                    else next.add(d);
                    setDraft({ ...draft, days: next });
                  }}
                >
                  {DAY_SHORT_BG[d]}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setDraft({ ...draft, days: new Set(p.days) })}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="field-label" htmlFor="rem-reason">
              Заглавие
            </label>
            <input
              id="rem-reason"
              className="input"
              maxLength={200}
              placeholder="напр. Сутрешна медитация"
              value={draft.reason}
              onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
            />
          </div>

          <div>
            <div className="flex items-center justify-between gap-2">
              <label className="field-label" htmlFor="rem-message">
                Текст на известието (по желание)
              </label>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={aiDraft}
                disabled={busy !== null}
              >
                {busy === "draft" ? "Мисля…" : "Предложи текст"}
              </button>
            </div>
            <textarea
              id="rem-message"
              className="textarea"
              rows={2}
              maxLength={240}
              placeholder="Ако е празно, ползвам кратък шаблон според часа."
              value={draft.message}
              onChange={(e) => setDraft({ ...draft, message: e.target.value })}
            />
          </div>

          {preview && (
            <div aria-label="Преглед на известието">
              <span className="field-label">Преглед</span>
              <div className="card" style={{ padding: "0.75rem 1rem" }}>
                <div className="font-semibold text-sm">{preview.title}</div>
                <div className="text-sm">{preview.body}</div>
                <div className="muted text-xs mt-1">
                  Отваря: {preview.url}
                  {privacyMode ? " · режим „Поверителност“ е включен" : ""}
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
            <button className="btn" onClick={save} disabled={busy !== null}>
              {busy === "save" ? "Запазвам…" : draft.id ? "Запази промените" : "Създай напомняне"}
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                setDraft(null);
                setError(null);
              }}
            >
              Отказ
            </button>
          </div>
        </div>
      )}

      {items.length === 0 && !draft ? (
        <p className="muted text-sm">
          Още нямаш напомняния. Създай първото или кажи на коуча в чата кога да ти пише.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((r) => (
            <li key={r.id} className="card-soft space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-xl font-semibold tabular-nums">{r.time}</span>
                    <span className="font-medium text-sm truncate">
                      {r.reason || "Напомняне"}
                    </span>
                  </div>
                  <div className="muted text-xs">
                    {describeDays(r.days)} ·{" "}
                    {REMINDER_TARGETS.find((t) => t.value === r.target)?.label ?? "Чат с коуча"}
                  </div>
                </div>
                <button
                  type="button"
                  className="switch"
                  role="switch"
                  aria-checked={r.active}
                  aria-label={r.active ? "Изключи напомнянето" : "Включи напомнянето"}
                  onClick={() => toggle(r)}
                  disabled={busy === r.id}
                />
              </div>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  {statusBadge(r)}
                  {r.syncStatus === "error" && r.syncError && (
                    <span className="muted text-xs">{r.syncError}</span>
                  )}
                </div>
                <div className="flex gap-2">
                  {r.syncStatus === "error" && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => retry(r)}
                      disabled={busy === r.id}
                    >
                      Опитай пак
                    </button>
                  )}
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => sendNow(r)}
                    disabled={busy === r.id || deviceCount === 0}
                    title={deviceCount === 0 ? "Първо включи известията на устройство" : undefined}
                  >
                    Изпрати сега
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setDraft(toDraft(r))}>
                    Редактирай
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => remove(r)}
                    disabled={busy === r.id}
                  >
                    Изтрий
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
