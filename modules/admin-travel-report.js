import { collection, query, getDocs, orderBy, where } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent } from "../app.js";
import { getWeekDateRange } from "./utils.js";

let currentFilter = 'month'; // 'week', 'month', or 'year'
let currentOffset = 0; // Pour la navigation par semaine/mois/année

function formatMinutes(totalMinutes) {
    if (!totalMinutes || totalMinutes < 0) return "0h 0min";
    const hours = Math.floor(totalMinutes / 60);
    const minutes = Math.round(totalMinutes % 60);
    return `${hours}h ${minutes}min`;
}

export async function render() {
    pageContent.innerHTML = `
        <div class="max-w-5xl mx-auto">
            <h2 class="text-2xl font-bold mb-4">🚗 Rapport des Trajets</h2>
            <div class="bg-white p-4 rounded-lg shadow-sm">
                <div class="flex flex-col sm:flex-row justify-between items-center gap-4 mb-4">
                    <div id="filter-buttons" class="flex items-center justify-center gap-2 p-1 bg-gray-100 rounded-lg">
                        <button data-filter="week" class="filter-btn px-4 py-2 text-sm rounded-md">Semaine</button>
                        <button data-filter="month" class="filter-btn px-4 py-2 text-sm rounded-md">Mois</button>
                        <button data-filter="year" class="filter-btn px-4 py-2 text-sm rounded-md">Année</button>
                    </div>
                    <div id="nav-controls" class="flex items-center gap-2">
                        <button id="prevBtn" class="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg">&lt;</button>
                        <div id="currentPeriodDisplay" class="text-center font-semibold text-lg min-w-[250px]"></div>
                        <button id="nextBtn" class="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg">&gt;</button>
                    </div>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-left">
                        <thead>
                            <tr class="border-b">
                                <th class="p-2">Employé</th>
                                <th id="km-header" class="p-2">Total Kilomètres</th>
                                <th id="time-header" class="p-2">Temps de Trajet total</th>
                            </tr>
                        </thead>
                        <tbody id="report-body">
                            <tr><td colspan="3" class="p-4 text-center">Chargement...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
    setTimeout(() => {
        document.getElementById('filter-buttons').addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON') {
                currentFilter = e.target.dataset.filter;
                currentOffset = 0; // Reset offset when changing filter type
                loadTravelReportForPeriod();
            }
        });
        document.getElementById("prevBtn").onclick = () => { currentOffset--; loadTravelReportForPeriod(); };
        document.getElementById("nextBtn").onclick = () => { currentOffset++; loadTravelReportForPeriod(); };
        loadTravelReportForPeriod();
    }, 0);
}

async function loadTravelReportForPeriod() {
    const reportBody = document.getElementById('report-body');
    const kmHeader = document.getElementById('km-header');
    const timeHeader = document.getElementById('time-header');
    const currentPeriodDisplay = document.getElementById('currentPeriodDisplay');
    
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('bg-white', btn.dataset.filter === currentFilter);
        btn.classList.toggle('shadow', btn.dataset.filter === currentFilter);
    });

    reportBody.innerHTML = `<tr><td colspan="3" class="p-4 text-center">Chargement...</td></tr>`;

    const now = new Date();
    let startDate, endDate, periodText;

    switch (currentFilter) {
        case 'year':
            const year = now.getFullYear() + currentOffset;
            startDate = new Date(Date.UTC(year, 0, 1));
            endDate = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
            periodText = `Année ${year}`;
            break;
        case 'month':
            const dateForMonth = new Date(now.getFullYear(), now.getMonth() + currentOffset, 1);
            startDate = new Date(Date.UTC(dateForMonth.getFullYear(), dateForMonth.getMonth(), 1));
            endDate = new Date(Date.UTC(dateForMonth.getFullYear(), dateForMonth.getMonth() + 1, 0, 23, 59, 59, 999));
            periodText = dateForMonth.toLocaleString('fr-FR', { month: 'long', year: 'numeric' });
            break;
        case 'week':
        default:
            const weekRange = getWeekDateRange(currentOffset);
            startDate = weekRange.startOfWeek;
            endDate = weekRange.endOfWeek;
            periodText = `Semaine du ${startDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`;
            break;
    }

    currentPeriodDisplay.textContent = periodText;
    kmHeader.textContent = `Total Kilomètres (${periodText})`;
    timeHeader.textContent = `Temps de Trajet total (${periodText})`;

    try {
        const usersSnapshot = await getDocs(query(collection(db, "users"), orderBy("displayName")));
        const users = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const trajetsQuery = query(collection(db, "trajets"), 
            where("date_creation", ">=", startDate),
            where("date_creation", "<=", endDate)
        );
        const trajetsSnapshot = await getDocs(trajetsQuery);

        const travelByUser = {};
        trajetsSnapshot.forEach(doc => {
            const trajet = doc.data();
            if (!travelByUser[trajet.id_utilisateur]) {
                travelByUser[trajet.id_utilisateur] = { km: 0, min: 0 };
            }
            travelByUser[trajet.id_utilisateur].km += trajet.distance_km || 0;
            travelByUser[trajet.id_utilisateur].min += trajet.duree_min || 0;
        });

        if (users.length === 0) {
            reportBody.innerHTML = `<tr><td colspan="3" class="p-4 text-center text-gray-500">Aucun utilisateur trouvé.</td></tr>`;
            return;
        }

        reportBody.innerHTML = '';
        users.forEach(user => {
            const travelData = travelByUser[user.uid] || { km: 0, min: 0 };
            const row = document.createElement('tr');
            row.className = 'border-b';
            row.innerHTML = `
                <td class="p-2">${user.displayName}</td>
                <td class="p-2 font-semibold">${travelData.km.toFixed(2)} km</td>
                <td class="p-2 font-semibold">${formatMinutes(travelData.min)}</td>
            `;
            reportBody.appendChild(row);
        });
    } catch (error) {
        console.error("Erreur de chargement du rapport de trajets:", error);
        reportBody.innerHTML = `<tr><td colspan="3" class="p-4 text-center text-red-500">Erreur de chargement.</td></tr>`;
    }
}
