importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js');

const { precaching, routing, strategies, core } = workbox;
core.setCacheNameDetails({ prefix: 'pointeuse-lpf-cache' });

const APP_VERSION = 'v3.1.1';

precaching.precacheAndRoute([
    { url: './', revision: APP_VERSION },
    { url: 'index.html', revision: APP_VERSION },
    { url: 'app.js', revision: APP_VERSION },
    { url: 'manifest.json', revision: APP_VERSION },
    
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
    
    { url: 'icons/icon-192x192.png', revision: null },
    { url: 'icons/icon-512x512.png', revision: null },
]);

routing.registerRoute(
    ({ request }) => request.mode === 'navigate',
    new strategies.NetworkFirst({ cacheName: 'pages' })
);

routing.registerRoute(
    ({ request }) => ['script', 'style'].includes(request.destination) && request.url.includes('cdn'),
    new strategies.StaleWhileRevalidate({ cacheName: 'cdn-assets' })
);

self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});