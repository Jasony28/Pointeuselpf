/*
 Fichier: modules/user-stats.js
 Description: Page de statistiques utilisateur simplifiée, affichant les données du mois sélectionné.
*/
import { collection, query, where, getDocs, orderBy, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, currentUser, pageContent } from "../app.js";

// Garde en mémoire le mois actuellement affiché (0 = mois en cours, -1 = mois dernier, etc.)
let currentMonthOffset = 0;

/**
 * Point d'entrée principal pour le rendu de la page.
 */
export async function render() {
    pageContent.innerHTML = `
        <div class="max-w-4xl mx-auto space-y-6">
            <div class="flex justify-between items-center">
                <h1 class="text-2xl font-bold">📊 Mes Statistiques</h1>
                
                <div class="flex items-center gap-2">
                    <button id="stats-prev-month" class="px-3 py-1 rounded-lg hover:opacity-80" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">&lt;</button>
                    <span id="stats-month-display" class="font-semibold text-lg w-32 text-center"></span>
                    <button id="stats-next-month" class="px-3 py-1 rounded-lg hover:opacity-80" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">&gt;</button>
                </div>
            </div>

            <div id="stats-loader" class="text-center p-8">
                <svg class="animate-spin h-8 w-8 mx-auto" style="color: var(--color-primary);" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p class="mt-2" style="color: var(--color-text-muted);">Chargement des statistiques...</p>
            </div>

            <div id="stats-content" class="hidden space-y-6">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="p-4 rounded-lg shadow" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                        <div class="text-sm font-medium" style="color: var(--color-text-muted);">Total Heures (Mois)</div>
                        <div id="stats-total-hours" class="text-3xl font-bold mt-1"></div>
                    </div>
                    
                    <div id="stats-balance-card" class="p-4 rounded-lg shadow" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                        <div id="stats-balance-title" class="text-sm font-medium">Solde (Mois)</div>
                        <div id="stats-balance-hours" class="text-3xl font-bold mt-1"></div>
                    </div>
                </div>

                <div class="p-4 rounded-lg shadow" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                    <div class="flex justify-between items-center mb-3">
                        <h2 class="text-lg font-bold">Top 5 Chantiers (Mois)</h2>
                    </div>
                    <ul id="stats-top5-list" class="space-y-2">
                        </ul>
                </div>
            </div>
        </div>
    `;

    // Attacher les écouteurs d'événements
    document.getElementById('stats-prev-month').onclick = () => {
        currentMonthOffset--;
        loadMonthlyStats();
    };
    document.getElementById('stats-next-month').onclick = () => {
        currentMonthOffset++;
        loadMonthlyStats();
    };

    // Charger les statistiques pour le mois en cours
    loadMonthlyStats();
}

/**
 * Charge, calcule et affiche toutes les statistiques pour le mois défini par currentMonthOffset.
 */
async function loadMonthlyStats() {
    toggleLoading(true);

    const { startDate, endDate, display } = getDateRangeForMonth(currentMonthOffset);
    
    document.getElementById('stats-month-display').textContent = display;
    document.getElementById('stats-next-month').disabled = currentMonthOffset >= 0;

    try {
        // 1. Récupérer le contrat HEBDOMADAIRE de l'utilisateur
        const userDoc = await getDoc(doc(db, "users", currentUser.uid));
        // Champ 'contractHours' (hebdo) défini dans admin-contracts.js
        const weeklyContractHours = userDoc.data()?.contractHours || 0;
        
        // 2. Calculer l'objectif mensuel moyen (base 52 semaines / 12 mois)
        const monthlyTargetHours = (weeklyContractHours * 52) / 12;

        // 3. Récupérer les pointages du mois
        const q = query(
            collection(db, "pointages"),
            where("uid", "==", currentUser.uid),
            where("endTime", "!=", null),
            where("timestamp", ">=", startDate.toISOString()),
            where("timestamp", "<=", endDate.toISOString())
        );
        const querySnapshot = await getDocs(q);
        
        let totalMs = 0;
        const chantierMap = new Map(); // Pour agréger les heures par chantier

        querySnapshot.forEach(doc => {
            const p = doc.data();
            const durationMs = (new Date(p.endTime) - new Date(p.timestamp)) - (p.pauseDurationMs || 0);
            
            if (durationMs > 0) {
                totalMs += durationMs;
                // Ajouter au total du chantier
                const currentMs = chantierMap.get(p.chantier) || 0;
                chantierMap.set(p.chantier, currentMs + durationMs);
            }
        });

        // 4. Calculer les totaux
        const totalMonthHours = totalMs / 3600000; // ms -> heures décimales
        const balanceHours = totalMonthHours - monthlyTargetHours;

        // 5. Préparer le Top 5
        const sortedChantiers = [...chantierMap.entries()]
            .sort((a, b) => b[1] - a[1]) // Tri décroissant
            .slice(0, 5); // Top 5

        // 6. Afficher les résultats
        renderSummary(totalMonthHours, monthlyTargetHours, balanceHours);
        renderTop5(sortedChantiers);

    } catch (error) {
        console.error("Erreur lors du chargement des statistiques:", error);
        pageContent.innerHTML += `<p class="text-red-500 text-center">Impossible de charger les statistiques.</p>`;
    } finally {
        toggleLoading(false);
    }
}

/**
 * Affiche/cache le loader principal et le contenu.
 */
function toggleLoading(isLoading) {
    const loader = document.getElementById('stats-loader');
    const content = document.getElementById('stats-content');
    if (loader) loader.style.display = isLoading ? 'block' : 'none';
    if (content) content.style.display = isLoading ? 'none' : 'block';
}

/**
 * Met à jour les cartes de résumé (Total et Solde).
 */
function renderSummary(totalHours, targetHours, balanceHours) {
    document.getElementById('stats-total-hours').textContent = formatDecimalHours(totalHours);
    
    const balanceCard = document.getElementById('stats-balance-card');
    const balanceTitle = document.getElementById('stats-balance-title');
    const balanceHoursEl = document.getElementById('stats-balance-hours');
    
    // Reset le style
    balanceCard.style.color = 'var(--color-text-base)'; 
    balanceCard.style.backgroundColor = 'var(--color-surface)';
    balanceTitle.style.color = 'var(--color-text-muted)';
    balanceHoursEl.style.color = 'var(--color-text-base)';

    if (targetHours === 0) {
        balanceTitle.textContent = 'Solde (Contrat N/D)';
        balanceHoursEl.textContent = '-';
    } else if (balanceHours >= 0) {
        balanceTitle.textContent = 'Heures Supp. (Mois)';
        balanceHoursEl.textContent = `+${formatDecimalHours(balanceHours)}`;
        // Style positif (vert)
        balanceTitle.style.color = 'rgb(34 197 94)';
        balanceHoursEl.style.color = 'rgb(34 197 94)';
    } else {
        balanceTitle.textContent = 'Heures Manquantes (Mois)';
        balanceHoursEl.textContent = formatDecimalHours(Math.abs(balanceHours));
        // Style négatif (orange)
        balanceTitle.style.color = 'rgb(249 115 22)';
        balanceHoursEl.style.color = 'rgb(249 115 22)';
    }
}

/**
 * Affiche la liste du Top 5 des chantiers.
 */
function renderTop5(sortedChantiers) {
    const listEl = document.getElementById('stats-top5-list');
    listEl.innerHTML = ''; // Vider la liste
    
    if (sortedChantiers.length === 0) {
        listEl.innerHTML = `<li class="text-sm" style="color: var(--color-text-muted);">Aucun pointage pour ce mois.</li>`;
        return;
    }

    const maxMs = sortedChantiers[0][1]; // Le premier item a le plus d'heures

    sortedChantiers.forEach(([name, ms]) => {
        const hours = ms / 3600000;
        const percentage = Math.max((ms / maxMs) * 100, 2); // 2% min pour visibilité

        const li = document.createElement('li');
        li.className = 'space-y-1';
        li.innerHTML = `
            <div class="flex justify-between items-center text-sm mb-1">
                <span class="font-medium">${name}</span>
                <span style="color: var(--color-text-muted);">${formatDecimalHours(hours)}</span>
            </div>
            <div class="w-full h-2 rounded" style="background-color: var(--color-background);">
                <div class="h-2 rounded transition-all" style="width: ${percentage}%; background-color: var(--color-primary);"></div>
            </div>
        `;
        listEl.appendChild(li);
    });
}


// =============================================
// FONCTIONS UTILITAIRES
// =============================================

/**
 * Convertit des heures décimales en format "HHh MMm".
 */
function formatDecimalHours(decimalHours) {
    if (!decimalHours || decimalHours <= 0) return '0h 00m';
    
    const hours = Math.floor(decimalHours);
    const minutes = Math.round((decimalHours - hours) * 60);
    
    if (hours === 0 && minutes === 0) return '0h 00m';
    
    let parts = [];
    if (hours > 0) {
        parts.push(`${hours}h`);
    }
    if (minutes > 0) {
        parts.push(`${String(minutes).padStart(2, '0')}m`);
    } else if (hours > 0) {
        parts.push('00m'); // ex: "8h" -> "8h 00m"
    }
    
    return parts.join(' ');
}

/**
 * Calcule la plage de dates pour un mois donné par un offset.
 */
function getDateRangeForMonth(offset = 0) {
    const date = new Date();
    date.setDate(1); 
    date.setMonth(date.getMonth() + offset);
    date.setHours(0, 0, 0, 0);

    const year = date.getFullYear();
    const month = date.getMonth();

    const startDate = new Date(year, month, 1, 0, 0, 0);
    const endDate = new Date(year, month + 1, 0, 23, 59, 59); 

    const display = date.toLocaleDateString('fr-FR', {
        month: 'long',
        year: 'numeric'
    });

    return { date, startDate, endDate, display };
}