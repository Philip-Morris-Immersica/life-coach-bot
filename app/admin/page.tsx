import Link from "next/link";
import { desc, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/session";
import { db, messagesTable, usersTable } from "@/src/db";
import AdminsForm from "./admins-form";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  await requireAdmin();

  // Базови статистики и потребители.
  const [users, [{ total }], [{ totalMessages, totalCost }]] = await Promise.all([
    db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        telegramId: usersTable.telegramId,
        isAdmin: usersTable.isAdmin,
        onboardingStage: usersTable.onboardingStage,
        createdAt: usersTable.createdAt,
        lastActiveAt: usersTable.lastActiveAt,
      })
      .from(usersTable)
      .orderBy(desc(usersTable.lastActiveAt))
      .limit(100),
    db.select({ total: sql<number>`count(*)::int` }).from(usersTable),
    db
      .select({
        totalMessages: sql<number>`count(*)::int`,
        totalCost: sql<number>`coalesce(sum(${messagesTable.costUsd}),0)`,
      })
      .from(messagesTable),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold">Админ панел</h1>
        <nav className="flex gap-2">
          <Link href="/admin/sessions" className="btn btn-ghost">
            Сесии и разходи
          </Link>
          <Link href="/admin/settings" className="btn">
            Настройки на бота
          </Link>
        </nav>
      </header>

      <section className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Stat label="Регистрирани" value={total} />
        <Stat label="Съобщения общо" value={totalMessages} />
        <Stat label="Обща цена ($)" value={Number(totalCost).toFixed(4)} />
      </section>

      <section className="card">
        <h2 className="font-semibold mb-2">Управление на админи</h2>
        <p className="muted text-xs mb-3">
          Дай или отнеми админски права по имейл (потребителят трябва вече да е
          регистриран).
        </p>
        <AdminsForm />
      </section>

      <section className="card">
        <h2 className="font-semibold mb-3">Последни потребители</h2>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-left">
              <tr className="muted">
                <th className="py-2 pr-3">Име</th>
                <th className="py-2 pr-3">Имейл</th>
                <th className="py-2 pr-3">Telegram</th>
                <th className="py-2 pr-3">Етап</th>
                <th className="py-2 pr-3">Последна активност</th>
                <th className="py-2 pr-3">Админ</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2 pr-3">{u.name || "—"}</td>
                  <td className="py-2 pr-3">{u.email || "—"}</td>
                  <td className="py-2 pr-3">
                    {u.telegramId ? String(u.telegramId) : "—"}
                  </td>
                  <td className="py-2 pr-3">{u.onboardingStage}</td>
                  <td className="py-2 pr-3">
                    {new Date(u.lastActiveAt).toLocaleString("bg-BG")}
                  </td>
                  <td className="py-2 pr-3">{u.isAdmin ? "да" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="card">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="muted text-xs">{label}</div>
    </div>
  );
}
