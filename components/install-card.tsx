"use client";

import { useEffect, useState } from "react";
import { isIos, isStandalone } from "@/lib/push-client";

type DeferredPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

// Показва как се инсталира приложението: бутон (Android/desktop) или
// инструкции за Add to Home Screen (iPhone/iPad).
export default function InstallCard() {
  const [deferred, setDeferred] = useState<DeferredPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());
    setIos(isIos());
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as DeferredPrompt);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice.catch(() => {});
    setDeferred(null);
  }

  return (
    <section className="card" aria-labelledby="install-title">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 id="install-title" className="font-semibold">
            Приложение на телефона
          </h2>
          {installed ? (
            <p className="muted text-sm mt-1">
              Отворено като приложение. Известията ще те намират и с затворен браузър.
            </p>
          ) : ios ? (
            <ol className="muted text-sm mt-1 list-decimal pl-5 space-y-1">
              <li>Отвори този сайт в Safari.</li>
              <li>Натисни „Сподели“ (квадрат със стрелка).</li>
              <li>Избери „Добави към началния екран“.</li>
              <li>Отвори Life Coach от началния екран и включи известията.</li>
            </ol>
          ) : deferred ? (
            <p className="muted text-sm mt-1">
              Добави Life Coach на началния екран — отваря се на цял екран, като приложение.
            </p>
          ) : (
            <p className="muted text-sm mt-1">
              В менюто на браузъра избери „Инсталирай приложение“ или „Добави към началния
              екран“.
            </p>
          )}
        </div>
        {!installed && deferred && (
          <button className="btn" onClick={install}>
            Инсталирай
          </button>
        )}
      </div>
    </section>
  );
}
