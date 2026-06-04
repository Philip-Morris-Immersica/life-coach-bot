import Link from "next/link";
import { desc, eq, isNotNull, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/session";
import { db, messagesTable, sessionsTable, usersTable } from "@/src/db";

export const dynamic = "force-dynamic";

function money(n: number): string {
  return `$${n.toFixed(4)}`;
}

export default async function AdminSessions() {
  await requireAdmin();

  const [sessionRows, aggRows, [totals]] = await Promise.all([
    db
      .select({
        session: sessionsTable,
        userName: usersTable.name,
        userEmail: usersTable.email,
        telegramId: usersTable.telegramId,
      })
      .from(sessionsTable)
      .innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id))
      .orderBy(desc(sessionsTable.startedAt))
      .limit(100),
    db
      .select({
        sessionId: messagesTable.sessionId,
        replies: sql<number>`count(*)::int`,
        cost: sql<number>`coalesce(sum(${messagesTable.costUsd}),0)`,
      })
      .from(messagesTable)
      .where(isNotNull(messagesTable.sessionId))
      .groupBy(messagesTable.sessionId),
    db
      .select({
        totalCost: sql<number>`coalesce(sum(${messagesTable.costUsd}),0)`,
        totalMessages: sql<number>`count(*)::int`,
      })
      .from(messagesTable),
  ]);

  const aggMap = new Map<string, { replies: number; cost: number }>();
  for (const a of aggRows) {
    if (a.sessionId) aggMap.set(a.sessionId, { replies: a.replies, cost: Number(a.cost) });
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold">Сесии</h1>
        <nav className="flex gap-2">
          <Link href="/admin" className="btn btn-ghost">
            Назад
          </Link>
        </nav>
      </header>

      <section className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Stat label="Общо съобщения" value={String(totals?.totalMessages ?? 0)} />
        <Stat label="Обща цена" value={money(Number(totals?.totalCost ?? 0))} />
        <Stat label="Показани сесии" value={String(sessionRows.length)} />
      </section>

      <section className="card">
        <h2 className="font-semibold mb-3">Всички сесии</h2>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-left">
              <tr className="muted">
                <th className="py-2 pr-3">Потребител</th>
                <th className="py-2 pr-3">Тип</th>
                <th className="py-2 pr-3">Заглавие</th>
                <th className="py-2 pr-3">Дата</th>
                <th className="py-2 pr-3">Реплики</th>
                <th className="py-2 pr-3">Цена</th>
                <th className="py-2 pr-3">Статус</th>
              </tr>
            </thead>
            <tbody>
              {sessionRows.map((r) => {
                const agg = aggMap.get(r.session.id) || { replies: 0, cost: 0 };
                return (
                  <tr
                    key={r.session.id}
                    className="border-t"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <td className="py-2 pr-3">
                      {r.userName || r.userEmail || (r.telegramId ? `tg:${r.telegramId}` : "—")}
                    </td>
                    <td className="py-2 pr-3">
                      {r.session.type === "onboarding" ? "опознаване" : "дълбока"}
                    </td>
                    <td className="py-2 pr-3">{r.session.title || "—"}</td>
                    <td className="py-2 pr-3">
                      {new Date(r.session.startedAt).toLocaleString("bg-BG")}
                    </td>
                    <td className="py-2 pr-3">{agg.replies}</td>
                    <td className="py-2 pr-3">{money(agg.cost)}</td>
                    <td className="py-2 pr-3">{r.session.status}</td>
                  </tr>
                );
              })}
              {sessionRows.length === 0 && (
                <tr>
                  <td className="py-3 muted" colSpan={7}>
                    Все още няма сесии.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="muted text-xs">{label}</div>
    </div>
  );
}
