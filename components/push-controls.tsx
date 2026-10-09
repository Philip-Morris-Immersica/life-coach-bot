"use client";

import { useCallback, useEffect, useState } from "react";
import {
  disablePushOnThisDevice,
  enablePushOnThisDevice,
  getCurrentSubscription,
  pushSupport,
  type PushSupport,
} from "@/lib/push-client";

export type Device = {
  id: string;
  label: string;
  active: boolean;
  failureCount: number;
  lastSuccessAt: string | null;
  createdAt: string;
  fp: string;
};

type Msg = { kind: "ok" | "err"; text: string } | null;

async function fingerprint(endpoint: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

function fmt(iso: string | null) {
  if (!iso) return "още няма успешно известие";
  return new Date(iso).toLocaleString("bg-BG", { dateStyle: "short", timeStyle: "short" });
}

// Управление на известията: разрешение, това устройство, списък устройства.
export default function PushControls({
  publicKey,
  initialDevices,
  onDevicesChange,
}: {
  publicKey: string | null;
  initialDevices: Device[];
  onDevicesChange?: (devices: Device[]) => void;
}) {
  const [devices, setDevices] = useState<Device[]>(initialDevices);
  const [support, setSupport] = useState<PushSupport>("supported");
  const [permission, setPermission] = useState<NotificationPermission | "n/a">("n/a");
  const [thisFp, setThisFp] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);

  const update = useCallback(
    (next: Device[]) => {
      setDevices(next);
      onDevicesChange?.(next);
    },
    [onDevicesChange]
  );

  const refreshLocal = useCallback(async () => {
    const s = pushSupport();
    setSupport(s);
    setPermission(typeof Notification !== "undefined" ? Notification.permission : "n/a");
    try {
      const sub = await getCurrentSubscription();
      setThisFp(sub ? await fingerprint(sub.endpoint) : null);
    } catch {
      setThisFp(null);
    }
  }, []);

  const refreshDevices = useCallback(async () => {
    const res = await fetch("/api/push/subscribe");
    if (res.ok) update((await res.json()).devices as Device[]);
  }, [update]);

  useEffect(() => {
    void refreshLocal();
  }, [refreshLocal]);

  const thisDevice = thisFp ? devices.find((d) => d.fp === thisFp) : undefined;
  const enabledHere = Boolean(thisDevice && thisDevice.active);

  async function enable() {
    if (!publicKey) {
      setMsg({ kind: "err", text: "Сървърът още няма настроени VAPID ключове." });
      return;
    }
    setBusy("enable");
    setMsg(null);
    const err = await enablePushOnThisDevice(publicKey);
    await refreshLocal();
    await refreshDevices();
    setBusy(null);
    setMsg(
      err
        ? { kind: "err", text: err }
        : { kind: "ok", text: "Готово — това устройство ще получава напомняния." }
    );
  }

  async function disable() {
    setBusy("disable");
    setMsg(null);
    const err = await disablePushOnThisDevice();
    await refreshLocal();
    await refreshDevices();
    setBusy(null);
    setMsg(err ? { kind: "err", text: err } : { kind: "ok", text: "Известията са изключени тук." });
  }

  async function test(deviceId?: string) {
    setBusy(deviceId ?? "test-all");
    setMsg(null);
    const res = await fetch("/api/push/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(deviceId ? { deviceId } : {}),
    });
    const j = await res.json().catch(() => ({}));
    await refreshDevices();
    setBusy(null);
    if (res.ok && j.ok) {
      setMsg({ kind: "ok", text: "Тестовото известие е изпратено. Провери устройството." });
    } else {
      const first = j.results?.find((r: any) => !r.ok)?.error;
      setMsg({ kind: "err", text: first || j.error || "Неуспешно изпращане." });
    }
  }

  async function remove(id: string) {
    if (!confirm("Да премахна ли това устройство?")) return;
    setBusy(id);
    setMsg(null);
    const res = await fetch("/api/push/subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await refreshLocal();
    await refreshDevices();
    setBusy(null);
    if (!res.ok) setMsg({ kind: "err", text: "Неуспешно премахване." });
  }

  const status = (() => {
    if (!publicKey) return { cls: "badge-warn", text: "Не е настроено на сървъра" };
    if (support === "unsupported") return { cls: "badge-err", text: "Не се поддържа" };
    if (support === "needs-install") return { cls: "badge-warn", text: "Нужна е инсталация" };
    if (permission === "denied") return { cls: "badge-err", text: "Блокирано в браузъра" };
    if (enabledHere) return { cls: "badge-ok", text: "Включено тук" };
    return { cls: "badge-warn", text: "Изключено тук" };
  })();

  return (
    <section className="card space-y-4" aria-labelledby="devices-title">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 id="devices-title" className="section-title">
            Известия на устройствата
          </h2>
          <p className="muted text-sm mt-1">
            Напомнянията пристигат като известие на телефона или компютъра — дори браузърът да е
            затворен. Натискаш го и се отваря точната страница.
          </p>
        </div>
        <span className={`badge ${status.cls}`}>{status.text}</span>
      </div>

      {support === "needs-install" && (
        <p className="notice text-sm">
          На iPhone/iPad известията работят само след „Добави към началния екран“ (iOS 16.4+).
          После отвори приложението оттам и включи известията.
        </p>
      )}
      {permission === "denied" && (
        <p className="notice notice-err text-sm">
          Известията са блокирани за този сайт. Разреши ги от иконата с катинара до адреса (или от
          настройките на телефона), после презареди страницата.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {enabledHere ? (
          <>
            <button className="btn" onClick={() => test(thisDevice!.id)} disabled={busy !== null}>
              {busy === thisDevice!.id ? "Изпращам…" : "Тест на това устройство"}
            </button>
            <button className="btn btn-ghost" onClick={disable} disabled={busy !== null}>
              Изключи тук
            </button>
          </>
        ) : (
          <button
            className="btn"
            onClick={enable}
            disabled={busy !== null || support === "unsupported" || permission === "denied"}
          >
            {busy === "enable" ? "Включвам…" : "Включи известията на това устройство"}
          </button>
        )}
        {devices.filter((d) => d.active).length > 1 && (
          <button className="btn btn-ghost" onClick={() => test()} disabled={busy !== null}>
            Тест на всички
          </button>
        )}
      </div>

      {msg && (
        <p className={msg.kind === "err" ? "text-error text-sm" : "text-success text-sm"} role="status">
          {msg.text}
        </p>
      )}

      {devices.length > 0 ? (
        <ul className="space-y-2" aria-label="Регистрирани устройства">
          {devices.map((d) => (
            <li key={d.id} className="card-soft flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="font-medium text-sm flex items-center gap-2 flex-wrap">
                  {d.label}
                  {d.fp === thisFp && <span className="badge">това устройство</span>}
                  {!d.active && <span className="badge badge-err">неактивно</span>}
                </div>
                <div className="muted text-xs">
                  Последно успешно: {fmt(d.lastSuccessAt)}
                  {d.failureCount > 0 ? ` · неуспешни опити: ${d.failureCount}` : ""}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => test(d.id)}
                  disabled={busy !== null || !d.active}
                >
                  Тест
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => remove(d.id)}
                  disabled={busy !== null}
                >
                  Премахни
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted text-sm">
          Все още няма устройства. Без поне едно устройство напомнянията не се изпращат.
        </p>
      )}
    </section>
  );
}
