// Employé → Carburant : noter un plein (litres, prix, plaque, photo de la pompe ou du ticket) et revoir les siens.
// Sert aussi au « Rapport trajets » de l'admin (modules/admin-travel-report.js) pour l'affichage d'un plein et sa photo.
import { collection, query, where, getDocs, getDoc, doc, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, currentUser, pageContent, showConfirmationModal, showInfoModal, showToast } from "../app.js";
import { escapeHTML } from './work-profile.js';
import { compressImage, openPhoto, dayLabel } from './retours-clients.js';
import { PLEINS, PLEINS_PHOTOS, PLATE_MAX, PHOTO_MAX_CHARS, DEFAULT_PLATES, NO_PLATE, plateLabel, parseAmount, normalizePlate, validatePlein, summarize, byNewest, litresLabel, eurosLabel, perLitreLabel } from './pleins.js';

const LAST_PLATE_KEY = 'lastFuelPlate';
const OTHER_PLATE = '__autre';
const CAMERA_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>';

let pleins = [];
let photoFile = null;
let photoUrl = null;

const todayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const toPlein = (d) => ({ id: d.id, ...d.data(), createdMs: d.data().createdAt?.toMillis?.() || Date.now() });

export async function render() {
    photoFile = null;
    let lastPlate = '';
    try { lastPlate = localStorage.getItem(LAST_PLATE_KEY) || ''; } catch { /* stockage indisponible */ }

    pageContent.innerHTML = `
        <div class="max-w-3xl mx-auto rc-page">
            <div>
                <h2 class="text-2xl font-bold">Carburant</h2>
                <p class="rc-help">Tu as fait le plein de la voiture ? Note-le ici, avec la photo de la pompe ou du ticket.</p>
            </div>
            <form id="fuForm" class="fu-form" novalidate>
                <div class="fu-grid">
                    <div class="field">
                        <label class="field-label" for="fuDate">Date du plein</label>
                        <input id="fuDate" type="date" class="input" value="${todayKey()}" max="${todayKey()}" required>
                    </div>
                    <div class="field">
                        <label class="field-label" for="fuPlateSelect">Plaque de la voiture</label>
                        <select id="fuPlateSelect" class="input" required></select>
                        <input id="fuPlate" type="text" class="input fu-plate" maxlength="${PLATE_MAX}" placeholder="1-ABC-123" autocapitalize="characters" autocomplete="off" spellcheck="false" aria-label="Autre plaque" hidden>
                    </div>
                    <div class="field">
                        <label class="field-label" for="fuLitres">Litres</label>
                        <div class="input-suffix"><input id="fuLitres" type="text" inputmode="decimal" class="input" placeholder="42,50" autocomplete="off" required><span>L</span></div>
                    </div>
                    <div class="field">
                        <label class="field-label" for="fuMontant">Prix payé</label>
                        <div class="input-suffix"><input id="fuMontant" type="text" inputmode="decimal" class="input" placeholder="78,40" autocomplete="off" required><span>€</span></div>
                    </div>
                </div>
                <p class="field-hint" id="fuPerLitre" aria-live="polite"></p>
                <div class="field">
                    <span class="field-label">Photo de la pompe ou du ticket</span>
                    <label class="pc-pick" id="fuPick">
                        ${CAMERA_ICON}<span>Prendre ou choisir une photo</span>
                        <input id="fuPhoto" type="file" accept="image/*" class="sr-only">
                    </label>
                    <div class="pc-preview" id="fuPreview" hidden>
                        <img alt="Photo du plein">
                        <button type="button" class="btn btn-secondary" id="fuPhotoRemove">Changer la photo</button>
                    </div>
                </div>
                <button type="submit" class="btn btn-primary btn-block" id="fuSave">Enregistrer le plein</button>
            </form>
            <div>
                <h3 class="fu-title">Mes pleins</h3>
                <p class="rc-help" id="fuTotals"></p>
            </div>
            <div id="fuList" class="rc-list"><div class="page-loader"><div class="spinner" role="status" aria-label="Chargement"></div></div></div>
        </div>`;

    const plate = document.getElementById('fuPlate');
    plate.onblur = () => { plate.value = normalizePlate(plate.value); };
    fillPlateSelect(lastPlate);
    document.getElementById('fuPlateSelect').onchange = updatePlateInput;
    ['fuLitres', 'fuMontant'].forEach(id => { document.getElementById(id).oninput = updatePerLitre; });
    document.getElementById('fuPhoto').onchange = (e) => setPhoto(e.target.files?.[0] || null);
    document.getElementById('fuPhotoRemove').onclick = () => { setPhoto(null); document.getElementById('fuPhoto').click(); };
    document.getElementById('fuForm').onsubmit = save;
    document.getElementById('fuList').onclick = handleListClick;

    try {
        const snap = await getDocs(query(collection(db, PLEINS), where('uid', '==', currentUser.uid)));
        pleins = snap.docs.map(toPlein).sort(byNewest);
    } catch (error) {
        console.error("Erreur de chargement des pleins:", error);
        if (document.getElementById('fuList')) document.getElementById('fuList').innerHTML = '<p class="rc-empty">Impossible de charger tes pleins.</p>';
        return;
    }
    if (!document.getElementById('fuList')) return; // page quittée pendant le chargement
    renderList();
}

export function cleanup() {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photoUrl = null;
    photoFile = null;
}

function setPhoto(file) {
    photoFile = file;
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photoUrl = file ? URL.createObjectURL(file) : null;
    const preview = document.getElementById('fuPreview');
    if (!preview) return;
    if (!file) document.getElementById('fuPhoto').value = '';
    preview.querySelector('img').src = photoUrl || '';
    preview.hidden = !file;
    document.getElementById('fuPick').hidden = !!file;
}

/** Liste des plaques : voitures de l'équipe, plaques déjà utilisées, « autre » à taper et « non disponible ». */
function fillPlateSelect(selected) {
    const select = document.getElementById('fuPlateSelect');
    if (!select) return;
    const known = new Set(DEFAULT_PLATES.map(p => p.plaque));
    const used = [...new Set([selected, ...pleins.map(p => p.plaque)])]
        .filter(p => p && p !== NO_PLATE && p !== OTHER_PLATE && !known.has(p));
    const option = (value, text) => `<option value="${escapeHTML(value)}">${escapeHTML(text)}</option>`;
    select.innerHTML = option('', 'Choisis la voiture…')
        + DEFAULT_PLATES.map(p => option(p.plaque, `${p.plaque} · ${p.label}`)).join('')
        + used.map(p => option(p, p)).join('')
        + option(OTHER_PLATE, 'Autre plaque (à taper)…')
        + option(NO_PLATE, 'Plaque non disponible');
    select.value = selected || '';
    if (select.value !== (selected || '')) select.value = '';
    updatePlateInput();
}

function updatePlateInput(e) {
    const other = document.getElementById('fuPlateSelect').value === OTHER_PLATE;
    const input = document.getElementById('fuPlate');
    input.hidden = !other;
    input.required = other;
    if (other && e) input.focus();
}

function selectedPlate() {
    const value = document.getElementById('fuPlateSelect').value;
    return value === OTHER_PLATE ? document.getElementById('fuPlate').value : value;
}

function updatePerLitre() {
    const litres = parseAmount(document.getElementById('fuLitres').value);
    const montant = parseAmount(document.getElementById('fuMontant').value);
    document.getElementById('fuPerLitre').textContent = litres > 0 && montant > 0 ? `Soit ${perLitreLabel({ litres, montant })}` : '';
}

/** Photo réduite jusqu'à tenir dans un document Firestore (un ticket doit rester lisible : on part de 1400 px). */
async function photoDataUrl(file) {
    for (const [side, quality] of [[1400, 0.7], [1100, 0.6], [800, 0.5]]) {
        const dataUrl = await compressImage(file, side, quality);
        if (dataUrl.length <= PHOTO_MAX_CHARS) return dataUrl;
    }
    throw new Error('Photo trop lourde');
}

async function save(e) {
    e.preventDefault();
    const checked = validatePlein({
        date: document.getElementById('fuDate').value,
        plaque: selectedPlate(),
        litres: document.getElementById('fuLitres').value,
        montant: document.getElementById('fuMontant').value,
        hasPhoto: !!photoFile,
    }, todayKey());
    if (checked.error) { showToast(checked.error, 'warning'); return; }
    if (!navigator.onLine) { showInfoModal("Pas de connexion", "Il faut du réseau pour envoyer la photo. Réessaie dès que tu as de la connexion."); return; }

    const btn = document.getElementById('fuSave');
    btn.disabled = true;
    btn.textContent = 'Envoi…';
    try {
        const photo = await photoDataUrl(photoFile);
        const ref = doc(collection(db, PLEINS));
        const plein = { ...checked.value, uid: currentUser.uid, userName: currentUser.displayName || '' };
        const batch = writeBatch(db);
        batch.set(ref, { ...plein, createdAt: serverTimestamp() });
        batch.set(doc(db, PLEINS_PHOTOS, ref.id), { uid: currentUser.uid, photo, createdAt: serverTimestamp() });
        await batch.commit();

        try { localStorage.setItem(LAST_PLATE_KEY, plein.plaque); } catch { /* stockage indisponible */ }
        pleins = [{ id: ref.id, ...plein, createdMs: Date.now() }, ...pleins].sort(byNewest);
        showToast("Plein enregistré. Merci !");
        if (!document.getElementById('fuForm')) return; // page quittée pendant l'envoi
        document.getElementById('fuLitres').value = '';
        document.getElementById('fuMontant').value = '';
        document.getElementById('fuPlate').value = '';
        setPhoto(null);
        updatePerLitre();
        renderList(plein.plaque);
    } catch (error) {
        console.error("Erreur d'enregistrement du plein:", error);
        const message = /illisible|trop lourde/i.test(String(error?.message))
            ? "Cette photo ne peut pas être utilisée. Reprends-la et réessaie."
            : "Le plein n'a pas été enregistré. Vérifie la connexion et réessaie.";
        showInfoModal("Erreur", message);
    } finally {
        if (document.getElementById('fuSave')) { btn.disabled = false; btn.textContent = 'Enregistrer le plein'; }
    }
}

function renderList(selected = document.getElementById('fuPlateSelect').value) {
    fillPlateSelect(selected);

    const year = String(new Date().getFullYear());
    const total = summarize(pleins.filter(p => (p.date || '').startsWith(year)));
    document.getElementById('fuTotals').textContent = total.count
        ? `En ${year} : ${total.count} plein${total.count > 1 ? 's' : ''} · ${litresLabel(total.litres)} · ${eurosLabel(total.montant)}`
        : '';
    document.getElementById('fuList').innerHTML = pleins.length
        ? pleins.map(p => pleinRowHTML(p)).join('')
        : '<p class="rc-empty">Aucun plein noté pour le moment.</p>';
}

/** Une ligne de plein (employé et admin). `who` : afficher le nom du conducteur. */
export function pleinRowHTML(p, { who = false } = {}) {
    return `
        <article class="fu-row" data-id="${p.id}">
            <div class="fu-row-main">
                <b>${escapeHTML(dayLabel(p.date))}${who ? ` · ${escapeHTML(p.userName || 'Employé')}` : ''}</b>
                <span class="fu-plate-tag">${escapeHTML(plateLabel(p.plaque))}</span>
            </div>
            <div class="fu-row-main">
                <span><b>${eurosLabel(p.montant)}</b> · ${litresLabel(p.litres)} <span class="rc-help">(${perLitreLabel(p)})</span></span>
                <span class="rc-actions">
                    <button type="button" class="btn btn-secondary" data-photo="${p.id}">Photo</button>
                    <button type="button" class="btn btn-secondary rc-danger" data-delete="${p.id}">Supprimer</button>
                </span>
            </div>
        </article>`;
}

/** Ouvre la photo d'un plein (lue seulement à ce moment-là). */
export async function openPleinPhoto(id, btn) {
    if (btn) btn.disabled = true;
    try {
        const snap = await getDoc(doc(db, PLEINS_PHOTOS, id));
        if (snap.exists() && snap.data().photo) openPhoto(snap.data().photo);
        else showInfoModal("Photo introuvable", "La photo de ce plein n'a pas été retrouvée.");
    } catch (error) {
        console.error("Erreur de chargement de la photo du plein:", error);
        showInfoModal("Erreur", "La photo n'a pas pu être chargée. Vérifie la connexion et réessaie.");
    } finally {
        if (btn) btn.disabled = false;
    }
}

/** Supprime un plein et sa photo, après confirmation ; renvoie true si c'est fait. */
export async function deletePlein(p) {
    const ok = await showConfirmationModal("Supprimer ce plein ?", `${dayLabel(p.date)} · ${plateLabel(p.plaque)} · ${eurosLabel(p.montant)}. La photo sera supprimée aussi.`);
    if (!ok) return false;
    try {
        const batch = writeBatch(db);
        batch.delete(doc(db, PLEINS, p.id));
        batch.delete(doc(db, PLEINS_PHOTOS, p.id));
        await batch.commit();
        showToast("Plein supprimé.");
        return true;
    } catch (error) {
        console.error("Erreur de suppression du plein:", error);
        showInfoModal("Erreur", "Le plein n'a pas été supprimé. Vérifie la connexion et réessaie.");
        return false;
    }
}

async function handleListClick(e) {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.photo) { openPleinPhoto(btn.dataset.photo, btn); return; }
    const p = pleins.find(x => x.id === btn.dataset.delete);
    if (p && await deletePlein(p)) {
        pleins = pleins.filter(x => x.id !== p.id);
        if (document.getElementById('fuList')) renderList();
    }
}
