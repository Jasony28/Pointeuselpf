import { collection, query, getDocs, orderBy, where } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent } from "../app.js";
import { getWeekDateRange } from "./utils.js";
import { localDateKey, isRegularisation, NEW_KM_RULES_SINCE } from "./trips.js";

let currentFilter = 'month'; // 'week', 'month', or 'year'
let currentOffset = 0; // Pour la navigation par semaine/mois/année
let lastRange = null;   // période affichée (pour l'export du détail)

function formatMinutes(totalMinutes) {
    if (!totalMinutes || totalMinutes < 0) return "0h 0min";
    const hours = Math.floor(totalMinutes / 60);
    const minutes = Math.round(totalMinutes % 60);
    return `${hours}h ${minutes}min`;
}

export async function render() {
    pageContent.innerHTML = `
        <div class="max-w-5xl mx-auto">
            <div class="flex flex-wrap items-end justify-between gap-3 mb-4">
                <h2 class="text-2xl font-bold">Rapport des Trajets</h2>
                <button id="exportTravelDetailBtn" class="btn btn-secondary">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="pointer-events: none;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/></svg>
                    Exporter le détail
                </button>
            </div>
            <div class="p-4 rounded-lg shadow-sm" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                <div class="flex flex-col sm:flex-row justify-between items-center gap-4 mb-4">
                    <div id="filter-buttons" class="flex items-center justify-center gap-2 p-1 rounded-lg" style="background-color: var(--color-background);">
                        <button data-filter="week" class="filter-btn px-4 py-2 text-sm rounded-md">Semaine</button>
                        <button data-filter="month" class="filter-btn px-4 py-2 text-sm rounded-md">Mois</button>
                        <button data-filter="year" class="filter-btn px-4 py-2 text-sm rounded-md">Année</button>
                    </div>
                    <div id="nav-controls" class="flex items-center gap-2">
                        <button id="prevBtn" class="nav-arrow" aria-label="Précédent"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg></button>
                        <div id="currentPeriodDisplay" class="text-center font-semibold text-lg min-w-[250px]"></div>
                        <button id="nextBtn" class="nav-arrow" aria-label="Suivant"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></button>
                    </div>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-left">
                        <thead>
                            <tr class="border-b" style="border-color: var(--color-border);">
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
                currentOffset = 0;
                loadTravelReportForPeriod();
            }
        });
        document.getElementById('exportTravelDetailBtn').onclick = exportTravelDetail;
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
    lastRange = { startDate, endDate, periodText };
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


// Détail de chaque trajet et de chaque pointage de la période, en CSV (tableur), pour vérifier les km
async function exportTravelDetail() {
    if (!lastRange) return;
    const btn = document.getElementById('exportTravelDetailBtn');
    btn.disabled = true;
    try {
        const { startDate, endDate, periodText } = lastRange;
        const [usersSnap, pointagesSnap, tripsSnap] = await Promise.all([
            getDocs(collection(db, "users")),
            getDocs(query(collection(db, "pointages"), where("timestamp", ">=", startDate.toISOString()), where("timestamp", "<=", endDate.toISOString()))),
            getDocs(query(collection(db, "trajets"), where("date_creation", ">=", startDate), where("date_creation", "<=", endDate))),
        ]);
        const names = new Map(usersSnap.docs.map(d => [d.id, d.data().displayName || d.id]));
        const pointages = new Map(pointagesSnap.docs.map(d => [d.id, d.data()]));
        const time = (iso) => iso ? new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
        const driver = (p) => p?.isDriver === true ? 'oui' : p?.isDriver === false ? 'non' : '';
        const rows = [];
        const withTrip = new Set();

        tripsSnap.forEach(d => {
            const t = d.data();
            const date = t.date_creation?.toDate ? t.date_creation.toDate() : null;
            const pid = t.id_pointage_arrivee || t.id_pointage_depart;
            const p = pid ? pointages.get(pid) : null;
            if (t.id_pointage_arrivee) withTrip.add(t.id_pointage_arrivee);
            const notes = [];
            if (!p) notes.push('pointage introuvable sur la période');
            if (p && isRegularisation(p)) notes.push('régularisation');
            rows.push({
                emp: names.get(t.id_utilisateur) || t.id_utilisateur || '?', day: date ? localDateKey(date) : '', start: time(p?.timestamp),
                type: t.type === 'retour' ? 'retour dépôt' : 'aller', chantier: p?.chantier || '', conducteur: driver(p),
                from: t.adresse_depart || '', to: t.adresse_arrivee || '', km: (t.distance_km || 0).toFixed(2).replace('.', ','),
                min: t.duree_min || 0, note: notes.join(' · '),
            });
        });
        pointagesSnap.forEach(d => {
            const p = d.data();
            if (withTrip.has(d.id) || isRegularisation(p)) return;
            rows.push({
                emp: names.get(p.uid) || p.userName || '?', day: localDateKey(p.timestamp), start: time(p.timestamp), type: 'aucun trajet',
                chantier: p.chantier || '', conducteur: driver(p), from: '', to: '', km: '0,00', min: 0,
                note: 'pas de trajet vers ce pointage (même chantier que le précédent, adresse introuvable, ou km jamais calculés)',
            });
        });
        rows.sort((a, b) => a.emp.localeCompare(b.emp, 'fr') || a.day.localeCompare(b.day) || a.start.localeCompare(b.start) || (a.type === 'retour dépôt') - (b.type === 'retour dépôt'));

        const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const header = ['Employé', 'Jour', 'Début pointage', 'Type', 'Chantier', 'Conducteur', 'Départ', 'Arrivée', 'Km', 'Minutes', 'Règle', 'Remarque'];
        const lines = rows.map(r => [r.emp, r.day, r.start, r.type, r.chantier, r.conducteur, r.from, r.to, r.km, r.min,
            r.day && r.day < NEW_KM_RULES_SINCE ? 'avant le 26/10 : pas de retour au dépôt' : 'avec retour au dépôt', r.note].map(cell).join(';'));
        const csv = '﻿' + [header.map(cell).join(';'), ...lines].join('\r\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `Detail_trajets_${periodText.replace(/[^\wÀ-ÿ-]+/g, '_')}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
        console.error("Export du détail des trajets:", error);
        alert("L'export a échoué. Vérifiez la connexion et réessayez.");
    } finally {
        btn.disabled = false;
    }
}
