// sw.js — Service worker de « J'ai un pote » : le morceau (2,1 Mo), les polices et
// la page sont mis en cache au premier passage.
// Page et config : réseau d'abord (une mise à jour est vue tout de suite),
// repli cache hors ligne. Tout le reste : cache d'abord, puis réseau.
const CACHE = "jp2-v48"; // à incrémenter à chaque mise en ligne : les anciens caches sont effacés à l'activation
const PRECACHE = ["./", "./config.js", "./reglement.html", "./assets/jai-un-pote.mp3", "./assets/pff-aie.mp3", "./fonts/SourceSerif2-Black.woff2", "./fonts/StageGrotesk-Medium.otf", "./fonts/StageGrotesk-Black.otf"];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// La page DU JEU est rangée sous « ./ » quel que soit le lien (?9, ?ligue=…) :
// sans ça, hors réseau, un lien avec paramètres ne trouvait aucune copie et le
// service worker répondait « rien » (Safari : « Returned response is null »).
// ⚠️ Les AUTRES pages du site (le règlement) gardent leur propre clé : rangées
// sous « ./ », elles écraseraient la copie hors ligne du jeu, et le jeu
// s'ouvrirait sur le règlement.
function cleDeNavigation(req) {
  if (req.mode !== "navigate") return req;
  const chemin = new URL(req.url).pathname;
  return chemin.endsWith("/") || chemin.endsWith("/index.html") ? "./" : req;
}
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  const reseauDabord = req.mode === "navigate" || req.url.endsWith("config.js");
  if (reseauDabord) {
    const cle = cleDeNavigation(req);
    e.respondWith(fetch(req).then((r) => { if (r.ok) { const copie = r.clone(); caches.open(CACHE).then((c) => c.put(cle, copie)); } return r; })
      .catch(() => caches.match(cle, { ignoreSearch: true }).then((hit) => hit || Response.error())));
  } else {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => { if (r.ok) { const copie = r.clone(); caches.open(CACHE).then((c) => c.put(req, copie)); } return r; })));
  }
});
