import { collection, query, where, orderBy, getDocs, doc, deleteDoc, limit } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent, showConfirmationModal, navigateTo } from "../app.js";
import { getWeekDateRange, formatMilliseconds } from "./utils.js";
import { getUsers } from "./data-service.js";

// --- VARIABLES GLOBALES POUR LES CARTES NAVIGABLES ---
let globalWeekOffset = 0;
let globalMonthOffset = 0;
// --- FIN ---

let userStatsFilter = { period: 'week', offset: 0 };
let chantierStatsFilter = { period: 'week', offset: 0 };

export async function render() {
    pageContent.innerHTML = `
        <div class="max-w-7xl mx-auto space-y-8">
            <h2 class="text-2xl font-bold" style="color: var(--color-text-base);">📊 Tableau de Bord Administrateur</h2>
            
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                <div class="p-6 rounded-lg shadow-sm text-center" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                    <div class="flex justify-between items-center mb-1">
                        <button id="global-week-prev" class="p-1 rounded-lg" style="background-color: var(--color-background);">&lt;</button>
                        <h3 id="global-week-title" class="text-sm font-medium" style="color: var(--color-text-muted);">Heures (Semaine)</h3>
                        <button id="global-week-next" class="p-1 rounded-lg" style="background-color: var(--color-background);">&gt;</button>
                    </div>
                    <p id="global-week-total" class="mt-1 text-3xl font-semibold animate-pulse" style="color: var(--color-text-base);">...</p>
                </div>

                <div class="p-6 rounded-lg shadow-sm text-center" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                    <div class="flex justify-between items-center mb-1">
                        <button id="global-month-prev" class="p-1 rounded-lg" style="background-color: var(--color-background);">&lt;</button>
                        <h3 id="global-month-title" class="text-sm font-medium" style="color: var(--color-text-muted);">Heures (Mois)</h3>
                        <button id="global-month-next" class="p-1 rounded-lg" style="background-color: var(--color-background);">&gt;</button>
                    </div>
                    <p id="global-month-total" class="mt-1 text-3xl font-semibold animate-pulse" style="color: var(--color-text-base);">...</p>
                </div>

                <div id="active-projects-card" class="p-6 rounded-lg shadow-sm text-center" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                    <h3 class="text-sm font-medium" style="color: var(--color-text-muted);">Chantiers Actifs</h3>
                    <p class="mt-1 text-3xl font-semibold animate-pulse" style="color: var(--color-text-base);">...</p>
                </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div class="p-6 rounded-lg shadow-sm" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                    <div class="flex flex-col sm:flex-row justify-between items-center mb-4 gap-3">
                        <h3 class="text-xl font-semibold" style="color: var(--color-text-base);">Heures par employé</h3>
                        <div class="flex items-center gap-1 p-1 rounded-lg" style="background-color: var(--color-background);">
                            <button data-period="week" class="user-stats-filter-btn px-3 py-1 rounded-md text-sm">Semaine</button>
                            <button data-period="month" class="user-stats-filter-btn px-3 py-1 rounded-md text-sm">Mois</button>
                            <button data-period="year" class="user-stats-filter-btn px-3 py-1 rounded-md text-sm">Année</button>
                        </div>
                    </div>
                    <div class="flex justify-between items-center mb-4">
                        <button id="user-stats-prev-btn" class="px-4 py-2 rounded-lg" style="background-color: var(--color-background);">&lt;</button>
                        <div id="user-stats-period-display" class="text-center font-semibold text-base" style="color: var(--color-text-base);"></div>
                        <button id="user-stats-next-btn" class="px-4 py-2 rounded-lg" style="background-color: var(--color-background);">&gt;</button>
                    </div>
                    <div id="user-stats-list" class="space-y-3"></div>
                </div>

                <div class="p-6 rounded-lg shadow-sm" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                    <div class="flex flex-col sm:flex-row justify-between items-center mb-4 gap-3">
                        <h3 class="text-xl font-semibold" style="color: var(--color-text-base);">Heures par chantier</h3>
                         <div class="flex items-center gap-1 p-1 rounded-lg" style="background-color: var(--color-background);">
                            <button data-period="week" class="chantier-stats-filter-btn px-3 py-1 rounded-md text-sm">Semaine</button>
                            <button data-period="month" class="chantier-stats-filter-btn px-3 py-1 rounded-md text-sm">Mois</button>
                            <button data-period="year" class="chantier-stats-filter-btn px-3 py-1 rounded-md text-sm">Année</button>
                        </div>
                    </div>
                     <div class="flex justify-between items-center mb-4">
                        <button id="chantier-stats-prev-btn" class="px-4 py-2 rounded-lg" style="background-color: var(--color-background);">&lt;</button>
                        <div id="chantier-stats-period-display" class="text-center font-semibold text-base" style="color: var(--color-text-base);"></div>
                        <button id="chantier-stats-next-btn" class="px-4 py-2 rounded-lg" style="background-color: var(--color-background);">&gt;</button>
                    </div>
                    <div id="chantier-stats-list" class="space-y-3"></div>
                </div>
            </div>
            
            <div>
                <h3 class="text-xl font-semibold mb-2" style="color: var(--color-text-base);">Activité Récente</h3>
                <div id="recent-activity-list" class="space-y-3"></div>
            </div>
        </div>
    `;
    
    setTimeout(() => {
        // --- CHARGEMENT PRIORITAIRE (rapide) ---
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

    // --- Requêtes ---
    const weekQuery = query(collection(db, "pointages"), where("timestamp", ">=", startOfWeek.toISOString()), where("timestamp", "<=", endOfWeek.toISOString()));
    const monthQuery = query(collection(db, "pointages"), where("timestamp", ">=", startOfMonth.toISOString()), where("timestamp", "<=", endOfMonth.toISOString()));
    
    try {
        const [weekSnapshot, monthSnapshot] = await Promise.all([ getDocs(weekQuery), getDocs(monthQuery) ]);
        
        let weekMs = 0;
        weekSnapshot.forEach(doc => { 
            const data = doc.data();
            if (data.endTime) {
                weekMs += (new Date(data.endTime) - new Date(data.timestamp)) - (data.pauseDurationMs || 0); 
            }
        });
        if (weekTotal) { weekTotal.textContent = formatMilliseconds(weekMs); weekTotal.classList.remove('animate-pulse'); }
        
        let monthMs = 0;
        monthSnapshot.forEach(doc => { 
            const data = doc.data();
            if (data.endTime) {
                monthMs += (new Date(data.endTime) - new Date(data.timestamp)) - (data.pauseDurationMs || 0); 
            }
        });
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
        const q = query(
            collection(db, "pointages"),
            where("timestamp", ">=", userInfo.startDate.toISOString()),
            where("timestamp", "<=", userInfo.endDate.toISOString())
        );
        const querySnapshot = await getDocs(q);
        
        const users = await getUsers();
        const userStats = {};

        querySnapshot.forEach(doc => {
            const data = doc.data();
            if (data.endTime) {
                const durationMs = (new Date(data.endTime) - new Date(data.timestamp)) - (data.pauseDurationMs || 0);
                if (!userStats[data.uid]) {
                    userStats[data.uid] = { name: data.userName, totalMs: 0 };
                }
                userStats[data.uid].totalMs += durationMs;
            }
        });

        for (const uid in userStats) {
            const user = users.find(u => u.uid === uid);
            if (user && user.contractHours === 12) {
                let contractLimitMs = 0;
                if (userInfo.period === 'week') contractLimitMs = 12 * 3600000;
                else if (userInfo.period === 'month') contractLimitMs = 48 * 3600000;
                else if (userInfo.period === 'year') contractLimitMs = 12 * 52 * 3600000;
                
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
        const q = query(
            collection(db, "pointages"),
            where("timestamp", ">=", chantierInfo.startDate.toISOString()),
            where("timestamp", "<=", chantierInfo.endDate.toISOString())
        );
        const querySnapshot = await getDocs(q);
        
        const chantierStats = {};
        querySnapshot.forEach(doc => {
            const data = doc.data();
            if (data.endTime) {
                const durationMs = (new Date(data.endTime) - new Date(data.timestamp)) - (data.pauseDurationMs || 0);
                chantierStats[data.chantier] = (chantierStats[data.chantier] || 0) + durationMs;
            }
        });

        displayStats(chantierStats, document.getElementById('chantier-stats-list'), "Aucun chantier pointé pour cette période.", true);
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

function displayStats(statsObject, container, emptyMessage, isClickable = false) {
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
        div.className = 'flex justify-between items-center text-sm p-2 border-b';
        div.style.borderColor = 'var(--color-border)';
        if (isClickable) {
            div.innerHTML = `<button class="font-medium hover:underline text-left" style="color: var(--color-primary);">${name}</button><span class="font-bold" style="color: var(--color-primary);">${formatMilliseconds(totalMs)}</span>`;
            div.querySelector('button').onclick = () => navigateTo('admin-chantier-details', { chantierName: name });
        } else {
            div.innerHTML = `<span class="font-medium" style="color: var(--color-text-base);">${name}</span><span class="font-bold" style="color: var(--color-primary);">${formatMilliseconds(totalMs)}</span>`;
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
    deleteBtn.className = "absolute top-2 right-3 hover:text-red-600 font-bold";
    deleteBtn.style.color = 'var(--color-text-muted)';
    deleteBtn.onclick = async () => { if (await showConfirmationModal("Confirmation", "Supprimer ce pointage ?")) { await deleteDoc(doc(db, "pointages", docId)); render(); } };
    wrapper.appendChild(deleteBtn);
    return wrapper;
}