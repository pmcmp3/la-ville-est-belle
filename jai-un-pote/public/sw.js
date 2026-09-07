// sw.js — Service worker de « J'ai un pote » (7 septembre 2026) : le morceau
// (2,1 Mo), les polices et la page sont mis en cache au premier passage.
// Page et config : réseau d'abord (une mise à jour est vue tout de suite),
// repli cache hors ligne. Tout le reste : cache d'abord, puis réseau.
const CACHE = "jaip-v1";
const PRECACHE = ["./", "./config.js", "./assets/jai-un-pote.mp3", "./fonts/SourceSerif2-Black.woff2", "./fonts/StageGrotesk-Medium.otf", "./fonts/StageGrotesk-Black.otf"];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  const reseauDabord = req.mode === "navigate" || req.url.endsWith("config.js");
  if (reseauDabord) {
    e.respondWith(fetch(req).then((r) => { const copie = r.clone(); caches.open(CACHE).then((c) => c.put(req, copie)); return r; }).catch(() => caches.match(req)));
  } else {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => { if (r.ok) { const copie = r.clone(); caches.open(CACHE).then((c) => c.put(req, copie)); } return r; })));
  }
});
