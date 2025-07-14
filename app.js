// app.js - Fichier principal et routeur

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDm-C8VDT1Td85WUBWR7MxlrjDkY78eoHs",
  authDomain: "pointeuse-lpf.firebaseapp.com",
  projectId: "pointeuse-lpf",
  storageBucket: "pointeuse-lpf.appspot.com",
  messagingSenderId: "649868999549",
  appId: "1:649868999549:web:aa54b056faaca0924f6a14",
  measurementId: "G-Q8WQGCDPFX"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
export const db = getFirestore(app);

const loader = document.getElementById('app-loader');
const authContainer = document.getElementById('auth-container');
const pendingContainer = document.getElementById('pending-approval-container');
const appContainer = document.getElementById('app-container');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const logoutPendingBtn = document.getElementById('logoutPendingBtn');
export const pageContent = document.getElementById('page-content');

export let currentUser = null;
export let isAdmin = false;

onAuthStateChanged(auth, async (user) => {
    // NOUVEAU : On entoure toute la logique d'un bloc try...catch
    try {
        loader.style.display = 'flex';
        authContainer.style.display = 'none';
        pendingContainer.style.display = 'none';
        appContainer.style.display = 'none';

        if (user) {
            const userRef = doc(db, "users", user.uid);
            let userDoc = await getDoc(userRef);

            if (!userDoc.exists()) {
                const adminDocRef = doc(db, "admins", user.uid);
                const adminDoc = await getDoc(adminDocRef);
                let initialStatus = 'pending';
                let initialRole = 'user';
                if (adminDoc.exists()) {
                    initialStatus = 'approved';
                    initialRole = 'admin';
                }
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
                    loader.style.display = 'none';
                    appContainer.style.display = 'block';
                    setupNavigation();
                    navigateTo(isAdmin ? 'admin-dashboard' : 'user-dashboard');
                    break;
                default:
                    alert("Statut de compte inconnu. Veuillez contacter l'administrateur.");
                    signOut(auth);
            }
        } else {
            currentUser = null;
            isAdmin = false;
            loader.style.display = 'none';
            authContainer.style.display = 'flex';
        }
    } catch (error) {
        console.error("Erreur critique lors de l'initialisation de l'utilisateur :", error);
        alert("Une erreur critique est survenue au démarrage. Vérifiez la console (F12) pour les détails.");
        loader.style.display = 'none';
        // On déconnecte l'utilisateur en cas d'erreur pour éviter une boucle
        if (auth.currentUser) {
            signOut(auth);
        } else {
            authContainer.style.display = 'flex';
        }
    }
});


loginBtn.onclick = () => signInWithPopup(auth, new GoogleAuthProvider());
logoutBtn.onclick = () => signOut(auth);
logoutPendingBtn.onclick = () => signOut(auth);

const userTabs = [ { id: 'user-dashboard', name: 'Planning' }, { id: 'chantiers', name: 'Infos Chantiers' }, { id: 'add-entry', name: 'Nouveau Pointage' }, { id: 'user-history', name: 'Mon Historique' }, ];
const adminTabs = [ { id: 'admin-dashboard', name: 'Tableau de Bord' }, { id: 'admin-planning', name: 'Planification' }, { id: 'admin-chantiers', name: 'Gestion Chantiers' }, { id: 'chantiers', name: 'Infos Chantiers' }, { id: 'admin-colleagues', name: 'Collègues' }, { id: 'admin-users', name: 'Utilisateurs' }, ];
function setupNavigation() {const tabs = isAdmin ? adminTabs : userTabs;const mainNav = document.getElementById('main-nav'); const mobileNav = document.getElementById('mobile-nav');[mainNav, mobileNav].forEach(nav => {nav.innerHTML = '';tabs.forEach(tab => {const tabButton = document.createElement('button');tabButton.id = `nav-${tab.id}`;tabButton.textContent = tab.name;tabButton.className = 'px-3 py-2 text-sm font-medium rounded-md text-gray-700 hover:bg-gray-200';tabButton.onclick = () => navigateTo(tab.id);nav.appendChild(tabButton);});});}
export async function navigateTo(pageId, params = {}) {if (pageId === 'user-details') {pageId = 'user-history';}document.querySelectorAll('#main-nav button, #mobile-nav button').forEach(btn => {btn.classList.toggle('nav-active', btn.id === `nav-${pageId}`);});pageContent.innerHTML = `<p class="text-center mt-8 animate-pulse">Chargement...</p>`;try {const pageModule = await import(`./modules/${pageId}.js`);await pageModule.render(params);} catch (error) {console.error(`Erreur de chargement du module ${pageId}:`, error);pageContent.innerHTML = `<p class="text-red-500 text-center mt-8">Erreur: Impossible de charger la page "${pageId}".</p>`;}}
if ('serviceWorker' in navigator) {window.addEventListener('load', () => {navigator.serviceWorker.register('./sw.js').then(reg => console.log('Service Worker enregistré.', reg.scope)).catch(err => console.log('Erreur Service Worker:', err));});}