import { updatesLog } from './modules/updates-data.js';
import { installNativeFileSaving } from './modules/native-files.js';

const APP_VERSION = 'v3.9.1';

// Appli Android / iPhone : PDF et CSV proposés dans le menu « Partager » du téléphone
installNativeFileSaving();

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-app.js";
import { getAuth, initializeAuth, indexedDBLocalPersistence, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, signOut } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp, updateDoc, deleteField, initializeFirestore, CACHE_SIZE_UNLIMITED, persistentLocalCache, persistentMultipleTabManager, collection, addDoc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";

// L'événement d'installation (beforeinstallprompt) est capturé dans index.html, avant le chargement de Firebase.

// --- THÈMES ---
// Surfaces neutres et blanches pour tous les thèmes clairs : seule la couleur d'accent change.
// Les clés sont conservées pour rester compatibles avec le choix déjà enregistré par chaque utilisateur.
const lightBase = { '--color-background': '#f5f6f8', '--color-surface': '#ffffff', '--color-text-base': '#0f172a', '--color-text-muted': '#64748b', '--color-border': '#e4e7ec' };

export const themes = {
    neutre:   { name: 'Indigo',   preview: '#4f46e5', colors: { ...lightBase, '--color-primary': '#4f46e5', '--color-primary-hover': '#4338ca' } },
    ocean:    { name: 'Océan',    preview: '#0e7490', colors: { ...lightBase, '--color-primary': '#0e7490', '--color-primary-hover': '#155e75' } },
    limonade: { name: 'Émeraude', preview: '#047857', colors: { ...lightBase, '--color-primary': '#047857', '--color-primary-hover': '#065f46' } },
    violette: { name: 'Violet',   preview: '#7c3aed', colors: { ...lightBase, '--color-primary': '#7c3aed', '--color-primary-hover': '#6d28d9' } },
    magenta:  { name: 'Prune',    preview: '#a21caf', colors: { ...lightBase, '--color-primary': '#a21caf', '--color-primary-hover': '#86198f' } },
    rubis:    { name: 'Rubis',    preview: '#be123c', colors: { ...lightBase, '--color-primary': '#be123c', '--color-primary-hover': '#9f1239' } },
    soleil:   { name: 'Ambre',    preview: '#c2410c', colors: { ...lightBase, '--color-primary': '#c2410c', '--color-primary-hover': '#9a3412' } },
    carbone:  {
        name: 'Sombre', preview: '#0f172a', dark: true,
        colors: { '--color-primary': '#6366f1', '--color-primary-hover': '#818cf8', '--color-background': '#0b1120', '--color-surface': '#111827', '--color-text-base': '#e5e7eb', '--color-text-muted': '#94a3b8', '--color-border': '#1f2937' }
    },
    chat_clair: {
        name: 'Maine Coon ☀️',
        preview: '#f59e0b',
        glass: true,
        colors: {
            '--color-primary': '#d97706',
            '--color-primary-hover': '#b45309',
            '--color-background': '#fdfbf7',
            '--color-surface': 'rgba(255, 255, 255, 0.75)',
            '--color-text-base': '#291e1a',
            '--color-text-muted': '#785b4d',
            '--color-border': 'rgba(120, 91, 77, 0.18)',
            '--bg-image': 'linear-gradient(rgba(253, 251, 247, 0.5), rgba(253, 251, 247, 0.85)), url("./maincoon3.jpg")',
            '--bg-size': 'cover',
            '--bg-position': 'center',
            '--bg-attachment': 'fixed',
            '--bg-repeat': 'no-repeat',
            '--glass-blur': 'blur(16px)',
        }
    },
    chat_sombre: {
        name: 'Maine Coon 🌙',
        preview: '#291e1a',
        dark: true,
        glass: true,
        colors: {
            '--color-primary': '#f59e0b',
            '--color-primary-hover': '#fbbf24',
            '--color-background': '#1c1917',
            '--color-surface': 'rgba(28, 25, 23, 0.75)',
            '--color-text-base': '#fef3c7',
            '--color-text-muted': '#d6d3d1',
            '--color-border': 'rgba(245, 158, 11, 0.15)',
            '--bg-image': 'linear-gradient(rgba(28, 25, 23, 0.75), rgba(28, 25, 23, 0.95)), url("./maincoon1.jpg")',
            '--bg-size': 'cover',
            '--bg-position': 'center',
            '--bg-attachment': 'fixed',
            '--bg-repeat': 'no-repeat',
            '--glass-blur': 'blur(16px)',
        }
    }
};

const themeVariables = ['--bg-image', '--bg-size', '--bg-position', '--bg-attachment', '--bg-repeat', '--glass-blur'];

// Mode clair / sombre, indépendant de la couleur choisie ('light' | 'dark' | 'auto' = réglage du téléphone)
const darkBase = { '--color-background': '#0b1120', '--color-surface': '#111827', '--color-text-base': '#e5e7eb', '--color-text-muted': '#94a3b8', '--color-border': '#1f2937' };
const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

export function getAppMode() {
    return localStorage.getItem('appMode') || 'light';
}

export function setAppMode(mode) {
    localStorage.setItem('appMode', mode);
    applyTheme(localStorage.getItem('appTheme') || 'neutre');
}

systemDark.addEventListener('change', () => {
    if (getAppMode() === 'auto') applyTheme(localStorage.getItem('appTheme') || 'neutre');
});

export function applyTheme(themeName) {
    const theme = themes[themeName] || themes['neutre'];
    const root = document.documentElement;
    const mode = getAppMode();
    const wantsDark = mode === 'dark' || (mode === 'auto' && systemDark.matches);
    // Les thèmes Maine Coon gardent leur propre ambiance ; les autres couleurs suivent le mode choisi
    const dark = theme.glass ? !!theme.dark : (theme.dark || wantsDark);
    const colors = (dark && !theme.dark && !theme.glass) ? { ...theme.colors, ...darkBase } : theme.colors;

    themeVariables.forEach(key => root.style.removeProperty(key));
    for (const [key, value] of Object.entries(colors)) {
        root.style.setProperty(key, value);
    }
    root.classList.toggle('dark', dark);
    root.classList.toggle('glass', !!theme.glass);

    applyChartDefaults();
    localStorage.setItem('appTheme', themeName);
}

// Aligne Chart.js (chargé en script classique) sur la typographie et les couleurs du thème
function applyChartDefaults() {
    if (!window.Chart) return;
    const styles = getComputedStyle(document.documentElement);
    window.Chart.defaults.font.family = 'Inter, ui-sans-serif, system-ui, sans-serif';
    window.Chart.defaults.font.size = 12;
    window.Chart.defaults.color = styles.getPropertyValue('--color-text-muted').trim();
    window.Chart.defaults.borderColor = styles.getPropertyValue('--color-border').trim();
}

applyTheme(localStorage.getItem('appTheme') || 'neutre');

const firebaseConfig = {
  apiKey: "AIzaSyDm-C8VDT1Td85WUBWR7MxlrjDkY78eoHs",
  authDomain: "pointeuse-lpf.firebaseapp.com",
  projectId: "pointeuse-lpf",
  storageBucket: "pointeuse-lpf.firebasestorage.app",
  messagingSenderId: "649868999549",
  appId: "1:649868999549:web:aa54b056faaca0924f6a14",
  measurementId: "G-Q8WQGCDPFX"
};

const app = initializeApp(firebaseConfig);
// Appli App Store / Play Store (Capacitor) : getAuth() peut rester bloqué dans la vue web native,
// on fixe donc explicitement le stockage de session. Sur le site web, rien ne change.
export const isNativeApp = !!window.Capacitor?.isNativePlatform?.();
const auth = isNativeApp ? initializeAuth(app, { persistence: indexedDBLocalPersistence }) : getAuth(app);
// Cache Firestore persistant (IndexedDB) : réouverture plus rapide et données consultables hors ligne.
// Si le stockage n'est pas disponible (navigation privée…), Firestore repasse seul en cache mémoire.
function firestoreSettings() {
    try {
        return { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager(), cacheSizeBytes: CACHE_SIZE_UNLIMITED }) };
    } catch (error) {
        console.warn("Cache persistant indisponible, cache mémoire utilisé :", error);
        return { cacheSizeBytes: CACHE_SIZE_UNLIMITED };
    }
}
export const db = initializeFirestore(app, firestoreSettings());

export const pageContent = document.getElementById('page-content');
export let currentUser = null;
export let isAdmin = false;
export let isMasqueradingAsUser = false;
export let isShowingAllHours = false;
let genericModal, modalTitle, modalMessage, modalConfirmBtn, modalCancelBtn;

const STEALTH_PIN = "1801";

export const isStealthMode = () => localStorage.getItem('stealthMode') === 'true';

export function isEffectiveAdmin() {
    return isAdmin && !isMasqueradingAsUser;
}

// --- ICÔNES DE NAVIGATION (tracé 24×24, style "outline") ---
const icons = {
    calendar: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
    building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/>',
    message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l4 2"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
    settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    live: '<circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14"/>',
    planning: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M8 14h3M8 17h6"/>',
    invoice: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
    card: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6 16c.5-1.5 1.7-2 3-2s2.5.5 3 2M15 10h3M15 13h3"/>',
    route: '<circle cx="6" cy="19" r="3"/><circle cx="18" cy="5" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    alert: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
    bug: '<path d="M8 2l1.88 1.88M14.12 3.88 16 2M9 7.13v-1a3 3 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6zM12 20v-9M6.53 9C4.6 8.8 3 7.1 3 5M6 13H2M3 21c0-2.1 1.7-3.9 3.8-4M20.97 5c0 2.1-1.6 3.8-3.5 4M22 13h-4M17.2 17c2.1.1 3.8 1.9 3.8 4"/>',
    more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
};

const iconSvg = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.dashboard}</svg>`;

// short : libellé court affiché dans la barre d'onglets mobile (onglets principaux uniquement)
const userTabs = [
    { id: 'user-dashboard', name: 'Planning', short: 'Planning', icon: 'calendar' },
    { id: 'chantiers', name: 'Infos chantiers', short: 'Chantiers', icon: 'building' },
    { id: 'user-history', name: 'Mon historique', short: 'Historique', icon: 'history' },
    { id: 'user-route', name: 'Ma tournée', short: 'Tournée', icon: 'route' },
    { id: 'settings', name: 'Paramètres', icon: 'settings' },
    { id: 'user-leave', name: 'Mes congés', icon: 'sun' },
    { id: 'user-chat', name: 'Messagerie', icon: 'message' },
    { id: 'user-stats', name: 'Mes statistiques', icon: 'chart' },
];

const adminTabs = [
    { id: 'admin-dashboard', name: 'Tableau de bord', short: 'Accueil', icon: 'dashboard' },
    { id: 'admin-live-view', name: 'En direct', short: 'Direct', icon: 'live' },
    { id: 'admin-planning', name: 'Planification', short: 'Planning', icon: 'planning' },
    { id: 'admin-invoicing', name: 'Heures chantiers', icon: 'chart' },
    { id: 'admin-contracts', name: 'Fiches équipe', icon: 'card' },
    { id: 'admin-chantiers', name: 'Chantiers', icon: 'building' },
    { id: 'admin-leave', name: 'Congés', icon: 'sun' },
    { id: 'admin-travel-report', name: 'Rapport trajets', icon: 'route' },
    { id: 'admin-hours-report', name: 'Rapport heures', icon: 'clock' },
    { id: 'admin-team', name: 'Équipe', short: 'Équipe', icon: 'users' },
    { id: 'admin-missing-hours', name: 'Écarts d\'heures', icon: 'alert' },
    { id: 'admin-errors', name: 'Erreurs', icon: 'bug' },
];

// Libellés de fil d'Ariane pour les pages hors menu
const extraPageNames = {
    'admin-chantier-details': 'Détail du chantier',
    'admin-data': 'Analyse',
    'admin-pointage-log': 'Journal d\'audit',
    'admin-tarifs': 'Taux horaires',
    'admin-updates': 'Mises à jour chantiers',
    'user-updates': 'Mises à jour chantiers',
    'route-optimizer': 'Optimiseur de tournées',
    'add-entry': 'Nouveau pointage',
};

function setMobileNav(open) {
    document.getElementById('app-container').classList.toggle('nav-open', open);
    document.querySelector('#bottom-nav [data-more]')?.setAttribute('aria-expanded', String(open));
}

function toggleView() {
    isMasqueradingAsUser = !isMasqueradingAsUser;
    setupNavigation();
    const destination = isMasqueradingAsUser ? 'user-dashboard' : 'admin-dashboard';
    navigateTo(destination);
}

function setupNavigation() {
    const tabs = isEffectiveAdmin() ? adminTabs : userTabs;
    const mainNavList = document.querySelector('#main-nav-list');
    if (!mainNavList) return;

    mainNavList.innerHTML = '';

    tabs.forEach(tab => {
        const listItem = document.createElement('li');
        const tabLink = document.createElement('a');
        tabLink.id = `nav-${tab.id}`;
        tabLink.href = '#';
        tabLink.className = 'nav-link';
        tabLink.innerHTML = `${iconSvg(tab.icon)}<span>${tab.name}</span>`;
        tabLink.onclick = (e) => {
            e.preventDefault();
            navigateTo(tab.id);
            setMobileNav(false);
        };
        listItem.appendChild(tabLink);
        mainNavList.appendChild(listItem);
    });

    // Barre d'onglets mobile : onglets principaux + « Plus » qui ouvre le menu complet
    const bottomNav = document.getElementById('bottom-nav');
    bottomNav.innerHTML = tabs.filter(tab => tab.short).map(tab => `
        <a href="#" class="bottom-nav-item" data-page="${tab.id}">${iconSvg(tab.icon)}<span>${tab.short}</span></a>
    `).join('') + `<button type="button" class="bottom-nav-item" data-more>${iconSvg('more')}<span>Plus</span></button>`;
    bottomNav.querySelectorAll('[data-page]').forEach(item => {
        item.onclick = (e) => { e.preventDefault(); navigateTo(item.dataset.page); setMobileNav(false); };
    });
    bottomNav.querySelector('[data-more]').onclick = () => setMobileNav(!document.getElementById('app-container').classList.contains('nav-open'));

    document.getElementById('nav-section-label').textContent = isEffectiveAdmin() ? 'Administration' : 'Mon espace';
    document.getElementById('breadcrumb-section').textContent = isEffectiveAdmin() ? 'Administration' : 'Espace employé';

    const switcher = document.getElementById('switchViewBtn');
    switcher.hidden = !isAdmin;
    if (isAdmin) {
        switcher.querySelectorAll('button').forEach(btn => {
            const isCurrent = (btn.dataset.view === 'admin') === isEffectiveAdmin();
            btn.setAttribute('aria-pressed', String(isCurrent));
            btn.onclick = () => { if (!isCurrent) { toggleView(); setMobileNav(false); } };
        });
    }
}

// Précharge les pages du menu quand l'appli est au repos : changer d'onglet devient quasi instantané
function prefetchPages() {
    const tabs = isAdmin ? [...userTabs, ...adminTabs] : userTabs;
    setTimeout(() => {
        tabs.forEach(tab => import(`./modules/${tab.id}.js`).catch(() => {}));
    }, 2500);
}

let currentPageModule = null;

function getPageName(pageId) {
    const tab = [...userTabs, ...adminTabs].find(t => t.id === pageId);
    return tab ? tab.name : (extraPageNames[pageId] || '');
}

export async function navigateTo(pageId, params = {}) {
    if (pageId === 'user-details') pageId = 'user-history';
    currentPageId = pageId;

    document.querySelectorAll('#main-nav-list a').forEach(link => {
        if (link.id === `nav-${pageId}`) {
            link.classList.add('nav-active');
            link.setAttribute('aria-current', 'page');
        } else {
            link.classList.remove('nav-active');
            link.removeAttribute('aria-current');
        }
    });

    const isMainTab = [...document.querySelectorAll('#bottom-nav [data-page]')].some(item => item.dataset.page === pageId);
    document.querySelectorAll('#bottom-nav .bottom-nav-item').forEach(item => {
        const isActive = item.dataset.page === pageId || (item.hasAttribute('data-more') && !isMainTab);
        item.classList.toggle('is-active', isActive);
        if (item.dataset.page === pageId) item.setAttribute('aria-current', 'page'); else item.removeAttribute('aria-current');
    });

    const pageName = getPageName(pageId);
    document.getElementById('breadcrumb-page').textContent = pageName;
    document.title = pageName ? `${pageName} · Pointeuse LPF` : 'Pointeuse LPF';

    pageContent.classList.add('page-exit');

    setTimeout(async () => {
        pageContent.innerHTML = `<div class="page-loader"><div class="spinner" role="status" aria-label="Chargement"></div></div>`;
        window.scrollTo(0, 0);

        try {
            // La page quittée arrête ses écouteurs temps réel / minuteurs (si elle en a)
            try { currentPageModule?.cleanup?.(); } catch (cleanupError) { console.error(cleanupError); }
            const pageModule = await import(`./modules/${pageId}.js`);
            currentPageModule = pageModule;
            await pageModule.render(params);
        } catch (error) {
            console.error(`Erreur module ${pageId}:`, error);
            let errorMsg = "Impossible de charger la page.";
            if (error.message.includes('404')) errorMsg = "Le fichier du module est introuvable.";
            pageContent.innerHTML = `
                <div class="max-w-md mx-auto text-center py-16">
                    <p class="text-lg font-semibold">Une erreur est survenue</p>
                    <p class="mt-1" style="color: var(--color-text-muted);">${errorMsg}</p>
                    <p class="mt-3 text-xs font-mono" style="color: var(--color-text-subtle);">${error.message}</p>
                </div>`;
        }

        pageContent.classList.remove('page-exit');
    }, 90);
}

const OVERLAY_SELECTOR = '.modal, .fixed.inset-0.bg-black';
const CLOSE_LABEL = /^(annuler|fermer|ok|compris|j'ai compris|retour|non)\b/i;

function closeOverlay(overlay) {
    const closeBtn = [...overlay.querySelectorAll('button')].find(btn =>
        /cancel|close|fermer|annuler/i.test(btn.id) || CLOSE_LABEL.test(btn.textContent.trim())
    );
    if (closeBtn) closeBtn.click();
    else overlay.classList.add('hidden');
}

function getInitials(name) {
    return (name || '?').trim().split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map(part => part[0].toUpperCase()).join('');
}

function showAuthForm(formId) {
    ['login-form', 'register-form', 'reset-form'].forEach(id => {
        document.getElementById(id).hidden = id !== formId;
    });
    document.querySelector(`#${formId} input`)?.focus();
}

document.addEventListener('DOMContentLoaded', () => {
    genericModal = document.getElementById('genericModal');
    modalTitle = document.getElementById('modalTitle');
    modalMessage = document.getElementById('modalMessage');
    modalConfirmBtn = document.getElementById('modalConfirmBtn');
    modalCancelBtn = document.getElementById('modalCancelBtn');

    const loader = document.getElementById('app-loader');
    const authContainer = document.getElementById('auth-container');
    const pendingContainer = document.getElementById('pending-approval-container');
    const appContainer = document.getElementById('app-container');

    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const resetForm = document.getElementById('reset-form');

    document.getElementById('show-register-link').onclick = (e) => { e.preventDefault(); showAuthForm('register-form'); };
    document.getElementById('show-reset-link').onclick = (e) => { e.preventDefault(); showAuthForm('reset-form'); };
    document.getElementById('show-login-link-from-register').onclick = (e) => { e.preventDefault(); showAuthForm('login-form'); };
    document.getElementById('show-login-link-from-reset').onclick = (e) => { e.preventDefault(); showAuthForm('login-form'); };
    document.getElementById('logoutPendingBtn').onclick = () => signOut(auth);

    // Navigation mobile
    document.getElementById('sidebar-backdrop').onclick = () => setMobileNav(false);
    // Fenêtres : fermeture en touchant le fond ou avec Échap, via leur propre bouton Annuler/Fermer
    // (on vérifie aussi où le doigt s'est posé, pour ne pas fermer après une sélection de texte qui déborde)
    let pressTarget = null;
    document.addEventListener('pointerdown', (e) => { pressTarget = e.target; });
    document.addEventListener('click', (e) => {
        if (e.target instanceof HTMLElement && e.target === pressTarget && e.target.matches(OVERLAY_SELECTOR)) closeOverlay(e.target);
    });
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        setMobileNav(false);
        const openOverlays = [...document.querySelectorAll(OVERLAY_SELECTOR)].filter(el => getComputedStyle(el).display !== 'none');
        if (openOverlays.length) closeOverlay(openOverlays[openOverlays.length - 1]);
    });

    // Erreurs réseau non gérées par une page : on prévient l'utilisateur au lieu d'échouer en silence
    window.addEventListener('unhandledrejection', (event) => {
        const reason = event.reason || {};
        const text = `${reason.code || ''} ${reason.message || ''}`;
        if (/unavailable|network|deadline-exceeded|failed to fetch/i.test(text)) {
            showToast("Connexion instable : l'action n'a peut-être pas abouti. Réessayez dans un instant.", 'warning');
        } else if (/permission-denied/i.test(text)) {
            showToast("Accès refusé à ces données. Reconnectez-vous si le problème persiste.", 'warning');
        }
    });

    window.addEventListener('offline', () => showToast("Vous êtes hors ligne. Vos pointages seront synchronisés au retour du réseau.", 'warning'));
    window.addEventListener('online', () => showToast("Connexion rétablie.", 'success'));

    document.getElementById('topbar-date').textContent = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('register-name').value;
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            await setDoc(doc(db, "users", user.uid), {
                displayName: name, email: user.email, uid: user.uid,
                status: 'pending', role: 'user', createdAt: serverTimestamp()
            });
        } catch (error) { showInfoModal("Erreur", "Impossible de créer le compte : " + error.message); }
    });

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        try { await signInWithEmailAndPassword(auth, email, password); }
        catch (error) { showInfoModal("Erreur", "Email ou mot de passe incorrect."); }
    });

    resetForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('reset-email').value;
        try {
            await sendPasswordResetEmail(auth, email);
            showInfoModal("Email envoyé", "Un lien pour réinitialiser votre mot de passe a été envoyé.");
            showAuthForm('login-form');
        } catch (error) { showInfoModal("Erreur", "Impossible d'envoyer l'email."); }
    });

    onAuthStateChanged(auth, async (user) => {
        authContainer.style.display = 'none';
        pendingContainer.style.display = 'none';
        appContainer.style.display = 'none';
        loader.style.display = 'flex';

        if (user) {
            const userRef = doc(db, "users", user.uid);
            try {
                const userDoc = await getDoc(userRef);
                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    currentUser = { ...user, ...userData };
                    isAdmin = userData.role === 'admin';
                    isMasqueradingAsUser = isAdmin;

                    isShowingAllHours = false;

                    switch (userData.status) {
                        case 'pending': pendingContainer.style.display = 'flex'; break;
                        case 'banned': showInfoModal("Compte banni", "Votre compte a été banni."); signOut(auth); break;
                        case 'approved': {
                            const displayName = userData.displayName || user.email;
                            document.getElementById('currentUserDisplay').textContent = displayName;
                            document.getElementById('user-avatar').textContent = getInitials(displayName);
                            document.getElementById('user-role-display').textContent = isAdmin ? 'Administrateur' : 'Employé';
                            document.getElementById('app-version-display').textContent = APP_VERSION;
                            setupNavigation();

                            await checkPersonalNotifications(userRef, userData);
                            checkForUpdates(userData, userRef);

                            navigateTo('user-dashboard');
                            prefetchPages();
                            appContainer.style.display = 'block';
                            break;
                        }
                        default: showInfoModal("Erreur de compte", "Statut inconnu."); signOut(auth);
                    }
                } else { showInfoModal("Erreur de compte", "Compte non trouvé."); signOut(auth); }
            } catch (error) {
                console.error(error);
                authContainer.style.display = 'block';
            }
        } else {
            currentUser = null;
            isAdmin = false;
            isMasqueradingAsUser = false;
            isShowingAllHours = false;
            authContainer.style.display = 'block';
            showAuthForm('login-form');
        }
        loader.style.display = 'none';
    });

    const pinModal = document.getElementById('pinModal');
    const pinForm = document.getElementById('pinForm');
    const pinInput = document.getElementById('pinInput');

    document.getElementById('pinCancelBtn').onclick = () => {
        pinModal.classList.add('hidden');
        pinForm.reset();
    };

    pinForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (pinInput.value === STEALTH_PIN) {
            localStorage.setItem('stealthMode', 'true');
            pinModal.classList.add('hidden');
            pinForm.reset();
            showInfoModal("Mode confidentiel", "Activé. Rechargement...");
            setTimeout(() => window.location.reload(), 1500);
        } else {
            showInfoModal("Erreur", "Code PIN incorrect.");
            pinForm.reset();
        }
    });

    document.getElementById('home-nav-link').addEventListener('click', (e) => {
        e.preventDefault();
        setMobileNav(false);
        navigateTo(isEffectiveAdmin() ? 'admin-dashboard' : 'user-dashboard');
    });

    // Service worker : indispensable pour que le navigateur autorise l'installation en un clic.
    // (Avant, `window.Workbox` n'existait jamais : le module workbox-window n'expose pas de global,
    // donc le service worker n'était jamais enregistré.)
    // En développement local (Live Server), pas de cache : on voit toujours la dernière version des fichiers.
    const isLocalDev = ['localhost', '127.0.0.1'].includes(location.hostname);
    if ('serviceWorker' in navigator && isLocalDev) {
        navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(reg => reg.unregister()));
    } else if ('serviceWorker' in navigator && !isNativeApp) {
        import('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-window.prod.mjs').then(({ Workbox }) => {
            const wb = new Workbox('./sw.js');
            const showUpdateToast = () => {
                let toast = document.getElementById('update-toast');
                if (toast) return;
                toast = document.createElement('div');
                toast.id = 'update-toast';
                toast.setAttribute('role', 'status');
                toast.innerHTML = `
                    <img src="./icons/lpf-192.png" alt="" class="update-toast-icon">
                    <div class="update-toast-text">
                        <strong>Nouvelle version disponible</strong>
                        <span>Mettez à jour pour profiter des dernières nouveautés.</span>
                    </div>
                    <div class="update-toast-actions">
                        <button id="later-button" class="btn btn-secondary">Plus tard</button>
                        <button id="reload-button" class="btn btn-primary">Mettre à jour</button>
                    </div>
                `;
                document.body.appendChild(toast);
                document.getElementById('reload-button').onclick = (e) => {
                    e.currentTarget.disabled = true;
                    e.currentTarget.textContent = 'Mise à jour…';
                    wb.messageSkipWaiting();
                };
                document.getElementById('later-button').onclick = () => {
                    toast.classList.remove('show');
                    setTimeout(() => toast.remove(), 400);
                };
                setTimeout(() => toast.classList.add('show'), 100);
            };
            wb.addEventListener('waiting', showUpdateToast);
            wb.addEventListener('controlling', (event) => {
                // Recharge uniquement lors d'une mise à jour, pas à la toute première installation
                if (event.isUpdate) window.location.reload();
            });
            wb.register();
            // L'appli installée reste souvent ouverte en arrière-plan : on vérifie s'il y a une
            // nouvelle version à chaque retour dans l'appli et toutes les 30 minutes.
            let lastCheck = Date.now();
            const checkForNewVersion = () => {
                if (!navigator.onLine || Date.now() - lastCheck < 60 * 1000) return;
                lastCheck = Date.now();
                wb.update().catch(() => {});
            };
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') checkForNewVersion();
            });
            setInterval(checkForNewVersion, 30 * 60 * 1000);
        }).catch(() => navigator.serviceWorker.register('./sw.js').catch(() => {}));
    }

    window.addEventListener('appinstalled', () => {
        window.deferredPrompt = null;
        showToast("Application installée sur l'écran d'accueil.", 'success');
    });
});

async function checkPersonalNotifications(userRef, userData) {
    if (userData.pendingChanges && userData.pendingChanges.length > 0) {
        const changesByDay = userData.pendingChanges.reduce((acc, change) => {
            const date = new Date(change.date + 'T12:00:00Z').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
            if (!acc[date]) {
                acc[date] = [];
            }
            const action = change.type === 'ajout' ? '+ Ajouté à' :
                           change.type === 'retrait' ? '− Retiré de' :
                           '× Annulé';
            acc[date].push(`${action} : ${change.chantier}`);
            return acc;
        }, {});

        const textMessage = Object.entries(changesByDay)
            .map(([day, actions]) => `${day}\n${actions.join('\n')}`)
            .join('\n\n');

        showInfoModal("Modifications de votre planning", textMessage);

        await updateDoc(userRef, {
            pendingChanges: deleteField()
        });
    }
}

export function showUpdatesModal(updatesToShow, callbackOnClose = null) {
    const updatesModal = document.getElementById('updatesModal');
    const updatesContent = document.getElementById('updates-content');
    const closeUpdatesBtn = document.getElementById('closeUpdatesBtn');

    if (!updatesModal || !updatesContent || !closeUpdatesBtn) {
        return;
    }

    if (!updatesToShow || updatesToShow.length === 0) return;

    updatesContent.innerHTML = updatesToShow.map(update => `
        <section>
            <h4>${update.version} <span class="version-date">${update.date}</span></h4>
            <ul>
                ${update.changes.map(change => `<li>${change.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</li>`).join('')}
            </ul>
        </section>
    `).join('<hr>');

    updatesModal.classList.remove('hidden');

    closeUpdatesBtn.onclick = () => {
        updatesModal.classList.add('hidden');
        if (callbackOnClose) {
            callbackOnClose();
        }
    };
}

function checkForUpdates(userData, userRef) {
    const lastSeenVersion = userData.lastSeenAppVersion;
    const currentVersion = APP_VERSION;

    if (lastSeenVersion !== currentVersion) {
        const updatesToShow = updatesLog ? updatesLog.filter(u => u.version > (lastSeenVersion || 'v0.0.0')) : [];

        if (updatesToShow.length > 0) {
            const markVersionAsSeen = async () => {
                try {
                    await updateDoc(userRef, { lastSeenAppVersion: currentVersion });
                } catch (error) {
                    console.error("Erreur version:", error);
                }
            };
            showUpdatesModal(updatesToShow, markVersionAsSeen);
        }
    }
}

export function showConfirmationModal(title, message) {
    return new Promise((resolve) => {
        modalTitle.textContent = title;
        modalMessage.textContent = message;
        modalMessage.style.whiteSpace = 'pre-wrap';
        modalConfirmBtn.style.display = '';
        modalCancelBtn.textContent = 'Annuler';
        modalCancelBtn.className = 'btn btn-secondary';

        genericModal.classList.remove('hidden');
        modalConfirmBtn.focus();

        modalConfirmBtn.onclick = () => { genericModal.classList.add('hidden'); resolve(true); };
        modalCancelBtn.onclick = () => { genericModal.classList.add('hidden'); resolve(false); };
    });
}

// --- NOTIFICATIONS DISCRÈTES (toasts) ---
// Les confirmations de réussite n'interrompent plus l'utilisateur : elles s'affichent
// quelques secondes puis disparaissent seules. Les erreurs restent des fenêtres.
const SUCCESS_TITLE = /^(succ[eè]s|e-?mail envoy[eé]|enregistr[eé]|bravo|parfait)/i;
const toastIcons = {
    success: '<path d="M20 6 9 17l-5-5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
    warning: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
};

export function showToast(message, type = 'success') {
    let region = document.getElementById('toast-region');
    if (!region) {
        region = document.createElement('div');
        region.id = 'toast-region';
        region.setAttribute('aria-live', 'polite');
        document.body.appendChild(region);
    }
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', 'status');
    toast.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${toastIcons[type] || toastIcons.info}</svg><span></span>`;
    toast.querySelector('span').textContent = message;
    region.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));

    const dismiss = () => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 250);
    };
    toast.onclick = dismiss;
    setTimeout(dismiss, Math.min(7000, 2500 + message.length * 35));
}

export function showInfoModal(title, message) {
    if (SUCCESS_TITLE.test(String(title).trim())) {
        showToast(message || title, 'success');
        return;
    }

    modalTitle.textContent = title;
    modalMessage.textContent = message;
    modalMessage.style.whiteSpace = 'pre-wrap';
    modalConfirmBtn.style.display = 'none';
    modalCancelBtn.textContent = 'OK';
    modalCancelBtn.className = 'btn btn-primary';

    genericModal.classList.remove('hidden');
    modalCancelBtn.focus();

    modalCancelBtn.onclick = () => { genericModal.classList.add('hidden'); };
}

// =====================================================================
// SUIVI DES ERREURS : chaque erreur chez un utilisateur est envoyée dans
// la collection "errorLogs", consultable par l'admin (page Erreurs).
// =====================================================================
let currentPageId = null;
const reportedErrors = new Set();
let reportedCount = 0;
let reporting = false;
const MAX_REPORTS_PER_SESSION = 15;
const originalConsoleError = console.error.bind(console);

export function reportError(error, context = '') {
    try {
        if (reporting || !currentUser || reportedCount >= MAX_REPORTS_PER_SESSION) return;
        const message = String(error?.message || error || 'Erreur inconnue').slice(0, 500);
        // Les coupures réseau ne sont pas des bugs : inutile de les remonter
        if (/offline|unavailable|failed to fetch|network/i.test(message) && !navigator.onLine) return;
        const key = `${context}|${message}`;
        if (reportedErrors.has(key)) return;
        reportedErrors.add(key);
        reportedCount++;
        reporting = true;
        addDoc(collection(db, "errorLogs"), {
            message,
            context: String(context).slice(0, 200),
            stack: String(error?.stack || '').slice(0, 2000),
            page: currentPageId || '',
            uid: currentUser.uid,
            userName: currentUser.displayName || currentUser.email || '',
            appVersion: APP_VERSION,
            userAgent: navigator.userAgent.slice(0, 300),
            online: navigator.onLine,
            clientTime: new Date().toISOString(),
            createdAt: serverTimestamp(),
        }).catch(() => {}).finally(() => { reporting = false; });
    } catch {
        reporting = false;
    }
}

window.addEventListener('error', (event) => {
    // « Script error. » vient d'un script externe (Tailwind, Chart.js, extension du navigateur) :
    // le navigateur cache le détail, il n'y a rien à corriger côté appli, on ne l'enregistre donc pas.
    if (!event.error && /^Script error\.?$/i.test(String(event.message || '').trim())) return;
    reportError(event.error || event.message, 'Erreur JavaScript');
});
window.addEventListener('unhandledrejection', (event) => reportError(event.reason, 'Promesse non gérée'));
// Les erreurs déjà attrapées par les pages (console.error) sont aussi remontées
console.error = (...args) => {
    originalConsoleError(...args);
    const error = args.find(a => a instanceof Error) || args.find(a => a && a.message);
    const context = args.filter(a => typeof a === 'string').join(' ').slice(0, 200);
    if (error || context) reportError(error || context, context);
};

