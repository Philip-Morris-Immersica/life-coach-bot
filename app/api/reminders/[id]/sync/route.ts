import { NextRequest, NextResponse } from "next/server";
import { apiAuth, isFailure, jsonError, limited } from "@/lib/api";
import { getReminder } from "@/src/memory";
import { syncReminder } from "@/src/notifications/sync";

export const runtime = "nodejs";

// Ръчен retry на синхронизацията с планировчика.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await apiAuth(req);
  if (isFailure(auth)) return auth;
  const rl = limited(req, "reminder-sync", 20, 60_000, auth.user.id);
  if (rl) return rl;
  const { id } = await params;
  const current = await getReminder(auth.user.id, id);
  if (!current) return jsonError("Напомнянето не е намерено.", 404);
  await syncReminder(auth.user.id, current.id);
  const fresh = await getReminder(auth.user.id, current.id);
  return NextResponse.json({ ok: true, reminder: fresh });
}
