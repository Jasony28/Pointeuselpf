const APP_VERSION = 'v2.1.2';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, signOut } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp, collection, query, where, getDocs, orderBy, limit, addDoc, initializeFirestore, CACHE_SIZE_UNLIMITED } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";

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

export function isEffectiveAdmin() {
    return isAdmin && !isMasqueradingAsUser;
}

const userTabs = [
    { id: 'user-dashboard', name: 'Planning' },
    { id: 'user-leave', name: 'Mes Congés' },
    { id: 'user-updates', name: 'Détails chantier' },
    { id: 'chantiers', name: 'Infos Chantiers' },
    { id: 'user-history', name: 'Mon Historique' },
];

const adminTabs = [
    { id: 'admin-dashboard', name: 'Tableau de Bord' },
    { id: 'admin-planning', name: 'Planification' },
    { id: 'admin-invoicing', name: 'Facturation' },
    { id: 'admin-tarifs', name: 'Tarifs' },
    { id: 'admin-chantiers', name: 'Gestion Chantiers' },
    { id: 'admin-leave', name: 'Gestion Congés' },
    { id: 'admin-pointage-log', name: 'Logs Pointages' },
    { id: 'admin-data', name: 'Données' },
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
    const mainNav = document.getElementById('main-nav');
    const mobileNav = document.getElementById('mobile-nav');
    [mainNav, mobileNav].forEach(nav => {
        nav.innerHTML = '';
        tabs.forEach(tab => {
            const tabButton = document.createElement('button');
            tabButton.id = `nav-${tab.id}`;
            tabButton.textContent = tab.name;
            tabButton.className = 'px-3 py-2 text-sm font-medium rounded-md text-gray-700 hover:bg-gray-200';
            tabButton.onclick = () => navigateTo(tab.id);
            nav.appendChild(tabButton);
        });
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
    document.querySelectorAll('#main-nav button, #mobile-nav button').forEach(btn => {
        btn.classList.toggle('nav-active', btn.id === `nav-${pageId}`);
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
    notificationBell.onclick = (event) => {
        event.stopPropagation();
        notificationPanel.classList.toggle('hidden');
        if (!notificationPanel.classList.contains('hidden')) loadNotifications();
    };
    checkForUnreadNotifications();
}

async function loadNotifications() {
    const notificationList = document.getElementById('notification-list');
    notificationList.innerHTML = '<p class="p-4 text-sm text-gray-500">Chargement...</p>';
    try {
        const q = query(collection(db, "notifications"), orderBy("createdAt", "desc"), limit(10));
        const snapshot = await getDocs(q);
        if (snapshot.empty) {
            notificationList.innerHTML = '<p class="p-4 text-sm text-gray-500">Aucune notification.</p>';
            return;
        }
        notificationList.innerHTML = '';
        snapshot.forEach(docSnap => {
            const notif = docSnap.data();
            const div = document.createElement('div');
            div.className = 'p-3 border-b hover:bg-gray-50';
            div.innerHTML = `<p class="font-semibold">${notif.title}</p><p class="text-sm text-gray-600">${notif.body}</p><p class="text-xs text-gray-400 mt-1">${new Date(notif.createdAt.seconds * 1000).toLocaleString('fr-FR')}</p>`;
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

    document.getElementById('logoutBtn').onclick = () => signOut(auth);
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
            console.error("Erreur d'inscription:", error);
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
            console.error("Erreur de connexion:", error);
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
            console.error("Erreur de réinitialisation:", error);
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
                    isMasqueradingAsUser = isAdmin; // Un admin démarre en "vue employé"
                    
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
                console.error("Erreur de récupération du profil (probablement hors-ligne):", error);
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
    
    if ('serviceWorker' in navigator) {
        // ... (le code du service worker reste le même)
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