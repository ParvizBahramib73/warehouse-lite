const PREFIX = 'warehouse-lite-v02-shell-';
const CACHE = `${PREFIX}v021-20261128b`;
const LEGACY_PREFIX = 'warehouse-lite-shell-v';
const SCOPE_PATH = new URL(self.registration.scope).pathname;
const SHELL=['./','./index.html','./app.css','./src/app.js','./src/domain.js','./src/data.js','./src/backup.js','./src/utils.js','./src/jalali.js','./src/rial-input.js','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install', event => event.waitUntil(
  caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting())
));
self.addEventListener('activate', event => event.waitUntil(Promise.all([
  caches.keys().then(keys => Promise.all(keys
    .filter(key => (key.startsWith(PREFIX) || key.startsWith(LEGACY_PREFIX)) && key !== CACHE)
    .map(key => caches.delete(key)))),
  self.clients.claim(),
])));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(SCOPE_PATH)) return;
  event.respondWith(caches.open(CACHE).then(cache => cache.match(event.request).then(cached =>
    cached || fetch(event.request).then(response => {
      if (response.ok) cache.put(event.request, response.clone());
      return response;
    })
  )));
});
