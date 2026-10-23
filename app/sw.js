// Offline cache. Bump VERSION whenever app files or data change.
const VERSION = "x4c-v7";
const FILES = [
  "./", "index.html", "manifest.webmanifest", "css/app.css",
  "js/app.js", "js/util.js", "js/production.js", "js/ships.js",
  "js/station-ui.js", "js/ships-ui.js", "js/compare-ui.js",
  "data/economy.json", "data/ships.json", "data/equipment.json",
  "icons/icon-192.png", "icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  // cache: "reload" so a new version never copies stale files from the browser's HTTP cache
  const fresh = FILES.map((f) => new Request(f, { cache: "reload" }));
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(fresh)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Network first (always the latest version when online), cache as offline fallback.
// cache: "no-cache" makes the browser revalidate with the server (cheap 304) instead of
// serving its HTTP cache, which GitHub Pages lets keep files for 10 minutes.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(
    fetch(e.request, { cache: "no-cache" })
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
