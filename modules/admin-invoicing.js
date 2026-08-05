import { collection, query, where, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent } from "../app.js";
import { formatMilliseconds } from "./utils.js";

// --- Variables pour la mise en cache des données ---
let chantiersCache = [];
let pointagesCache = new Map();
let activeChantiersCache = []; // Cache pour les chantiers actifs

/**
 * Point d'entrée principal : Affiche la structure de la page.
 */
export async function render() {
    pageContent.innerHTML = `
        <style>
            /* Style pour le bouton de période actif */
            .period-btn.active {
                background-color: var(--color-primary);
                color: white;
                font-weight: bold;
            }
            /* Style pour le curseur de la barre de défilement */
            #chantier-summary-content::-webkit-scrollbar { width: 8px; }
            #chantier-summary-content::-webkit-scrollbar-thumb { background-color: var(--color-primary); border-radius: 4px; }
            #chantier-summary-content::-webkit-scrollbar-track { background: var(--color-surface); }
        </style>

        <div class="max-w-5xl mx-auto space-y-6">
            <div id="chantier-list-view">
                <h2 class="text-2xl font-bold mb-4">📊 Suivi des Heures (Facturation)</h2>
                <div class="relative">
                    <input type="search" id="search-chantier-input" placeholder="Rechercher un chantier..." class="w-full border p-2 pl-10 rounded" style="background-color: var(--color-background); border-color: var(--color-border);">
                    <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
                </div>
                <div id="chantiers-summary-list" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                    </div>
            </div>

            <div id="chantier-detail-view" class="hidden">
                <button id="back-to-list-btn" class="mb-4 font-semibold hover:underline text-sm" style="color: var(--color-primary);">← Retour à la liste</button>
                <div class="p-4 sm:p-6 rounded-lg shadow-sm" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                    <div class="flex justify-between items-start gap-4">
                        <div>
                            <h3 id="detail-chantier-name" class="text-2xl font-bold"></h3>
                            <p id="detail-chantier-address" class="text-sm mt-1" style="color: var(--color-text-muted);"></p>
                        </div>
                        <a id="detail-chantier-nav-link" href="#" target="_blank" rel="noopener noreferrer" class="text-3xl hover:opacity-75 transition-opacity" title="Ouvrir l'itinéraire dans Google Maps">🧭</a>
                    </div>
                    <hr class="my-4" style="border-color: var(--color-border);">
                    <div class="flex justify-center flex-wrap gap-2 mb-4">
                        <button data-period="month" class="period-btn active px-4 py-2 rounded-md text-sm">Par Mois</button>
                        <button data-period="week" class="period-btn px-4 py-2 rounded-md text-sm">Par Semaine</button>
                        <button data-period="year" class="period-btn px-4 py-2 rounded-md text-sm">Par Année</button>
                    </div>
                    <div id="chantier-summary-content" class="max-h-[60vh] overflow-y-auto pr-2">
                        </div>
                </div>
            </div>
        </div>
    `;
    
    setTimeout(() => {
        setupEventListeners();
        loadAndDisplayChantiers();
    }, 0);
}

/**
 * Charge les données, contourne les problèmes de majuscules/minuscules et affiche les chantiers.
 */
async function loadAndDisplayChantiers() {
    const listContainer = document.getElementById('chantiers-summary-list');
    listContainer.innerHTML = `<p class="col-span-full text-center py-8">Chargement des données...</p>`;

    try {
        // 1. Récupération de tous les chantiers
        const chantiersQuery = query(collection(db, "chantiers"), orderBy("name", "asc"));
        const chantiersSnapshot = await getDocs(chantiersQuery);
        chantiersCache = chantiersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // 2. Récupération de TOUS les pointages pour éviter les bugs de dates manquantes
        const pointagesQuery = query(collection(db, "pointages"), orderBy("timestamp", "desc"));
        const pointagesSnapshot = await getDocs(pointagesQuery);

        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        const monthlyHoursMap = new Map();
        const allPointagesMap = new Map(); // Permet de stocker l'historique complet

        // 3. Regroupement intelligent (insensible à la casse)
        pointagesSnapshot.forEach(doc => {
            const data = doc.data();
            // On convertit tout en minuscules pour ne plus avoir de problème entre "Hustuf" et "hustuf"
            const normalizedName = (data.chantier || "").toLowerCase().trim();
            const durationMs = new Date(data.endTime) - new Date(data.timestamp) - (data.pauseDurationMs || 0);

            // On met en cache tous les pointages pour la vue détaillée
            if (!allPointagesMap.has(normalizedName)) {
                allPointagesMap.set(normalizedName, []);
            }
            allPointagesMap.get(normalizedName).push(data);

            // On calcule uniquement le total du mois en cours pour l'affichage sur la carte
            const pDate = new Date(data.timestamp);
            if (pDate.getMonth() === currentMonth && pDate.getFullYear() === currentYear) {
                const currentTotal = monthlyHoursMap.get(normalizedName) || 0;
                monthlyHoursMap.set(normalizedName, currentTotal + durationMs);
            }
        });

        // 4. On relie l'historique aux chantiers officiels
        const chantiersWithHours = chantiersCache.map(chantier => {
            const normalizedName = (chantier.name || "").toLowerCase().trim();
            
            // On sauvegarde l'historique complet de ce chantier dans notre cache global
            pointagesCache.set(chantier.id, allPointagesMap.get(normalizedName) || []);

            return {
                ...chantier,
                monthlyTotalMs: monthlyHoursMap.get(normalizedName) || 0,
                hasHistory: allPointagesMap.has(normalizedName) // Vrai si le chantier a déjà eu des heures un jour
            };
        });

        // On ne garde que les chantiers qui ont au moins 1 pointage enregistré dans leur histoire
        activeChantiersCache = chantiersWithHours.filter(c => c.hasHistory);

        displayChantierCards(activeChantiersCache);
    } catch (error) {
        console.error("Erreur de chargement des chantiers:", error);
        listContainer.innerHTML = `<p class="col-span-full text-center text-red-500 py-8">Une erreur est survenue lors du chargement.</p>`;
    }
}

/**
 * Affiche les cartes des chantiers dans la liste principale.
 * @param {Array} chantiers - La liste des chantiers à afficher.
 */
function displayChantierCards(chantiers) {
    const listContainer = document.getElementById('chantiers-summary-list');
    listContainer.innerHTML = '';

    if (chantiers.length === 0) {
        const searchTerm = document.getElementById('search-chantier-input').value;
        if (searchTerm) {
            listContainer.innerHTML = `<p class="col-span-full text-center py-8">Aucun chantier ne correspond à votre recherche.</p>`;
        } else {
            listContainer.innerHTML = `<p class="col-span-full text-center py-8">Aucun chantier n'a d'heures enregistrées.</p>`;
        }
        return;
    }

    chantiers.forEach(chantier => {
        const card = document.createElement('div');
        card.className = 'p-4 rounded-lg shadow-sm cursor-pointer hover:shadow-lg transition-shadow duration-300';
        card.style.backgroundColor = 'var(--color-surface)';
        card.style.border = '1px solid var(--color-border)';
        card.setAttribute('data-chantier-id', chantier.id);
        card.innerHTML = `
            <h3 class="font-bold text-lg truncate" title="${chantier.name}">${chantier.name}</h3>
            <p class="text-sm mt-1" style="color: var(--color-text-muted);">
                Heures ce mois-ci : 
                <span class="font-bold text-base" style="color: var(--color-primary);">${formatMilliseconds(chantier.monthlyTotalMs)}</span>
            </p>
        `;
        listContainer.appendChild(card);
    });
}

/**
 * Affiche la vue détaillée pour un chantier spécifique en utilisant le cache sans refaire de requête Firebase.
 * @param {string} chantierId - L'ID du chantier à afficher.
 */
function showChantierDetails(chantierId) {
    document.getElementById('chantier-list-view').classList.add('hidden');
    document.getElementById('chantier-detail-view').classList.remove('hidden');

    const chantier = chantiersCache.find(c => c.id === chantierId);
    if (!chantier) return;

    document.getElementById('detail-chantier-name').textContent = chantier.name;
    document.getElementById('detail-chantier-address').textContent = chantier.address || 'Adresse non spécifiée';
    document.getElementById('detail-chantier-nav-link').href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(chantier.address)}`;
    
    document.querySelectorAll('.period-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector('.period-btn[data-period="month"]').classList.add('active');
    
    // On récupère directement les données préparées dans le cache (fini les bugs de majuscules !)
    let pointages = pointagesCache.get(chantier.id) || [];
    
    generateSummary('month', pointages);
}

/**
 * Génère et affiche le résumé détaillé des heures avec des sections dépliantes.
 * @param {'month'|'week'|'year'} period - La période de regroupement.
 * @param {Array} pointages - La liste des pointages pour ce chantier.
 */
function generateSummary(period, pointages) {
    const contentDiv = document.getElementById('chantier-summary-content');
    if (pointages.length === 0) {
        contentDiv.innerHTML = `<p class="text-center italic py-4">Aucune heure enregistrée pour ce chantier.</p>`;
        return;
    }

    const getGroupKey = (date, period) => {
        if (period === 'year') return date.getFullYear().toString();
        if (period === 'month') return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
        return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
    };

    const formatGroupKey = (key, period) => {
        const parts = key.split('-');
        if (period === 'year') return `Année ${key}`;
        if (period === 'month') {
            const date = new Date(parts[0], parts[1] - 1);
            return `Mois : ${date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`;
        }
        if (period === 'week') return `Année ${parts[0]}, Semaine ${parts[1].replace('W', '')}`;
        return key;
    };

    const grouped = pointages.reduce((acc, p) => {
        const key = getGroupKey(new Date(p.timestamp), period);
        if (!acc[key]) acc[key] = { totalMs: 0, entries: [] };
        const durationMs = new Date(p.endTime) - new Date(p.timestamp) - (p.pauseDurationMs || 0);
        acc[key].totalMs += durationMs;
        acc[key].entries.push({ ...p, durationMs });
        return acc;
    }, {});

    const sortedKeys = Object.keys(grouped).sort().reverse();
    
    let html = '<div class="space-y-3">';
    sortedKeys.forEach((key, index) => {
        const group = grouped[key];
        html += `<details class="rounded-lg overflow-hidden" ${index === 0 ? 'open' : ''}>
            <summary class="flex justify-between items-center p-3 cursor-pointer font-semibold list-none rounded-t-lg" style="background-color: var(--color-background);">
                <span>${formatGroupKey(key, period)}</span>
                <span class="font-bold text-lg" style="color: var(--color-primary);">${formatMilliseconds(group.totalMs)}</span>
            </summary>
            <div class="p-2 md:p-3 space-y-2 border-t" style="border-color: var(--color-border);">`;
        
        group.entries.forEach(entry => {
            const team = [...new Set([entry.userName, ...(entry.colleagues || [])].filter(Boolean))].join(', ');
            const startDate = new Date(entry.timestamp);
            const endDate = new Date(entry.endTime);
            html += `
                <div class="grid grid-cols-3 gap-2 items-center text-sm p-2 rounded hover:bg-opacity-50" style="background-color: var(--color-surface);">
                    <div class="font-medium">${startDate.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' })}</div>
                    <div class="truncate text-center" title="${team}">${team}</div>
                    <div class="text-right font-mono">${startDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} - ${endDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>
                </div>`;
        });
        html += `</div></details>`;
    });
    html += '</div>';
    
    contentDiv.innerHTML = html;
}

/**
 * Met en place tous les écouteurs d'événements de la page.
 */
function setupEventListeners() {
    document.getElementById('search-chantier-input').addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const filtered = activeChantiersCache.filter(c => c.name.toLowerCase().includes(searchTerm));
        displayChantierCards(filtered);
    });

    document.getElementById('chantiers-summary-list').addEventListener('click', (e) => {
        const card = e.target.closest('[data-chantier-id]');
        if (card) {
            showChantierDetails(card.dataset.chantierId);
        }
    });

    document.getElementById('back-to-list-btn').addEventListener('click', () => {
        document.getElementById('chantier-detail-view').classList.add('hidden');
        document.getElementById('chantier-list-view').classList.remove('hidden');
    });
    
    document.querySelectorAll('.period-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
            const clickedBtn = e.target;
            clickedBtn.classList.add('active');
            
            const period = clickedBtn.dataset.period;
            const chantierName = document.getElementById('detail-chantier-name').textContent;
            const chantier = chantiersCache.find(c => c.name === chantierName);
            if(chantier) {
                const pointages = pointagesCache.get(chantier.id) || [];
                generateSummary(period, pointages);
            }
        });
    });
}