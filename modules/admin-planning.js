import { collection, query, where, getDocs, addDoc, deleteDoc, doc, orderBy, serverTimestamp, updateDoc, setDoc, getDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent, currentUser, showConfirmationModal, showInfoModal } from "../app.js";
import { getWeekDateRange } from "./utils.js";

// Variables globales du module
let currentWeekOffset = 0;
let chantiersCache = [];
let teamMembersCache = [];
let currentEditingId = null;
let currentEditingDate = null;
let currentView = 'week';
let selectedDayIndex = 0;
let selectionMode = false;
let selectedItems = new Set();
let isAssignMode = false;

export async function render() {
    pageContent.innerHTML = `
        <div class="max-w-full mx-auto">
            <h2 class="text-2xl font-bold mb-4">🗓️ Planification de la semaine</h2>
            <div class="bg-white rounded-lg shadow-sm p-4 mb-4">
                <div class="flex flex-wrap justify-between items-center gap-4">
                    <div class="flex items-center gap-4">
                        <div class="flex items-center gap-2">
                            <button id="prevWeekBtn" class="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg">&lt;</button>
                            <div id="currentPeriodDisplay" class="text-center font-semibold text-lg min-w-[280px]"></div>
                            <button id="nextWeekBtn" class="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg">&gt;</button>
                        </div>
                        <div class="flex items-center border rounded-lg p-1 bg-gray-100">
                            <button id="viewWeekBtn" class="px-3 py-1 text-sm rounded-md">Vue Semaine</button>
                            <button id="viewDayBtn" class="px-3 py-1 text-sm rounded-md">Vue Jour</button>
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <button id="selectionModeBtn" class="bg-yellow-500 hover:bg-yellow-600 text-white font-bold px-4 py-2 rounded-lg">Sélectionner</button>
                        <button id="deleteSelectionBtn" class="hidden bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2 rounded-lg">Supprimer la sélection</button>
                        <button id="downloadPdfBtn" title="Imprimer ou Enregistrer le planning en PDF" class="bg-green-600 hover:bg-green-700 text-white p-2 rounded-lg"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/><path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/></svg></button>
                        <button id="publishBtn" class="font-bold px-4 py-2 rounded-lg disabled:bg-gray-400"></button>
                    </div>
                </div>
            </div>
            <div class="flex flex-col md:flex-row gap-4">
                <div class="md:w-1/4 lg:w-1/5 bg-white p-4 rounded-lg shadow-sm flex flex-col">
                    <h3 class="font-bold text-lg border-b pb-2 mb-2">Équipe</h3>
                    <div id="team-pool" class="space-y-2 min-h-[100px] overflow-y-auto"></div>
                    <div id="team-trash-can" class="mt-4 p-4 border-2 border-dashed rounded-lg text-center text-gray-400 transition-colors"></div>
                </div>
                <div class="flex-grow" id="planning-grid"></div>
            </div>
        </div>
        <div id="planningItemModal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-20 p-4">
            <div class="bg-white p-6 rounded-lg shadow-xl w-full max-w-sm">
                <h3 id="modalTitle" class="text-xl font-bold mb-4"></h3>
                <form id="planningItemForm" class="space-y-4">
                    <div><label class="text-sm font-medium">Chantier</label><select id="chantierSelect" class="w-full border p-2 rounded" required></select></div>
                    <div><label class="text-sm font-medium">Heure de début</label><input id="planningStartTime" type="time" class="w-full border p-2 rounded" /></div>
                    <div><label class="text-sm font-medium">Notes (facultatif)</label><textarea id="planningNotes" placeholder="Instructions spécifiques..." class="w-full border p-2 rounded"></textarea></div>
                    <div class="flex justify-end gap-4 pt-4 border-t">
                        <button type="button" id="cancelPlanningItem" class="bg-gray-300 hover:bg-gray-400 px-4 py-2 rounded">Annuler</button>
                        <button type="button" id="saveAndAddAnotherBtn" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded">Enregistrer et Ajouter</button>
                        <button type="button" id="saveAndCloseBtn" class="bg-green-600 hover:bg-green-700 text-white font-bold px-4 py-2 rounded">Enregistrer et Fermer</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    setTimeout(async () => {
        setupEventListeners();
        await cacheData();
        display();
        populateTeamPool();
    }, 0);
}

async function cacheData() {
    const chantiersQuery = query(collection(db, "chantiers"), where("status", "==", "active"), orderBy("name"));
    const colleaguesQuery = query(collection(db, "colleagues"), orderBy("name"));
    const usersQuery = query(collection(db, "users"), where("status", "==", "approved"), orderBy("displayName"));
    const [chantiersSnapshot, colleaguesSnapshot, usersSnapshot] = await Promise.all([
        getDocs(chantiersQuery), getDocs(colleaguesQuery), getDocs(usersQuery)
    ]);
    chantiersCache = chantiersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const colleagueNames = colleaguesSnapshot.docs.map(doc => doc.data().name);
    const userNames = usersSnapshot.docs.map(doc => doc.data().displayName);
    teamMembersCache = [...new Set([...colleagueNames, ...userNames])].sort((a, b) => a.localeCompare(b));
}

function populateTeamPool() {
    const pool = document.getElementById('team-pool');
    pool.innerHTML = '';
    teamMembersCache.forEach(name => {
        const item = document.createElement('div');
        item.className = 'flex items-center gap-2 p-2 bg-gray-200 rounded cursor-pointer hover:bg-gray-300';
        item.innerHTML = `
            <input type="checkbox" class="team-checkbox h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500">
            <span class="text-sm">${name}</span>
        `;
        item.querySelector('.team-checkbox').addEventListener('change', updateAssignMode);
        pool.appendChild(item);
    });
    document.getElementById('team-trash-can').innerHTML = '<p class="text-sm text-gray-500">Cochez des noms puis cliquez sur un chantier pour les assigner.</p>';
}

function setupEventListeners() {
    document.getElementById("prevWeekBtn").onclick = () => { currentWeekOffset--; display(); };
    document.getElementById("nextWeekBtn").onclick = () => { currentWeekOffset++; display(); };
    document.getElementById("cancelPlanningItem").onclick = closePlanningItemModal;
    document.getElementById("downloadPdfBtn").onclick = generatePrintableView;
    document.getElementById('viewWeekBtn').onclick = () => { currentView = 'week'; display(); };
    document.getElementById('viewDayBtn').onclick = () => { currentView = 'day'; display(); };
    document.getElementById('selectionModeBtn').onclick = toggleSelectionMode;
    document.getElementById('deleteSelectionBtn').onclick = deleteSelectedItems;
}

async function publishWeek() {
    const { startOfWeek } = getWeekDateRange(currentWeekOffset);
    const weekId = startOfWeek.toISOString().split('T')[0];
    const weekString = startOfWeek.toLocaleDateString('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'long' });
    if (await showConfirmationModal("Publication", `Voulez-vous PUBLIER le planning pour la semaine du ${weekString} ?`)) {
        try {
            await setDoc(doc(db, "publishedSchedules", weekId), { published: true, publishedAt: serverTimestamp(), publishedBy: currentUser.displayName });
            await addDoc(collection(db, "notifications"), { title: "Nouveau Planning Publié", body: `Le planning pour la semaine du ${weekString} est maintenant disponible.`, createdAt: serverTimestamp(), author: currentUser.displayName });
            showInfoModal("Succès", "Planning publié et notification envoyée !");
            updatePublishButton(true);
        } catch (error) { showInfoModal("Erreur", "La publication a échoué."); }
    }
}

async function sendUpdateNotification() {
    const { startOfWeek } = getWeekDateRange(currentWeekOffset);
    const weekString = startOfWeek.toLocaleDateString('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'long' });
    if (await showConfirmationModal("Notification", `Voulez-vous envoyer une notification de MISE À JOUR pour le planning de la semaine du ${weekString} ?`)) {
        try {
            await addDoc(collection(db, "notifications"), { title: "Planning Mis à Jour", body: `Le planning de la semaine du ${weekString} a été modifié.`, createdAt: serverTimestamp(), author: currentUser.displayName });
            showInfoModal("Succès", "Notification de mise à jour envoyée !");
        } catch (error) { showInfoModal("Erreur", "L'envoi a échoué."); }
    }
}

async function updatePublishButton(isPublished) {
    const btn = document.getElementById('publishBtn');
    if(!btn) return;
    btn.disabled = false;
    if (isPublished) {
        btn.textContent = 'Notifier les changements';
        btn.className = 'bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-lg';
        btn.onclick = sendUpdateNotification;
    } else {
        btn.textContent = 'Publier la semaine';
        btn.className = 'bg-green-600 hover:bg-green-700 text-white font-bold px-4 py-2 rounded-lg';
        btn.onclick = publishWeek;
    }
}

function display() {
    updateViewButtons();
    currentView === 'week' ? displayWeekView() : displayDayView();
}

function updateViewButtons() {
    const weekBtn = document.getElementById('viewWeekBtn');
    const dayBtn = document.getElementById('viewDayBtn');
    if(!weekBtn || !dayBtn) return;
    if (currentView === 'week') {
        weekBtn.classList.add('bg-white', 'shadow');
        dayBtn.classList.remove('bg-white', 'shadow');
    } else {
        dayBtn.classList.add('bg-white', 'shadow');
        weekBtn.classList.remove('bg-white', 'shadow');
    }
}

async function displayWeekView() {
    const { startOfWeek, endOfWeek } = getWeekDateRange(currentWeekOffset);
    document.getElementById("currentPeriodDisplay").textContent = `Semaine du ${startOfWeek.toLocaleDateString('fr-FR', {timeZone: 'UTC', day: 'numeric', month: 'long'})} au ${endOfWeek.toLocaleDateString('fr-FR', {timeZone: 'UTC', day: 'numeric', month: 'long'})}`;
    const weekId = startOfWeek.toISOString().split('T')[0];
    const publishDoc = await getDoc(doc(db, "publishedSchedules", weekId));
    updatePublishButton(publishDoc.exists());
    const planningGrid = document.getElementById("planning-grid");
    planningGrid.className = 'flex-grow flex flex-wrap gap-3 content-start';
    planningGrid.innerHTML = "";
    const days = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
    for (let i = 0; i < 7; i++) {
        const dayDate = new Date(startOfWeek);
        dayDate.setUTCDate(startOfWeek.getUTCDate() + i);
        const dateString = dayDate.toISOString().split('T')[0];
        const dayCol = document.createElement('div');
        dayCol.className = 'bg-gray-100 rounded-lg p-2 flex flex-col flex-grow basis-48';
        dayCol.innerHTML = `<div class="flex justify-between items-center mb-2"><h4 class="font-bold text-center">${days[i]} <span class="text-sm font-normal text-gray-500">${dayDate.getUTCDate()}</span></h4><button data-date="${dateString}" class="add-chantier-btn text-lg font-bold text-purple-600 hover:text-purple-800">+</button></div><div class="day-tasks-container space-y-2 flex-grow" id="day-col-${dateString}"></div>`;
        planningGrid.appendChild(dayCol);
    }
    planningGrid.querySelectorAll('.add-chantier-btn').forEach(btn => btn.onclick = () => openPlanningItemModal(null, btn.dataset.date));
    loadPlanningForWeek(startOfWeek, endOfWeek);
}

function displayDayView() {
    const { startOfWeek } = getWeekDateRange(currentWeekOffset);
    const days = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
    const selectedDate = new Date(startOfWeek);
    selectedDate.setUTCDate(selectedDate.getUTCDate() + selectedDayIndex);
    const dateString = selectedDate.toISOString().split('T')[0];
    document.getElementById("currentPeriodDisplay").textContent = selectedDate.toLocaleDateString('fr-FR', {timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long'});
    const planningGrid = document.getElementById("planning-grid");
    planningGrid.className = 'flex';
    planningGrid.innerHTML = `
        <div class="bg-gray-100 rounded-lg p-2 flex flex-col w-full">
            <div class="flex justify-between items-center mb-2">
                <div class="flex items-center gap-2 flex-wrap">${days.map((day, index) => `<button data-day-index="${index}" class="day-selector-btn px-3 py-1 text-sm rounded-md ${index === selectedDayIndex ? 'bg-purple-600 text-white' : 'bg-gray-200'}">${day}</button>`).join('')}</div>
                <button data-date="${dateString}" class="add-chantier-btn text-2xl font-bold text-purple-600 hover:text-purple-800">+</button>
            </div>
            <div class="day-tasks-container grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-2 flex-grow overflow-y-auto" style="grid-auto-flow: column; grid-template-rows: repeat(9, auto);" id="day-col-${dateString}"></div>
        </div>`;
    planningGrid.querySelector('.add-chantier-btn').onclick = () => openPlanningItemModal(null, dateString);
    planningGrid.querySelectorAll('.day-selector-btn').forEach(btn => {
        btn.onclick = () => { selectedDayIndex = parseInt(btn.dataset.dayIndex); displayDayView(); }
    });
    loadPlanningForDay(selectedDate);
}

async function loadPlanningForWeek(start, end) {
    const q = query(collection(db, "planning"), where("date", ">=", start.toISOString().split('T')[0]), where("date", "<=", end.toISOString().split('T')[0]), orderBy("date"), orderBy("order"));
    const querySnapshot = await getDocs(q);
    const planningData = querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
    planningData.forEach(data => {
        const container = document.getElementById(`day-col-${data.date}`);
        if (container) container.appendChild(createChantierBlock(data));
    });
}

async function loadPlanningForDay(date) {
    const dateString = date.toISOString().split('T')[0];
    const container = document.getElementById(`day-col-${dateString}`);
    if (!container) return;
    container.innerHTML = 'Chargement...';
    const q = query(collection(db, "planning"), where("date", "==", dateString), orderBy("order"));
    const querySnapshot = await getDocs(q);
    const planningData = querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
    container.innerHTML = '';
    planningData.forEach(data => container.appendChild(createChantierBlock(data)));
}

function createChantierBlock(planningDoc) {
    const { id, chantierId, chantierName, teamNames, duration, notes, startTime } = planningDoc;
    const block = document.createElement('div');
    block.className = 'planning-block p-1.5 bg-white rounded shadow cursor-pointer text-xs relative';
    block.dataset.planningId = id;
    const chantierData = chantiersCache.find(c => c.id === chantierId);
    block.dataset.totalHeures = chantierData?.totalHeuresPrevues || 0;
    const noteIndicator = notes ? ` <span class="text-blue-500" title="${notes}">📝</span>` : '';
    const timeInfo = startTime ? `<strong>${startTime}</strong> (${duration || 0}h)` : `${duration || 0}h prévues`;
    block.innerHTML = `<div class="flex justify-between items-start"><p class="font-bold text-purple-800 leading-tight">${chantierName}</p><button class="delete-planning-btn text-red-400 hover:text-red-700 font-bold -mt-1 -mr-1">✖</button></div><p class="text-gray-600 my-0.5 time-info">${timeInfo}${noteIndicator}</p><div class="team-display-zone mt-1 space-y-0.5"></div><input type="checkbox" data-id="${id}" class="selection-checkbox hidden absolute top-1 right-1 h-4 w-4">`;
    renderTeamInBlock(block, teamNames);
    block.addEventListener('click', (e) => {
        const memberTag = e.target.closest('.team-member-tag');
        if (memberTag) handleMemberRemoval(block, planningDoc, memberTag.dataset.name);
        else if (isAssignMode) assignSelectedTeamToBlock(block, planningDoc);
        else if (!e.target.closest('.delete-planning-btn') && !e.target.closest('.selection-checkbox')) openPlanningItemModal(planningDoc);
    });
    block.querySelector('.delete-planning-btn').onclick = async (e) => { 
        e.stopPropagation(); 
        if (await showConfirmationModal("Confirmation", `Supprimer le chantier "${chantierName}" de ce jour ?`)) {
            await deleteDoc(doc(db, "planning", id));
            block.remove();
        }
    };
    return block;
}

function updateAssignMode() {
    const selectedCheckboxes = document.querySelectorAll('.team-checkbox:checked');
    isAssignMode = selectedCheckboxes.length > 0;
    document.querySelectorAll('.planning-block').forEach(block => {
        block.classList.toggle('assign-target', isAssignMode);
        block.title = isAssignMode ? "Cliquez pour assigner l'équipe sélectionnée" : "";
    });
    const styleId = 'assign-mode-style';
    let styleElement = document.getElementById(styleId);
    if (isAssignMode && !styleElement) {
        styleElement = document.createElement('style');
        styleElement.id = styleId;
        styleElement.innerHTML = `.assign-target:hover { background-color: #E9D5FF !important; transform: scale(1.02); }`;
        document.head.appendChild(styleElement);
    } else if (!isAssignMode && styleElement) {
        styleElement.remove();
    }
}

async function assignSelectedTeamToBlock(planningBlock, planningDoc) {
    const selectedTeam = Array.from(document.querySelectorAll('.team-checkbox:checked')).map(cb => cb.nextElementSibling.textContent);
    planningDoc.teamNames = selectedTeam;
    renderTeamInBlock(planningBlock, planningDoc.teamNames);
    await updateDurationAndSave(planningBlock, planningDoc.id, planningDoc.teamNames);
    
    // Les lignes qui décochaient les cases ont été retirées. C'est tout !
}

async function handleMemberRemoval(planningBlock, planningDoc, memberNameToRemove) {
    planningDoc.teamNames = planningDoc.teamNames.filter(name => name !== memberNameToRemove);
    renderTeamInBlock(planningBlock, planningDoc.teamNames);
    await updateDurationAndSave(planningBlock, planningDoc.id, planningDoc.teamNames);
}

function renderTeamInBlock(planningBlock, teamNames) {
    const teamZone = planningBlock.querySelector('.team-display-zone');
    if (teamNames && teamNames.length > 0) {
        teamZone.innerHTML = teamNames.map(name => `
            <div class="team-member-tag p-0.5 bg-blue-100 text-blue-800 rounded text-[10px] leading-tight flex items-center gap-1 cursor-pointer" data-name="${name}" title="Cliquer pour retirer">
                <span>${name}</span>
                <span class="font-bold text-red-500 hover:text-red-700 pointer-events-none">&times;</span>
            </div>
        `).join('');
    } else { teamZone.innerHTML = ''; }
}

async function updateDurationAndSave(planningBlock, planningId, teamNames) {
    try {
        const totalHeures = parseFloat(planningBlock.dataset.totalHeures);
        const teamSize = teamNames.length;
        let newDuration = 0;
        if (totalHeures > 0) newDuration = (teamSize > 0) ? (totalHeures / teamSize) : totalHeures;
        const finalDuration = parseFloat(newDuration.toFixed(1));
        await updateDoc(doc(db, "planning", planningId), { teamNames: teamNames, duration: finalDuration });
        const timeInfoEl = planningBlock.querySelector('.time-info');
        const noteIndicator = timeInfoEl.querySelector('span')?.outerHTML || '';
        const startTime = timeInfoEl.querySelector('strong')?.outerHTML || '';
        timeInfoEl.innerHTML = startTime ? `${startTime} (${finalDuration}h)${noteIndicator}` : `${finalDuration}h prévues${noteIndicator}`;
    } catch (error) { console.error("Erreur de mise à jour de la durée:", error); }
}

function openPlanningItemModal(planningDoc = null, date = null) {
    const modal = document.getElementById('planningItemModal');
    const form = document.getElementById('planningItemForm');
    const select = document.getElementById('chantierSelect');
    form.reset();
    document.getElementById('saveAndCloseBtn').onclick = () => savePlanningItem(true);
    document.getElementById('saveAndAddAnotherBtn').onclick = () => savePlanningItem(false);
    
    if (planningDoc) {
        currentEditingId = planningDoc.id;
        currentEditingDate = planningDoc.date;
        document.getElementById('modalTitle').textContent = 'Modifier le travail';
        select.innerHTML = chantiersCache.map(c => `<option value="${c.id}|${c.name}" ${c.name === planningDoc.chantierName ? 'selected' : ''}>${c.name}</option>`).join('');
        document.getElementById('planningStartTime').value = planningDoc.startTime || '';
        document.getElementById('planningNotes').value = planningDoc.notes || '';
        document.getElementById('saveAndAddAnotherBtn').style.display = 'none';
    } else {
        currentEditingId = null;
        currentEditingDate = date;
        document.getElementById('modalTitle').textContent = `Ajouter un chantier pour le ${new Date(date + 'T12:00:00Z').toLocaleDateString('fr-FR', {weekday: 'long', day: 'numeric'})}`;
        select.innerHTML = '<option value="" disabled selected>-- Choisissez un chantier --</option>' + chantiersCache.map(c => `<option value="${c.id}|${c.name}">${c.name}</option>`).join('');
        document.getElementById('planningStartTime').value = '08:00';
        document.getElementById('saveAndAddAnotherBtn').style.display = 'inline-block';
    }
    modal.classList.remove('hidden');
}

function closePlanningItemModal() {
    document.getElementById('planningItemModal').classList.add('hidden');
}

async function savePlanningItem(closeAfterSave) {
    const form = document.getElementById('planningItemForm');
    const select = document.getElementById('chantierSelect');
    if (!select.value) { showInfoModal("Attention", "Veuillez choisir un chantier."); return; }
    const [chantierId, chantierName] = select.value.split('|');
    const chantierData = chantiersCache.find(c => c.id === chantierId);
    const duration = chantierData?.totalHeuresPrevues || 0;
    const notes = document.getElementById('planningNotes').value.trim();
    const startTime = document.getElementById('planningStartTime').value;
    const dataToSave = { chantierId, chantierName, duration, notes, startTime };
    try {
        if (currentEditingId) {
            await updateDoc(doc(db, "planning", currentEditingId), dataToSave);
        } else {
            const q = query(collection(db, "planning"), where("date", "==", currentEditingDate));
            const snapshot = await getDocs(q);
            if (snapshot.docs.some(d => d.data().chantierName === chantierName)) {
                showInfoModal("Action Impossible", `Le chantier "${chantierName}" est déjà planifié pour ce jour.`);
                return;
            }
            await addDoc(collection(db, "planning"), { ...dataToSave, date: currentEditingDate, teamNames: [], order: snapshot.size, createdAt: serverTimestamp() });
        }
        if (closeAfterSave) closePlanningItemModal();
        else { form.reset(); document.getElementById('planningStartTime').value = '08:00'; select.selectedIndex = 0; select.focus(); }
        await display();
    } catch (error) { console.error("Erreur de sauvegarde:", error); showInfoModal("Erreur", "Une erreur est survenue."); }
}

function toggleSelectionMode() {
    selectionMode = !selectionMode;
    const btn = document.getElementById('selectionModeBtn');
    const deleteBtn = document.getElementById('deleteSelectionBtn');
    document.querySelectorAll('.planning-block').forEach(block => {
        const checkbox = block.querySelector('.selection-checkbox');
        checkbox.checked = false;
        checkbox.classList.toggle('hidden', !selectionMode);
        // On ajuste le `onclick` pour la sélection multiple
        if (selectionMode) {
            block.onclick = (e) => {
                if (!e.target.closest('.delete-planning-btn')) {
                    checkbox.checked = !checkbox.checked;
                    if (checkbox.checked) selectedItems.add(block.dataset.planningId);
                    else selectedItems.delete(block.dataset.planningId);
                }
            };
        } else {
            // On restaure le listener d'origine en rafraîchissant
            display();
        }
    });
    if (selectionMode) {
        btn.textContent = "Annuler";
        btn.classList.replace('bg-yellow-500', 'bg-gray-500');
        deleteBtn.classList.remove('hidden');
    } else {
        btn.textContent = "Sélectionner";
        btn.classList.replace('bg-gray-500', 'bg-yellow-500');
        deleteBtn.classList.add('hidden');
        selectedItems.clear();
        display(); 
    }
}

async function deleteSelectedItems() {
    if (selectedItems.size === 0) { showInfoModal("Information", "Aucun chantier n'a été sélectionné."); return; }
    if (await showConfirmationModal("Confirmation", `Supprimer les ${selectedItems.size} chantiers sélectionnés ?`)) {
        const batch = writeBatch(db);
        selectedItems.forEach(id => batch.delete(doc(db, "planning", id)));
        await batch.commit();
        showInfoModal("Succès", `${selectedItems.size} chantiers ont été supprimés.`);
        selectionMode = false;
        selectedItems.clear();
        // Reset UI correctly
        document.getElementById('selectionModeBtn').textContent = "Sélectionner";
        document.getElementById('selectionModeBtn').classList.replace('bg-gray-500', 'bg-yellow-500');
        document.getElementById('deleteSelectionBtn').classList.add('hidden');
        await display();
    }
}

async function generatePrintableView() {
    const { startOfWeek } = getWeekDateRange(currentWeekOffset);
    const weekString = `Semaine du ${startOfWeek.toLocaleDateString('fr-FR', { timeZone: 'UTC' })}`;
    const printWindow = window.open('', '_blank');
    printWindow.document.write('<html><head><title>Planning Imprimable</title><script src="https://cdn.tailwindcss.com"></script></head><body class="p-4">');
    printWindow.document.write(`<h1 class="text-3xl font-bold mb-4">${weekString}</h1>`);
    const q = query(collection(db, "planning"), where("date", ">=", startOfWeek.toISOString().split('T')[0]), where("date", "<=", getWeekDateRange(currentWeekOffset).endOfWeek.toISOString().split('T')[0]), orderBy("date"), orderBy("order"));
    const snapshot = await getDocs(q);
    const planningByDate = {};
    snapshot.forEach(d => {
        const data = d.data();
        if (!planningByDate[data.date]) planningByDate[data.date] = [];
        planningByDate[data.date].push(data);
    });
    const days = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
    for (let i = 0; i < 7; i++) {
        const dayDate = new Date(startOfWeek);
        dayDate.setUTCDate(startOfWeek.getUTCDate() + i);
        const dateString = dayDate.toISOString().split('T')[0];
        printWindow.document.write(`<h2 class="text-xl font-bold mt-4 border-b pb-1">${days[i]} ${dayDate.toLocaleDateString('fr-FR', {timeZone:'UTC'})}</h2>`);
        const tasks = planningByDate[dateString];
        if (tasks && tasks.length > 0) {
            printWindow.document.write('<div class="mt-2 space-y-2">');
            tasks.forEach(task => {
                printWindow.document.write(`<div class="p-2 border rounded"><p class="font-bold">${task.chantierName}</p><p class="text-sm">Équipe: ${task.teamNames.join(', ') || 'Personne'}</p><p class="text-sm">Durée: ${task.duration}h</p>`);
                if(task.notes) printWindow.document.write(`<p class="text-sm text-blue-600">Note: ${task.notes}</p>`);
                printWindow.document.write('</div>');
            });
            printWindow.document.write('</div>');
        } else {
            printWindow.document.write('<p class="text-gray-500 mt-2">Rien de prévu.</p>');
        }
    }
    printWindow.document.write('</body></html>');
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
}