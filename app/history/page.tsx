import Link from "next/link";
import { and, desc, eq, isNull } from "drizzle-orm";
import { requireSession } from "@/lib/session";
import { db, insightsTable, messagesTable } from "@/src/db";
import { getUserSessions } from "@/src/memory";

export const dynamic = "force-dynamic";

type Row = typeof messagesTable.$inferSelect;

type Group = {
  dayKey: string;
  dayLabel: string;
  items: Row[];
};

function groupByDay(rows: Row[]): Group[] {
  const map = new Map<string, Group>();
  for (const r of rows) {
    const d = new Date(r.createdAt);
    const dayKey = d.toISOString().slice(0, 10);
    if (!map.has(dayKey)) {
      map.set(dayKey, {
        dayKey,
        dayLabel: d.toLocaleDateString("bg-BG", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        }),
        items: [],
      });
    }
    map.get(dayKey)!.items.push(r);
  }
  for (const g of map.values()) {
    g.items.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
  return Array.from(map.values()).sort((a, b) => (a.dayKey > b.dayKey ? -1 : 1));
}

function sessionTypeLabel(type: string): string {
  return type === "onboarding" ? "опознаване" : "дълбока сесия";
}

export default async function HistoryPage() {
  const session = await requireSession();
  const [sessions, dailyMsgs, insights] = await Promise.all([
    getUserSessions(session.userId),
    db
      .select()
      .from(messagesTable)
      .where(
        and(
          eq(messagesTable.userId, session.userId),
          isNull(messagesTable.sessionId)
        )
      )
      .orderBy(desc(messagesTable.createdAt))
      .limit(400),
    db
      .select()
      .from(insightsTable)
      .where(eq(insightsTable.userId, session.userId))
      .orderBy(desc(insightsTable.createdAt)),
  ]);

  const groups = groupByDay(dailyMsgs);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">История</h1>

      <section className="space-y-3">
        <h2 className="font-semibold">Сесии</h2>
        {sessions.length === 0 && (
          <p className="muted text-sm">Все още няма записани сесии.</p>
        )}
        <div className="grid sm:grid-cols-2 gap-3">
          {sessions.map((s) => (
            <Link
              key={s.id}
              href={`/chat?session=${s.id}`}
              className="card hover:opacity-90 block"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{s.title || "Сесия"}</span>
                <span className="muted text-xs">{sessionTypeLabel(s.type)}</span>
              </div>
              <p className="muted text-xs mt-1">
                {new Date(s.startedAt).toLocaleString("bg-BG")}
                {s.status === "active" ? " · активна" : ""}
                {s.focus ? ` · фокус: ${s.focus}` : ""}
              </p>
              {s.summary && <p className="text-sm mt-2">{s.summary}</p>}
            </Link>
          ))}
        </div>
      </section>

      <section className="card">
        <h2 className="font-semibold mb-2">Прозрения от дълбоки сесии</h2>
        {insights.length ? (
          <ul className="space-y-3 text-sm">
            {insights.map((i) => (
              <li
                key={i.id}
                className="border-l-2 pl-3"
                style={{ borderColor: "var(--accent)" }}
              >
                <p>{i.content}</p>
                <p className="muted text-xs">
                  {new Date(i.createdAt).toLocaleString("bg-BG")}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted text-sm">Все още няма записани прозрения.</p>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="font-semibold">Ежедневен чат по дни</h2>
        {groups.length === 0 && (
          <p className="muted text-sm">Все още няма разговори.</p>
        )}
        {groups.map((g) => (
          <div key={g.dayKey} className="card">
            <h3 className="font-medium mb-3 capitalize">{g.dayLabel}</h3>
            <ul className="space-y-2 text-sm">
              {g.items.map((m) => (
                <li
                  key={m.id}
                  className={
                    m.role === "user" ? "flex justify-end" : "flex justify-start"
                  }
                >
                  <div
                    className={`max-w-[80%] rounded-xl px-3 py-2 whitespace-pre-wrap ${m.role === "user" ? "bg-green-700/30" : "border"}`}
                    style={
                      m.role === "user"
                        ? undefined
                        : { borderColor: "var(--border)" }
                    }
                  >
                    <div className="muted text-xs mb-1">
                      {kindLabel(m.kind)} ·{" "}
                      {new Date(m.createdAt).toLocaleTimeString("bg-BG", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                    {m.content}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}

function kindLabel(kind: string): string {
  switch (kind) {
    case "deep":
      return "дълбока сесия";
    case "onboarding":
      return "опознаване";
    case "checkin":
      return "напомняне";
    default:
      return "разговор";
  }
}
