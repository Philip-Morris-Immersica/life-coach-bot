"use client";

import { useEffect, useState } from "react";

export type Prefs = {
  timezone: string;
  notificationsPaused: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  privacyMode: boolean;
};

export default function PreferencesForm({
  initial,
  onChange,
}: {
  initial: Prefs;
  onChange?: (p: Prefs) => void;
}) {
  const [prefs, setPrefs] = useState<Prefs>(initial);
  const [tz, setTz] = useState(initial.timezone);
  const [quiet, setQuiet] = useState({
    start: initial.quietHoursStart || "22:00",
    end: initial.quietHoursEnd || "07:00",
  });
  const [zones, setZones] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const quietOn = Boolean(prefs.quietHoursStart && prefs.quietHoursEnd);

  useEffect(() => {
    try {
      setZones((Intl as any).supportedValuesOf?.("timeZone") ?? []);
    } catch {
      setZones([]);
    }
  }, []);

  async function patch(body: Partial<Prefs>, okText = "Запазено.") {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/notifications/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ kind: "err", text: j.error || "Неуспешно запазване." });
        return;
      }
      setPrefs(j.prefs);
      onChange?.(j.prefs);
      setMsg({ kind: "ok", text: okText });
    } catch {
      setMsg({ kind: "err", text: "Няма връзка със сървъра." });
    } finally {
      setBusy(false);
    }
  }

  function detectTimezone() {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (detected) setTz(detected);
  }

  return (
    <section className="card space-y-5" aria-labelledby="prefs-title">
      <div>
        <h2 id="prefs-title" className="section-title">
          Общи настройки
        </h2>
        <p className="muted text-sm mt-1">Важат за всички напомняния.</p>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="font-medium text-sm">Пауза на всички известия</div>
          <div className="muted text-xs">
            Напомнянията се запазват, но не се изпращат, докато не я изключиш.
          </div>
        </div>
        <button
          type="button"
          className="switch"
          role="switch"
          aria-checked={prefs.notificationsPaused}
          aria-label="Пауза на всички известия"
          disabled={busy}
          onClick={() => patch({ notificationsPaused: !prefs.notificationsPaused })}
        />
      </div>

      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="font-medium text-sm">Режим „Поверителност“</div>
          <div className="muted text-xs">
            Известията не показват текста си на заключения екран — само „Имаш напомняне“.
          </div>
        </div>
        <button
          type="button"
          className="switch"
          role="switch"
          aria-checked={prefs.privacyMode}
          aria-label="Режим Поверителност"
          disabled={busy}
          onClick={() => patch({ privacyMode: !prefs.privacyMode })}
        />
      </div>

      <div>
        <label className="field-label" htmlFor="pref-tz">
          Часова зона
        </label>
        <div className="flex gap-2 flex-wrap">
          <input
            id="pref-tz"
            className="input"
            style={{ flex: "1 1 14rem", width: "auto" }}
            list="tz-list"
            value={tz}
            onChange={(e) => setTz(e.target.value)}
            placeholder="Europe/Sofia"
          />
          <datalist id="tz-list">
            {zones.map((z) => (
              <option key={z} value={z} />
            ))}
          </datalist>
          <button type="button" className="btn btn-ghost" onClick={detectTimezone}>
            Открий автоматично
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy || tz === prefs.timezone}
            onClick={() => patch({ timezone: tz }, "Часовата зона е сменена, графиците са обновени.")}
          >
            Запази
          </button>
        </div>
        <p className="muted text-xs mt-1">
          Часовете на напомнянията се четат в тази зона и следват лятното часово време.
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="font-medium text-sm">Тихи часове</div>
            <div className="muted text-xs">
              В този интервал известията не се изпращат (може да е през полунощ).
            </div>
          </div>
          <button
            type="button"
            className="switch"
            role="switch"
            aria-checked={quietOn}
            aria-label="Тихи часове"
            disabled={busy}
            onClick={() =>
              quietOn
                ? patch({ quietHoursStart: "", quietHoursEnd: "" })
                : patch({ quietHoursStart: quiet.start, quietHoursEnd: quiet.end })
            }
          />
        </div>
        {quietOn && (
          <div className="flex gap-3 items-end flex-wrap">
            <div>
              <label className="field-label" htmlFor="quiet-start">
                От
              </label>
              <input
                id="quiet-start"
                type="time"
                className="input"
                value={quiet.start}
                onChange={(e) => setQuiet({ ...quiet, start: e.target.value })}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="quiet-end">
                До
              </label>
              <input
                id="quiet-end"
                type="time"
                className="input"
                value={quiet.end}
                onChange={(e) => setQuiet({ ...quiet, end: e.target.value })}
              />
            </div>
            <button
              type="button"
              className="btn"
              disabled={
                busy ||
                !quiet.start ||
                !quiet.end ||
                (quiet.start === prefs.quietHoursStart && quiet.end === prefs.quietHoursEnd)
              }
              onClick={() =>
                patch({ quietHoursStart: quiet.start, quietHoursEnd: quiet.end })
              }
            >
              Запази
            </button>
          </div>
        )}
      </div>

      {msg && (
        <p className={msg.kind === "err" ? "text-error text-sm" : "text-success text-sm"} role="status">
          {msg.text}
        </p>
      )}
    </section>
  );
}
