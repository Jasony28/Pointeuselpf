import { collection, query, where, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent } from "../app.js";
import { getWeekDateRange, formatMilliseconds } from "./utils.js";
import { isStealthMode } from "../app.js";
import { getUsers } from "./data-service.js";

let filter = { period: 'week', offset: 0 };

export async function render() {
    pageContent.innerHTML = `
        <div class="max-w-4xl mx-auto">
            <h2 class="text-2xl font-bold mb-4">📄 Rapport d'Heures Global</h2>
            
            <div class="p-4 rounded-lg shadow-sm" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                <div class="flex flex-col md:flex-row justify-between items-center gap-4 mb-4">
                    <div class="flex items-center gap-1 p-1 rounded-lg text-sm" style="background-color: var(--color-background);">
                        <button data-period="week" class="filter-btn px-4 py-2 rounded-md">Semaine</button>
                        <button data-period="month" class="filter-btn px-4 py-2 rounded-md">Mois</button>
                        <button data-period="year" class="filter-btn px-4 py-2 rounded-md">Année</button>
                    </div>
                    <div class="flex items-center gap-2">
                        <button id="prev-btn" class="px-4 py-2 rounded-lg" style="background-color: var(--color-background);">&lt;</button>
                        <div id="period-display" class="text-center font-semibold text-lg min-w-[250px]"></div>
                        <button id="next-btn" class="px-4 py-2 rounded-lg" style="background-color: var(--color-background);">&gt;</button>
                    </div>
                </div>

                <div class="overflow-x-auto">
                    <table class="w-full text-left">
                        <thead id="report-header"></thead>
                        <tbody id="report-body">
                            <tr><td colspan="4" class="p-4 text-center">Chargement...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
    setTimeout(() => {
        setupEventListeners();
        loadReport();
    }, 0);
}

function setupEventListeners() {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.onclick = () => {
            filter.period = btn.dataset.period;
            filter.offset = 0;
            loadReport();
        };
    });
    document.getElementById('prev-btn').onclick = () => { filter.offset--; loadReport(); };
    document.getElementById('next-btn').onclick = () => { filter.offset++; loadReport(); };
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
            displayText = `Semaine du ${startDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`;
            break;
    }
    return { startDate, endDate, displayText };
}

async function loadReport() {
    const periodInfo = getPeriodInfo(filter);
    
    document.getElementById('period-display').textContent = periodInfo.displayText;
    document.querySelectorAll('.filter-btn').forEach(btn => {
        const isSelected = btn.dataset.period === filter.period;
        btn.classList.toggle('bg-white', isSelected);
        btn.classList.toggle('shadow', isSelected);
    });

    const reportHeader = document.getElementById('report-header');
    const reportBody = document.getElementById('report-body');
    reportBody.innerHTML = `<tr><td colspan="4" class="p-4 text-center">Chargement...</td></tr>`;

    try {
        const allUsers = await getUsers();
        const approvedUsers = allUsers.filter(user => user.status === "approved");
        const hoursByUid = new Map();
        approvedUsers.forEach(user => hoursByUid.set(user.uid, 0));

        const pointagesQuery = query(collection(db, "pointages"),
            where("timestamp", ">=", periodInfo.startDate.toISOString()),
            where("timestamp", "<=", periodInfo.endDate.toISOString())
        );
        const pointagesSnapshot = await getDocs(pointagesQuery);

        pointagesSnapshot.forEach(doc => {
            const pointage = doc.data();
            if (pointage.endTime && hoursByUid.has(pointage.uid)) {
                const durationMs = (new Date(pointage.endTime) - new Date(pointage.timestamp)) - (pointage.pauseDurationMs || 0);
                hoursByUid.set(pointage.uid, hoursByUid.get(pointage.uid) + durationMs);
            }
        });

        reportBody.innerHTML = '';
        if (approvedUsers.length === 0) {
            reportBody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-gray-500">Aucun employé approuvé trouvé.</td></tr>`;
            return;
        }

        if (isStealthMode()) {
            reportHeader.innerHTML = `
                <tr class="border-b">
                    <th class="p-2">Employé</th>
                    <th class="p-2">Heures Prestées (Réel)</th>
                </tr>
            `;
            approvedUsers.forEach(user => {
                const totalMs = hoursByUid.get(user.uid) || 0;
                const row = document.createElement('tr');
                row.className = 'border-b';
                row.innerHTML = `
                    <td class="p-2">${user.displayName}</td>
                    <td class="p-2 font-semibold text-purple-700">${formatMilliseconds(totalMs)}</td>
                `;
                reportBody.appendChild(row);
            });
        } else {
            reportHeader.innerHTML = `
                <tr class="border-b">
                    <th class="p-2">Employé</th>
                    <th class="p-2 text-center">Heures Contrat</th>
                    <th class="p-2 text-center">Heures Prestées</th>
                    <th class="p-2 text-center">Solde (+/-)</th>
                </tr>
            `;
            approvedUsers.forEach(user => {
                const totalMs = hoursByUid.get(user.uid) || 0;
                const weeklyContractHours = user.contractHours || 0;
                
                let periodContractMs = 0;
                if (weeklyContractHours > 0) {
                    switch (filter.period) {
                        case 'month': periodContractMs = weeklyContractHours * 4.33 * 3600000; break;
                        case 'year': periodContractMs = weeklyContractHours * 52 * 3600000; break;
                        default: periodContractMs = weeklyContractHours * 3600000; break;
                    }
                }

                let balanceMs = totalMs - periodContractMs;
                let displayedTotalMs = totalMs;

                if (weeklyContractHours === 12) {
                    displayedTotalMs = Math.min(totalMs, periodContractMs);
                    balanceMs = Math.min(0, balanceMs);
                }

                let balanceClass = 'text-gray-700';
                let balanceText = '0h 0min';

                if (balanceMs > 0) {
                    balanceClass = 'text-green-600 font-bold';
                    balanceText = `+${formatMilliseconds(balanceMs)}`;
                } else if (balanceMs < 0) {
                    balanceClass = 'text-red-600';
                    balanceText = `-${formatMilliseconds(Math.abs(balanceMs))}`;
                }

                const row = document.createElement('tr');
                row.className = 'border-b';
                row.innerHTML = `
                    <td class="p-2 font-medium">${user.displayName}</td>
                    <td class="p-2 text-center">${formatMilliseconds(periodContractMs)}</td>
                    <td class="p-2 text-center font-semibold">${formatMilliseconds(displayedTotalMs)}</td>
                    <td class="p-2 text-center ${balanceClass}">${balanceText}</td>
                `;
                reportBody.appendChild(row);
            });
        }
    } catch (error) {
        console.error("Erreur de chargement du rapport d'heures:", error);
        reportBody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-red-500">Erreur de chargement du rapport.</td></tr>`;
    }
}

