// NEON RUSH service worker: offline play after the first visit.
// Game files: network first (updates show up on the next launch), cache as offline fallback.
// Three.js from the CDN and fonts: cache first.
const CACHE = 'neon-rush-v9';
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
  const own = url.origin === location.origin;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(req, { ignoreSearch: own });
      const net = fetch(req, own ? { cache: 'no-cache' } : undefined).then((res) => {
        if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
        return res;
      });
      if (own) return net.catch(() => hit);
      return hit || net.catch(() => hit);
    }),
  );
});
