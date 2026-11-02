// Photos « avant » et « après » d'un pointage (facultatives) : réduites sur le téléphone (~200 Ko),
// envoyées dans Firebase Storage (photos/AAAA-MM/uid/…), lien gardé dans le pointage :
//   pointage.photos = { avant: { url, path, at }, apres: { url, path, at } }
// Supprimées automatiquement après 6 mois (functions/index.js, cleanupOldPhotos). Règles : storage.rules.
import { getApp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-app.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-storage.js";
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, currentUser, showToast } from "../app.js";
import { compressImage, openPhoto } from "./retours-clients.js";

export const PHOTO_LABELS = { avant: 'Avant', apres: 'Après' };
const CAMERA_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>';

/** Champ « photo » d'une fenêtre (démarrage ou arrêt du pointage). */
export function photoFieldHTML(kind) {
    return `
        <div class="pc-field" data-photo-field="${kind}">
            <label class="pc-pick">
                ${CAMERA_ICON}<span>Photo ${PHOTO_LABELS[kind].toLowerCase()} <small>(facultatif)</small></span>
                <input type="file" accept="image/*" capture="environment" class="sr-only">
            </label>
            <div class="pc-preview" hidden>
                <img alt="Photo ${PHOTO_LABELS[kind].toLowerCase()}">
                <button type="button" class="pc-remove">Retirer</button>
            </div>
        </div>`;
}

/** Active un champ photo ; renvoie { file() } pour lire la photo choisie au moment de valider. */
export function bindPhotoField(container) {
    const field = container?.querySelector('[data-photo-field]');
    if (!field) return { file: () => null, reset() {} };
    const input = field.querySelector('input');
    const preview = field.querySelector('.pc-preview');
    const pick = field.querySelector('.pc-pick');
    let chosen = null;
    let objectUrl = null;
    const reset = () => {
        chosen = null;
        input.value = '';
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        objectUrl = null;
        preview.hidden = true;
        pick.hidden = false;
    };
    input.onchange = () => {
        const f = input.files?.[0];
        if (!f) return;
        chosen = f;
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        objectUrl = URL.createObjectURL(f);
        preview.querySelector('img').src = objectUrl;
        preview.hidden = false;
        pick.hidden = true;
    };
    field.querySelector('.pc-remove').onclick = reset;
    reset();
    return { file: () => chosen, reset };
}

function dataUrlToBlob(dataUrl) {
    const [head, b64] = dataUrl.split(',');
    const bytes = atob(b64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return new Blob([arr], { type: head.match(/data:(.*?);/)?.[1] || 'image/jpeg' });
}

/**
 * Réduit puis envoie la photo d'un pointage, en arrière-plan : le pointage n'attend jamais la photo.
 * Hors ligne, l'envoi est retenté au retour du réseau (tant que l'appli reste ouverte).
 */
export function uploadPointagePhoto(pointageId, kind, file) {
    if (!file || !pointageId || !currentUser) return;
    const uid = currentUser.uid;
    const attempt = async () => {
        const blob = dataUrlToBlob(await compressImage(file));
        const now = new Date();
        const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const path = `photos/${month}/${uid}/${pointageId}-${kind}-${now.getTime()}.jpg`;
        const storageRef = ref(getStorage(getApp()), path);
        await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' });
        const url = await getDownloadURL(storageRef);
        await updateDoc(doc(db, "pointages", pointageId), { [`photos.${kind}`]: { url, path, at: now.toISOString() } });
        showToast(`Photo « ${PHOTO_LABELS[kind].toLowerCase()} » enregistrée.`);
    };
    const run = () => attempt().catch(error => {
        console.error("Photo du pointage non envoyée :", error);
        if (!navigator.onLine) { window.addEventListener('online', run, { once: true }); return; }
        showToast(`La photo « ${PHOTO_LABELS[kind].toLowerCase()} » n'a pas pu être envoyée.`, 'warning');
    });
    if (!navigator.onLine) {
        showToast("Hors ligne : la photo sera envoyée au retour du réseau.", 'info');
        window.addEventListener('online', run, { once: true });
        return;
    }
    run();
}

/** Boutons « Avant / Après » d'un pointage dans l'historique. */
export function photoChipsHTML(pointage) {
    const photos = pointage?.photos || {};
    const kinds = Object.keys(PHOTO_LABELS).filter(k => photos[k]?.url);
    if (!kinds.length) return '';
    return `<div class="pc-chips">${kinds.map(k => `<button type="button" class="pc-chip" data-photo-url="${encodeURI(photos[k].url)}">${CAMERA_ICON}${PHOTO_LABELS[k]}</button>`).join('')}</div>`;
}

/** Clic sur un bouton photo de l'historique : renvoie true si le clic a été traité. */
export function handlePhotoChipClick(e) {
    const chip = e.target.closest?.('[data-photo-url]');
    if (!chip) return false;
    openPhoto(decodeURI(chip.dataset.photoUrl));
    return true;
}
