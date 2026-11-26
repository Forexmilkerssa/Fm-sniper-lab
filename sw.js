/* FM Sniper Lab — offline shell service worker.
   The page is NETWORK-FIRST: a new build always wins, and the cached copy is
   only used when the network fails OR is too slow (a phone launch must never
   sit on a blank screen waiting for a stalled request). Icons and the manifest
   stay cache-first. Live market data is never intercepted. */
const CACHE = "fm-sniper-v3";
const PAGE = "./index.html";
const ASSETS = ["./manifest.json", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png", "./favicon-32.png", "./fm-logo.png"];

/* how long a navigation may wait for the network before the cached shell wins */
const NET_TIMEOUT = 4000;

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

function timeout(ms) {
  return new Promise((_, rej) => setTimeout(() => rej(new Error("sw-timeout")), ms));
}

/* last resort: never hand the browser a dead navigation */
function offlinePage() {
  return new Response(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>FM Sniper Lab</title><body style="margin:0;background:#000;color:#f4f4f5;font:15px/1.5 system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center">' +
    '<div style="padding:24px;max-width:340px">' +
    '<img src="./fm-logo.png" alt="" style="width:88px;height:88px;object-fit:contain" onerror="this.style.display=\'none\'">' +
    '<div style="margin-top:12px;font-weight:900;letter-spacing:.2em">FM SNIPER LAB</div>' +
    '<div style="margin-top:10px;color:#b9b9c6">You are offline and the app shell is not cached yet. Reconnect, then tap retry.</div>' +
    '<button onclick="location.reload()" style="margin-top:18px;padding:12px 24px;border-radius:999px;border:0;background:#ef1f2b;color:#fff;font-weight:800;letter-spacing:.1em">RETRY</button>' +
    '</div></body>',
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }
  );
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;                 // never touch live market data

  const isPage = req.mode === "navigate" || /\.html?$/i.test(url.pathname);

  if (isPage) {
    /* network-first, but a stalled request falls back to the cached shell */
    e.respondWith((async () => {
      const cached = (await caches.match(req, { ignoreSearch: true }))
        || (await caches.match(PAGE, { ignoreSearch: true }));
      try {
        const res = await Promise.race([fetch(req, { cache: "no-store" }), timeout(NET_TIMEOUT)]);
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => { });
          return res;
        }
        return cached || res || offlinePage();
      } catch (err) {
        return cached || offlinePage();
      }
    })());
    return;
  }

  /* static assets: cache-first, refreshed in the background */
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => { });
      }
      return res;
    }).catch(() => Response.error()))
  );
});
