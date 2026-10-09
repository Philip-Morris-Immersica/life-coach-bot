import type { Metadata } from "next";
import { requireSession } from "@/lib/session";
import { listReminders } from "@/src/memory";
import { deviceView, getNotificationPrefs, listUserSubscriptions } from "@/src/notifications/store";
import { isSchedulingConfigured } from "@/src/notifications/schedule";
import { isPushConfigured } from "@/src/notifications/webpush";
import SettingsClient from "./settings-client";
import { toReminderView } from "./reminders-manager";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Настройки" };

export default async function SettingsPage() {
  const session = await requireSession();
  const [prefs, devices, reminders] = await Promise.all([
    getNotificationPrefs(session.userId),
    listUserSubscriptions(session.userId, false),
    listReminders(session.userId, false),
  ]);

  return (
    <SettingsClient
      publicKey={isPushConfigured() ? process.env.VAPID_PUBLIC_KEY ?? null : null}
      schedulingReady={isSchedulingConfigured()}
      initialDevices={devices.map(deviceView)}
      initialPrefs={
        prefs ?? {
          timezone: "Europe/Sofia",
          notificationsPaused: false,
          quietHoursStart: "",
          quietHoursEnd: "",
          privacyMode: false,
        }
      }
      initialReminders={reminders.map(toReminderView)}
      isAdmin={Boolean(session.isAdmin)}
    />
  );
}
