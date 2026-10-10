// Offline-Betrieb: alle Dateien beim ersten Besuch zwischenspeichern. Neue Version = neuer Cache.
// Version und Dateiliste setzt scripts/build-web.js ein.
const CACHE = "pf-1.7.0-5a89054e";
const FILES = ["./","app.js","backup.js","boot.js","cash.js","core/commands.js","core/core.js","core/history.js","history.js","icon-512.png","icon.png","index.html","manifest.json","pf-web.js","sounds/QUELLEN.txt","sounds/envelope-coin.mp3","sounds/jackpot-fanfare.mp3","sounds/level-gong.mp3","sounds/start-shuffle.ogg","start.js","styles.css","tournament.js"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request)));
});
