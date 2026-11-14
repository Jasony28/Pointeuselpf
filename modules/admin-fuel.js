// Admin → Pleins carburant : les pleins notés par les conducteurs, mois par mois, avec totaux par voiture et photos.
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent } from "../app.js";
import { escapeHTML } from './work-profile.js';
import { PLEINS, summarize, byNewest, litresLabel, eurosLabel, perLitreLabel } from './pleins.js';
import { toPlein, pleinRowHTML, openPleinPhoto, deletePlein } from './user-fuel.js';

let pleins = [];
let month = '';
let loadCount = 0;

export async function render() {
    const now = new Date();
    month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    pageContent.innerHTML = `
        <div class="max-w-5xl mx-auto rc-page">
            <div>
                <h2 class="text-2xl font-bold">Pleins carburant</h2>
                <p class="rc-help">Les pleins notés par les conducteurs dans leur page « Carburant », avec la photo de la pompe ou du ticket.</p>
            </div>
            <div class="rc-filters">
                <input id="fuMonth" type="month" class="input" value="${month}" aria-label="Mois">
            </div>
            <div id="fuSummary" class="fu-summary"></div>
            <div id="fuAdminList" class="rc-list"></div>
        </div>`;
    document.getElementById('fuMonth').onchange = (e) => { if (e.target.value) { month = e.target.value; load(); } };
    document.getElementById('fuAdminList').onclick = handleListClick;
    await load();
}

async function load() {
    const list = document.getElementById('fuAdminList');
    list.innerHTML = '<div class="page-loader"><div class="spinner" role="status" aria-label="Chargement"></div></div>';
    const current = ++loadCount;
    try {
        const snap = await getDocs(query(collection(db, PLEINS), where('date', '>=', `${month}-01`), where('date', '<=', `${month}-31`)));
        if (current !== loadCount || !document.getElementById('fuAdminList')) return;
        pleins = snap.docs.map(toPlein).sort(byNewest);
    } catch (error) {
        console.error("Erreur de chargement des pleins:", error);
        if (current === loadCount && document.getElementById('fuAdminList')) list.innerHTML = '<p class="rc-empty">Impossible de charger les pleins.</p>';
        return;
    }
    renderAll();
}

function renderAll() {
    const total = summarize(pleins);
    document.getElementById('fuSummary').innerHTML = total.count ? `
        <div class="fu-stat is-total"><span class="rc-eyebrow">Total du mois</span><b>${eurosLabel(total.montant)}</b><span class="rc-help">${total.count} plein${total.count > 1 ? 's' : ''} · ${litresLabel(total.litres)} · ${perLitreLabel(total)}</span></div>
        ${total.plates.map(s => `<div class="fu-stat"><span class="fu-plate-tag">${escapeHTML(s.plaque)}</span><b>${eurosLabel(s.montant)}</b><span class="rc-help">${s.count} plein${s.count > 1 ? 's' : ''} · ${litresLabel(s.litres)}</span></div>`).join('')}` : '';
    document.getElementById('fuAdminList').innerHTML = pleins.length
        ? pleins.map(p => pleinRowHTML(p, { who: true })).join('')
        : '<p class="rc-empty">Aucun plein noté ce mois-ci.</p>';
}

async function handleListClick(e) {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.photo) { openPleinPhoto(btn.dataset.photo, btn); return; }
    const p = pleins.find(x => x.id === btn.dataset.delete);
    if (p && await deletePlein(p)) {
        pleins = pleins.filter(x => x.id !== p.id);
        if (document.getElementById('fuAdminList')) renderAll();
    }
}
