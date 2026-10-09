import { NextRequest, NextResponse } from "next/server";
import { apiAuth, isFailure, jsonError, limited } from "@/lib/api";
import { getReminder } from "@/src/memory";
import { buildReminderPayload } from "@/src/notifications/content";
import { dbDispatchStore, listUserSubscriptions } from "@/src/notifications/store";
import { isPushConfigured, sendPush } from "@/src/notifications/webpush";

export const runtime = "nodejs";

// Изпраща САМО на потребителя реалното известие на това напомняне веднага
// (за проверка на текста и посоката). Не отбелязва напомнянето като изпратено.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await apiAuth(req);
  if (isFailure(auth)) return auth;
  const rl = limited(req, "reminder-test", 10, 60_000, auth.user.id);
  if (rl) return rl;
  if (!isPushConfigured()) {
    return jsonError("Известията не са настроени на сървъра (VAPID ключове).", 503);
  }

  const { id } = await params;
  const reminder = await getReminder(auth.user.id, id);
  if (!reminder) return jsonError("Напомнянето не е намерено.", 404);

  const subs = await listUserSubscriptions(auth.user.id, true);
  if (!subs.length) return jsonError("Няма регистрирани устройства.", 400);

  const payload = buildReminderPayload(reminder, { privacyMode: auth.user.privacyMode });
  let sent = 0;
  for (const s of subs) {
    const res = await sendPush(
      { id: s.id, endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
      payload
    );
    if (res.ok) {
      sent++;
      await dbDispatchStore.markSubscriptionSuccess(s.id);
    } else {
      await dbDispatchStore.markSubscriptionFailure(s.id, res.gone);
    }
  }
  if (!sent) return jsonError("Неуспешно изпращане до устройствата.", 502);
  return NextResponse.json({ ok: true, sent });
}
