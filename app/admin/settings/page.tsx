import { requireAdmin } from "@/lib/session";
import { getSettings } from "@/src/core/settings";
import SettingsForm from "./form";

export const dynamic = "force-dynamic";

export default async function AdminSettings() {
  await requireAdmin();
  const settings = await getSettings(true);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Настройки на бота</h1>
      <p className="muted text-sm">
        Промените влизат в сила за нови съобщения почти веднага (кеш до 10
        секунди). Празните стойности се пренебрегват и остават по подразбиране.
      </p>
      <SettingsForm initial={settings} />
    </div>
  );
}
