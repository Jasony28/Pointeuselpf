// Admin → Retours clients : tous les retours, compteur par employé, filtres, annuler / supprimer.
import { doc, updateDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent, showConfirmationModal, showInfoModal, showToast, navigateTo } from "../app.js";
import { escapeHTML } from './work-profile.js';
import { RETOURS, LEVELS, ACTIVE_MONTHS, getAllRetours, isActive, levelPill, dayLabel, whenLabel, retourBodyHTML, openPhoto } from './retours-clients.js';

let retours = [];
let filters = { uid: '', level: '', status: '' };

export async function render(params = {}) {
    filters = { uid: params.userId || '', level: '', status: '' };
    pageContent.innerHTML = `
        <div class="max-w-5xl mx-auto rc-page">
            <div>
                <h2 class="text-2xl font-bold">Retours clients</h2>
                <p class="rc-help">Pour signaler un chantier, ouvre l'historique de l'employé et touche le bouton bulle sur le pointage. Les compteurs prennent les retours des ${ACTIVE_MONTHS} derniers mois qui ne sont pas annulés.</p>
            </div>
            <div class="rc-stats" id="rcStats"></div>
            <div class="rc-filters">
                <select id="rcFilterUser" class="input" aria-label="Filtrer par employé"></select>
                <select id="rcFilterLevel" class="input" aria-label="Filtrer par niveau">
                    <option value="">Tous les niveaux</option>
                    ${Object.entries(LEVELS).map(([k, l]) => `<option value="${k}">${l.label}</option>`).join('')}
                </select>
                <select id="rcFilterStatus" class="input" aria-label="Filtrer par état">
                    <option value="">En cours</option>
                    <option value="unread">Pas encore lus</option>
                    <option value="replied">Avec réponse</option>
                    <option value="cancelled">Annulés</option>
                </select>
            </div>
            <div id="rcList" class="rc-list"><div class="page-loader"><div class="spinner" role="status" aria-label="Chargement"></div></div></div>
        </div>`;

    ['rcFilterUser', 'rcFilterLevel', 'rcFilterStatus'].forEach(id => {
        document.getElementById(id).onchange = () => {
            filters = { uid: document.getElementById('rcFilterUser').value, level: document.getElementById('rcFilterLevel').value, status: document.getElementById('rcFilterStatus').value };
            renderList();
        };
    });
    document.getElementById('rcList').onclick = handleListClick;
    document.getElementById('rcStats').onclick = (e) => {
        const card = e.target.closest('[data-stat-uid]');
        if (!card) return;
        filters.uid = filters.uid === card.dataset.statUid ? '' : card.dataset.statUid;
        document.getElementById('rcFilterUser').value = filters.uid;
        renderList();
    };

    try {
        retours = await getAllRetours();
    } catch (error) {
        console.error("Erreur de chargement des retours clients:", error);
        document.getElementById('rcList').innerHTML = '<p class="rc-empty">Impossible de charger les retours clients.</p>';
        return;
    }
    if (!document.getElementById('rcList')) return; // page quittée pendant le chargement
    renderAll();
}

function people() {
    const map = new Map();
    retours.forEach(r => { if (!map.has(r.uid)) map.set(r.uid, r.userName || 'Employé'); });
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
}

function renderAll() {
    const select = document.getElementById('rcFilterUser');
    select.innerHTML = `<option value="">Toute l'équipe</option>` + people().map(([uid, name]) => `<option value="${uid}">${escapeHTML(name)}</option>`).join('');
    select.value = filters.uid;
    renderList();
}

function renderStats() {
    const box = document.getElementById('rcStats');
    const rows = people().map(([uid, name]) => {
        const active = retours.filter(r => r.uid === uid && isActive(r));
        const unread = active.filter(r => !r.readAt).length;
        const worst = active.reduce((m, r) => Math.max(m, r.level || 1), 0);
        const marks = [...active].sort((a, b) => (b.level || 1) - (a.level || 1)).slice(0, 6).map(r => `<span class="rc-mark-${r.level || 1}"></span>`);
        while (marks.length < 6) marks.push('<span></span>');
        return { uid, name, count: active.length, html: `
            <button type="button" class="rc-stat ${filters.uid === uid ? 'is-selected' : ''}" data-stat-uid="${uid}">
                <span class="rc-stat-top"><b>${escapeHTML(name)}</b>${worst === 3 ? levelPill(3) : unread ? `<span class="rc-pill rc-st-unread">${unread} non lu${unread > 1 ? 's' : ''}</span>` : ''}</span>
                <span class="rc-help">${active.length ? `${active.length} retour${active.length > 1 ? 's' : ''} sur ${ACTIVE_MONTHS} mois` : 'Aucun retour en cours'}</span>
                <span class="rc-meter" aria-hidden="true">${marks.join('')}</span>
            </button>` };
    }).sort((a, b) => b.count - a.count);
    box.innerHTML = rows.map(r => r.html).join('');
    box.hidden = !rows.length;
}

function matches(r) {
    if (filters.uid && r.uid !== filters.uid) return false;
    if (filters.level && String(r.level) !== filters.level) return false;
    if (filters.status === 'cancelled') return !!r.cancelled;
    if (r.cancelled) return false;
    if (filters.status === 'unread') return !r.readAt;
    if (filters.status === 'replied') return !!r.reply;
    return true;
}

function renderList() {
    renderStats();
    const list = document.getElementById('rcList');
    const shown = retours.filter(matches);
    if (!retours.length) {
        list.innerHTML = `<p class="rc-empty">Aucun retour client pour l'instant.</p>`;
        return;
    }
    list.innerHTML = shown.length ? shown.map(cardHTML).join('') : `<p class="rc-empty">Aucun retour pour ces filtres.</p>`;
}

function cardHTML(r) {
    const status = r.cancelled ? '<span class="rc-pill rc-st-cancel">Annulé</span>'
        : r.readAt ? `<span class="rc-pill rc-st-read">Lu le ${escapeHTML(whenLabel(r.readAt))}</span>`
        : '<span class="rc-pill rc-st-unread">Pas encore lu</span>';
    return `
        <article class="rc-card rc-card-${r.level || 1} ${r.cancelled ? 'is-cancelled' : ''}" data-id="${r.id}">
            <div class="rc-card-head">
                <div>
                    <div class="rc-chips">${levelPill(r.level)}</div>
                    <h3 class="rc-card-title">${escapeHTML(r.chantier)}</h3>
                    <span class="rc-help">${escapeHTML(r.userName || '')} · pointage du ${escapeHTML(dayLabel(r.date))}${r.start ? ` · ${escapeHTML(r.start)}${r.end ? `–${escapeHTML(r.end)}` : ''}` : ''}</span>
                </div>
                ${status}
            </div>
            ${retourBodyHTML(r, { adminLabel: 'Ton mot' })}
            ${r.reply ? `<div class="rc-reply"><span class="rc-eyebrow">Réponse de ${escapeHTML((r.userName || '').split(' ')[0])}${r.replyAt ? ` · ${escapeHTML(whenLabel(r.replyAt))}` : ''}</span><p class="rc-text">${escapeHTML(r.reply)}</p></div>` : ''}
            <div class="rc-card-foot">
                <span class="rc-help">Envoyé le ${escapeHTML(whenLabel(r.createdAt))}${r.createdByName ? ` par ${escapeHTML(r.createdByName)}` : ''}</span>
                <div class="rc-actions">
                    <button type="button" class="btn btn-secondary" data-history="${r.uid}">Historique</button>
                    ${r.cancelled ? `<button type="button" class="btn btn-secondary" data-restore="${r.id}">Rétablir</button>` : `<button type="button" class="btn btn-secondary" data-cancel="${r.id}">Annuler le retour</button>`}
                    <button type="button" class="btn btn-secondary rc-danger" data-delete="${r.id}">Supprimer</button>
                </div>
            </div>
        </article>`;
}

async function handleListClick(e) {
    const photo = e.target.closest('[data-photo]');
    if (photo) {
        const r = retours.find(x => x.id === photo.closest('[data-id]').dataset.id);
        openPhoto(r.photos[Number(photo.dataset.photo)]);
        return;
    }
    const btn = e.target.closest('button');
    if (!btn) return;
    const find = (id) => retours.find(r => r.id === id);
    try {
        if (btn.dataset.history) {
            const r = retours.find(x => x.uid === btn.dataset.history);
            navigateTo('user-history', { userId: r.uid, userName: r.userName });
        } else if (btn.dataset.cancel) {
            const ok = await showConfirmationModal("Annuler ce retour ?", "Il ne comptera plus et disparaîtra de l'appli de l'employé. Tu pourras le rétablir dans le filtre « Annulés ».");
            if (!ok) return;
            await updateDoc(doc(db, RETOURS, btn.dataset.cancel), { cancelled: true, cancelledAt: serverTimestamp() });
            Object.assign(find(btn.dataset.cancel), { cancelled: true, cancelledAt: new Date() });
            showToast("Retour annulé.");
            renderList();
        } else if (btn.dataset.restore) {
            await updateDoc(doc(db, RETOURS, btn.dataset.restore), { cancelled: false, cancelledAt: null });
            Object.assign(find(btn.dataset.restore), { cancelled: false, cancelledAt: null });
            showToast("Retour rétabli.");
            renderList();
        } else if (btn.dataset.delete) {
            const ok = await showConfirmationModal("Supprimer définitivement ?", "Le retour sera effacé pour de bon, y compris la réponse de l'employé. Pour le garder dans l'historique, choisis plutôt « Annuler le retour ».");
            if (!ok) return;
            await deleteDoc(doc(db, RETOURS, btn.dataset.delete));
            retours = retours.filter(r => r.id !== btn.dataset.delete);
            showToast("Retour supprimé.");
            renderAll();
        }
    } catch (error) {
        console.error("Erreur sur un retour client:", error);
        showInfoModal("Erreur", "L'action n'a pas abouti. Vérifiez la connexion et réessayez.");
    }
}
