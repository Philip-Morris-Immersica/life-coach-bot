"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || "Неуспешен вход");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Няма връзка със сървъра.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto card">
      <h1 className="page-title mb-4">Вход</h1>
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <label className="field-label" htmlFor="login-email">
            Имейл
          </label>
          <input
            id="login-email"
            type="email"
            className="input"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="field-label" htmlFor="login-password">
            Парола
          </label>
          <input
            id="login-password"
            type="password"
            className="input"
            autoComplete="current-password"
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
          {loading ? "Влизам..." : "Влез"}
        </button>
      </form>
      <p className="text-sm muted mt-4">
        Нямаш профил?{" "}
        <Link href="/register" className="underline">
          Регистрирай се
        </Link>
      </p>
    </div>
  );
}
