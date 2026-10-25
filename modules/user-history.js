import { collection, query, where, orderBy, getDocs, deleteDoc, doc, updateDoc, addDoc, serverTimestamp, getDoc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, currentUser, pageContent, showConfirmationModal, showInfoModal, navigateTo } from "../app.js";
import { getWeekDateRange, formatMilliseconds } from "./utils.js";
import { getUsers } from "./data-service.js";

let currentWeekOffset = 0;
let currentCalendarDate = new Date();
let targetUser = null;
let chantiersCache = [];
let colleaguesCache = [];
let pointagesPourPdf = [];
let allPointages = [];
let entryWizardStep = 1;
let entryWizardData = {};

let lastLoadedState = { start: null, end: null, chantier: null };
let localStealthMode = false;

let reassignModal, userSelect, reassignConfirmBtn, reassignCancelBtn;

// --- CALCULATEUR DE JOURS FÉRIÉS BELGES ---
function isBelgianHoliday(dateObj) {
    const year = dateObj.getFullYear();

    const a = year % 19, b = Math.floor(year / 100), c = year % 100;
    const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const pMonth = Math.floor((h + l - 7 * m + 114) / 31) - 1;
    const pDay = ((h + l - 7 * m + 114) % 31) + 1;

    const easterMonday = new Date(year, pMonth, pDay + 1);
    const ascension = new Date(year, pMonth, pDay + 39);
    const pentecost = new Date(year, pMonth, pDay + 50);

    const pad = n => String(n).padStart(2, '0');
    const toStr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    const holidays = [
        `${year}-01-01`,
        `${year}-05-01`,
        `${year}-07-21`,
        `${year}-08-15`,
        `${year}-11-01`,
        `${year}-11-11`,
        `${year}-12-25`,
        toStr(easterMonday),
        toStr(ascension),
        toStr(pentecost)
    ];

    return holidays.includes(toStr(dateObj));
}

function formatMinutes(totalMinutes) {
    if (!totalMinutes || totalMinutes < 0) return "0h 0min";
    const hours = Math.floor(totalMinutes / 60);
    const minutes = Math.round(totalMinutes % 60);
    return `${hours}h ${minutes}min`;
}

function toISODateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getDurationMs(p) {
    if (!p.endTime) return 0;
    return (new Date(p.endTime) - new Date(p.timestamp)) - (p.pauseDurationMs || 0);
}

async function logAction(pointageId, action, details = {}) {
    try {
        const logData = { action, modifiedBy: currentUser.displayName, timestamp: serverTimestamp(), details };
        await addDoc(collection(db, `pointages/${pointageId}/auditLog`), logData);
    } catch (error) { console.error("Erreur lors de l'enregistrement du log:", error); }
}

export async function render(params = {}) {
    targetUser = (params.userId && currentUser.role === 'admin') ? { uid: params.userId, name: params.userName } : { uid: currentUser.uid, name: "Mon" };

    try {
        const userDoc = await getDoc(doc(db, "users", targetUser.uid));
        const uData = userDoc.data();
        targetUser.contractHours = uData?.contractHours || 38;
        targetUser.contractHistory = uData?.contractHistory || [];
    } catch(e) {
        targetUser.contractHours = 38;
        targetUser.contractHistory = [];
    }

    pageContent.innerHTML = `
        <div class="max-w-5xl mx-auto">
            <div class="flex flex-wrap justify-between items-center mb-4 gap-4">

                <div class="flex items-center gap-2">
                    <h2 class="text-2xl font-bold">Historique de</h2>
                    ${currentUser.role === 'admin' ? `
                        <select id="userSwitchDropdown" class="user-switch">
                            <option value="${targetUser.uid}">${targetUser.name}</option>
                        </select>
                    ` : `
                        <h2 class="text-2xl font-bold" style="color: var(--color-primary);">${targetUser.name}</h2>
                    `}
                </div>

                <div class="flex items-center gap-2">
                    <div id="view-toggle" class="segmented">
                        <button id="showListViewBtn" class="px-3 py-1 text-sm rounded-md font-semibold view-toggle-btn active">Liste</button>
                        <button id="showCalendarViewBtn" class="px-3 py-1 text-sm rounded-md font-semibold view-toggle-btn">Calendrier</button>
                    </div>

                    ${currentUser.role === 'admin' ? `
                    <button id="localStealthToggleBtn" class="px-3 py-1.5 rounded-md font-bold text-white transition-colors bg-green-500 text-sm shadow-sm flex items-center gap-2">
                        Heures réelles
                    </button>
                    ` : ''}

                    ${(targetUser.uid === currentUser.uid || currentUser.role === 'admin') ? `
                    <button id="downloadPdfBtn" class="btn btn-secondary"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="pointer-events: none;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>PDF</button>
                    ` : ''}
                </div>
            </div>

            <div id="filters-container" class="p-4 rounded-lg mb-4" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                <button id="toggleFiltersBtn" class="w-full font-bold py-2 px-4 rounded text-left flex items-center gap-2" style="background-color: var(--color-background); border: 1px solid var(--color-border);">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="pointer-events: none;"><path d="M22 3H2l8 9.46V19l4 2v-8.54z"/></svg> Affiner la recherche
                </button>
                <div id="filters-content" class="hidden mt-4">
                    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                        <div>
                            <label for="filterStartDate" class="text-sm font-medium">Date de début</label>
                            <input type="date" id="filterStartDate" class="w-full border p-2 rounded mt-1" style="background-color: var(--color-background); border-color: var(--color-border);">
                        </div>
                        <div>
                            <label for="filterEndDate" class="text-sm font-medium">Date de fin</label>
                            <input type="date" id="filterEndDate" class="w-full border p-2 rounded mt-1" style="background-color: var(--color-background); border-color: var(--color-border);">
                        </div>
                        <div>
                            <label for="filterChantier" class="text-sm font-medium">Chantier</label>
                            <select id="filterChantier" class="w-full border p-2 rounded mt-1" style="background-color: var(--color-background); border-color: var(--color-border);"></select>
                        </div>
                        <div class="flex gap-2">
                            <button id="applyFiltersBtn" class="w-full text-white font-bold px-4 py-2 rounded" style="background-color: var(--color-primary);">Filtrer</button>
                            <button id="resetFiltersBtn" class="w-full px-4 py-2 rounded" style="background-color: var(--color-background); border: 1px solid var(--color-border);" title="Réinitialiser" aria-label="Réinitialiser"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="pointer-events: none; margin: 0 auto;"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg></button>
                        </div>
                    </div>
                </div>
            </div>
            <div id="list-view">
                <div id="quickPeriods" class="quick-periods" role="group" aria-label="Période">
                    <button type="button" data-period="week" class="is-active">Cette semaine</button>
                    <button type="button" data-period="lastweek">Semaine dernière</button>
                    <button type="button" data-period="month">Ce mois</button>
                    <button type="button" data-period="lastmonth">Mois dernier</button>
                </div>
                <div id="activeFilterBanner" class="filter-banner hidden"></div>
                <div class="rounded-lg shadow-sm p-4 mb-4" id="weekly-nav" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                    <div class="flex justify-between items-center">
                        <button id="prevWeekBtn" class="nav-arrow" aria-label="Précédent"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg></button>
                        <div id="currentPeriodDisplay" class="text-center font-semibold text-lg"></div>
                        <button id="nextWeekBtn" class="nav-arrow" aria-label="Suivant"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></button>
                    </div>
                </div>
                <div id="totalsDisplay" class="history-totals"></div>
                <div id="historyList" class="space-y-4"></div>
            </div>

            <div id="calendar-view" class="hidden">
                 <div class="rounded-lg shadow-sm p-4" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                    <div id="calendar-header" class="flex justify-between items-center mb-4">
                        <button id="prevMonthBtn" class="nav-arrow" aria-label="Précédent"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg></button>
                        <h3 id="calendarMonthYear" class="text-xl font-bold"></h3>
                        <button id="nextMonthBtn" class="nav-arrow" aria-label="Suivant"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></button>
                    </div>
                    <div id="calendar-grid" class="grid grid-cols-7 gap-1"></div>
                    <div class="calendar-legend">
                        <span><i style="background: rgba(250, 204, 21, 0.35);"></i>Moins de 7 h 30</span>
                        <span><i style="background: rgba(34, 197, 94, 0.35);"></i>7 h 30 à 8 h</span>
                        <span><i style="background: rgba(249, 115, 22, 0.35);"></i>Plus de 8 h</span>
                    </div>
                </div>
            </div>
        </div>

        <div id="entryModal" class="hidden fixed inset-0 bg-black bg-opacity-60 flex justify-center items-start overflow-y-auto z-30 p-4">
            <div class="p-6 rounded-lg shadow-xl w-full max-w-lg my-8" style="background-color: var(--color-surface);">
                <div class="flex justify-between items-center mb-4">
                    <h3 id="modalTitle" class="text-xl font-bold"></h3>
                    <p id="modalStepIndicator" class="text-sm font-semibold" style="color: var(--color-text-muted);"></p>
                </div>
                <form id="entryForm" class="space-y-4">
                    <input type="hidden" id="entryDate"><input type="hidden" id="entryId">
                    <input type="hidden" id="entryOwnerUid">
                    <input type="hidden" id="entryOwnerName">
                    <div data-step="1" class="wizard-step">
                        <label for="entryChantier" class="text-lg font-medium">Quel chantier ?</label>
                        <select id="entryChantier" class="w-full border p-2 rounded mt-2 text-lg" style="background-color: var(--color-background); border-color: var(--color-border);" required></select>
                    </div>
                    <div data-step="2" class="wizard-step">
                        <label class="text-lg font-medium">À quelles heures ?</label>
                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-2">
                            <div><label for="entryStartTime" class="text-sm">Début</label><input id="entryStartTime" type="time" class="w-full border p-2 rounded" style="background-color: var(--color-background); border-color: var(--color-border);" required /></div>
                            <div><label for="entryEndTime" class="text-sm">Fin</label><input id="entryEndTime" type="time" class="w-full border p-2 rounded" style="background-color: var(--color-background); border-color: var(--color-border);" required /></div>
                            <div><label for="entryPauseMinutes" class="text-sm">Pause (min)</label><input id="entryPauseMinutes" type="number" min="0" placeholder="ex: 30" class="w-full border p-2 rounded" style="background-color: var(--color-background); border-color: var(--color-border);" /></div>
                        </div>
                    </div>
                    <div data-step="3" class="wizard-step">
                        <label class="text-lg font-medium">Qui était présent ?</label>
                        <div id="entryColleaguesContainer" class="mt-2 p-2 border rounded max-h-40 overflow-y-auto space-y-1" style="border-color: var(--color-border);"></div>
                    </div>
                    <div data-step="4" class="wizard-step">
                        <label for="entryNotes" class="text-lg font-medium">Avez-vous des informations à préciser ?</label>
                        <textarea id="entryNotes" placeholder="(Optionnel)" class="w-full border p-2 rounded mt-2 h-24" style="background-color: var(--color-background); border-color: var(--color-border);"></textarea>
                    </div>
                    <div id="wizard-actions" class="flex justify-between items-center pt-4 border-t" style="border-color: var(--color-border);">
                        <button type="button" id="wizardPrevBtn" class="px-6 py-2 rounded" style="background-color: var(--color-background); border: 1px solid var(--color-border);">Précédent</button>
                        <div>
                            <button type="button" id="cancelEntryBtn" class="px-6 py-2 rounded mr-2" style="color: var(--color-text-muted);">Annuler</button>
                            <button type="button" id="wizardNextBtn" class="text-white font-bold px-6 py-2 rounded" style="background-color: var(--color-primary);">Suivant</button>
                            <button type="submit" id="wizardSaveBtn" class="text-white font-bold px-6 py-2 rounded" style="background-color: var(--color-primary);">Enregistrer</button>
                        </div>
                    </div>
                </form>
            </div>
        </div>

        <div id="reassignModal" class="hidden fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-40 p-4">
            <div class="p-6 rounded-lg shadow-xl w-full max-w-sm" style="background-color: var(--color-surface);">
                <h3 class="text-xl font-bold mb-4">Dupliquer ce pointage</h3>
                <p class="mb-4 text-sm" style="color: var(--color-text-muted);">Sélectionnez l'employé pour qui vous souhaitez créer une copie identique de ce pointage.</p>
                <select id="userSelect" class="w-full border p-2 rounded mb-6" style="background-color: var(--color-background); border-color: var(--color-border);"></select>
                <div class="flex justify-end gap-4">
                    <button id="reassignCancelBtn" class="px-4 py-2 rounded" style="background-color: var(--color-background); border: 1px solid var(--color-border);">Annuler</button>
                    <button id="reassignConfirmBtn" class="text-white font-bold px-4 py-2 rounded" style="background-color: var(--color-primary);">Dupliquer</button>
                </div>
            </div>
        </div>
    `;

    setTimeout(async () => {
        await cacheModalData();

        if (currentUser.role === 'admin') {
            const dropdown = document.getElementById('userSwitchDropdown');
            if (dropdown) {
                try {
                    const users = await getUsers();
                    const activeUsers = users.filter(u => u.status !== 'banned');

                    dropdown.innerHTML = activeUsers.map(u =>
                        `<option value="${u.id}" ${u.id === targetUser.uid ? 'selected' : ''}>${u.displayName}</option>`
                    ).join('');

                    dropdown.addEventListener('change', (e) => {
                        const selectedOption = e.target.options[e.target.selectedIndex];
                        navigateTo('user-history', {
                            userId: e.target.value,
                            userName: selectedOption.text
                        });
                    });
                } catch (error) {
                    console.error("Erreur chargement menu utilisateurs:", error);
                }
            }
        }

        setupEventListeners();
        setupReassignModalListeners();
        currentWeekOffset = 0;
        loadHistoryForWeek();
    }, 0);
}

function setupReassignModalListeners() {
    reassignModal = document.getElementById('reassignModal');
    userSelect = document.getElementById('userSelect');
    reassignConfirmBtn = document.getElementById('reassignConfirmBtn');
    reassignCancelBtn = document.getElementById('reassignCancelBtn');

    if(!reassignConfirmBtn) return;

    reassignConfirmBtn.addEventListener('click', async () => {
        const pointageId = reassignModal.dataset.pointageId;
        if (!pointageId) return;

        const selectedOption = userSelect.options[userSelect.selectedIndex];
        if (!selectedOption || !selectedOption.value) {
            showInfoModal("Attention", "Veuillez sélectionner un employé.");
            return;
        }

        const newUserId = selectedOption.value;
        const newUserName = selectedOption.dataset.name;
        const pointageToDuplicate = allPointages.find(p => p.id === pointageId);

        const confirmationMessage = `Voulez-vous vraiment dupliquer ce pointage de "${pointageToDuplicate.chantier}" pour ${newUserName} ? `;

        reassignModal.classList.add('hidden');
        const userConfirmed = await showConfirmationModal("Confirmation de Duplication", confirmationMessage);

        if (userConfirmed) {
            await duplicatePointage(pointageId, newUserId, newUserName, pointageToDuplicate);
        }
    });

    reassignCancelBtn.addEventListener('click', () => {
        reassignModal.classList.add('hidden');
    });
}

async function cacheModalData() {
    const chantiersQuery = query(collection(db, "chantiers"), orderBy("name"));
    const colleaguesQuery = query(collection(db, "colleagues"), orderBy("name"));
    const usersQuery = query(collection(db, "users"), where("status", "==", "approved"), orderBy("displayName"));
    const [chantiersSnapshot, colleaguesSnapshot, usersSnapshot] = await Promise.all([getDocs(chantiersQuery), getDocs(colleaguesQuery), getDocs(usersQuery)]);

    chantiersCache = chantiersSnapshot.docs.map(doc => ({
        name: doc.data().name,
        isHideable: doc.data().isHideable || false,
        status: doc.data().status
    }));

    const colleagueNames = colleaguesSnapshot.docs.map(doc => doc.data().name);
    const userNames = usersSnapshot.docs.map(doc => doc.data().displayName);
    colleaguesCache = [...new Set([...colleagueNames, ...userNames])].sort((a, b) => a.localeCompare(b));

    const filterChantierSelect = document.getElementById('filterChantier');
    filterChantierSelect.innerHTML = '<option value="">Tous les chantiers</option>' + [...new Set(chantiersCache.map(c => c.name))].map(name => `<option value="${name}">${name}</option>`).join('');
}

async function getPointages(startDate, endDate, chantierFilter = null) {
    let pointagesBaseQuery = [
        where("uid", "==", targetUser.uid),
        where("timestamp", ">=", startDate.toISOString()),
        where("timestamp", "<", new Date(endDate.getTime() + 86400000).toISOString())
    ];
    if (chantierFilter) {
        pointagesBaseQuery.push(where("chantier", "==", chantierFilter));
    }
    const pointagesQuery = query(collection(db, "pointages"), ...pointagesBaseQuery, orderBy("timestamp", "asc"));

    const trajetsStartDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    const trajetsEndDate = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 23, 59, 59);
    const trajetsQuery = query(collection(db, "trajets"),
        where("id_utilisateur", "==", targetUser.uid),
        where("date_creation", ">=", trajetsStartDate),
        where("date_creation", "<=", trajetsEndDate)
    );
    const [pointagesSnapshot, trajetsSnapshot] = await Promise.all([getDocs(pointagesQuery), getDocs(trajetsQuery)]);

    const pointages = pointagesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const trajetsMap = new Map();
    trajetsSnapshot.forEach(doc => trajetsMap.set(doc.data().id_pointage_arrivee, doc.data()));

    return { pointages, trajetsMap };
}

function applyStealthSmoothing(rawPointages) {
    const MAX_DAILY_MS = 9 * 3600000;
    const hiddenChantiers = chantiersCache.filter(c => c.isHideable).map(c => c.name);

    let validPointages = JSON.parse(JSON.stringify(rawPointages));
    validPointages = validPointages.filter(p => !hiddenChantiers.includes(p.chantier));

    // --- FILTRE ANTI-DOUBLON INTELLIGENT (Tolérance 5 minutes) ---
    validPointages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    let uniquePointages = [];

    for (let p of validPointages) {
        if (!p.endTime) {
            uniquePointages.push(p);
            continue;
        }

        let isDuplicate = false;
        let pStart = new Date(p.timestamp).getTime();
        let pEnd = new Date(p.endTime).getTime();
        let pChantier = (p.chantier || "").toLowerCase().trim();

        for (let u of uniquePointages) {
            if (!u.endTime) continue;
            let uStart = new Date(u.timestamp).getTime();
            let uEnd = new Date(u.endTime).getTime();
            let uChantier = (u.chantier || "").toLowerCase().trim();

            if (pChantier === uChantier) {
                if (Math.abs(pStart - uStart) <= 300000 && Math.abs(pEnd - uEnd) <= 300000) {
                    isDuplicate = true;
                    if ((pEnd - pStart) > (uEnd - uStart)) {
                        u.timestamp = p.timestamp;
                        u.endTime = p.endTime;
                        u.pauseDurationMs = p.pauseDurationMs;
                    }
                    break;
                }
            }
        }

        if (!isDuplicate) {
            uniquePointages.push(p);
        }
    }
    validPointages = uniquePointages;
    // -----------------------------------------------------------

    const byWeek = {};
    validPointages.forEach(p => {
        if (!p.endTime) return;
        const d = new Date(p.timestamp);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(new Date(p.timestamp).setDate(diff));
        monday.setHours(0, 0, 0, 0);
        const weekKey = monday.getTime();

        if (!byWeek[weekKey]) byWeek[weekKey] = [];
        byWeek[weekKey].push(p);
    });

    let displayPointages = [];

    for (const weekKey in byWeek) {

        let activeContractHours = targetUser.contractHours || 38;

        if (targetUser.contractHistory && targetUser.contractHistory.length > 0) {
            const weekDate = new Date(parseInt(weekKey));
            const yyyy = weekDate.getFullYear();
            const mm = String(weekDate.getMonth() + 1).padStart(2, '0');
            const dd = String(weekDate.getDate()).padStart(2, '0');
            const weekDateStr = `${yyyy}-${mm}-${dd}`;

            const pastContracts = targetUser.contractHistory.filter(c => c.startDate <= weekDateStr);

            if (pastContracts.length > 0) {
                pastContracts.sort((a,b) => new Date(a.startDate) - new Date(b.startDate));
                activeContractHours = pastContracts[pastContracts.length - 1].hours;
            } else {
                const allSorted = [...targetUser.contractHistory].sort((a,b) => new Date(a.startDate) - new Date(b.startDate));
                activeContractHours = allSorted[0].hours;
            }
        }

        const contractMs = activeContractHours * 3600000;

        let rawWeekPoints = byWeek[weekKey];
        rawWeekPoints.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        let weekPoints = [];
        let dailyAcc = {};

        for (let p of rawWeekPoints) {
            let dateStr = new Date(p.timestamp).toDateString();
            if (!dailyAcc[dateStr]) dailyAcc[dateStr] = 0;

            let dur = getDurationMs(p);
            if (dailyAcc[dateStr] >= MAX_DAILY_MS) {
                continue;
            } else if (dailyAcc[dateStr] + dur > MAX_DAILY_MS) {
                let allowed = MAX_DAILY_MS - dailyAcc[dateStr];
                p.endTime = new Date(new Date(p.timestamp).getTime() + allowed + (p.pauseDurationMs || 0)).toISOString();
                weekPoints.push(p);
                dailyAcc[dateStr] += allowed;
            } else {
                weekPoints.push(p);
                dailyAcc[dateStr] += dur;
            }
        }

        let weekdays = [];
        let weekends = [];

        weekPoints.forEach(p => {
            const day = new Date(p.timestamp).getDay();
            if (day === 0 || day === 6) weekends.push(p);
            else weekdays.push(p);
        });

        let dailyTotals = {1:0, 2:0, 3:0, 4:0, 5:0};
        weekdays.forEach(p => {
            let day = new Date(p.timestamp).getDay();
            if (day >= 1 && day <= 5) {
                dailyTotals[day] += getDurationMs(p);
            }
        });

        let weekdayTotalMs = Object.values(dailyTotals).reduce((a,b) => a+b, 0);

        if (weekdayTotalMs < contractMs && weekends.length > 0) {
            let capacityMs = contractMs - weekdayTotalMs;

            for (let wp of weekends) {
                if (capacityMs <= 0) break;
                let wpDuration = getDurationMs(wp);

                let sortedDays = [1, 2, 3, 4, 5].sort((a, b) => dailyTotals[a] - dailyTotals[b]);

                for (let day of sortedDays) {
                    if (wpDuration <= 0 || capacityMs <= 0) break;

                    let availableSpace = MAX_DAILY_MS - dailyTotals[day];
                    if (availableSpace > 0) {

                        let targetDateObj = new Date(parseInt(weekKey));
                        targetDateObj.setDate(targetDateObj.getDate() + (day - 1));
                        targetDateObj.setHours(8, 0, 0, 0);

                        if (isBelgianHoliday(targetDateObj)) {
                            continue;
                        }

                        let takeMs = Math.min(wpDuration, availableSpace, capacityMs);
                        let fakeP = JSON.parse(JSON.stringify(wp));

                        weekdays.filter(p => new Date(p.timestamp).getDay() === day).forEach(p => {
                            let et = new Date(p.endTime);
                            if (et > targetDateObj) targetDateObj = et;
                        });

                        fakeP.timestamp = targetDateObj.toISOString();
                        fakeP.endTime = new Date(targetDateObj.getTime() + takeMs + (fakeP.pauseDurationMs || 0)).toISOString();

                        weekdays.push(fakeP);
                        dailyTotals[day] += takeMs;
                        weekdayTotalMs += takeMs;
                        capacityMs -= takeMs;
                        wpDuration -= takeMs;
                    }
                }
            }
        }

        weekdays.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        let finalWeekdays = [];
        let accumulatedMs = 0;
        const absoluteMaxMs = contractMs + 5400000;

        for (let p of weekdays) {
            let durationMs = getDurationMs(p);

            if (accumulatedMs + durationMs <= absoluteMaxMs) {
                finalWeekdays.push(p);
                accumulatedMs += durationMs;
            } else {
                if (accumulatedMs >= contractMs - 7200000) {
                    break;
                } else {
                    let dayOfMonth = new Date(p.timestamp).getDate();
                    let variance = ((dayOfMonth % 5) - 2) * 900000;

                    let targetTotalMs = contractMs + variance;
                    if (targetTotalMs < accumulatedMs) targetTotalMs = accumulatedMs;

                    let allowedMs = targetTotalMs - accumulatedMs;
                    allowedMs = Math.round(allowedMs / 300000) * 300000;

                    if (allowedMs > 0) {
                        p.endTime = new Date(new Date(p.timestamp).getTime() + allowedMs + (p.pauseDurationMs || 0)).toISOString();
                        finalWeekdays.push(p);
                        accumulatedMs += allowedMs;
                    }
                    break;
                }
            }
        }

        displayPointages.push(...finalWeekdays);
    }
    return displayPointages;
}

async function displayHistoryList(startDate, endDate, chantierFilter = null) {
    lastLoadedState = { start: startDate, end: endDate, chantier: chantierFilter };

    const historyList = document.getElementById("historyList");
    historyList.innerHTML = `<p class='text-center p-4' style='color: var(--color-text-muted);'>Chargement...</p>`;

    const { pointages, trajetsMap } = await getPointages(startDate, endDate, chantierFilter);
    allPointages = pointages;

    let displayPointages = [...pointages];
    if (localStealthMode === true) {
        displayPointages = applyStealthSmoothing(pointages);
    }

    pointagesPourPdf = JSON.parse(JSON.stringify(displayPointages));

    const dataByDate = {};
    let currentDate = new Date(startDate);
    let endDateLimit = new Date(endDate);
    while (currentDate <= endDateLimit) {
        const dateString = toISODateString(currentDate);
        dataByDate[dateString] = { entries: [], dailyTotalMs: 0, dailyTotalKm: 0, dailyTotalMin: 0 };
        currentDate.setDate(currentDate.getDate() + 1);
    }

    displayPointages.forEach(p => {
        const localDate = new Date(p.timestamp);
        const date = toISODateString(localDate);
        if (dataByDate[date]) {
            dataByDate[date].entries.push(p);
            if (p.endTime) dataByDate[date].dailyTotalMs += getDurationMs(p);
            if (trajetsMap.has(p.id)) {
                const trajet = trajetsMap.get(p.id);
                dataByDate[date].dailyTotalKm += trajet.distance_km || 0;
                dataByDate[date].dailyTotalMin += trajet.duree_min || 0;
            }
        }
    });

    historyList.innerHTML = "";
    let totalMs = 0, totalKm = 0, totalMin = 0, daysWorked = 0;

    const daysOfWeek = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

    Object.keys(dataByDate).sort().forEach(dateString => {
        const dayData = dataByDate[dateString];
        totalMs += dayData.dailyTotalMs;
        totalKm += dayData.dailyTotalKm;
        totalMin += dayData.dailyTotalMin;

        if(chantierFilter && dayData.entries.length === 0) return;
        if (dayData.entries.length > 0) daysWorked++;

        const dayWrapper = document.createElement('div');
        const isEmptyDay = dayData.entries.length === 0;
        dayWrapper.className = `history-day${isEmptyDay ? ' is-empty' : ''}${dateString === toISODateString(new Date()) ? ' is-today' : ''}`;

        const dayDate = new Date(`${dateString}T12:00:00`);
        const dayHeaderHTML = `
            <div class="history-day-head">
                <div class="flex items-center gap-3 flex-wrap">
                    <h3 class="history-day-title">${daysOfWeek[dayDate.getDay()]} ${dayDate.toLocaleDateString('fr-FR', {day: 'numeric', month: 'long'})}</h3>
                    ${(currentUser.role === 'admin' && !localStealthMode) ? `<button class="add-pointage-btn text-sm font-semibold" style="color: var(--color-primary);" data-date="${dateString}">+ Ajouter</button>` : ''}
                </div>
                <div class="text-right">
                    ${isEmptyDay ? '<span class="history-day-none">Aucun pointage</span>' : `<div class="stat-row-value">${formatMilliseconds(dayData.dailyTotalMs)}</div>`}
                    ${dayData.dailyTotalKm > 0 ? `<div class="text-xs" style="color: var(--color-text-muted);">${dayData.dailyTotalKm.toFixed(1)} km / ${formatMinutes(dayData.dailyTotalMin)}</div>` : ''}
                </div>
            </div>`;

        const entriesContainer = document.createElement('div');
        entriesContainer.className = 'space-y-3';
        dayData.entries.forEach(d => entriesContainer.appendChild(createHistoryEntryElement(d, trajetsMap.get(d.id))));
        dayWrapper.innerHTML = dayHeaderHTML;
        dayWrapper.appendChild(entriesContainer);
        historyList.appendChild(dayWrapper);
    });

    document.getElementById("totalsDisplay").innerHTML = `
        <div class="hours-kpi"><span class="hours-kpi-label">Heures</span><span class="hours-kpi-value">${formatMilliseconds(totalMs)}</span><span class="hours-kpi-sub">sur la période</span></div>
        <div class="hours-kpi"><span class="hours-kpi-label">Jours travaillés</span><span class="hours-kpi-value">${daysWorked}</span><span class="hours-kpi-sub">${daysWorked ? `≈ ${formatMilliseconds(totalMs / daysWorked)} / jour` : 'aucun pointage'}</span></div>
        <div class="hours-kpi"><span class="hours-kpi-label">Trajets</span><span class="hours-kpi-value">${totalKm.toFixed(1)} km</span><span class="hours-kpi-sub">${formatMinutes(totalMin)} de route</span></div>`;

    updatePdfButtonState(pointagesPourPdf.length > 0);
    historyList.removeEventListener('click', handleHistoryClick);
    historyList.addEventListener('click', handleHistoryClick);
}

async function renderCalendar() {
    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    document.getElementById("calendarMonthYear").textContent = currentCalendarDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const { pointages } = await getPointages(firstDayOfMonth, lastDayOfMonth);

    let displayPointages = pointages;
    if (localStealthMode === true) {
        displayPointages = applyStealthSmoothing(pointages);
    }

    const pointagesByDate = displayPointages.reduce((acc, p) => {
        const localDate = new Date(p.timestamp);
        const dateKey = toISODateString(localDate);
        if (!acc[dateKey]) acc[dateKey] = 0;
        if (p.endTime) acc[dateKey] += getDurationMs(p);
        return acc;
    }, {});

    const grid = document.getElementById("calendar-grid");
    grid.innerHTML = '';
    const days = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
    days.forEach(day => grid.innerHTML += `<div class="font-semibold text-center text-sm p-2" style="color: var(--color-text-muted);">${day}</div>`);

    const startOffset = (firstDayOfMonth.getDay() + 6) % 7;
    for (let i = 0; i < startOffset; i++) grid.innerHTML += '<div></div>';

    for (let i = 1; i <= lastDayOfMonth.getDate(); i++) {
        const date = new Date(year, month, i);
        const dateKey = toISODateString(date);
        const totalMs = pointagesByDate[dateKey] || 0;

        let bgColor = 'var(--color-background)';
        if (totalMs > 0) {
            const hours = totalMs / 3600000;
            if (hours > 8) bgColor = 'rgba(249, 115, 22, 0.2)';
            else if (hours >= 7.5) bgColor = 'rgba(34, 197, 94, 0.2)';
            else bgColor = 'rgba(250, 204, 21, 0.2)';
        }
        const isToday = dateKey === toISODateString(new Date());
        grid.innerHTML += `
            <button type="button" class="calendar-day${isToday ? ' is-today' : ''}" data-day="${dateKey}" style="background-color: ${bgColor};">
                <div class="font-bold text-sm">${i}</div>
                ${totalMs > 0 ? `<div class="text-xs font-semibold text-right">${formatMilliseconds(totalMs)}</div>` : ''}
            </button>`;
    }
    // Un appui sur un jour affiche son détail dans la liste
    grid.onclick = (e) => {
        const cell = e.target.closest('[data-day]');
        if (!cell) return;
        const [y, m, d] = cell.dataset.day.split('-').map(Number);
        switchView('list');
        const label = new Date(y, m - 1, d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
        showRange(new Date(y, m - 1, d), new Date(y, m - 1, d, 23, 59, 59, 999), label.charAt(0).toUpperCase() + label.slice(1), null, null);
    };
}

function setupEventListeners() {
    const toggleBtn = document.getElementById('toggleFiltersBtn');
    const filtersContent = document.getElementById('filters-content');
    const toggleLabel = toggleBtn.innerHTML;
    toggleBtn.addEventListener('click', () => {
        const isHidden = filtersContent.classList.toggle('hidden');
        toggleBtn.innerHTML = isHidden ? toggleLabel : 'Masquer les filtres';
    });

    // Raccourcis de période
    document.querySelectorAll('#quickPeriods [data-period]').forEach(btn => {
        btn.onclick = () => {
            const now = new Date();
            const period = btn.dataset.period;
            if (period === 'week') { resetFilters(); return; }
            if (period === 'lastweek') { resetFilters(); currentWeekOffset = -1; loadHistoryForWeek(); setActivePeriod('lastweek'); return; }
            const offset = period === 'lastmonth' ? -1 : 0;
            const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
            const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0, 23, 59, 59, 999);
            const label = start.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
            showRange(start, end, label.charAt(0).toUpperCase() + label.slice(1), null, period);
        };
    });

    document.getElementById('showListViewBtn').onclick = () => switchView('list');
    document.getElementById('showCalendarViewBtn').onclick = () => switchView('calendar');
    document.getElementById('applyFiltersBtn').onclick = applyFilters;
    document.getElementById('resetFiltersBtn').onclick = resetFilters;
    document.getElementById("prevWeekBtn").onclick = () => { currentWeekOffset--; loadHistoryForWeek(); };
    document.getElementById("nextWeekBtn").onclick = () => { currentWeekOffset++; loadHistoryForWeek(); };
    document.getElementById('prevMonthBtn').onclick = () => { currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1); renderCalendar(); };
    document.getElementById('nextMonthBtn').onclick = () => { currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1); renderCalendar(); };
    const pdfBtn = document.getElementById("downloadPdfBtn");
    if (pdfBtn) pdfBtn.onclick = generateHistoryPDF;

    const stealthBtn = document.getElementById('localStealthToggleBtn');
    if (stealthBtn) {
        stealthBtn.onclick = () => {
            localStealthMode = !localStealthMode;
            if (localStealthMode) {
                stealthBtn.className = "px-3 py-1.5 rounded-md font-bold text-white transition-colors bg-red-500 text-sm shadow-sm flex items-center gap-2";
                stealthBtn.innerHTML = "Heures lissées (PDF)";
            } else {
                stealthBtn.className = "px-3 py-1.5 rounded-md font-bold text-white transition-colors bg-green-500 text-sm shadow-sm flex items-center gap-2";
                stealthBtn.innerHTML = "Heures réelles";
            }
            if (lastLoadedState.start) {
                displayHistoryList(lastLoadedState.start, lastLoadedState.end, lastLoadedState.chantier);
            }
        };
    }
}

function switchView(view) {
    const listView = document.getElementById('list-view');
    const calendarView = document.getElementById('calendar-view');
    const listBtn = document.getElementById('showListViewBtn');
    const calendarBtn = document.getElementById('showCalendarViewBtn');
    const filtersContainer = document.getElementById('filters-container');
    const pdfBtn = document.getElementById("downloadPdfBtn");
    const localToggleBtn = document.getElementById("localStealthToggleBtn");

    if (view === 'calendar') {
        listView.classList.add('hidden');
        calendarView.classList.remove('hidden');
        listBtn.classList.remove('active');
        calendarBtn.classList.add('active');
        filtersContainer.classList.add('hidden');
        if (pdfBtn) pdfBtn.classList.add('hidden');
        if (localToggleBtn) localToggleBtn.classList.add('hidden');
        currentCalendarDate = new Date();
        renderCalendar();
    } else {
        listView.classList.remove('hidden');
        calendarView.classList.add('hidden');
        listBtn.classList.add('active');
        calendarBtn.classList.remove('active');
        filtersContainer.classList.remove('hidden');
        if (pdfBtn) pdfBtn.classList.remove('hidden');
        if (localToggleBtn) localToggleBtn.classList.remove('hidden');
    }
}

function setActivePeriod(period) {
    document.querySelectorAll('#quickPeriods [data-period]').forEach(b => b.classList.toggle('is-active', b.dataset.period === period));
}

// Affiche une période précise (raccourci, filtre, jour du calendrier) avec un bandeau qui la rappelle
function showRange(startDate, endDate, label, chantier = null, period = null) {
    document.getElementById('weekly-nav').style.display = 'none';
    const banner = document.getElementById('activeFilterBanner');
    banner.classList.remove('hidden');
    banner.innerHTML = `<span><strong>${label}</strong>${chantier ? ` · chantier « ${chantier.replace(/</g, '&lt;')} »` : ''}</span><button type="button" class="hours-back" id="clearFilterBtn">Revenir à la semaine</button>`;
    document.getElementById('clearFilterBtn').onclick = resetFilters;
    setActivePeriod(period);
    displayHistoryList(startDate, endDate, chantier);
}

function applyFilters() {
    const startDate = document.getElementById('filterStartDate').value;
    const endDate = document.getElementById('filterEndDate').value;
    const chantier = document.getElementById('filterChantier').value;

    if (!chantier && (!startDate || !endDate)) {
        showInfoModal("Attention", "Veuillez sélectionner un chantier OU une plage de dates complète.");
        return;
    }

    let sDate, eDate, periodText;
    if (startDate && endDate) {
        // Dates locales, fin de journée incluse (le dernier jour n'était pas pris en compte)
        const [sy, sm, sd] = startDate.split('-').map(Number);
        const [ey, em, ed] = endDate.split('-').map(Number);
        sDate = new Date(sy, sm - 1, sd);
        eDate = new Date(ey, em - 1, ed, 23, 59, 59, 999);
        periodText = `Du ${sDate.toLocaleDateString('fr-FR')} au ${eDate.toLocaleDateString('fr-FR')}`;
    } else {
        sDate = new Date('2020-01-01');
        eDate = new Date();
        eDate.setFullYear(eDate.getFullYear() + 5);
        periodText = "Toute la période";
    }

    showRange(sDate, eDate, periodText, chantier || null, null);
}

function resetFilters() {
    document.getElementById('weekly-nav').style.display = 'block';
    document.getElementById('activeFilterBanner')?.classList.add('hidden');
    document.getElementById('filterStartDate').value = '';
    document.getElementById('filterEndDate').value = '';
    document.getElementById('filterChantier').selectedIndex = 0;
    setActivePeriod('week');
    currentWeekOffset = 0;
    loadHistoryForWeek();
}

async function loadHistoryForWeek() {
    const { startOfWeek, endOfWeek } = getWeekDateRange(currentWeekOffset);
    document.getElementById("currentPeriodDisplay").textContent = `Semaine du ${startOfWeek.toLocaleDateString('fr-FR', {timeZone: 'UTC', day: 'numeric', month: 'long'})}`;
    await displayHistoryList(startOfWeek, endOfWeek);
}

function updatePdfButtonState(hasData) {
    const pdfBtn = document.getElementById("downloadPdfBtn");
    if (pdfBtn) {
        pdfBtn.disabled = !hasData;
        pdfBtn.style.opacity = hasData ? '1' : '0.5';
        pdfBtn.style.cursor = hasData ? 'pointer' : 'not-allowed';
        pdfBtn.title = hasData ? "Télécharger en PDF" : "Aucune donnée à exporter.";
    }
}

function handleHistoryClick(e) {
    if (currentUser.role !== 'admin' || localStealthMode === true) return;
    const target = e.target;
    if (target.closest('.add-pointage-btn')) {
        openEntryModal({ isEditing: false, date: target.closest('.add-pointage-btn').dataset.date });
    } else if (target.closest('.edit-btn')) {
        const pointageId = target.closest('.edit-btn').dataset.id;
        const pointageData = allPointages.find(p => p.id === pointageId);
        openEntryModal({ ...pointageData, isEditing: true });
    } else if (target.closest('.delete-btn')) {
        const pointageId = target.closest('.delete-btn').dataset.id;
        deletePointage(pointageId);
    } else if (target.closest('.reassign-btn')) {
        const pointageId = target.closest('.reassign-btn').dataset.id;
        openReassignModal(pointageId);
    }
}

function createHistoryEntryElement(d, trajetData) {
    const wrapper = document.createElement("div");
    wrapper.className = "p-3 border rounded-lg relative";
    wrapper.style.backgroundColor = 'var(--color-background)';
    wrapper.style.borderColor = 'var(--color-border)';

    let trajetDisplay = '';
    if (trajetData) {
        trajetDisplay = `<div class="entry-trip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 17h14M6 17l1.5-5h9L18 17M7 17v2M17 17v2"/><circle cx="8" cy="14.5" r=".5"/><circle cx="16" cy="14.5" r=".5"/></svg>${trajetData.distance_km.toFixed(1)} km · ${formatMinutes(trajetData.duree_min)}</div>`;
    }

    const startDate = new Date(d.timestamp);
    const endDate = d.endTime ? new Date(d.endTime) : null;
    let timeDisplay = "", durationDisplay = "", pauseDisplay = "";
    if (endDate) {
        const effectiveWorkMs = getDurationMs(d);
        timeDisplay = `De ${startDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} à ${endDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
        durationDisplay = `<div class="text-sm font-bold mt-1" style="color: var(--color-primary);">${formatMilliseconds(effectiveWorkMs)}</div>`;
        if (d.pauseDurationMs && d.pauseDurationMs > 0) {
            pauseDisplay = `<div class="text-xs text-yellow-600 mt-1">Pause : ${formatMilliseconds(d.pauseDurationMs)}</div>`;
        }
    } else {
        // Pointage encore en cours : on affiche l'heure de début au lieu d'une ligne vide
        timeDisplay = `Débuté à ${startDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} · en cours`;
        durationDisplay = `<span class="hours-live mt-1"><span class="hours-live-dot"></span>En cours</span>`;
    }
    wrapper.innerHTML = `<div class="${currentUser.role === 'admin' && !localStealthMode ? 'pr-28' : 'pr-20'}"><div class="font-bold">${d.chantier}</div><div class="text-sm" style="color: var(--color-text-muted);">${timeDisplay}</div>${trajetDisplay}<div class="text-xs mt-1" style="color: var(--color-text-muted);">Collègues : ${Array.isArray(d.colleagues) && d.colleagues.length > 0 ? d.colleagues.join(", ") : 'Aucun'}</div></div>${d.notes ? `<div class="mt-2 pt-2 border-t text-xs" style="border-color: var(--color-border); color: var(--color-text-muted);"><strong>Notes:</strong> ${d.notes}</div>` : ""}`;

    if (currentUser.role === 'admin' && !localStealthMode) {
        const controlsWrapper = document.createElement("div");
        controlsWrapper.className = "absolute top-2 right-3 flex flex-col items-end text-right";
        const buttonsDiv = document.createElement('div');
        buttonsDiv.className = 'entry-actions';
        buttonsDiv.innerHTML = `
            <button class="edit-btn icon-btn" title="Modifier" aria-label="Modifier" data-id="${d.id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>
            <button class="reassign-btn icon-btn" title="Réattribuer" aria-label="Réattribuer" data-id="${d.id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg></button>
            <button class="delete-btn icon-btn is-danger" title="Supprimer" aria-label="Supprimer" data-id="${d.id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg></button>
        `;
        controlsWrapper.appendChild(buttonsDiv);
        controlsWrapper.innerHTML += pauseDisplay + durationDisplay;
        wrapper.appendChild(controlsWrapper);
    } else {
        const durationWrapper = document.createElement("div");
        durationWrapper.className = "absolute top-2 right-3 flex flex-col items-end text-right";
        durationWrapper.innerHTML = pauseDisplay + durationDisplay;
        wrapper.appendChild(durationWrapper);
    }
    return wrapper;
}

async function deletePointage(pointageId) {
    if (currentUser.role !== 'admin') return;
    if (await showConfirmationModal("Confirmation", "Supprimer ce pointage ?")) {
        const pointageRef = doc(db, "pointages", pointageId);
        const pointageSnap = await getDoc(pointageRef);
        if(pointageSnap.exists()) {
             await logAction(pointageId, "Suppression", { deletedData: pointageSnap.data() });
        }
        await deleteDoc(pointageRef);
        resetFilters();
    }
}

async function openReassignModal(pointageId) {
    const pointageToReassign = allPointages.find(p => p.id === pointageId);
    if (!pointageToReassign) {
        showInfoModal("Erreur", "Pointage non trouvé.");
        return;
    }

    reassignModal.dataset.pointageId = pointageId;
    userSelect.innerHTML = '<option>Chargement des utilisateurs...</option>';
    reassignConfirmBtn.disabled = true;

    try {
        const users = await getUsers(true);
        const otherUsers = users.filter(user => user.uid !== pointageToReassign.uid);

        if (otherUsers.length === 0) {
            userSelect.innerHTML = '<option>Aucun autre utilisateur trouvé.</option>';
        } else {
            userSelect.innerHTML = otherUsers
                .map(user => `<option value="${user.uid}" data-name="${user.displayName}">${user.displayName}</option>`)
                .join('');
            reassignConfirmBtn.disabled = false;
        }
    } catch (error) {
        console.error("Erreur lors de la récupération des utilisateurs:", error);
        userSelect.innerHTML = '<option>Erreur de chargement.</option>';
    }

    reassignModal.classList.remove('hidden');
}

async function duplicatePointage(pointageId, newUserId, newUserName, originalPointage) {
    try {
        const newData = { ...originalPointage };
        delete newData.id;

        newData.uid = newUserId;
        newData.userName = newUserName;

        const originalNotes = originalPointage.notes || '';
        newData.notes = `(Dupliqué depuis ${currentUser.displayName}) ${originalNotes}`.trim();
        newData.createdAt = serverTimestamp();

        const newDocRef = await addDoc(collection(db, "pointages"), newData);

        await logAction(newDocRef.id, "Création par Duplication", {
            fromUser: { uid: currentUser.uid, name: currentUser.displayName },
            originalPointageId: pointageId
        });

        showInfoModal("Succès", `Le pointage a été dupliqué pour ${newUserName}. Votre pointage original est conservé.`);

    } catch (error) {
        console.error("Erreur lors de la duplication:", error);
        showInfoModal("Erreur", "La duplication a échoué. Veuillez réessayer.");
    }
}

function showWizardStep(step) {
    entryWizardStep = step;
    document.querySelectorAll('.wizard-step').forEach(el => el.classList.add('hidden'));
    document.querySelector(`[data-step="${step}"]`).classList.remove('hidden');
    const stepIndicator = document.getElementById('modalStepIndicator');
    const prevBtn = document.getElementById('wizardPrevBtn');
    const nextBtn = document.getElementById('wizardNextBtn');
    const saveBtn = document.getElementById('wizardSaveBtn');
    stepIndicator.textContent = `Étape ${step} sur 4`;
    prevBtn.classList.toggle('hidden', step === 1);
    nextBtn.classList.toggle('hidden', step === 4);
    saveBtn.classList.toggle('hidden', step !== 4);
}

function openEntryModal(data = {}) {
    const { isEditing } = data;
    const modal = document.getElementById('entryModal');
    const form = document.getElementById('entryForm');
    form.reset();
    const title = document.getElementById('modalTitle');
    const stepIndicator = document.getElementById('modalStepIndicator');
    const wizardSteps = document.querySelectorAll('.wizard-step');
    const wizardActions = document.getElementById('wizard-actions');
    const saveBtn = document.getElementById('wizardSaveBtn');
    const chantierSelect = document.getElementById('entryChantier');

    const activeChantiers = chantiersCache.filter(c => c.status === 'active');
    chantierSelect.innerHTML = '<option value="">-- Choisissez --</option>' + [...new Set(activeChantiers.map(c => c.name))].map(name => `<option value="${name}">${name}</option>`).join('');

    const colleaguesContainer = document.getElementById('entryColleaguesContainer');
    colleaguesContainer.innerHTML = colleaguesCache.map(name => `<label class="flex items-center gap-2"><input type="checkbox" value="${name}" name="entryColleagues" /><span>${name}</span></label>`).join('');

    if (isEditing) {
        title.textContent = "Modifier le pointage";
        stepIndicator.classList.add('hidden');
        wizardSteps.forEach(step => step.classList.remove('hidden'));
        wizardActions.querySelector('#wizardPrevBtn').classList.add('hidden');
        wizardActions.querySelector('#wizardNextBtn').classList.add('hidden');
        saveBtn.classList.remove('hidden');

        document.getElementById('entryId').value = data.id;
        document.getElementById('entryDate').value = new Date(data.timestamp).toISOString().split('T')[0];

        if (!activeChantiers.find(c => c.name === data.chantier)) {
             chantierSelect.innerHTML += `<option value="${data.chantier}">${data.chantier} (Archivé)</option>`;
        }
        chantierSelect.value = data.chantier;

        document.getElementById('entryStartTime').value = new Date(data.timestamp).toTimeString().substring(0, 5);
        document.getElementById('entryEndTime').value = new Date(data.endTime).toTimeString().substring(0, 5);
        const pauseMinutes = data.pauseDurationMs ? Math.round(data.pauseDurationMs / 60000) : '';
        document.getElementById('entryPauseMinutes').value = pauseMinutes;
        document.getElementById('entryNotes').value = data.notes || '';
        (data.colleagues || []).forEach(colleagueName => {
            const checkbox = colleaguesContainer.querySelector(`input[value="${colleagueName}"]`);
            if (checkbox) checkbox.checked = true;
        });

    } else {
        title.textContent = "Ajouter un pointage";
        stepIndicator.classList.remove('hidden');
        saveBtn.classList.add('hidden');
        wizardActions.querySelector('#wizardPrevBtn').classList.remove('hidden');
        wizardActions.querySelector('#wizardNextBtn').classList.remove('hidden');

        document.getElementById('entryOwnerUid').value = targetUser.uid;
        document.getElementById('entryOwnerName').value = targetUser.name;

        entryWizardData = { date: data.date };
        document.getElementById('entryId').value = '';
        document.getElementById('wizardNextBtn').onclick = handleWizardNext;
        document.getElementById('wizardPrevBtn').onclick = () => showWizardStep(entryWizardStep - 1);
        showWizardStep(1);
    }

    document.getElementById('cancelEntryBtn').onclick = () => modal.classList.add('hidden');
    form.onsubmit = saveEntry;
    modal.classList.remove('hidden');
}

function handleWizardNext() {
    switch (entryWizardStep) {
        case 1:
            const chantier = document.getElementById('entryChantier').value;
            if (!chantier) {
                showInfoModal("Attention", "Veuillez sélectionner un chantier.");
                return;
            }
            entryWizardData.chantier = chantier;
            break;
        case 2:
            const startTime = document.getElementById('entryStartTime').value;
            const endTime = document.getElementById('entryEndTime').value;
            if (!startTime || !endTime) {
                showInfoModal("Attention", "Veuillez renseigner une heure de début et de fin.");
                return;
            }
            if (endTime <= startTime) {
                showInfoModal("Erreur", "L'heure de fin doit être après l'heure de début.");
                return;
            }
            entryWizardData.startTime = startTime;
            entryWizardData.endTime = endTime;
            const pauseMinutes = parseInt(document.getElementById('entryPauseMinutes').value) || 0;
            entryWizardData.pauseDurationMs = pauseMinutes * 60000;
            break;
    }
    showWizardStep(entryWizardStep + 1);
}

async function saveEntry(e) {
    e.preventDefault();
    if (currentUser.role !== 'admin') return;

    const entryId = document.getElementById('entryId').value;
    const isEditing = !!entryId;
    let dataToSave;

    if (isEditing) {
        const date = document.getElementById('entryDate').value;
        const startTime = document.getElementById('entryStartTime').value;
        const endTime = document.getElementById('entryEndTime').value;

        if (!startTime || !endTime) {
            showInfoModal("Attention", "Veuillez renseigner une heure de début et de fin.");
            return;
        }

        const pauseMinutes = parseInt(document.getElementById('entryPauseMinutes').value) || 0;
        dataToSave = {
            chantier: document.getElementById('entryChantier').value,
            timestamp: new Date(`${date}T${startTime}`).toISOString(),
            endTime: new Date(`${date}T${endTime}`).toISOString(),
            pauseDurationMs: pauseMinutes * 60000,
            colleagues: Array.from(document.querySelectorAll('input[name="entryColleagues"]:checked')).map(el => el.value),
            notes: document.getElementById('entryNotes').value.trim()
        };
    } else {
        entryWizardData.colleagues = Array.from(document.querySelectorAll('input[name="entryColleagues"]:checked')).map(el => el.value);
        entryWizardData.notes = document.getElementById('entryNotes').value.trim();
        const { date, chantier, startTime, endTime, colleagues, notes, pauseDurationMs } = entryWizardData;

        if (!startTime || !endTime) {
            showInfoModal("Attention", "Veuillez renseigner une heure de début et de fin.");
            return;
        }

        dataToSave = {
            chantier,
            timestamp: new Date(`${date}T${startTime}`).toISOString(),
            endTime: new Date(`${date}T${endTime}`).toISOString(),
            pauseDurationMs: pauseDurationMs || 0,
            colleagues,
            notes: `(Saisie manuelle) ${notes}`
        };
    }

    try {
        if (isEditing) {
            const pointageRef = doc(db, "pointages", entryId);
            await updateDoc(pointageRef, dataToSave);
            showInfoModal("Succès", "Le pointage a été mis à jour.");
        } else {
            const ownerUid = document.getElementById('entryOwnerUid').value;
            const ownerName = document.getElementById('entryOwnerName').value;

            const fullData = {
                ...dataToSave,
                uid: ownerUid,
                userName: ownerName === "Mon" ? currentUser.displayName : ownerName,
                createdAt: serverTimestamp(),
                status: 'completed'
            };
            const newDocRef = await addDoc(collection(db, "pointages"), fullData);
            await logAction(newDocRef.id, "Création Manuelle", { createdData: fullData });
            showInfoModal("Succès", "Le pointage a été ajouté.");
        }
        document.getElementById('entryModal').classList.add('hidden');
        resetFilters();
    } catch (error) {
        console.error("Erreur de sauvegarde:", error);
        showInfoModal("Erreur", "L'enregistrement a échoué.");
    }
}

function generateHistoryPDF() {
    const dataForPdf = pointagesPourPdf.filter(p => p.endTime);

    if (dataForPdf.length === 0) {
        showInfoModal("Information", "Il n'y a aucune donnée à afficher sur le PDF.");
        return;
    }

    const { jsPDF } = window.jspdf;
    if (!jsPDF || !jsPDF.API.autoTable) {
        showInfoModal("Erreur", "La librairie PDF n'a pas pu être chargée.");
        return;
    }

    dataForPdf.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 40;
    const userName = targetUser.name === "Mon" ? currentUser.displayName : targetUser.name;
    const DARK = [15, 23, 42], PRIMARY = [79, 70, 229], MUTED = [100, 116, 139], LIGHT = [241, 245, 249];
    const time = (d) => new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    // Période : celle affichée à l'écran si elle est précise, sinon celle des pointages
    const firstDate = new Date(dataForPdf[0].timestamp);
    const lastDate = new Date(dataForPdf[dataForPdf.length - 1].timestamp);
    const usesScreenPeriod = lastLoadedState.start && new Date(lastLoadedState.start).getFullYear() > 2020 && new Date(lastLoadedState.end) < new Date(Date.now() + 366 * 86400000);
    const periodStart = usesScreenPeriod ? new Date(lastLoadedState.start) : firstDate;
    const periodEnd = usesScreenPeriod ? new Date(lastLoadedState.end) : lastDate;

    // --- En-tête ---
    doc.setFillColor(...DARK);
    doc.rect(0, 0, pageWidth, 92, 'F');
    doc.setTextColor(255);
    doc.setFont(undefined, 'bold');
    doc.setFontSize(18);
    doc.text("Relevé d'heures", margin, 42);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(10);
    doc.setTextColor(203, 213, 225);
    doc.text("Pointeuse LPF · Les Petites Fées, service de nettoyage", margin, 60);
    doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')} à ${time(new Date())}`, margin, 75);
    doc.setTextColor(255);
    doc.setFont(undefined, 'bold');
    doc.setFontSize(12);
    doc.text(userName, pageWidth - margin, 42, { align: 'right' });
    doc.setFont(undefined, 'normal');
    doc.setFontSize(10);
    doc.setTextColor(203, 213, 225);
    doc.text(`Du ${periodStart.toLocaleDateString('fr-FR')} au ${periodEnd.toLocaleDateString('fr-FR')}`, pageWidth - margin, 60, { align: 'right' });
    if (localStealthMode) doc.text("Heures lissées", pageWidth - margin, 75, { align: 'right' });

    // --- Regroupement par jour et par semaine ---
    const isoWeek = (date) => {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
        return Math.ceil((((d - new Date(Date.UTC(d.getUTCFullYear(), 0, 1))) / 86400000) + 1) / 7);
    };
    const days = [];
    dataForPdf.forEach(p => {
        const date = new Date(p.timestamp);
        const key = toISODateString(date);
        let day = days[days.length - 1];
        if (!day || day.key !== key) {
            day = { key, date, entries: [], totalMs: 0, week: `${date.getFullYear()}-${isoWeek(date)}`, weekNo: isoWeek(date) };
            days.push(day);
        }
        day.entries.push(p);
        day.totalMs += getDurationMs(p);
    });

    const totalEffectiveMs = days.reduce((sum, d) => sum + d.totalMs, 0);
    const totalPauseMs = dataForPdf.reduce((sum, p) => sum + (p.pauseDurationMs || 0), 0);

    // --- Résumé ---
    const boxes = [
        ['Travail effectif', formatMilliseconds(totalEffectiveMs)],
        ['Jours travaillés', String(days.length)],
        ['Pauses', formatMilliseconds(totalPauseMs)],
        ['Pointages', String(dataForPdf.length)],
    ];
    const gap = 10;
    const boxWidth = (pageWidth - margin * 2 - gap * 3) / 4;
    boxes.forEach(([label, value], i) => {
        const x = margin + i * (boxWidth + gap);
        doc.setFillColor(...LIGHT);
        doc.roundedRect(x, 110, boxWidth, 52, 6, 6, 'F');
        doc.setFontSize(8);
        doc.setTextColor(...MUTED);
        doc.text(label.toUpperCase(), x + 10, 128);
        doc.setFontSize(15);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(...(i === 0 ? PRIMARY : DARK));
        doc.text(value, x + 10, 150);
        doc.setFont(undefined, 'normal');
    });

    // --- Tableau ---
    const body = [];
    days.forEach((day, index) => {
        const dayLabel = day.date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
        body.push([
            { content: dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1), colSpan: 4, styles: { fillColor: LIGHT, fontStyle: 'bold', textColor: DARK } },
            { content: formatMilliseconds(day.totalMs), styles: { fillColor: LIGHT, fontStyle: 'bold', textColor: PRIMARY, halign: 'right' } },
        ]);
        day.entries.forEach(d => {
            const colleagues = Array.isArray(d.colleagues) && d.colleagues.length ? d.colleagues.join(', ') : '-';
            const notes = (d.notes || '').replace(/\s+/g, ' ').trim();
            body.push([
                `${time(d.timestamp)} - ${time(d.endTime)}`,
                notes ? `${d.chantier}\n${notes}` : d.chantier,
                d.pauseDurationMs > 0 ? formatMilliseconds(d.pauseDurationMs) : '-',
                colleagues,
                { content: formatMilliseconds(getDurationMs(d)), styles: { halign: 'right' } },
            ]);
        });
        // Sous-total à la fin de chaque semaine
        const next = days[index + 1];
        if (!next || next.week !== day.week) {
            const weekMs = days.filter(d => d.week === day.week).reduce((sum, d) => sum + d.totalMs, 0);
            body.push([
                { content: `Total semaine ${day.weekNo}`, colSpan: 4, styles: { fontStyle: 'bold', halign: 'right', textColor: MUTED } },
                { content: formatMilliseconds(weekMs), styles: { fontStyle: 'bold', halign: 'right', textColor: DARK } },
            ]);
        }
    });

    doc.autoTable({
        startY: 180,
        margin: { left: margin, right: margin, bottom: 50 },
        head: [['Horaires', 'Chantier', 'Pause', 'Collègues', 'Effectif']],
        body,
        theme: 'plain',
        headStyles: { fillColor: DARK, textColor: 255, fontStyle: 'bold', fontSize: 8.5 },
        styles: { fontSize: 8.5, cellPadding: 5, overflow: 'linebreak', textColor: [30, 41, 59], lineColor: [226, 232, 240], lineWidth: { bottom: 0.5 } },
        columnStyles: {
            0: { cellWidth: 72 },
            1: { cellWidth: 'auto' },
            2: { cellWidth: 48 },
            3: { cellWidth: 120 },
            4: { cellWidth: 58, halign: 'right', fontStyle: 'bold' },
        },
    });

    // --- Total + signatures ---
    let y = doc.lastAutoTable.finalY + 24;
    if (y > pageHeight - 140) { doc.addPage(); y = 60; }
    doc.setFillColor(...PRIMARY);
    doc.roundedRect(margin, y, pageWidth - margin * 2, 36, 6, 6, 'F');
    doc.setTextColor(255);
    doc.setFont(undefined, 'bold');
    doc.setFontSize(11);
    doc.text('Total travail effectif de la période', margin + 14, y + 23);
    doc.text(formatMilliseconds(totalEffectiveMs), pageWidth - margin - 14, y + 23, { align: 'right' });

    y += 70;
    const sigWidth = (pageWidth - margin * 2 - 30) / 2;
    ['Signature de l\'employé', 'Signature du responsable'].forEach((label, i) => {
        const x = margin + i * (sigWidth + 30);
        doc.setDrawColor(203, 213, 225);
        doc.roundedRect(x, y, sigWidth, 60, 4, 4, 'S');
        doc.setFont(undefined, 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...MUTED);
        doc.text(label, x + 8, y + 14);
    });

    // --- Pied de page sur chaque page ---
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(...MUTED);
        doc.text(`${userName} · Relevé d'heures`, margin, pageHeight - 24);
        doc.text(`Page ${i} / ${pageCount}`, pageWidth - margin, pageHeight - 24, { align: 'right' });
    }

    const now = new Date();
    const stamp = `${String(now.getHours()).padStart(2, '0')}h${String(now.getMinutes()).padStart(2, '0')}`;
    const fileName = `Releve_heures_${userName.replace(/[^\wÀ-ÿ-]+/g, '_')}_${toISODateString(periodStart)}_${stamp}.pdf`;
    doc.save(fileName);
}
