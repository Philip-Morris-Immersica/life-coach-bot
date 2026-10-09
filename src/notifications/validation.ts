import { isReminderTarget, type ReminderTarget } from "./content";
import { normalizeDays, normalizeTime } from "./time";

export type ReminderPatch = {
  time?: string;
  days?: string;
  reason?: string;
  message?: string;
  promptHint?: string;
  target?: ReminderTarget;
  active?: boolean;
};

export type ParseResult =
  | { ok: true; value: ReminderPatch }
  | { ok: false; error: string };

// Валидира тяло на заявка за създаване (partial=false) или частична промяна.
export function parseReminderInput(body: unknown, partial: boolean): ParseResult {
  if (!body || typeof body !== "object") return { ok: false, error: "Невалидни данни." };
  const b = body as Record<string, unknown>;
  const out: ReminderPatch = {};

  if (b.time !== undefined || !partial) {
    const time = normalizeTime(b.time);
    if (!time) return { ok: false, error: "Невалиден час (очаквам ЧЧ:ММ)." };
    out.time = time;
  }
  if (b.days !== undefined) {
    const days = normalizeDays(b.days);
    if (!days) return { ok: false, error: "Невалидни дни." };
    out.days = days;
  }
  if (b.reason !== undefined) {
    if (typeof b.reason !== "string") return { ok: false, error: "Невалидно заглавие." };
    out.reason = b.reason.trim().slice(0, 200);
  }
  if (b.message !== undefined) {
    if (typeof b.message !== "string") return { ok: false, error: "Невалиден текст." };
    out.message = b.message.trim().slice(0, 240);
  }
  if (b.promptHint !== undefined) {
    if (typeof b.promptHint !== "string") return { ok: false, error: "Невалидна насока." };
    out.promptHint = b.promptHint.trim().slice(0, 1000);
  }
  if (b.target !== undefined) {
    if (!isReminderTarget(b.target)) return { ok: false, error: "Невалидна цел на известието." };
    out.target = b.target;
  }
  if (b.active !== undefined) {
    if (typeof b.active !== "boolean") return { ok: false, error: "Невалиден статус." };
    out.active = b.active;
  }
  return { ok: true, value: out };
}
