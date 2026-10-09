"use client";

import { useState } from "react";

type Status = "done" | "partial" | "missed";

const OPTIONS: { value: Status; label: string }[] = [
  { value: "done", label: "Да" },
  { value: "partial", label: "Част" },
  { value: "missed", label: "Не" },
];

// Бързо отчитане на навиците за днес, без да се отваря чатът.
export default function HabitCheckins({
  habits,
  initial,
}: {
  habits: { id: string; name: string }[];
  initial: Record<string, Status>;
}) {
  const [status, setStatus] = useState<Record<string, Status>>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function mark(habitId: string, value: Status) {
    setBusy(habitId);
    setError(null);
    try {
      const res = await fetch("/api/checkins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ habitId, status: value }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || "Неуспешно записване.");
        return;
      }
      setStatus((s) => ({ ...s, [habitId]: value }));
    } catch {
      setError("Няма връзка със сървъра.");
    } finally {
      setBusy(null);
    }
  }

  if (!habits.length) {
    return (
      <p className="muted text-sm">
        Още няма активни навици. Кажи на коуча кой навик искаш да изградиш.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {habits.map((h) => (
          <li key={h.id} className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-sm font-medium min-w-0">{h.name}</span>
            <div className="flex gap-1.5" role="group" aria-label={`Днес: ${h.name}`}>
              {OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className="chip"
                  aria-pressed={status[h.id] === o.value}
                  disabled={busy === h.id}
                  onClick={() => mark(h.id, o.value)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      {error && <p className="text-error text-sm">{error}</p>}
    </div>
  );
}
