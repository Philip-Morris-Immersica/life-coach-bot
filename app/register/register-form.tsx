"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterForm({ inviteRequired }: { inviteRequired: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, inviteCode }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || "Неуспешна регистрация");
        return;
      }
      router.push("/settings");
      router.refresh();
    } catch {
      setError("Няма връзка със сървъра.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto card">
      <h1 className="page-title mb-4">Регистрация</h1>
      <form onSubmit={onSubmit} className="space-y-3">
        {inviteRequired && (
          <div>
            <label className="field-label" htmlFor="reg-invite">
              Код за покана
            </label>
            <input
              id="reg-invite"
              className="input"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              autoComplete="off"
              required
            />
            <p className="muted text-xs mt-1">
              В момента приемаме хора само с покана. Поискай код от човека, който те е поканил.
            </p>
          </div>
        )}
        <div>
          <label className="field-label" htmlFor="reg-name">
            Име
          </label>
          <input
            id="reg-name"
            className="input"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="field-label" htmlFor="reg-email">
            Имейл
          </label>
          <input
            id="reg-email"
            type="email"
            className="input"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="field-label" htmlFor="reg-password">
            Парола (мин. 8)
          </label>
          <input
            id="reg-password"
            type="password"
            className="input"
            autoComplete="new-password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && (
          <p className="text-error text-sm" role="alert">
            {error}
          </p>
        )}
        <button type="submit" disabled={loading} className="btn w-full justify-center">
          {loading ? "Създавам..." : "Създай профил"}
        </button>
      </form>
      <p className="text-sm muted mt-4">
        Вече имаш профил?{" "}
        <Link href="/login" className="underline">
          Влез
        </Link>
      </p>
    </div>
  );
}
