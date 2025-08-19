// sw.js - Version robuste avec Workbox

// 1. On importe la "boîte à outils" Workbox depuis le CDN de Google.
importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js');

// On s'assure que Workbox a bien été chargé.
if (workbox) {
  console.log(`[Workbox] Chargement réussi 🎉`);

  // --- MISE EN CACHE DES FICHIERS DE BASE (PRECACHING) ---
  
  // Workbox a besoin d'une liste de tous les fichiers qui composent "l'application de base" (le shell).
  // Si un seul de ces fichiers change, Workbox installera intelligemment la nouvelle version.
  const precacheManifest = [
    // Fichiers de base
    { url: './', revision: null },
    { url: 'index.html', revision: null },
    { url: 'app.js', revision: null },
    { url: 'manifest.json', revision: null },
    
    // Tous les modules JavaScript locaux (add-entry.js a été retiré)
    { url: 'modules/utils.js', revision: null },
    { url: 'modules/user-dashboard.js', revision: null },
    { url: 'modules/user-history.js', revision: null },
    { url: 'modules/user-updates.js', revision: null },
    { url: 'modules/chantiers.js', revision: null },
    { url: 'modules/admin-dashboard.js', revision: null },
    { url: 'modules/admin-planning.js', revision: null },
    { url: 'modules/admin-chantiers.js', revision: null },
    { url: 'modules/admin-chantier-details.js', revision: null },
    { url: 'modules/admin-data.js', revision: null },
    { url: 'modules/admin-tarifs.js', revision: null },
    { url: 'modules/admin-users.js', revision: null },
    { url: 'modules/admin-colleagues.js', revision: null },
    { url: 'modules/admin-travel-report.js', revision: null },
    { url: 'modules/admin-updates.js', revision: null },
    
    // Icônes de l'application
    { url: 'icons/icon-192x192.png', revision: null },
    { url: 'icons/icon-512x512.png', revision: null },
  ];

  // On dit à Workbox d'utiliser cette liste.
  workbox.precaching.precacheAndRoute(precacheManifest);

  // --- RÈGLES DE ROUTAGE POUR LES REQUÊTES DYNAMIQUES ---

  // Règle 1 : Les pages HTML (navigation)
  workbox.routing.registerRoute(
    ({ request }) => request.mode === 'navigate',
    new workbox.strategies.NetworkFirst({
      cacheName: 'pages-cache',
    })
  );

  // Règle 2 : Les fichiers JS, CSS, et les librairies externes (CDNs)
  workbox.routing.registerRoute(
    ({ request }) => 
      request.destination === 'script' ||
      request.destination === 'style' ||
      request.url.startsWith('https://cdn.tailwindcss.com') ||
      request.url.startsWith('https://unpkg.com'),
    new workbox.strategies.StaleWhileRevalidate({
      cacheName: 'assets-cache',
    })
  );
  
  // Règle 3 : Les requêtes vers l'API Mapbox
  workbox.routing.registerRoute(
    ({ url }) => url.hostname === 'api.mapbox.com',
    new workbox.strategies.NetworkOnly()
  );

  // --- GESTION DES MISES À JOUR ---
  self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
      self.skipWaiting();
    }
  });

} else {
  console.log(`[Workbox] Le chargement a échoué 😬`);
}