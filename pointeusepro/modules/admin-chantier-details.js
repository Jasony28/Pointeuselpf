import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent, navigateTo } from "../app.js";

let currentChantierName = null;
let currentFilter = 'month'; // Filtre par défaut au chargement

/**
 * Affiche la page de détails pour un chantier spécifique.
 */
export async function render(params = {}) {
    if (!params.chantierName) {
        pageContent.innerHTML = `<p class="text-red-500 text-center">Erreur: Nom du chantier non spécifié.</p>`;
        return;
    }
    currentChantierName = params.chantierName;

    pageContent.innerHTML = `
        <div class="max-w-4xl mx-auto">
            <button id="back-to-dashboard" class="text-blue-600 hover:underline mb-4">&larr; Retour au tableau de bord</button>
            <h2 class="text-2xl font-bold mb-4">Détails pour le chantier : <span class="text-purple-700">${currentChantierName}</span></h2>
            
            <div class="bg-white p-4 rounded-lg shadow-sm mb-4">
                <div class="flex items-center justify-center gap-2" id="filter-buttons">
                    <button data-filter="week" class="px-4 py-2 text-sm font-medium rounded-md">Cette Semaine</button>
                    <button data-filter="month" class="px-4 py-2 text-sm font-medium rounded-md">Ce Mois</button>
                    <button data-filter="year" class="px-4 py-2 text-sm font-medium rounded-md">Cette Année</button>
                </div>
            </div>

            <div class="bg-white p-6 rounded-lg shadow-sm">
                <div id="total-hours-display" class="text-center mb-4"></div>
                <div id="details-list" class="space-y-3">
                    <p class="text-center text-gray-500">Chargement des détails...</p>
                </div>
            </div>
        </div>
    `;

    document.getElementById('back-to-dashboard').onclick = () => navigateTo('admin-dashboard');
    document.getElementById('filter-buttons').addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            currentFilter = e.target.dataset.filter;
            loadChantierDetails();
        }
    });

    loadChantierDetails();
}

/**
 * Charge et affiche les heures pointées sur le chantier pour la période sélectionnée.
 */
async function loadChantierDetails() {
    const listContainer = document.getElementById('details-list');
    const totalContainer = document.getElementById('total-hours-display');
    const filterButtons = document.getElementById('filter-buttons');
    listContainer.innerHTML = `<p class="text-center text-gray-500">Chargement des détails...</p>`;
    totalContainer.innerHTML = '';

    // Met à jour le style du bouton de filtre actif
    filterButtons.querySelectorAll('button').forEach(btn => {
        btn.classList.toggle('bg-purple-600', btn.dataset.filter === currentFilter);
        btn.classList.toggle('text-white', btn.dataset.filter === currentFilter);
        btn.classList.toggle('bg-gray-200', btn.dataset.filter !== currentFilter);
    });

    const now = new Date();
    let startDate;
    let periodText = "";

    switch (currentFilter) {
        case 'week':
            const dayOfWeek = now.getDay();
            const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
            startDate = new Date(now.setDate(diff));
            startDate.setHours(0, 0, 0, 0);
            periodText = "cette semaine";
            break;
        case 'year':
            startDate = new Date(now.getFullYear(), 0, 1);
            periodText = "cette année";
            break;
        case 'month':
        default:
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            periodText = "ce mois-ci";
            break;
    }

    const q = query(
        collection(db, "pointages"),
        where("chantier", "==", currentChantierName),
        where("timestamp", ">=", startDate.toISOString())
    );

    const querySnapshot = await getDocs(q);
    const userHours = {};
    let totalMs = 0;

    querySnapshot.forEach(doc => {
        const data = doc.data();
        if (data.endTime) {
            const durationMs = new Date(data.endTime) - new Date(data.timestamp);
            userHours[data.userName] = (userHours[data.userName] || 0) + durationMs;
            totalMs += durationMs;
        }
    });

    totalContainer.innerHTML = `<h3 class="text-xl font-bold">Total ${periodText} : <span class="text-purple-700">${formatMilliseconds(totalMs)}</span></h3>`;

    listContainer.innerHTML = "";
    const sortedUsers = Object.entries(userHours).sort(([, a], [, b]) => b - a);

    if (sortedUsers.length === 0) {
        listContainer.innerHTML = `<p class="text-center text-gray-500">Aucun pointage pour ce chantier sur la période sélectionnée.</p>`;
        return;
    }

    sortedUsers.forEach(([name, ms]) => {
        const div = document.createElement('div');
        div.className = 'flex justify-between items-center text-sm p-2 border-b';
        div.innerHTML = `
            <span class="font-medium">${name}</span>
            <span class="font-bold">${formatMilliseconds(ms)}</span>
        `;
        listContainer.appendChild(div);
    });
}

function formatMilliseconds(ms) {
    if (!ms || ms < 0) return "0h 0min";
    const totalHours = Math.floor(ms / 3600000);
    const totalMinutes = Math.round((ms % 3600000) / 60000);
    return `${totalHours}h ${totalMinutes}min`;
}
