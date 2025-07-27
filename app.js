import { initializeApp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, signOut } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";
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

// --- DÉCLARATION DES VARIABLES DE LA MODALE (sans initialisation) ---
let genericModal, modalTitle, modalMessage, modalConfirmBtn, modalCancelBtn;

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
    { id: 'admin-data', name: 'Données' },
    { id: 'admin-tarifs', name: 'Tarifs' }, // <-- AJOUTEZ CETTE LIGNE
    { id: 'admin-chantiers', name: 'Gestion Chantiers' },
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

document.addEventListener('DOMContentLoaded', () => {
    // --- INITIALISATION DES VARIABLES DE LA MODALE ---
    genericModal = document.getElementById('genericModal');
    modalTitle = document.getElementById('modalTitle');
    modalMessage = document.getElementById('modalMessage');
    modalConfirmBtn = document.getElementById('modalConfirmBtn');
    modalCancelBtn = document.getElementById('modalCancelBtn');

    // --- GESTION DES CONTENEURS PRINCIPAUX ---
    const loader = document.getElementById('app-loader');
    const authContainer = document.getElementById('auth-container');
    const pendingContainer = document.getElementById('pending-approval-container');
    const appContainer = document.getElementById('app-container');

    // --- GESTION DES FORMULAIRES D'AUTHENTIFICATION ---
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const resetForm = document.getElementById('reset-form');

    // Liens pour basculer entre les formulaires
    document.getElementById('show-register-link').onclick = (e) => { e.preventDefault(); loginForm.classList.add('hidden'); registerForm.classList.remove('hidden'); };
    document.getElementById('show-reset-link').onclick = (e) => { e.preventDefault(); loginForm.classList.add('hidden'); resetForm.classList.remove('hidden'); };
    document.getElementById('show-login-link-from-register').onclick = (e) => { e.preventDefault(); registerForm.classList.add('hidden'); loginForm.classList.remove('hidden'); };
    document.getElementById('show-login-link-from-reset').onclick = (e) => { e.preventDefault(); resetForm.classList.add('hidden'); loginForm.classList.remove('hidden'); };

    // Événement pour la déconnexion
    document.getElementById('logoutBtn').onclick = () => signOut(auth);
    document.getElementById('logoutPendingBtn').onclick = () => signOut(auth);

    // --- Logique d'inscription ---
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('register-name').value;
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // Crée le document utilisateur dans Firestore avec le statut "pending"
            await setDoc(doc(db, "users", user.uid), {
                displayName: name,
                email: user.email,
                uid: user.uid,
                status: 'pending', // Le compte est en attente d'approbation
                role: 'user',
                createdAt: serverTimestamp()
            });
            // onAuthStateChanged va maintenant détecter ce nouvel utilisateur et afficher l'écran d'attente
        } catch (error) {
            console.error("Erreur d'inscription:", error);
            showInfoModal("Erreur", "Impossible de créer le compte. L'email est peut-être déjà utilisé ou le mot de passe est trop faible.");
        }
    });

    // --- Logique de connexion ---
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        try {
            await signInWithEmailAndPassword(auth, email, password);
            // onAuthStateChanged va gérer l'affichage de l'application
        } catch (error) {
            console.error("Erreur de connexion:", error);
            showInfoModal("Erreur", "Email ou mot de passe incorrect.");
        }
    });

    // --- Logique de mot de passe oublié ---
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

    // --- ÉCOUTEUR PRINCIPAL (INCHANGÉ) ---
    // Il gère l'affichage des écrans après une connexion/inscription réussie
    onAuthStateChanged(auth, async (user) => {
        try {
            authContainer.style.display = 'none';
            pendingContainer.style.display = 'none';
            appContainer.style.display = 'none';
            loader.style.display = 'flex';

            if (user) {
                const userRef = doc(db, "users", user.uid);
                const userDoc = await getDoc(userRef);

                // Si le document existe, on vérifie son statut
                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    currentUser = { ...user, ...userData };
                    isAdmin = userData.role === 'admin';

                    switch (userData.status) {
                        case 'pending':
                            loader.style.display = 'none';
                            pendingContainer.style.display = 'flex';
                            break;
                        case 'banned':
                            showInfoModal("Compte Banni", "Votre compte a été banni par un administrateur.");
                            signOut(auth);
                            break;
                        case 'approved':
                            document.getElementById('currentUserDisplay').textContent = userData.displayName || user.email;
                            setupNavigation();
                            setupNotifications();
                            navigateTo(isAdmin ? 'admin-dashboard' : 'user-dashboard');
                            loader.style.display = 'none';
                            appContainer.style.display = 'block';
                            break;
                        default:
                            showInfoModal("Erreur de Compte", "Le statut de votre compte est inconnu.");
                            signOut(auth);
                    }
                } else {
                    // Ce cas peut arriver si un utilisateur existe dans Firebase Auth mais pas dans Firestore
                    // On le déconnecte pour forcer une inscription propre.
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
            showInfoModal("Erreur Critique", "Une erreur critique est survenue.");
            if (auth.currentUser) signOut(auth);
            else authContainer.style.display = 'flex';
        } finally {
            loader.style.display = 'none';
        }
    });

    // --- GESTION DU SERVICE WORKER (INCHANGÉ) ---
    if ('serviceWorker' in navigator) {
        // ... (votre code existant pour le service worker reste ici)
    }
});

// --- SYSTÈME DE MODALE GÉNÉRIQUE ---

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