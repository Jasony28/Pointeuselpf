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
                            <button id="prevWeekBtn" class="nav-arrow" aria-label="Précédent"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg></button>
                            <div id="currentPeriodDisplay" class="planning-period"></div>
                            <button id="nextWeekBtn" class="nav-arrow" aria-label="Suivant"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></button>
                        </div>
                        <div class="segmented flex-shrink-0 mx-auto sm:mx-0" role="group" aria-label="Affichage">
                            <button data-view="week" class="view-btn">Semaine</button>
                            <button data-view="day" class="view-btn">Jour</button>
                        </div>
                    </div>
                    <div class="flex items-center justify-center sm:justify-end gap-2 flex-wrap">
                        <button id="downloadPdfBtn" class="btn btn-secondary"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="pointer-events: none;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>PDF</button>
                        <button id="selectionModeBtn" class="btn btn-secondary">Sélectionner</button>
                        <button id="deleteSelectionBtn" class="hidden btn btn-danger">Supprimer la sélection</button>
                        <div class="flex flex-col items-end">
                            <button id="publishBtn" class="btn btn-primary"></button>
                            <span id="lastPublishDate" class="planning-publish-date"></span>
                        </div>
                    </div>
                </div>
            </div>
            <div class="flex flex-col 2xl:flex-row gap-4">
                <div class="2xl:w-52 2xl:flex-shrink-0 p-4 rounded-lg shadow-sm flex flex-col" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                    <div class="flex justify-between items-center border-b pb-2 mb-2" style="border-color: var(--color-border);">
                        <h3 class="font-bold text-lg">Équipe</h3>
                        <button id="clear-team-selection" class="hidden text-xs hover:underline" style="color: var(--color-primary);">Tout vider</button>
                    </div>
                    <div id="team-pool" class="planning-team-pool"></div>
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
                        
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label for="planningStartTime" class="text-sm font-medium">H. début</label>
                                <input id="planningStartTime" type="time" class="w-full border p-2 rounded" style="background-color: var(--color-background); border-color: var(--color-border);" />
                            </div>
                            <div>
                                <label for="planningDuration" class="text-sm font-medium">Durée (h)</label>
                                <input id="planningDuration" type="number" step="0.5" min="0" placeholder="Ex: 8" class="w-full border p-2 rounded" style="background-color: var(--color-background); border-color: var(--color-border);" />
                            </div>
                        </div>
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

async function cacheData() { state.chantiers = await getActiveChantiers(); state.teamMembers = await getTeamMembers(); }
async function handleGridClick(e) { const target = e.target; const planningBlock = target.closest('.planning-block'); if (target.classList.contains('add-chantier-btn')) { openPlanningItemModal(null, target.dataset.date); return; } if (target.classList.contains('day-selector-btn')) { state.selectedDayIndex = parseInt(target.dataset.dayIndex); display(); return; } if (!planningBlock) return; const planningId = planningBlock.dataset.planningId; const taskData = await getPlanningTask(planningId); if (target.classList.contains('delete-planning-btn')) { e.stopPropagation(); if (await showConfirmationModal("Confirmation", `Supprimer le chantier "${taskData.chantierName}" de ce jour ?`)) { const batch = writeBatch(db); logDeletionForTeam(batch, taskData); batch.delete(doc(db, "planning", planningId)); await batch.commit(); planningBlock.remove(); } return; } const teamMemberTag = target.closest('.team-member-tag'); if (teamMemberTag) { handleMemberRemoval(planningBlock, taskData, teamMemberTag.dataset.name); return; } if (state.selectionMode) { const checkbox = planningBlock.querySelector('.selection-checkbox'); checkbox.checked = !checkbox.checked; if (checkbox.checked) state.selectedItems.add(planningId); else state.selectedItems.delete(planningId); } else if (state.assignMode) { assignSelectedTeamToBlock(planningBlock, taskData); } else { openPlanningItemModal(taskData); } }
function display() { updateViewButtons(); if (state.currentView === 'week') { displayWeekView(); } else { displayDayView(); } }
function updateViewButtons() { document.querySelectorAll('.view-btn').forEach(btn => { const isSelected = btn.dataset.view === state.currentView; btn.classList.toggle('is-active', isSelected); btn.setAttribute('aria-pressed', String(isSelected)); }); }
function localTodayString() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; }
async function displayWeekView() { const { startOfWeek, endOfWeek } = getWeekDateRange(state.currentWeekOffset); document.getElementById("currentPeriodDisplay").textContent = `Semaine du ${startOfWeek.toLocaleDateString('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'long' })} au ${endOfWeek.toLocaleDateString('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'long' })}`; await checkAndRenderPublishButton(startOfWeek); const planningGrid = document.getElementById("planning-grid"); planningGrid.className = 'flex-grow grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3'; planningGrid.innerHTML = ""; const days = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']; for (let i = 0; i < 7; i++) { const dayDate = new Date(startOfWeek); dayDate.setUTCDate(startOfWeek.getUTCDate() + i); const dateString = dayDate.toISOString().split('T')[0]; const isToday = dateString === localTodayString(); const dayCol = document.createElement('div'); dayCol.className = `planning-day${isToday ? ' is-today' : ''}`; dayCol.innerHTML = `<div class="planning-day-head"><span class="planning-day-date">${dayDate.getUTCDate()}</span><span class="planning-day-name">${days[i]}${isToday ? ' <span class="schedule-today-badge">Aujourd\'hui</span>' : ''}</span><button data-date="${dateString}" class="add-chantier-btn planning-add-btn" title="Ajouter un chantier" aria-label="Ajouter un chantier le ${days[i]} ${dayDate.getUTCDate()}">+</button></div><div class="day-tasks-container space-y-2 flex-grow" id="day-col-${dateString}"></div>`; planningGrid.appendChild(dayCol); } loadPlanningForWeek(startOfWeek, endOfWeek); }
function displayDayView() { const { startOfWeek } = getWeekDateRange(state.currentWeekOffset); const days = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']; const selectedDate = new Date(startOfWeek); selectedDate.setUTCDate(selectedDate.getUTCDate() + state.selectedDayIndex); const dateString = selectedDate.toISOString().split('T')[0]; document.getElementById("currentPeriodDisplay").textContent = selectedDate.toLocaleDateString('fr-FR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }); const planningGrid = document.getElementById("planning-grid"); planningGrid.className = 'flex'; planningGrid.innerHTML = `<div class="planning-day planning-day-single w-full"><div class="flex justify-between items-center gap-3 mb-3"><div class="segmented planning-day-tabs">${days.map((day, index) => `<button data-day-index="${index}" class="day-selector-btn${index === state.selectedDayIndex ? ' is-active' : ''}">${day}</button>`).join('')}</div><button data-date="${dateString}" class="add-chantier-btn planning-add-btn" title="Ajouter un chantier" aria-label="Ajouter un chantier">+</button></div><div class="day-tasks-container grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-2 flex-grow overflow-y-auto" style="grid-auto-flow: column; grid-template-rows: repeat(9, auto);" id="day-col-${dateString}"></div></div>`; loadPlanningForDay(selectedDate); }
function populateTeamPool() { const pool = document.getElementById('team-pool'); pool.innerHTML = ''; state.teamMembers.forEach(member => { const item = document.createElement('label'); item.className = 'planning-member'; item.innerHTML = `<input type="checkbox" class="team-checkbox h-4 w-4 rounded border-gray-300 focus:ring-offset-0" style="color: var(--color-primary);" data-member-id="${member.id}"><span class="text-sm">${member.name}</span>`; pool.appendChild(item); }); }

function createChantierBlock(planningDoc) {
    const { id, chantierName, teamNames, notes, startTime, duration } = planningDoc;
    const block = document.createElement('div');
    block.className = 'planning-block';
    block.dataset.planningId = id;
    
    const noteIndicator = notes ? ` <span class="planning-note" title="${notes}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></svg>Note</span>` : '';
    
    const timeInfo = startTime ? `<strong>${startTime}</strong>` : '';
    const durationInfo = duration ? ` <span class="font-bold">${duration}h</span>` : '';

    block.innerHTML = `<div class="planning-block-head"><p class="planning-block-name pointer-events-none">${chantierName}</p><button class="delete-planning-btn planning-del-btn" title="Supprimer" aria-label="Supprimer ce chantier du planning"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true" style="pointer-events: none;"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>
                       <p class="time-info planning-block-time pointer-events-none">${timeInfo}${timeInfo && durationInfo ? ' - ' : ''}${durationInfo}${noteIndicator}</p>
                       <div class="team-display-zone"></div>
                       <input type="checkbox" class="selection-checkbox hidden absolute top-1 right-1 h-4 w-4">`;
    renderTeamInBlock(block, teamNames);
    return block;
}

function renderTeamInBlock(planningBlock, teamNames) { const teamZone = planningBlock.querySelector('.team-display-zone'); teamZone.innerHTML = (teamNames && teamNames.length > 0) ? teamNames.map(name => `<div class="team-member-tag" data-name="${name}" title="Cliquer pour retirer"><span class="pointer-events-none">${name}</span><span class="team-member-x pointer-events-none" aria-hidden="true">&times;</span></div>`).join('') : ''; }
async function loadPlanningForWeek(start, end) { try { const q = query(collection(db, "planning"), where("date", ">=", start.toISOString().split('T')[0]), where("date", "<=", end.toISOString().split('T')[0]), orderBy("date"), orderBy("order")); const snapshot = await getDocs(q); snapshot.docs.forEach(docSnap => { const data = { id: docSnap.id, ...docSnap.data() }; const container = document.getElementById(`day-col-${data.date}`); if (container) container.appendChild(createChantierBlock(data)); }); } catch (error) { console.error("Erreur de chargement du planning:", error); document.getElementById("planning-grid").innerHTML = `<p class="text-red-500 text-center col-span-full">Erreur de chargement du planning.</p>`; } }
async function loadPlanningForDay(date) { const dateString = date.toISOString().split('T')[0]; const container = document.getElementById(`day-col-${dateString}`); if (!container) return; container.innerHTML = 'Chargement...'; try { const q = query(collection(db, "planning"), where("date", "==", dateString), orderBy("order")); const snapshot = await getDocs(q); container.innerHTML = ''; snapshot.docs.forEach(docSnap => { const data = { id: docSnap.id, ...docSnap.data() }; container.appendChild(createChantierBlock(data)); }); } catch (error) { console.error("Erreur de chargement du planning du jour:", error); container.innerHTML = `<p class="text-red-500 text-center">Erreur de chargement.</p>`; } }
async function getPlanningTask(id) { const docRef = doc(db, "planning", id); const docSnap = await getDoc(docRef); return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null; }

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
        document.getElementById('planningDuration').value = planningDoc.duration || ''; 
        document.getElementById('planningNotes').value = planningDoc.notes || '';
        document.getElementById('saveAndAddAnotherBtn').style.display = 'none';
    } else {
        state.editing = { id: null, date: date };
        document.getElementById('modalTitle').textContent = `Ajouter un chantier pour le ${new Date(date + 'T12:00:00Z').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric' })}`;
        select.innerHTML = '<option value="" disabled selected>-- Choisissez un chantier --</option>' + state.chantiers.map(c => `<option value="${c.id}|${c.name}">${c.name}</option>`).join('');
        document.getElementById('planningStartTime').value = '08:00';
        document.getElementById('planningDuration').value = '8'; 
        document.getElementById('saveAndAddAnotherBtn').style.display = 'inline-block';
    }
    modal.classList.remove('hidden');
}

function closePlanningItemModal() { document.getElementById('planningItemModal').classList.add('hidden'); }

async function savePlanningItem(closeAfterSave) {
    const select = document.getElementById('chantierSelect');
    if (!select.value) {
        showInfoModal("Attention", "Veuillez choisir un chantier.");
        return;
    }
    const [chantierId, chantierName] = select.value.split('|');
    const durationValue = document.getElementById('planningDuration').value;

    const dataToSave = { 
        chantierId, 
        chantierName, 
        notes: document.getElementById('planningNotes').value.trim(), 
        startTime: document.getElementById('planningStartTime').value,
        duration: durationValue ? parseFloat(durationValue) : 0
    };

    try {
        if (state.editing.id) {
            const planningRef = doc(db, "planning", state.editing.id);
            await updateDoc(planningRef, dataToSave);
            const originalTaskData = await getPlanningTask(state.editing.id);
            const updatedTaskData = { ...originalTaskData, ...dataToSave };
            const existingBlock = document.querySelector(`.planning-block[data-planning-id="${state.editing.id}"]`);
            if (existingBlock) {
                existingBlock.replaceWith(createChantierBlock(updatedTaskData));
            }
        } else {
            const q = query(collection(db, "planning"), where("date", "==", state.editing.date));
            const snapshot = await getDocs(q);
            const dataWithMeta = { ...dataToSave, date: state.editing.date, teamNames: [], order: snapshot.size, createdAt: serverTimestamp() };
            const newDocRef = await addDoc(collection(db, "planning"), dataWithMeta);
            const newPlanningDoc = { id: newDocRef.id, ...dataWithMeta };
            const container = document.getElementById(`day-col-${state.editing.date}`);
            if (container) {
                container.appendChild(createChantierBlock(newPlanningDoc));
            }
        }
        if (closeAfterSave) {
            closePlanningItemModal();
        } else {
            document.getElementById('planningItemForm').reset();
            document.getElementById('planningStartTime').value = '08:00';
            document.getElementById('planningDuration').value = '8'; 
            select.selectedIndex = 0;
            select.focus();
        }
    } catch (error) {
        console.error("Erreur de sauvegarde:", error);
        showInfoModal("Erreur", "Une erreur est survenue.");
    }
}

function updateAssignMode() { const selectedCheckboxes = document.querySelectorAll('.team-checkbox:checked'); state.assignMode = selectedCheckboxes.length > 0; document.body.style.cursor = state.assignMode ? 'copy' : 'default'; const clearButton = document.getElementById('clear-team-selection'); if (clearButton) { clearButton.classList.toggle('hidden', !state.assignMode); } }
async function logChangeForUser(userId, changeObject, batch = null) { if (!userId) return; const userRef = doc(db, "users", userId); const updateData = { pendingChanges: arrayUnion(changeObject) }; if (batch) { batch.update(userRef, updateData); } else { await updateDoc(userRef, updateData); } }
async function assignSelectedTeamToBlock(planningBlock, planningDoc) { const selectedTeamCheckboxes = Array.from(document.querySelectorAll('.team-checkbox:checked')); const selectedTeamNames = selectedTeamCheckboxes.map(cb => cb.nextElementSibling.textContent); const initialTeamNames = new Set(planningDoc.teamNames || []); const newTeamNames = [...new Set([...(planningDoc.teamNames || []), ...selectedTeamNames])]; if (newTeamNames.length > initialTeamNames.size) { planningDoc.teamNames = newTeamNames; renderTeamInBlock(planningBlock, planningDoc.teamNames); await updateDoc(doc(db, "planning", planningDoc.id), { teamNames: planningDoc.teamNames }); const newlyAddedNames = selectedTeamNames.filter(name => !initialTeamNames.has(name)); newlyAddedNames.forEach(name => { const member = state.teamMembers.find(m => m.name === name); if (member) { const change = { date: planningDoc.date, type: 'ajout', chantier: planningDoc.chantierName, timestamp: new Date().toISOString() }; logChangeForUser(member.id, change); } }); } updateAssignMode(); }
async function handleMemberRemoval(planningBlock, planningDoc, memberNameToRemove) { planningDoc.teamNames = planningDoc.teamNames.filter(name => name !== memberNameToRemove); renderTeamInBlock(planningBlock, planningDoc.teamNames); await updateDoc(doc(db, "planning", planningDoc.id), { teamNames: planningDoc.teamNames }); const member = state.teamMembers.find(m => m.name === memberNameToRemove); if (member) { const change = { date: planningDoc.date, type: 'retrait', chantier: planningDoc.chantierName, timestamp: new Date().toISOString() }; await logChangeForUser(member.id, change); } }
function toggleSelectionMode() { state.selectionMode = !state.selectionMode; const btn = document.getElementById('selectionModeBtn'); const deleteBtn = document.getElementById('deleteSelectionBtn'); document.querySelectorAll('.planning-block').forEach(block => { block.querySelector('.selection-checkbox').classList.toggle('hidden', !state.selectionMode); }); if (state.selectionMode) { btn.textContent = "Annuler la sélection"; deleteBtn.classList.remove('hidden'); } else { btn.textContent = "Sélectionner"; deleteBtn.classList.add('hidden'); state.selectedItems.clear(); document.querySelectorAll('.selection-checkbox').forEach(cb => cb.checked = false); } }
function logDeletionForTeam(batch, taskData) { if (!taskData.teamNames || taskData.teamNames.length === 0) return; const change = { date: taskData.date, type: 'suppression', chantier: taskData.chantierName, timestamp: new Date().toISOString() }; taskData.teamNames.forEach(name => { const member = state.teamMembers.find(m => m.name === name); if (member && member.id) { logChangeForUser(member.id, change, batch); } }); }
async function deleteSelectedItems() { if (state.selectedItems.size === 0) { showInfoModal("Information", "Aucun élément sélectionné."); return; } if (await showConfirmationModal("Confirmation", `Supprimer les ${state.selectedItems.size} éléments sélectionnés ?`)) { const batch = writeBatch(db); const tasksToNotify = await Promise.all(Array.from(state.selectedItems).map(id => getPlanningTask(id))); tasksToNotify.forEach(task => { if (task) { logDeletionForTeam(batch, task); batch.delete(doc(db, "planning", task.id)); } }); await batch.commit(); showInfoModal("Succès", `${state.selectedItems.size} éléments supprimés.`); toggleSelectionMode(); await display(); } }

async function checkAndRenderPublishButton(startOfWeek) {
    const weekId = startOfWeek.toISOString().split('T')[0];
    const publishDoc = await getDoc(doc(db, "publishedSchedules", weekId));
    const btn = document.getElementById('publishBtn');
    const lastPublishDateSpan = document.getElementById('lastPublishDate');

    if (!btn) return;
    
    btn.disabled = false;
    if (publishDoc.exists()) {
        const data = publishDoc.data();
        btn.textContent = 'Notifier les changements';
        btn.className = 'btn btn-secondary';
        btn.onclick = () => showInfoModal("Information", "Les notifications sont maintenant envoyées automatiquement à chaque modification.");
        
        if (data.publishedAt) {
            const date = data.publishedAt.toDate();
            lastPublishDateSpan.textContent = `Publié le : ${date.toLocaleDateString('fr-FR')} à ${date.toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'})}`;
        } else {
            lastPublishDateSpan.textContent = 'Publié (date inconnue)';
        }
    } else {
        btn.textContent = 'Publier la semaine';
        btn.className = 'btn btn-primary';
        btn.onclick = publishWeek;
        lastPublishDateSpan.textContent = 'Non publié';
    }
}

async function publishWeek() { const { startOfWeek } = getWeekDateRange(state.currentWeekOffset); const weekId = startOfWeek.toISOString().split('T')[0]; const weekString = startOfWeek.toLocaleDateString('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'long' }); if (await showConfirmationModal("Publication", `Voulez-vous PUBLIER le planning pour la semaine du ${weekString} ?`)) { try { await setDoc(doc(db, "publishedSchedules", weekId), { published: true, publishedAt: serverTimestamp(), publishedBy: currentUser.displayName }); showInfoModal("Succès", "Planning publié."); await checkAndRenderPublishButton(startOfWeek); } catch (error) { console.error(error); showInfoModal("Erreur", "La publication a échoué."); } } }
async function sendUpdateNotification() { showInfoModal("Information", "Les notifications sont maintenant envoyées automatiquement à chaque modification."); }