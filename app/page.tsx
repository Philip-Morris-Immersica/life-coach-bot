import type { ReactElement } from "react";
import Link from "next/link";
import { readSession } from "@/lib/auth";
import { requireSession } from "@/lib/session";
import { getDashboardData } from "@/lib/dashboard";
import { describeDays, nextOccurrence } from "@/src/notifications/time";
import HabitCheckins from "./habit-checkins";

export const dynamic = "force-dynamic";

const daysLabel = describeDays;

function whenLabel(daysAhead: number, time: string): string {
  if (daysAhead === 0) return `днес в ${time}`;
  if (daysAhead === 1) return `утре в ${time}`;
  return `след ${daysAhead} дни в ${time}`;
}

export default async function HomePage() {
  const session = await readSession();
  if (!session) {
    return (
      <div className="space-y-6">
        <section className="card">
          <h1 className="page-title mb-2">Личен AI коуч</h1>
          <p className="muted mb-4">
            За навици, вярвания и идентичност. Помни какво е важно за теб, говори с теб в
            браузъра и ти пише с напомняния на телефона или компютъра — като приложение, без
            да инсталираш нищо от магазин.
          </p>
          <div className="flex gap-2">
            <Link href="/register" className="btn">
              Започни
            </Link>
            <Link href="/login" className="btn btn-ghost">
              Вход
            </Link>
          </div>
        </section>
      </div>
    );
  }

  await requireSession();
  const data = await getDashboardData(session.userId);
  const { profile, habits, reminders, sessions, insights, stats, user, deviceCount, todayStatus } =
    data;
  const next = nextOccurrence(reminders, user?.timezone || "Europe/Sofia");
  const onboardingDone = user?.onboardingStage === "done";

  const buildHabits = habits.filter((h) => h.kind !== "limiting");
  const limitingHabits = habits.filter((h) => h.kind === "limiting");
  const focus = profile?.focus || "";

  // Адаптивна подредба: каквото е фокусът на човека, изпъква първо.
  const identityCard = (
    <div className="card" key="identity">
      <h2 className="font-semibold mb-2">Идентичност и цели</h2>
      {profile && (profile.identityTarget || profile.goals || profile.vision) ? (
        <dl className="space-y-2 text-sm">
          {profile.identityTarget && (
            <Field label="Целева идентичност" value={profile.identityTarget} />
          )}
          {profile.vision && <Field label="Визия" value={profile.vision} />}
          {profile.identityCurrent && (
            <Field label="Текуща идентичност" value={profile.identityCurrent} />
          )}
          {profile.goals && <Field label="Цели" value={profile.goals} />}
          {profile.problems && (
            <Field label="Проблеми/съпротиви" value={profile.problems} />
          )}
        </dl>
      ) : (
        <p className="muted text-sm">
          Все още нямаме структуриран профил. Поговори с коуча в чата.
        </p>
      )}
    </div>
  );

  const beliefsCard = (
    <div className="card" key="beliefs">
      <h2 className="font-semibold mb-2">Вярвания</h2>
      {profile && (profile.beliefsNew || profile.beliefsLimiting) ? (
        <dl className="space-y-2 text-sm">
          {profile.beliefsNew && (
            <Field label="Нови вярвания" value={profile.beliefsNew} />
          )}
          {profile.beliefsLimiting && (
            <Field label="Ограничаващи вярвания" value={profile.beliefsLimiting} />
          )}
        </dl>
      ) : (
        <p className="muted text-sm">Още не сме работили върху вярвания.</p>
      )}
    </div>
  );

  const habitsCard = (
    <div className="card" key="habits">
      <h2 className="font-semibold mb-2">Навици</h2>
      {buildHabits.length ? (
        <ul className="space-y-2 text-sm">
          {buildHabits.map((h) => (
            <li key={h.id} className="flex flex-col">
              <span className="font-medium">{h.name}</span>
              <span className="muted text-xs">
                {h.cadence}
                {h.identityLink ? ` · ${h.identityLink}` : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted text-sm">Все още няма активни навици.</p>
      )}
      {limitingHabits.length > 0 && (
        <div className="mt-3 pt-3 border-t" style={{ borderColor: "var(--border)" }}>
          <h3 className="muted text-xs uppercase tracking-wide mb-1">
            Ограничаващи навици
          </h3>
          <ul className="space-y-1 text-sm">
            {limitingHabits.map((h) => (
              <li key={h.id}>
                {h.name}
                {h.trigger ? (
                  <span className="muted text-xs"> · тригер: {h.trigger}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );

  const cardsByFocus: Record<string, ReactElement[]> = {
    habits: [habitsCard, identityCard, beliefsCard],
    goals: [identityCard, habitsCard, beliefsCard],
    identity: [identityCard, beliefsCard, habitsCard],
    beliefs: [beliefsCard, identityCard, habitsCard],
  };
  const orderedCards = cardsByFocus[focus] || [identityCard, habitsCard, beliefsCard];

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">
            Здравей{session.name ? `, ${session.name}` : ""}
          </h1>
          <p className="muted text-sm">
            {onboardingDone
              ? "Ето накъде сме се запътили заедно."
              : "Поговори с коуча, за да оформим посоката."}
            {focus ? ` Фокус: ${focus}.` : ""}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link href="/chat" className="btn">
            Започни разговор
          </Link>
          <Link href="/chat?short=1" className="btn btn-ghost">
            Кратка сесия
          </Link>
          <Link href="/chat?deep=1" className="btn btn-ghost">
            Дълбока сесия
          </Link>
        </div>
      </section>

      <section className="card-accent space-y-4" aria-labelledby="today-title">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 id="today-title" className="section-title">
              Днес
            </h2>
            <p className="text-sm muted">
              {next
                ? `Следващо напомняне: ${whenLabel(next.daysAhead, next.time)}${
                    next.reminder.reason ? ` — ${next.reminder.reason}` : ""
                  }`
                : "Няма насрочени напомняния."}
            </p>
          </div>
          <Link href="/chat?checkin=1" className="btn btn-sm">
            Вечерен check-in
          </Link>
        </div>

        {deviceCount === 0 && (
          <div className="notice text-sm flex items-center justify-between gap-3 flex-wrap">
            <span>Включи известията, за да получаваш напомняния на това устройство.</span>
            <Link href="/settings" className="btn btn-sm">
              Включи
            </Link>
          </div>
        )}

        <div>
          <h3 className="muted text-xs uppercase tracking-wide mb-2">Навици днес</h3>
          <HabitCheckins
            habits={buildHabits.slice(0, 8).map((h) => ({ id: h.id, name: h.name }))}
            initial={todayStatus}
          />
        </div>
      </section>

      {onboardingDone && (
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Съобщения" value={stats.totalMessages} />
          <Stat label="Последни 7 дни" value={stats.last7DaysMessages} />
          <Stat label="Дни с дълбоки сесии" value={stats.deepSessions} />
          <Stat label="Прозрения" value={stats.insightCount} />
        </section>
      )}

      <section className="grid md:grid-cols-3 gap-4">{orderedCards}</section>

      <section className="grid md:grid-cols-2 gap-4">
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold">Напомняния</h2>
            <Link href="/settings#reminders" className="btn btn-ghost btn-sm">
              Управлявай
            </Link>
          </div>
          {reminders.length ? (
            <ul className="space-y-2 text-sm">
              {reminders.map((r) => (
                <li key={r.id} className="flex justify-between gap-2">
                  <span className="font-medium">{r.time}</span>
                  <span className="muted text-right">
                    {r.reason || "напомняне"} · {daysLabel(r.days)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted text-sm">
              Няма настроени напомняния. Кажи на коуча кога и за какво да ти пише.
            </p>
          )}
        </div>

        <div className="card">
          <h2 className="font-semibold mb-2">Последни сесии</h2>
          {sessions.length ? (
            <ul className="space-y-2 text-sm">
              {sessions.map((s) => (
                <li key={s.id}>
                  <Link href={`/chat?session=${s.id}`} className="hover:opacity-80">
                    <span className="font-medium">{s.title || "Сесия"}</span>
                    <span className="muted text-xs">
                      {" "}
                      · {new Date(s.startedAt).toLocaleDateString("bg-BG")}
                      {s.status === "active" ? " · активна" : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted text-sm">Все още няма сесии.</p>
          )}
        </div>
      </section>

      <section className="card">
        <h2 className="font-semibold mb-2">Последни прозрения</h2>
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
                  {new Date(i.createdAt).toLocaleDateString("bg-BG")}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted text-sm">
            Прозренията се записват автоматично след дълбоки сесии.
          </p>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="muted text-xs">{label}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="muted text-xs uppercase tracking-wide">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
