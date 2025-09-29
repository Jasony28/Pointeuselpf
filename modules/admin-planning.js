import { collection, query, where, getDocs, addDoc, deleteDoc, doc, orderBy, serverTimestamp, updateDoc, setDoc, getDoc, writeBatch, arrayUnion } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
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
            <div class="p-4 rounded-lg shadow-sm mb-4" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div class="flex flex-col sm:flex-row sm:items-center gap-4">
                        <div class="flex items-center justify-center sm:justify-start gap-2">
                            <button id="prevWeekBtn" class="px-3 py-2 rounded-lg" style="background-color: var(--color-background);">&lt;</button>
                            <div id="currentPeriodDisplay" class="text-center font-semibold text-base whitespace-nowrap min-w-[250px]"></div>
                            <button id="nextWeekBtn" class="px-3 py-2 rounded-lg" style="background-color: var(--color-background);">&gt;</button>
                        </div>
                        <div class="flex-shrink-0 mx-auto sm:mx-0 items-center border rounded-lg p-1" style="background-color: var(--color-background); border-color: var(--color-border);">
                            <button data-view="week" class="view-btn px-3 py-1 text-sm rounded-md">Semaine</button>
                            <button data-view="day" class="view-btn px-3 py-1 text-sm rounded-md">Jour</button>
                        </div>
                    </div>
                    <div class="flex items-center justify-center sm:justify-end gap-2 flex-wrap">
                        <button id="downloadPdfBtn" class="bg-green-600 hover:bg-green-700 text-white font-bold px-4 py-2 rounded-lg text-sm">PDF</button>
                        <button id="selectionModeBtn" class="bg-yellow-500 hover:bg-yellow-600 text-white font-bold px-4 py-2 rounded-lg text-sm">Sélectionner</button>
                        <button id="deleteSelectionBtn" class="hidden bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2 rounded-lg text-sm">Supprimer</button>
                        <button id="publishBtn" class="font-bold px-4 py-2 rounded-lg text-white text-sm"></button>
                    </div>
                </div>
            </div>
            <div class="flex flex-col md:flex-row gap-4">
                <div class="md:w-1/4 lg:w-1/5 p-4 rounded-lg shadow-sm flex flex-col" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                    <div class="flex justify-between items-center border-b pb-2 mb-2" style="border-color: var(--color-border);">
                        <h3 class="font-bold text-lg">Équipe</h3>
                        <button id="clear-team-selection" class="hidden text-xs hover:underline" style="color: var(--color-primary);">Tout vider</button>
                    </div>
                    <div id="team-pool" class="space-y-2 min-h-[100px] overflow-y-auto"></div>
                </div>
                <div class="flex-grow" id="planning-grid"></div>
            </div>
        </div>
        <div id="planningItemModal" class="hidden fixed inset-0 bg-black bg-opacity-50 overflow-y-auto z-20 p-4">
            <div class="flex min-h-full items-center justify-center">
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

function setupEventListeners() {
    document.getElementById("prevWeekBtn").onclick = () => { state.currentWeekOffset--; display(); };
    document.getElementById("nextWeekBtn").onclick = () => { state.currentWeekOffset++; display(); };
    document.getElementById("downloadPdfBtn").onclick = generatePlanningPDF;
    document.getElementById("selectionModeBtn").onclick = toggleSelectionMode;
    document.getElementById("deleteSelectionBtn").onclick = deleteSelectedItems;
    document.getElementById("clear-team-selection").onclick = () => {
        document.querySelectorAll('.team-checkbox:checked').forEach(cb => cb.checked = false);
        updateAssignMode();
    };
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

// ... Les fonctions jusqu'à generatePlanningPDF restent les mêmes ...

async function generatePlanningPDF() {
    const { startOfWeek, endOfWeek } = getWeekDateRange(state.currentWeekOffset);
    
    const q = query(collection(db, "planning"), 
        where("date", ">=", startOfWeek.toISOString().split('T')[0]), 
        where("date", "<=", endOfWeek.toISOString().split('T')[0])
    );
    const snapshot = await getDocs(q);
    const planningData = snapshot.docs.map(doc => doc.data());

    if (planningData.length === 0) {
        showInfoModal("Information", "Le planning de cette semaine est vide.");
        return;
    }

    const employeesInWeek = [...new Set(planningData.flatMap(p => p.teamNames || []))].sort();
    if (employeesInWeek.length === 0) {
        showInfoModal("Information", "Personne n'est assigné cette semaine.");
        return;
    }
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    
    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    doc.text("Planning de la Semaine", 40, 40);

    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text(`Semaine du ${startOfWeek.toLocaleDateString('fr-FR')} au ${endOfWeek.toLocaleDateString('fr-FR')}`, 40, 55);

    const head = [['Employé', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche', 'Total']];
    const body = [];

    employeesInWeek.forEach(name => {
        const rowData = [name];
        let weeklyTaskCount = 0;
        for (let i = 0; i < 7; i++) {
            const dayDate = new Date(startOfWeek);
            dayDate.setUTCDate(startOfWeek.getUTCDate() + i);
            const dateString = dayDate.toISOString().split('T')[0];

            const tasksForDay = planningData
                .filter(p => p.date === dateString && p.teamNames && p.teamNames.includes(name))
                .map(t => `${t.chantierName}${t.startTime ? ` (${t.startTime})` : ''}`);
            
            rowData.push(tasksForDay.join('\n'));
            weeklyTaskCount += tasksForDay.length;
        }
        rowData.push(weeklyTaskCount > 0 ? weeklyTaskCount.toString() : '');
        body.push(rowData);
    });

    doc.autoTable({
        startY: 70,
        head: head,
        body: body,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 3, overflow: 'linebreak' },
        headStyles: { fillColor: [44, 62, 80], halign: 'center', valign: 'middle' },
        columnStyles: {
            0: { fontStyle: 'bold', cellWidth: 90 },
            8: { halign: 'center', cellWidth: 35 }
        }
    });

    const fileName = `Planning_Semaine_${startOfWeek.toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
}

// ... Fonctions inchangées ...
async function cacheData() { state.chantiers = await getActiveChantiers(); state.teamMembers = await getTeamMembers(); }
async function handleGridClick(e) { const target = e.target; const planningBlock = target.closest('.planning-block'); if (target.classList.contains('add-chantier-btn')) { openPlanningItemModal(null, target.dataset.date); return; } if (target.classList.contains('day-selector-btn')) { state.selectedDayIndex = parseInt(target.dataset.dayIndex); display(); return; } if (!planningBlock) return; const planningId = planningBlock.dataset.planningId; const taskData = await getPlanningTask(planningId); if (target.classList.contains('delete-planning-btn')) { e.stopPropagation(); if (await showConfirmationModal("Confirmation", `Supprimer le chantier "${taskData.chantierName}" de ce jour ?`)) { const batch = writeBatch(db); logDeletionForTeam(batch, taskData); batch.delete(doc(db, "planning", planningId)); await batch.commit(); planningBlock.remove(); } return; } const teamMemberTag = target.closest('.team-member-tag'); if (teamMemberTag) { handleMemberRemoval(planningBlock, taskData, teamMemberTag.dataset.name); return; } if (state.selectionMode) { const checkbox = planningBlock.querySelector('.selection-checkbox'); checkbox.checked = !checkbox.checked; if (checkbox.checked) state.selectedItems.add(planningId); else state.selectedItems.delete(planningId); } else if (state.assignMode) { assignSelectedTeamToBlock(planningBlock, taskData); } else { openPlanningItemModal(taskData); } }
function display() { updateViewButtons(); if (state.currentView === 'week') { displayWeekView(); } else { displayDayView(); } }
function updateViewButtons() { document.querySelectorAll('.view-btn').forEach(btn => { const isSelected = btn.dataset.view === state.currentView; btn.style.backgroundColor = isSelected ? 'var(--color-surface)' : 'transparent'; btn.classList.toggle('shadow', isSelected); }); }
async function displayWeekView() { const { startOfWeek, endOfWeek } = getWeekDateRange(state.currentWeekOffset); document.getElementById("currentPeriodDisplay").textContent = `Semaine du ${startOfWeek.toLocaleDateString('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'long' })} au ${endOfWeek.toLocaleDateString('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'long' })}`; await checkAndRenderPublishButton(startOfWeek); const planningGrid = document.getElementById("planning-grid"); planningGrid.className = 'flex-grow grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3'; planningGrid.innerHTML = ""; const days = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']; for (let i = 0; i < 7; i++) { const dayDate = new Date(startOfWeek); dayDate.setUTCDate(startOfWeek.getUTCDate() + i); const dateString = dayDate.toISOString().split('T')[0]; const dayCol = document.createElement('div'); dayCol.className = 'p-2 rounded-lg flex flex-col'; dayCol.style.backgroundColor = 'var(--color-background)'; dayCol.innerHTML = `<div class="flex justify-between items-center mb-2"><h4 class="font-bold text-center">${days[i]} <span class="text-sm font-normal" style="color: var(--color-text-muted);">${dayDate.getUTCDate()}</span></h4><button data-date="${dateString}" class="add-chantier-btn text-lg font-bold hover:opacity-70" style="color: var(--color-primary);">+</button></div><div class="day-tasks-container space-y-2 flex-grow" id="day-col-${dateString}"></div>`; planningGrid.appendChild(dayCol); } loadPlanningForWeek(startOfWeek, endOfWeek); }
function displayDayView() { const { startOfWeek } = getWeekDateRange(state.currentWeekOffset); const days = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']; const selectedDate = new Date(startOfWeek); selectedDate.setUTCDate(selectedDate.getUTCDate() + state.selectedDayIndex); const dateString = selectedDate.toISOString().split('T')[0]; document.getElementById("currentPeriodDisplay").textContent = selectedDate.toLocaleDateString('fr-FR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }); const planningGrid = document.getElementById("planning-grid"); planningGrid.className = 'flex'; planningGrid.innerHTML = `<div class="p-2 rounded-lg flex flex-col w-full" style="background-color: var(--color-background);"><div class="flex justify-between items-center mb-2"><div class="flex items-center gap-2 flex-wrap">${days.map((day, index) => `<button data-day-index="${index}" class="day-selector-btn px-3 py-1 text-sm rounded-md ${index === state.selectedDayIndex ? 'text-white shadow' : ''}" style="background-color: ${index === state.selectedDayIndex ? 'var(--color-primary)' : 'var(--color-surface)'};">${day}</button>`).join('')}</div><button data-date="${dateString}" class="add-chantier-btn text-2xl font-bold hover:opacity-70" style="color: var(--color-primary);">+</button></div><div class="day-tasks-container grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-2 flex-grow overflow-y-auto" style="grid-auto-flow: column; grid-template-rows: repeat(9, auto);" id="day-col-${dateString}"></div></div>`; loadPlanningForDay(selectedDate); }
function populateTeamPool() { const pool = document.getElementById('team-pool'); pool.innerHTML = ''; state.teamMembers.forEach(member => { const item = document.createElement('label'); item.className = 'flex items-center gap-2 p-2 rounded cursor-pointer'; item.style.backgroundColor = 'var(--color-background)'; item.innerHTML = `<input type="checkbox" class="team-checkbox h-4 w-4 rounded border-gray-300 focus:ring-offset-0" style="color: var(--color-primary);" data-member-id="${member.id}"><span class="text-sm">${member.name}</span>`; pool.appendChild(item); }); }
function createChantierBlock(planningDoc) { const { id, chantierName, teamNames, notes, startTime } = planningDoc; const block = document.createElement('div'); block.className = 'planning-block p-1.5 rounded shadow cursor-pointer text-xs relative'; block.style.backgroundColor = 'var(--color-surface)'; block.dataset.planningId = id; const noteIndicator = notes ? ` <span style="color: var(--color-primary);" title="${notes}">📝</span>` : ''; const timeInfo = startTime ? `<strong>${startTime}</strong>` : ''; block.innerHTML = `<div class="flex justify-between items-start"><p class="font-bold leading-tight pointer-events-none" style="color: var(--color-primary);">${chantierName}</p><button class="delete-planning-btn text-red-400 hover:text-red-700 font-bold -mt-1 -mr-1">✖</button></div><p class="my-0.5 time-info pointer-events-none" style="color: var(--color-text-muted);">${timeInfo}${noteIndicator}</p><div class="team-display-zone mt-1 space-y-0.5"></div><input type="checkbox" class="selection-checkbox hidden absolute top-1 right-1 h-4 w-4">`; renderTeamInBlock(block, teamNames); return block; }
function renderTeamInBlock(planningBlock, teamNames) { const teamZone = planningBlock.querySelector('.team-display-zone'); teamZone.innerHTML = (teamNames && teamNames.length > 0) ? teamNames.map(name => `<div class="team-member-tag p-0.5 rounded text-[10px] leading-tight flex items-center gap-1" data-name="${name}" title="Cliquer pour retirer" style="background-color: var(--color-background);"><span>${name}</span><span class="font-bold text-red-500 hover:text-red-700 pointer-events-none">&times;</span></div>`).join('') : ''; }
async function loadPlanningForWeek(start, end) { try { const q = query(collection(db, "planning"), where("date", ">=", start.toISOString().split('T')[0]), where("date", "<=", end.toISOString().split('T')[0]), orderBy("date"), orderBy("order")); const snapshot = await getDocs(q); snapshot.docs.forEach(docSnap => { const data = { id: docSnap.id, ...docSnap.data() }; const container = document.getElementById(`day-col-${data.date}`); if (container) container.appendChild(createChantierBlock(data)); }); } catch (error) { console.error("Erreur de chargement du planning:", error); document.getElementById("planning-grid").innerHTML = `<p class="text-red-500 text-center col-span-full">Erreur de chargement du planning.</p>`; } }
async function loadPlanningForDay(date) { const dateString = date.toISOString().split('T')[0]; const container = document.getElementById(`day-col-${dateString}`); if (!container) return; container.innerHTML = 'Chargement...'; try { const q = query(collection(db, "planning"), where("date", "==", dateString), orderBy("order")); const snapshot = await getDocs(q); container.innerHTML = ''; snapshot.docs.forEach(docSnap => { const data = { id: docSnap.id, ...docSnap.data() }; container.appendChild(createChantierBlock(data)); }); } catch (error) { console.error("Erreur de chargement du planning du jour:", error); container.innerHTML = `<p class="text-red-500 text-center">Erreur de chargement.</p>`; } }
async function getPlanningTask(id) { const docRef = doc(db, "planning", id); const docSnap = await getDoc(docRef); return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null; }
function openPlanningItemModal(planningDoc = null, date = null) { const modal = document.getElementById('planningItemModal'); const form = document.getElementById('planningItemForm'); const select = document.getElementById('chantierSelect'); form.reset(); if (planningDoc) { state.editing = { id: planningDoc.id, date: planningDoc.date }; document.getElementById('modalTitle').textContent = 'Modifier le travail'; select.innerHTML = state.chantiers.map(c => `<option value="${c.id}|${c.name}" ${c.name === planningDoc.chantierName ? 'selected' : ''}>${c.name}</option>`).join(''); document.getElementById('planningStartTime').value = planningDoc.startTime || ''; document.getElementById('planningNotes').value = planningDoc.notes || ''; document.getElementById('saveAndAddAnotherBtn').style.display = 'none'; } else { state.editing = { id: null, date: date }; document.getElementById('modalTitle').textContent = `Ajouter un chantier pour le ${new Date(date + 'T12:00:00Z').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric' })}`; select.innerHTML = '<option value="" disabled selected>-- Choisissez un chantier --</option>' + state.chantiers.map(c => `<option value="${c.id}|${c.name}">${c.name}</option>`).join(''); document.getElementById('planningStartTime').value = '08:00'; document.getElementById('saveAndAddAnotherBtn').style.display = 'inline-block'; } modal.classList.remove('hidden'); }
function closePlanningItemModal() { document.getElementById('planningItemModal').classList.add('hidden'); }
async function savePlanningItem(closeAfterSave) { const select = document.getElementById('chantierSelect'); if (!select.value) { showInfoModal("Attention", "Veuillez choisir un chantier."); return; } const [chantierId, chantierName] = select.value.split('|'); const dataToSave = { chantierId, chantierName, notes: document.getElementById('planningNotes').value.trim(), startTime: document.getElementById('planningStartTime').value }; try { if (state.editing.id) { const planningRef = doc(db, "planning", state.editing.id); await updateDoc(planningRef, dataToSave); const originalTaskData = await getPlanningTask(state.editing.id); const updatedTaskData = { ...originalTaskData, ...dataToSave }; const existingBlock = document.querySelector(`.planning-block[data-planning-id="${state.editing.id}"]`); if (existingBlock) { existingBlock.replaceWith(createChantierBlock(updatedTaskData)); } } else { const q = query(collection(db, "planning"), where("date", "==", state.editing.date)); const snapshot = await getDocs(q); if (snapshot.docs.some(d => d.data().chantierName === chantierName)) { showInfoModal("Action Impossible", `Le chantier "${chantierName}" est déjà planifié pour ce jour.`); return; } const dataWithMeta = { ...dataToSave, date: state.editing.date, teamNames: [], order: snapshot.size, createdAt: serverTimestamp() }; const newDocRef = await addDoc(collection(db, "planning"), dataWithMeta); const newPlanningDoc = { id: newDocRef.id, ...dataWithMeta }; const container = document.getElementById(`day-col-${state.editing.date}`); if (container) { container.appendChild(createChantierBlock(newPlanningDoc)); } } if (closeAfterSave) { closePlanningItemModal(); } else { document.getElementById('planningItemForm').reset(); document.getElementById('planningStartTime').value = '08:00'; select.selectedIndex = 0; select.focus(); } } catch (error) { console.error("Erreur de sauvegarde:", error); showInfoModal("Erreur", "Une erreur est survenue."); } }
function updateAssignMode() { const selectedCheckboxes = document.querySelectorAll('.team-checkbox:checked'); state.assignMode = selectedCheckboxes.length > 0; document.body.style.cursor = state.assignMode ? 'copy' : 'default'; const clearButton = document.getElementById('clear-team-selection'); if (clearButton) { clearButton.classList.toggle('hidden', !state.assignMode); } }
async function logChangeForUser(userId, changeObject, batch = null) { if (!userId) return; const userRef = doc(db, "users", userId); const updateData = { pendingChanges: arrayUnion(changeObject) }; if (batch) { batch.update(userRef, updateData); } else { await updateDoc(userRef, updateData); } }
async function assignSelectedTeamToBlock(planningBlock, planningDoc) { const selectedTeamCheckboxes = Array.from(document.querySelectorAll('.team-checkbox:checked')); const selectedTeamNames = selectedTeamCheckboxes.map(cb => cb.nextElementSibling.textContent); const initialTeamNames = new Set(planningDoc.teamNames || []); const newTeamNames = [...new Set([...(planningDoc.teamNames || []), ...selectedTeamNames])]; if (newTeamNames.length > initialTeamNames.size) { planningDoc.teamNames = newTeamNames; renderTeamInBlock(planningBlock, planningDoc.teamNames); await updateDoc(doc(db, "planning", planningDoc.id), { teamNames: planningDoc.teamNames }); const newlyAddedNames = selectedTeamNames.filter(name => !initialTeamNames.has(name)); newlyAddedNames.forEach(name => { const member = state.teamMembers.find(m => m.name === name); if (member) { const change = { date: planningDoc.date, type: 'ajout', chantier: planningDoc.chantierName, timestamp: new Date().toISOString() }; logChangeForUser(member.id, change); } }); } updateAssignMode(); }
async function handleMemberRemoval(planningBlock, planningDoc, memberNameToRemove) { planningDoc.teamNames = planningDoc.teamNames.filter(name => name !== memberNameToRemove); renderTeamInBlock(planningBlock, planningDoc.teamNames); await updateDoc(doc(db, "planning", planningDoc.id), { teamNames: planningDoc.teamNames }); const member = state.teamMembers.find(m => m.name === memberNameToRemove); if (member) { const change = { date: planningDoc.date, type: 'retrait', chantier: planningDoc.chantierName, timestamp: new Date().toISOString() }; await logChangeForUser(member.id, change); } }
function toggleSelectionMode() { state.selectionMode = !state.selectionMode; const btn = document.getElementById('selectionModeBtn'); const deleteBtn = document.getElementById('deleteSelectionBtn'); document.querySelectorAll('.planning-block').forEach(block => { block.querySelector('.selection-checkbox').classList.toggle('hidden', !state.selectionMode); }); if (state.selectionMode) { btn.textContent = "Annuler"; btn.classList.replace('bg-yellow-500', 'bg-gray-500'); deleteBtn.classList.remove('hidden'); } else { btn.textContent = "Sélectionner"; btn.classList.replace('bg-gray-500', 'bg-yellow-500'); deleteBtn.classList.add('hidden'); state.selectedItems.clear(); document.querySelectorAll('.selection-checkbox').forEach(cb => cb.checked = false); } }
function logDeletionForTeam(batch, taskData) { if (!taskData.teamNames || taskData.teamNames.length === 0) return; const change = { date: taskData.date, type: 'suppression', chantier: taskData.chantierName, timestamp: new Date().toISOString() }; taskData.teamNames.forEach(name => { const member = state.teamMembers.find(m => m.name === name); if (member && member.id) { logChangeForUser(member.id, change, batch); } }); }
async function deleteSelectedItems() { if (state.selectedItems.size === 0) { showInfoModal("Information", "Aucun élément sélectionné."); return; } if (await showConfirmationModal("Confirmation", `Supprimer les ${state.selectedItems.size} éléments sélectionnés ?`)) { const batch = writeBatch(db); const tasksToNotify = await Promise.all(Array.from(state.selectedItems).map(id => getPlanningTask(id))); tasksToNotify.forEach(task => { if (task) { logDeletionForTeam(batch, task); batch.delete(doc(db, "planning", task.id)); } }); await batch.commit(); showInfoModal("Succès", `${state.selectedItems.size} éléments supprimés.`); toggleSelectionMode(); await display(); } }
async function checkAndRenderPublishButton(startOfWeek) { const weekId = startOfWeek.toISOString().split('T')[0]; const publishDoc = await getDoc(doc(db, "publishedSchedules", weekId)); const btn = document.getElementById('publishBtn'); if (!btn) return; btn.disabled = false; if (publishDoc.exists()) { btn.textContent = 'Notifier les changements'; btn.className = 'bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-lg text-sm'; btn.onclick = () => showInfoModal("Information", "Les notifications sont maintenant envoyées automatiquement à chaque modification."); } else { btn.textContent = 'Publier la semaine'; btn.className = 'bg-green-600 hover:bg-green-700 text-white font-bold px-4 py-2 rounded-lg text-sm'; btn.onclick = publishWeek; } }
async function publishWeek() { const { startOfWeek } = getWeekDateRange(state.currentWeekOffset); const weekId = startOfWeek.toISOString().split('T')[0]; const weekString = startOfWeek.toLocaleDateString('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'long' }); if (await showConfirmationModal("Publication", `Voulez-vous PUBLIER le planning pour la semaine du ${weekString} ?`)) { try { await setDoc(doc(db, "publishedSchedules", weekId), { published: true, publishedAt: serverTimestamp(), publishedBy: currentUser.displayName }); showInfoModal("Succès", "Planning publié."); await checkAndRenderPublishButton(startOfWeek); } catch (error) { console.error(error); showInfoModal("Erreur", "La publication a échoué."); } } }
async function sendUpdateNotification() { showInfoModal("Information", "Les notifications sont maintenant envoyées automatiquement à chaque modification."); }