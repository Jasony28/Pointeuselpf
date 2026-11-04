import { collection, query, orderBy, limit, getDocs, writeBatch } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent, showConfirmationModal, showToast, showInfoModal } from "../app.js";
import { createPdf, pdfHeader, pdfStats, pdfSection, pdfTable, pdfFinish, pdfText, fileStamp, C } from "./pdf-kit.js";

// Suivi des erreurs : erreurs remontées automatiquement par l'application chez les utilisateurs
// (collection "errorLogs", voir reportError dans app.js), regroupées par message.

const MAX_LOGS = 300;
let logs = [];

const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const when = (log) => {
    const date = log.createdAt?.toDate ? log.createdAt.toDate() : new Date(log.clientTime);
    return date.toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};
const device = (ua = '') => /iPhone|iPad/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : 'Autre';

export async function render() {
    pageContent.innerHTML = `
        <div class="max-w-5xl mx-auto space-y-4">
            <div class="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h2 class="text-2xl font-bold">Suivi des erreurs</h2>
                    <p class="mt-1 text-sm" style="color: var(--color-text-muted);">Problèmes rencontrés par les utilisateurs, remontés automatiquement par l'application.</p>
                </div>
                <div class="flex flex-wrap gap-2">
                    <button id="refreshErrorsBtn" class="btn btn-secondary">Actualiser</button>
                    <button id="exportErrorsPdfBtn" class="btn btn-secondary">Exporter en PDF</button>
                    <button id="clearErrorsBtn" class="btn btn-secondary" style="color: var(--color-danger);">Tout effacer</button>
                </div>
            </div>
            <div id="errorsSummary" class="team-stats"></div>
            <div id="errorsList" class="space-y-3"></div>
        </div>
    `;
    document.getElementById('refreshErrorsBtn').onclick = loadErrors;
    document.getElementById('exportErrorsPdfBtn').onclick = exportErrorsPdf;
    document.getElementById('clearErrorsBtn').onclick = clearErrors;
    await loadErrors();
}

async function loadErrors() {
    const list = document.getElementById('errorsList');
    list.innerHTML = '<div class="site-card is-loading"></div>'.repeat(3);
    try {
        const snapshot = await getDocs(query(collection(db, "errorLogs"), orderBy("createdAt", "desc"), limit(MAX_LOGS)));
        logs = snapshot.docs.map(d => ({ id: d.id, ref: d.ref, ...d.data() }));
        renderErrors();
    } catch (error) {
        console.warn("Lecture du suivi des erreurs impossible :", error);
        list.innerHTML = `<p class="hours-empty">Impossible de charger les erreurs (vérifiez les règles Firebase pour « errorLogs »).</p>`;
    }
}

// Regroupement par message : une ligne par problème, avec le nombre d'occurrences
function groupLogs() {
    const groups = new Map();
    logs.forEach(log => {
        const key = `${log.context}|${log.message}`;
        if (!groups.has(key)) groups.set(key, { message: log.message, context: log.context, items: [] });
        groups.get(key).items.push(log);
    });
    return [...groups.values()].sort((a, b) => b.items.length - a.items.length);
}

// PDF du suivi des erreurs (à envoyer pour dépannage) : un bloc par problème, du plus fréquent au plus rare,
// avec les personnes, appareils, versions et le détail technique de la dernière occurrence.
async function exportErrorsPdf() {
    if (!logs.length) { showInfoModal("Information", "Aucune erreur à exporter."); return; }
    const btn = document.getElementById('exportErrorsPdfBtn');
    btn.disabled = true;
    try {
        const doc = await createPdf('portrait');
        const groups = groupLogs();
        const dayAgo = Date.now() - 86400000;
        const recent = logs.filter(l => (l.createdAt?.toDate ? l.createdAt.toDate() : new Date(l.clientTime)) > dayAgo).length;
        const users = new Set(logs.map(l => l.uid)).size;

        let y = pdfHeader(doc, { title: 'Suivi des erreurs', right: [`${groups.length} problème${groups.length > 1 ? 's' : ''}`, `${logs.length} erreur${logs.length > 1 ? 's' : ''} enregistrée${logs.length > 1 ? 's' : ''}`] });
        y = pdfStats(doc, y, [
            ['Erreurs', String(logs.length)],
            ['Dernières 24 h', String(recent), recent ? C.DANGER : C.OK],
            ['Problèmes différents', String(groups.length)],
            ['Utilisateurs touchés', String(users)],
        ]);
        y = pdfSection(doc, y + 2, 'Problèmes, du plus fréquent au plus rare');
        pdfTable(doc, {
            startY: y + 1,
            head: [['Nb', 'Problème', 'Qui, où, quand']],
            body: groups.map(group => {
                const last = group.items[0];
                const people = [...new Set(group.items.map(i => i.userName).filter(Boolean))].join(', ') || 'inconnu';
                const pages = [...new Set(group.items.map(i => i.page).filter(Boolean))].join(', ');
                const devices = [...new Set(group.items.map(i => `${device(i.userAgent)} ${i.appVersion || ''}`.trim()))].join(', ');
                const stack = String(last.stack || '').split('\n').slice(0, 6).map(l => l.trim()).join('\n');
                return [
                    `${group.items.length}×`,
                    pdfText(`${group.message}${group.context ? `\n[${group.context}]` : ''}${stack ? `\n\n${stack}` : ''}`),
                    pdfText(`Dernière fois : ${when(last)}\nUtilisateurs : ${people}${pages ? `\nPage : ${pages}` : ''}\nAppareil / version : ${devices}${group.items.some(i => i.online === false) ? '\n(parfois hors ligne)' : ''}`),
                ];
            }),
            styles: { fontSize: 7.5 },
            columnStyles: { 0: { cellWidth: 11, halign: 'center', fontStyle: 'bold', textColor: C.DANGER }, 1: { cellWidth: 108 }, 2: { cellWidth: 'auto', textColor: C.MUTED } },
        });
        pdfFinish(doc, 'Suivi des erreurs', `Erreurs_${fileStamp()}.pdf`);
    } catch (error) {
        console.warn("Export PDF des erreurs impossible :", error);
        showInfoModal("Erreur", "Le PDF n'a pas pu être créé. Vérifiez la connexion internet et réessayez.");
    } finally {
        btn.disabled = false;
    }
}

function renderErrors() {
    const list = document.getElementById('errorsList');
    const summary = document.getElementById('errorsSummary');

    const sorted = groupLogs();

    const dayAgo = Date.now() - 86400000;
    const recent = logs.filter(l => (l.createdAt?.toDate ? l.createdAt.toDate() : new Date(l.clientTime)) > dayAgo).length;
    const users = new Set(logs.map(l => l.uid)).size;
    summary.innerHTML = [
        ['Erreurs', logs.length, ''],
        ['Dernières 24 h', recent, recent ? 'is-warn' : 'is-ok'],
        ['Problèmes différents', sorted.length, ''],
        ['Utilisateurs touchés', users, ''],
    ].map(([label, value, tone]) => `<div class="team-stat ${tone}"><span>${label}</span><strong>${value}</strong></div>`).join('');

    if (!sorted.length) {
        list.innerHTML = `<p class="hours-empty">Aucune erreur remontée. Tout fonctionne ✓</p>`;
        return;
    }

    list.innerHTML = sorted.map(group => {
        const last = group.items[0];
        const people = [...new Set(group.items.map(i => i.userName).filter(Boolean))];
        const pages = [...new Set(group.items.map(i => i.page).filter(Boolean))];
        return `
            <details class="hours-group error-group">
                <summary>
                    <span class="hours-group-title" style="flex: 1;">
                        <svg class="hours-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
                        <span class="error-message">${escapeHTML(group.message)}</span>
                        <span class="hours-group-count">${escapeHTML(group.context || '')}${pages.length ? ` · page ${escapeHTML(pages.join(', '))}` : ''} · dernière fois ${when(last)}</span>
                    </span>
                    <span class="error-count">${group.items.length}×</span>
                </summary>
                <div class="hours-entries">
                    <div class="error-people">Utilisateurs : ${escapeHTML(people.join(', ') || 'inconnu')}</div>
                    ${group.items.slice(0, 10).map(item => `
                        <div class="error-item">
                            <div class="error-item-head">
                                <strong>${escapeHTML(item.userName || 'Inconnu')}</strong>
                                <span>${when(item)} · ${device(item.userAgent)} · ${escapeHTML(item.appVersion || '')}${item.online === false ? ' · hors ligne' : ''}</span>
                            </div>
                            ${item.stack ? `<pre class="error-stack">${escapeHTML(item.stack)}</pre>` : ''}
                        </div>`).join('')}
                    ${group.items.length > 10 ? `<p class="field-hint" style="padding: 0.5rem 1rem;">… et ${group.items.length - 10} autres.</p>` : ''}
                </div>
            </details>`;
    }).join('');
}

async function clearErrors() {
    if (!logs.length) return;
    if (!(await showConfirmationModal("Tout effacer", `Supprimer les ${logs.length} erreurs affichées ?`))) return;
    try {
        for (let i = 0; i < logs.length; i += 400) {
            const batch = writeBatch(db);
            logs.slice(i, i + 400).forEach(log => batch.delete(log.ref));
            await batch.commit();
        }
        showToast("Suivi des erreurs vidé.", 'success');
        await loadErrors();
    } catch (error) {
        console.warn("Suppression impossible :", error);
        showToast("Suppression impossible (droits Firebase).", 'warning');
    }
}
