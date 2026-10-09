import { NextRequest, NextResponse } from "next/server";
import { apiAuth, isFailure, jsonError, limited, readJson } from "@/lib/api";
import { draftReminderMessage } from "@/src/core/coach";
import { checkDailyLimit, LIMIT_MESSAGE } from "@/src/core/limits";
import { normalizeTime } from "@/src/notifications/time";

export const runtime = "nodejs";
export const maxDuration = 30;

// Предлага чернова на текста на известие (бърз и евтин модел, без лична памет).
export async function POST(req: NextRequest) {
  const auth = await apiAuth(req);
  if (isFailure(auth)) return auth;
  const rl = limited(req, "reminder-draft", 8, 60_000, auth.user.id);
  if (rl) return rl;

  const body = await readJson(req);
  const time = normalizeTime(body?.time) ?? "08:00";
  const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 200) : "";

  const limit = await checkDailyLimit(auth.user.id);
  if (!limit.ok) return jsonError(LIMIT_MESSAGE, 429);

  const message = await draftReminderMessage(time, reason);
  return NextResponse.json({ ok: true, message });
}
