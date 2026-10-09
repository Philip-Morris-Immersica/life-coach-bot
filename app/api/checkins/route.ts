import { NextRequest, NextResponse } from "next/server";
import { apiAuth, isFailure, jsonError, limited, readJson } from "@/lib/api";
import { findHabit, isCheckInStatus, logCheckIn } from "@/src/memory";

export const runtime = "nodejs";

// Бързо отчитане на навик от таблото.
export async function POST(req: NextRequest) {
  const auth = await apiAuth(req);
  if (isFailure(auth)) return auth;
  const rl = limited(req, "checkins", 60, 60_000, auth.user.id);
  if (rl) return rl;

  const body = await readJson(req);
  if (!body || !isCheckInStatus(body.status)) {
    return jsonError("Невалиден статус.", 400);
  }
  let habitId: string | null = null;
  if (body.habitId) {
    const habit = await findHabit(auth.user.id, String(body.habitId));
    if (!habit) return jsonError("Навикът не е намерен.", 404);
    habitId = habit.id;
  }
  const row = await logCheckIn(auth.user.id, {
    habitId,
    status: body.status,
    note: typeof body.note === "string" ? body.note : undefined,
  });
  return NextResponse.json({ ok: true, checkIn: row }, { status: 201 });
}
