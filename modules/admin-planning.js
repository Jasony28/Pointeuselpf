import { collection, query, where, getDocs, addDoc, deleteDoc, doc, orderBy, serverTimestamp, updateDoc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent, currentUser, showConfirmationModal, showInfoModal } from "../app.js";

let currentWeekOffset = 0;
let chantiersCache = [];
let teamMembersCache = []; 
let currentEditingId = null;
let currentEditingDate = null;

function getWeekDateRange(offset = 0) {
    const today = new Date();
    const todayUTC = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
    const dayOfWeekUTC = todayUTC.getUTCDay();
    const diffToMonday = dayOfWeekUTC === 0 ? -6 : 1 - dayOfWeekUTC;
    const startOfWeek = new Date(todayUTC);
    startOfWeek.setUTCDate(todayUTC.getUTCDate() + diffToMonday + (offset * 7));
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setUTCDate(startOfWeek.getUTCDate() + 6);
    endOfWeek.setUTCHours(23, 59, 59, 999);
    return { startOfWeek, endOfWeek };
}

export async function render() {
    pageContent.innerHTML = `
        <div class="max-w-full mx-auto">
            <h2 class="text-2xl font-bold mb-4">🗓️ Planification de la semaine (Glisser-Déposer)</h2>
            <div class="bg-white rounded-lg shadow-sm p-4 mb-4">
                <div class="flex flex-wrap justify-between items-center gap-4">
                    <div class="flex items-center gap-2">
                        <button id="prevWeekBtn" class="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg">&lt;</button>
                        <div id="currentPeriodDisplay" class="text-center font-semibold text-lg"></div>
                        <button id="nextWeekBtn" class="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg">&gt;</button>
                    </div>
                    <div class="flex items-center gap-2">
                        <button id="downloadPdfBtn" title="Imprimer ou Enregistrer le planning en PDF" class="bg-green-600 hover:bg-green-700 text-white p-2 rounded-lg"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/><path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/></svg></button>
                        <button id="publishBtn" class="font-bold px-4 py-2 rounded-lg disabled:bg-gray-400"></button>
                    </div>
                </div>
            </div>
            <div class="flex flex-col md:flex-row gap-4">
                <div class="md:w-1/4 lg:w-1/5 bg-white p-4 rounded-lg shadow-sm flex flex-col">
                    <h3 class="font-bold text-lg border-b pb-2 mb-2">Équipe</h3>
                    <div id="team-pool" class="space-y-2 min-h-[100px]"></div>
                    <div id="team-trash-can" class="mt-4 p-4 border-2 border-dashed rounded-lg text-center text-gray-400 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" class="mx-auto" viewBox="0 0 16 16"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0z"/><path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4zM2.5 3h11V2h-11z"/></svg><p class="mt-2 text-sm">Glisser ici pour retirer</p></div>
                </div>
                <div class="flex-grow grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3" id="planning-grid"></div>
            </div>
        </div>
        <div id="planningItemModal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-20 p-4">
            <div class="bg-white p-6 rounded-lg shadow-xl w-full max-w-sm"><h3 id="modalTitle" class="text-xl font-bold mb-4"></h3><form id="planningItemForm" class="space-y-4"><div><label class="text-sm font-medium">Chantier</label><select id="chantierSelect" class="w-full border p-2 rounded" required></select></div><div class="grid grid-cols-2 gap-4"><div><label class="text-sm font-medium">Heure de début</label><input id="planningStartTime" type="time" class="w-full border p-2 rounded" /></div><div><label class="text-sm font-medium">Heures prévues</label><input id="planningDuration" type="number" step="0.5" placeholder="Ex: 8" class="w-full border p-2 rounded" /></div></div><div><label class="text-sm font-medium">Notes (facultatif)</label><textarea id="planningNotes" placeholder="Instructions spécifiques..." class="w-full border p-2 rounded"></textarea></div><div class="flex justify-end gap-4 pt-2"><button type="button" id="cancelPlanningItem" class="bg-gray-300 hover:bg-gray-400 px-4 py-2 rounded">Annuler</button><button type="submit" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded">Enregistrer</button></div></form></div>
        </div>
    `;
    
    setupEventListeners();
    await cacheData();
    displayWeek();
    populateTeamPool();
}

async function cacheData() {
    const chantiersQuery = query(collection(db, "chantiers"), where("status", "==", "active"), orderBy("name"));
    const chantiersSnapshot = await getDocs(chantiersQuery);
    chantiersCache = chantiersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const colleaguesQuery = query(collection(db, "colleagues"), orderBy("name"));
    const colleaguesSnapshot = await getDocs(colleaguesQuery);
    const colleagueNames = colleaguesSnapshot.docs.map(doc => doc.data().name);

    const usersQuery = query(collection(db, "users"), where("status", "==", "approved"), orderBy("displayName"));
    const usersSnapshot = await getDocs(usersQuery);
    const userNames = usersSnapshot.docs.map(doc => doc.data().displayName);

    const combinedNames = [...colleagueNames, ...userNames];
    const uniqueNames = [...new Set(combinedNames)];
    teamMembersCache = uniqueNames.sort((a, b) => a.localeCompare(b));
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
    document.getElementById("prevWeekBtn").onclick = () => { currentWeekOffset--; displayWeek(); };
    document.getElementById("nextWeekBtn").onclick = () => { currentWeekOffset++; displayWeek(); };
    document.getElementById("planningItemForm").onsubmit = savePlanningItem;
    document.getElementById("cancelPlanningItem").onclick = closePlanningItemModal;
    document.getElementById("downloadPdfBtn").onclick = generatePrintableView;
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
        const notificationRef = collection(db, "notifications");
        try {
            await addDoc(notificationRef, { title: "Planning Mis à Jour", body: `Le planning de la semaine du ${weekString} a été modifié.`, createdAt: serverTimestamp(), author: currentUser.displayName });
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

async function displayWeek() {
    const { startOfWeek, endOfWeek } = getWeekDateRange(currentWeekOffset);
    document.getElementById("currentPeriodDisplay").textContent = `Semaine du ${startOfWeek.toLocaleDateString('fr-FR', {timeZone: 'UTC', day: 'numeric', month: 'long'})} au ${endOfWeek.toLocaleDateString('fr-FR', {timeZone: 'UTC', day: 'numeric', month: 'long'})}`;
    const weekId = startOfWeek.toISOString().split('T')[0];
    const publishDoc = await getDoc(doc(db, "publishedSchedules", weekId));
    updatePublishButton(publishDoc.exists());
    const planningGrid = document.getElementById("planning-grid");
    planningGrid.innerHTML = "";
    const days = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
    for (let i = 0; i < 7; i++) {
        const dayDate = new Date(startOfWeek);
        dayDate.setUTCDate(startOfWeek.getUTCDate() + i);
        const dateString = dayDate.toISOString().split('T')[0];
        const dayCol = document.createElement('div');
        dayCol.className = 'bg-gray-100 rounded-lg p-2 min-h-[200px]';
        dayCol.innerHTML = `<div class="flex justify-between items-center mb-2"><h4 class="font-bold text-center">${days[i]} <span class="text-sm font-normal text-gray-500">${dayDate.getUTCDate()}</span></h4><button data-date="${dateString}" class="add-chantier-btn text-lg font-bold text-purple-600 hover:text-purple-800">+</button></div><div class="day-tasks-container space-y-2" id="day-col-${dateString}"></div>`;
        planningGrid.appendChild(dayCol);
        const tasksContainer = dayCol.querySelector('.day-tasks-container');
        new Sortable(tasksContainer, { group: 'planning-blocks', animation: 150, onAdd: async (evt) => { const planningId = evt.item.dataset.planningId; const newDate = evt.to.id.replace('day-col-', ''); await updatePlanningDate(planningId, newDate); }, onEnd: async (evt) => { const container = evt.to; const items = container.querySelectorAll('.bg-white'); items.forEach(async (item, index) => { const planningId = item.dataset.planningId; const docRef = doc(db, "planning", planningId); await updateDoc(docRef, { order: index }); }); } });
    }
    planningGrid.querySelectorAll('.add-chantier-btn').forEach(btn => btn.onclick = () => openPlanningItemModal(null, btn.dataset.date));
    loadPlanningForWeek(startOfWeek, endOfWeek);
}

async function updatePlanningDate(planningId, newDate) {
    const planningDocRef = doc(db, "planning", planningId);
    try { await updateDoc(planningDocRef, { date: newDate }); }
    catch (error) { console.error("Erreur de mise à jour de la date:", error); showInfoModal("Erreur", "Le déplacement du bloc a échoué."); displayWeek(); }
}

function createChantierBlock(planningDoc) {
    const { id, chantierName, teamNames, duration, notes, startTime } = planningDoc;
    const block = document.createElement('div');
    block.className = 'p-2 bg-white rounded shadow cursor-grab hover:bg-gray-50';
    block.dataset.planningId = id;
    const noteIndicator = notes ? `📝` : '';
    const timeInfo = startTime ? `<strong>${startTime}</strong> (${duration || 'N/A'}h)` : `${duration || 'N/A'}h prévues`;
    block.innerHTML = `<div class="flex justify-between items-center"><p class="font-bold text-sm text-purple-800">${chantierName}</p><button class="delete-planning-btn text-red-500 hover:text-red-700 font-bold text-xs">✖</button></div><div class="text-xs text-gray-600">${timeInfo} <span class="text-blue-500">${noteIndicator}</span></div><div class="team-drop-zone min-h-[30px] mt-2 space-y-1 bg-gray-50 p-1 rounded"></div>`;
    block.onclick = (e) => { if (e.target.classList.contains('delete-planning-btn')) return; openPlanningItemModal(planningDoc); };
    const dropZone = block.querySelector('.team-drop-zone');
    if (teamNames) { teamNames.forEach(name => { const item = document.createElement('div'); item.className = 'p-1 bg-blue-100 text-blue-800 rounded text-xs'; item.textContent = name; item.dataset.teamMemberName = name; dropZone.appendChild(item); }); }
    new Sortable(dropZone, { group: 'shared-team', onAdd: async function (evt) { const droppedName = evt.item.dataset.teamMemberName; let isDuplicate = false; evt.to.querySelectorAll('div').forEach(el => { if (el !== evt.item && el.dataset.teamMemberName === droppedName) { isDuplicate = true; } }); if (isDuplicate) { evt.item.remove(); showInfoModal("Attention", `"${droppedName}" est déjà sur ce chantier.`); return; } evt.item.className = 'p-1 bg-blue-100 text-blue-800 rounded text-xs'; await updatePlanningTeam(id, dropZone); }, onRemove: async function () { await updatePlanningTeam(id, dropZone); } });
    block.querySelector('.delete-planning-btn').onclick = async (e) => { e.stopPropagation(); const confirmed = await showConfirmationModal("Confirmation", `Supprimer le chantier "${chantierName}" de ce jour ?`); if (confirmed) { await deleteDoc(doc(db, "planning", id)); block.remove(); } };
    return block;
}

function openPlanningItemModal(planningDoc = null, date = null) {
    const modal = document.getElementById('planningItemModal');
    const form = document.getElementById('planningItemForm');
    const select = document.getElementById('chantierSelect');
    form.reset();
    if (planningDoc) {
        currentEditingId = planningDoc.id;
        document.getElementById('modalTitle').textContent = 'Modifier le travail';
        select.innerHTML = chantiersCache.map(c => `<option value="${c.id}|${c.name}" ${c.id === planningDoc.chantierId ? 'selected' : ''}>${c.name}</option>`).join('');
        document.getElementById('planningStartTime').value = planningDoc.startTime || '';
        document.getElementById('planningDuration').value = planningDoc.duration || '';
        document.getElementById('planningNotes').value = planningDoc.notes || '';
    } else {
        currentEditingId = null;
        currentEditingDate = date;
        document.getElementById('modalTitle').textContent = 'Ajouter un chantier';
        select.innerHTML = '<option value="" disabled selected>-- Choisissez un chantier --</option>' + chantiersCache.map(c => `<option value="${c.id}|${c.name}">${c.name}</option>`).join('');
        document.getElementById('planningStartTime').value = '08:00';
    }
    modal.classList.remove('hidden');
}

function closePlanningItemModal() {
    document.getElementById('planningItemModal').classList.add('hidden');
}

async function savePlanningItem(e) {
    e.preventDefault();
    const [chantierId, chantierName] = document.getElementById('chantierSelect').value.split('|');
    const duration = document.getElementById('planningDuration').value;
    const notes = document.getElementById('planningNotes').value.trim();
    const startTime = document.getElementById('planningStartTime').value;
    try {
        if (currentEditingId) {
            const docRef = doc(db, "planning", currentEditingId);
            await updateDoc(docRef, { chantierId, chantierName, duration, notes, startTime });
        } else {
            const q = query(collection(db, "planning"), where("date", "==", currentEditingDate));
            const snapshot = await getDocs(q);
            const newOrder = snapshot.size;
            await addDoc(collection(db, "planning"), { date: currentEditingDate, chantierId, chantierName, duration, notes, startTime, teamNames: [], order: newOrder, createdAt: serverTimestamp() });
        }
        closePlanningItemModal();
        displayWeek();
    } catch (error) { console.error("Erreur de sauvegarde:", error); showInfoModal("Erreur", "Une erreur est survenue."); }
}

async function updatePlanningTeam(planningId, dropZone) {
    const teamNames = Array.from(dropZone.querySelectorAll('div')).map(el => el.dataset.teamMemberName);
    const planningDocRef = doc(db, "planning", planningId);
    await updateDoc(planningDocRef, { teamNames: teamNames });
}

// Fichier : modules/admin-planning.js

async function loadPlanningForWeek(start, end) {
    // --- CORRECTION TEMPORAIRE : On retire le tri par "order" pour éviter l'erreur ---
    const q = query(collection(db, "planning"), where("date", ">=", start.toISOString().split('T')[0]), where("date", "<=", end.toISOString().split('T')[0]), orderBy("date"));
    const querySnapshot = await getDocs(q);
    const planningData = querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));

    // La ligne de nettoyage redondante a été retirée.
    // displayWeek() s'occupe déjà de vider la grille.

    planningData.forEach(data => {
        const container = document.getElementById(`day-col-${data.date}`);
        if (container) {
            const block = createChantierBlock(data);
            container.appendChild(block);
        }
    });
}

async function generatePrintableView() {
    const { startOfWeek, endOfWeek } = getWeekDateRange(currentWeekOffset);
    const q = query(collection(db, "planning"), where("date", ">=", startOfWeek.toISOString().split('T')[0]), where("date", "<=", endOfWeek.toISOString().split('T')[0]));
    const querySnapshot = await getDocs(q);
    const freshPlanningData = querySnapshot.docs.map(docSnap => docSnap.data());
    if (freshPlanningData.length === 0) { showInfoModal("Information", "Le planning de cette semaine est vide."); return; }
    const periodText = document.getElementById("currentPeriodDisplay").textContent;
    const days = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
    const sortedPlanning = freshPlanningData.sort((a, b) => {
        if (a.date < b.date) return -1;
        if (a.date > b.date) return 1;
        return (a.order || 0) - (b.order || 0);
    });
    let tableRowsHTML = '';
    sortedPlanning.forEach(task => {
        const [year, month, day] = task.date.split('-').map(Number);
        const taskDate = new Date(Date.UTC(year, month - 1, day));
        const dayIndex = (taskDate.getUTCDay() + 6) % 7;
        tableRowsHTML += `<tr><td class="border p-2">${days[dayIndex]} ${day}/${month}</td><td class="border p-2">${task.chantierName}</td><td class="border p-2">${task.teamNames.join(', ') || 'Personne'}</td><td class="border p-2">${task.startTime || ''}</td><td class="border p-2">${task.duration || 'N/A'}h</td><td class="border p-2">${task.notes || ''}</td></tr>`;
    });
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`<html><head><title>Planning de la Semaine</title><script src="https://cdn.tailwindcss.com"></script><style> @media print { body { -webkit-print-color-adjust: exact; } .no-print { display: none; } } </style></head><body class="p-8"><h1 class="text-3xl font-bold">Planning de la Semaine</h1><h2 class="text-xl text-gray-600 mb-6">${periodText}</h2><table class="w-full border-collapse text-sm"><thead><tr class="bg-gray-800 text-white"><th class="border p-2 text-left">Jour</th><th class="border p-2 text-left">Chantier</th><th class="border p-2 text-left">Équipe</th><th class="border p-2 text-left">Début</th><th class="border p-2 text-left">Heures</th><th class="border p-2 text-left">Notes</th></tr></thead><tbody> ${tableRowsHTML} </tbody></table><button onclick="window.print()" class="no-print mt-8 bg-blue-600 text-white px-4 py-2 rounded">Imprimer</button></body></html>`);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); }, 500);
}
