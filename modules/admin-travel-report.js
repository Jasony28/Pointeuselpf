import { collection, query, getDocs, orderBy, where } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent, showInfoModal } from "../app.js";
import { getAllUsers, getAllChantiers } from "./data-service.js";
import { getWeekDateRange } from "./utils.js";
import { localDateKey, isRegularisation, NEW_KM_RULES_SINCE, DEPOT_ADDRESS } from "./trips.js";
import { loadFuelPrices, computeFuelCost, euros, NO_DRIVER } from "./fuel-cost.js";
import { PLEINS, summarize, byNewest, litresLabel, eurosLabel, perLitreLabel } from "./pleins.js";
import { toPlein, pleinRowHTML, openPleinPhoto, deletePlein } from "./user-fuel.js";
import { createPdf, pdfHeader, pdfStats, pdfSection, pdfTable, pdfTotal, pdfSignatures, pdfFinish, pdfText, groupRow, fileStamp, safeName, C } from "./pdf-kit.js";

let currentFilter = 'month'; // 'week', 'month', or 'year'
let currentOffset = 0; // Pour la navigation par semaine/mois/année
let lastRange = null;   // période affichée (pour l'export du détail)
let pleins = [];        // pleins notés par les conducteurs sur la période affichée
let pleinsLoad = 0;

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
                <div class="grid grid-cols-2 gap-2 w-full sm:w-auto">
                    <button id="exportTravelPdfBtn" class="btn btn-primary justify-center">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="pointer-events: none;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M12 12v6M9 15l3 3 3-3"/></svg>
                        PDF
                    </button>
                    <button id="exportTravelDetailBtn" class="btn btn-secondary justify-center">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="pointer-events: none;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/></svg>
                        Tableur
                    </button>
                </div>
            </div>
            <div class="p-3 sm:p-4 rounded-lg shadow-sm" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                <div class="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 mb-4">
                    <div id="filter-buttons" class="grid grid-cols-3 gap-1 p-1 rounded-lg" style="background-color: var(--color-background);">
                        <button data-filter="week" class="filter-btn px-4 py-2 text-sm rounded-md">Semaine</button>
                        <button data-filter="month" class="filter-btn px-4 py-2 text-sm rounded-md">Mois</button>
                        <button data-filter="year" class="filter-btn px-4 py-2 text-sm rounded-md">Année</button>
                    </div>
                    <div id="nav-controls" class="flex items-center justify-between gap-2">
                        <button id="prevBtn" class="nav-arrow" aria-label="Précédent"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg></button>
                        <div id="currentPeriodDisplay" class="text-center font-semibold text-base sm:text-lg flex-1 sm:min-w-[250px]"></div>
                        <button id="nextBtn" class="nav-arrow" aria-label="Suivant"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></button>
                    </div>
                </div>
                <div id="fuel-summary" class="mb-4"></div>
                <div id="report-body" class="flex flex-col gap-2">
                    <p class="p-4 text-center">Chargement...</p>
                </div>
                <div id="fuel-pleins" class="rc-page mt-4"></div>
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
        document.getElementById('fuel-pleins').onclick = handlePleinClick;
        document.getElementById("prevBtn").onclick = () => { currentOffset--; loadTravelReportForPeriod(); };
        document.getElementById("nextBtn").onclick = () => { currentOffset++; loadTravelReportForPeriod(); };
        loadTravelReportForPeriod();
    }, 0);
}

async function loadTravelReportForPeriod() {
    const reportBody = document.getElementById('report-body');
    const currentPeriodDisplay = document.getElementById('currentPeriodDisplay');
    
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('bg-white', btn.dataset.filter === currentFilter);
        btn.classList.toggle('shadow', btn.dataset.filter === currentFilter);
    });

    reportBody.innerHTML = `<p class="p-4 text-center">Chargement...</p>`;

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
    const dayKey = (d) => d.toISOString().slice(0, 10); // les bornes de la période sont en UTC
    loadPleins(dayKey(startDate), dayKey(endDate));

    try {
        const users = await getAllUsers();

        const trajetsQuery = query(collection(db, "trajets"), 
            where("date_creation", ">=", startDate),
            where("date_creation", "<=", endDate)
        );
        const [trajetsSnapshot, prices] = await Promise.all([getDocs(trajetsQuery), loadFuelPrices()]);

        const travelByUser = {};
        trajetsSnapshot.forEach(doc => {
            const trajet = doc.data();
            if (!travelByUser[trajet.id_utilisateur]) {
                travelByUser[trajet.id_utilisateur] = { km: 0, min: 0 };
            }
            travelByUser[trajet.id_utilisateur].km += trajet.distance_km || 0;
            travelByUser[trajet.id_utilisateur].min += trajet.duree_min || 0;
        });

        const fuel = computeFuelCost(fuelTrips(trajetsSnapshot), fuelUsers(users), prices);
        const rows = users.map(user => ({
            name: user.displayName || '?',
            ...(travelByUser[user.uid] || travelByUser[user.id] || { km: 0, min: 0 }),
            fuel: fuel.byDriver.get(user.id || user.uid) || null,
        })).sort((a, b) => b.km - a.km || a.name.localeCompare(b.name, 'fr'));
        renderFuelSummary(fuel, rows);

        if (users.length === 0) {
            reportBody.innerHTML = `<p class="p-4 text-center opacity-70">Aucun utilisateur trouvé.</p>`;
            return;
        }

        // Une carte par employé (lisible sur téléphone) : ceux qui ont roulé d'abord, les autres regroupés en bas
        const active = rows.filter(r => r.km > 0 || r.fuel);
        const idle = rows.filter(r => !(r.km > 0 || r.fuel));
        const maxKm = Math.max(1, ...active.map(r => r.km));
        const esc = (v) => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        reportBody.innerHTML = (active.length ? active.map(r => `
            <div class="p-3 rounded-lg" style="background-color: var(--color-background); border: 1px solid var(--color-border);">
                <div class="flex items-baseline justify-between gap-3">
                    <span class="font-semibold truncate">${esc(r.name)}</span>
                    <span class="font-bold text-lg whitespace-nowrap">${r.km.toFixed(1).replace('.', ',')} km</span>
                </div>
                <div class="h-1.5 rounded-full my-2 overflow-hidden" style="background-color: var(--color-border);">
                    <div class="h-full rounded-full" style="width: ${Math.round(r.km / maxKm * 100)}%; background-color: var(--color-primary);"></div>
                </div>
                <div class="flex items-center justify-between gap-3 text-sm">
                    <span class="opacity-80">Route : ${formatMinutes(r.min)}</span>
                    ${r.fuel
                        ? `<span class="font-semibold whitespace-nowrap">Carburant : ${euros(r.fuel.cost)}</span>`
                        : `<span class="opacity-50 whitespace-nowrap">Passager</span>`}
                </div>
            </div>`).join('') : `<p class="p-4 text-center opacity-70">Aucun trajet sur cette période.</p>`)
            + (idle.length ? `<p class="text-xs opacity-60 mt-2 px-1">Sans trajet : ${idle.map(r => esc(r.name)).join(', ')}</p>` : '');
    } catch (error) {
        console.error("Erreur de chargement du rapport de trajets:", error);
        reportBody.innerHTML = `<p class="p-4 text-center text-red-500">Erreur de chargement.</p>`;
    }
}

// --- Pleins notés par les conducteurs (page employé « Carburant ») ----------------------
// Chargés à part : si la lecture échoue, le rapport des trajets s'affiche quand même.
async function loadPleins(fromKey, toKey) {
    const box = document.getElementById('fuel-pleins');
    const current = ++pleinsLoad;
    box.innerHTML = '';
    try {
        const snap = await getDocs(query(collection(db, PLEINS), where('date', '>=', fromKey), where('date', '<=', toKey)));
        if (current !== pleinsLoad || !document.getElementById('fuel-pleins')) return;
        pleins = snap.docs.map(toPlein).sort(byNewest);
        renderPleins();
    } catch (error) {
        console.error("Erreur de chargement des pleins:", error);
        if (current === pleinsLoad && document.getElementById('fuel-pleins')) box.innerHTML = pleinsHead() + '<p class="rc-empty">Impossible de charger les pleins.</p>';
    }
}

const pleinsHead = () => `
    <div>
        <h3 class="fu-title">Pleins notés par les conducteurs</h3>
        <p class="rc-help">Ce qui a vraiment été payé à la pompe, avec la photo de la pompe ou du ticket.</p>
    </div>`;

function renderPleins() {
    const esc = (v) => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const total = summarize(pleins);
    const plural = (n) => `${n} plein${n > 1 ? 's' : ''}`;
    document.getElementById('fuel-pleins').innerHTML = pleinsHead() + (total.count ? `
        <div class="fu-summary">
            <div class="fu-stat is-total"><span class="rc-eyebrow">Total payé</span><b>${eurosLabel(total.montant)}</b><span class="rc-help">${plural(total.count)} · ${litresLabel(total.litres)} · ${perLitreLabel(total)}</span></div>
            ${total.plates.map(s => `<div class="fu-stat"><span class="fu-plate-tag">${esc(s.plaque)}</span><b>${eurosLabel(s.montant)}</b><span class="rc-help">${plural(s.count)} · ${litresLabel(s.litres)}</span></div>`).join('')}
        </div>
        <div class="rc-list">${pleins.map(p => pleinRowHTML(p, { who: true })).join('')}</div>`
        : '<p class="rc-empty">Aucun plein noté sur cette période.</p>');
}

async function handlePleinClick(e) {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.photo) { openPleinPhoto(btn.dataset.photo, btn); return; }
    const p = pleins.find(x => x.id === btn.dataset.delete);
    if (p && await deletePlein(p)) {
        pleins = pleins.filter(x => x.id !== p.id);
        if (document.getElementById('fuel-pleins')) renderPleins();
    }
}

// --- Coût carburant ------------------------------------------------------------------
// Trajets Firestore -> trajets pour le calcul du carburant (un par employé)
function fuelTrips(tripsSnap) {
    const list = [];
    tripsSnap.forEach(d => {
        const t = d.data();
        const date = t.date_creation?.toDate ? t.date_creation.toDate() : null;
        if (!date || !t.id_utilisateur) return;
        list.push({ uid: t.id_utilisateur, dayKey: localDateKey(date), from: t.adresse_depart || '', to: t.adresse_arrivee || '', isReturn: t.type === 'retour', km: t.distance_km || 0 });
    });
    return list;
}
const fuelUsers = (users) => users.map(u => ({ uid: u.id || u.uid, name: u.displayName || '', isDriver: u.isDriver === true }));
const priceText = (v) => v ? `${v.toFixed(2).replace('.', ',')} €/L` : '—';
const litresText = (v) => `${Math.round(v || 0)} L`;

function renderFuelSummary(fuel, rows = []) {
    const box = document.getElementById('fuel-summary');
    if (!box) return;
    const totalMin = rows.reduce((s, r) => s + r.min, 0);
    const noDriver = fuel.byDriver.get(NO_DRIVER);
    const card = (label, value) => `<div class="p-3 rounded-lg" style="background-color: var(--color-background); border: 1px solid var(--color-border);"><div class="text-xs opacity-70">${label}</div><div class="text-base font-bold whitespace-nowrap">${value}</div></div>`;
    box.innerHTML = `
        <div class="p-4 rounded-lg mb-2 text-center" style="background-color: var(--color-background); border: 2px solid var(--color-primary);">
            <div class="text-sm opacity-80">Coût carburant</div>
            <div class="text-3xl font-bold" style="color: var(--color-primary);">${euros(fuel.cost)}</div>
            <div class="text-xs opacity-70 mt-1">${fuel.cars.length} trajet${fuel.cars.length > 1 ? 's' : ''} en voiture · ${fuel.conso} L/100 km</div>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
            ${card('Km des voitures', `${fuel.km.toFixed(0)} km`)}
            ${card('Litres estimés', litresText(fuel.litres))}
            ${card('Prix moyen du litre', priceText(fuel.avgPrice))}
            ${card('Temps de route (équipe)', formatMinutes(totalMin))}
        </div>
        <details class="text-xs opacity-80 mt-2">
            <summary class="cursor-pointer py-1">Comment c'est calculé ?</summary>
            <p class="mt-1">Les employés qui font le même trajet le même jour comptent pour 1 voiture. Le carburant est mis sur une personne
            de la voiture qui a le permis. Prix : moyenne diesel + essence en Belgique de la semaine du trajet (Bulletin pétrolier européen).</p>
        </details>
        ${fuel.estimated ? '<p class="text-xs mt-1"><strong>Certains prix sont estimés (relevé de la semaine pas encore disponible).</strong></p>' : ''}
        ${noDriver ? `<p class="text-xs mt-1"><strong>${euros(noDriver.cost)}</strong> sur des trajets où personne n'a le permis indiqué (« Sans conducteur connu »).</p>` : ''}`;
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
        const [users, chantiers, pointagesSnap, tripsSnap, prices] = await Promise.all([
            getAllUsers(),
            getAllChantiers(),
            getDocs(query(collection(db, "pointages"), where("timestamp", ">=", startDate.toISOString()), where("timestamp", "<=", endDate.toISOString()))),
            getDocs(query(collection(db, "trajets"), where("date_creation", ">=", startDate), where("date_creation", "<=", endDate))),
            loadFuelPrices(),
        ]);
        const names = new Map(users.map(u => [u.id, u.displayName || u.id]));
        const pointages = new Map(pointagesSnap.docs.map(d => [d.id, d.data()]));
        const fuel = computeFuelCost(fuelTrips(tripsSnap), fuelUsers(users), prices);
        const fuelOf = (uid) => fuel.byDriver.get(uid);
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
            if (!byUser.has(t.id_utilisateur)) byUser.set(t.id_utilisateur, { uid: t.id_utilisateur, name: names.get(t.id_utilisateur) || '?', trips: [] });
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
            ['Carburant', euros(fuel.cost)],
        ]);

        // Synthèse
        y = pdfSection(doc, y + 2, 'Synthèse par employé', rulesNote);
        y = pdfTable(doc, {
            startY: y + 1,
            head: [['Employé', 'Jours', 'Trajets', 'Km', 'Temps de route', 'Km / jour', 'Carburant']],
            body: people.map(u => [pdfText(u.name), String(u.days), String(u.trips.length), km(u.km), formatMinutes(u.min), km(u.km / u.days), fuelOf(u.uid) ? euros(fuelOf(u.uid).cost) : '-']),
            columnStyles: {
                0: { cellWidth: 'auto', fontStyle: 'bold', textColor: C.DARK },
                1: { cellWidth: 14, halign: 'center' }, 2: { cellWidth: 16, halign: 'center' },
                3: { cellWidth: 24, halign: 'right', fontStyle: 'bold', textColor: C.PRIMARY },
                4: { cellWidth: 28, halign: 'right' }, 5: { cellWidth: 22, halign: 'right', textColor: C.MUTED },
                6: { cellWidth: 24, halign: 'right', fontStyle: 'bold' },
            },
        });
        y = pdfTotal(doc, y + 6, `Total · ${formatMinutes(totalMin)} de route`, km(totalKm));

        // Coût carburant (compté par voiture, mis sur une personne qui a le permis)
        if (fuel.cars.length) {
            y = pdfSection(doc, y + 4, 'Coût carburant', `${fuel.conso} L/100 km · prix moyen diesel + essence (Belgique)`);
            y = pdfStats(doc, y + 2, [
                ['Km des voitures', km(fuel.km)],
                ['Litres estimés', litresText(fuel.litres), C.DARK],
                ['Prix moyen', priceText(fuel.avgPrice), C.DARK],
                ['Coût carburant', euros(fuel.cost)],
            ]);
            const drivers = [...fuel.byDriver.entries()]
                .map(([uid, d]) => ({ name: uid === NO_DRIVER ? 'Sans conducteur connu' : (names.get(uid) || '?'), ...d }))
                .sort((a, b) => b.cost - a.cost);
            y = pdfTable(doc, {
                startY: y + 1,
                head: [['Conducteur (a le permis)', 'Trajets en voiture', 'Km', 'Litres', 'Carburant']],
                body: drivers.map(d => [pdfText(d.name), String(d.cars), km(d.km), litresText(d.litres), euros(d.cost)]),
                columnStyles: {
                    0: { cellWidth: 'auto', fontStyle: 'bold', textColor: C.DARK },
                    1: { cellWidth: 32, halign: 'center' }, 2: { cellWidth: 26, halign: 'right' },
                    3: { cellWidth: 22, halign: 'right', textColor: C.MUTED }, 4: { cellWidth: 28, halign: 'right', fontStyle: 'bold', textColor: C.PRIMARY },
                },
            });
            if (fuel.weeks.size > 1) {
                const weekRows = [...fuel.weeks.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([w, p]) => [
                    new Date(`${w}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }),
                    priceText(p.diesel), priceText(p.essence), priceText((p.diesel + p.essence) / 2)]);
                y = pdfSection(doc, y + 8, 'Prix utilisés (relevé du lundi de chaque semaine)', 'Bulletin pétrolier européen');
                y = pdfTable(doc, {
                    startY: y + 1,
                    head: [['Semaine du', 'Diesel', 'Essence 95', 'Moyenne']],
                    body: weekRows,
                    columnStyles: { 0: { cellWidth: 'auto' }, 1: { cellWidth: 30, halign: 'right' }, 2: { cellWidth: 30, halign: 'right' }, 3: { cellWidth: 30, halign: 'right', fontStyle: 'bold' } },
                });
            }
            y = pdfTotal(doc, y + 6, `Coût carburant · ${fuel.cars.length} trajets en voiture${fuel.estimated ? ' (prix en partie estimés)' : ''}`, euros(fuel.cost));
        }
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
            yy = pdfTotal(doc, yy + 6, `Total ${u.name}`, km(u.km));
            if (fuelOf(u.uid)) pdfTotal(doc, yy - 4, `Carburant payé comme conducteur (${fuelOf(u.uid).cars} trajets en voiture)`, euros(fuelOf(u.uid).cost));
        });

        pdfFinish(doc, `Rapport kilomètres · ${periodText}`, `Rapport_km_${safeName(periodText)}_${fileStamp()}.pdf`);
    } catch (error) {
        console.error("Rapport km en PDF :", error);
        alert("Le PDF n'a pas pu être créé. Vérifiez la connexion et réessayez.");
    } finally {
        btn.disabled = false;
    }
}
