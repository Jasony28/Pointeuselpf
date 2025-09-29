import { collection, query, where, orderBy, getDocs } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent, navigateTo } from "../app.js";
import { getWeekDateRange, formatMilliseconds } from "./utils.js";

let chantierName = '';
let currentFilter = 'week';
let allPointages = [];

export async function render(params = {}) {
    if (!params.chantierName) {
        navigateTo('admin-dashboard');
        return;
    }
    chantierName = params.chantierName;

    pageContent.innerHTML = `
        <div class="max-w-4xl mx-auto">
            <div class="mb-6">
                <a href="#" id="back-to-dashboard" class="text-sm hover:underline" style="color: var(--color-primary);">&larr; Retour au tableau de bord</a>
                <h2 class="text-3xl font-bold mt-2">Détails pour le chantier : <span style="color: var(--color-primary);">${chantierName}</span></h2>
            </div>

            <div class="flex justify-center mb-6">
                <div class="flex items-center gap-1 p-1 rounded-lg" style="background-color: var(--color-surface);">
                    <button data-period="week" class="period-filter-btn px-4 py-2 rounded-md text-sm font-semibold">Cette Semaine</button>
                    <button data-period="month" class="period-filter-btn px-4 py-2 rounded-md text-sm font-semibold">Ce Mois</button>
                    <button data-period="year" class="period-filter-btn px-4 py-2 rounded-md text-sm font-semibold">Cette Année</button>
                </div>
            </div>

            <div id="results-card" class="p-6 rounded-lg shadow-sm animate-pulse" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                 <div class="h-8 w-1/2 mx-auto rounded" style="background-color: var(--color-background);"></div>
                 <div class="mt-8 space-y-4">
                    <div class="h-6 w-full rounded" style="background-color: var(--color-background);"></div>
                    <div class="h-6 w-full rounded" style="background-color: var(--color-background);"></div>
                 </div>
            </div>
        </div>
    `;

    document.getElementById('back-to-dashboard').onclick = (e) => {
        e.preventDefault();
        navigateTo('admin-dashboard');
    };

    document.querySelectorAll('.period-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            currentFilter = btn.dataset.period;
            updateFilterButtons();
            displayResults();
        });
    });

    await fetchData();
    updateFilterButtons();
    displayResults();
}

async function fetchData() {
    const q = query(collection(db, "pointages"), where("chantier", "==", chantierName), orderBy("timestamp", "desc"));
    const querySnapshot = await getDocs(q);
    allPointages = querySnapshot.docs.map(doc => doc.data());
}

function updateFilterButtons() {
    document.querySelectorAll('.period-filter-btn').forEach(btn => {
        if (btn.dataset.period === currentFilter) {
            btn.style.backgroundColor = 'var(--color-primary)';
            btn.style.color = 'white';
            btn.classList.add('shadow-md');
        } else {
            btn.style.backgroundColor = 'transparent';
            btn.style.color = 'var(--color-text-base)';
            btn.classList.remove('shadow-md');
        }
    });
}

function displayResults() {
    const now = new Date();
    let startDate;

    if (currentFilter === 'week') {
        startDate = getWeekDateRange(0).startOfWeek;
    } else if (currentFilter === 'month') {
        startDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
    } else { // year
        startDate = new Date(Date.UTC(now.getFullYear(), 0, 1));
    }

    const filteredPointages = allPointages.filter(p => new Date(p.timestamp) >= startDate);
    
    const userHours = {};
    let totalMs = 0;

    filteredPointages.forEach(p => {
        if (p.endTime) {
            const durationMs = (new Date(p.endTime) - new Date(p.timestamp)) - (p.pauseDurationMs || 0);
            if (!userHours[p.userName]) {
                userHours[p.userName] = { totalMs: 0 };
            }
            userHours[p.userName].totalMs += durationMs;
            totalMs += durationMs;
        }
    });

    const sortedUsers = Object.entries(userHours).sort(([, a], [, b]) => b.totalMs - a.totalMs);

    const resultsCard = document.getElementById('results-card');
    resultsCard.classList.remove('animate-pulse');

    let userListHtml = '';
    if (sortedUsers.length > 0) {
        userListHtml = sortedUsers.map(([userName, data]) => `
            <div class="flex justify-between items-center py-3" style="border-bottom: 1px solid var(--color-border);">
                <span class="font-medium" style="color: var(--color-text-base);">${userName}</span>
                <span class="font-bold" style="color: var(--color-text-base);">${formatMilliseconds(data.totalMs)}</span>
            </div>
        `).join('');
    } else {
        userListHtml = `<p class="text-center py-8" style="color: var(--color-text-muted);">Aucun pointage pour cette période.</p>`;
    }

    resultsCard.innerHTML = `
        <div class="text-center">
            <h4 class="font-medium" style="color: var(--color-text-muted);">Total ${currentFilter === 'week' ? 'cette semaine' : (currentFilter === 'month' ? 'ce mois' : 'cette année')}</h4>
            <p class="text-4xl font-bold mt-1" style="color: var(--color-primary);">${formatMilliseconds(totalMs)}</p>
        </div>
        <div class="mt-6">
            ${userListHtml}
        </div>
    `;
}