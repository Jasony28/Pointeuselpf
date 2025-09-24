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

export async function render() {
    pageContent.innerHTML = `
        <div class="max-w-full mx-auto">
            <h2 class="text-2xl font-bold mb-4">🗓️ Planification de la semaine</h2>
            <div class="p-4 rounded-lg shadow-sm mb-4" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                <div class="flex flex-wrap justify-between items-center gap-4">
                    <div class="flex items-center gap-4">
                        <div class="flex items-center gap-2">
                            <button id="prevWeekBtn" class="px-4 py-2 rounded-lg" style="background-color: var(--color-background);">&lt;</button>
                            <div id="currentPeriodDisplay" class="text-center font-semibold text-lg min-w-[280px]"></div>
                            <button id="nextWeekBtn" class="px-4 py-2 rounded-lg" style="background-color: var(--color-background);">&gt;</button>
                        </div>
                        <div class="flex items-center border rounded-lg p-1" style="background-color: var(--color-background); border-color: var(--color-border);">
                            <button data-view="week" class="view-btn px-3 py-1 text-sm rounded-md">Vue Semaine</button>
                            <button data-view="day" class="view-btn px-3 py-1 text-sm rounded-md">Vue Jour</button>
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <button id="selectionModeBtn" class="bg-yellow-500 hover:bg-yellow-600 text-white font-bold px-4 py-2 rounded-lg">Sélectionner</button>
                        <button id="deleteSelectionBtn" class="hidden bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2 rounded-lg">Supprimer</button>
                        <button id="publishBtn" class="font-bold px-4 py-2 rounded-lg text-white"></button>
                    </div>
                </div>
            </div>
            <div class="flex flex-col md:flex-row gap-4">
                <div class="md:w-1/4 lg:w-1/5 p-4 rounded-lg shadow-sm flex flex-col" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                    <h3 class="font-bold text-lg border-b pb-2 mb-2" style="border-color: var(--color-border);">Équipe</h3>
                    <div id="team-pool" class="space-y-2 min-h-[100px] overflow-y-auto"></div>
                </div>
                <div class="flex-grow" id="planning-grid"></div>
            </div>
        </div>
        <div id="planningItemModal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-20 p-4">
            <div class="p-6 rounded-lg shadow-xl w-full max-w-sm" style="background-color: var(--color-surface);">
                <h3 id="modalTitle" class="text-xl font-bold mb-4"></h3>
                <form id="planningItemForm" class="space-y-4">
                    <div><label class="text-sm font-medium">Chantier</label><select id="chantierSelect" class="w-full border p-2 rounded" style="background-color: var(--color-background); border-color: var(--color-border);" required></select></div>
                    <div><label for="planningStartTime" class="text-sm font-medium">Heure de début</label><input id="planningStartTime" type="time" class="w-full border p-2 rounded" style="background-color: var(--color-background); border-color: var(--color-border);" /></div>
                    <div><label for="planningNotes" class="text-sm font-medium">Notes (facultatif)</label><textarea id="planningNotes" placeholder="Instructions..." class="w-full border p-2 rounded" style="background-color: var(--color-background); border-color: var(--color-border);"></textarea></div>
                    <div class="flex justify-end gap-4 pt-4 border-t" style="border-color: var(--color-border);">
                        <button type="button" id="cancelPlanningItem" class="px-4 py-2 rounded" style="background-color: var(--color-background); border: 1px solid var(--color-border);">Annuler</button>
                        <button type="button" id="saveAndAddAnotherBtn" class="text-white px-4 py-2 rounded" style="background-color: var(--color-primary);">Enregistrer et Ajouter</button>
                        <button type="button" id="saveAndCloseBtn" class="text-white font-bold px-4 py-2 rounded" style="background-color: var(--color-primary);">Enregistrer et Fermer</button>
                    </div>
                </form>
            </div>
        </div>
    `;
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
        if (isSelected) {
            btn.style.backgroundColor = 'var(--color-surface)';
            btn.classList.add('shadow');
        } else {
            btn.style.backgroundColor = 'transparent';
            btn.classList.remove('shadow');
        }
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
        const dayCol = document.createElement('div');
        dayCol.className = 'p-2 rounded-lg flex flex-col';
        dayCol.style.backgroundColor = 'var(--color-background)';
        dayCol.innerHTML = `
            <div class="flex justify-between items-center mb-2">
                <h4 class="font-bold text-center">${days[i]} <span class="text-sm font-normal" style="color: var(--color-text-muted);">${dayDate.getUTCDate()}</span></h4>
                <button data-date="${dateString}" class="add-chantier-btn text-lg font-bold hover:opacity-70" style="color: var(--color-primary);">+</button>
            </div>
            <div class="day-tasks-container space-y-2 flex-grow" id="day-col-${dateString}"></div>
        `;
        planningGrid.appendChild(dayCol);
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
        <div class="p-2 rounded-lg flex flex-col w-full" style="background-color: var(--color-background);">
            <div class="flex justify-between items-center mb-2">
                <div class="flex items-center gap-2 flex-wrap">
                    ${days.map((day, index) => `<button data-day-index="${index}" class="day-selector-btn px-3 py-1 text-sm rounded-md ${index === state.selectedDayIndex ? 'text-white shadow' : ''}" style="background-color: ${index === state.selectedDayIndex ? 'var(--color-primary)' : 'var(--color-surface)'};">${day}</button>`).join('')}
                </div>
                <button data-date="${dateString}" class="add-chantier-btn text-2xl font-bold hover:opacity-70" style="color: var(--color-primary);">+</button>
            </div>
            <div class="day-tasks-container grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-2 flex-grow overflow-y-auto" style="grid-auto-flow: column; grid-template-rows: repeat(9, auto);" id="day-col-${dateString}"></div>
        </div>`;
    
    loadPlanningForDay(selectedDate);
}

function populateTeamPool() {
    const pool = document.getElementById('team-pool');
    pool.innerHTML = '';
    state.teamMembers.forEach(name => {
        const item = document.createElement('label');
        item.className = 'flex items-center gap-2 p-2 rounded cursor-pointer';
        item.style.backgroundColor = 'var(--color-background)';
        item.innerHTML = `
            <input type="checkbox" class="team-checkbox h-4 w-4 rounded border-gray-300 focus:ring-offset-0" style="color: var(--color-primary);">
            <span class="text-sm">${name}</span>
        `;
        pool.appendChild(item);
    });
}

function createChantierBlock(planningDoc) {
    const { id, chantierName, teamNames, notes, startTime } = planningDoc;
    const block = document.createElement('div');
    block.className = 'planning-block p-1.5 rounded shadow cursor-pointer text-xs relative';
    block.style.backgroundColor = 'var(--color-surface)';
    block.dataset.planningId = id;
    
    const noteIndicator = notes ? ` <span style="color: var(--color-primary);" title="${notes}">📝</span>` : '';
    const timeInfo = startTime ? `<strong>${startTime}</strong>` : '';
    
    block.innerHTML = `
        <div class="flex justify-between items-start">
            <p class="font-bold leading-tight pointer-events-none" style="color: var(--color-primary);">${chantierName}</p>
            <button class="delete-planning-btn text-red-400 hover:text-red-700 font-bold -mt-1 -mr-1">✖</button>
        </div>
        <p class="my-0.5 time-info pointer-events-none" style="color: var(--color-text-muted);">${timeInfo}${noteIndicator}</p>
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
            <div class="team-member-tag p-0.5 rounded text-[10px] leading-tight flex items-center gap-1" data-name="${name}" title="Cliquer pour retirer" style="background-color: var(--color-background);">
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