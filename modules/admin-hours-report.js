import { collection, query, where, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent } from "../app.js";
import { getWeekDateRange, formatMilliseconds } from "./utils.js";
import { isStealthMode } from "../app.js";
import { getUsers } from "./data-service.js";

let filter = { period: 'week', offset: 0 };

export async function render() {
    pageContent.innerHTML = `
        <div class="max-w-4xl mx-auto">
            <h2 class="text-2xl font-bold mb-4">Rapport d'Heures Global</h2>
            
            <div class="p-3 sm:p-4 rounded-lg shadow-sm" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                <div class="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 mb-4">
                    <div class="grid grid-cols-3 gap-1 p-1 rounded-lg text-sm" style="background-color: var(--color-background);">
                        <button data-period="week" class="filter-btn px-4 py-2 rounded-md">Semaine</button>
                        <button data-period="month" class="filter-btn px-4 py-2 rounded-md">Mois</button>
                        <button data-period="year" class="filter-btn px-4 py-2 rounded-md">Année</button>
                    </div>
                    <div class="flex items-center justify-between gap-2">
                        <button id="prev-btn" class="nav-arrow" aria-label="Précédent"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg></button>
                        <div id="period-display" class="text-center font-semibold text-base sm:text-lg flex-1 sm:min-w-[250px]"></div>
                        <button id="next-btn" class="nav-arrow" aria-label="Suivant"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></button>
                    </div>
                </div>

                <div id="hours-summary" class="mb-4"></div>
                <div id="report-body" class="flex flex-col gap-2">
                    <p class="p-4 text-center">Chargement...</p>
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

    const reportBody = document.getElementById('report-body');
    const summary = document.getElementById('hours-summary');
    reportBody.innerHTML = `<p class="p-4 text-center">Chargement...</p>`;

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

        if (approvedUsers.length === 0) {
            summary.innerHTML = '';
            reportBody.innerHTML = `<p class="p-4 text-center opacity-70">Aucun employé approuvé trouvé.</p>`;
            return;
        }

        // Une ligne de calcul par employé (mêmes règles qu'avant), puis une carte par employé (lisible sur téléphone)
        const stealth = isStealthMode();
        const rows = approvedUsers.map(user => {
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
            if (!stealth && weeklyContractHours === 12) {
                displayedTotalMs = Math.min(totalMs, periodContractMs);
                balanceMs = Math.min(0, balanceMs);
            }
            return { name: user.displayName || '?', totalMs: displayedTotalMs, contractMs: periodContractMs, balanceMs };
        }).sort((a, b) => b.totalMs - a.totalMs || a.name.localeCompare(b.name, 'fr'));

        const esc = (v) => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        const signed = (ms) => ms > 0 ? `+${formatMilliseconds(ms)}` : ms < 0 ? `-${formatMilliseconds(Math.abs(ms))}` : '0h 0min';
        const balanceClass = (ms) => ms > 0 ? 'text-green-600 font-bold' : ms < 0 ? 'text-red-600 font-semibold' : 'opacity-70';
        const sum = (key) => rows.reduce((s, r) => s + r[key], 0);
        const worked = rows.filter(r => r.totalMs > 0).length;
        const card = (label, value, cls = '') => `<div class="p-3 rounded-lg" style="background-color: var(--color-background); border: 1px solid var(--color-border);"><div class="text-xs opacity-70">${label}</div><div class="text-base font-bold whitespace-nowrap ${cls}">${value}</div></div>`;

        summary.innerHTML = `
            <div class="p-4 rounded-lg mb-2 text-center" style="background-color: var(--color-background); border: 2px solid var(--color-primary);">
                <div class="text-sm opacity-80">Heures prestées${stealth ? ' (réel)' : ''}</div>
                <div class="text-3xl font-bold" style="color: var(--color-primary);">${formatMilliseconds(sum('totalMs'))}</div>
                <div class="text-xs opacity-70 mt-1">${worked} employé${worked > 1 ? 's' : ''} sur ${rows.length} ${worked > 1 ? 'ont' : 'a'} pointé</div>
            </div>
            ${stealth ? '' : `<div class="grid grid-cols-2 gap-2">
                ${card('Heures contrat', formatMilliseconds(sum('contractMs')))}
                ${card('Solde (+/-)', signed(sum('balanceMs')), balanceClass(sum('balanceMs')))}
            </div>`}`;

        const active = rows.filter(r => r.totalMs > 0 || (!stealth && r.contractMs > 0));
        const idle = rows.filter(r => !active.includes(r));
        const maxMs = Math.max(1, ...active.map(r => Math.max(r.totalMs, stealth ? 0 : r.contractMs)));
        reportBody.innerHTML = (active.length ? active.map(r => `
            <div class="p-3 rounded-lg" style="background-color: var(--color-background); border: 1px solid var(--color-border);">
                <div class="flex items-baseline justify-between gap-3">
                    <span class="font-semibold truncate">${esc(r.name)}</span>
                    <span class="font-bold text-lg whitespace-nowrap">${formatMilliseconds(r.totalMs)}</span>
                </div>
                <div class="h-1.5 rounded-full my-2 overflow-hidden" style="background-color: var(--color-border);">
                    <div class="h-full rounded-full" style="width: ${Math.min(100, Math.round(r.totalMs / (!stealth && r.contractMs > 0 ? r.contractMs : maxMs) * 100))}%; background-color: var(--color-primary);"></div>
                </div>
                ${stealth ? '' : `<div class="flex items-center justify-between gap-3 text-sm">
                    <span class="opacity-80">Contrat : ${r.contractMs > 0 ? formatMilliseconds(r.contractMs) : '—'}</span>
                    <span class="whitespace-nowrap ${balanceClass(r.balanceMs)}">Solde : ${signed(r.balanceMs)}</span>
                </div>`}
            </div>`).join('') : `<p class="p-4 text-center opacity-70">Aucune heure sur cette période.</p>`)
            + (idle.length ? `<p class="text-xs opacity-60 mt-2 px-1">Sans heure : ${idle.map(r => esc(r.name)).join(', ')}</p>` : '');
    } catch (error) {
        console.error("Erreur de chargement du rapport d'heures:", error);
        reportBody.innerHTML = `<p class="p-4 text-center text-red-500">Erreur de chargement du rapport.</p>`;
    }
}

