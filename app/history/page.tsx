import { desc, eq } from "drizzle-orm";
import { requireSession } from "@/lib/session";
import { db, insightsTable, messagesTable } from "@/src/db";

export const dynamic = "force-dynamic";

type Group = {
  dayKey: string;
  dayLabel: string;
  items: { id: string; role: string; content: string; kind: string; createdAt: Date }[];
};

function groupByDay(
  rows: (typeof messagesTable.$inferSelect)[]
): Group[] {
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
    map.get(dayKey)!.items.push({
      id: r.id,
      role: r.role,
      content: r.content,
      kind: r.kind,
      createdAt: r.createdAt,
    });
  }
  // Подреждаме всеки ден хронологично, а групите низходящо.
  for (const g of map.values()) {
    g.items.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
  return Array.from(map.values()).sort((a, b) => (a.dayKey > b.dayKey ? -1 : 1));
}

export default async function HistoryPage() {
  const session = await requireSession();
  const [msgs, insights] = await Promise.all([
    db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.userId, session.userId))
      .orderBy(desc(messagesTable.createdAt))
      .limit(500),
    db
      .select()
      .from(insightsTable)
      .where(eq(insightsTable.userId, session.userId))
      .orderBy(desc(insightsTable.createdAt)),
  ]);

  const groups = groupByDay(msgs);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">История</h1>

      <section className="card">
        <h2 className="font-semibold mb-2">Прозрения от дълбоки сесии</h2>
        {insights.length ? (
          <ul className="space-y-3 text-sm">
            {insights.map((i) => (
              <li key={i.id} className="border-l-2 pl-3" style={{ borderColor: "var(--accent)" }}>
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
        <h2 className="font-semibold">Разговори по дни</h2>
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
                    m.role === "user"
                      ? "flex justify-end"
                      : "flex justify-start"
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
