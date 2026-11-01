// Notifications sur le téléphone (Firebase Cloud Messaging).
// Le jeton de l'appareil est rangé dans users/{uid}/pushTokens/{jeton} : seul le serveur s'en sert pour envoyer.
import { getApp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-app.js";
import { doc, getDoc, setDoc, deleteDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, currentUser, isNativeApp } from "../app.js";

// Clé web publique (Paramètres du projet → Cloud Messaging → Certificats Web Push) : elle peut être dans le code
const VAPID_KEY = 'BHhKeM_C4IrICje6WSMd5hTJtIO87pwnQwwcpNouY__n7iTpR_N4Ha3bWtIXzHrNbOuz7zKD5JXdVlb8d3zYrD0';
// Gardés par compte : sur un téléphone partagé, chaque compte a son propre abonnement
const tokenKey = () => `pushToken:${currentUser?.uid}`;
const seenKey = () => `pushTokenSeen:${currentUser?.uid}`;
const LEGACY_TOKEN_KEY = 'pushToken'; // v4.7.0 : clé commune à tous les comptes
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// rappels = « As-tu oublié de pointer ? » (pointage oublié ou qui dépasse la durée prévue de plus de 30 min)
export const DEFAULT_PREFS = { messages: true, planning: true, conges: true, rappels: true };

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

export function getPlatform() {
    if (isIOS()) return 'ios';
    if (/Android/i.test(navigator.userAgent)) return 'android';
    return 'desktop';
}

/**
 * État des notifications sur cet appareil :
 * 'native' (appli Android, pas encore prise en charge), 'ios-install' (iPhone : ajouter à l'écran d'accueil),
 * 'unsupported', 'denied', 'default' (pas encore demandé), 'granted' (autorisé mais pas d'abonnement), 'enabled'.
 */
export function getPushState() {
    if (isNativeApp) return 'native';
    const supported = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
    if (isIOS() && !isStandalone()) return 'ios-install';
    if (!supported) return 'unsupported';
    if (Notification.permission === 'denied') return 'denied';
    if (Notification.permission === 'default') return 'default';
    return localStorage.getItem(tokenKey()) ? 'enabled' : 'granted';
}

export function getPrefs() {
    return { ...DEFAULT_PREFS, ...(currentUser?.notifPrefs || {}) };
}

export async function savePrefs(prefs) {
    await updateDoc(doc(db, "users", currentUser.uid), { notifPrefs: prefs });
    currentUser.notifPrefs = prefs;
}

async function getRegistration() {
    return (await navigator.serviceWorker.getRegistration('./')) || navigator.serviceWorker.register('./sw.js');
}

async function getMessagingApi() {
    const api = await import("https://www.gstatic.com/firebasejs/10.5.0/firebase-messaging.js");
    if (!(await api.isSupported())) throw new Error('unsupported');
    return { ...api, messaging: api.getMessaging(getApp()) };
}

async function saveToken(token) {
    const previous = localStorage.getItem(tokenKey());
    const ref = doc(db, "users", currentUser.uid, "pushTokens", token);
    const data = { platform: getPlatform(), lastSeen: serverTimestamp() };
    if (previous !== token) data.createdAt = serverTimestamp();
    await setDoc(ref, data, { merge: true });
    if (previous && previous !== token) {
        await deleteDoc(doc(db, "users", currentUser.uid, "pushTokens", previous)).catch(() => {});
    }
    localStorage.setItem(tokenKey(), token);
    localStorage.setItem(seenKey(), String(Date.now()));
}

/** Demande l'autorisation puis abonne cet appareil. Renvoie le nouvel état. */
export async function enablePush() {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return getPushState();
    const { messaging, getToken } = await getMessagingApi();
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: await getRegistration() });
    if (!token) throw new Error('no-token');
    await saveToken(token);
    if (!currentUser.notifPrefs) await savePrefs(getPrefs());
    return getPushState();
}

/** Désabonne cet appareil (les autres appareils de la personne restent abonnés). */
export async function disablePush() {
    const token = localStorage.getItem(tokenKey());
    try {
        const { messaging, deleteToken } = await getMessagingApi();
        await deleteToken(messaging);
    } catch (error) { console.warn("Jeton non supprimé côté Firebase :", error); }
    if (token) await deleteDoc(doc(db, "users", currentUser.uid, "pushTokens", token)).catch(() => {});
    localStorage.removeItem(tokenKey());
    localStorage.removeItem(seenKey());
    return getPushState();
}

/**
 * Déconnexion : ce téléphone ne reçoit plus les notifications de ce compte
 * (l'autorisation du navigateur reste, le compte suivant pourra s'abonner en un appui).
 */
export async function forgetDeviceOnLogout() {
    const token = localStorage.getItem(tokenKey());
    if (token) await deleteDoc(doc(db, "users", currentUser.uid, "pushTokens", token)).catch(() => {});
    localStorage.removeItem(tokenKey());
    localStorage.removeItem(seenKey());
}

/** v4.7.0 gardait un seul jeton pour tous les comptes : on le rattache au compte seulement s'il lui appartient. */
async function migrateLegacyToken() {
    const legacy = localStorage.getItem(LEGACY_TOKEN_KEY);
    if (!legacy) return;
    localStorage.removeItem(LEGACY_TOKEN_KEY);
    localStorage.removeItem('pushTokenSeen');
    try {
        if ((await getDoc(doc(db, "users", currentUser.uid, "pushTokens", legacy))).exists()) localStorage.setItem(tokenKey(), legacy);
    } catch (error) { /* hors ligne : l'utilisateur pourra réactiver dans Paramètres */ }
}

/**
 * Au démarrage : le navigateur peut changer le jeton. On le relit et on ne réécrit dans Firestore
 * que s'il a changé, ou une fois par semaine (le serveur oublie les appareils qui ne reviennent plus).
 */
export async function refreshPushToken() {
    await migrateLegacyToken();
    if (getPushState() !== 'enabled') return;
    try {
        const { messaging, getToken } = await getMessagingApi();
        const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: await getRegistration() });
        const lastSeen = Number(localStorage.getItem(seenKey()) || 0);
        if (token && (token !== localStorage.getItem(tokenKey()) || Date.now() - lastSeen > WEEK_MS)) await saveToken(token);
    } catch (error) {
        console.warn("Jeton de notification non rafraîchi :", error);
    }
}

const ASKED_KEY = 'pushAskedAt';
const ASK_AGAIN_MS = 14 * 24 * 60 * 60 * 1000;
const isModalOpen = () => [...document.querySelectorAll('.modal:not(.hidden), .fixed.inset-0:not(.hidden)')].some(el => el.offsetParent !== null);

/**
 * Au démarrage : propose d'activer les notifications, une fois (puis tous les 14 jours si « Plus tard »).
 * Attend que la fenêtre des nouveautés soit fermée pour ne pas empiler les fenêtres.
 */
export async function maybeAskForPush() {
    const state = getPushState();
    // 'granted' : autorisé sur ce téléphone, mais pas encore pour ce compte (téléphone partagé)
    if (!['default', 'granted', 'ios-install'].includes(state)) return;
    if (Date.now() - Number(localStorage.getItem(ASKED_KEY) || 0) < ASK_AGAIN_MS) return;
    for (let i = 0; i < 80 && isModalOpen(); i++) await new Promise(r => setTimeout(r, 1500));
    if (isModalOpen() || document.getElementById('pushAskSheet')) return;
    localStorage.setItem(ASKED_KEY, String(Date.now()));

    const ios = state === 'ios-install';
    const sheet = document.createElement('div');
    sheet.id = 'pushAskSheet';
    sheet.className = 'modal ios-install';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.innerHTML = `
        <div class="modal-panel">
            <div class="modal-body">
                <div class="ios-install-head">
                    <img src="./icons/lpf-192.png" alt="" class="ios-install-icon">
                    <div>
                        <h3 class="modal-title">Activer les notifications ?</h3>
                        <p class="modal-text" style="margin-top: 0.125rem;">Nouveaux messages, planning publié ou modifié, réponse à vos congés, et un rappel si vous oubliez de pointer.</p>
                    </div>
                </div>
                ${ios ? `<p class="modal-text">Sur iPhone, il faut d'abord ajouter l'appli à l'écran d'accueil, puis l'ouvrir depuis son icône.</p>` : ''}
                <p class="modal-text" style="font-size: 0.8125rem;">Vous pourrez choisir quoi recevoir dans Paramètres → Notifications.</p>
            </div>
            <div class="modal-footer">
                <button type="button" data-push-later class="btn btn-secondary">Plus tard</button>
                <button type="button" data-push-yes class="btn btn-primary">${ios ? 'Comment faire' : 'Activer'}</button>
            </div>
        </div>
    `;
    document.body.appendChild(sheet);
    sheet.querySelector('[data-push-later]').onclick = () => sheet.remove();
    sheet.querySelector('[data-push-yes]').onclick = async (e) => {
        if (ios) {
            sheet.remove();
            (await import('./settings.js')).showIOSInstallSheet();
            return;
        }
        e.currentTarget.disabled = true;
        e.currentTarget.textContent = 'Activation…';
        const { showToast } = await import('../app.js');
        try {
            const result = await enablePush();
            if (result === 'enabled') showToast("Notifications activées sur cet appareil.", 'success');
            else if (result === 'denied') showToast("Notifications refusées. Vous pourrez les autoriser dans les réglages du navigateur.", 'info');
        } catch (error) {
            console.error("Activation des notifications :", error);
            showToast("Impossible d'activer les notifications. Réessayez dans Paramètres.", 'error');
        }
        sheet.remove();
    };
}

/** Notification affichée par le téléphone lui-même : vérifie l'autorisation et l'affichage, sans serveur. */
export async function showTestNotification() {
    const registration = await getRegistration();
    await registration.showNotification('Pointeuse LPF', {
        body: 'Les notifications fonctionnent sur cet appareil.',
        icon: './icons/lpf-192.png',
        badge: './icons/lpf-192.png',
        tag: 'test',
    });
}
