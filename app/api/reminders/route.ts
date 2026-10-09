import { NextRequest, NextResponse } from "next/server";
import { apiAuth, isFailure, jsonError, limited, readJson } from "@/lib/api";
import { listReminders, upsertReminder } from "@/src/memory";
import { syncReminder } from "@/src/notifications/sync";
import { parseReminderInput } from "@/src/notifications/validation";

export const runtime = "nodejs";

const MAX_REMINDERS = 20;

export async function GET(req: NextRequest) {
  const auth = await apiAuth(req);
  if (isFailure(auth)) return auth;
  return NextResponse.json({ reminders: await listReminders(auth.user.id, false) });
}

export async function POST(req: NextRequest) {
  const auth = await apiAuth(req);
  if (isFailure(auth)) return auth;
  const rl = limited(req, "reminders", 30, 60_000, auth.user.id);
  if (rl) return rl;

  const parsed = parseReminderInput(await readJson(req), false);
  if (!parsed.ok) return jsonError(parsed.error, 400);

  const existing = await listReminders(auth.user.id, false);
  if (existing.length >= MAX_REMINDERS) {
    return jsonError(`Максимум ${MAX_REMINDERS} напомняния.`, 400);
  }
  const created = await upsertReminder(auth.user.id, {
    time: parsed.value.time!,
    days: parsed.value.days,
    reason: parsed.value.reason,
    message: parsed.value.message,
    promptHint: parsed.value.promptHint,
    target: parsed.value.target,
    active: parsed.value.active,
  });
  await syncReminder(auth.user.id, created.id);
  const fresh = (await listReminders(auth.user.id, false)).find((r) => r.id === created.id);
  return NextResponse.json({ ok: true, reminder: fresh ?? created }, { status: 201 });
}
