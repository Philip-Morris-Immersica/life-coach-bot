import webpush from "web-push";
import type { PushPayload } from "./content";
import type { DispatchSub, SendResult } from "./dispatch";

let configured = false;

export function isPushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

function configure() {
  if (configured) return;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) {
    throw new Error("Липсват VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (npm run vapid).");
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@example.com",
    pub,
    priv
  );
  configured = true;
}

// Изпраща едно известие до едно устройство.
export async function sendPush(
  sub: DispatchSub,
  payload: PushPayload
): Promise<SendResult> {
  try {
    configure();
  } catch (err: any) {
    return { ok: false, gone: false, error: err?.message || "VAPID не е настроен" };
  }
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { TTL: 60 * 60 * 6, urgency: "normal" }
    );
    return { ok: true };
  } catch (err: any) {
    const status = Number(err?.statusCode);
    return {
      ok: false,
      gone: status === 404 || status === 410,
      error: `push ${status || "error"}: ${String(err?.body || err?.message || "").slice(0, 200)}`,
    };
  }
}
