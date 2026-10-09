// Чисти помощници за време, часови зони и дни — без зависимости от DB/Next,
// за да се тестват лесно и да се ползват и от сайта, и от Telegram бота.

export const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type DayKey = (typeof DAY_KEYS)[number];

export const DAY_LABELS_BG: Record<DayKey, string> = {
  mon: "понеделник",
  tue: "вторник",
  wed: "сряда",
  thu: "четвъртък",
  fri: "петък",
  sat: "събота",
  sun: "неделя",
};

export const DAY_SHORT_BG: Record<DayKey, string> = {
  mon: "пн",
  tue: "вт",
  wed: "ср",
  thu: "чт",
  fri: "пт",
  sat: "сб",
  sun: "нд",
};

// Подредба Пн..Нд за показване.
export const WEEK_ORDER: DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export function isValidTimezone(tz: string): boolean {
  if (!tz || typeof tz !== "string") return false;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// "6:5", "06:05", "6:05" -> "06:05"; невалидно -> null.
export function normalizeTime(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(input);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

// "*" или "mon, WED,fri" -> "*" | "mon,wed,fri" (подредено Пн..Нд, без дубли).
// Празно -> "*". Невалидно -> null.
export function normalizeDays(input: unknown): string | null {
  if (input === undefined || input === null) return "*";
  if (Array.isArray(input)) input = input.join(",");
  if (typeof input !== "string") return null;
  const trimmed = input.trim().toLowerCase();
  if (trimmed === "" || trimmed === "*") return "*";
  const parts = trimmed.split(",").map((s) => s.trim());
  const set = new Set<DayKey>();
  for (const p of parts) {
    if (!(DAY_KEYS as readonly string[]).includes(p)) return null;
    set.add(p as DayKey);
  }
  if (set.size === 7) return "*";
  return WEEK_ORDER.filter((d) => set.has(d)).join(",");
}

export function describeDays(days: string): string {
  if (!days || days === "*") return "всеки ден";
  return days
    .split(",")
    .map((d) => DAY_SHORT_BG[d.trim() as DayKey] || d.trim())
    .join(", ");
}

export type LocalParts = { hhmm: string; day: DayKey; date: string };

// Локалните час:минута, ден от седмицата и дата (YYYY-MM-DD) в дадена зона.
export function localParts(timezone: string, now: Date = new Date()): LocalParts {
  const tz = isValidTimezone(timezone) ? timezone : "Europe/Sofia";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const hour = get("hour") === "24" ? "00" : get("hour");
  const weekday = get("weekday").toLowerCase().slice(0, 3) as DayKey;
  return {
    hhmm: `${hour}:${get("minute")}`,
    day: weekday,
    date: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

export function dayMatches(days: string, today: string): boolean {
  if (!days || days === "*") return true;
  return days
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .includes(today);
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// Тихи часове (поддържа преминаване през полунощ, напр. 22:00-07:00).
export function inQuietHours(start: string, end: string, hhmm: string): boolean {
  const s = normalizeTime(start);
  const e = normalizeTime(end);
  if (!s || !e || s === e) return false;
  const now = toMinutes(hhmm);
  const a = toMinutes(s);
  const b = toMinutes(e);
  return a < b ? now >= a && now < b : now >= a || now < b;
}

const CRON_DOW: Record<DayKey, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

// Cron израз за QStash: "CRON_TZ=Europe/Sofia 30 7 * * 1,3,5".
export function toCron(time: string, days: string, timezone: string): string {
  const t = normalizeTime(time);
  if (!t) throw new Error(`Невалиден час: ${time}`);
  const d = normalizeDays(days);
  if (!d) throw new Error(`Невалидни дни: ${days}`);
  if (!isValidTimezone(timezone)) throw new Error(`Невалидна часова зона: ${timezone}`);
  const [h, m] = t.split(":").map(Number);
  const dow =
    d === "*"
      ? "*"
      : d
          .split(",")
          .map((x) => CRON_DOW[x as DayKey])
          .sort((a, b) => a - b)
          .join(",");
  return `CRON_TZ=${timezone} ${m} ${h} * * ${dow}`;
}

export type NextOccurrence<T> = {
  reminder: T;
  // 0 = днес, 1 = утре, ...
  daysAhead: number;
  time: string;
};

// Следващото сработване сред активните напомняния (в рамките на 7 дни).
export function nextOccurrence<T extends { time: string; days: string; active?: boolean }>(
  reminders: T[],
  timezone: string,
  now: Date = new Date()
): NextOccurrence<T> | null {
  const active = reminders.filter((r) => r.active !== false);
  if (!active.length) return null;
  const nowHhmm = localParts(timezone, now).hhmm;
  for (let ahead = 0; ahead <= 7; ahead++) {
    const day = localParts(timezone, new Date(now.getTime() + ahead * 86_400_000)).day;
    const todays = active
      .filter((r) => dayMatches(r.days, day) && (ahead > 0 || r.time > nowHhmm))
      .sort((a, b) => a.time.localeCompare(b.time));
    if (todays.length) return { reminder: todays[0], daysAhead: ahead, time: todays[0].time };
  }
  return null;
}
