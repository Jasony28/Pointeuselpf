import { collection, query, where, getDocs, addDoc, deleteDoc, doc, orderBy, serverTimestamp, updateDoc, setDoc, getDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent, currentUser, showConfirmationModal, showInfoModal } from "../app.js";
import { getWeekDateRange } from "./utils.js";
import { getActiveChantiers, getTeamMembers } from "./data-service.js";

const state = {
    currentWeekOffset: 0,
    chantiers: [],
    teamMembers: [],
    currentView: 'week',
    selectedDayIndex: 0,
    selectionMode: false,
    selectedItems: new Set(),
    assignMode: false,
    editing: { id: null, date: null }
};

function getPlanningHTML() {
    return `
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
                            <button data-view="week" class="view-btn px-3 py-1 text-sm rounded-md">Vue Semaine</button>
                            <button data-view="day" class="view-btn px-3 py-1 text-sm rounded-md">Vue Jour</button>
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <button id="selectionModeBtn" class="bg-yellow-500 hover:bg-yellow-600 text-white font-bold px-4 py-2 rounded-lg">Sélectionner</button>
                        <button id="deleteSelectionBtn" class="hidden bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2 rounded-lg">Supprimer la sélection</button>
                        <button id="downloadPdfBtn" title="Imprimer ou Enregistrer le planning en PDF" class="bg-green-600 hover:bg-green-700 text-white p-2 rounded-lg"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/><path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708-.708l3 3z"/></svg></button>
                        <button id="publishBtn" class="font-bold px-4 py-2 rounded-lg disabled:bg-gray-400"></button>
                    </div>
                </div>
            </div>
            <div class="flex flex-col md:flex-row gap-4">
                <div class="md:w-1/4 lg:w-1/5 bg-white p-4 rounded-lg shadow-sm flex flex-col">
                    <h3 class="font-bold text-lg border-b pb-2 mb-2">Équipe</h3>
                    <div id="team-pool" class="space-y-2 min-h-[100px] overflow-y-auto"></div>
                </div>
                <div class="flex-grow" id="planning-grid"></div>
            </div>
        </div>
        <div id="planningItemModal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-20 p-4">
            <div class="bg-white p-6 rounded-lg shadow-xl w-full max-w-sm">
                <h3 id="modalTitle" class="text-xl font-bold mb-4"></h3>
                <form id="planningItemForm" class="space-y-4">
                    <div><label class="text-sm font-medium">Chantier</label><select id="chantierSelect" class="w-full border p-2 rounded" required></select></div>
                    <div><label for="planningStartTime" class="text-sm font-medium">Heure de début</label><input id="planningStartTime" type="time" class="w-full border p-2 rounded" /></div>
                    <div><label for="planningNotes" class="text-sm font-medium">Notes (facultatif)</label><textarea id="planningNotes" placeholder="Instructions spécifiques..." class="w-full border p-2 rounded"></textarea></div>
                    <div class="flex justify-end gap-4 pt-4 border-t">
                        <button type="button" id="cancelPlanningItem" class="bg-gray-300 hover:bg-gray-400 px-4 py-2 rounded">Annuler</button>
                        <button type="button" id="saveAndAddAnotherBtn" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded">Enregistrer et Ajouter</button>
                        <button type="button" id="saveAndCloseBtn" class="bg-green-600 hover:bg-green-700 text-white font-bold px-4 py-2 rounded">Enregistrer et Fermer</button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

export async function render() {
    pageContent.innerHTML = getPlanningHTML();
    await initialize();
}
async function initialize() {
    setupEventListeners();
    await cacheData();
    display();
    populateTeamPool();
}

async function cacheData() {
    state.chantiers = await getActiveChantiers();
    state.teamMembers = await getTeamMembers();
}

function setupEventListeners() {
    document.getElementById("prevWeekBtn").onclick = () => { state.currentWeekOffset--; display(); };
    document.getElementById("nextWeekBtn").onclick = () => { state.currentWeekOffset++; display(); };
    document.getElementById("downloadPdfBtn").onclick = generatePrintableView;
    document.getElementById("selectionModeBtn").onclick = toggleSelectionMode;
    document.getElementById("deleteSelectionBtn").onclick = deleteSelectedItems;

    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            state.currentView = btn.dataset.view;
            display();
        });
    });

    document.getElementById("cancelPlanningItem").onclick = closePlanningItemModal;
    document.getElementById("saveAndCloseBtn").onclick = () => savePlanningItem(true);
    document.getElementById("saveAndAddAnotherBtn").onclick = () => savePlanningItem(false);
    
    document.getElementById("planning-grid").addEventListener('click', handleGridClick);

    document.getElementById("team-pool").addEventListener('change', (e) => {
        if (e.target.classList.contains('team-checkbox')) {
            updateAssignMode();
        }
    });
}

async function handleGridClick(e) {
    const target = e.target;
    const planningBlock = target.closest('.planning-block');

    if (target.classList.contains('add-chantier-btn')) {
        openPlanningItemModal(null, target.dataset.date);
        return;
    }
    
    if (target.classList.contains('day-selector-btn')) {
        state.selectedDayIndex = parseInt(target.dataset.dayIndex);
        display();
        return;
    }

    if (!planningBlock) return;

    const planningId = planningBlock.dataset.planningId;
    const taskData = await getPlanningTask(planningId);

    if (target.classList.contains('delete-planning-btn')) {
        e.stopPropagation();
        if (await showConfirmationModal("Confirmation", `Supprimer le chantier "${taskData.chantierName}" de ce jour ?`)) {
            await deleteDoc(doc(db, "planning", planningId));
            planningBlock.remove();
        }
        return;
    }

    const teamMemberTag = target.closest('.team-member-tag');
    if (teamMemberTag) {
        handleMemberRemoval(planningBlock, taskData, teamMemberTag.dataset.name);
        return;
    }

    if (state.selectionMode) {
        const checkbox = planningBlock.querySelector('.selection-checkbox');
        checkbox.checked = !checkbox.checked;
        if (checkbox.checked) state.selectedItems.add(planningId);
        else state.selectedItems.delete(planningId);
    } else if (state.assignMode) {
        assignSelectedTeamToBlock(planningBlock, taskData);
    } else {
        openPlanningItemModal(taskData);
    }
}

function display() {
    updateViewButtons();
    if (state.currentView === 'week') {
        displayWeekView();
    } else {
        displayDayView();
    }
}

function updateViewButtons() {
    document.querySelectorAll('.view-btn').forEach(btn => {
        const isSelected = btn.dataset.view === state.currentView;
        btn.classList.toggle('bg-white', isSelected);
        btn.classList.toggle('shadow', isSelected);
    });
}

async function displayWeekView() {
    const { startOfWeek, endOfWeek } = getWeekDateRange(state.currentWeekOffset);
    document.getElementById("currentPeriodDisplay").textContent = `Semaine du ${startOfWeek.toLocaleDateString('fr-FR', {timeZone: 'UTC', day: 'numeric', month: 'long'})} au ${endOfWeek.toLocaleDateString('fr-FR', {timeZone: 'UTC', day: 'numeric', month: 'long'})}`;
    
    await checkAndRenderPublishButton(startOfWeek);

    const planningGrid = document.getElementById("planning-grid");
    planningGrid.className = 'flex-grow grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3';
    planningGrid.innerHTML = "";
    
    const days = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
    for (let i = 0; i < 7; i++) {
        const dayDate = new Date(startOfWeek);
        dayDate.setUTCDate(startOfWeek.getUTCDate() + i);
        const dateString = dayDate.toISOString().split('T')[0];
        const dayColHTML = `
            <div class="bg-gray-50 rounded-lg p-2 flex flex-col">
                <div class="flex justify-between items-center mb-2">
                    <h4 class="font-bold text-center">${days[i]} <span class="text-sm font-normal text-gray-500">${dayDate.getUTCDate()}</span></h4>
                    <button data-date="${dateString}" class="add-chantier-btn text-lg font-bold text-purple-600 hover:text-purple-800">+</button>
                </div>
                <div class="day-tasks-container space-y-2 flex-grow" id="day-col-${dateString}"></div>
            </div>`;
        planningGrid.innerHTML += dayColHTML;
    }
    
    loadPlanningForWeek(startOfWeek, endOfWeek);
}

function displayDayView() {
    const { startOfWeek } = getWeekDateRange(state.currentWeekOffset);
    const days = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
    const selectedDate = new Date(startOfWeek);
    selectedDate.setUTCDate(selectedDate.getUTCDate() + state.selectedDayIndex);
    const dateString = selectedDate.toISOString().split('T')[0];

    document.getElementById("currentPeriodDisplay").textContent = selectedDate.toLocaleDateString('fr-FR', {timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long'});
    
    const planningGrid = document.getElementById("planning-grid");
    planningGrid.className = 'flex';
    planningGrid.innerHTML = `
        <div class="bg-gray-100 rounded-lg p-2 flex flex-col w-full">
            <div class="flex justify-between items-center mb-2">
                <div class="flex items-center gap-2 flex-wrap">
                    ${days.map((day, index) => `<button data-day-index="${index}" class="day-selector-btn px-3 py-1 text-sm rounded-md ${index === state.selectedDayIndex ? 'bg-purple-600 text-white' : 'bg-gray-200'}">${day}</button>`).join('')}
                </div>
                <button data-date="${dateString}" class="add-chantier-btn text-2xl font-bold text-purple-600 hover:text-purple-800">+</button>
            </div>
            <div class="day-tasks-container grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-2 flex-grow overflow-y-auto" style="grid-auto-flow: column; grid-template-rows: repeat(9, auto);" id="day-col-${dateString}"></div>
        </div>`;
    
    loadPlanningForDay(selectedDate);
}

function populateTeamPool() {
    const pool = document.getElementById('team-pool');
    pool.innerHTML = '';
    state.teamMembers.forEach(name => {
        const item = document.createElement('div');
        item.className = 'flex items-center gap-2 p-2 bg-gray-100 rounded cursor-pointer hover:bg-gray-200';
        item.innerHTML = `
            <input type="checkbox" class="team-checkbox h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500">
            <span class="text-sm">${name}</span>
        `;
        pool.appendChild(item);
    });
}

function createChantierBlock(planningDoc) {
    const { id, chantierId, chantierName, teamNames, notes, startTime } = planningDoc;
    const block = document.createElement('div');
    block.className = 'planning-block p-1.5 bg-white rounded shadow cursor-pointer text-xs relative';
    block.dataset.planningId = id;
    
    const noteIndicator = notes ? ` <span class="text-blue-500" title="${notes}">📝</span>` : '';
    const timeInfo = startTime ? `<strong>${startTime}</strong>` : '';
    
    block.innerHTML = `
        <div class="flex justify-between items-start">
            <p class="font-bold text-purple-800 leading-tight pointer-events-none">${chantierName}</p>
            <button class="delete-planning-btn text-red-400 hover:text-red-700 font-bold -mt-1 -mr-1">✖</button>
        </div>
        <p class="text-gray-600 my-0.5 time-info pointer-events-none">${timeInfo}${noteIndicator}</p>
        <div class="team-display-zone mt-1 space-y-0.5"></div>
        <input type="checkbox" class="selection-checkbox hidden absolute top-1 right-1 h-4 w-4">
    `;
    
    renderTeamInBlock(block, teamNames);
    return block;
}

function renderTeamInBlock(planningBlock, teamNames) {
    const teamZone = planningBlock.querySelector('.team-display-zone');
    if (teamNames && teamNames.length > 0) {
        teamZone.innerHTML = teamNames.map(name => `
            <div class="team-member-tag p-0.5 bg-blue-100 text-blue-800 rounded text-[10px] leading-tight flex items-center gap-1" data-name="${name}" title="Cliquer pour retirer">
                <span>${name}</span>
                <span class="font-bold text-red-500 hover:text-red-700 pointer-events-none">&times;</span>
            </div>
        `).join('');
    } else { teamZone.innerHTML = ''; }
}

async function loadPlanningForWeek(start, end) {
    try {
        const q = query(collection(db, "planning"), where("date", ">=", start.toISOString().split('T')[0]), where("date", "<=", end.toISOString().split('T')[0]), orderBy("date"), orderBy("order"));
        const snapshot = await getDocs(q);
        snapshot.docs.forEach(docSnap => {
            const data = { id: docSnap.id, ...docSnap.data() };
            const container = document.getElementById(`day-col-${data.date}`);
            if (container) container.appendChild(createChantierBlock(data));
        });
    } catch (error) {
        console.error("Erreur de chargement du planning:", error);
        document.getElementById("planning-grid").innerHTML = `<p class="text-red-500 text-center col-span-full">Erreur de chargement du planning.</p>`;
    }
}

async function loadPlanningForDay(date) {
    const dateString = date.toISOString().split('T')[0];
    const container = document.getElementById(`day-col-${dateString}`);
    if (!container) return;
    container.innerHTML = 'Chargement...';
    try {
        const q = query(collection(db, "planning"), where("date", "==", dateString), orderBy("order"));
        const snapshot = await getDocs(q);
        container.innerHTML = '';
        snapshot.docs.forEach(docSnap => {
            const data = { id: docSnap.id, ...docSnap.data() };
            container.appendChild(createChantierBlock(data));
        });
    } catch (error) {
        console.error("Erreur de chargement du planning du jour:", error);
        container.innerHTML = `<p class="text-red-500 text-center">Erreur de chargement.</p>`;
    }
}

async function getPlanningTask(id) {
    const docRef = doc(db, "planning", id);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
}

function openPlanningItemModal(planningDoc = null, date = null) {
    const modal = document.getElementById('planningItemModal');
    const form = document.getElementById('planningItemForm');
    const select = document.getElementById('chantierSelect');
    form.reset();

    if (planningDoc) {
        state.editing = { id: planningDoc.id, date: planningDoc.date };
        document.getElementById('modalTitle').textContent = 'Modifier le travail';
        select.innerHTML = state.chantiers.map(c => `<option value="${c.id}|${c.name}" ${c.name === planningDoc.chantierName ? 'selected' : ''}>${c.name}</option>`).join('');
        document.getElementById('planningStartTime').value = planningDoc.startTime || '';
        document.getElementById('planningNotes').value = planningDoc.notes || '';
        document.getElementById('saveAndAddAnotherBtn').style.display = 'none';
    } else {
        state.editing = { id: null, date: date };
        document.getElementById('modalTitle').textContent = `Ajouter un chantier pour le ${new Date(date + 'T12:00:00Z').toLocaleDateString('fr-FR', {weekday: 'long', day: 'numeric'})}`;
        select.innerHTML = '<option value="" disabled selected>-- Choisissez un chantier --</option>' + state.chantiers.map(c => `<option value="${c.id}|${c.name}">${c.name}</option>`).join('');
        document.getElementById('planningStartTime').value = '08:00';
        document.getElementById('saveAndAddAnotherBtn').style.display = 'inline-block';
    }
    modal.classList.remove('hidden');
}

function closePlanningItemModal() {
    document.getElementById('planningItemModal').classList.add('hidden');
}

async function savePlanningItem(closeAfterSave) {
    const select = document.getElementById('chantierSelect');
    if (!select.value) { showInfoModal("Attention", "Veuillez choisir un chantier."); return; }
    
    const [chantierId, chantierName] = select.value.split('|');
    
    const dataToSave = {
        chantierId, 
        chantierName,
        notes: document.getElementById('planningNotes').value.trim(),
        startTime: document.getElementById('planningStartTime').value
    };

    try {
        if (state.editing.id) {
            await updateDoc(doc(db, "planning", state.editing.id), dataToSave);
        } else {
            const q = query(collection(db, "planning"), where("date", "==", state.editing.date));
            const snapshot = await getDocs(q);
            if (snapshot.docs.some(d => d.data().chantierName === chantierName)) {
                showInfoModal("Action Impossible", `Le chantier "${chantierName}" est déjà planifié pour ce jour.`);
                return;
            }
            await addDoc(collection(db, "planning"), { ...dataToSave, date: state.editing.date, teamNames: [], order: snapshot.size, createdAt: serverTimestamp() });
        }
        
        if (closeAfterSave) closePlanningItemModal();
        else { 
            document.getElementById('planningItemForm').reset();
            document.getElementById('planningStartTime').value = '08:00'; 
            select.selectedIndex = 0; 
            select.focus(); 
        }
        await display();
    } catch (error) { 
        console.error("Erreur de sauvegarde:", error); 
        showInfoModal("Erreur", "Une erreur est survenue."); 
    }
}

function updateAssignMode() {
    const selectedCheckboxes = document.querySelectorAll('.team-checkbox:checked');
    state.assignMode = selectedCheckboxes.length > 0;
    document.body.style.cursor = state.assignMode ? 'copy' : 'default';
}

async function assignSelectedTeamToBlock(planningBlock, planningDoc) {
    const selectedTeam = Array.from(document.querySelectorAll('.team-checkbox:checked')).map(cb => cb.nextElementSibling.textContent);
    planningDoc.teamNames = [...new Set([...(planningDoc.teamNames || []), ...selectedTeam])];
    renderTeamInBlock(planningBlock, planningDoc.teamNames);
    await updateDoc(doc(db, "planning", planningDoc.id), { teamNames: planningDoc.teamNames });
}

async function handleMemberRemoval(planningBlock, planningDoc, memberNameToRemove) {
    planningDoc.teamNames = planningDoc.teamNames.filter(name => name !== memberNameToRemove);
    renderTeamInBlock(planningBlock, planningDoc.teamNames);
    await updateDoc(doc(db, "planning", planningDoc.id), { teamNames: planningDoc.teamNames });
}

function toggleSelectionMode() {
    state.selectionMode = !state.selectionMode;
    const btn = document.getElementById('selectionModeBtn');
    const deleteBtn = document.getElementById('deleteSelectionBtn');
    document.querySelectorAll('.planning-block').forEach(block => {
        block.querySelector('.selection-checkbox').classList.toggle('hidden', !state.selectionMode);
    });

    if (state.selectionMode) {
        btn.textContent = "Annuler";
        btn.classList.replace('bg-yellow-500', 'bg-gray-500');
        deleteBtn.classList.remove('hidden');
    } else {
        btn.textContent = "Sélectionner";
        btn.classList.replace('bg-gray-500', 'bg-yellow-500');
        deleteBtn.classList.add('hidden');
        state.selectedItems.clear();
        document.querySelectorAll('.selection-checkbox').forEach(cb => cb.checked = false);
    }
}

async function deleteSelectedItems() {
    if (state.selectedItems.size === 0) { showInfoModal("Information", "Aucun élément sélectionné."); return; }
    if (await showConfirmationModal("Confirmation", `Supprimer les ${state.selectedItems.size} éléments sélectionnés ?`)) {
        const batch = writeBatch(db);
        state.selectedItems.forEach(id => batch.delete(doc(db, "planning", id)));
        await batch.commit();
        showInfoModal("Succès", `${state.selectedItems.size} éléments supprimés.`);
        toggleSelectionMode();
        await display();
    }
}

async function checkAndRenderPublishButton(startOfWeek) {
    const weekId = startOfWeek.toISOString().split('T')[0];
    const publishDoc = await getDoc(doc(db, "publishedSchedules", weekId));
    const btn = document.getElementById('publishBtn');
    if (!btn) return;
    btn.disabled = false;
    if (publishDoc.exists()) {
        btn.textContent = 'Notifier les changements';
        btn.className = 'bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-lg';
        btn.onclick = sendUpdateNotification;
    } else {
        btn.textContent = 'Publier la semaine';
        btn.className = 'bg-green-600 hover:bg-green-700 text-white font-bold px-4 py-2 rounded-lg';
        btn.onclick = publishWeek;
    }
}

async function publishWeek() {
    const { startOfWeek } = getWeekDateRange(state.currentWeekOffset);
    const weekId = startOfWeek.toISOString().split('T')[0];
    const weekString = startOfWeek.toLocaleDateString('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'long' });
    if (await showConfirmationModal("Publication", `Voulez-vous PUBLIER le planning pour la semaine du ${weekString} ?`)) {
        try {
            await setDoc(doc(db, "publishedSchedules", weekId), { published: true, publishedAt: serverTimestamp(), publishedBy: currentUser.displayName });
            await addDoc(collection(db, "notifications"), { title: "Nouveau Planning Publié", body: `Le planning pour la semaine du ${weekString} est maintenant disponible.`, createdAt: serverTimestamp(), author: currentUser.displayName });
            showInfoModal("Succès", "Planning publié et notification envoyée !");
            await checkAndRenderPublishButton(startOfWeek);
        } catch (error) { showInfoModal("Erreur", "La publication a échoué."); }
    }
}

async function sendUpdateNotification() {
    const { startOfWeek } = getWeekDateRange(state.currentWeekOffset);
    const weekString = startOfWeek.toLocaleDateString('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'long' });
    if (await showConfirmationModal("Notification", `Voulez-vous envoyer une notification de MISE À JOUR pour le planning de la semaine du ${weekString} ?`)) {
        try {
            await addDoc(collection(db, "notifications"), { title: "Planning Mis à Jour", body: `Le planning de la semaine du ${weekString} a été modifié.`, createdAt: serverTimestamp(), author: currentUser.displayName });
            showInfoModal("Succès", "Notification de mise à jour envoyée !");
        } catch (error) { showInfoModal("Erreur", "L'envoi a échoué."); }
    }
}

async function generatePrintableView() {
    showInfoModal("Génération du PDF...", "Veuillez patienter, nous préparons votre planning.");

    const { startOfWeek } = getWeekDateRange(state.currentWeekOffset);
    const weekString = `Semaine du ${startOfWeek.toLocaleDateString('fr-FR', { timeZone: 'UTC' })}`;

    const q = query(
        collection(db, "planning"), 
        where("date", ">=", startOfWeek.toISOString().split('T')[0]), 
        where("date", "<=", getWeekDateRange(state.currentWeekOffset).endOfWeek.toISOString().split('T')[0]),
        orderBy("date"), 
        orderBy("order")
    );
    const snapshot = await getDocs(q);
    const planningTasks = snapshot.docs.map(d => d.data());

    const planningGrid = new Map();
    const daysOfWeek = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

    const allTeamMembers = [...new Set(planningTasks.flatMap(task => task.teamNames || []))].sort();

    allTeamMembers.forEach(name => {
        planningGrid.set(name, {
            Lundi: [], Mardi: [], Mercredi: [], Jeudi: [], Vendredi: [], Samedi: [], Dimanche: [], totalHours: 0
        });
    });

    planningTasks.forEach(task => {
        if (!task.teamNames || task.teamNames.length === 0) return;

        const taskDate = new Date(task.date + 'T12:00:00Z');
        const dayIndex = (taskDate.getUTCDay() + 6) % 7;
        const dayName = daysOfWeek[dayIndex];
        
        const duration = parseFloat(task.duration) || 0; 
        const taskText = `${task.chantierName}${duration > 0 ? ` (${duration.toFixed(1)}h)` : ''}`;

        task.teamNames.forEach(name => {
            if (planningGrid.has(name)) {
                planningGrid.get(name)[dayName].push(taskText);
                planningGrid.get(name).totalHours += duration;
            }
        });
    });

    const tableHead = [['Employé', ...daysOfWeek, 'Total Semaine']];
    const tableBody = [];

    planningGrid.forEach((weekData, name) => {
        const row = [name];
        daysOfWeek.forEach(day => {
            row.push(weekData[day].join('\n'));
        });
        row.push(`${weekData.totalHours.toFixed(1)}h`);
        tableBody.push(row);
    });
    
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

    pdf.setFontSize(18);
    pdf.text("Planning de la Semaine", 40, 40);
    pdf.setFontSize(12);
    pdf.text(weekString, 40, 60);

    pdf.autoTable({
        head: tableHead,
        body: tableBody,
        startY: 80,
        theme: 'grid',
        headStyles: {
            fillColor: [41, 51, 92],
            textColor: 255,
            fontStyle: 'bold'
        },
        styles: {
            fontSize: 8,
            cellPadding: 4,
            valign: 'middle',
        },
        columnStyles: {
            0: { fontStyle: 'bold', minCellWidth: 80 },
            7: { fontStyle: 'bold', minCellWidth: 50 },
        }
    });

    pdf.save(`Planning_${weekString.replace(/ /g, '_')}.pdf`);
}