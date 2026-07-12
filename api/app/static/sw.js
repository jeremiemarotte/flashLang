const CACHE = "flashlang-shell-v1";
const SHELL_FILES = ["/", "/index.html", "/style.css", "/app.js", "/config.js", "/manifest.json", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL_FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// App shell only — API calls (/cards, /reviews, /stats) always go to the network;
// offline handling for those lives in app.js's own cache/queue, not here.
//
// Network-first, not cache-first: this app is actively iterated on and reachable over a fast
// Tailscale LAN, so a stale cached shell (surviving indefinitely, since sw.js itself doesn't
// change on every deploy) is a worse failure mode than the rare extra round-trip. Falls back to
// cache only when the network request fails (offline).
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (!SHELL_FILES.includes(url.pathname)) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
