// sw.js - Service Worker pour le mode hors ligne

const CACHE_NAME = 'pointeuse-pro-cache-v4'; // IMPORTANT : Version du cache mise à jour
const urlsToCache = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  // On s'assure que TOUS les modules sont inclus
  './modules/add-entry.js',
  './modules/user-history.js',
  './modules/user-dashboard.js',
  './modules/admin-dashboard.js',
  './modules/admin-planning.js',
  './modules/admin-chantiers.js',
  './modules/admin-users.js',
  './modules/admin-colleagues.js', // NOUVEAU
  './modules/chantiers.js',       // NOUVEAU
  // Icônes
  './icons/icon-192x192.png',
  './icons/icon-512x512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('Cache ouvert et mise à jour des fichiers.');
      return cache.addAll(urlsToCache);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => Promise.all(
      cacheNames.map(cacheName => {
        if (cacheName !== CACHE_NAME) {
          console.log("Suppression de l'ancien cache:", cacheName);
          return caches.delete(cacheName);
        }
      })
    ))
  );
  return self.clients.claim();
});

self.addEventListener('fetch', event => {
  // Stratégie "Cache d'abord, puis réseau"
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});