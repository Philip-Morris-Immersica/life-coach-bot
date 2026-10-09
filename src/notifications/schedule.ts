// QStash: отделен график за всяко напомняне. Ние не проверяваме базата на
// всяка минута — QStash вика подписан endpoint само в точния час.

import { Client } from "@upstash/qstash";
import { toCron } from "./time";

export function isSchedulingConfigured(): boolean {
  return Boolean(process.env.QSTASH_TOKEN);
}

function client(): Client {
  const token = process.env.QSTASH_TOKEN;
  if (!token) throw new Error("QSTASH_TOKEN не е настроен.");
  return new Client({
    token,
    ...(process.env.QSTASH_URL ? { baseUrl: process.env.QSTASH_URL } : {}),
  });
}

export function scheduleIdFor(reminderId: string): string {
  return `lcr_${reminderId.replace(/-/g, "")}`;
}

// Публичният адрес, който QStash вика. Не работи с localhost.
export function dispatchUrl(): string {
  // Във Vercel production адресът се предоставя автоматично без протокол.
  // WEB_URL остава възможност за собствен домейн или друга платформа.
  const vercelHost =
    process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || "";
  const base = (
    process.env.WEB_URL || (vercelHost ? `https://${vercelHost}` : "")
  ).replace(/\/+$/, "");
  if (!base) throw new Error("Липсва публичен WEB_URL/Vercel адрес.");
  let host = "";
  try {
    host = new URL(base).hostname;
  } catch {
    throw new Error("WEB_URL не е валиден URL.");
  }
  if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".local")) {
    throw new Error(
      "WEB_URL е локален адрес — QStash не може да го достигне. Ползвай публичния https адрес."
    );
  }
  return `${base}/api/push/dispatch`;
}

export async function upsertSchedule(reminder: {
  id: string;
  time: string;
  days: string;
  timezone: string;
}): Promise<string> {
  const scheduleId = scheduleIdFor(reminder.id);
  await client().schedules.create({
    destination: dispatchUrl(),
    scheduleId,
    cron: toCron(reminder.time, reminder.days, reminder.timezone),
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reminderId: reminder.id }),
    retries: 3,
  });
  return scheduleId;
}

export async function deleteSchedule(scheduleId: string): Promise<void> {
  if (!scheduleId) return;
  try {
    await client().schedules.delete(scheduleId);
  } catch (err: any) {
    // Вече изтрит график не е грешка.
    if (/404|not found/i.test(String(err?.message || err?.status))) return;
    throw err;
  }
}
