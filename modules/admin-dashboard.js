import { collection, query, where, orderBy, getDocs, getDoc, doc, deleteDoc, limit } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent, showConfirmationModal, navigateTo, isShowingAllHours } from "../app.js"; // <-- isShowingAllHours IMPORTÉ ICI
import { getWeekDateRange, formatMilliseconds } from "./utils.js";
import { getUsers, getActiveChantiers } from "./data-service.js";

// --- VARIABLES GLOBALES POUR LES CARTES NAVIGABLES ---
let globalWeekOffset = 0;
let globalMonthOffset = 0;
// --- FIN ---

let userStatsFilter = { period: 'week', offset: 0 };
let chantierStatsFilter = { period: 'week', offset: 0 };

// --- CACHE DES POINTAGES ---
// Les cartes "Semaine", "Heures par employé" et "Heures par chantier" demandent souvent la même
// période : on ne télécharge chaque période qu'une fois par affichage du tableau de bord.
const pointagesCache = new Map();

function fetchPointages(start, end) {
    const key = `${start.toISOString()}|${end.toISOString()}`;
    if (!pointagesCache.has(key)) {
        const q = query(collection(db, "pointages"), where("timestamp", ">=", start.toISOString()), where("timestamp", "<=", end.toISOString()));
        const request = getDocs(q)
            .then(snapshot => snapshot.docs.map(d => d.data()))
            .catch(error => { pointagesCache.delete(key); throw error; });
        pointagesCache.set(key, request);
    }
    return pointagesCache.get(key);
}

const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function render() {
    pointagesCache.clear();
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
        // --- CHARGEMENT PRIORITAIRE (rapide) ---
        loadTodoPanel();
        loadGlobalStats();
        loadStaticStats(); 
        loadRecentActivity();
        setupEventListeners();

        const loadingMessage = `<p class="text-center p-4" style="color: var(--color-text-muted);">Chargement...</p>`;
        document.getElementById('user-stats-list').innerHTML = loadingMessage;
        document.getElementById('chantier-stats-list').innerHTML = loadingMessage;

        // --- CHARGEMENT DIFFÉRÉ (plus lent) ---
        setTimeout(() => {
            loadUserStats();
            loadChantierStats();
        }, 200);

    }, 0);
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
        const [weekPointages, monthPointages] = await Promise.all([ fetchPointages(startOfWeek, endOfWeek), fetchPointages(startOfMonth, endOfMonth) ]);
        const users = await getUsers();
        
        // --- Calcul du total de la Semaine avec ou sans plafonnement (selon bouton rouge) ---
        let weekUserStats = {};
        weekPointages.forEach(data => {
            if (data.endTime) {
                if (!weekUserStats[data.uid]) weekUserStats[data.uid] = 0;
                weekUserStats[data.uid] += (new Date(data.endTime) - new Date(data.timestamp)) - (data.pauseDurationMs || 0); 
            }
        });

        let weekMs = 0;
        for (const uid in weekUserStats) {
            let ms = weekUserStats[uid];
            if (!isShowingAllHours) {
                const user = users.find(u => u.uid === uid);
                if (user && user.contractHours > 0) {
                    const cap = (user.contractHours + 2) * 3600000;
                    ms = Math.min(ms, cap);
                }
            }
            weekMs += ms;
        }
        if (weekTotal) { weekTotal.textContent = formatMilliseconds(weekMs); weekTotal.classList.remove('animate-pulse'); }
        
        // --- Calcul du total du Mois avec ou sans plafonnement (selon bouton rouge) ---
        let monthUserStats = {};
        monthPointages.forEach(data => {
            if (data.endTime) {
                if (!monthUserStats[data.uid]) monthUserStats[data.uid] = 0;
                monthUserStats[data.uid] += (new Date(data.endTime) - new Date(data.timestamp)) - (data.pauseDurationMs || 0); 
            }
        });

        let monthMs = 0;
        for (const uid in monthUserStats) {
            let ms = monthUserStats[uid];
            if (!isShowingAllHours) {
                const user = users.find(u => u.uid === uid);
                if (user && user.contractHours > 0) {
                    const cap = (user.contractHours + 2) * 4 * 3600000; // Approximation de 4 semaines/mois
                    ms = Math.min(ms, cap);
                }
            }
            monthMs += ms;
        }
        if (monthTotal) { monthTotal.textContent = formatMilliseconds(monthMs); monthTotal.classList.remove('animate-pulse'); }

    } catch (error) { console.error("Erreur de chargement des statistiques globales:", error); }
}

async function loadStaticStats() {
    const projectsCard = document.querySelector('#active-projects-card p');
    if (!projectsCard) return;

    const chantiersQuery = query(collection(db, "chantiers"), where("status", "==", "active"));
    try {
        const chantiersSnapshot = await getDocs(chantiersQuery);
        projectsCard.textContent = chantiersSnapshot.size; 
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

    try {
        const [pointages, users] = await Promise.all([fetchPointages(userInfo.startDate, userInfo.endDate), getUsers()]);
        const userStats = {};

        pointages.forEach(data => {
            if (data.endTime) {
                const durationMs = (new Date(data.endTime) - new Date(data.timestamp)) - (data.pauseDurationMs || 0);
                if (!userStats[data.uid]) {
                    userStats[data.uid] = { name: data.userName, totalMs: 0 };
                }
                userStats[data.uid].totalMs += durationMs;
            }
        });

        // Application de la limite Contrat + 2h si le bouton n'est pas activé
        for (const uid in userStats) {
            const user = users.find(u => u.uid === uid);
            if (!isShowingAllHours && user && user.contractHours > 0) {
                let contractLimitMs = 0;
                const weeklyCap = (user.contractHours + 2) * 3600000;
                
                if (userInfo.period === 'week') contractLimitMs = weeklyCap;
                else if (userInfo.period === 'month') contractLimitMs = weeklyCap * 4;
                else if (userInfo.period === 'year') contractLimitMs = weeklyCap * 52;
                
                if (contractLimitMs > 0) userStats[uid].totalMs = Math.min(userStats[uid].totalMs, contractLimitMs);
            }
        }

        displayStats(userStats, document.getElementById('user-stats-list'), "Aucun pointage pour cette période.");
    } catch (error) {
        console.error("Erreur de chargement des statistiques par employé:", error);
    }
}

async function loadChantierStats() {
    const chantierInfo = getPeriodInfo(chantierStatsFilter);
    updateFilterUI('chantier', chantierStatsFilter, chantierInfo.displayText);

    try {
        const [pointages, chantiers] = await Promise.all([fetchPointages(chantierInfo.startDate, chantierInfo.endDate), getActiveChantiers()]);

        const chantierStats = {};
        const chantierDays = {};
        pointages.forEach(data => {
            if (data.endTime) {
                const durationMs = (new Date(data.endTime) - new Date(data.timestamp)) - (data.pauseDurationMs || 0);
                chantierStats[data.chantier] = (chantierStats[data.chantier] || 0) + durationMs;
                if (!chantierDays[data.chantier]) chantierDays[data.chantier] = new Set();
                chantierDays[data.chantier].add(data.timestamp.split('T')[0]);
            }
        });

        // Budget = jours de passage × heures prévues par passage (même règle que la page "Écarts d'heures")
        const budgets = {};
        chantiers.forEach(chantier => {
            const hoursPerVisit = parseFloat(chantier.totalHeuresPrevues) || 0;
            if (hoursPerVisit > 0 && chantierDays[chantier.name]) {
                budgets[chantier.name] = chantierDays[chantier.name].size * hoursPerVisit * 3600000;
            }
        });

        displayStats(chantierStats, document.getElementById('chantier-stats-list'), "Aucun chantier pointé pour cette période.", true, budgets);
    } catch (error) {
        console.error("Erreur de chargement des statistiques par chantier:", error);
    }
}


function updateFilterUI(type, filter, displayText) {
    document.getElementById(`${type}-stats-period-display`).textContent = displayText;
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
    deleteBtn.textContent = "✖";
    deleteBtn.className = "absolute top-2 right-2 w-9 h-9 grid place-items-center rounded-lg hover:text-red-600 hover:bg-red-50 font-bold";
    deleteBtn.setAttribute('aria-label', 'Supprimer ce pointage');
    deleteBtn.style.color = 'var(--color-text-muted)';
    deleteBtn.onclick = async () => { if (await showConfirmationModal("Confirmation", "Supprimer ce pointage ?")) { await deleteDoc(doc(db, "pointages", docId)); render(); } };
    wrapper.appendChild(deleteBtn);
    return wrapper;
}