/**
 * Service worker — offline-first app shell.
 * Bump CACHE when any precached asset changes so clients update.
 */
const CACHE = "calculator-v19";

const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./script.js",
  "./manifest.webmanifest",
  "./assets/leaf-bg.jpg",
  "./assets/rakeen-logo.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-192.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
];

// Precache the shell, then activate immediately.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

// Drop old caches and take control of open pages.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  // Navigations: cache-FIRST for an instant launch (app shell). Serve the cached
  // page immediately, and refresh it in the background for next time. Only wait
  // on the network if nothing is cached yet (first ever load).
  if (request.mode === "navigate") {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match("./index.html");
        const fromNetwork = fetch(request)
          .then((res) => {
            if (res && res.status === 200) cache.put("./index.html", res.clone());
            return res;
          })
          .catch(() => null);
        return cached || (await fromNetwork) || cache.match("./");
      })
    );
    return;
  }

  // Everything else: cache-first, then network (and cache the result at runtime).
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((res) => {
        if (res && res.status === 200 && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return res;
      });
    })
  );
});
