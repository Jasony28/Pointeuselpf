import { updatesLog } from './modules/updates-data.js';
const APP_VERSION ='v3.5.3';

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, signOut } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp, updateDoc, deleteField, collection, query, where, getDocs, orderBy, limit, addDoc, initializeFirestore, CACHE_SIZE_UNLIMITED } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";

export const themes = {
    neutre: { name: 'Neutre', preview: '#e2e8f0', colors: { '--color-primary': '#475569', '--color-primary-hover': '#334155', '--color-background': '#f1f5f9', '--color-surface': '#ffffff', '--color-text-base': '#0f172a', '--color-text-muted': '#475569', '--color-border': '#e2e8f0', } },
    magenta: { name: 'Magenta', preview: '#f5d0fe', colors: { '--color-primary': '#d946ef', '--color-primary-hover': '#c026d3', '--color-background': '#fdf4ff', '--color-surface': '#fae8ff', '--color-text-base': '#581c87', '--color-text-muted': '#86198f', '--color-border': '#f5d0fe', } },
    rubis: { name: 'Rubis', preview: '#fecaca', colors: { '--color-primary': '#ef4444', '--color-primary-hover': '#dc2626', '--color-background': '#fef2f2', '--color-surface': '#fee2e2', '--color-text-base': '#7f1d1d', '--color-text-muted': '#991b1b', '--color-border': '#fecaca', } },
    carbone: { name: 'Carbone', preview: '#1f2937', colors: { '--color-primary': '#f59e0b', '--color-primary-hover': '#d97706', '--color-background': '#111827', '--color-surface': '#1f2937', '--color-text-base': '#f9fafb', '--color-text-muted': '#9ca3af', '--color-border': '#374151', } },
    ocean: { name: 'Océan', preview: '#67e8f9', colors: { '--color-primary': '#06b6d4', '--color-primary-hover': '#0891b2', '--color-background': '#ecfeff', '--color-surface': '#cffafe', '--color-text-base': '#0e7490', '--color-text-muted': '#155e75', '--color-border': '#a5f3fc', } },
    soleil: { name: 'Soleil', preview: '#fdba74', colors: { '--color-primary': '#f97316', '--color-primary-hover': '#ea580c', '--color-background': '#fff7ed', '--color-surface': '#ffedd5', '--color-text-base': '#7c2d12', '--color-text-muted': '#9a3412', '--color-border': '#fed7aa', } },
    violette: { name: 'Violette', preview: '#c4b5fd', colors: { '--color-primary': '#8b5cf6', '--color-primary-hover': '#7c3aed', '--color-background': '#f5f3ff', '--color-surface': '#ede9fe', '--color-text-base': '#4c1d95', '--color-text-muted': '#6d28d9', '--color-border': '#ddd6fe', } },
    limonade: { name: 'Limonade', preview: '#bef264', colors: { '--color-primary': '#84cc16', '--color-primary-hover': '#65a30d', '--color-background': '#f7fee7', '--color-surface': '#ecfccb', '--color-text-base': '#365314', '--color-text-muted': '#4d7c0f', '--color-border': '#d9f99d', } }
};

export function applyTheme(themeName) {
    const theme = themes[themeName] || themes['neutre'];
    for (const [key, value] of Object.entries(theme.colors)) {
        document.documentElement.style.setProperty(key, value);
    }
    localStorage.setItem('appTheme', themeName);
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
const auth = getAuth(app);
export const db = initializeFirestore(app, { cacheSizeBytes: CACHE_SIZE_UNLIMITED });

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
    { id: 'user-stats', name: 'Mes Stats' },
    { id: 'settings', name: 'Paramètres' },
];

const adminTabs = [
    { id: 'admin-dashboard', name: 'Tableau de Bord' },
    { id: 'admin-live-view', name: 'Direct' },
    { id: 'admin-planning', name: 'Planification' },
    { id: 'admin-invoicing', name: 'Facturation' },
    { id: 'admin-contracts', name: 'Cartes' },
    { id: 'admin-chantiers', name: 'Chantiers' },
    { id: 'admin-leave', name: 'Congés' },
    { id: 'admin-travel-report', name: 'Rapports Trajets' },
    { id: 'admin-hours-report', name: 'Rapports Heures' },
    { id: 'admin-team', name: 'Équipe' },
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

    pageContent.classList.add('page-exit');
    
    setTimeout(async () => {
        pageContent.innerHTML = `<div class="w-full flex justify-center p-8"><svg class="animate-spin h-8 w-8" style="color: var(--color-primary);" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg></div>`;
        
        try {
            const pageModule = await import(`./modules/${pageId}.js`);
            await pageModule.render(params);
        } catch (error) {
            console.error(`Erreur de chargement du module ${pageId}:`, error);
            pageContent.innerHTML = `<p class="text-red-500 text-center mt-8">Erreur: Impossible de charger la page "${pageId}".</p>`;
        }
        
        pageContent.classList.remove('page-exit');
    }, 200);
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

    document.getElementById('show-register-link').onclick = (e) => { e.preventDefault(); loginForm.style.display = 'none'; registerForm.style.display = 'block'; };
    document.getElementById('show-reset-link').onclick = (e) => { e.preventDefault(); loginForm.style.display = 'none'; resetForm.style.display = 'block'; };
    document.getElementById('show-login-link-from-register').onclick = (e) => { e.preventDefault(); registerForm.style.display = 'none'; loginForm.style.display = 'block'; };
    document.getElementById('show-login-link-from-reset').onclick = (e) => { e.preventDefault(); resetForm.style.display = 'none'; loginForm.style.display = 'block'; };
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
        } catch (error) { showInfoModal("Erreur", "Impossible de créer le compte."); }
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
            resetForm.style.display = 'none';
            loginForm.style.display = 'block';
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
                    switch (userData.status) {
                        case 'pending': pendingContainer.style.display = 'flex'; break;
                        case 'banned': showInfoModal("Compte Banni", "Votre compte a été banni."); signOut(auth); break;
                        case 'approved':
                            document.getElementById('currentUserDisplay').textContent = userData.displayName || user.email;
                            document.getElementById('app-version-display').textContent = APP_VERSION;
                            setupNavigation();

                            await checkPersonalNotifications(userRef, userData);
                            
                            checkForUpdates(userData, userRef);

                            navigateTo('user-dashboard');
                            appContainer.style.display = 'block';
                            break;
                        default: showInfoModal("Erreur de Compte", "Statut inconnu."); signOut(auth);
                    }
                } else { showInfoModal("Erreur de Compte", "Compte non trouvé."); signOut(auth); }
            } catch (error) { authContainer.style.display = 'flex'; }
        } else {
            currentUser = null;
            isAdmin = false;
            isMasqueradingAsUser = false;
            authContainer.style.display = 'block';
            loginForm.style.display = 'block';
            registerForm.style.display = 'none';
            resetForm.style.display = 'none';
        }
        loader.style.display = 'none';
    });
    
    const pinModal = document.getElementById('pinModal');
    const pinForm = document.getElementById('pinForm');
    const pinInput = document.getElementById('pinInput');

    // Le 'stealth-trigger' a été supprimé

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
            showInfoModal("Mode Confidentiel", "Activé. Rechargement...");
            setTimeout(() => window.location.reload(), 1500);
        } else {
            showInfoModal("Erreur", "Code PIN incorrect.");
            pinForm.reset();
        }
    });

    // --- C'EST ICI LA MODIFICATION ---
    // Gère le clic sur le logo "Pointeuse Lpf"
    document.getElementById('home-nav-link').addEventListener('click', (e) => {
        e.preventDefault();
        
        // Si l'utilisateur est en mode Admin (isEffectiveAdmin() est true)
        if (isEffectiveAdmin()) {
            // On bascule en mode Employé.
            // toggleView() s'occupe de changer le state, le menu, et de naviguer.
            toggleView(); 
        } else {
            // Si l'utilisateur est déjà en mode Employé,
            // on s'assure juste qu'il est sur la page principale du planning.
            navigateTo('user-dashboard');
        }
    });
    
    if ('serviceWorker' in navigator) {
        const { Workbox } = window;
        if (Workbox) {
            const wb = new Workbox('/sw.js');
            const showUpdateToast = () => {
                let toast = document.getElementById('update-toast');
                if (toast) return;
                toast = document.createElement('div');
                toast.id = 'update-toast';
                toast.innerHTML = `
                    <span class="font-semibold">Une nouvelle version est disponible !</span>
                    <button id="reload-button" class="font-bold px-4 py-2 rounded text-white" style="background-color: var(--color-primary);">Rafraîchir</button>
                `;
                document.body.appendChild(toast);
                document.getElementById('reload-button').onclick = () => {
                    wb.messageSkipWaiting(); 
                };
                setTimeout(() => toast.classList.add('show'), 100);
            };
            wb.addEventListener('waiting', showUpdateToast);
            wb.addEventListener('controlling', () => {
                window.location.reload();
            });
            wb.register();
        }
    }
});

async function checkPersonalNotifications(userRef, userData) {
    if (userData.pendingChanges && userData.pendingChanges.length > 0) {
        const changesByDay = userData.pendingChanges.reduce((acc, change) => {
            const date = new Date(change.date + 'T12:00:00Z').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
            if (!acc[date]) {
                acc[date] = [];
            }
            const action = change.type === 'ajout' ? '✅ Ajouté à' :
                           change.type === 'retrait' ? '❌ Retiré de' :
                           '🗑️ Annulé';
            acc[date].push(`${action} : ${change.chantier}`);
            return acc;
        }, {});

        const textMessage = Object.entries(changesByDay)
            .map(([day, actions]) => `${day}:\n${actions.join('\n')}`)
            .join('\n\n');

        showInfoModal("🔔 Changements dans votre planning", textMessage);

        await updateDoc(userRef, {
            pendingChanges: deleteField()
        });
    }
}

/**
 * Affiche la fenêtre modale avec une liste de mises à jour.
 * @param {Array} updatesToShow - Le tableau des mises à jour à afficher.
 * @param {Function|null} [callbackOnClose=null] - Une fonction à exécuter lors de la fermeture de la modale.
 */
export function showUpdatesModal(updatesToShow, callbackOnClose = null) {
    const updatesModal = document.getElementById('updatesModal');
    const updatesContent = document.getElementById('updates-content');
    const closeUpdatesBtn = document.getElementById('closeUpdatesBtn');

    if (!updatesModal || !updatesContent || !closeUpdatesBtn) {
        console.error("Éléments de la modale de mise à jour non trouvés.");
        return;
    }

    if (!updatesToShow || updatesToShow.length === 0) {
        return;
    }

    updatesContent.innerHTML = updatesToShow.map(update => `
        <div>
            <h4 class="font-bold text-lg">${update.version} <span class="text-sm font-normal" style="color: var(--color-text-muted);">- ${update.date}</span></h4>
            <ul class="list-disc list-inside mt-2 space-y-1 pl-2">
                ${update.changes.map(change => `<li class="text-sm">${change.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</li>`).join('')}
            </ul>
        </div>
    `).join('<hr class="my-4" style="border-color: var(--color-border);">');
    
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
        const updatesToShow = lastSeenVersion 
            ? updatesLog.filter(u => u.version > lastSeenVersion) 
            : [updatesLog[0]]; // Montre la dernière nouveauté si c'est la 1ère visite

        if (updatesToShow.length > 0) {
            const markVersionAsSeen = async () => {
                try {
                    await updateDoc(userRef, { lastSeenAppVersion: currentVersion });
                } catch (error) {
                    console.error("Impossible de mettre à jour la version vue par l'utilisateur:", error);
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
        modalConfirmBtn.style.display = 'inline-block';
        modalCancelBtn.textContent = 'Annuler';
        genericModal.classList.remove('hidden');
        modalConfirmBtn.onclick = () => { genericModal.classList.add('hidden'); resolve(true); };
        modalCancelBtn.onclick = () => { genericModal.classList.add('hidden'); resolve(false); };
    });
}

export function showInfoModal(title, message) {
    const modalMessage = document.getElementById('modalMessage');
    document.getElementById('modalTitle').textContent = title;
    modalMessage.textContent = message;
    modalMessage.style.whiteSpace = 'pre-wrap';
    document.getElementById('modalConfirmBtn').style.display = 'none';
    document.getElementById('modalCancelBtn').textContent = 'OK';
    document.getElementById('genericModal').classList.remove('hidden');
    document.getElementById('modalCancelBtn').onclick = () => { document.getElementById('genericModal').classList.add('hidden'); };
}