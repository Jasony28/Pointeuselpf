import { collection, query, where, getDocs, addDoc, deleteDoc, doc, orderBy, serverTimestamp, updateDoc, setDoc, getDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent, currentUser, showConfirmationModal, showInfoModal } from "../app.js";
// CORRECTION: L'import est maintenant actif et la fonction locale a été supprimée.
import { getWeekDateRange } from "./utils.js";

// Variables globales du module
let currentWeekOffset = 0;
let chantiersCache = [];
let teamMembersCache = [];
let currentEditingId = null;
let currentEditingDate = null;
let currentView = 'week'; // peut être 'week' ou 'day'
let selectedDayIndex = 0; // 0 pour Lundi, 1 pour Mardi, etc.
let selectionMode = false;
let selectedItems = new Set();


/**
 * Fonction principale pour afficher la page de planification.
 */
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
                    <div id="team-trash-can" class="mt-4 p-4 border-2 border-dashed rounded-lg text-center text-gray-400 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" class="mx-auto" viewBox="0 0 16 16"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0z"/><path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4zM2.5 3h11V2h-11z"/></svg><p class="mt-2 text-sm">Glisser ici pour retirer</p></div>
                </div>
                <div class="flex-grow" id="planning-grid"></div>
            </div>
        </div>
        <div id="planningItemModal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-20 p-4">
            <div class="bg-white p-6 rounded-lg shadow-xl w-full max-w-sm">
                <h3 id="modalTitle" class="text-xl font-bold mb-4"></h3>
                <form id="planningItemForm" class="space-y-4">
                    <div><label class="text-sm font-medium">Chantier</label><select id="chantierSelect" class="w-full border p-2 rounded" required></select></div>
                    <div class="grid grid-cols-2 gap-4">
                        <div><label class="text-sm font-medium">Heure de début</label><input id="planningStartTime" type="time" class="w-full border p-2 rounded" /></div>
                        <div><label class="text-sm font-medium">Heures prévues</label><input id="planningDuration" type="number" step="0.5" placeholder="Ex: 8" class="w-full border p-2 rounded" /></div>
                    </div>
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
        getDocs(chantiersQuery),
        getDocs(colleaguesQuery),
        getDocs(usersQuery)
    ]);
    
    chantiersCache = chantiersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const colleagueNames = colleaguesSnapshot.docs.map(doc => doc.data().name);
    const userNames = usersSnapshot.docs.map(doc => doc.data().displayName);
    const combinedNames = [...new Set([...colleagueNames, ...userNames])];
    teamMembersCache = combinedNames.sort((a, b) => a.localeCompare(b));
}

function populateTeamPool() {
    const pool = document.getElementById('team-pool');
    pool.innerHTML = '';
    teamMembersCache.forEach(name => {
        const item = document.createElement('div');
        item.className = 'p-2 bg-gray-200 rounded cursor-move text-sm';
        item.textContent = name;
        item.dataset.teamMemberName = name;
        pool.appendChild(item);
    });
    new Sortable(pool, { group: { name: 'shared-team', pull: 'clone', put: false }, sort: false });
    const trash = document.getElementById('team-trash-can');
    new Sortable(trash, { group: 'shared-team', onAdd: (evt) => evt.item.remove() });
}

function setupEventListeners() {
    document.getElementById("prevWeekBtn").onclick = () => { currentWeekOffset--; display(); };
    document.getElementById("nextWeekBtn").onclick = () => { currentWeekOffset++; display(); };
    document.getElementById("cancelPlanningItem").onclick = closePlanningItemModal;
    document.getElementById("downloadPdfBtn").onclick = generatePrintableView;

    document.getElementById('viewWeekBtn').onclick = () => {
        currentView = 'week';
        display();
    };
    document.getElementById('viewDayBtn').onclick = () => {
        currentView = 'day';
        display();
    };
    
    document.getElementById('selectionModeBtn').onclick = toggleSelectionMode;
    document.getElementById('deleteSelectionBtn').onclick = deleteSelectedItems;
}

async function publishWeek() {
    const { startOfWeek } = getWeekDateRange(currentWeekOffset);
    const weekId = startOfWeek.toISOString().split('T')[0];
    const weekString = startOfWeek.toLocaleDateString('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'long' });
    const confirmed = await showConfirmationModal("Publication", `Voulez-vous PUBLIER le planning pour la semaine du ${weekString} ?`);
    if (confirmed) {
        const publishDocRef = doc(db, "publishedSchedules", weekId);
        const notificationRef = collection(db, "notifications");
        try {
            await setDoc(publishDocRef, { published: true, publishedAt: serverTimestamp(), publishedBy: currentUser.displayName });
            await addDoc(notificationRef, { title: "Nouveau Planning Publié", body: `Le planning pour la semaine du ${weekString} est maintenant disponible.`, createdAt: serverTimestamp(), author: currentUser.displayName });
            showInfoModal("Succès", "Planning publié et notification envoyée !");
            updatePublishButton(true);
        } catch (error) { console.error("Erreur de publication:", error); showInfoModal("Erreur", "La publication a échoué."); }
    }
}

async function sendUpdateNotification() {
    const { startOfWeek } = getWeekDateRange(currentWeekOffset);
    const weekString = startOfWeek.toLocaleDateString('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'long' });
    const confirmed = await showConfirmationModal("Notification", `Voulez-vous envoyer une notification de MISE À JOUR pour le planning de la semaine du ${weekString} ?`);
    if (confirmed) {
        try {
            await addDoc(collection(db, "notifications"), { title: "Planning Mis à Jour", body: `Le planning de la semaine du ${weekString} a été modifié.`, createdAt: serverTimestamp(), author: currentUser.displayName });
            showInfoModal("Succès", "Notification de mise à jour envoyée !");
        } catch (error) { console.error("Erreur de notification:", error); showInfoModal("Erreur", "L'envoi a échoué."); }
    }
}

async function updatePublishButton(isPublished) {
    const btn = document.getElementById('publishBtn');
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
    if (currentView === 'week') {
        displayWeekView();
    } else {
        displayDayView();
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
        
        const tasksContainer = dayCol.querySelector('.day-tasks-container');
        new Sortable(tasksContainer, { 
            group: 'planning-blocks', 
            animation: 150, 
            onAdd: (evt) => updatePlanningDate(evt.item.dataset.planningId, evt.to.id.replace('day-col-', '')),
            onEnd: (evt) => updateTasksOrder(evt.to)
        });
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
                <div class="flex items-center gap-2 flex-wrap">
                    ${days.map((day, index) => `<button data-day-index="${index}" class="day-selector-btn px-3 py-1 text-sm rounded-md ${index === selectedDayIndex ? 'bg-purple-600 text-white' : 'bg-gray-200'}">${day}</button>`).join('')}
                </div>
                <button data-date="${dateString}" class="add-chantier-btn text-2xl font-bold text-purple-600 hover:text-purple-800">+</button>
            </div>
            <div class="day-tasks-container grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-2 flex-grow overflow-y-auto" style="grid-auto-flow: column; grid-template-rows: repeat(9, auto);" id="day-col-${dateString}"></div>
        </div>
    `;

    const tasksContainer = planningGrid.querySelector('.day-tasks-container');
    new Sortable(tasksContainer, { 
        group: 'planning-blocks', 
        animation: 150,
        onEnd: (evt) => updateTasksOrder(evt.to)
    });

    planningGrid.querySelector('.add-chantier-btn').onclick = () => openPlanningItemModal(null, dateString);
    planningGrid.querySelectorAll('.day-selector-btn').forEach(btn => {
        btn.onclick = () => {
            selectedDayIndex = parseInt(btn.dataset.dayIndex);
            displayDayView();
        }
    });

    loadPlanningForDay(selectedDate);
}

async function loadPlanningForWeek(start, end) {
    const q = query(collection(db, "planning"), where("date", ">=", start.toISOString().split('T')[0]), where("date", "<=", end.toISOString().split('T')[0]), orderBy("date"), orderBy("order"));
    const querySnapshot = await getDocs(q);
    const planningData = querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
    
    planningData.forEach(data => {
        const container = document.getElementById(`day-col-${data.date}`);
        if (container) {
            container.appendChild(createChantierBlock(data));
        }
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
    const { id, chantierName, teamNames, duration, notes, startTime } = planningDoc;
    const block = document.createElement('div');
    block.className = 'planning-block p-1.5 bg-white rounded shadow cursor-grab hover:bg-gray-50 text-xs relative';
    block.dataset.planningId = id;

    const noteIndicator = notes ? ` <span class="text-blue-500" title="${notes}">📝</span>` : '';
    const timeInfo = startTime ? `<strong>${startTime}</strong> (${duration || 'N/A'}h)` : `${duration || 'N/A'}h prévues`;

    block.innerHTML = `
        <div class="flex justify-between items-start">
            <p class="font-bold text-purple-800 leading-tight">${chantierName}</p>
            <button class="delete-planning-btn text-red-400 hover:text-red-700 font-bold -mt-1 -mr-1">✖</button>
        </div>
        <p class="text-gray-600 my-0.5">${timeInfo}${noteIndicator}</p>
        <div class="team-drop-zone min-h-[20px] mt-1 space-y-0.5 bg-gray-50 p-1 rounded"></div>
        <input type="checkbox" data-id="${id}" class="selection-checkbox hidden absolute top-1 right-1 h-4 w-4">
    `;
    
    block.onclick = (e) => { if (!e.target.classList.contains('delete-planning-btn') && !e.target.classList.contains('selection-checkbox')) openPlanningItemModal(planningDoc); };
    
    const dropZone = block.querySelector('.team-drop-zone');
    if (teamNames && teamNames.length > 0) {
        teamNames.forEach(name => {
            const item = document.createElement('div');
            item.className = 'p-0.5 bg-blue-100 text-blue-800 rounded text-[10px] leading-tight';
            item.textContent = name;
            item.dataset.teamMemberName = name;
            dropZone.appendChild(item);
        });
    }
    
    new Sortable(dropZone, { 
        group: 'shared-team', 
        onAdd: async (evt) => {
            const droppedName = evt.item.dataset.teamMemberName;
            if (Array.from(evt.to.children).some(el => el !== evt.item && el.dataset.teamMemberName === droppedName)) {
                evt.item.remove();
                showInfoModal("Attention", `"${droppedName}" est déjà sur ce chantier.`);
            } else {
                evt.item.className = 'p-0.5 bg-blue-100 text-blue-800 rounded text-[10px] leading-tight';
                await updatePlanningTeam(id, dropZone);
            }
        }, 
        onRemove: () => updatePlanningTeam(id, dropZone)
    });
    
    block.querySelector('.delete-planning-btn').onclick = async (e) => { 
        e.stopPropagation(); 
        const confirmed = await showConfirmationModal("Confirmation", `Supprimer le chantier "${chantierName}" de ce jour ?`);
        if (confirmed) {
            await deleteDoc(doc(db, "planning", id));
            block.remove();
        }
    };
    return block;
}

async function updatePlanningDate(planningId, newDate) {
    try {
        await updateDoc(doc(db, "planning", planningId), { date: newDate });
    } catch (error) {
        console.error("Erreur de mise à jour de la date:", error);
        showInfoModal("Erreur", "Le déplacement du bloc a échoué.");
        display();
    }
}

async function updateTasksOrder(container) {
    const items = container.querySelectorAll('.planning-block');
    const batch = writeBatch(db);
    items.forEach((item, index) => {
        const planningId = item.dataset.planningId;
        const docRef = doc(db, "planning", planningId);
        batch.update(docRef, { order: index });
    });
    try {
        await batch.commit();
    } catch(error) {
        console.error("Erreur de mise à jour de l'ordre:", error)
    }
}

async function updatePlanningTeam(planningId, dropZone) {
    const teamNames = Array.from(dropZone.children).map(el => el.dataset.teamMemberName);
    await updateDoc(doc(db, "planning", planningId), { teamNames: teamNames });
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
        document.getElementById('planningDuration').value = planningDoc.duration || '';
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
    const select = document.getElementById('chantierSelect');
    if (!select.value) {
        showInfoModal("Attention", "Veuillez choisir un chantier.");
        return;
    }
    const [chantierId, chantierName] = select.value.split('|');
    const duration = document.getElementById('planningDuration').value;
    const notes = document.getElementById('planningNotes').value.trim();
    const startTime = document.getElementById('planningStartTime').value;
    
    const dataToSave = { 
        chantierId, 
        chantierName, 
        duration, 
        notes, 
        startTime 
    };

    try {
        if (currentEditingId) {
            // Si on modifie une tâche, on met simplement à jour.
            // Une vérification plus complexe pourrait être ajoutée ici si nécessaire.
            await updateDoc(doc(db, "planning", currentEditingId), dataToSave);
        } else {
            // --- VÉRIFICATION DES DOUBLONS ---
            // 1. On récupère toutes les tâches du jour concerné.
            const q = query(collection(db, "planning"), where("date", "==", currentEditingDate));
            const snapshot = await getDocs(q);
            const existingTasks = snapshot.docs.map(doc => doc.data());

            // 2. On vérifie si un chantier avec le même nom existe déjà.
            const isDuplicate = existingTasks.some(task => task.chantierName === chantierName);

            // 3. Si c'est un doublon, on affiche une erreur et on arrête.
            if (isDuplicate) {
                showInfoModal("Action Impossible", `Le chantier "${chantierName}" est déjà planifié pour ce jour.`);
                return; // On arrête la fonction ici.
            }
            // --- FIN DE LA VÉRIFICATION ---

            // Si ce n'est pas un doublon, on ajoute la nouvelle tâche.
            await addDoc(collection(db, "planning"), { 
                ...dataToSave,
                date: currentEditingDate, 
                teamNames: [], 
                order: snapshot.size,
                createdAt: serverTimestamp() 
            });
        }

        if (closeAfterSave) {
            closePlanningItemModal();
        } else {
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


function updateViewButtons() {
    const weekBtn = document.getElementById('viewWeekBtn');
    const dayBtn = document.getElementById('viewDayBtn');
    if (currentView === 'week') {
        weekBtn.classList.add('bg-white', 'shadow');
        dayBtn.classList.remove('bg-white', 'shadow');
    } else {
        dayBtn.classList.add('bg-white', 'shadow');
        weekBtn.classList.remove('bg-white', 'shadow');
    }
}

function toggleSelectionMode() {
    selectionMode = !selectionMode;
    const btn = document.getElementById('selectionModeBtn');
    const deleteBtn = document.getElementById('deleteSelectionBtn');
    
    document.querySelectorAll('.planning-block').forEach(block => {
        const checkbox = block.querySelector('.selection-checkbox');
        checkbox.checked = false; // Reset checkbox state on toggle
        if (selectionMode) {
            checkbox.classList.remove('hidden');
            block.classList.replace('cursor-grab', 'cursor-pointer');
            // Re-assign onclick to handle selection
            block.onclick = (e) => {
                if (e.target.type !== 'checkbox') {
                    checkbox.checked = !checkbox.checked;
                }
                if (checkbox.checked) {
                    selectedItems.add(checkbox.dataset.id);
                } else {
                    selectedItems.delete(checkbox.dataset.id);
                }
            };
        } else {
            checkbox.classList.add('hidden');
            block.classList.replace('cursor-pointer', 'cursor-grab');
            // Restore original onclick functionality
            block.onclick = (e) => {
                if (!e.target.classList.contains('delete-planning-btn') && !e.target.classList.contains('selection-checkbox')) {
                    // This is tricky without fetching the doc again. A full display refresh is safer.
                    display();
                }
            };
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
    }
}

async function deleteSelectedItems() {
    if (selectedItems.size === 0) {
        showInfoModal("Information", "Aucun chantier n'a été sélectionné.");
        return;
    }
    const confirmed = await showConfirmationModal("Confirmation", `Voulez-vous vraiment supprimer les ${selectedItems.size} chantiers sélectionnés ?`);
    if (confirmed) {
        const batch = writeBatch(db);
        selectedItems.forEach(id => {
            batch.delete(doc(db, "planning", id));
        });
        await batch.commit();
        showInfoModal("Succès", `${selectedItems.size} chantiers ont été supprimés.`);
        
        // Reset selection mode properly
        selectionMode = false;
        selectedItems.clear();
        document.getElementById('selectionModeBtn').textContent = "Sélectionner";
        document.getElementById('selectionModeBtn').classList.replace('bg-gray-500', 'bg-yellow-500');
        document.getElementById('deleteSelectionBtn').classList.add('hidden');

        await display(); // Refresh the view
    }
}

async function generatePrintableView() {
    const { startOfWeek, endOfWeek } = getWeekDateRange(currentWeekOffset);
    const q = query(
        collection(db, "planning"), 
        where("date", ">=", startOfWeek.toISOString().split('T')[0]), 
        where("date", "<=", endOfWeek.toISOString().split('T')[0])
    );
    const querySnapshot = await getDocs(q);
    const planningData = querySnapshot.docs.map(docSnap => docSnap.data());
    
    if (planningData.length === 0) {
        showInfoModal("Information", "Le planning de cette semaine est vide.");
        return;
    }

    const planningByPerson = {};
    const allTeamMembers = new Set(teamMembersCache); // Use the cache for a complete list of members

    // Initialize all team members
    allTeamMembers.forEach(name => {
        planningByPerson[name] = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], totalHours: 0 };
    });

    planningData.forEach(task => {
        (task.teamNames || []).forEach(name => {
            if (!planningByPerson[name]) {
                 // Should not happen if cache is up to date, but as a fallback
                planningByPerson[name] = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], totalHours: 0 };
            }
            const taskDate = new Date(task.date + 'T12:00:00Z');
            const dayIndex = (taskDate.getUTCDay() + 6) % 7;
            const hours = parseFloat(task.duration) || 0;
            planningByPerson[name][dayIndex].push({ chantier: task.chantierName, hours: hours });
            planningByPerson[name].totalHours += hours;
        });
    });

    const sortedNames = [...allTeamMembers].sort((a, b) => a.localeCompare(b));
    const days = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
    const dailyTotals = Array(7).fill(0);
    const periodText = document.getElementById("currentPeriodDisplay").textContent;
    
    let tableBodyHTML = sortedNames.map(name => {
        let rowHTML = `<tr><td class="border p-1 align-top font-bold bg-gray-100">${name}</td>`;
        for (let i = 0; i < 7; i++) {
            const tasks = planningByPerson[name]?.[i] || [];
            let cellContent = tasks.length > 0
                ? tasks.map(t => `${t.chantier} (${t.hours}h)`).join('<br>')
                : '<span class="text-gray-400">OFF</span>';
            tasks.forEach(t => { dailyTotals[i] += t.hours; });
            rowHTML += `<td class="border p-1 align-top text-xs">${cellContent}</td>`;
        }
        rowHTML += `<td class="border p-1 align-top font-bold bg-gray-100">${(planningByPerson[name]?.totalHours || 0).toFixed(1)}h</td></tr>`;
        return rowHTML;
    }).join('');
    
    let totalsRowHTML = '<tr><td class="border p-1 font-bold bg-gray-200">TOTAL</td>';
    totalsRowHTML += dailyTotals.map(total => `<td class="border p-1 font-bold bg-gray-200">${total.toFixed(1)}h</td>`).join('');
    totalsRowHTML += `<td class="border p-1 font-bold bg-gray-200">${dailyTotals.reduce((a, b) => a + b, 0).toFixed(1)}h</td></tr>`;
    tableBodyHTML += totalsRowHTML;

    const headerHTML = '<tr><th class="border p-1 bg-gray-800 text-white w-24">Nom</th>' +
        days.map(d => `<th class="border p-1 bg-gray-800 text-white">${d}</th>`).join('') +
        '<th class="border p-1 bg-gray-800 text-white w-20">Total</th></tr>';
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
            <head><title>Planning de la Semaine</title><script src="https://cdn.tailwindcss.com"></script>
            <style>@media print{body{-webkit-print-color-adjust:exact}.no-print{display:none}}table{border-collapse:collapse;width:100%;font-size:10px}td,th{text-align:left;vertical-align:top}</style></head>
            <body class="p-4">
                <h1 class="text-2xl font-bold">Planning de la Semaine</h1><h2 class="text-lg text-gray-600 mb-4">${periodText}</h2>
                <table><thead>${headerHTML}</thead><tbody>${tableBodyHTML}</tbody></table>
                <button onclick="window.print()" class="no-print mt-8 bg-blue-600 text-white px-4 py-2 rounded">Imprimer</button>
            </body>
        </html>`);
    printWindow.document.close();
    printWindow.focus();
}