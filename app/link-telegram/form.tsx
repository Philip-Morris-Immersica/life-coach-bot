"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LinkTelegramForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ kind: "err" | "ok"; text: string } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    const res = await fetch("/api/telegram/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code.trim().toUpperCase() }),
    });
    setLoading(false);
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg({ kind: "err", text: j.error || "Неуспешно свързване" });
      return;
    }
    setMsg({ kind: "ok", text: "Готово — акаунтите са свързани." });
    setCode("");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-3">
      <input
        className="input"
        placeholder="Код от бота (напр. K4P7QXM2)"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        maxLength={16}
        required
      />
      {msg && (
        <p className={msg.kind === "err" ? "text-red-400 text-sm" : "text-green-400 text-sm"}>
          {msg.text}
        </p>
      )}
      <button disabled={loading} className="btn">
        {loading ? "Свързвам..." : "Свържи"}
      </button>
    </form>
  );
}
