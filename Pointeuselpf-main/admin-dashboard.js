import { collection, query, where, orderBy, getDocs, doc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent, showConfirmationModal, navigateTo } from "../app.js";
import { getWeekDateRange, formatMilliseconds } from "./utils.js";

// --- NOUVEAU : Objets pour gérer l'état complet des filtres ---
let userStatsFilter = { period: 'week', offset: 0 };
let chantierStatsFilter = { period: 'week', offset: 0 };

export async function render() {
    pageContent.innerHTML = `
        <div class="max-w-7xl mx-auto space-y-8">
            <h2 class="text-2xl font-bold">📊 Tableau de Bord Administrateur</h2>
            
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div id="week-total-card" class="bg-white p-6 rounded-lg shadow-sm text-center">
                    <h3 class="text-sm font-medium text-gray-500">Heures cette semaine (Total)</h3>
                    <p class="mt-1 text-3xl font-semibold animate-pulse">...</p>
                </div>
                <div id="month-total-card" class="bg-white p-6 rounded-lg shadow-sm text-center">
                    <h3 class="text-sm font-medium text-gray-500">Heures ce mois-ci (Total)</h3>
                    <p class="mt-1 text-3xl font-semibold animate-pulse">...</p>
                </div>
                <div id="active-projects-card" class="bg-white p-6 rounded-lg shadow-sm text-center">
                    <h3 class="text-sm font-medium text-gray-500">Chantiers Actifs</h3>
                    <p class="mt-1 text-3xl font-semibold animate-pulse">...</p>
                </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div class="bg-white p-6 rounded-lg shadow-sm">
                    <div class="flex flex-col sm:flex-row justify-between items-center mb-4 gap-3">
                        <h3 class="text-xl font-semibold">Heures par employé</h3>
                        <div class="flex items-center gap-1 p-1 bg-gray-100 rounded-lg text-sm">
                            <button data-period="week" class="user-stats-filter-btn px-3 py-1 rounded-md">Semaine</button>
                            <button data-period="month" class="user-stats-filter-btn px-3 py-1 rounded-md">Mois</button>
                            <button data-period="year" class="user-stats-filter-btn px-3 py-1 rounded-md">Année</button>
                        </div>
                    </div>
                    <div class="flex justify-between items-center mb-4">
                        <button id="user-stats-prev-btn" class="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg">&lt;</button>
                        <div id="user-stats-period-display" class="text-center font-semibold text-base"></div>
                        <button id="user-stats-next-btn" class="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg">&gt;</button>
                    </div>
                    <div id="user-stats-list" class="space-y-3"></div>
                </div>

                <div class="bg-white p-6 rounded-lg shadow-sm">
                    <div class="flex flex-col sm:flex-row justify-between items-center mb-4 gap-3">
                        <h3 class="text-xl font-semibold">Heures par chantier</h3>
                         <div class="flex items-center gap-1 p-1 bg-gray-100 rounded-lg text-sm">
                            <button data-period="week" class="chantier-stats-filter-btn px-3 py-1 rounded-md">Semaine</button>
                            <button data-period="month" class="chantier-stats-filter-btn px-3 py-1 rounded-md">Mois</button>
                            <button data-period="year" class="chantier-stats-filter-btn px-3 py-1 rounded-md">Année</button>
                        </div>
                    </div>
                     <div class="flex justify-between items-center mb-4">
                        <button id="chantier-stats-prev-btn" class="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg">&lt;</button>
                        <div id="chantier-stats-period-display" class="text-center font-semibold text-base"></div>
                        <button id="chantier-stats-next-btn" class="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg">&gt;</button>
                    </div>
                    <div id="chantier-stats-list" class="space-y-3"></div>
                </div>
            </div>

            <div>
                <h3 class="text-xl font-semibold mb-2">Activité Récente</h3>
                <div id="recent-activity-list" class="space-y-3"></div>
            </div>
        </div>
    `;
    setTimeout(() => {
        loadGlobalStats();
        setupEventListeners();
        loadDetailedStats();
        loadRecentActivity();
    }, 0);
}

function setupEventListeners() {
    document.querySelectorAll('.user-stats-filter-btn').forEach(btn => {
        btn.onclick = () => {
            userStatsFilter.period = btn.dataset.period;
            userStatsFilter.offset = 0; // Reset offset when changing period type
            loadDetailedStats();
        };
    });
    document.querySelectorAll('.chantier-stats-filter-btn').forEach(btn => {
        btn.onclick = () => {
            chantierStatsFilter.period = btn.dataset.period;
            chantierStatsFilter.offset = 0;
            loadDetailedStats();
        };
    });
    document.getElementById('user-stats-prev-btn').onclick = () => { userStatsFilter.offset--; loadDetailedStats(); };
    document.getElementById('user-stats-next-btn').onclick = () => { userStatsFilter.offset++; loadDetailedStats(); };
    document.getElementById('chantier-stats-prev-btn').onclick = () => { chantierStatsFilter.offset--; loadDetailedStats(); };
    document.getElementById('chantier-stats-next-btn').onclick = () => { chantierStatsFilter.offset++; loadDetailedStats(); };
}

async function loadGlobalStats() {
    // ... (Cette fonction reste inchangée)
    const now = new Date();
    const { startOfWeek } = getWeekDateRange(0);
    const startOfMonth = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
    const weekQuery = query(collection(db, "pointages"), where("timestamp", ">=", startOfWeek.toISOString()));
    const monthQuery = query(collection(db, "pointages"), where("timestamp", ">=", startOfMonth.toISOString()));
    const chantiersQuery = query(collection(db, "chantiers"), where("status", "==", "active"));
    try {
        const [weekSnapshot, monthSnapshot, chantiersSnapshot] = await Promise.all([ getDocs(weekQuery), getDocs(monthQuery), getDocs(chantiersQuery) ]);
        let weekMs = 0;
        weekSnapshot.forEach(doc => { if (doc.data().endTime) weekMs += new Date(doc.data().endTime) - new Date(doc.data().timestamp); });
        const weekCard = document.querySelector('#week-total-card p');
        if (weekCard) { weekCard.textContent = formatMilliseconds(weekMs); weekCard.classList.remove('animate-pulse'); }
        let monthMs = 0;
        monthSnapshot.forEach(doc => { if (doc.data().endTime) monthMs += new Date(doc.data().endTime) - new Date(doc.data().timestamp); });
        const monthCard = document.querySelector('#month-total-card p');
        if (monthCard) { monthCard.textContent = formatMilliseconds(monthMs); monthCard.classList.remove('animate-pulse'); }
        const projectsCard = document.querySelector('#active-projects-card p');
        if (projectsCard) { projectsCard.textContent = chantiersSnapshot.size; projectsCard.classList.remove('animate-pulse'); }
    } catch (error) { console.error("Erreur de chargement des statistiques globales:", error); }
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
    return { startDate, endDate, displayText };
}

async function loadDetailedStats() {
    const userInfo = getPeriodInfo(userStatsFilter);
    const chantierInfo = getPeriodInfo(chantierStatsFilter);
    const earliestStartDate = userInfo.startDate < chantierInfo.startDate ? userInfo.startDate : chantierInfo.startDate;

    updateFilterUI('user', userStatsFilter, userInfo.displayText);
    updateFilterUI('chantier', chantierStatsFilter, chantierInfo.displayText);

    try {
        const q = query(collection(db, "pointages"), where("timestamp", ">=", earliestStartDate.toISOString()));
        const querySnapshot = await getDocs(q);

        const userStats = {};
        const chantierStats = {};

        querySnapshot.forEach(doc => {
            const data = doc.data();
            const docDate = new Date(data.timestamp);
            if (data.endTime) {
                const durationMs = new Date(data.endTime) - docDate;
                if (docDate >= userInfo.startDate && docDate <= userInfo.endDate) {
                    userStats[data.userName] = (userStats[data.userName] || 0) + durationMs;
                }
                if (docDate >= chantierInfo.startDate && docDate <= chantierInfo.endDate) {
                    chantierStats[data.chantier] = (chantierStats[data.chantier] || 0) + durationMs;
                }
            }
        });

        displayStats(userStats, document.getElementById('user-stats-list'), "Aucun pointage pour cette période.");
        displayStats(chantierStats, document.getElementById('chantier-stats-list'), "Aucun chantier pointé pour cette période.", true);
    } catch (error) {
        console.error("Erreur de chargement des statistiques détaillées:", error);
    }
}

function updateFilterUI(type, filter, displayText) {
    document.getElementById(`${type}-stats-period-display`).textContent = displayText;
    document.querySelectorAll(`.${type}-stats-filter-btn`).forEach(btn => {
        const isSelected = btn.dataset.period === filter.period;
        btn.classList.toggle('bg-white', isSelected);
        btn.classList.toggle('shadow', isSelected);
        btn.classList.toggle('bg-gray-100', !isSelected);
    });
}

function displayStats(statsObject, container, emptyMessage, isClickable = false) {
    // ... (Cette fonction reste inchangée)
    if (!container) return;
    container.innerHTML = "";
    const sortedEntries = Object.entries(statsObject).sort(([, a], [, b]) => b - a);
    if (sortedEntries.length === 0) {
        container.innerHTML = `<p class="text-center text-gray-500">${emptyMessage}</p>`;
        return;
    }
    sortedEntries.forEach(([name, totalMs]) => {
        const div = document.createElement('div');
        div.className = 'flex justify-between items-center text-sm p-2 border-b';
        if (isClickable) {
            div.innerHTML = `<button class="font-medium text-blue-600 hover:underline text-left">${name}</button><span class="font-bold text-purple-700">${formatMilliseconds(totalMs)}</span>`;
            div.querySelector('button').onclick = () => navigateTo('admin-chantier-details', { chantierName: name });
        } else {
            div.innerHTML = `<span class="font-medium">${name}</span><span class="font-bold text-purple-700">${formatMilliseconds(totalMs)}</span>`;
        }
        container.appendChild(div);
    });
}

async function loadRecentActivity() {
    // ... (Cette fonction reste inchangée)
    const container = document.getElementById('recent-activity-list');
    if (!container) return;
    try {
        const q = query(collection(db, "pointages"), orderBy("createdAt", "desc"), where("createdAt", "!=", null));
        const querySnapshot = await getDocs(q);
        container.innerHTML = "";
        if (querySnapshot.empty) { container.innerHTML = "<p class='text-center text-gray-500'>Aucune activité récente.</p>"; return; }
        querySnapshot.docs.slice(0, 5).forEach(doc => container.appendChild(createDetailedActivityElement(doc.id, doc.data())));
    } catch (error) {
        console.error("Erreur de chargement de l'activité récente:", error);
        container.innerHTML = "<p class='text-red-500 text-center'>Erreur de chargement.</p>";
    }
}

function createDetailedActivityElement(docId, d) {
    // ... (Cette fonction reste inchangée)
    const wrapper = document.createElement("div");
    wrapper.className = "p-4 border rounded-lg bg-white relative shadow-sm space-y-1";
    const startDate = new Date(d.timestamp);
    const endDate = d.endTime ? new Date(d.endTime) : null;
    let timeDisplay = "", durationDisplay = "";
    if (endDate) {
        timeDisplay = `<div>De ${startDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} à ${endDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>`;
        durationDisplay = `<div class="text-sm text-gray-600">Durée : ${formatMilliseconds(endDate - startDate)}</div>`;
    } else {
        timeDisplay = `<div>Débuté à ${startDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} (en cours)</div>`;
    }
    wrapper.innerHTML = `<div class="text-xs text-blue-600 font-semibold">${d.userName || 'Utilisateur inconnu'}</div><div class="font-bold text-lg">${d.chantier}</div><div>${startDate.toLocaleDateString('fr-FR')}</div>${timeDisplay}${durationDisplay}<div class="mt-2"><strong>Collègues :</strong> ${(d.colleagues || []).join(", ")}</div>${d.notes ? `<div class="mt-1 pt-2 border-t text-sm"><strong>Notes :</strong> ${d.notes}</div>` : ""}`;
    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "✖";
    deleteBtn.className = "absolute top-2 right-3 text-gray-400 hover:text-red-600 font-bold";
    deleteBtn.onclick = async () => { if (await showConfirmationModal("Confirmation", "Supprimer ce pointage ?")) { await deleteDoc(doc(db, "pointages", docId)); render(); } };
    wrapper.appendChild(deleteBtn);
    return wrapper;
}