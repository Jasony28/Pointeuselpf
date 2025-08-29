import { collection, query, where, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent, showInfoModal } from "../app.js";
// CORRECTION: Import de la fonction utilitaire pour la gestion des dates.
import { getWeekDateRange } from "./utils.js";

// Variables pour les graphiques et les données
let chantierChart = null;
let userChart = null;
let evolutionChart = null;
let pointagesCache = [];
let usersCache = [];
let chantiersCache = [];
let currentStats = {}; // Pour stocker les dernières statistiques calculées

export async function render() {
    pageContent.innerHTML = `
        <div class="max-w-7xl mx-auto space-y-6">
            <div class="bg-white p-4 rounded-lg shadow-sm">
                <div class="flex flex-wrap justify-between items-center gap-4 mb-4">
                    <h2 class="text-3xl font-bold text-gray-800">📊 Tableau de Bord Analytique</h2>
                    <div class="flex items-center gap-2 p-1 bg-gray-100 rounded-lg">
                        <button data-filter="week" class="filter-btn px-3 py-1 text-sm rounded-md bg-white shadow">Semaine</button>
                        <button data-filter="month" class="filter-btn px-3 py-1 text-sm rounded-md">Mois</button>
                        <button data-filter="year" class="filter-btn px-3 py-1 text-sm rounded-md">Année</button>
                    </div>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 border-t pt-4">
                    <div>
                        <label class="text-sm font-medium">Filtrer par employé</label>
                        <select id="user-filter" class="w-full border p-2 rounded mt-1"><option value="all">Tous les employés</option></select>
                    </div>
                    <div>
                        <label class="text-sm font-medium">Filtrer par chantier</label>
                        <select id="chantier-filter" class="w-full border p-2 rounded mt-1"><option value="all">Tous les chantiers</option></select>
                    </div>
                    <div>
                        <label class="text-sm font-medium">Plage de dates personnalisée</label>
                        <div class="flex gap-2 mt-1">
                            <input type="date" id="start-date-filter" class="w-full border p-2 rounded">
                            <input type="date" id="end-date-filter" class="w-full border p-2 rounded">
                        </div>
                    </div>
                </div>
            </div>

            <div id="kpi-container" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"></div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div class="bg-white p-6 rounded-lg shadow-sm"><h3 class="text-xl font-semibold mb-4">Évolution des Heures</h3><canvas id="evolutionLineChart"></canvas></div>
                <div class="bg-white p-6 rounded-lg shadow-sm"><h3 class="text-xl font-semibold mb-4">Répartition par Chantier</h3><canvas id="chantierPieChart"></canvas></div>
            </div>
            <div class="bg-white p-6 rounded-lg shadow-sm"><h3 class="text-xl font-semibold mb-4">Heures par Employé</h3><canvas id="userBarChart"></canvas></div>

            <div class="bg-white p-6 rounded-lg shadow-sm">
                <h3 class="text-xl font-semibold mb-4">💰 Analyse de Rentabilité par Chantier</h3>
                <div id="profitability-list" class="space-y-3"></div>
            </div>
            
            <div class="bg-white p-4 rounded-lg shadow-sm text-right">
                <button id="exportPdfBtn" class="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg">Exporter en PDF</button>
            </div>
        </div>
    `;
setTimeout(async () => {
    await cacheInitialData();
    setupEventListeners();
    await loadDataForPeriod('week');
    }, 0);
}

async function cacheInitialData() {
    try {
        const usersSnapshot = await getDocs(query(collection(db, "users"), orderBy("displayName")));
        usersCache = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const userFilter = document.getElementById('user-filter');
        userFilter.innerHTML = '<option value="all">Tous les employés</option>';
        usersCache.forEach(user => userFilter.innerHTML += `<option value="${user.uid}">${user.displayName}</option>`);

        const chantiersSnapshot = await getDocs(query(collection(db, "chantiers"), orderBy("name")));
        chantiersCache = chantiersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const chantierFilter = document.getElementById('chantier-filter');
        chantierFilter.innerHTML = '<option value="all">Tous les chantiers</option>';
        chantiersCache.forEach(c => chantierFilter.innerHTML += `<option value="${c.name}">${c.name}</option>`);
    } catch (error) {
        console.error("Erreur de chargement des données initiales:", error);
    }
}

function setupEventListeners() {
    const refreshData = () => {
        const activeFilterBtn = document.querySelector('.filter-btn.bg-white');
        loadDataForPeriod(activeFilterBtn ? activeFilterBtn.dataset.filter : null);
    };

    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('bg-white', 'shadow'));
            btn.classList.add('bg-white', 'shadow');
            document.getElementById('start-date-filter').value = '';
            document.getElementById('end-date-filter').value = '';
            loadDataForPeriod(btn.dataset.filter);
        };
    });
    
    document.getElementById('user-filter').onchange = refreshData;
    document.getElementById('chantier-filter').onchange = refreshData;
    document.getElementById('start-date-filter').onchange = refreshData;
    document.getElementById('end-date-filter').onchange = refreshData;
    document.getElementById('exportPdfBtn').onclick = exportToPDF;
}

async function loadDataForPeriod(period) {
    document.getElementById('kpi-container').innerHTML = `<div class="col-span-full text-center p-4">Chargement des données...</div>`;
    
    let startDate, endDate;
    const customStart = document.getElementById('start-date-filter').value;
    const customEnd = document.getElementById('end-date-filter').value;

    if (customStart && customEnd) {
        startDate = new Date(customStart);
        endDate = new Date(customEnd);
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('bg-white', 'shadow'));
    } else {
        const now = new Date();
        switch (period) {
            case 'year':
                startDate = new Date(Date.UTC(now.getFullYear(), 0, 1));
                endDate = new Date(Date.UTC(now.getFullYear(), 11, 31, 23, 59, 59, 999));
                break;
            case 'month':
                startDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
                endDate = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999));
                break;
            case 'week':
            default:
                // CORRECTION: Utilise la fonction centralisée pour obtenir une plage de semaine UTC cohérente.
                const weekRange = getWeekDateRange(0);
                startDate = weekRange.startOfWeek;
                endDate = weekRange.endOfWeek;
                break;
        }
    }

    const selectedUserId = document.getElementById('user-filter').value;
    const selectedChantier = document.getElementById('chantier-filter').value;
    
    const queryConstraints = [
        where("timestamp", ">=", startDate.toISOString()),
        where("timestamp", "<=", endDate.toISOString())
    ];
    if (selectedUserId !== 'all') queryConstraints.push(where("uid", "==", selectedUserId));
    if (selectedChantier !== 'all') queryConstraints.push(where("chantier", "==", selectedChantier));

    const q = query(collection(db, "pointages"), ...queryConstraints);

    try {
        const pointagesSnapshot = await getDocs(q);
        pointagesCache = [];
        const stats = {
            hoursByChantier: {}, hoursByUser: {}, totalHours: 0, totalCost: 0,
            hoursByDay: {}, costByChantier: {}
        };

        pointagesSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.endTime) {
                const durationMs = new Date(data.endTime) - new Date(data.timestamp);
                const durationHours = durationMs / 3600000;
                const user = usersCache.find(u => u.uid === data.uid);
                const cost = durationHours * (user?.tauxHoraire || 0);

                stats.totalHours += durationHours;
                stats.totalCost += cost;
                stats.hoursByChantier[data.chantier] = (stats.hoursByChantier[data.chantier] || 0) + durationHours;
                stats.hoursByUser[data.userName] = (stats.hoursByUser[data.userName] || 0) + durationHours;
                stats.costByChantier[data.chantier] = (stats.costByChantier[data.chantier] || 0) + cost;

                const day = new Date(data.timestamp).toISOString().split('T')[0];
                stats.hoursByDay[day] = (stats.hoursByDay[day] || 0) + durationHours;
                
                pointagesCache.push({
                    user: data.userName,
                    chantier: data.chantier,
                    date: new Date(data.timestamp).toLocaleDateString('fr-FR'),
                    heures: durationHours.toFixed(2),
                    cout: cost.toFixed(2)
                });
            }
        });

        currentStats = stats;
        updateKPIs(stats);
        updateCharts(stats);
        displayProfitabilityList(stats);
    } catch (error) {
        console.error("Erreur de chargement des données de la période:", error);
        document.getElementById('kpi-container').innerHTML = `<div class="col-span-full text-center p-4 text-red-500">Erreur de chargement des données.</div>`;
    }
}

function updateKPIs(stats) {
    const topChantier = Object.entries(stats.hoursByChantier).sort((a, b) => b[1] - a[1])[0];
    const topUser = Object.entries(stats.hoursByUser).sort((a, b) => b[1] - a[1])[0];
    
    document.getElementById('kpi-container').innerHTML = `
        <div class="bg-white p-4 rounded-lg shadow-sm"><h3 class="text-sm font-medium text-gray-500">Heures Totales</h3><p id="kpi-total-hours" class="mt-1 text-3xl font-semibold">${stats.totalHours.toFixed(1)}h</p></div>
        <div class="bg-white p-4 rounded-lg shadow-sm"><h3 class="text-sm font-medium text-gray-500">Coût Total Main d'œuvre</h3><p id="kpi-total-cost" class="mt-1 text-3xl font-semibold">${stats.totalCost.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</p></div>
        <div class="bg-white p-4 rounded-lg shadow-sm"><h3 class="text-sm font-medium text-gray-500">Chantier Principal</h3><p class="mt-1 text-3xl font-semibold truncate">${topChantier ? topChantier[0] : 'N/A'}</p></div>
        <div class="bg-white p-4 rounded-lg shadow-sm"><h3 class="text-sm font-medium text-gray-500">Employé le plus actif</h3><p class="mt-1 text-3xl font-semibold truncate">${topUser ? topUser[0] : 'N/A'}</p></div>
    `;
}

function updateCharts(stats) {
    if (chantierChart) chantierChart.destroy();
    if (userChart) userChart.destroy();
    if (evolutionChart) evolutionChart.destroy();

    const evolutionCtx = document.getElementById('evolutionLineChart').getContext('2d');
    const evolutionData = Object.entries(stats.hoursByDay).sort((a, b) => a[0].localeCompare(b[0]));
    evolutionChart = new Chart(evolutionCtx, {
        type: 'line',
        data: {
            labels: evolutionData.map(item => new Date(item[0] + 'T12:00:00Z').toLocaleDateString('fr-FR', {day: '2-digit', month: '2-digit'})),
            datasets: [{
                label: 'Heures par jour',
                data: evolutionData.map(item => item[1]),
                borderColor: '#4F46E5', tension: 0.1, fill: true, backgroundColor: 'rgba(79, 70, 229, 0.1)'
            }]
        }
    });

    const chantierCtx = document.getElementById('chantierPieChart').getContext('2d');
    const chantierData = Object.entries(stats.hoursByChantier).sort((a,b) => b[1] - a[1]).slice(0, 7); // Limite aux 7 plus gros
    chantierChart = new Chart(chantierCtx, {
        type: 'doughnut',
        data: {
            labels: chantierData.map(item => item[0]),
            datasets: [{
                data: chantierData.map(item => item[1]),
                backgroundColor: ['#4F46E5', '#7C3AED', '#EC4899', '#F59E0B', '#10B981', '#3B82F6', '#6366F1'],
            }]
        },
        options: { responsive: true, maintainAspectRatio: true }
    });

    const userCtx = document.getElementById('userBarChart').getContext('2d');
    const userData = Object.entries(stats.hoursByUser).sort((a,b) => b[1] - a[1]);
    userChart = new Chart(userCtx, {
        type: 'bar',
        data: {
            labels: userData.map(item => item[0]),
            datasets: [{
                label: 'Heures travaillées',
                data: userData.map(item => item[1]),
                backgroundColor: '#7C3AED',
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
        }
    });
}

function displayProfitabilityList(stats) {
    const container = document.getElementById('profitability-list');
    container.innerHTML = '';
    const sortedChantiers = Object.entries(stats.costByChantier).sort((a, b) => b[1] - a[1]);

    if (sortedChantiers.length === 0) {
        container.innerHTML = `<p class="text-center text-gray-500">Aucune donnée de coût à afficher.</p>`;
        return;
    }

    sortedChantiers.forEach(([name, cost]) => {
        const chantier = chantiersCache.find(c => c.name === name);
        const revenue = (stats.hoursByChantier[name] || 0) * (chantier?.tauxFacturation || 0);
        const margin = revenue - cost;
        const color = margin >= 0 ? 'text-green-600' : 'text-red-600';

        const div = document.createElement('div');
        div.className = 'grid grid-cols-4 gap-4 items-center p-2 border-b';
        div.innerHTML = `
            <span class="font-medium col-span-1">${name}</span>
            <div><span class="text-xs text-gray-500">Coût M.O.</span><br>${cost.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</div>
            <div><span class="text-xs text-gray-500">Chiffre d'Affaires</span><br>${revenue.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</div>
            <div class="${color}"><span class="text-xs text-gray-500">Marge Brute</span><br>${margin.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</div>
        `;
        container.appendChild(div);
    });
}

function exportToPDF() {
    if (pointagesCache.length === 0) {
        showInfoModal("Information", "Aucune donnée à exporter pour la période sélectionnée.");
        return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    let periodText = "Période personnalisée";
    const activeFilter = document.querySelector('.filter-btn.bg-white');
    const startValue = document.getElementById('start-date-filter').value;
    const endValue = document.getElementById('end-date-filter').value;

    if (activeFilter) {
        periodText = activeFilter.textContent;
    } else if (startValue && endValue) {
        periodText = `Du ${new Date(startValue).toLocaleDateString('fr-FR')} au ${new Date(endValue).toLocaleDateString('fr-FR')}`;
    }
    
    const totalHours = currentStats.totalHours.toFixed(1) + 'h';
    const totalCost = currentStats.totalCost.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
    
    doc.setFontSize(18);
    doc.text("Rapport d'Activité", 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Période : ${periodText}`, 14, 30);
    doc.text(`Heures Totales : ${totalHours}`, 14, 36);
    doc.text(`Coût Total : ${totalCost}`, 14, 42);
    const tableColumn = ["Employé", "Chantier", "Date", "Heures", "Coût (€)"];
    const tableRows = pointagesCache.map(item => [item.user, item.chantier, item.date, item.heures, item.cout]);
    doc.autoTable({
        head: [tableColumn],
        body: tableRows,
        startY: 50,
        theme: 'grid',
        headStyles: { fillColor: [79, 70, 229] }
    });
    doc.save(`rapport_activite_${periodText.toLowerCase().replace(/\s/g, '_')}.pdf`);
}