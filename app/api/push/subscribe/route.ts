import { NextRequest, NextResponse } from "next/server";
import { apiAuth, isFailure, jsonError, limited, readJson } from "@/lib/api";
import {
  deviceView,
  listUserSubscriptions,
  removeSubscription,
  removeSubscriptionByEndpoint,
  upsertSubscription,
} from "@/src/notifications/store";
import { syncUserReminders } from "@/src/notifications/sync";

export const runtime = "nodejs";

const B64URL = /^[A-Za-z0-9_-]+={0,2}$/;

function deviceLabel(ua: string | null): string {
  const s = ua || "";
  const os = /Android/i.test(s)
    ? "Android"
    : /iPhone|iPad|iPod/i.test(s)
      ? "iPhone/iPad"
      : /Windows/i.test(s)
        ? "Windows"
        : /Mac OS X|Macintosh/i.test(s)
          ? "Mac"
          : /Linux/i.test(s)
            ? "Linux"
            : "Устройство";
  const browser = /Edg\//.test(s)
    ? "Edge"
    : /Firefox\//.test(s)
      ? "Firefox"
      : /Chrome\//.test(s)
        ? "Chrome"
        : /Safari\//.test(s)
          ? "Safari"
          : "браузър";
  return `${os} · ${browser}`;
}

// Списък на устройствата на потребителя.
export async function GET(req: NextRequest) {
  const auth = await apiAuth(req);
  if (isFailure(auth)) return auth;
  const devices = await listUserSubscriptions(auth.user.id, false);
  return NextResponse.json({ devices: devices.map(deviceView) });
}

// Регистрира това устройство за Web Push.
export async function POST(req: NextRequest) {
  const auth = await apiAuth(req);
  if (isFailure(auth)) return auth;
  const rl = limited(req, "push-subscribe", 20, 60_000, auth.user.id);
  if (rl) return rl;

  const body = await readJson(req);
  const sub = body?.subscription;
  const endpoint = sub?.endpoint;
  const p256dh = sub?.keys?.p256dh;
  const authKey = sub?.keys?.auth;
  if (
    typeof endpoint !== "string" ||
    !/^https:\/\//.test(endpoint) ||
    endpoint.length > 1000 ||
    typeof p256dh !== "string" ||
    typeof authKey !== "string" ||
    !B64URL.test(p256dh) ||
    !B64URL.test(authKey)
  ) {
    return jsonError("Невалиден push абонамент.", 400);
  }

  await upsertSubscription(auth.user.id, {
    endpoint,
    p256dh,
    auth: authKey,
    label: deviceLabel(req.headers.get("user-agent")),
  });
  // Сега има поне едно устройство → създаваме графиците за напомнянията.
  const sync = await syncUserReminders(auth.user.id);
  const devices = await listUserSubscriptions(auth.user.id, false);
  return NextResponse.json({ ok: true, sync, deviceCount: devices.length });
}

// Премахва устройство (по id или endpoint).
export async function DELETE(req: NextRequest) {
  const auth = await apiAuth(req);
  if (isFailure(auth)) return auth;
  const body = await readJson(req);
  let removed = false;
  if (typeof body?.id === "string") {
    removed = await removeSubscription(auth.user.id, body.id);
  } else if (typeof body?.endpoint === "string") {
    removed = await removeSubscriptionByEndpoint(auth.user.id, body.endpoint);
  } else {
    return jsonError("Липсва устройство.", 400);
  }
  const sync = await syncUserReminders(auth.user.id);
  return NextResponse.json({ ok: true, removed, sync });
}
