import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent, navigateTo } from "../app.js";
import { getWeekDateRange, formatMilliseconds } from "./utils.js";

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
        <div class="max-w-4xl mx-auto space-y-6">
            <button id="back-to-dashboard" class="link font-semibold">&larr; Retour au tableau de bord</button>

            <div>
                <p class="kpi-label">Détail du chantier</p>
                <h2 class="text-2xl font-bold" style="color: var(--color-text-base);">${currentChantierName}</h2>
            </div>
            
            <div class="segmented" id="filter-buttons" role="group" aria-label="Période">
                <button data-filter="week"></button>
                <button data-filter="month"></button>
                <button data-filter="year"></button>
            </div>

            <div class="p-6 rounded-lg shadow-sm" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                <div id="total-hours-display" class="text-center mb-4"></div>
                <div id="details-list" class="space-y-3">
                    <p class="text-center" style="color: var(--color-text-muted);">Chargement des détails...</p>
                </div>
            </div>
        </div>
    `;

    setTimeout(() => {
        document.getElementById('back-to-dashboard').onclick = () => navigateTo('admin-dashboard');
        document.getElementById('filter-buttons').addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON') {
                currentFilter = e.target.dataset.filter;
                loadChantierDetails();
            }
        });

        // Initialisation des textes des boutons
        const buttons = document.getElementById('filter-buttons').querySelectorAll('button');
        buttons[0].textContent = "Cette semaine";
        buttons[1].textContent = "Ce mois";
        buttons[2].textContent = "Cette année";

        loadChantierDetails();
    }, 0);
}

/**
 * Charge et affiche les heures pointées sur le chantier pour la période sélectionnée.
 */
async function loadChantierDetails() {
    const listContainer = document.getElementById('details-list');
    const totalContainer = document.getElementById('total-hours-display');
    const filterButtons = document.getElementById('filter-buttons');
    listContainer.innerHTML = `<p class="text-center" style="color: var(--color-text-muted);">Chargement des détails...</p>`;
    totalContainer.innerHTML = '';

    // Met à jour le style du bouton de filtre actif en utilisant les variables de thème
    filterButtons.querySelectorAll('button').forEach(btn => {
        const isActive = btn.dataset.filter === currentFilter;
        btn.classList.toggle('is-active', isActive);
        btn.setAttribute('aria-pressed', String(isActive));
    });

    const now = new Date();
    let startDate;
    let periodText = "";

    switch (currentFilter) {
        case 'week':
            startDate = getWeekDateRange(0).startOfWeek;
            periodText = "cette semaine";
            break;
        case 'year':
            startDate = new Date(Date.UTC(now.getFullYear(), 0, 1));
            periodText = "cette année";
            break;
        case 'month':
        default:
            startDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
            periodText = "ce mois-ci";
            break;
    }

    try {
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
                const durationMs = (new Date(data.endTime) - new Date(data.timestamp)) - (data.pauseDurationMs || 0);
                userHours[data.userName] = (userHours[data.userName] || 0) + durationMs;
                totalMs += durationMs;
            }
        });

        totalContainer.innerHTML = `<h3 class="text-xl font-bold" style="color: var(--color-text-base);">Total ${periodText} : <span style="color: var(--color-primary);">${formatMilliseconds(totalMs)}</span></h3>`;

        listContainer.innerHTML = "";
        const sortedUsers = Object.entries(userHours).sort(([, a], [, b]) => b - a);

        if (sortedUsers.length === 0) {
            listContainer.innerHTML = `<p class="text-center" style="color: var(--color-text-muted);">Aucun pointage pour ce chantier sur la période sélectionnée.</p>`;
            return;
        }

        sortedUsers.forEach(([name, ms]) => {
            const div = document.createElement('div');
            div.className = 'info-row';
            div.innerHTML = `
                <span>${name}</span>
                <strong class="tabular-nums" style="color: var(--color-primary);">${formatMilliseconds(ms)}</strong>
            `;
            listContainer.appendChild(div);
        });
    } catch (error) {
        console.error("Erreur de chargement des détails du chantier:", error);
        listContainer.innerHTML = `<p class="text-center text-red-500">Erreur de chargement.</p>`;
    }
}