import { collection, query, where, onSnapshot, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent, showConfirmationModal, showInfoModal } from "../app.js";

// Pointages en temps réel : écoute des pointages ouverts (endTime == null),
// un seul minuteur pour rafraîchir toutes les durées chaque seconde.

let unsubscribe = null;   // écoute Firestore
let ticker = null;        // minuteur d'affichage
let livePointages = new Map(); // docId -> données

const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() || '').join('') || '?';
const hhmm = (date) => new Date(date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const pad = (n) => String(n).padStart(2, '0');
const clock = (ms) => {
    const t = Math.max(0, Math.floor(ms / 1000));
    return `${pad(Math.floor(t / 3600))}:${pad(Math.floor((t % 3600) / 60))}:${pad(t % 60)}`;
};
const shortDuration = (ms) => {
    const m = Math.max(0, Math.floor(ms / 60000));
    return m >= 60 ? `${Math.floor(m / 60)} h ${pad(m % 60)}` : `${m} min`;
};

/**
 * Temps de travail effectif, pause en cours et total des pauses d'un pointage ouvert.
 */
function computeTimes(data, now = new Date()) {
    const start = new Date(data.timestamp);
    const pauses = data.pauses || [];
    const finishedPauseMs = pauses.reduce((acc, p) => acc + (p.end ? new Date(p.end) - new Date(p.start) : 0), 0);
    const currentPause = data.status === 'paused' ? pauses.find(p => !p.end) || null : null;
    const currentPauseMs = currentPause ? now - new Date(currentPause.start) : 0;
    // En pause, le temps de travail est figé au début de la pause
    const workEnd = currentPause ? new Date(currentPause.start) : now;
    return {
        workMs: Math.max(0, (workEnd - start) - finishedPauseMs),
        currentPause,
        currentPauseMs,
        totalPauseMs: finishedPauseMs + currentPauseMs,
        pauseCount: pauses.length,
    };
}

async function forceStopPointage(docId, data) {
    const confirmed = await showConfirmationModal(
        "Forcer l'arrêt",
        `Voulez-vous vraiment forcer l'arrêt du pointage de ${data.userName} ? L'heure de fin sera l'heure actuelle.`
    );
    if (!confirmed) return;

    try {
        // On clôt la pause en cours et on enregistre le total des pauses (sinon elles compteraient comme du travail)
        const nowIso = new Date().toISOString();
        const pauses = (data.pauses || []).map(p => (p.end ? p : { ...p, end: nowIso }));
        const pauseDurationMs = pauses.reduce((acc, p) => acc + (new Date(p.end) - new Date(p.start)), 0);
        await updateDoc(doc(db, "pointages", docId), {
            endTime: nowIso,
            status: 'completed',
            pauses,
            pauseDurationMs,
            notes: "(Arrêt forcé par un administrateur)"
        });
        showInfoModal("Succès", `Le pointage de ${data.userName} a été arrêté.`);
    } catch (error) {
        console.error("Erreur lors de l'arrêt forcé:", error);
        showInfoModal("Erreur", "L'opération a échoué.");
    }
}

function renderList() {
    const list = document.getElementById('live-pointages-list');
    const summary = document.getElementById('live-summary');
    if (!list) return;

    const entries = [...livePointages.entries()];
    const paused = entries.filter(([, d]) => d.status === 'paused');
    const working = entries.filter(([, d]) => d.status !== 'paused');
    summary.innerHTML = `
        <span class="live-count"><strong>${working.length}</strong> au travail</span>
        <span class="live-count is-paused"><strong>${paused.length}</strong> en pause</span>`;

    if (!entries.length) {
        list.innerHTML = `<p class="hours-empty">Aucun employé n'est en train de pointer actuellement.</p>`;
        return;
    }

    const byStart = (a, b) => new Date(a[1].timestamp) - new Date(b[1].timestamp);
    const section = (title, items) => items.length ? `
        <section>
            <h3 class="kpi-label mb-2">${title} · ${items.length}</h3>
            <div class="live-grid">${items.sort(byStart).map(([id, d]) => cardHTML(id, d)).join('')}</div>
        </section>` : '';
    list.innerHTML = section('En pause', paused) + section('Au travail', working);

    list.querySelectorAll('[data-stop]').forEach(btn => {
        btn.onclick = () => forceStopPointage(btn.dataset.stop, livePointages.get(btn.dataset.stop));
    });
    updateTimers();
}

function cardHTML(docId, data) {
    const isPaused = data.status === 'paused';
    const t = computeTimes(data);
    return `
        <article class="live-card${isPaused ? ' is-paused' : ''}" id="live-card-${docId}">
            <div class="live-card-head">
                <span class="avatar">${escapeHTML(initials(data.userName))}</span>
                <div class="min-w-0" style="flex: 1;">
                    <p class="live-name">${escapeHTML(data.userName)}</p>
                    <p class="live-site">${escapeHTML(data.chantier)}</p>
                </div>
                <span class="tracker-status${isPaused ? '' : ''}" style="${isPaused ? 'color: var(--color-warning); background: color-mix(in srgb, var(--color-warning) 14%, transparent);' : ''}">
                    <span class="tracker-dot"${isPaused ? '' : ' style="animation: tracker-pulse 1.6s ease-out infinite;"'}></span>${isPaused ? 'En pause' : 'Au travail'}
                </span>
            </div>

            <div class="live-figures">
                <div>
                    <span class="live-label">Temps de travail</span>
                    <span class="live-timer" data-work="${docId}">${clock(t.workMs)}</span>
                    <span class="live-sub">depuis ${hhmm(data.timestamp)}</span>
                </div>
                ${isPaused && t.currentPause ? `
                <div class="live-pause-now">
                    <span class="live-label">Pause en cours</span>
                    <span class="live-timer" data-pause="${docId}">${clock(t.currentPauseMs)}</span>
                    <span class="live-sub">depuis ${hhmm(t.currentPause.start)}</span>
                </div>` : ''}
            </div>

            <div class="live-card-foot">
                <span class="live-sub" data-pause-total="${docId}">${t.pauseCount
                    ? `${t.pauseCount} pause${t.pauseCount > 1 ? 's' : ''} sur ce chantier · ${shortDuration(t.totalPauseMs)} au total`
                    : 'Aucune pause pour l\'instant'}</span>
                <button type="button" class="btn btn-secondary live-stop" data-stop="${docId}">Forcer l'arrêt</button>
            </div>
        </article>`;
}

// Rafraîchit uniquement les chiffres (pas toute la carte) chaque seconde
function updateTimers() {
    const now = new Date();
    livePointages.forEach((data, docId) => {
        const t = computeTimes(data, now);
        const work = document.querySelector(`[data-work="${docId}"]`);
        const pause = document.querySelector(`[data-pause="${docId}"]`);
        const total = document.querySelector(`[data-pause-total="${docId}"]`);
        if (work) work.textContent = clock(t.workMs);
        if (pause) pause.textContent = clock(t.currentPauseMs);
        if (total && t.pauseCount) total.textContent = `${t.pauseCount} pause${t.pauseCount > 1 ? 's' : ''} sur ce chantier · ${shortDuration(t.totalPauseMs)} au total`;
    });
}

// Appelé par app.js quand on quitte la page
export function cleanup() {
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    clearInterval(ticker);
    ticker = null;
    livePointages = new Map();
}

export function render() {
    cleanup();
    pageContent.innerHTML = `
        <div class="max-w-5xl mx-auto space-y-4">
            <div class="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h2 class="text-2xl font-bold flex items-center gap-2">Pointages en Temps Réel <span class="live-badge"><span class="tracker-dot" style="animation: tracker-pulse 1.6s ease-out infinite;"></span>Direct</span></h2>
                    <p class="mt-1 text-sm" style="color: var(--color-text-muted);">Mis à jour automatiquement, sans recharger la page.</p>
                </div>
                <div id="live-summary" class="flex gap-2"></div>
            </div>
            <div id="live-pointages-list" class="space-y-5">
                <div class="live-grid">${'<div class="site-card is-loading" style="min-height: 180px;"></div>'.repeat(2)}</div>
            </div>
        </div>
    `;

    const q = query(collection(db, "pointages"), where("endTime", "==", null));
    unsubscribe = onSnapshot(q, (querySnapshot) => {
        livePointages = new Map(querySnapshot.docs.map(d => [d.id, d.data()]));
        renderList();
    }, (error) => {
        console.error("Écoute en temps réel impossible :", error);
        const list = document.getElementById('live-pointages-list');
        if (list) list.innerHTML = `<p class="hours-empty">Impossible de suivre les pointages en direct.</p>`;
    });

    ticker = setInterval(() => {
        if (!document.getElementById('live-pointages-list')) return cleanup();
        updateTimers();
    }, 1000);
}
