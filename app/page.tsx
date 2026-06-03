import Link from "next/link";
import { readSession } from "@/lib/auth";
import { requireSession } from "@/lib/session";
import { getDashboardData } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  // Ако не е логнат — кратко landing вместо да го пращаме директно на /login.
  const session = await readSession();
  if (!session) {
    return (
      <div className="space-y-6">
        <section className="card">
          <h1 className="text-3xl font-semibold mb-2">Личен AI коуч</h1>
          <p className="muted mb-4">
            За навици, вярвания и идентичност. Помни всичко, говори с теб в Telegram
            и тук в браузъра, дърпа те към човека, който искаш да станеш.
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
  const { profile, habits, insights, stats, user } = data;
  const onboardingDone = user?.onboardingStage === "done";

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            Здравей{session.name ? `, ${session.name}` : ""}
          </h1>
          <p className="muted text-sm">
            {onboardingDone
              ? "Ето накъде сме се запътили заедно."
              : "Започни опознавателната сесия, за да поставим цели."}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/chat" className="btn">
            {onboardingDone ? "Започни разговор" : "Започни опознаването"}
          </Link>
          {onboardingDone && (
            <Link href="/chat?deep=1" className="btn btn-ghost">
              Дълбока сесия
            </Link>
          )}
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

      <section className="grid md:grid-cols-2 gap-4">
        <div className="card">
          <h2 className="font-semibold mb-2">Идентичност и цели</h2>
          {profile && (profile.identityTarget || profile.goals) ? (
            <dl className="space-y-2 text-sm">
              {profile.identityTarget && (
                <Field label="Целева идентичност" value={profile.identityTarget} />
              )}
              {profile.identityCurrent && (
                <Field label="Текуща идентичност" value={profile.identityCurrent} />
              )}
              {profile.beliefsNew && (
                <Field label="Нови вярвания" value={profile.beliefsNew} />
              )}
              {profile.beliefsLimiting && (
                <Field
                  label="Ограничаващи вярвания"
                  value={profile.beliefsLimiting}
                />
              )}
              {profile.goals && <Field label="Цели" value={profile.goals} />}
              {profile.problems && (
                <Field label="Проблеми/съпротиви" value={profile.problems} />
              )}
            </dl>
          ) : (
            <p className="muted text-sm">
              Все още нямаме структуриран профил. Завърши опознавателната сесия
              в чата.
            </p>
          )}
        </div>

        <div className="card">
          <h2 className="font-semibold mb-2">Навици</h2>
          {habits.length ? (
            <ul className="space-y-2 text-sm">
              {habits.map((h) => (
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
        </div>
      </section>

      <section className="card">
        <h2 className="font-semibold mb-2">Последни прозрения</h2>
        {insights.length ? (
          <ul className="space-y-3 text-sm">
            {insights.map((i) => (
              <li key={i.id} className="border-l-2 pl-3" style={{ borderColor: "var(--accent)" }}>
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
