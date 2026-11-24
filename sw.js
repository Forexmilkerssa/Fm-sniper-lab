/* FM Sniper Lab — offline shell service worker.
   The page is NETWORK-FIRST: a new build always wins, and the cached copy is
   only used when the network fails. Icons and the manifest stay cache-first.
   Live market data is never intercepted. */
const CACHE = "fm-sniper-v2";
const PAGE = "./sniper-lab.html";
const ASSETS = ["./manifest.json", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png", "./favicon-32.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(ASSETS.map((u) => c.add(u).catch(() => { }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;                 // never touch live market data

  const isPage = req.mode === "navigate" || /\.html?$/i.test(url.pathname);

  if (isPage) {
    /* network-first: fetch fresh, cache the copy, fall back offline only */
    e.respondWith(
      fetch(req, { cache: "no-store" })
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => { });
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match(PAGE)))
    );
    return;
  }

  /* static assets: cache-first, refreshed in the background */
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => { });
      }
      return res;
    }).catch(() => caches.match(PAGE)))
  );
});
