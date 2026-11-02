import { collection, query, where, orderBy, getDocs, getDoc, doc, deleteDoc, limit } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent, showConfirmationModal, navigateTo, isShowingAllHours } from "../app.js"; // <-- isShowingAllHours IMPORTÉ ICI
import { getWeekDateRange, formatMilliseconds } from "./utils.js";
import { getUsers, getActiveChantiers } from "./data-service.js";
import { getDocsFast } from "./fast-data.js";

// --- VARIABLES GLOBALES POUR LES CARTES NAVIGABLES ---
let globalWeekOffset = 0;
let globalMonthOffset = 0;
// --- FIN ---

let userStatsFilter = { period: 'week', offset: 0 };
let chantierStatsFilter = { period: 'week', offset: 0 };

// --- HEURES PAR PÉRIODE ---
// Résumés quotidiens (resumesJour, tenus à jour par le serveur) : un document par jour au lieu de tous les
// pointages de la période (7 lectures pour une semaine, ~30 pour un mois, 365 pour une année).
// Tant qu'ils ne sont pas prêts (fonctions pas encore déployées), on compte sur les pointages, comme avant.
// Totaux : { users: { uid: { name, ms } }, chantiers: { nom: { ms, days } } } — seuls les pointages terminés comptent.
const totalsCache = new Map();
const totalsListeners = new Map(); // période → fonctions à rappeler quand le serveur renvoie des chiffres plus frais
let summariesReady = null;    // promesse → true / false, gardée pour la session si true
let rebuildRequested = false;  // recalcul complet demandé au serveur (une fois par session)
const SUMMARY_VERSION = 2;     // = SUMMARY_VERSION de functions/day-summaries.js

function checkSummaries() {
    if (!summariesReady) {
        summariesReady = getDoc(doc(db, "resumesJour", "_meta"))
            .then(snap => {
                if (snap.exists() && snap.data().ready) {
                    // Résumés d'une version plus ancienne : toujours justes pour les heures, recalculés pour la planification
                    if ((snap.data().version || 1) < SUMMARY_VERSION) requestSummariesRebuild();
                    return true;
                }
                requestSummariesRebuild();
                summariesReady = null; // on revérifiera au prochain affichage
                return false;
            })
            .catch(() => { summariesReady = null; return false; });
    }
    return summariesReady;
}

// Première fois : le serveur calcule les résumés de tout l'historique (une seule fois, quelques secondes)
function requestSummariesRebuild() {
    if (rebuildRequested) return;
    rebuildRequested = true;
    Promise.all([
        import("https://www.gstatic.com/firebasejs/10.5.0/firebase-app.js"),
        import("https://www.gstatic.com/firebasejs/10.5.0/firebase-functions.js"),
    ]).then(([{ getApp }, { getFunctions, httpsCallable }]) =>
        httpsCallable(getFunctions(getApp(), 'us-central1'), 'rebuildDaySummaries')({})
    ).catch(error => console.warn("Résumés quotidiens pas encore disponibles :", error?.code || error?.message || error));
}

const dayKeyUTC = (date) => date.toISOString().slice(0, 10);

function totalsFromSummaries(start, end, onUpdate) {
    const q = query(collection(db, "resumesJour"), where("date", ">=", dayKeyUTC(start)), where("date", "<=", dayKeyUTC(end)));
    return getDocsFast(q, (snap) => {
        const totals = { users: {}, chantiers: {} };
        snap.forEach(d => {
            const day = d.data();
            Object.entries(day.users || {}).forEach(([uid, u]) => {
                if (!u.ms) return;
                const user = totals.users[uid] || (totals.users[uid] = { name: u.name, ms: 0 });
                user.ms += u.ms;
                if (u.name) user.name = u.name;
            });
            Object.entries(day.chantiers || {}).forEach(([name, ms]) => {
                if (!ms) return;
                const c = totals.chantiers[name] || (totals.chantiers[name] = { ms: 0, days: 0 });
                c.ms += ms;
                c.days++;
            });
        });
        return totals;
    }, onUpdate);
}

async function totalsFromPointages(start, end) {
    const snap = await getDocs(query(collection(db, "pointages"), where("timestamp", ">=", start.toISOString()), where("timestamp", "<=", end.toISOString())));
    const totals = { users: {}, chantiers: {} };
    const seenDays = new Set();
    snap.forEach(d => {
        const p = d.data();
        if (!p.endTime) return;
        const ms = (new Date(p.endTime) - new Date(p.timestamp)) - (p.pauseDurationMs || 0);
        const user = totals.users[p.uid] || (totals.users[p.uid] = { name: p.userName, ms: 0 });
        user.ms += ms;
        if (p.userName) user.name = p.userName;
        const c = totals.chantiers[p.chantier] || (totals.chantiers[p.chantier] = { ms: 0, days: 0 });
        c.ms += ms;
        const dayKey = `${p.chantier}|${p.timestamp.split('T')[0]}`;
        if (!seenDays.has(dayKey)) { seenDays.add(dayKey); c.days++; }
    });
    return totals;
}

/** Totaux d'une période ; onUpdate (facultatif) reçoit une version plus fraîche si le serveur répond après le cache. */
function getPeriodTotals(start, end, onUpdate) {
    const key = `${start.toISOString()}|${end.toISOString()}`;
    if (onUpdate) {
        if (!totalsListeners.has(key)) totalsListeners.set(key, new Set());
        totalsListeners.get(key).add(onUpdate);
    }
    if (!totalsCache.has(key)) {
        const request = checkSummaries()
            .then(ready => ready
                ? totalsFromSummaries(start, end, (fresh) => { totalsCache.set(key, Promise.resolve(fresh)); totalsListeners.get(key)?.forEach(fn => fn(fresh)); })
                : totalsFromPointages(start, end))
            .catch(error => { totalsCache.delete(key); throw error; });
        totalsCache.set(key, request);
    }
    return totalsCache.get(key);
}

// Heures par employé, plafonnées à (contrat + 2 h) × semaines, sauf si « toutes les heures » est activé
function cappedUserTotals(totals, users, weeks) {
    const out = {};
    for (const [uid, u] of Object.entries(totals.users)) {
        let ms = u.ms;
        if (!isShowingAllHours) {
            const user = users.find(x => x.uid === uid);
            if (user && user.contractHours > 0) ms = Math.min(ms, (user.contractHours + 2) * weeks * 3600000);
        }
        out[uid] = { name: u.name, totalMs: ms };
    }
    return out;
}
const sumMs = (stats) => Object.values(stats).reduce((sum, u) => sum + u.totalMs, 0);

const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function render() {
    totalsCache.clear();
    totalsListeners.clear();
    pageContent.innerHTML = `
        <div class="max-w-7xl mx-auto space-y-8">
            <h2 class="text-2xl font-bold" style="color: var(--color-text-base);">Tableau de Bord Administrateur</h2>

            <section aria-labelledby="todo-title">
                <h3 id="todo-title" class="kpi-label mb-3">Aujourd'hui · à traiter</h3>
                <div id="todo-panel" class="todo-grid">
                    ${'<div class="todo-tile is-loading"></div>'.repeat(4)}
                </div>
                <div id="todo-alerts" class="mt-3 space-y-2"></div>
            </section>
            
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-6">
                
                <div class="p-5 rounded-lg shadow-sm text-center" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                    <div class="flex justify-between items-center mb-1">
                        <button id="global-week-prev" class="nav-arrow" aria-label="Précédent"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg></button>
                        <h3 id="global-week-title" class="kpi-label">Heures (Semaine)</h3>
                        <button id="global-week-next" class="nav-arrow" aria-label="Suivant"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></button>
                    </div>
                    <p id="global-week-total" class="kpi-value mt-2 animate-pulse">...</p>
                </div>

                <div class="p-5 rounded-lg shadow-sm text-center" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                    <div class="flex justify-between items-center mb-1">
                        <button id="global-month-prev" class="nav-arrow" aria-label="Précédent"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg></button>
                        <h3 id="global-month-title" class="kpi-label">Heures (Mois)</h3>
                        <button id="global-month-next" class="nav-arrow" aria-label="Suivant"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></button>
                    </div>
                    <p id="global-month-total" class="kpi-value mt-2 animate-pulse">...</p>
                </div>

                <div id="active-projects-card" class="p-5 rounded-lg shadow-sm text-center flex flex-col justify-center" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                    <h3 class="kpi-label">Chantiers actifs</h3>
                    <p class="kpi-value mt-2 animate-pulse">...</p>
                </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div class="p-6 rounded-lg shadow-sm" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                    <div class="flex flex-col sm:flex-row justify-between items-center mb-4 gap-3">
                        <h3 class="text-lg font-semibold" style="color: var(--color-text-base);">Heures par employé</h3>
                        <div class="flex items-center gap-1 p-1 rounded-lg" style="background-color: var(--color-background);">
                            <button data-period="week" class="user-stats-filter-btn px-3 py-1 rounded-md text-sm">Semaine</button>
                            <button data-period="month" class="user-stats-filter-btn px-3 py-1 rounded-md text-sm">Mois</button>
                            <button data-period="year" class="user-stats-filter-btn px-3 py-1 rounded-md text-sm">Année</button>
                        </div>
                    </div>
                    <div class="flex justify-between items-center mb-4">
                        <button id="user-stats-prev-btn" class="nav-arrow" aria-label="Précédent"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg></button>
                        <div id="user-stats-period-display" class="text-center font-semibold text-base" style="color: var(--color-text-base);"></div>
                        <button id="user-stats-next-btn" class="nav-arrow" aria-label="Suivant"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></button>
                    </div>
                    <div id="user-stats-list" class="space-y-3"></div>
                </div>

                <div class="p-6 rounded-lg shadow-sm" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                    <div class="flex flex-col sm:flex-row justify-between items-center mb-4 gap-3">
                        <h3 class="text-lg font-semibold" style="color: var(--color-text-base);">Heures par chantier</h3>
                         <div class="flex items-center gap-1 p-1 rounded-lg" style="background-color: var(--color-background);">
                            <button data-period="week" class="chantier-stats-filter-btn px-3 py-1 rounded-md text-sm">Semaine</button>
                            <button data-period="month" class="chantier-stats-filter-btn px-3 py-1 rounded-md text-sm">Mois</button>
                            <button data-period="year" class="chantier-stats-filter-btn px-3 py-1 rounded-md text-sm">Année</button>
                        </div>
                    </div>
                     <div class="flex justify-between items-center mb-4">
                        <button id="chantier-stats-prev-btn" class="nav-arrow" aria-label="Précédent"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg></button>
                        <div id="chantier-stats-period-display" class="text-center font-semibold text-base" style="color: var(--color-text-base);"></div>
                        <button id="chantier-stats-next-btn" class="nav-arrow" aria-label="Suivant"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></button>
                    </div>
                    <div id="chantier-stats-list" class="space-y-3"></div>
                </div>
            </div>
            
            <div>
                <h3 class="text-lg font-semibold mb-3" style="color: var(--color-text-base);">Activité récente</h3>
                <div id="recent-activity-list" class="space-y-3"></div>
            </div>
        </div>
    `;
    
    setTimeout(() => {
        if (!document.getElementById('user-stats-list')) return; // page quittée entre-temps
        // --- CHARGEMENT PRIORITAIRE (rapide) ---
        loadTodoPanel();
        loadGlobalStats();
        loadStaticStats(); 
        setupEventListeners();

        const loadingMessage = `<p class="text-center p-4" style="color: var(--color-text-muted);">Chargement...</p>`;
        document.getElementById('user-stats-list').innerHTML = loadingMessage;
        document.getElementById('chantier-stats-list').innerHTML = loadingMessage;

        // --- CHARGEMENT À LA DEMANDE : les blocs du bas se chargent quand on descend jusqu'à eux ---
        whenVisible(document.getElementById('user-stats-list'), () => { loadUserStats(); loadChantierStats(); });
        whenVisible(document.getElementById('recent-activity-list'), loadRecentActivity);

    }, 0);
}

// Lance load() quand l'élément arrive près de l'écran (tout de suite si le navigateur ne sait pas le dire)
function whenVisible(element, load) {
    if (!element) return;
    if (!('IntersectionObserver' in window)) { load(); return; }
    const observer = new IntersectionObserver((entries) => {
        if (!entries.some(e => e.isIntersecting)) return;
        observer.disconnect();
        if (element.isConnected) load();
    }, { rootMargin: '300px 0px' });
    observer.observe(element);
}

// --- BLOC "À TRAITER" ---
// Ce qui demande une action aujourd'hui : qui pointe, qui est prévu sans avoir pointé,
// pointages oubliés, congés et comptes en attente. Chaque tuile mène à la page concernée.
const FORGOTTEN_AFTER_MS = 10 * 3600000;

async function loadTodoPanel() {
    const panel = document.getElementById('todo-panel');
    const alerts = document.getElementById('todo-alerts');
    if (!panel) return;

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekId = getWeekDateRange(0).startOfWeek.toISOString().split('T')[0];

    // Chaque requête peut échouer indépendamment sans bloquer les autres tuiles
    const [openSnap, todaySnap, planningSnap, publishedDoc, leaveSnap, users] = await Promise.all([
        getDocs(query(collection(db, "pointages"), where("endTime", "==", null))),
        getDocs(query(collection(db, "pointages"), where("timestamp", ">=", startOfToday.toISOString()))),
        getDocs(query(collection(db, "planning"), where("date", "==", todayStr))),
        getDoc(doc(db, "publishedSchedules", weekId)),
        getDocs(query(collection(db, "leaveRequests"), where("status", "==", "pending"))),
        getUsers(),
    ].map(request => request.catch(error => { console.error("Bloc À traiter :", error); return null; })));

    if (!document.getElementById('todo-panel')) return;

    const open = openSnap ? openSnap.docs.map(d => d.data()) : [];
    const running = open.filter(p => now - new Date(p.timestamp) < FORGOTTEN_AFTER_MS);
    const forgotten = open.filter(p => now - new Date(p.timestamp) >= FORGOTTEN_AFTER_MS);

    let missing = null;
    if (planningSnap && publishedDoc?.exists()) {
        const planned = new Set();
        planningSnap.docs.forEach(d => (d.data().teamNames || []).forEach(name => planned.add(name)));
        const pointed = new Set([...(todaySnap ? todaySnap.docs.map(d => d.data().userName) : []), ...open.map(p => p.userName)]);
        missing = [...planned].filter(name => !pointed.has(name));
    }

    const pendingLeaves = leaveSnap ? leaveSnap.size : null;
    const pendingUsers = users ? users.filter(u => u.status === 'pending') : null;

    const names = (list, max = 3) => {
        if (!list.length) return '';
        const shown = list.slice(0, max).map(escapeHTML).join(', ');
        return list.length > max ? `${shown} +${list.length - max}` : shown;
    };

    const tiles = [
        {
            page: 'admin-live-view', tone: 'success',
            label: 'En cours',
            value: openSnap ? running.length : '–',
            detail: running.length ? names(running.map(p => `${p.userName} (${p.chantier})`), 2) : 'Personne ne pointe',
        },
        {
            page: 'admin-planning', tone: missing && missing.length ? 'warning' : 'neutral',
            label: 'Prévus sans pointage',
            value: missing ? missing.length : '–',
            detail: missing === null ? 'Planning du jour non publié' : missing.length ? names(missing) : 'Tout le monde a pointé',
        },
        {
            page: 'admin-leave', tone: pendingLeaves ? 'primary' : 'neutral',
            label: 'Congés à valider',
            value: pendingLeaves ?? '–',
            detail: pendingLeaves ? 'Demandes en attente' : 'Aucune demande',
        },
        {
            page: 'admin-team', tone: pendingUsers && pendingUsers.length ? 'primary' : 'neutral',
            label: 'Comptes à approuver',
            value: pendingUsers ? pendingUsers.length : '–',
            detail: pendingUsers && pendingUsers.length ? names(pendingUsers.map(u => u.displayName || u.email)) : 'Aucun nouveau compte',
        },
    ];

    panel.innerHTML = tiles.map(tile => `
        <button type="button" class="todo-tile tone-${tile.tone}" data-page="${tile.page}">
            <span class="todo-label">${tile.label}</span>
            <span class="todo-value">${tile.value}</span>
            <span class="todo-detail">${tile.detail}</span>
        </button>
    `).join('');
    panel.querySelectorAll('[data-page]').forEach(tile => {
        tile.onclick = () => navigateTo(tile.dataset.page);
    });

    if (alerts) {
        alerts.innerHTML = forgotten.map(p => {
            const hours = Math.floor((now - new Date(p.timestamp)) / 3600000);
            return `
                <button type="button" class="todo-alert" data-page="admin-live-view">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>
                    <span><strong>Pointage oublié ?</strong> ${escapeHTML(p.userName)} pointe sur ${escapeHTML(p.chantier)} depuis ${hours} h.</span>
                </button>`;
        }).join('');
        alerts.querySelectorAll('[data-page]').forEach(alert => {
            alert.onclick = () => navigateTo(alert.dataset.page);
        });
    }
}

function setupEventListeners() {
    document.getElementById('global-week-prev').onclick = () => { globalWeekOffset--; loadGlobalStats(); };
    document.getElementById('global-week-next').onclick = () => { globalWeekOffset++; loadGlobalStats(); };
    document.getElementById('global-month-prev').onclick = () => { globalMonthOffset--; loadGlobalStats(); };
    document.getElementById('global-month-next').onclick = () => { globalMonthOffset++; loadGlobalStats(); };

    document.querySelectorAll('.user-stats-filter-btn').forEach(btn => {
        btn.onclick = () => {
            userStatsFilter.period = btn.dataset.period;
            userStatsFilter.offset = 0;
            loadUserStats();
        };
    });
    document.querySelectorAll('.chantier-stats-filter-btn').forEach(btn => {
        btn.onclick = () => {
            chantierStatsFilter.period = btn.dataset.period;
            chantierStatsFilter.offset = 0;
            loadChantierStats();
        };
    });
    document.getElementById('user-stats-prev-btn').onclick = () => { userStatsFilter.offset--; loadUserStats(); };
    document.getElementById('user-stats-next-btn').onclick = () => { userStatsFilter.offset++; loadUserStats(); };
    document.getElementById('chantier-stats-prev-btn').onclick = () => { chantierStatsFilter.offset--; loadChantierStats(); };
    document.getElementById('chantier-stats-next-btn').onclick = () => { chantierStatsFilter.offset++; loadChantierStats(); };
}

async function loadGlobalStats() {
    const weekTitle = document.getElementById('global-week-title');
    const weekTotal = document.getElementById('global-week-total');
    const monthTitle = document.getElementById('global-month-title');
    const monthTotal = document.getElementById('global-month-total');

    if (weekTotal) { weekTotal.textContent = '...'; weekTotal.classList.add('animate-pulse'); }
    if (monthTotal) { monthTotal.textContent = '...'; monthTotal.classList.add('animate-pulse'); }

    // --- Calcul Période Semaine ---
    const { startOfWeek, endOfWeek } = getWeekDateRange(globalWeekOffset);
    if(weekTitle) weekTitle.textContent = `Semaine du ${startOfWeek.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`;

    // --- Calcul Période Mois ---
    const now = new Date();
    const dateForMonth = new Date(now.getFullYear(), now.getMonth() + globalMonthOffset, 1);
    const startOfMonth = new Date(Date.UTC(dateForMonth.getFullYear(), dateForMonth.getMonth(), 1));
    const endOfMonth = new Date(Date.UTC(dateForMonth.getFullYear(), dateForMonth.getMonth() + 1, 0, 23, 59, 59, 999));
    if(monthTitle) monthTitle.textContent = dateForMonth.toLocaleString('fr-FR', { month: 'long', year: 'numeric' });

    try {
        // Chiffres affichés depuis la mémoire du téléphone : on réaffiche quand le serveur a répondu
        const shownWeek = globalWeekOffset, shownMonth = globalMonthOffset;
        const refresh = () => { if (weekTotal?.isConnected && shownWeek === globalWeekOffset && shownMonth === globalMonthOffset) show(); };
        const show = async () => {
            const [weekTotals, monthTotals, users] = await Promise.all([getPeriodTotals(startOfWeek, endOfWeek, refresh), getPeriodTotals(startOfMonth, endOfMonth, refresh), getUsers()]);
            if (weekTotal) { weekTotal.textContent = formatMilliseconds(sumMs(cappedUserTotals(weekTotals, users, 1))); weekTotal.classList.remove('animate-pulse'); }
            // Mois : approximation de 4 semaines pour le plafond
            if (monthTotal) { monthTotal.textContent = formatMilliseconds(sumMs(cappedUserTotals(monthTotals, users, 4))); monthTotal.classList.remove('animate-pulse'); }
        };
        await show();
    } catch (error) { console.error("Erreur de chargement des statistiques globales:", error); }
}

async function loadStaticStats() {
    const projectsCard = document.querySelector('#active-projects-card p');
    if (!projectsCard) return;

    try {
        projectsCard.textContent = (await getActiveChantiers()).length;
        projectsCard.classList.remove('animate-pulse');
    } catch (error) {
        console.error("Erreur de chargement des stats statiques:", error);
        projectsCard.textContent = "Erreur";
    }
}

function getPeriodInfo(filter) {
    const now = new Date();
    let startDate, endDate, displayText;
    switch (filter.period) {
        case 'year':
            const year = now.getFullYear() + filter.offset;
            startDate = new Date(Date.UTC(year, 0, 1));
            endDate = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
            displayText = `Année ${year}`;
            break;
        case 'month':
            const dateForMonth = new Date(now.getFullYear(), now.getMonth() + filter.offset, 1);
            startDate = new Date(Date.UTC(dateForMonth.getFullYear(), dateForMonth.getMonth(), 1));
            endDate = new Date(Date.UTC(dateForMonth.getFullYear(), dateForMonth.getMonth() + 1, 0, 23, 59, 59, 999));
            displayText = dateForMonth.toLocaleString('fr-FR', { month: 'long', year: 'numeric' });
            break;
        case 'week':
        default:
            const weekRange = getWeekDateRange(filter.offset);
            startDate = weekRange.startOfWeek;
            endDate = weekRange.endOfWeek;
            displayText = `Semaine du ${startDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`;
            break;
    }
    return { startDate, endDate, displayText, period: filter.period };
}

async function loadUserStats() {
    const userInfo = getPeriodInfo(userStatsFilter);
    updateFilterUI('user', userStatsFilter, userInfo.displayText);
    const weeks = { week: 1, month: 4, year: 52 }[userInfo.period] || 1;
    const stillShown = () => getPeriodInfo(userStatsFilter).startDate.getTime() === userInfo.startDate.getTime() && userStatsFilter.period === userInfo.period;

    const show = async (totals) => {
        const users = await getUsers();
        displayStats(cappedUserTotals(totals, users, weeks), document.getElementById('user-stats-list'), "Aucun pointage pour cette période.");
    };
    try {
        await show(await getPeriodTotals(userInfo.startDate, userInfo.endDate, (fresh) => { if (stillShown()) show(fresh); }));
    } catch (error) {
        console.error("Erreur de chargement des statistiques par employé:", error);
    }
}

async function loadChantierStats() {
    const chantierInfo = getPeriodInfo(chantierStatsFilter);
    updateFilterUI('chantier', chantierStatsFilter, chantierInfo.displayText);
    const stillShown = () => getPeriodInfo(chantierStatsFilter).startDate.getTime() === chantierInfo.startDate.getTime() && chantierStatsFilter.period === chantierInfo.period;

    const show = async (totals) => {
        const chantiers = await getActiveChantiers();
        const chantierStats = {};
        Object.entries(totals.chantiers).forEach(([name, c]) => { chantierStats[name] = c.ms; });
        // Budget = jours de passage × heures prévues par passage (même règle que la page "Écarts d'heures")
        const budgets = {};
        chantiers.forEach(chantier => {
            const hoursPerVisit = parseFloat(chantier.totalHeuresPrevues) || 0;
            const visited = totals.chantiers[chantier.name];
            if (hoursPerVisit > 0 && visited?.days) budgets[chantier.name] = visited.days * hoursPerVisit * 3600000;
        });
        displayStats(chantierStats, document.getElementById('chantier-stats-list'), "Aucun chantier pointé pour cette période.", true, budgets);
    };
    try {
        await show(await getPeriodTotals(chantierInfo.startDate, chantierInfo.endDate, (fresh) => { if (stillShown()) show(fresh); }));
    } catch (error) {
        console.error("Erreur de chargement des statistiques par chantier:", error);
    }
}

function updateFilterUI(type, filter, displayText) {
    const periodDisplay = document.getElementById(`${type}-stats-period-display`);
    if (!periodDisplay) return; // page quittée pendant le chargement
    periodDisplay.textContent = displayText;
    document.querySelectorAll(`.${type}-stats-filter-btn`).forEach(btn => {
        const isSelected = btn.dataset.period === filter.period;
        if (isSelected) {
            btn.style.backgroundColor = 'var(--color-surface)';
            btn.classList.add('shadow');
        } else {
            btn.style.backgroundColor = 'transparent';
            btn.classList.remove('shadow');
        }
    });
}

function budgetBarHTML(doneMs, budgetMs) {
    const ratio = doneMs / budgetMs;
    const state = ratio > 1.1 ? 'over' : ratio < 0.9 ? 'under' : 'ok';
    const label = { over: 'Dépassement', under: 'Heures manquantes', ok: 'Dans le budget' }[state];
    return `
        <div class="budget-bar budget-${state}">
            <div class="budget-track"><div class="budget-fill" style="width: ${Math.min(100, Math.round(ratio * 100))}%"></div></div>
            <span class="budget-text"><strong>${label}</strong> · ${formatMilliseconds(doneMs)} / ${formatMilliseconds(budgetMs)} prévues (${Math.round(ratio * 100)} %)</span>
        </div>`;
}

function displayStats(statsObject, container, emptyMessage, isClickable = false, budgets = {}) {
    if (!container) return;
    container.innerHTML = "";
    
    const isUserStats = !isClickable;
    let sortedEntries = isUserStats 
        ? Object.entries(statsObject).sort(([, a], [, b]) => b.totalMs - a.totalMs)
        : Object.entries(statsObject).sort(([, a], [, b]) => b - a);

    if (sortedEntries.length === 0) {
        container.innerHTML = `<p class="text-center" style="color: var(--color-text-muted);">${emptyMessage}</p>`;
        return;
    }

    sortedEntries.forEach(([key, value]) => {
        const name = isUserStats ? value.name : key;
        const totalMs = isUserStats ? value.totalMs : value;
        const div = document.createElement('div');
        div.className = 'stat-row';
        div.style.borderColor = 'var(--color-border)';
        if (isClickable) {
            div.innerHTML = `<button class="font-medium hover:underline text-left" style="color: var(--color-primary);">${name}</button><span class="stat-row-value">${formatMilliseconds(totalMs)}</span>`;
            div.querySelector('button').onclick = () => navigateTo('admin-chantier-details', { chantierName: name });
            if (budgets[name]) {
                div.classList.add('has-budget');
                div.insertAdjacentHTML('beforeend', budgetBarHTML(totalMs, budgets[name]));
            }
        } else {
            div.innerHTML = `<span class="font-medium" style="color: var(--color-text-base);">${name}</span><span class="stat-row-value">${formatMilliseconds(totalMs)}</span>`;
        }
        container.appendChild(div);
    });
}

async function loadRecentActivity() {
    const container = document.getElementById('recent-activity-list');
    if (!container) return;
    try {
        const q = query(collection(db, "pointages"), orderBy("createdAt", "desc"), where("createdAt", "!=", null), limit(5));
        const querySnapshot = await getDocs(q);
        container.innerHTML = "";
        if (querySnapshot.empty) { 
            container.innerHTML = `<p class='text-center' style="color: var(--color-text-muted);">Aucune activité récente.</p>`; 
            return; 
        }
        querySnapshot.docs.forEach(doc => container.appendChild(createDetailedActivityElement(doc.id, doc.data())));
    } catch (error) {
        console.error("Erreur de chargement de l'activité récente:", error);
        container.innerHTML = `<p class='text-red-500 text-center'>Erreur de chargement.</p>`;
    }
}

function createDetailedActivityElement(docId, d) {
    const wrapper = document.createElement("div");
    wrapper.className = "p-4 border rounded-lg relative shadow-sm space-y-1";
    wrapper.style.backgroundColor = 'var(--color-surface)';
    wrapper.style.borderColor = 'var(--color-border)';

    const startDate = new Date(d.timestamp);
    const endDate = d.endTime ? new Date(d.endTime) : null;
    let timeDisplay = "", durationDisplay = "";
    if (endDate) {
        timeDisplay = `De ${startDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} à ${endDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
        durationDisplay = `<div class="text-sm" style="color: var(--color-text-muted);">Durée effective : ${formatMilliseconds((endDate - startDate) - (d.pauseDurationMs || 0))}</div>`;
    } else {
        timeDisplay = `<div>Débuté à ${startDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} (en cours)</div>`;
    }
    wrapper.innerHTML = `
        <div class="font-semibold" style="color: var(--color-primary);">${d.userName || 'Utilisateur inconnu'}</div>
        <div class="font-bold text-lg">${d.chantier}</div>
        <div>${startDate.toLocaleDateString('fr-FR')}</div>
        ${timeDisplay}
        ${durationDisplay}
        <div class="mt-2" style="color: var(--color-text-muted);"><strong>Collègues :</strong> ${(d.colleagues || []).join(", ") || 'Aucun'}</div>
        ${d.notes ? `<div class="mt-1 pt-2 border-t text-sm" style="border-color: var(--color-border);"><strong>Notes :</strong> ${d.notes}</div>` : ""}
    `;
    const deleteBtn = document.createElement("button");
    deleteBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true" style="pointer-events: none;"><path d="M18 6 6 18M6 6l12 12"/></svg>';
    deleteBtn.className = "icon-btn is-danger absolute top-2 right-2";
    deleteBtn.setAttribute('aria-label', 'Supprimer ce pointage');
    deleteBtn.style.color = 'var(--color-text-muted)';
    deleteBtn.onclick = async () => { if (await showConfirmationModal("Confirmation", "Supprimer ce pointage ?")) { await deleteDoc(doc(db, "pointages", docId)); render(); } };
    wrapper.appendChild(deleteBtn);
    return wrapper;
}