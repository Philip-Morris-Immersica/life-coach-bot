/* Life Coach service worker.
 *
 * Прави само две неща:
 *  1) показва Web Push известия и отваря нужния екран при клик;
 *  2) показва проста offline страница, когато няма връзка (само за навигация).
 *
 * НЕ кешира API отговори, чатове или други лични данни.
 */

const OFFLINE_CACHE = "lc-offline-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE)
      .then((cache) => cache.add(OFFLINE_URL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== OFFLINE_CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.mode !== "navigate") return;
  event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
});

function safeUrl(url) {
  // Само вътрешни пътища.
  return typeof url === "string" && /^\/(?!\/)/.test(url) ? url : "/";
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = typeof data.title === "string" && data.title ? data.title : "Life Coach";
  const options = {
    body: typeof data.body === "string" ? data.body : "",
    icon: "/pwa-icon/192",
    tag: typeof data.tag === "string" ? data.tag : undefined,
    data: { url: safeUrl(data.url) },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(safeUrl(event.notification.data && event.notification.data.url), self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
      for (const client of clients) {
        if (new URL(client.url).origin === self.location.origin) {
          try {
            await client.focus();
            if ("navigate" in client) await client.navigate(target);
            return;
          } catch (e) {
            // падаме към openWindow
          }
        }
      }
      return self.clients.openWindow(target);
    })
  );
});

// Браузърът понякога подменя абонамента — записваме новия, за да не се губят известия.
self.addEventListener("pushsubscriptionchange", (event) => {
  const oldSub = event.oldSubscription;
  if (!oldSub || !oldSub.options || !oldSub.options.applicationServerKey) return;
  event.waitUntil(
    self.registration.pushManager
      .subscribe({
        userVisibleOnly: true,
        applicationServerKey: oldSub.options.applicationServerKey,
      })
      .then((sub) =>
        fetch("/api/push/subscribe", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscription: sub.toJSON() }),
        })
      )
      .catch(() => {})
  );
});
