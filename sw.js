// Offline-tuki: sovelluksen tiedostot välimuistiin, data pysyy localStoragessa.
const CACHE = 'pelikirja-v3';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/fonts.css',
  './css/styles.css',
  './js/app.js',
  './js/icons.js',
  './js/store.js',
  './js/tactics.js',
  './js/timing.js',
  './js/merge.js',
  './js/sync.js',
  './js/ui.js',
  './js/formations.js',
  './js/views/matches.js',
  './js/views/home.js',
  './js/views/match.js',
  './js/views/lineups.js',
  './js/views/players.js',
  './js/views/pitch.js',
  './js/views/tracking.js',
  './js/views/stats.js',
  './js/views/settings.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()));
});

// Rajapintakutsut eivät kuulu välimuistiin: ne on aina haettava verkosta.
const isApiCall = (url) =>
  url.origin !== self.location.origin
  || url.pathname.includes('/rest/v1/')
  || url.pathname.includes('/auth/v1/');

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (isApiCall(new URL(e.request.url))) return;
  e.respondWith(
    caches.match(e.request).then((hit) => {
      if (hit) {
        // Päivitä välimuisti taustalla.
        fetch(e.request).then((res) => {
          if (res && res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
        }).catch(() => {});
        return hit;
      }
      return fetch(e.request)
        .then((res) => {
          if (res && res.ok && new URL(e.request.url).origin === location.origin) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => caches.match('./index.html'));
    }));
});
