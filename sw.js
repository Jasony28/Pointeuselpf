// sw.js - Service Worker
// Nom du cache. DOIT être changé à chaque mise à jour majeure des fichiers.
const CACHE_NAME = 'pointeuse-pro-cache-v1.1.0';

// Liste complète de tous les fichiers nécessaires au fonctionnement de l'application.
const urlsToCache = [
  // Fichiers de base
  './',
  './index.html',
  './app.js',
  './manifest.json',
  
  // Tous les modules JavaScript locaux
  './modules/utils.js',
  './modules/add-entry.js',
  './modules/user-dashboard.js',
  './modules/user-history.js',
  './modules/user-updates.js',
  './modules/chantiers.js',
  './modules/admin-dashboard.js',
  './modules/admin-planning.js',
  './modules/admin-chantiers.js',
  './modules/admin-chantier-details.js',
  './modules/admin-data.js',
  './modules/admin-tarifs.js',
  './modules/admin-users.js',
  './modules/admin-colleagues.js',
  './modules/admin-travel-report.js',
  './modules/admin-updates.js',
  
  // Icônes de l'application
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',

  // Librairies JS externes, mises en cache pour le mode hors ligne
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/jspdf@latest/dist/jspdf.umd.min.js',
  'https://unpkg.com/jspdf-autotable@latest/dist/jspdf.plugin.autotable.js',
  'https://cdn.jsdelivr.net/npm/sortablejs@latest/Sortable.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js'
];

/**
 * Étape d'installation : le Service Worker est installé.
 * On ouvre le cache et on y ajoute tous nos fichiers.
 */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('Service Worker: Cache ouvert, ajout des fichiers de base.');
      return cache.addAll(urlsToCache).catch(err => {
        console.error("Service Worker: Échec de la mise en cache d'un fichier lors de l'installation.", err);
      });
    })
  );
});

/**
 * Étape d'activation : le nouveau Service Worker prend le contrôle.
 * On supprime tous les anciens caches pour libérer de l'espace.
 */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => Promise.all(
      cacheNames.map(cacheName => {
        if (cacheName !== CACHE_NAME) {
          console.log("Service Worker: Suppression de l'ancien cache:", cacheName);
          return caches.delete(cacheName);
        }
      })
    )).then(() => self.clients.claim()) // Prend le contrôle immédiatement
  );
});

/**
 * Étape de Fetch : Intercepte toutes les requêtes réseau de l'application.
 * C'est ici qu'on décide de servir depuis le cache ou le réseau.
 */
self.addEventListener('fetch', event => {
  const { request } = event;

  // Pour les requêtes vers les API externes (Firebase, Mapbox, etc.), on va TOUJOURS sur le réseau.
  if (request.url.startsWith('https://firestore.googleapis.com') || request.url.startsWith('https://api.mapbox.com')) {
    event.respondWith(fetch(request));
    return;
  }

  // Stratégie "Network First" pour la navigation (la page HTML principale)
  // pour s'assurer que l'utilisateur a toujours la dernière version de l'application.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => {
        return caches.match(request);
      })
    );
    return;
  }

  // Stratégie "Stale-While-Revalidate" pour tout le reste (JS, icônes, etc.)
  // pour un chargement quasi-instantané.
  event.respondWith(
    caches.open(CACHE_NAME).then(cache => {
      return cache.match(request).then(cachedResponse => {
        const fetchPromise = fetch(request).then(networkResponse => {
          cache.put(request, networkResponse.clone());
          return networkResponse;
        });
        return cachedResponse || fetchPromise;
      });
    })
  );
});

/**
 * Écoute les messages venant de l'application, notamment pour forcer la mise à jour.
 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
