// NEON RUSH service worker: offline play after the first visit.
// Stale-while-revalidate for the game files, Three.js from the CDN and fonts.
const CACHE = 'neon-rush-v4';
const CORE = ['./', 'index.html', 'src/ui/style.css', 'src/main.js', 'manifest.webmanifest', 'icons/icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const ok = url.origin === location.origin || /(^|\.)jsdelivr\.net$|fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!ok) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(req, { ignoreSearch: url.origin === location.origin });
      const net = fetch(req).then((res) => {
        if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
        return res;
      }).catch(() => hit);
      return hit || net;
    }),
  );
});
