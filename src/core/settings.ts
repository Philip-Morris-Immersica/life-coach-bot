// Чете и записва глобалните настройки на бота (промпти, модели, разписание)
// от lc_settings. Винаги връща напълно попълнен обект, като липсващите полета
// идват от DEFAULT_SETTINGS. Кешира за кратко, за да не дърпа на всяко
// съобщение.

import { eq } from "drizzle-orm";
import { db, settingsTable } from "../db/index";
import {
  ONBOARDING,
  DEEP_SESSION,
  DAILY_CHAT,
  EXTRACT_PROFILE,
  BASE_COACH,
  morningPrompt,
  eveningPrompt,
} from "../prompts";
import { MODEL_FAST, MODEL_DEEP } from "../openai";

export type Settings = {
  prompts: {
    base: string;
    onboarding: string;
    deepSession: string;
    dailyChat: string;
    extractProfile: string;
    morning: string;
    evening: string;
  };
  models: {
    fast: string;
    deep: string;
  };
  temperatures: {
    fast: number;
    deep: number;
    checkin: number;
  };
  checkin: {
    morningHour: number;
    morningMinute: number;
    eveningHour: number;
    eveningMinute: number;
    timezone: string;
  };
};

// Стойностите по подразбиране — източникът на истината при липсваща настройка.
export const DEFAULT_SETTINGS: Settings = {
  prompts: {
    base: BASE_COACH,
    onboarding: ONBOARDING,
    deepSession: DEEP_SESSION,
    dailyChat: DAILY_CHAT,
    extractProfile: EXTRACT_PROFILE,
    morning: morningPrompt(),
    evening: eveningPrompt(),
  },
  models: {
    fast: MODEL_FAST,
    deep: MODEL_DEEP,
  },
  temperatures: {
    fast: 0.7,
    deep: 0.7,
    checkin: 0.8,
  },
  checkin: {
    morningHour: Number(process.env.MORNING_HOUR ?? 8),
    morningMinute: Number(process.env.MORNING_MINUTE ?? 0),
    eveningHour: Number(process.env.EVENING_HOUR ?? 21),
    eveningMinute: Number(process.env.EVENING_MINUTE ?? 0),
    timezone: process.env.TIMEZONE || "Europe/Sofia",
  },
};

const SETTINGS_KEY = "main";
const CACHE_MS = 10_000;

let cache: { value: Settings; at: number } | null = null;

// Дълбоко сливане на частичен patch върху base. Масивите не очакваме тук.
function merge<T>(base: T, patch: unknown): T {
  if (patch === null || patch === undefined) return base;
  if (typeof base !== "object" || base === null) return (patch as T) ?? base;
  if (typeof patch !== "object") return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    const baseVal = (base as Record<string, unknown>)[k];
    if (
      baseVal &&
      typeof baseVal === "object" &&
      v &&
      typeof v === "object" &&
      !Array.isArray(v)
    ) {
      out[k] = merge(baseVal, v);
    } else if (v !== undefined && v !== null && v !== "") {
      out[k] = v;
    }
  }
  return out as T;
}

export async function getSettings(forceFresh = false): Promise<Settings> {
  if (!forceFresh && cache && Date.now() - cache.at < CACHE_MS) {
    return cache.value;
  }
  let stored: unknown = undefined;
  try {
    const rows = await db
      .select()
      .from(settingsTable)
      .where(eq(settingsTable.key, SETTINGS_KEY))
      .limit(1);
    stored = rows[0]?.data;
  } catch {
    // Таблицата може още да не е създадена при първо стартиране.
    stored = undefined;
  }
  const merged = merge(DEFAULT_SETTINGS, stored);
  cache = { value: merged, at: Date.now() };
  return merged;
}

// Запис на (частичен) patch — админ панелът ще извика това. Невъведените
// (празни) полета не записваме, така че Default продължава да важи.
export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings(true);
  const next = merge(current, patch);
  // Записваме целия слят обект, за да е лесно за инспекция в Drizzle Studio.
  await db
    .insert(settingsTable)
    .values({ key: SETTINGS_KEY, data: next, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settingsTable.key,
      set: { data: next, updatedAt: new Date() },
    });
  cache = { value: next, at: Date.now() };
  return next;
}

// Инвалидира кеша (използва се след промяна отвън, напр. ръчно в Drizzle Studio).
export function invalidateSettingsCache() {
  cache = null;
}
