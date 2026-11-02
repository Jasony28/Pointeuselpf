importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js');

const { precaching, routing, strategies, core } = workbox;
core.setCacheNameDetails({ prefix: 'pointeuse-lpf-cache' });

// Version synchronisée avec app.js
const APP_VERSION = 'v4.9.3'; // <--- CHANGEMENT ICI

precaching.precacheAndRoute([
    { url: './', revision: APP_VERSION },
    { url: 'index.html', revision: APP_VERSION },
    { url: 'app.js', revision: APP_VERSION },
    { url: 'splash.js', revision: APP_VERSION },
    { url: 'styles/app.css', revision: APP_VERSION },
    { url: 'styles/tailwind.css', revision: APP_VERSION },
    { url: 'manifest.json', revision: APP_VERSION },
    
    // Modules principaux
    { url: 'modules/utils.js', revision: APP_VERSION },
    { url: 'modules/data-service.js', revision: APP_VERSION },
    { url: 'modules/updates-data.js', revision: APP_VERSION },
    { url: 'modules/native-files.js', revision: APP_VERSION },
    { url: 'modules/settings.js', revision: APP_VERSION },
    { url: 'modules/push.js', revision: APP_VERSION },
    { url: 'modules/chantiers.js', revision: APP_VERSION },
    { url: 'modules/work-profile.js', revision: APP_VERSION },

    // Modules Utilisateur
    { url: 'modules/user-dashboard.js', revision: APP_VERSION },
    { url: 'modules/trips.js', revision: APP_VERSION },
    { url: 'modules/chantier-picker.js', revision: APP_VERSION },
    { url: 'modules/mail.js', revision: APP_VERSION },
    { url: 'modules/user-history.js', revision: APP_VERSION },
    { url: 'modules/user-leave.js', revision: APP_VERSION },
    { url: 'modules/user-stats.js', revision: APP_VERSION },
    { url: 'modules/user-chat.js', revision: APP_VERSION }, // <--- AJOUT IMPORTANT DU FICHIER CHAT
    { url: 'modules/user-route.js', revision: APP_VERSION },
    { url: 'modules/route-planner.js', revision: APP_VERSION },
    { url: 'modules/retours-clients.js', revision: APP_VERSION },
    { url: 'modules/user-retours.js', revision: APP_VERSION },

    // Modules Admin
    { url: 'modules/admin-chantiers.js', revision: APP_VERSION },
    { url: 'modules/auto-planner.js', revision: APP_VERSION },
    { url: 'modules/auto-planner-worker.js', revision: APP_VERSION },
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
    { url: 'modules/admin-retours.js', revision: APP_VERSION },
    
    // Ressources statiques
    { url: 'icons/lpf-192.png', revision: APP_VERSION },
    { url: 'icons/lpf-180.png', revision: APP_VERSION },
    { url: 'icons/lpf-512.png', revision: APP_VERSION },
    // Thème « Chat »
    { url: 'themes/chat/chat-assis-jour.svg', revision: APP_VERSION },
    { url: 'themes/chat/chat-assis-nuit.svg', revision: APP_VERSION },
    { url: 'themes/chat/chat-coucou-jour.svg', revision: APP_VERSION },
    { url: 'themes/chat/chat-coucou-nuit.svg', revision: APP_VERSION },
    { url: 'themes/chat/chat-dodo-jour.svg', revision: APP_VERSION },
    { url: 'themes/chat/chat-dodo-nuit.svg', revision: APP_VERSION },
    { url: 'themes/chat/etoiles.svg', revision: APP_VERSION },
    { url: 'themes/chat/motif-pattes-jour.svg', revision: APP_VERSION },
    { url: 'themes/chat/motif-pattes-nuit.svg', revision: APP_VERSION },
    { url: 'themes/chat/patte.svg', revision: APP_VERSION },
    { url: 'themes/chat/pelote-jour.svg', revision: APP_VERSION },
    { url: 'themes/chat/pelote-nuit.svg', revision: APP_VERSION },
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

// Discussion ouverte à l'écran (envoyée par la messagerie) : pas de notification pour elle
let activeChatId = null;

// Nouvelle version : activée dès qu'elle est téléchargée, sans rien demander. Les téléphones qui ont encore
// l'ancien bandeau « Mettre à jour / Plus tard » ne le voient pas : il n'a pas le temps de s'afficher.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
    if (event.data && event.data.type === 'ACTIVE_CHAT') activeChatId = event.data.chatId || null;
});

// --- NOTIFICATIONS (Firebase Cloud Messaging) ---
// Le serveur envoie des messages « data » : { title, body, tag, page, chat }. C'est ce fichier qui les affiche.
self.addEventListener('push', (event) => {
    let payload = {};
    try { payload = event.data ? event.data.json() : {}; } catch (error) { payload = {}; }
    const data = { ...(payload.notification || {}), ...(payload.data || {}) };
    if (!data.title) return;

    event.waitUntil((async () => {
        // iPhone et Mac : Safari coupe l'abonnement si une notification reçue n'est pas affichée, on l'affiche donc toujours
        const ua = self.navigator?.userAgent || '';
        const isSafari = /Safari/.test(ua) && !/Chrome|Chromium|CriOS|Edg|Android/.test(ua);
        if (data.chat && data.chat === activeChatId && !isSafari) {
            const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
            if (windows.some(w => w.visibilityState === 'visible')) return; // déjà en train de lire cette discussion
        }
        await self.registration.showNotification(data.title, {
            body: data.body || '',
            icon: 'icons/lpf-192.png',
            badge: 'icons/lpf-192.png',
            tag: data.tag || undefined,       // même discussion = la notification est remplacée, pas empilée
            renotify: !!data.tag,
            data: { page: data.page || '', chat: data.chat || '' },
        });
    })());
});

// Toucher la notification : ouvre le bon écran (appli déjà ouverte → elle y va, sinon elle démarre dessus)
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const { page = '', chat = '' } = event.notification.data || {};
    const params = new URLSearchParams();
    if (page) params.set('page', page);
    if (chat) params.set('chat', chat);
    const url = new URL(`./${params.toString() ? `?${params}` : ''}`, self.registration.scope).href;

    event.waitUntil((async () => {
        const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
        const open = windows.find(w => new URL(w.url).origin === self.location.origin);
        if (open) {
            await open.focus();
            if (page) open.postMessage({ type: 'OPEN_PAGE', page, chat });
            return;
        }
        await clients.openWindow(url);
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});
