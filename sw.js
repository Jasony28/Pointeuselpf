// sw.js - Service Worker pour le mode hors ligne

const CACHE_NAME = 'pointeuse-pro-cache-v6'; // On incrémente encore la version
const urlsToCache = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  
  // Modules locaux
  './modules/add-entry.js',
  './modules/user-history.js',
  './modules/user-dashboard.js',
  './modules/admin-dashboard.js',
  './modules/admin-planning.js',
  './modules/admin-chantiers.js',
  './modules/admin-users.js',
  './modules/admin-colleagues.js',
  './modules/chantiers.js',
  
  // Icônes
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',

  // On met en cache les librairies JS externes
  'https://unpkg.com/jspdf@latest/dist/jspdf.umd.min.js',
  'https://unpkg.com/jspdf-autotable@latest/dist/jspdf.plugin.autotable.js',
  'https://cdn.jsdelivr.net/npm/sortablejs@latest/Sortable.min.js',

  // ON RETIRE TAILWIND ET GOOGLE FONTS DU CACHE CAR ILS POSENT DES PROBLÈMES DE CORS
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('Cache ouvert et mise à jour des fichiers.');
      const promises = urlsToCache.map(url => {
        return cache.add(url).catch(err => {
          console.warn(`Échec de la mise en cache de ${url}`, err);
        });
      });
      return Promise.all(promises);
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
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});