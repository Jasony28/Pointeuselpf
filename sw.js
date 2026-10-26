importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js');

const { precaching, routing, strategies, core } = workbox;
core.setCacheNameDetails({ prefix: 'pointeuse-lpf-cache' });

// Version synchronisée avec app.js
const APP_VERSION = 'v3.8.4'; // <--- CHANGEMENT ICI

precaching.precacheAndRoute([
    { url: './', revision: APP_VERSION },
    { url: 'index.html', revision: APP_VERSION },
    { url: 'app.js', revision: APP_VERSION },
    { url: 'splash.js', revision: APP_VERSION },
    { url: 'styles/app.css', revision: APP_VERSION },
    { url: 'manifest.json', revision: APP_VERSION },
    
    // Modules principaux
    { url: 'modules/utils.js', revision: APP_VERSION },
    { url: 'modules/data-service.js', revision: APP_VERSION },
    { url: 'modules/updates-data.js', revision: APP_VERSION },
    { url: 'modules/settings.js', revision: APP_VERSION },
    { url: 'modules/chantiers.js', revision: APP_VERSION },

    // Modules Utilisateur
    { url: 'modules/user-dashboard.js', revision: APP_VERSION },
    { url: 'modules/trips.js', revision: APP_VERSION },
    { url: 'modules/user-history.js', revision: APP_VERSION },
    { url: 'modules/user-leave.js', revision: APP_VERSION },
    { url: 'modules/user-stats.js', revision: APP_VERSION },
    { url: 'modules/user-chat.js', revision: APP_VERSION }, // <--- AJOUT IMPORTANT DU FICHIER CHAT
    { url: 'modules/user-route.js', revision: APP_VERSION },
    { url: 'modules/route-planner.js', revision: APP_VERSION },

    // Modules Admin
    { url: 'modules/admin-chantiers.js', revision: APP_VERSION },
    { url: 'modules/admin-chantier-details.js', revision: APP_VERSION },
    { url: 'modules/admin-contracts.js', revision: APP_VERSION },
    { url: 'modules/admin-dashboard.js', revision: APP_VERSION },
    { url: 'modules/admin-hours-report.js', revision: APP_VERSION },
    { url: 'modules/admin-invoicing.js', revision: APP_VERSION },
    { url: 'modules/admin-leave.js', revision: APP_VERSION },
    { url: 'modules/admin-planning.js', revision: APP_VERSION },
    { url: 'modules/admin-team.js', revision: APP_VERSION },
    { url: 'modules/admin-travel-report.js', revision: APP_VERSION },
    { url: 'modules/admin-live-view.js', revision: APP_VERSION },
    
    // Ressources statiques
    { url: 'icons/lpf-192.png', revision: APP_VERSION },
    { url: 'icons/lpf-180.png', revision: APP_VERSION },
    { url: 'icons/lpf-512.png', revision: APP_VERSION },
]);

// Stratégie pour les pages HTML
routing.registerRoute(
    ({ request }) => request.mode === 'navigate',
    new strategies.NetworkFirst({ cacheName: 'pages' })
);

// Stratégie pour les polices Google Fonts
routing.registerRoute(
    ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
    new strategies.StaleWhileRevalidate({
        cacheName: 'google-fonts',
    })
);

// Bibliothèques externes (Firebase, Tailwind, Chart.js, PDF…) : gardées sur le téléphone pour démarrer sans réseau
const LIB_HOSTS = ['www.gstatic.com', 'cdn.tailwindcss.com', 'cdn.jsdelivr.net', 'unpkg.com', 'storage.googleapis.com', 'cdnjs.cloudflare.com'];
routing.registerRoute(
    ({ url }) => LIB_HOSTS.includes(url.hostname),
    new strategies.StaleWhileRevalidate({ cacheName: 'cdn-assets' })
);

// Fichiers de l'appli non listés plus haut (autres modules, images) : gardés après la première visite
routing.registerRoute(
    ({ url, request }) => url.origin === self.location.origin && ['script', 'style', 'image'].includes(request.destination),
    new strategies.StaleWhileRevalidate({ cacheName: 'app-files' })
);

// La nouvelle version attend que l'utilisateur appuie sur « Mettre à jour » (pop-up dans app.js)
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});
