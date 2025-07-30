// sw.js - Service Worker

const CACHE_NAME = 'pointeuse-pro-cache-v7.2'; // Vous pouvez incrémenter la version si vous le souhaitez, ex: v8.0
const urlsToCache = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  
  // Modules locaux
  // CORRECTION: Ajout des nouveaux modules à la liste du cache
  './modules/utils.js',
  './modules/add-entry.js',
  './modules/user-history.js',
  './modules/user-dashboard.js',
  './modules/admin-dashboard.js',
  './modules/admin-planning.js',
  './modules/admin-chantiers.js',
  './modules/admin-chantier-details.js', // Ajouté
  './modules/admin-data.js',             // Ajouté
  './modules/admin-tarifs.js',           // Ajouté
  './modules/admin-users.js',
  './modules/admin-colleagues.js',
  './modules/chantiers.js',
  
  // Icônes
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',

  // Librairies JS externes pour le mode hors ligne
  'https://unpkg.com/jspdf@latest/dist/jspdf.umd.min.js',
  'https://unpkg.com/jspdf-autotable@latest/dist/jspdf.plugin.autotable.js',
  'https://cdn.jsdelivr.net/npm/sortablejs@latest/Sortable.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js' // Ajouté car utilisé
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('Cache ouvert et mise à jour des fichiers.');
      return cache.addAll(urlsToCache).catch(err => {
        console.warn("Certains fichiers externes n'ont pas pu être mis en cache. Le mode hors ligne peut être limité.", err);
      });
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
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
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});