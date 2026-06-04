"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminsForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null
  );

  async function submit(makeAdmin: boolean) {
    const e = email.trim();
    if (!e) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/admin/admins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: e, makeAdmin }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg({ kind: "err", text: j.error || "Грешка" });
      return;
    }
    setMsg({
      kind: "ok",
      text: makeAdmin ? "Дадени са админ права." : "Отнети са админ права.",
    });
    setEmail("");
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2 flex-wrap">
        <input
          className="input flex-1 min-w-[200px]"
          placeholder="имейл на потребител"
          value={email}
          onChange={(ev) => setEmail(ev.target.value)}
          disabled={busy}
        />
        <button
          className="btn"
          disabled={busy || !email.trim()}
          onClick={() => submit(true)}
        >
          Направи админ
        </button>
        <button
          className="btn btn-ghost"
          disabled={busy || !email.trim()}
          onClick={() => submit(false)}
        >
          Премахни админ
        </button>
      </div>
      {msg && (
        <p
          className={
            msg.kind === "err" ? "text-red-400 text-sm" : "text-green-400 text-sm"
          }
        >
          {msg.text}
        </p>
      )}
    </div>
  );
}
