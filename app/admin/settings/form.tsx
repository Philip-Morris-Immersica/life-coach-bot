"use client";

import { useState } from "react";
import type { Settings } from "@/src/core/settings";

export default function SettingsForm({ initial }: { initial: Settings }) {
  const [s, setS] = useState<Settings>(initial);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function update<K extends keyof Settings>(section: K, patch: Partial<Settings[K]>) {
    setS((prev) => ({ ...prev, [section]: { ...(prev[section] as any), ...patch } }));
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(s),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setMsg({ kind: "err", text: j.error || "Грешка при запис" });
      return;
    }
    setMsg({ kind: "ok", text: "Записано." });
  }

  async function onReset() {
    if (!confirm("Връщане към стойностите по подразбиране (от код)?")) return;
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/admin/settings", { method: "DELETE" });
    setSaving(false);
    if (!res.ok) {
      setMsg({ kind: "err", text: "Грешка при ресет" });
      return;
    }
    const j = await res.json();
    setS(j.settings);
    setMsg({ kind: "ok", text: "Върнато по подразбиране." });
  }

  return (
    <form onSubmit={onSave} className="space-y-6">
      <Section title="Промпти">
        <PromptField
          label="Базов 'характер' на коуча (включва се във всички режими)"
          value={s.prompts.base}
          onChange={(v) => update("prompts", { base: v })}
        />
        <PromptField
          label="Опознавателна сесия (onboarding)"
          value={s.prompts.onboarding}
          onChange={(v) => update("prompts", { onboarding: v })}
        />
        <PromptField
          label="Дълбока сесия"
          value={s.prompts.deepSession}
          onChange={(v) => update("prompts", { deepSession: v })}
        />
        <PromptField
          label="Ежедневен чат"
          value={s.prompts.dailyChat}
          onChange={(v) => update("prompts", { dailyChat: v })}
        />
        <PromptField
          label="Извличане на профил (JSON)"
          value={s.prompts.extractProfile}
          onChange={(v) => update("prompts", { extractProfile: v })}
        />
        <PromptField
          label="Сутрешно напомняне"
          value={s.prompts.morning}
          onChange={(v) => update("prompts", { morning: v })}
        />
        <PromptField
          label="Вечерно напомняне"
          value={s.prompts.evening}
          onChange={(v) => update("prompts", { evening: v })}
        />
      </Section>

      <Section title="Модели">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Бърз модел (ежедневен чат, check-in-и)">
            <input
              className="input"
              value={s.models.fast}
              onChange={(e) => update("models", { fast: e.target.value })}
              placeholder="gpt-4o-mini"
            />
          </Field>
          <Field label="Дълбок модел (onboarding, дълбоки сесии)">
            <input
              className="input"
              value={s.models.deep}
              onChange={(e) => update("models", { deep: e.target.value })}
              placeholder="gpt-4o"
            />
          </Field>
        </div>
      </Section>

      <Section title="Температури">
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Бърз">
            <input
              type="number"
              step="0.1"
              min="0"
              max="2"
              className="input"
              value={s.temperatures.fast}
              onChange={(e) =>
                update("temperatures", { fast: Number(e.target.value) })
              }
            />
          </Field>
          <Field label="Дълбок">
            <input
              type="number"
              step="0.1"
              min="0"
              max="2"
              className="input"
              value={s.temperatures.deep}
              onChange={(e) =>
                update("temperatures", { deep: Number(e.target.value) })
              }
            />
          </Field>
          <Field label="Check-in">
            <input
              type="number"
              step="0.1"
              min="0"
              max="2"
              className="input"
              value={s.temperatures.checkin}
              onChange={(e) =>
                update("temperatures", { checkin: Number(e.target.value) })
              }
            />
          </Field>
        </div>
      </Section>

      <Section title="Проактивни напомняния">
        <div className="grid sm:grid-cols-5 gap-3">
          <Field label="Сутрин — час">
            <input
              type="number"
              min="0"
              max="23"
              className="input"
              value={s.checkin.morningHour}
              onChange={(e) =>
                update("checkin", { morningHour: Number(e.target.value) })
              }
            />
          </Field>
          <Field label="Сутрин — минута">
            <input
              type="number"
              min="0"
              max="59"
              className="input"
              value={s.checkin.morningMinute}
              onChange={(e) =>
                update("checkin", { morningMinute: Number(e.target.value) })
              }
            />
          </Field>
          <Field label="Вечер — час">
            <input
              type="number"
              min="0"
              max="23"
              className="input"
              value={s.checkin.eveningHour}
              onChange={(e) =>
                update("checkin", { eveningHour: Number(e.target.value) })
              }
            />
          </Field>
          <Field label="Вечер — минута">
            <input
              type="number"
              min="0"
              max="59"
              className="input"
              value={s.checkin.eveningMinute}
              onChange={(e) =>
                update("checkin", { eveningMinute: Number(e.target.value) })
              }
            />
          </Field>
          <Field label="Часова зона">
            <input
              className="input"
              value={s.checkin.timezone}
              onChange={(e) =>
                update("checkin", { timezone: e.target.value })
              }
              placeholder="Europe/Sofia"
            />
          </Field>
        </div>
        <p className="muted text-xs mt-2">
          След промяна на времена/timezone, рестартирай бота (Railway -&gt; Restart),
          за да се пренапише cron разписанието.
        </p>
      </Section>

      {msg && (
        <p
          className={
            msg.kind === "err" ? "text-red-400 text-sm" : "text-green-400 text-sm"
          }
        >
          {msg.text}
        </p>
      )}

      <div className="flex gap-2">
        <button type="submit" className="btn" disabled={saving}>
          {saving ? "Записвам..." : "Запази"}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={saving}
          onClick={onReset}
        >
          Върни по подразбиране
        </button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card space-y-3">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="muted text-xs uppercase tracking-wide block mb-1">{label}</span>
      {children}
    </label>
  );
}

function PromptField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label}>
      <textarea
        className="input min-h-[120px] font-mono text-xs"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}
