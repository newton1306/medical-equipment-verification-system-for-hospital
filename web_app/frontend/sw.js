// Service Worker — caches static assets for offline shell
const CACHE = 'equip-v1';
const STATIC = ['/', '/css/style.css', '/js/app.js', '/admin', '/dashboard'];

self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)));
    self.skipWaiting();
});

self.addEventListener('activate', e => {
    e.waitUntil(caches.keys().then(ks => Promise.all(
        ks.filter(k => k !== CACHE).map(k => caches.delete(k))
    )));
    self.clients.claim();
});

self.addEventListener('fetch', e => {
    if (e.request.url.includes('/api/')) return; // Don't cache API
    e.respondWith(
        caches.match(e.request).then(r => r || fetch(e.request))
    );
});
