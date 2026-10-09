import { NextRequest, NextResponse } from "next/server";
import { apiAuth, isFailure, jsonError, limited, readJson } from "@/lib/api";
import { testPayload } from "@/src/notifications/content";
import { dbDispatchStore, getUserSubscription, listUserSubscriptions } from "@/src/notifications/store";
import { isPushConfigured, sendPush } from "@/src/notifications/webpush";

export const runtime = "nodejs";

// Изпраща тестово известие до едно (deviceId) или до всички устройства.
export async function POST(req: NextRequest) {
  const auth = await apiAuth(req);
  if (isFailure(auth)) return auth;
  const rl = limited(req, "push-test", 10, 60_000, auth.user.id);
  if (rl) return rl;
  if (!isPushConfigured()) {
    return jsonError("Известията не са настроени на сървъра (VAPID ключове).", 503);
  }

  const body = (await readJson(req)) ?? {};
  let targets;
  if (typeof body.deviceId === "string") {
    const one = await getUserSubscription(auth.user.id, body.deviceId);
    if (!one) return jsonError("Устройството не е намерено.", 404);
    targets = [one];
  } else {
    targets = await listUserSubscriptions(auth.user.id, true);
  }
  if (!targets.length) return jsonError("Няма регистрирани устройства.", 400);

  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const t of targets) {
    const res = await sendPush(
      { id: t.id, endpoint: t.endpoint, p256dh: t.p256dh, auth: t.auth },
      testPayload()
    );
    if (res.ok) {
      await dbDispatchStore.markSubscriptionSuccess(t.id);
      results.push({ id: t.id, ok: true });
    } else {
      await dbDispatchStore.markSubscriptionFailure(t.id, res.gone);
      results.push({
        id: t.id,
        ok: false,
        error: res.gone ? "Устройството вече не е валидно и беше премахнато." : "Неуспешно изпращане.",
      });
    }
  }
  return NextResponse.json({ ok: results.some((r) => r.ok), results });
}
