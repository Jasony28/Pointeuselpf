// Retours clients : la patronne signale un chantier qui s'est mal passé, à partir du pointage de l'employé.
// Collection « retoursClients » (règles : docs/firestore.rules, 10) — un document par employé concerné :
// { uid, userName, pointageId, chantier, chantierId, date, start, end, level (1-3), reasons[], clientMessage,
//   adminMessage, photos[] (images réduites, en data URL), groupId, createdAt, createdBy, createdByName,
//   readAt, reply, replyAt, cancelled, cancelledAt }
import { collection, query, where, getDocs, doc, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, currentUser, showToast, showInfoModal } from "../app.js";
import { escapeHTML } from './work-profile.js';

export const RETOURS = 'retoursClients';

export const LEVELS = {
    1: { label: 'À noter', hint: 'Petit détail, pour info' },
    2: { label: 'À corriger', hint: 'Faire attention la prochaine fois' },
    3: { label: 'Important', hint: 'Problème sérieux, à ne pas refaire' },
};

export const REASONS = [
    'Salle de bain mal faite', 'Poussière oubliée', 'Traces sur les vitres', 'Sols pas faits', 'Cuisine mal nettoyée',
    'Lits ou linge', 'Retard', 'Objet déplacé ou cassé', 'Consignes du client pas respectées', 'Attitude avec le client',
    'Clés ou alarme', 'Autre',
];

// Ce qui compte dans les compteurs : les retours des 12 derniers mois, non annulés
export const ACTIVE_MONTHS = 12;
const MAX_PHOTOS = 3;
const PHOTO_MAX_SIDE = 1000;
const MESSAGE_MAX = 3000;
export const REPLY_MAX = 1000;

export const levelPill = (level) => `<span class="rc-pill rc-lvl-${Number(level) || 1}">${LEVELS[level]?.label || LEVELS[1].label}</span>`;

export function toDate(value) {
    if (!value) return null;
    if (typeof value.toDate === 'function') return value.toDate();
    const d = new Date(value);
    return isNaN(d) ? null : d;
}

// « 2026-10-30 » → « ven. 30 oct. »
export function dayLabel(isoDate) {
    if (!isoDate) return '';
    return new Date(`${isoDate}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function whenLabel(value) {
    const d = toDate(value);
    if (!d) return '';
    return `${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
}

export function isActive(retour) {
    if (retour.cancelled) return false;
    const created = toDate(retour.createdAt) || new Date(`${retour.date}T12:00:00`);
    const limit = new Date();
    limit.setMonth(limit.getMonth() - ACTIVE_MONTHS);
    return created >= limit;
}

const byNewest = (a, b) => (b.date || '').localeCompare(a.date || '') || ((toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0));

/** Retours d'un employé (les règles n'autorisent un employé qu'à lire les siens : le filtre uid est obligatoire). */
export async function getRetoursForUser(uid) {
    const snap = await getDocs(query(collection(db, RETOURS), where('uid', '==', uid)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort(byNewest);
}

/** Tous les retours (admin). */
export async function getAllRetours() {
    const snap = await getDocs(collection(db, RETOURS));
    return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort(byNewest);
}

/** Retours non annulés et pas encore lus par l'employé connecté. */
export async function getUnreadRetours() {
    return (await getRetoursForUser(currentUser.uid)).filter(r => !r.cancelled && !r.readAt);
}

function localDayKey(iso) {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const hhmm = (iso) => iso ? new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';

/** Les autres employés pointés sur le même chantier le même jour (pour un retour à toute l'équipe). */
async function findTeammatePointages(pointage) {
    const start = new Date(pointage.timestamp);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + 86400000);
    const snap = await getDocs(query(collection(db, 'pointages'),
        where('timestamp', '>=', start.toISOString()), where('timestamp', '<', end.toISOString())));
    const sameChantier = (p) => pointage.chantierId && p.chantierId ? p.chantierId === pointage.chantierId : p.chantier === pointage.chantier;
    const byUser = new Map();
    snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(p => p.uid && p.uid !== pointage.uid && sameChantier(p))
        .forEach(p => { if (!byUser.has(p.uid)) byUser.set(p.uid, p); });
    return [...byUser.values()];
}

/** Réduit une photo (JPEG, 1000 px au plus) pour qu'elle tienne dans le document Firestore. */
export function compressImage(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(img.width, img.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(url);
            resolve(canvas.toDataURL('image/jpeg', 0.7));
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible')); };
        img.src = url;
    });
}

/** Grande photo par-dessus l'écran (touche ou Échap pour fermer). */
export function openPhoto(src) {
    const overlay = document.createElement('div');
    overlay.className = 'modal rc-photo-view';
    overlay.innerHTML = `<img src="${src}" alt="Photo"><p class="rc-photo-missing" hidden>Photo introuvable : elle a peut-être été supprimée (les photos de chantier sont gardées 6 mois).</p><button type="button" class="btn btn-secondary" id="rcPhotoCloseBtn">Fermer</button>`;
    overlay.querySelector('img').onerror = () => { overlay.querySelector('img').hidden = true; overlay.querySelector('.rc-photo-missing').hidden = false; };
    overlay.querySelector('#rcPhotoCloseBtn').onclick = () => overlay.remove();
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    document.body.appendChild(overlay);
}

/**
 * Fenêtre « Nouveau retour client », ouverte depuis un pointage de l'historique (admin).
 * `onSaved` est appelé après l'envoi, pour rafraîchir la page.
 */
export async function openRetourModal(pointage, { userName, onSaved } = {}) {
    document.getElementById('retourClientModal')?.remove();
    const ownerName = pointage.userName || userName || 'Employé';
    const date = localDayKey(pointage.timestamp);
    const state = { level: 2, reasons: new Set(), photos: [], team: new Map([[pointage.uid, { pointage, name: ownerName }]]) };

    const modal = document.createElement('div');
    modal.id = 'retourClientModal';
    modal.className = 'modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'rcModalTitle');
    modal.innerHTML = `
        <form class="modal-panel modal-panel-lg rc-modal" novalidate>
            <div class="modal-body rc-form">
                <div>
                    <h3 id="rcModalTitle" class="modal-title">Retour client</h3>
                    <p class="modal-text">L'employé reçoit une notification et le voit dans « Retours clients ».</p>
                </div>
                <div class="rc-context">
                    <div><span class="rc-eyebrow">Employé</span><b>${escapeHTML(ownerName)}</b></div>
                    <div><span class="rc-eyebrow">Chantier</span><b>${escapeHTML(pointage.chantier || '')}</b></div>
                    <div><span class="rc-eyebrow">Pointage</span><b>${escapeHTML(dayLabel(date))} · ${hhmm(pointage.timestamp)}${pointage.endTime ? `–${hhmm(pointage.endTime)}` : ''}</b></div>
                </div>

                <div class="field">
                    <span class="field-label">Niveau</span>
                    <div class="rc-levels">
                        ${Object.entries(LEVELS).map(([key, l]) => `<button type="button" class="rc-level rc-lvl-${key}" data-level="${key}" aria-pressed="${key === '2'}"><b>${l.label}</b><span>${l.hint}</span></button>`).join('')}
                    </div>
                </div>

                <div class="field">
                    <span class="field-label">Ce qui n'allait pas</span>
                    <div class="rc-reasons">
                        ${REASONS.map(r => `<button type="button" class="rc-reason" data-reason="${escapeHTML(r)}" aria-pressed="false">${escapeHTML(r)}</button>`).join('')}
                    </div>
                </div>

                <div class="field">
                    <label class="field-label" for="rcClientMessage">Message du client</label>
                    <textarea id="rcClientMessage" class="input rc-textarea" rows="4" maxlength="${MESSAGE_MAX}" placeholder="Colle ici le SMS ou le mail du client, tel quel"></textarea>
                    <span class="rc-help">L'employé verra ce texte tel qu'il a été écrit, présenté comme une citation du client.</span>
                </div>

                <div class="field">
                    <label class="field-label" for="rcAdminMessage">Ton message à l'employé</label>
                    <textarea id="rcAdminMessage" class="input rc-textarea" rows="3" maxlength="${MESSAGE_MAX}" placeholder="Ce qu'il faut retenir, ce que tu attends la prochaine fois"></textarea>
                </div>

                <div class="field">
                    <span class="field-label">Photos (facultatif, ${MAX_PHOTOS} au plus)</span>
                    <div class="rc-photos" id="rcPhotos">
                        <label class="rc-photo-add">+ Photo<input type="file" id="rcPhotoInput" accept="image/*" multiple class="sr-only"></label>
                    </div>
                    ${['avant', 'apres'].some(k => pointage.photos?.[k]?.url) ? '<button type="button" class="btn btn-secondary rc-attach" id="rcAttachPointagePhotos">Joindre les photos avant / après du pointage</button>' : ''}
                </div>

                <div class="field">
                    <span class="field-label">Qui reçoit ce retour</span>
                    <div class="rc-team" id="rcTeam"></div>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" id="rcCancelBtn">Annuler</button>
                <button type="submit" class="btn btn-primary" id="rcSendBtn">Envoyer le retour</button>
            </div>
        </form>`;
    document.body.appendChild(modal);

    const form = modal.querySelector('form');
    const close = () => modal.remove();
    modal.querySelector('#rcCancelBtn').onclick = close;
    const sendBtn = modal.querySelector('#rcSendBtn');

    const updateSend = () => {
        sendBtn.disabled = state.team.size === 0;
        sendBtn.textContent = state.team.size > 1 ? `Envoyer à ${state.team.size} personnes` : 'Envoyer le retour';
    };

    modal.querySelector('.rc-levels').onclick = (e) => {
        const btn = e.target.closest('[data-level]');
        if (!btn) return;
        state.level = Number(btn.dataset.level);
        modal.querySelectorAll('[data-level]').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
    };
    modal.querySelector('.rc-reasons').onclick = (e) => {
        const btn = e.target.closest('[data-reason]');
        if (!btn) return;
        const on = btn.getAttribute('aria-pressed') !== 'true';
        btn.setAttribute('aria-pressed', String(on));
        if (on) state.reasons.add(btn.dataset.reason); else state.reasons.delete(btn.dataset.reason);
    };

    const photosBox = modal.querySelector('#rcPhotos');
    const renderPhotos = () => {
        photosBox.querySelectorAll('.rc-photo').forEach(el => el.remove());
        state.photos.forEach((src, i) => {
            const item = document.createElement('div');
            item.className = 'rc-photo';
            item.innerHTML = `<img src="${src}" alt="Photo ${i + 1}"><button type="button" aria-label="Retirer la photo" data-remove="${i}">×</button>`;
            photosBox.insertBefore(item, photosBox.querySelector('.rc-photo-add'));
        });
        photosBox.querySelector('.rc-photo-add').hidden = state.photos.length >= MAX_PHOTOS;
    };
    const attachBtn = modal.querySelector('#rcAttachPointagePhotos');
    if (attachBtn) attachBtn.onclick = () => {
        ['avant', 'apres'].map(k => pointage.photos?.[k]?.url).filter(Boolean)
            .forEach(url => { if (state.photos.length < MAX_PHOTOS && !state.photos.includes(url)) state.photos.push(url); });
        attachBtn.remove();
        renderPhotos();
    };
    photosBox.onclick = (e) => {
        const btn = e.target.closest('[data-remove]');
        if (!btn) return;
        state.photos.splice(Number(btn.dataset.remove), 1);
        renderPhotos();
    };
    modal.querySelector('#rcPhotoInput').onchange = async (e) => {
        const files = [...e.target.files].slice(0, MAX_PHOTOS - state.photos.length);
        e.target.value = '';
        for (const file of files) {
            try { state.photos.push(await compressImage(file)); }
            catch { showToast("Cette photo n'a pas pu être lue.", 'warning'); }
        }
        renderPhotos();
    };

    const teamBox = modal.querySelector('#rcTeam');
    const renderTeam = (mates) => {
        const rows = [{ pointage, name: ownerName, own: true }, ...mates.map(p => ({ pointage: p, name: p.userName || 'Collègue' }))];
        teamBox.innerHTML = rows.map(r => `
            <label class="rc-mate">
                <input type="checkbox" data-uid="${r.pointage.uid}" ${state.team.has(r.pointage.uid) ? 'checked' : ''}>
                <span>${escapeHTML(r.name)}</span>
                <span class="rc-help">${r.own ? 'pointage sélectionné' : 'même chantier ce jour-là'}</span>
            </label>`).join('')
            + (mates.length ? '<span class="rc-help">Coche les collègues qui sont aussi concernés.</span>' : '');
        teamBox.onchange = (e) => {
            const box = e.target.closest('[data-uid]');
            if (!box) return;
            const row = rows.find(r => r.pointage.uid === box.dataset.uid);
            if (box.checked) state.team.set(row.pointage.uid, { pointage: row.pointage, name: row.name });
            else state.team.delete(row.pointage.uid);
            updateSend();
        };
    };
    renderTeam([]);
    findTeammatePointages(pointage).then(mates => { if (mates.length && modal.isConnected) renderTeam(mates); }).catch(() => {});
    updateSend();
    modal.querySelector('#rcClientMessage').focus();

    form.onsubmit = async (e) => {
        e.preventDefault();
        const clientMessage = modal.querySelector('#rcClientMessage').value.trim();
        const adminMessage = modal.querySelector('#rcAdminMessage').value.trim();
        if (!clientMessage && !adminMessage) {
            showToast("Écris au moins le message du client ou ton mot à l'employé.", 'warning');
            modal.querySelector('#rcClientMessage').focus();
            return;
        }
        if (!state.team.size) return;
        sendBtn.disabled = true;
        sendBtn.textContent = 'Envoi…';
        try {
            const batch = writeBatch(db);
            const groupId = doc(collection(db, RETOURS)).id;
            state.team.forEach(({ pointage: p, name }, uid) => {
                batch.set(doc(collection(db, RETOURS)), {
                    uid, userName: name, pointageId: p.id,
                    chantier: pointage.chantier || '', chantierId: pointage.chantierId || null,
                    date, start: hhmm(p.timestamp), end: hhmm(p.endTime),
                    level: state.level, reasons: [...state.reasons], clientMessage, adminMessage, photos: state.photos,
                    groupId, createdAt: serverTimestamp(), createdBy: currentUser.uid, createdByName: currentUser.displayName || '',
                    readAt: null, reply: '', replyAt: null, cancelled: false,
                });
            });
            await batch.commit();
            close();
            showToast(state.team.size > 1 ? `Retour envoyé à ${state.team.size} personnes.` : `Retour envoyé à ${ownerName}.`);
            onSaved?.();
        } catch (error) {
            console.error("Erreur d'envoi du retour client:", error);
            sendBtn.disabled = false;
            updateSend();
            showInfoModal("Erreur", "Le retour client n'a pas pu être envoyé. Vérifiez la connexion et réessayez.");
        }
    };
}

/** Bloc commun « message du client / mot de la patronne / photos », pour l'admin et l'employé. */
export function retourBodyHTML(r, { adminLabel = 'Mot de la responsable' } = {}) {
    return `
        ${(r.reasons || []).length ? `<div class="rc-chips">${r.reasons.map(x => `<span class="rc-chip">${escapeHTML(x)}</span>`).join('')}</div>` : ''}
        ${r.clientMessage ? `<div class="field"><span class="rc-eyebrow">Message du client</span><div class="rc-quote">${escapeHTML(r.clientMessage)}</div></div>` : ''}
        ${r.adminMessage ? `<div class="field"><span class="rc-eyebrow">${adminLabel}</span><p class="rc-text">${escapeHTML(r.adminMessage)}</p></div>` : ''}
        ${(r.photos || []).length ? `<div class="rc-photos">${r.photos.map((src, i) => `<button type="button" class="rc-photo" data-photo="${i}"><img src="${src}" alt="Photo ${i + 1}"></button>`).join('')}</div>` : ''}`;
}
