// Employé → Retours clients : ses propres retours, « J'ai pris connaissance » et une réponse possible.
import { doc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, currentUser, pageContent, showInfoModal, showToast } from "../app.js";
import { escapeHTML } from './work-profile.js';
import { RETOURS, REPLY_MAX, getRetoursForUser, levelPill, dayLabel, whenLabel, retourBodyHTML, openPhoto } from './retours-clients.js';

let retours = [];
let openId = null;

export async function render(params = {}) {
    openId = params.retourId || null;
    pageContent.innerHTML = `
        <div class="max-w-3xl mx-auto rc-page">
            <div>
                <h2 class="text-2xl font-bold">Retours clients</h2>
                <p class="rc-help">Quand un client n'est pas satisfait d'un passage, ta responsable te transmet son message ici pour que tu saches quoi améliorer.</p>
            </div>
            <div id="rcUserList" class="rc-list"><div class="page-loader"><div class="spinner" role="status" aria-label="Chargement"></div></div></div>
        </div>`;
    document.getElementById('rcUserList').onclick = handleClick;

    try {
        retours = (await getRetoursForUser(currentUser.uid)).filter(r => !r.cancelled);
    } catch (error) {
        console.error("Erreur de chargement des retours clients:", error);
        document.getElementById('rcUserList').innerHTML = '<p class="rc-empty">Impossible de charger tes retours clients.</p>';
        return;
    }
    if (!document.getElementById('rcUserList')) return;
    if (!openId) openId = retours.find(r => !r.readAt)?.id || null; // le premier non lu s'ouvre directement
    renderList();
}

function renderList() {
    const list = document.getElementById('rcUserList');
    if (!retours.length) {
        const first = (currentUser.displayName || '').split(' ')[0];
        list.innerHTML = `<p class="rc-empty">Aucun retour client. Continue comme ça${first ? `, ${escapeHTML(first)}` : ''} !</p>`;
        return;
    }
    list.innerHTML = retours.map(r => r.id === openId ? detailHTML(r) : rowHTML(r)).join('');
    list.querySelector('.rc-card.is-open')?.scrollIntoView({ block: 'nearest' });
}

function rowHTML(r) {
    return `
        <button type="button" class="rc-row ${r.readAt ? '' : 'is-unread'}" data-open="${r.id}">
            <span class="rc-row-top">${levelPill(r.level)}${r.readAt ? `<span class="rc-help">${escapeHTML(dayLabel(r.date))}</span>` : '<span class="rc-new">Nouveau</span>'}</span>
            <b>${escapeHTML(r.chantier)}</b>
            <span class="rc-help rc-clamp">${escapeHTML(r.clientMessage || r.adminMessage || '')}</span>
        </button>`;
}

function detailHTML(r) {
    let footer;
    if (!r.readAt) {
        footer = `<button type="button" class="btn btn-primary btn-block" data-ack="${r.id}">J'ai pris connaissance</button>`;
    } else {
        footer = `<div class="rc-ack">Tu en as pris connaissance le ${escapeHTML(whenLabel(r.readAt))}</div>`
            + (r.reply
                ? `<div class="rc-reply"><span class="rc-eyebrow">Ta version</span><p class="rc-text">${escapeHTML(r.reply)}</p></div>`
                : `<div class="field">
                        <label class="field-label" for="rcReply-${r.id}">Pas d'accord ? Donne ta version</label>
                        <textarea id="rcReply-${r.id}" class="input rc-textarea" rows="3" maxlength="${REPLY_MAX}" placeholder="Ex. : le client avait demandé de ne pas toucher au meuble télé"></textarea>
                        <span class="rc-help">Ta responsable la verra. Tu ne peux répondre qu'une fois.</span>
                        <button type="button" class="btn btn-secondary" data-reply="${r.id}">Envoyer ma version</button>
                   </div>`);
    }
    return `
        <article class="rc-card rc-card-${r.level || 1} is-open" data-id="${r.id}">
            <div class="rc-card-head">
                <div>
                    <div class="rc-chips">${levelPill(r.level)}</div>
                    <h3 class="rc-card-title">${escapeHTML(r.chantier)}</h3>
                    <span class="rc-help">Ton passage du ${escapeHTML(dayLabel(r.date))}${r.start ? ` · ${escapeHTML(r.start)}${r.end ? `–${escapeHTML(r.end)}` : ''}` : ''}</span>
                </div>
                <button type="button" class="btn btn-secondary" data-close>Fermer</button>
            </div>
            ${retourBodyHTML(r, { adminLabel: 'Le mot de ta responsable' })}
            ${footer}
        </article>`;
}

async function handleClick(e) {
    const photo = e.target.closest('[data-photo]');
    if (photo) {
        const r = retours.find(x => x.id === photo.closest('[data-id]').dataset.id);
        openPhoto(r.photos[Number(photo.dataset.photo)]);
        return;
    }
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.open) { openId = btn.dataset.open; renderList(); return; }
    if ('close' in btn.dataset) { openId = null; renderList(); return; }

    const r = retours.find(x => x.id === (btn.dataset.ack || btn.dataset.reply));
    if (!r) return;
    try {
        if (btn.dataset.ack) {
            btn.disabled = true;
            await updateDoc(doc(db, RETOURS, r.id), { readAt: serverTimestamp() });
            r.readAt = new Date();
            showToast("C'est noté. Ta responsable voit que tu l'as lu.");
        } else {
            const text = document.getElementById(`rcReply-${r.id}`).value.trim();
            if (!text) { showToast("Écris ta version avant de l'envoyer.", 'warning'); return; }
            btn.disabled = true;
            await updateDoc(doc(db, RETOURS, r.id), { reply: text.slice(0, REPLY_MAX), replyAt: serverTimestamp() });
            Object.assign(r, { reply: text.slice(0, REPLY_MAX), replyAt: new Date() });
            showToast("Ta version a été envoyée.");
        }
        renderList();
    } catch (error) {
        console.error("Erreur sur un retour client:", error);
        btn.disabled = false;
        showInfoModal("Erreur", "L'envoi n'a pas abouti. Vérifiez la connexion et réessayez.");
    }
}
