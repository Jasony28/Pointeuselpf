// sw.js - Version finale et robuste

importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js');

if (workbox) {
  console.log(`[Workbox] Chargement réussi 🎉`);

  // --- VERSION DE L'APPLICATION ---
  // DOIT être exactement le même numéro que dans app.js
  const APP_VERSION = 'v1.2.8';

  // --- MISE EN CACHE DES FICHIERS DE BASE (PRECACHING) ---
  const precacheManifest = [
    // Fichiers de base liés à la version
    { url: './', revision: APP_VERSION },
    { url: 'index.html', revision: APP_VERSION },
    { url: 'app.js', revision: APP_VERSION },
    { url: 'manifest.json', revision: APP_VERSION },
    
    // Tous les modules JavaScript locaux, liés à la version
    { url: 'modules/utils.js', revision: APP_VERSION },
    { url: 'modules/user-dashboard.js', revision: APP_VERSION },
    { url: 'modules/user-history.js', revision: APP_VERSION },
    { url: 'modules/user-updates.js', revision: APP_VERSION },
    { url: 'modules/chantiers.js', revision: APP_VERSION },
    { url: 'modules/admin-dashboard.js', revision: APP_VERSION },
    { url: 'modules/admin-planning.js', revision: APP_VERSION },
    { url: 'modules/admin-chantiers.js', revision: APP_VERSION },
    { url: 'modules/admin-chantier-details.js', revision: APP_VERSION },
    { url: 'modules/admin-data.js', revision: APP_VERSION },
    { url: 'modules/admin-tarifs.js', revision: APP_VERSION },
    { url: 'modules/admin-team.js', revision: APP_VERSION }, // On utilise le nouveau fichier team
    { url: 'modules/admin-travel-report.js', revision: APP_VERSION },
    { url: 'modules/admin-hours-report.js', revision: APP_VERSION }, // Le nouveau rapport
    { url: 'modules/admin-updates.js', revision: APP_VERSION },
    
    // Les icônes changent rarement, on peut laisser 'null'
    { url: 'icons/icon-192x192.png', revision: null },
    { url: 'icons/icon-512x512.png', revision: null },
  ];

  workbox.precaching.precacheAndRoute(precacheManifest);

  // --- RÈGLES DE ROUTAGE (pas de changement ici) ---
  workbox.routing.registerRoute(
    ({ request }) => request.mode === 'navigate',
    new workbox.strategies.NetworkFirst({ cacheName: 'pages-cache' })
  );

  workbox.routing.registerRoute(
    ({ request }) => 
      request.destination === 'script' || request.destination === 'style' ||
      request.url.startsWith('https://cdn.tailwindcss.com') || request.url.startsWith('https://unpkg.com'),
    new workbox.strategies.StaleWhileRevalidate({ cacheName: 'assets-cache' })
  );
  
  workbox.routing.registerRoute(
    ({ url }) => url.hostname === 'api.mapbox.com',
    new workbox.strategies.NetworkOnly()
  );

  // --- GESTION DES MISES À JOUR (pas de changement ici) ---
  self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
      self.skipWaiting();
    }
  });

} else {
  console.log(`[Workbox] Le chargement a échoué.`);

}

