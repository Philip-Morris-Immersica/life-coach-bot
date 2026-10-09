// Регистрация само с покана (етапно пускане за приятели). Кодовете са в
// INVITE_CODES (разделени със запетая). Ако променливата е празна — регистрацията е отворена.

import "server-only";
import { timingSafeEqual } from "node:crypto";

export function inviteCodes(): string[] {
  return (process.env.INVITE_CODES || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function invitesRequired(): boolean {
  return inviteCodes().length > 0;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a.toLowerCase());
  const bb = Buffer.from(b.toLowerCase());
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function isValidInvite(code: string): boolean {
  const input = code.trim();
  if (!input) return false;
  // Без ранно излизане, за да не се разкрива кой код е близо.
  let ok = false;
  for (const c of inviteCodes()) {
    if (safeEqual(input, c)) ok = true;
  }
  return ok;
}
