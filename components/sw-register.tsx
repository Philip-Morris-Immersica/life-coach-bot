"use client";

import { useEffect } from "react";
import { registerServiceWorker } from "@/lib/push-client";

// Регистрира service worker-а (нужен за инсталация и Web Push).
export default function SwRegister() {
  useEffect(() => {
    registerServiceWorker();
  }, []);
  return null;
}
