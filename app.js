const APP_VERSION = 'v3';

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, signOut } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp, collection, query, where, getDocs, orderBy, limit, addDoc, initializeFirestore, CACHE_SIZE_UNLIMITED } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";

// ===============================================================================
// SYSTÈME DE THÈMES CENTRALISÉ AVEC PALETTES IMMERSIVES
// ===============================================================================
const themes = {
    neutre: {
        name: 'Neutre',
        preview: '#ffffff',
        colors: {
            '--color-primary': '#4b5563', '--color-primary-hover': '#374151',
            '--color-background': '#f3f4f6', '--color-surface': '#ffffff',
            '--color-text-base': '#1f2937', '--color-text-muted': '#6b7280',
            '--color-border': '#e5e7eb',
        }
    },
    or: {
        name: 'Or',
        preview: '#fef9c3',
        colors: {
            '--color-primary': '#d0c338', '--color-primary-hover': '#a1921a',
            '--color-background': '#fefce8', '--color-surface': '#fef9c3',
            '--color-text-base': '#713f12', '--color-text-muted': '#a16207',
            '--color-border': '#fde68a',
        }
    },
    emeraude: {
        name: 'Émeraude',
        preview: '#dcfce7',
        colors: {
            '--color-primary': '#1fbb56', '--color-primary-hover': '#1a9f49',
            '--color-background': '#f0fdf4', '--color-surface': '#dcfce7',
            '--color-text-base': '#14532d', '--color-text-muted': '#15803d',
            '--color-border': '#bbf7d0',
        }
    },
    royal: {
        name: 'Royal',
        preview: '#dbeafe',
        colors: {
            '--color-primary': '#2262b5', '--color-primary-hover': '#1c5095',
            '--color-background': '#eff6ff', '--color-surface': '#dbeafe',
            '--color-text-base': '#1e3a8a', '--color-text-muted': '#2563eb',
            '--color-border': '#bfdbfe',
        }
    },
    rubis: {
        name: 'Rubis',
        preview: '#fee2e2',
        colors: {
            '--color-primary': '#b43737', '--color-primary-hover': '#982e2e',
            '--color-background': '#fef2f2', '--color-surface': '#fee2e2',
            '--color-text-base': '#991b1b', '--color-text-muted': '#dc2626',
            '--color-border': '#fecaca',
        }
    },
    magenta: {
        name: 'Magenta',
        preview: '#fce7f3',
        colors: {
            '--color-primary': '#cd5298', '--color-primary-hover': '#b14682',
            '--color-background': '#fdf2f8', '--color-surface': '#fce7f3',
            '--color-text-base': '#86198f', '--color-text-muted': '#c026d3',
            '--color-border': '#fbcfe8',
        }
    },
 carbone: {
    name: 'Carbone',
    preview: '#1f2937',
    colors: {
        '--color-primary': '#cd5298', '--color-primary-hover': '#b14682',
        '--color-background': '#111827', '--color-surface': '#1f1e1e',
        '--color-text-base': '#e5e7eb', // <-- NOUVELLE COULEUR (GRIS CLAIR)
        '--color-text-muted': '#9ca3af',
        '--color-border': '#374151',
    }
},
};

function applyTheme(themeName) {
    const theme = themes[themeName] || themes['neutre'];
    for (const [key, value] of Object.entries(theme.colors)) {
        document.documentElement.style.setProperty(key, value);
    }
    localStorage.setItem('appTheme', themeName);
}

// Appliquer le thème sauvegardé dès le chargement du script
applyTheme(localStorage.getItem('appTheme') || 'neutre');
// ===============================================================================


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
const auth = getAuth(app);
export const db = initializeFirestore(app, {
    cacheSizeBytes: CACHE_SIZE_UNLIMITED
});

export const pageContent = document.getElementById('page-content');
export let currentUser = null;
export let isAdmin = false;
export let isMasqueradingAsUser = false;
let genericModal, modalTitle, modalMessage, modalConfirmBtn, modalCancelBtn;

const STEALTH_PIN = "1801";

export const isStealthMode = () => localStorage.getItem('stealthMode') === 'true';

export function isEffectiveAdmin() {
    return isAdmin && !isMasqueradingAsUser;
}

const userTabs = [
    { id: 'user-dashboard', name: 'Planning' },
    { id: 'user-leave', name: 'Mes Congés' },
    { id: 'chantiers', name: 'Infos Chantiers' },
    { id: 'user-history', name: 'Mon Historique' },
    { id: 'settings', name: 'Paramètres' },
];

const adminTabs = [
    { id: 'admin-dashboard', name: 'Tableau de Bord' },
    
    { id: 'admin-planning', name: 'Planification' },
    { id: 'admin-live-view', name: 'Direct' },
    { id: 'admin-invoicing', name: 'Facturation' },
    { id: 'admin-tarifs', name: 'Tarifs' },
    { id: 'admin-contracts', name: 'Types de Contrat' },
    { id: 'admin-chantiers', name: 'Gestion Chantiers' },
    { id: 'admin-leave', name: 'Gestion Congés' },
    { id: 'admin-travel-report', name: 'Rapport Trajets' },
    { id: 'admin-hours-report', name: 'Rapport Horaires' },
    { id: 'admin-team', name: 'Gestion Équipe' },
];

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
        tabLink.textContent = tab.name;
        tabLink.className = 'block py-2 px-3 rounded md:p-0';
        
        tabLink.onclick = (e) => {
            e.preventDefault();
            navigateTo(tab.id);

            const mobileMenuButton = document.querySelector('[data-collapse-toggle="navbar-default"]');
            const mobileMenu = document.getElementById('navbar-default');
            if (mobileMenu && !mobileMenu.classList.contains('hidden')) {
                mobileMenuButton.click();
            }
        };
        
        listItem.appendChild(tabLink);
        mainNavList.appendChild(listItem);
    });

    const switchBtn = document.getElementById('switchViewBtn');
    if (isAdmin) {
        switchBtn.classList.remove('hidden');
        switchBtn.textContent = isMasqueradingAsUser ? 'Vue Admin' : 'Vue Employé';
        switchBtn.onclick = toggleView;
    } else {
        switchBtn.classList.add('hidden');
    }
}

export async function navigateTo(pageId, params = {}) {
    if (pageId === 'user-details') pageId = 'user-history';

    document.querySelectorAll('#main-nav-list a').forEach(link => {
        if (link.id === `nav-${pageId}`) {
            link.classList.add('nav-active');
            link.setAttribute('aria-current', 'page');
        } else {
            link.classList.remove('nav-active');
            link.removeAttribute('aria-current');
        }
    });

    pageContent.innerHTML = `<p class="text-center mt-8 animate-pulse">Chargement...</p>`;
    try {
        const pageModule = await import(`./modules/${pageId}.js`);
        await pageModule.render(params);
    } catch (error) {
        console.error(`Erreur de chargement du module ${pageId}:`, error);
        pageContent.innerHTML = `<p class="text-red-500 text-center mt-8">Erreur: Impossible de charger la page "${pageId}".</p>`;
    }
}

function setupNotifications() {
    const notificationBell = document.getElementById('notification-bell');
    const notificationPanel = document.getElementById('notification-panel');
    if (notificationBell) {
        notificationBell.onclick = (event) => {
            event.stopPropagation();
            notificationPanel.classList.toggle('hidden');
            if (!notificationPanel.classList.contains('hidden')) loadNotifications();
        };
        checkForUnreadNotifications();
    }
}

async function loadNotifications() {
    const notificationList = document.getElementById('notification-list');
    notificationList.innerHTML = '<p class="p-4 text-sm">Chargement...</p>';
    try {
        const q = query(collection(db, "notifications"), orderBy("createdAt", "desc"), limit(10));
        const snapshot = await getDocs(q);
        if (snapshot.empty) {
            notificationList.innerHTML = '<p class="p-4 text-sm">Aucune notification.</p>';
            return;
        }
        notificationList.innerHTML = '';
        snapshot.forEach(docSnap => {
            const notif = docSnap.data();
            const div = document.createElement('div');
            div.className = 'p-3 border-b';
            div.style.borderColor = 'var(--color-border)';
            div.innerHTML = `<p class="font-semibold">${notif.title}</p><p class="text-sm">${notif.body}</p><p class="text-xs mt-1" style="color: var(--color-text-muted);">${new Date(notif.createdAt.seconds * 1000).toLocaleString('fr-FR')}</p>`;
            notificationList.appendChild(div);
        });
        markNotificationsAsRead();
    } catch (error) {
        console.error("Erreur de chargement des notifications:", error);
        notificationList.innerHTML = '<p class="p-4 text-sm text-red-500">Erreur de chargement.</p>';
    }
}

async function checkForUnreadNotifications() {
    const notificationDot = document.getElementById('notification-dot');
    try {
        const lastCheck = localStorage.getItem('lastNotificationCheck');
        if (!lastCheck) {
            notificationDot.classList.remove('hidden');
            return;
        }
        const q = query(collection(db, "notifications"), where("createdAt", ">", new Date(lastCheck)), limit(1));
        const snapshot = await getDocs(q);
        notificationDot.classList.toggle('hidden', snapshot.empty);
    } catch (error) { console.error("Erreur de vérification des notifications:", error); }
}

function markNotificationsAsRead() {
    document.getElementById('notification-dot').classList.add('hidden');
    localStorage.setItem('lastNotificationCheck', new Date().toISOString());
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

    document.getElementById('show-register-link').onclick = (e) => { e.preventDefault(); loginForm.classList.add('hidden'); registerForm.classList.remove('hidden'); };
    document.getElementById('show-reset-link').onclick = (e) => { e.preventDefault(); loginForm.classList.add('hidden'); resetForm.classList.remove('hidden'); };
    document.getElementById('show-login-link-from-register').onclick = (e) => { e.preventDefault(); registerForm.classList.add('hidden'); loginForm.classList.remove('hidden'); };
    document.getElementById('show-login-link-from-reset').onclick = (e) => { e.preventDefault(); resetForm.classList.add('hidden'); loginForm.classList.remove('hidden'); };
    document.getElementById('logoutPendingBtn').onclick = () => signOut(auth);

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
        } catch (error) {
            showInfoModal("Erreur", "Impossible de créer le compte. L'email est peut-être déjà utilisé ou le mot de passe est trop faible.");
        }
    });

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (error) {
            showInfoModal("Erreur", "Email ou mot de passe incorrect.");
        }
    });

    resetForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('reset-email').value;
        try {
            await sendPasswordResetEmail(auth, email);
            showInfoModal("Email envoyé", "Un lien pour réinitialiser votre mot de passe a été envoyé à votre adresse email.");
            resetForm.classList.add('hidden');
            loginForm.classList.remove('hidden');
        } catch (error) {
            showInfoModal("Erreur", "Impossible d'envoyer l'email. Vérifiez que l'adresse est correcte.");
        }
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
                    
                    switch (userData.status) {
                        case 'pending':
                            pendingContainer.style.display = 'flex';
                            break;
                        case 'banned':
                            showInfoModal("Compte Banni", "Votre compte a été banni.");
                            signOut(auth);
                            break;
                        case 'approved':
                            document.getElementById('currentUserDisplay').textContent = userData.displayName || user.email;
                            document.getElementById('app-version-display').textContent = APP_VERSION;
                            setupNavigation();
                            setupNotifications();
                            navigateTo('user-dashboard');
                            appContainer.style.display = 'block';
                            break;
                        default:
                            showInfoModal("Erreur de Compte", "Statut de compte inconnu.");
                            signOut(auth);
                    }
                } else {
                    showInfoModal("Erreur de Compte", "Compte non trouvé dans la base de données.");
                    signOut(auth);
                }
            } catch (error) {
                authContainer.style.display = 'flex';
            }
        } else {
            currentUser = null;
            isAdmin = false;
            isMasqueradingAsUser = false;
            authContainer.style.display = 'flex';
        }
        loader.style.display = 'none';
    });
    
    const pinModal = document.getElementById('pinModal');
    const pinForm = document.getElementById('pinForm');
    const pinInput = document.getElementById('pinInput');
    const stealthTrigger = document.getElementById('stealth-trigger');

    if (stealthTrigger) {
        stealthTrigger.onclick = () => {
            if (isStealthMode()) {
                localStorage.removeItem('stealthMode');
                showInfoModal("Mode Confidentiel", "Le mode confidentiel est désactivé. Rechargement...");
                setTimeout(() => window.location.reload(), 1500);
            } else {
                pinModal.classList.remove('hidden');
                pinInput.focus();
            }
        };
    }

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
            showInfoModal("Mode Confidentiel", "Le mode confidentiel est activé. Rechargement...");
            setTimeout(() => window.location.reload(), 1500);
        } else {
            showInfoModal("Erreur", "Code PIN incorrect.");
            pinForm.reset();
        }
    });
    
    if ('serviceWorker' in navigator) {
        const { Workbox } = window;
        if (Workbox) {
            const wb = new Workbox('/sw.js');
            const showUpdateToast = () => {
                if (document.getElementById('update-toast')) return;
                const toast = document.createElement('div');
                toast.id = 'update-toast';
                toast.innerHTML = `<span>Une nouvelle version est disponible.</span><button id="reload-button">Rafraîchir</button>`;
                document.body.appendChild(toast);
                document.getElementById('reload-button').onclick = () => {
                    wb.messageSkipWaiting(); 
                };
            };
            wb.addEventListener('waiting', showUpdateToast);
            wb.addEventListener('controlling', () => {
                window.location.reload();
            });
            wb.register();
        }
    }
});

export function showConfirmationModal(title, message) {
    modalTitle.textContent = title;
    modalMessage.textContent = message;
    modalConfirmBtn.style.display = 'inline-block';
    modalCancelBtn.textContent = 'Annuler';
    genericModal.classList.remove('hidden');
    return new Promise((resolve) => {
        modalConfirmBtn.onclick = () => { genericModal.classList.add('hidden'); resolve(true); };
        modalCancelBtn.onclick = () => { genericModal.classList.add('hidden'); resolve(false); };
    });
}

export function showInfoModal(title, message) {
    modalTitle.textContent = title;
    modalMessage.textContent = message;
    modalConfirmBtn.style.display = 'none';
    modalCancelBtn.textContent = 'OK';
    genericModal.classList.remove('hidden');
    modalCancelBtn.onclick = () => { genericModal.classList.add('hidden'); };
}