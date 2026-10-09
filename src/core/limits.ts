// Контрол на разхода: твърд дневен лимит на съобщения на потребител (броени в
// базата, затова важи между инстанции) + ограничение на дължината на съобщение.

import { userMessagesLast24h } from "../memory";

export const MAX_MESSAGE_CHARS = 4000;
const DEFAULT_DAILY_LIMIT = 150;

export function dailyMessageLimit(): number {
  const n = Number(process.env.DAILY_MESSAGE_LIMIT);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_DAILY_LIMIT;
}

export type LimitStatus = { ok: boolean; used: number; limit: number };

export async function checkDailyLimit(userId: number): Promise<LimitStatus> {
  const limit = dailyMessageLimit();
  const used = await userMessagesLast24h(userId);
  return { ok: used < limit, used, limit };
}

export const LIMIT_MESSAGE =
  "Достигна дневния лимит от съобщения. Опитай отново по-късно — тогава ще продължим.";
