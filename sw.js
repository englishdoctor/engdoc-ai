// Engdoc.ai service worker: makes the app installable and lets lessons open offline. © English Doctor
const CACHE = 'engdoc-v1';
const SHELL = ['./', 'index.html', 'app.js', 'content.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.pathname.startsWith('/api/')) return; // AI calls always go to the network
  // Network first (so updates arrive), cache as fallback (so it works offline)
  e.respondWith(fetch(e.request).then(r => { if (r.ok && (u.origin === location.origin || u.host.includes('fonts.g'))) { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); } return r; })
    .catch(() => caches.match(e.request).then(m => m || caches.match('index.html'))));
});
