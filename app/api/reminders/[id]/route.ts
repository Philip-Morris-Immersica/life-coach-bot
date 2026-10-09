import { NextRequest, NextResponse } from "next/server";
import { apiAuth, isFailure, jsonError, limited, readJson } from "@/lib/api";
import { getReminder, removeReminder, upsertReminder } from "@/src/memory";
import { removeReminderSchedule, syncReminder } from "@/src/notifications/sync";
import { parseReminderInput } from "@/src/notifications/validation";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await apiAuth(req);
  if (isFailure(auth)) return auth;
  const rl = limited(req, "reminders", 60, 60_000, auth.user.id);
  if (rl) return rl;
  const { id } = await params;

  const current = await getReminder(auth.user.id, id);
  if (!current) return jsonError("Напомнянето не е намерено.", 404);

  const parsed = parseReminderInput(await readJson(req), true);
  if (!parsed.ok) return jsonError(parsed.error, 400);

  await upsertReminder(auth.user.id, {
    id: current.id,
    time: parsed.value.time ?? current.time,
    days: parsed.value.days,
    reason: parsed.value.reason,
    message: parsed.value.message,
    promptHint: parsed.value.promptHint,
    target: parsed.value.target,
    active: parsed.value.active,
  });
  await syncReminder(auth.user.id, current.id);
  const fresh = await getReminder(auth.user.id, current.id);
  return NextResponse.json({ ok: true, reminder: fresh });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const auth = await apiAuth(req);
  if (isFailure(auth)) return auth;
  const { id } = await params;
  const removed = await removeReminder(auth.user.id, id);
  if (!removed) return jsonError("Напомнянето не е намерено.", 404);
  await removeReminderSchedule(removed.scheduleId);
  return NextResponse.json({ ok: true });
}
