import { NextRequest, NextResponse } from "next/server";
import { apiAuth, isFailure, jsonError, limited, readJson } from "@/lib/api";
import { getNotificationPrefs, updateNotificationPrefs } from "@/src/notifications/store";
import { syncUserReminders } from "@/src/notifications/sync";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await apiAuth(req);
  if (isFailure(auth)) return auth;
  return NextResponse.json({ prefs: await getNotificationPrefs(auth.user.id) });
}

export async function PATCH(req: NextRequest) {
  const auth = await apiAuth(req);
  if (isFailure(auth)) return auth;
  const rl = limited(req, "prefs", 30, 60_000, auth.user.id);
  if (rl) return rl;
  const body = await readJson(req);
  if (!body) return jsonError("Невалидни данни.", 400);

  const before = await getNotificationPrefs(auth.user.id);
  let prefs;
  try {
    prefs = await updateNotificationPrefs(auth.user.id, {
      timezone: body.timezone,
      notificationsPaused: body.notificationsPaused,
      quietHoursStart: body.quietHoursStart,
      quietHoursEnd: body.quietHoursEnd,
      privacyMode: body.privacyMode,
    });
  } catch (err: any) {
    return jsonError(err?.message || "Невалидни настройки.", 400);
  }
  // Пауза/зона променят кога и дали има график → привеждаме го в синхрон.
  let sync;
  if (
    !before ||
    before.timezone !== prefs.timezone ||
    before.notificationsPaused !== prefs.notificationsPaused
  ) {
    sync = await syncUserReminders(auth.user.id);
  }
  return NextResponse.json({ ok: true, prefs, sync });
}
