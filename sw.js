// sw.js - Service Worker pour le mode hors ligne

const CACHE_NAME = 'pointeuse-pro-cache-v3'; // Nom du cache mis à jour
const urlsToCache = [
  // Adaptez le chemin si votre site n'est pas à la racine
  // Si votre site est à https://jasony28.github.io/pointeuse/
  // alors le chemin './' est correct pour les tests locaux et '/pointeuse/' pour github
  './',
  './index.html',
  './app.js',
  './manifest.json',
  './modules/add-entry.js',
  './modules/user-history.js',
  './modules/user-dashboard.js',
  './modules/admin-dashboard.js',
  './modules/admin-planning.js',
  './modules/admin-chantiers.js',
  './modules/admin-users.js',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png'
  // On retire la ligne tailwindcss qui causait l'erreur CORS
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('Cache ouvert');
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
          return caches.delete(cacheName);
        }
      })
    ))
  );
  return self.clients.claim();
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});