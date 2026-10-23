// Offline cache for Hellbore. Bump VERSION whenever any shipped file changes.
const VERSION = 'hellbore-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './src/main.js',
  './src/util.js',
  './src/data.js',
  './src/font.js',
  './src/gfx.js',
  './src/world.js',
  './src/audio.js',
  './src/input.js',
  './src/particles.js',
  './src/player.js',
  './src/combat.js',
  './src/enemies.js',
  './src/bosses.js',
  './src/game.js',
  './src/hud.js',
  './src/screens.js',
  './src/save.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(
      (hit) =>
        hit ||
        fetch(req)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(VERSION).then((cache) => cache.put(req, copy));
            }
            return res;
          })
          .catch(() => (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()))
    )
  );
});
