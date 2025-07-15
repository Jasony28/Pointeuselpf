// app.js - Fichier principal et routeur

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp, collection, query, where, getDocs, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";

// --- CONFIGURATION ---
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
export const db = getFirestore(app);

export const pageContent = document.getElementById('page-content');
export let currentUser = null;
export let isAdmin = false;

// --- FONCTIONS DE L'APPLICATION ---

const userTabs = [
    { id: 'user-dashboard', name: 'Planning' },
    { id: 'chantiers', name: 'Infos Chantiers' },
    { id: 'add-entry', name: 'Nouveau Pointage' },
    { id: 'user-history', name: 'Mon Historique' },
];
const adminTabs = [
    { id: 'admin-dashboard', name: 'Tableau de Bord' },
    { id: 'admin-planning', name: 'Planification' },
    { id: 'admin-chantiers', name: 'Gestion Chantiers' },
    { id: 'chantiers', name: 'Infos Chantiers' },
    { id: 'admin-colleagues', name: 'Collègues' },
    { id: 'admin-users', name: 'Utilisateurs' },
];

function setupNavigation() {
    const tabs = isAdmin ? adminTabs : userTabs;
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

// --- GESTION DES NOTIFICATIONS ---

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

// --- LOGIQUE DE DÉMARRAGE DE L'APPLICATION ---

// On attend que le HTML soit entièrement chargé avant de lancer le JavaScript
document.addEventListener('DOMContentLoaded', () => {
    const loader = document.getElementById('app-loader');
    const authContainer = document.getElementById('auth-container');
    const pendingContainer = document.getElementById('pending-approval-container');
    const appContainer = document.getElementById('app-container');

    // Attacher les événements de connexion/déconnexion
    document.getElementById('loginBtn').onclick = () => signInWithPopup(auth, new GoogleAuthProvider());
    document.getElementById('logoutBtn').onclick = () => signOut(auth);
    document.getElementById('logoutPendingBtn').onclick = () => signOut(auth);

    // Écouteur principal pour l'état d'authentification
    onAuthStateChanged(auth, async (user) => {
        try {
            // Cacher tous les conteneurs et montrer le loader par défaut
            authContainer.style.display = 'none';
            pendingContainer.style.display = 'none';
            appContainer.style.display = 'none';
            loader.style.display = 'flex';

            if (user) {
                const userRef = doc(db, "users", user.uid);
                let userDoc = await getDoc(userRef);

                if (!userDoc.exists()) {
                    const adminDoc = await getDoc(doc(db, "admins", user.uid));
                    const initialStatus = adminDoc.exists() ? 'approved' : 'pending';
                    const initialRole = adminDoc.exists() ? 'admin' : 'user';
                    await setDoc(userRef, {
                        displayName: user.displayName, email: user.email, uid: user.uid,
                        status: initialStatus, role: initialRole, createdAt: serverTimestamp()
                    });
                    userDoc = await getDoc(userRef);
                }

                const userData = userDoc.data();
                currentUser = { ...user, ...userData };
                isAdmin = userData.role === 'admin';

                switch (userData.status) {
                    case 'pending':
                        loader.style.display = 'none';
                        pendingContainer.style.display = 'flex';
                        break;
                    case 'banned':
                        alert("Votre compte a été banni.");
                        signOut(auth);
                        break;
                    case 'approved':
                        document.getElementById('currentUserDisplay').textContent = user.displayName || user.email;
                        setupNavigation();
                        setupNotifications();
                        navigateTo(isAdmin ? 'admin-dashboard' : 'user-dashboard');
                        loader.style.display = 'none';
                        appContainer.style.display = 'block';
                        break;
                    default:
                        alert("Statut de compte inconnu.");
                        signOut(auth);
                }
            } else {
                currentUser = null;
                isAdmin = false;
                loader.style.display = 'none';
                authContainer.style.display = 'flex';
            }
        } catch (error) {
            console.error("Erreur critique d'initialisation :", error);
            alert("Une erreur critique est survenue. Vérifiez la console (F12) et votre 'firebaseConfig'.");
            loader.style.display = 'none';
            if (auth.currentUser) signOut(auth);
            else authContainer.style.display = 'flex';
        }
    });

    // Gestion du Service Worker pour le mode hors ligne et les mises à jour
    if ('serviceWorker' in navigator) {
        let newWorker;
        const updateBanner = document.getElementById('update-banner');
        document.getElementById('update-btn').addEventListener('click', () => {
            newWorker.postMessage({ type: 'SKIP_WAITING' });
        });

        navigator.serviceWorker.register('./sw.js').then(reg => {
            reg.addEventListener('updatefound', () => {
                newWorker = reg.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        updateBanner.classList.remove('hidden');
                    }
                });
            });
        });

        let refreshing;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (refreshing) return;
            window.location.reload();
            refreshing = true;
        });
    }
});