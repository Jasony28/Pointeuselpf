import { collection, query, where, orderBy, getDocs, deleteDoc, doc, updateDoc, addDoc, serverTimestamp, getDoc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, currentUser, pageContent, showConfirmationModal, showInfoModal, isStealthMode } from "../app.js";
import { getWeekDateRange, formatMilliseconds } from "./utils.js";
import { getUsers } from "./data-service.js";

let currentWeekOffset = 0;
let currentCalendarDate = new Date();
let targetUser = null;
let chantiersCache = [];
let colleaguesCache = [];
let pointagesPourPdf = [];
let allPointages = []; // Cache principal pour les pointages de la vue actuelle
let entryWizardStep = 1;
let entryWizardData = {};

// On déclare les variables pour la modale de réattribution ici pour qu'elles soient accessibles partout
let reassignModal, userSelect, reassignConfirmBtn, reassignCancelBtn;

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

async function logAction(pointageId, action, details = {}) {
    try {
        const logData = { action, modifiedBy: currentUser.displayName, timestamp: serverTimestamp(), details };
        await addDoc(collection(db, `pointages/${pointageId}/auditLog`), logData);
    } catch (error) { console.error("Erreur lors de l'enregistrement du log:", error); }
}

export async function render(params = {}) {
    targetUser = (params.userId && currentUser.role === 'admin') ? { uid: params.userId, name: params.userName } : { uid: currentUser.uid, name: "Mon" };

    pageContent.innerHTML = `
        <div class="max-w-5xl mx-auto">
            <div class="flex flex-wrap justify-between items-center mb-4 gap-4">
                <h2 id="history-title" class="text-2xl font-bold">Historique de ${targetUser.name}</h2>
                <div class="flex items-center gap-2">
                    <div id="view-toggle" class="p-1 rounded-lg flex" style="background-color: var(--color-background);">
                        <button id="showListViewBtn" class="px-3 py-1 text-sm rounded-md font-semibold view-toggle-btn active">Liste</button>
                        <button id="showCalendarViewBtn" class="px-3 py-1 text-sm rounded-md font-semibold view-toggle-btn">Calendrier</button>
                    </div>
                    ${(targetUser.uid === currentUser.uid || currentUser.role === 'admin') ? `
                    <button id="downloadPdfBtn" class="text-white font-bold px-4 py-2 rounded-lg flex items-center gap-2 transition-opacity" style="background-color: var(--color-primary);">PDF</button>
                    ` : ''}
                </div>
            </div>

            <div id="filters-container" class="p-4 rounded-lg mb-4" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                <button id="toggleFiltersBtn" class="w-full font-bold py-2 px-4 rounded text-left flex items-center gap-2" style="background-color: var(--color-background); border: 1px solid var(--color-border);">
                    🔍 Affiner la recherche
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
                            <button id="resetFiltersBtn" class="w-full px-4 py-2 rounded" style="background-color: var(--color-background); border: 1px solid var(--color-border);" title="Réinitialiser">↻</button>
                        </div>
                    </div>
                </div>
            </div>

            <div id="list-view">
                <div class="rounded-lg shadow-sm p-4 mb-4" id="weekly-nav" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                    <div class="flex justify-between items-center">
                        <button id="prevWeekBtn" class="px-4 py-2 rounded-lg hover:opacity-80" style="background-color: var(--color-background);">&lt;</button>
                        <div id="currentPeriodDisplay" class="text-center font-semibold text-lg"></div>
                        <button id="nextWeekBtn" class="px-4 py-2 rounded-lg hover:opacity-80" style="background-color: var(--color-background);">&gt;</button>
                    </div>
                    <div id="totalsDisplay" class="mt-3 text-center text-xl font-bold grid grid-cols-1 md:grid-cols-2 gap-2"></div>
                </div>
                <div id="historyList" class="space-y-4"></div>
            </div>

            <div id="calendar-view" class="hidden">
                 <div class="rounded-lg shadow-sm p-4" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                    <div id="calendar-header" class="flex justify-between items-center mb-4">
                        <button id="prevMonthBtn" class="px-4 py-2 rounded-lg hover:opacity-80" style="background-color: var(--color-background);">&lt;</button>
                        <h3 id="calendarMonthYear" class="text-xl font-bold"></h3>
                        <button id="nextMonthBtn" class="px-4 py-2 rounded-lg hover:opacity-80" style="background-color: var(--color-background);">&gt;</button>
                    </div>
                    <div id="calendar-grid" class="grid grid-cols-7 gap-1"></div>
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
    `;

    setTimeout(async () => {
        await cacheModalData();
        setupEventListeners();
        setupReassignModalListeners(); // On initialise les écouteurs de la modale ici
        currentWeekOffset = 0;
        loadHistoryForWeek();
    }, 0);
}

// MODIFICATION : La logique de l'écouteur du bouton "Confirmer" a été améliorée
function setupReassignModalListeners() {
    reassignModal = document.getElementById('reassignModal');
    userSelect = document.getElementById('userSelect');
    reassignConfirmBtn = document.getElementById('reassignConfirmBtn');
    reassignCancelBtn = document.getElementById('reassignCancelBtn');

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
        const pointageToReassign = allPointages.find(p => p.id === pointageId);
        const confirmationMessage = `Voulez-vous vraiment attribuer ce pointage de "${pointageToReassign.chantier}" à ${newUserName} ?`;

        // Étape 1: Cacher la première modale
        reassignModal.classList.add('hidden');

        // Étape 2: Afficher la deuxième modale et attendre la réponse
        const userConfirmed = await showConfirmationModal("Confirmation", confirmationMessage);

        // Étape 3: Agir en fonction de la réponse
        if (userConfirmed) {
            // Si confirmé, on lance la réattribution. Les deux fenêtres sont déjà cachées.
            await reassignPointage(pointageId, newUserId, newUserName, pointageToReassign);
        } else {
            // Si annulé, on ré-affiche la première fenêtre
            reassignModal.classList.remove('hidden');
        }
    });

    reassignCancelBtn.addEventListener('click', () => {
        reassignModal.classList.add('hidden');
    });
}


async function cacheModalData() {
    const chantiersQuery = query(collection(db, "chantiers"), where("status", "==", "active"), orderBy("name"));
    const colleaguesQuery = query(collection(db, "colleagues"), orderBy("name"));
    const usersQuery = query(collection(db, "users"), where("status", "==", "approved"), orderBy("displayName"));
    const [chantiersSnapshot, colleaguesSnapshot, usersSnapshot] = await Promise.all([getDocs(chantiersQuery), getDocs(colleaguesQuery), getDocs(usersQuery)]);
    
    chantiersCache = chantiersSnapshot.docs.map(doc => doc.data().name);
    const colleagueNames = colleaguesSnapshot.docs.map(doc => doc.data().name);
    const userNames = usersSnapshot.docs.map(doc => doc.data().displayName);
    colleaguesCache = [...new Set([...colleagueNames, ...userNames])].sort((a, b) => a.localeCompare(b));

    const filterChantierSelect = document.getElementById('filterChantier');
    filterChantierSelect.innerHTML = '<option value="">Tous les chantiers</option>' + chantiersCache.map(name => `<option value="${name}">${name}</option>`).join('');
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

async function displayHistoryList(startDate, endDate, chantierFilter = null) {
    const historyList = document.getElementById("historyList");
    historyList.innerHTML = `<p class='text-center p-4' style='color: var(--color-text-muted);'>Chargement...</p>`;
    
    const { pointages, trajetsMap } = await getPointages(startDate, endDate, chantierFilter);
    allPointages = pointages;
    pointagesPourPdf = pointages;

    const dataByDate = {};
    let currentDate = new Date(startDate);
    let endDateLimit = new Date(endDate);
    while (currentDate <= endDateLimit) {
        const dateString = toISODateString(currentDate);
        dataByDate[dateString] = { entries: [], dailyTotalMs: 0, dailyTotalKm: 0, dailyTotalMin: 0 };
        currentDate.setDate(currentDate.getDate() + 1);
    }

    pointages.forEach(p => {
        const localDate = new Date(p.timestamp);
        const date = toISODateString(localDate);
        if (dataByDate[date]) {
            dataByDate[date].entries.push(p);
            if (p.endTime) dataByDate[date].dailyTotalMs += (new Date(p.endTime) - new Date(p.timestamp)) - (p.pauseDurationMs || 0);
            if (trajetsMap.has(p.id)) {
                const trajet = trajetsMap.get(p.id);
                dataByDate[date].dailyTotalKm += trajet.distance_km || 0;
                dataByDate[date].dailyTotalMin += trajet.duree_min || 0;
            }
        }
    });

    historyList.innerHTML = "";
    let totalMs = 0, totalKm = 0, totalMin = 0;
    let hasEntries = false;

    const daysOfWeek = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

    Object.keys(dataByDate).sort().forEach(dateString => {
        const dayData = dataByDate[dateString];
        totalMs += dayData.dailyTotalMs;
        totalKm += dayData.dailyTotalKm;
        totalMin += dayData.dailyTotalMin;

        if (dayData.entries.length > 0) hasEntries = true;

        if(chantierFilter && dayData.entries.length === 0) return;

        const dayWrapper = document.createElement('div');
        dayWrapper.className = 'p-4 rounded-lg shadow-sm';
        dayWrapper.style.backgroundColor = 'var(--color-surface)';
        
        const dayDate = new Date(dateString);
        const dayHeaderHTML = `
            <div class="flex justify-between items-center border-b pb-2 mb-3" style="border-color: var(--color-border);">
                <div class="flex items-center gap-4">
                    <h3 class="font-bold text-lg">${daysOfWeek[dayDate.getDay()]} ${dayDate.toLocaleDateString('fr-FR', {day: 'numeric', month: 'long'})}</h3>
                    ${currentUser.role === 'admin' ? `<button class="add-pointage-btn text-sm font-semibold" style="color: var(--color-primary);" data-date="${dateString}">+ Ajouter</button>` : ''}
                </div>
                <div class="text-right">
                    <div class="font-bold" style="color: var(--color-primary);">${formatMilliseconds(dayData.dailyTotalMs)}</div>
                    ${dayData.dailyTotalKm > 0 ? `<div class="text-xs" style="color: var(--color-text-muted);">${dayData.dailyTotalKm.toFixed(1)} km / ${formatMinutes(dayData.dailyTotalMin)}</div>` : ''}
                </div>
            </div>`;
        
        const entriesContainer = document.createElement('div');
        entriesContainer.className = 'space-y-3';
        if (dayData.entries.length > 0) {
            dayData.entries.forEach(d => entriesContainer.appendChild(createHistoryEntryElement(d, trajetsMap.get(d.id))));
        } else {
            entriesContainer.innerHTML = `<p class="text-center py-4" style="color: var(--color-text-muted);">Aucun pointage pour ce jour.</p>`;
        }
        dayWrapper.innerHTML = dayHeaderHTML;
        dayWrapper.appendChild(entriesContainer);
        historyList.appendChild(dayWrapper);
    });

    if (!hasEntries) {
        historyList.innerHTML = `<p class='text-center p-8' style='color: var(--color-text-muted);'>Aucun pointage trouvé pour les critères sélectionnés.</p>`;
    }
    
    document.getElementById("totalsDisplay").innerHTML = `
        <div><p class="text-sm font-medium" style="color: var(--color-text-muted);">Total Heures Période</p><p>${formatMilliseconds(totalMs)}</p></div>
        <div><p class="text-sm font-medium" style="color: var(--color-text-muted);">Total Trajets Période</p><p>${totalKm.toFixed(1)} km / ${formatMinutes(totalMin)}</p></div>`;

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

    const pointagesByDate = pointages.reduce((acc, p) => {
        const localDate = new Date(p.timestamp);
        const dateKey = toISODateString(localDate);
        if (!acc[dateKey]) acc[dateKey] = 0;
        if (p.endTime) acc[dateKey] += (new Date(p.endTime) - new Date(p.timestamp)) - (p.pauseDurationMs || 0);
        return acc;
    }, {});

    const grid = document.getElementById("calendar-grid");
    grid.innerHTML = '';
    const days = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
    days.forEach(day => grid.innerHTML += `<div class="font-semibold text-center text-sm p-2" style="color: var(--color-text-muted);">${day}</div>`);

    const startOffset = (firstDayOfMonth.getDay() + 6) % 7; // 0=Lundi, 6=Dimanche
    for (let i = 0; i < startOffset; i++) grid.innerHTML += '<div></div>';

    for (let i = 1; i <= lastDayOfMonth.getDate(); i++) {
        const date = new Date(year, month, i);
        const dateKey = toISODateString(date);
        const totalMs = pointagesByDate[dateKey] || 0;
        
        let bgColor = 'var(--color-background)';
        if (totalMs > 0) {
            const hours = totalMs / 3600000;
            if (hours > 8) bgColor = 'rgba(249, 115, 22, 0.2)'; // Orange
            else if (hours >= 7.5) bgColor = 'rgba(34, 197, 94, 0.2)'; // Vert
            else bgColor = 'rgba(250, 204, 21, 0.2)'; // Jaune
        }
        grid.innerHTML += `
            <div class="p-2 h-24 rounded-md flex flex-col justify-between" style="background-color: ${bgColor}; border: 1px solid var(--color-border);">
                <div class="font-bold text-sm">${i}</div>
                ${totalMs > 0 ? `<div class="text-xs font-semibold text-right">${formatMilliseconds(totalMs)}</div>` : ''}
            </div>`;
    }
}

function setupEventListeners() {
    const toggleBtn = document.getElementById('toggleFiltersBtn');
    const filtersContent = document.getElementById('filters-content');
    toggleBtn.addEventListener('click', () => {
        const isHidden = filtersContent.classList.toggle('hidden');
        if (isHidden) {
            toggleBtn.innerHTML = '🔍 Affiner la recherche';
        } else {
            toggleBtn.innerHTML = 'Masquer les filtres';
        }
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
}

function switchView(view) {
    const listView = document.getElementById('list-view');
    const calendarView = document.getElementById('calendar-view');
    const listBtn = document.getElementById('showListViewBtn');
    const calendarBtn = document.getElementById('showCalendarViewBtn');
    const filtersContainer = document.getElementById('filters-container');
    const pdfBtn = document.getElementById("downloadPdfBtn");

    if (view === 'calendar') {
        listView.classList.add('hidden');
        calendarView.classList.remove('hidden');
        listBtn.classList.remove('active');
        calendarBtn.classList.add('active');
        filtersContainer.classList.add('hidden');
        if (pdfBtn) pdfBtn.classList.add('hidden');
        currentCalendarDate = new Date();
        renderCalendar();
    } else {
        listView.classList.remove('hidden');
        calendarView.classList.add('hidden');
        listBtn.classList.add('active');
        calendarBtn.classList.remove('active');
        filtersContainer.classList.remove('hidden');
        if (pdfBtn) pdfBtn.classList.remove('hidden');
    }
}

function applyFilters() {
    document.getElementById('weekly-nav').style.display = 'none';
    document.getElementById('totalsDisplay').parentElement.style.display = 'block';
    const startDate = document.getElementById('filterStartDate').value;
    const endDate = document.getElementById('filterEndDate').value;
    const chantier = document.getElementById('filterChantier').value;
    
    if (!chantier && (!startDate || !endDate)) {
        showInfoModal("Attention", "Veuillez sélectionner un chantier OU une plage de dates complète.");
        return;
    }
    
    let sDate, eDate;
    let periodText = "";

    if (startDate && endDate) {
        sDate = new Date(startDate);
        eDate = new Date(endDate);
        periodText = `Du ${sDate.toLocaleDateString('fr-FR')} au ${eDate.toLocaleDateString('fr-FR')}`;
    } else {
        sDate = new Date('2020-01-01');
        eDate = new Date();
        eDate.setFullYear(eDate.getFullYear() + 5);
        periodText = "Toute la période";
    }

    if (chantier) {
        document.getElementById('currentPeriodDisplay').textContent = `Pointages pour "${chantier}"`;
    } else {
        document.getElementById('currentPeriodDisplay').textContent = periodText;
    }

    displayHistoryList(sDate, eDate, chantier || null);
}


function resetFilters() {
    document.getElementById('weekly-nav').style.display = 'block';
    document.getElementById('filterStartDate').value = '';
    document.getElementById('filterEndDate').value = '';
    document.getElementById('filterChantier').selectedIndex = 0;
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
    if (currentUser.role !== 'admin') return;
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
        trajetDisplay = `<div class="text-xs mt-1" style="color: var(--color-text-muted);">🚗 ${trajetData.distance_km.toFixed(1)} km - ${formatMinutes(trajetData.duree_min)}</div>`;
    }
    
    const startDate = new Date(d.timestamp);
    const endDate = d.endTime ? new Date(d.endTime) : null;
    let timeDisplay = "", durationDisplay = "", pauseDisplay = "";
    if (endDate) {
        const effectiveWorkMs = (endDate - startDate) - (d.pauseDurationMs || 0);
        timeDisplay = `De ${startDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} à ${endDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
        durationDisplay = `<div class="text-sm font-bold mt-1" style="color: var(--color-primary);">${formatMilliseconds(effectiveWorkMs)}</div>`;
        if (d.pauseDurationMs && d.pauseDurationMs > 0) {
            pauseDisplay = `<div class="text-xs text-yellow-600 mt-1">Pause : ${formatMilliseconds(d.pauseDurationMs)}</div>`;
        }
    }
    wrapper.innerHTML = `<div class="pr-20"><div class="font-bold">${d.chantier}</div><div class="text-sm" style="color: var(--color-text-muted);">${timeDisplay}</div>${trajetDisplay}<div class="text-xs mt-1" style="color: var(--color-text-muted);">Collègues : ${Array.isArray(d.colleagues) && d.colleagues.length > 0 ? d.colleagues.join(", ") : 'Aucun'}</div></div>${d.notes ? `<div class="mt-2 pt-2 border-t text-xs" style="border-color: var(--color-border); color: var(--color-text-muted);"><strong>Notes:</strong> ${d.notes}</div>` : ""}`;
    
    if (currentUser.role === 'admin') {
        const controlsWrapper = document.createElement("div");
        controlsWrapper.className = "absolute top-2 right-3 flex flex-col items-end text-right"; 
        const buttonsDiv = document.createElement('div');
        buttonsDiv.className = 'flex gap-2';
        buttonsDiv.innerHTML = `
            <button class="edit-btn font-bold" title="Modifier" data-id="${d.id}" style="color: var(--color-text-muted);">✏️</button>
            <button class="delete-btn font-bold" title="Supprimer" data-id="${d.id}" style="color: var(--color-text-muted);">✖️</button>
            <button class="reassign-btn font-bold" title="Réattribuer" data-id="${d.id}" style="color: var(--color-text-muted);">🔄</button>
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

async function reassignPointage(pointageId, newUserId, newUserName, originalPointage) {
    try {
        const pointageRef = doc(db, "pointages", pointageId);
        
        const updateData = {
            uid: newUserId,
            userName: newUserName
        };

        await updateDoc(pointageRef, updateData);

        await logAction(pointageId, "Réattribution", {
            fromUser: { uid: originalPointage.uid, name: originalPointage.userName },
            toUser: { uid: newUserId, name: newUserName }
        });
        
        showInfoModal("Succès", "Le pointage a été réattribué avec succès.");
        resetFilters();

    } catch (error) {
        console.error("Erreur lors de la réattribution:", error);
        showInfoModal("Erreur", "La mise à jour a échoué. Veuillez réessayer.");
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
    chantierSelect.innerHTML = '<option value="">-- Choisissez --</option>' + chantiersCache.map(name => `<option value="${name}">${name}</option>`).join('');
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
        const pauseMinutes = parseInt(document.getElementById('entryPauseMinutes').value) || 0;
        dataToSave = {
            chantier: document.getElementById('entryChantier').value,
            timestamp: new Date(`${date}T${document.getElementById('entryStartTime').value}`).toISOString(),
            endTime: new Date(`${date}T${document.getElementById('entryEndTime').value}`).toISOString(),
            pauseDurationMs: pauseMinutes * 60000,
            colleagues: Array.from(document.querySelectorAll('input[name="entryColleagues"]:checked')).map(el => el.value),
            notes: document.getElementById('entryNotes').value.trim()
        };
    } else {
        entryWizardData.colleagues = Array.from(document.querySelectorAll('input[name="entryColleagues"]:checked')).map(el => el.value);
        entryWizardData.notes = document.getElementById('entryNotes').value.trim();
        const { date, chantier, startTime, endTime, colleagues, notes, pauseDurationMs } = entryWizardData;
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
            const beforeSnap = await getDoc(pointageRef);
            const beforeData = beforeSnap.data();
            await updateDoc(pointageRef, dataToSave);
            const changes = {};
            for(const key in dataToSave) {
                if(JSON.stringify(beforeData[key]) !== JSON.stringify(dataToSave[key])) {
                    changes[key] = { from: beforeData[key] || "vide", to: dataToSave[key] };
                }
            }
            if(Object.keys(changes).length > 0) {
                 await logAction(entryId, "Modification", { changes });
            }
            showInfoModal("Succès", "Le pointage a été mis à jour.");
        } else {
            const fullData = { 
                ...dataToSave, 
                uid: targetUser.uid, 
                userName: targetUser.name === "Mon" ? currentUser.displayName : targetUser.name, 
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
    const dataForPdf = pointagesPourPdf;
    if (dataForPdf.length === 0) {
        showInfoModal("Information", "Il n'y a rien à télécharger pour cette période.");
        return;
    }
    const { jsPDF } = window.jspdf;
    if (!jsPDF || !jsPDF.API.autoTable) {
        showInfoModal("Erreur", "La librairie PDF (jsPDF avec autoTable) n'a pas pu être chargée.");
        return;
    }
    dataForPdf.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    const userName = targetUser.name === "Mon" ? currentUser.displayName : targetUser.name;
    
    const firstDate = new Date(dataForPdf[0].timestamp);
    const lastDate = new Date(dataForPdf[dataForPdf.length - 1].timestamp);

    doc.setFontSize(18);
    doc.setFont(undefined, 'bold');
    doc.text("Historique des Pointages", 40, 60);
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(100);
    doc.text(`Employé : ${userName}`, 40, 75);
    doc.text(`Période du ${firstDate.toLocaleDateString('fr-FR')} au ${lastDate.toLocaleDateString('fr-FR')}`, 40, 85);
    
    const pointagesByDay = dataForPdf.reduce((acc, p) => {
        if (!p.endTime) return acc;
        const dayKey = new Date(p.timestamp).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' });
        if (!acc[dayKey]) {
            acc[dayKey] = { entries: [], totalMs: 0, dateObj: new Date(p.timestamp) };
        }
        const durationMs = (new Date(p.endTime) - new Date(p.timestamp)) - (p.pauseDurationMs || 0);
        acc[dayKey].entries.push(p);
        acc[dayKey].totalMs += durationMs;
        return acc;
    }, {});
    
    const sortedDays = Object.keys(pointagesByDay).sort((a,b) => pointagesByDay[a].dateObj - pointagesByDay[b].dateObj);

    const tableHead = [['Date', 'Heures', 'Chantier', 'Pause', 'Travail Effectif', 'Collègues']];
    const tableBody = [];
    let totalEffectiveMs = 0;

    sortedDays.forEach(dayKey => {
        const dayData = pointagesByDay[dayKey];
        totalEffectiveMs += dayData.totalMs;
        tableBody.push([{
            content: `${dayKey} - Total : ${formatMilliseconds(dayData.totalMs)}`,
            colSpan: 6,
            styles: { fillColor: '#f3f4f6', fontStyle: 'bold', textColor: '#374151' }
        }]);
        dayData.entries.forEach(d => {
            const startDate = new Date(d.timestamp);
            const endDate = new Date(d.endTime);
            const effectiveWorkMs = (endDate - startDate) - (d.pauseDurationMs || 0);
            const dateStr = startDate.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
            const timeStr = `${startDate.toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'})} - ${endDate.toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'})}`;
            const pauseStr = formatMilliseconds(d.pauseDurationMs || 0);
            const durationStr = formatMilliseconds(effectiveWorkMs);
            const colleaguesStr = Array.isArray(d.colleagues) && d.colleagues.length > 0 ? d.colleagues.join(", ") : 'Aucun';
            tableBody.push([dateStr, timeStr, d.chantier, pauseStr, durationStr, colleaguesStr]);
        });
    });

    doc.autoTable({
        startY: 100,
        head: tableHead,
        body: tableBody,
        theme: 'striped',
        headStyles: { fillColor: [41, 51, 92], textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak' },
        columnStyles: {
            0: { cellWidth: 40 }, 1: { cellWidth: 60 }, 2: { cellWidth: 'auto' }, 
            3: { cellWidth: 40 }, 4: { cellWidth: 50 }, 5: { cellWidth: 'auto' }
        }
    });
    const finalY = doc.lastAutoTable.finalY;
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text(`Total travail effectif de la période : ${formatMilliseconds(totalEffectiveMs)}`, 40, finalY + 20);
    const now = new Date();
    const timestamp = `${String(now.getHours()).padStart(2, '0')}h${String(now.getMinutes()).padStart(2, '0')}`;
    const fileName = `Historique_${userName.replace(/ /g, '_')}_${firstDate.toISOString().split('T')[0]}_${timestamp}.pdf`;
    doc.save(fileName);
}