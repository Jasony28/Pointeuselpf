// ====================================================================================
// SERVICE WORKER (sw.js) - Version "Pare-balles"
// ====================================================================================

importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js');

const { precaching, routing, strategies, core } = workbox;
core.setCacheNameDetails({ prefix: 'pointeuse-lpf-cache' });

// --- GESTION DE LA VERSION DE L'APPLICATION ---
// Cette version est cruciale et doit être synchronisée avec app.js
const APP_VERSION = 'v3';

// --- MISE EN CACHE DES FICHIERS DE BASE (PRECACHING) ---
// La liste de tous les fichiers essentiels au fonctionnement de l'application.
precaching.precacheAndRoute([
    // Fichiers principaux
    { url: './', revision: APP_VERSION },
    { url: 'index.html', revision: APP_VERSION },
    { url: 'app.js', revision: APP_VERSION },
    { url: 'manifest.json', revision: APP_VERSION },
    
    // Tous les modules JavaScript
    { url: 'modules/utils.js', revision: APP_VERSION },
    { url: 'modules/data-service.js', revision: APP_VERSION },
    { url: 'modules/add-entry.js', revision: APP_VERSION },
    { url: 'modules/user-dashboard.js', revision: APP_VERSION },
    { url: 'modules/user-history.js', revision: APP_VERSION },
    { url: 'modules/user-leave.js', revision: APP_VERSION },
    { url: 'modules/user-updates.js', revision: APP_VERSION },
    { url: 'modules/chantiers.js', revision: APP_VERSION },
    { url: 'modules/settings.js', revision: APP_VERSION },
    { url: 'modules/admin-chantiers.js', revision: APP_VERSION },
    { url: 'modules/admin-chantier-details.js', revision: APP_VERSION },
    { url: 'modules/admin-contracts.js', revision: APP_VERSION },
    { url: 'modules/admin-dashboard.js', revision: APP_VERSION },
    { url: 'modules/admin-data.js', revision: APP_VERSION },
    { url: 'modules/admin-hours-report.js', revision: APP_VERSION },
    { url: 'modules/admin-invoicing.js', revision: APP_VERSION },
    { url: 'modules/admin-leave.js', revision: APP_VERSION },
    { url: 'modules/admin-planning.js', revision: APP_VERSION },
    { url: 'modules/admin-tarifs.js', revision: APP_VERSION },
    { url: 'modules/admin-team.js', revision: APP_VERSION },
    { url: 'modules/admin-travel-report.js', revision: APP_VERSION },
    { url: 'modules/admin-updates.js', revision: APP_VERSION },
    { url: 'modules/admin-live-view.js', revision: APP_VERSION },
    
    // Icônes
    { url: 'icons/icon-192x192.png', revision: null },
    { url: 'icons/icon-512x512.png', revision: null },
]);

// --- STRATÉGIES DE CACHE DYNAMIQUES ---

routing.registerRoute(
    ({ request }) => request.mode === 'navigate',
    new strategies.NetworkFirst({ cacheName: 'pages' })
);

routing.registerRoute(
    ({ request }) => ['script', 'style'].includes(request.destination) && request.url.includes('cdn'),
    new strategies.StaleWhileRevalidate({ cacheName: 'cdn-assets' })
);

// --- GESTION INTELLIGENTE DES MISES À JOUR ---

self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', () => {
    clients.claim();
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage(APP_VERSION);
  }
});

