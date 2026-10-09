"use client";

import Link from "next/link";
import { useState } from "react";
import InstallCard from "@/components/install-card";
import PushControls, { type Device } from "@/components/push-controls";
import PreferencesForm, { type Prefs } from "./preferences-form";
import RemindersManager, { type ReminderView } from "./reminders-manager";

export default function SettingsClient({
  publicKey,
  schedulingReady,
  initialDevices,
  initialPrefs,
  initialReminders,
  isAdmin,
}: {
  publicKey: string | null;
  schedulingReady: boolean;
  initialDevices: Device[];
  initialPrefs: Prefs;
  initialReminders: ReminderView[];
  isAdmin: boolean;
}) {
  const [devices, setDevices] = useState<Device[]>(initialDevices);
  const [prefs, setPrefs] = useState<Prefs>(initialPrefs);
  const activeDevices = devices.filter((d) => d.active).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="page-title">Настройки</h1>
        <p className="muted text-sm">Известия, напомняния и поверителност.</p>
      </div>

      {(!publicKey || !schedulingReady) && (
        <p className="notice text-sm" role="status">
          Напомнянията още не са напълно включени на сървъра
          {!publicKey ? " (липсват VAPID ключове)" : ""}
          {!schedulingReady ? " (липсва планировчик QStash или адрес WEB_URL)" : ""}. Можеш да
          настроиш всичко, но известия ще пристигат след като администраторът довърши
          настройката.
        </p>
      )}

      <InstallCard />

      <PushControls
        publicKey={publicKey}
        initialDevices={devices}
        onDevicesChange={setDevices}
      />

      <RemindersManager
        initial={initialReminders}
        deviceCount={activeDevices}
        paused={prefs.notificationsPaused}
        privacyMode={prefs.privacyMode}
      />

      <PreferencesForm initial={prefs} onChange={setPrefs} />

      <section className="card space-y-2">
        <h2 className="section-title">Други връзки</h2>
        <div className="flex gap-2 flex-wrap">
          <Link href="/link-telegram" className="btn btn-ghost btn-sm">
            Свържи Telegram (по желание)
          </Link>
          {isAdmin && (
            <Link href="/admin" className="btn btn-ghost btn-sm">
              Админ панел
            </Link>
          )}
        </div>
        <p className="muted text-xs">
          Telegram е допълнителен канал. Напомнянията в сайта работят без него.
        </p>
      </section>
    </div>
  );
}
