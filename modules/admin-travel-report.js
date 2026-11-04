import { collection, query, getDocs, orderBy, where } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent, showInfoModal } from "../app.js";
import { getAllUsers, getAllChantiers } from "./data-service.js";
import { getWeekDateRange } from "./utils.js";
import { localDateKey, isRegularisation, NEW_KM_RULES_SINCE, DEPOT_ADDRESS } from "./trips.js";
import { createPdf, pdfHeader, pdfStats, pdfSection, pdfTable, pdfTotal, pdfSignatures, pdfFinish, pdfText, groupRow, fileStamp, safeName, C } from "./pdf-kit.js";

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
                <div class="flex flex-wrap gap-2">
                    <button id="exportTravelPdfBtn" class="btn btn-primary">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="pointer-events: none;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M12 12v6M9 15l3 3 3-3"/></svg>
                        Rapport km en PDF
                    </button>
                    <button id="exportTravelDetailBtn" class="btn btn-secondary">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="pointer-events: none;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/></svg>
                        Détail (tableur)
                    </button>
                </div>
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
        document.getElementById('exportTravelPdfBtn').onclick = exportTravelPdf;
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
        const users = await getAllUsers();

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
        const [users, pointagesSnap, tripsSnap] = await Promise.all([
            getAllUsers(),
            getDocs(query(collection(db, "pointages"), where("timestamp", ">=", startDate.toISOString()), where("timestamp", "<=", endDate.toISOString()))),
            getDocs(query(collection(db, "trajets"), where("date_creation", ">=", startDate), where("date_creation", "<=", endDate))),
        ]);
        const names = new Map(users.map(u => [u.id, u.displayName || u.id]));
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


// --- Rapport km en PDF -------------------------------------------------------------
// Page de synthèse (km et temps de route par employé), puis le détail de chaque employé jour par jour :
// chaque trajet avec son départ et son arrivée (nom du chantier, ou « Dépôt »), ses km et son temps.
async function exportTravelPdf() {
    if (!lastRange) return;
    const btn = document.getElementById('exportTravelPdfBtn');
    btn.disabled = true;
    try {
        const { startDate, endDate, periodText } = lastRange;
        const [users, chantiers, pointagesSnap, tripsSnap] = await Promise.all([
            getAllUsers(),
            getAllChantiers(),
            getDocs(query(collection(db, "pointages"), where("timestamp", ">=", startDate.toISOString()), where("timestamp", "<=", endDate.toISOString()))),
            getDocs(query(collection(db, "trajets"), where("date_creation", ">=", startDate), where("date_creation", "<=", endDate))),
        ]);
        const names = new Map(users.map(u => [u.id, u.displayName || u.id]));
        const pointages = new Map(pointagesSnap.docs.map(d => [d.id, d.data()]));
        const siteByAddress = new Map(chantiers.filter(c => c.address).map(c => [c.address, c.name]));
        const place = (address, fallback) => address === DEPOT_ADDRESS ? 'Dépôt' : (fallback || siteByAddress.get(address) || address || '?');
        const km = (v) => `${(v || 0).toFixed(1).replace('.', ',')} km`;
        const time = (d) => d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

        // Trajets groupés par employé puis par jour
        const byUser = new Map();
        tripsSnap.forEach(d => {
            const t = d.data();
            const date = t.date_creation?.toDate ? t.date_creation.toDate() : null;
            if (!date || !t.id_utilisateur) return;
            const arrival = t.id_pointage_arrivee ? pointages.get(t.id_pointage_arrivee) : null;
            const isReturn = t.type === 'retour';
            const trip = {
                date, dayKey: localDateKey(date), isReturn,
                from: place(t.adresse_depart, isReturn ? t.depart : null),
                to: isReturn ? 'Dépôt' : place(t.adresse_arrivee, arrival?.chantier),
                km: t.distance_km || 0, min: t.duree_min || 0,
            };
            if (!byUser.has(t.id_utilisateur)) byUser.set(t.id_utilisateur, { name: names.get(t.id_utilisateur) || '?', trips: [] });
            byUser.get(t.id_utilisateur).trips.push(trip);
        });
        if (!byUser.size) {
            showInfoModal("Information", `Aucun trajet sur la période (${periodText}).`);
            return;
        }
        const people = [...byUser.values()].map(u => {
            u.trips.sort((a, b) => a.date - b.date || a.isReturn - b.isReturn);
            u.km = u.trips.reduce((s, t) => s + t.km, 0);
            u.min = u.trips.reduce((s, t) => s + t.min, 0);
            u.days = new Set(u.trips.map(t => t.dayKey)).size;
            return u;
        }).sort((a, b) => b.km - a.km);
        const totalKm = people.reduce((s, u) => s + u.km, 0);
        const totalMin = people.reduce((s, u) => s + u.min, 0);
        const totalTrips = people.reduce((s, u) => s + u.trips.length, 0);
        const rulesNote = startDate < new Date(`${NEW_KM_RULES_SINCE}T00:00:00`)
            ? 'Retour au dépôt compté à partir du 26/10/2026' : 'Retour au dépôt compris';

        const doc = await createPdf('portrait');
        let y = pdfHeader(doc, { title: 'Rapport kilomètres', right: [periodText.charAt(0).toUpperCase() + periodText.slice(1), `${people.length} employé${people.length > 1 ? 's' : ''} · ${totalTrips} trajets`] });
        y = pdfStats(doc, y, [
            ['Kilomètres', km(totalKm)],
            ['Temps de route', formatMinutes(totalMin), C.DARK],
            ['Trajets', String(totalTrips), C.DARK],
            ['Moyenne / employé', km(totalKm / people.length), C.DARK],
        ]);

        // Synthèse
        y = pdfSection(doc, y + 2, 'Synthèse par employé', rulesNote);
        y = pdfTable(doc, {
            startY: y + 1,
            head: [['Employé', 'Jours', 'Trajets', 'Km', 'Temps de route', 'Km / jour']],
            body: people.map(u => [pdfText(u.name), String(u.days), String(u.trips.length), km(u.km), formatMinutes(u.min), km(u.km / u.days)]),
            columnStyles: {
                0: { cellWidth: 'auto', fontStyle: 'bold', textColor: C.DARK },
                1: { cellWidth: 16, halign: 'center' }, 2: { cellWidth: 18, halign: 'center' },
                3: { cellWidth: 26, halign: 'right', fontStyle: 'bold', textColor: C.PRIMARY },
                4: { cellWidth: 30, halign: 'right' }, 5: { cellWidth: 24, halign: 'right', textColor: C.MUTED },
            },
        });
        y = pdfTotal(doc, y + 6, `Total · ${formatMinutes(totalMin)} de route`, km(totalKm));
        pdfSignatures(doc, y + 2, ['Vérifié par', 'Signature du responsable']);

        // Détail par employé
        people.forEach(u => {
            doc.addPage();
            let yy = pdfSection(doc, 18, u.name, `${km(u.km)} · ${formatMinutes(u.min)} · ${u.days} jour${u.days > 1 ? 's' : ''}`);
            const body = [];
            let currentDay = null;
            u.trips.forEach(t => {
                if (t.dayKey !== currentDay) {
                    currentDay = t.dayKey;
                    const dayTrips = u.trips.filter(x => x.dayKey === currentDay);
                    const label = t.date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
                    body.push(groupRow(label.charAt(0).toUpperCase() + label.slice(1), km(dayTrips.reduce((s, x) => s + x.km, 0)), 5));
                }
                body.push([
                    time(t.date),
                    pdfText(`${t.from}  ->  ${t.to}`),
                    t.isReturn ? 'Retour' : 'Aller',
                    `${t.min} min`,
                    { content: km(t.km), styles: { halign: 'right', fontStyle: 'bold' } },
                ]);
            });
            yy = pdfTable(doc, {
                startY: yy + 1,
                head: [['Heure', 'Trajet', 'Type', 'Durée', 'Km']],
                body,
                columnStyles: { 0: { cellWidth: 16 }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 16, textColor: C.MUTED }, 3: { cellWidth: 18, halign: 'right', textColor: C.MUTED }, 4: { cellWidth: 22, halign: 'right' } },
            });
            pdfTotal(doc, yy + 6, `Total ${u.name}`, km(u.km));
        });

        pdfFinish(doc, `Rapport kilomètres · ${periodText}`, `Rapport_km_${safeName(periodText)}_${fileStamp()}.pdf`);
    } catch (error) {
        console.error("Rapport km en PDF :", error);
        alert("Le PDF n'a pas pu être créé. Vérifiez la connexion et réessayez.");
    } finally {
        btn.disabled = false;
    }
}
