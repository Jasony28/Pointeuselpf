import { collection, query, where, orderBy, getDocs, deleteDoc, doc, updateDoc, addDoc, serverTimestamp, getDoc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, currentUser, pageContent, showConfirmationModal, showInfoModal, isStealthMode } from "../app.js";
import { getWeekDateRange, formatMilliseconds } from "./utils.js";

let currentWeekOffset = 0;
let targetUser = null;
let chantiersCache = [];
let colleaguesCache = [];
let pointagesPourPdf = [];
let allPointages = [];
let entryWizardStep = 1;
let entryWizardData = {};

function formatMinutes(totalMinutes) {
    if (!totalMinutes || totalMinutes < 0) return "0h 0min";
    const hours = Math.floor(totalMinutes / 60);
    const minutes = Math.round(totalMinutes % 60);
    return `${hours}h ${minutes}min`;
}

async function logAction(pointageId, action, details = {}) {
    try {
        const logData = {
            action: action,
            modifiedBy: currentUser.displayName,
            timestamp: serverTimestamp(),
            details: details
        };
        const logCollectionRef = collection(db, `pointages/${pointageId}/auditLog`);
        await addDoc(logCollectionRef, logData);
    } catch (error) {
        console.error("Erreur lors de l'enregistrement du log:", error);
    }
}

export async function render(params = {}) {
    if (params.userId && currentUser.role === 'admin') {
        targetUser = { uid: params.userId, name: params.userName };
    } else {
        targetUser = { uid: currentUser.uid, name: "Mon" };
    }

    pageContent.innerHTML = `
        <div class="max-w-4xl mx-auto">
            <div class="flex flex-wrap justify-between items-center mb-4 gap-4">
                <div class="flex items-center gap-3">
                    <span class="text-3xl">🗓️</span>
                    <h2 id="history-title" class="text-2xl font-bold">Historique de ${targetUser.name}</h2>
                </div>
                ${(targetUser.uid === currentUser.uid || currentUser.role === 'admin') ? `
                <button id="downloadPdfBtn" class="text-white font-bold px-4 py-2 rounded-lg flex items-center gap-2 transition-opacity" style="background-color: var(--color-primary);">
                    Télécharger PDF
                </button>
                ` : ''}
            </div>
            <div class="rounded-lg shadow-sm p-4 mb-4" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                <div class="flex justify-between items-center">
                    <button id="prevWeekBtn" class="px-4 py-2 rounded-lg hover:opacity-80" style="background-color: var(--color-background);">&lt;</button>
                    <div id="currentPeriodDisplay" class="text-center font-semibold text-lg"></div>
                    <button id="nextWeekBtn" class="px-4 py-2 rounded-lg hover:opacity-80" style="background-color: var(--color-background);">&gt;</button>
                </div>
                <div id="weekTotalsDisplay" class="mt-3 text-center text-xl font-bold grid grid-cols-1 md:grid-cols-2 gap-2"></div>
            </div>
            <div id="historyList" class="space-y-4"></div>
        </div>
        <div id="entryModal" class="hidden fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-30 p-4">
            <div class="p-6 rounded-lg shadow-xl w-full max-w-lg" style="background-color: var(--color-surface);">
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
        document.getElementById("prevWeekBtn").onclick = () => { currentWeekOffset--; loadHistoryForWeek(); };
        document.getElementById("nextWeekBtn").onclick = () => { currentWeekOffset++; loadHistoryForWeek(); };
        const pdfBtn = document.getElementById("downloadPdfBtn");
        if (pdfBtn) {
            pdfBtn.onclick = generateHistoryPDF;
        }
        currentWeekOffset = 0;
        loadHistoryForWeek();
    }, 0);
}

async function cacheModalData() {
    const chantiersQuery = query(collection(db, "chantiers"), where("status", "==", "active"), orderBy("name"));
    const colleaguesQuery = query(collection(db, "colleagues"), orderBy("name"));
    const usersQuery = query(collection(db, "users"), where("status", "==", "approved"), orderBy("displayName"));
    const [chantiersSnapshot, colleaguesSnapshot, usersSnapshot] = await Promise.all([
        getDocs(chantiersQuery),
        getDocs(colleaguesQuery),
        getDocs(usersQuery)
    ]);
    chantiersCache = chantiersSnapshot.docs.map(doc => doc.data().name);
    const colleagueNames = colleaguesSnapshot.docs.map(doc => doc.data().name);
    const userNames = usersSnapshot.docs.map(doc => doc.data().displayName);
    colleaguesCache = [...new Set([...colleagueNames, ...userNames])].sort((a, b) => a.localeCompare(b));
}

async function loadHistoryForWeek() {
    const historyList = document.getElementById("historyList");
    const weekTotalsDisplay = document.getElementById("weekTotalsDisplay");
    const { startOfWeek, endOfWeek } = getWeekDateRange(currentWeekOffset);
    
    document.getElementById("currentPeriodDisplay").textContent = `Semaine du ${startOfWeek.toLocaleDateString('fr-FR', {timeZone: 'UTC', day: 'numeric', month: 'long'})}`;
    historyList.innerHTML = `<p class='text-center p-4' style='color: var(--color-text-muted);'>Chargement...</p>`;

    const pointagesQuery = query(collection(db, "pointages"),
        where("uid", "==", targetUser.uid),
        where("timestamp", ">=", startOfWeek.toISOString()),
        where("timestamp", "<=", endOfWeek.toISOString()),
        orderBy("timestamp", "asc")
    );

    const trajetsQuery = query(collection(db, "trajets"),
        where("id_utilisateur", "==", targetUser.uid),
        where("date_creation", ">=", startOfWeek),
        where("date_creation", "<=", endOfWeek)
    );

    const [pointagesSnapshot, trajetsSnapshot] = await Promise.all([
        getDocs(pointagesQuery),
        getDocs(trajetsQuery)
    ]);

    allPointages = pointagesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    pointagesPourPdf = allPointages; 

    const trajetsMap = new Map();
    trajetsSnapshot.forEach(doc => {
        const trajet = doc.data();
        trajetsMap.set(trajet.id_pointage_arrivee, trajet);
    });

    const dataByDate = {};
    const days = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

    for (let i = 0; i < 7; i++) {
        const dayDate = new Date(startOfWeek);
        dayDate.setUTCDate(startOfWeek.getUTCDate() + i);
        const dateString = dayDate.toISOString().split('T')[0];
        dataByDate[dateString] = {
            entries: [],
            dailyTotalMs: 0,
            dailyTotalKm: 0,
            dailyTotalMin: 0
        };
    }

    allPointages.forEach(p => {
        const date = new Date(p.timestamp).toISOString().split('T')[0];
        if (dataByDate[date]) {
            dataByDate[date].entries.push(p);
            if (p.endTime) {
                dataByDate[date].dailyTotalMs += (new Date(p.endTime) - new Date(p.timestamp)) - (p.pauseDurationMs || 0);
            }
            if (trajetsMap.has(p.id)) {
                const trajet = trajetsMap.get(p.id);
                dataByDate[date].dailyTotalKm += trajet.distance_km || 0;
                dataByDate[date].dailyTotalMin += trajet.duree_min || 0;
            }
        }
    });

    historyList.innerHTML = "";
    let weeklyTotalMs = 0;
    let weeklyTotalKm = 0;
    let weeklyTotalMin = 0;

    Object.keys(dataByDate).forEach((dateString, i) => {
        const dayData = dataByDate[dateString];
        weeklyTotalMs += dayData.dailyTotalMs;
        weeklyTotalKm += dayData.dailyTotalKm;
        weeklyTotalMin += dayData.dailyTotalMin;

        const dayWrapper = document.createElement('div');
        dayWrapper.className = 'p-4 rounded-lg shadow-sm';
        dayWrapper.style.backgroundColor = 'var(--color-surface)';
        
        const dayHeader = document.createElement('div');
        dayHeader.className = 'flex justify-between items-center border-b pb-2 mb-3';
        dayHeader.style.borderColor = 'var(--color-border)';
        dayHeader.innerHTML = `
            <div class="flex items-center gap-4">
                <h3 class="font-bold text-lg">${days[i]} ${new Date(dateString+'T12:00:00Z').toLocaleDateString('fr-FR', {day: 'numeric', month: 'long'})}</h3>
            </div>
            <div class="text-right">
                <div class="font-bold" style="color: var(--color-primary);">${formatMilliseconds(dayData.dailyTotalMs)}</div>
                ${dayData.dailyTotalKm > 0 ? `<div class="text-xs" style="color: var(--color-text-muted);">${dayData.dailyTotalKm.toFixed(1)} km / ${formatMinutes(dayData.dailyTotalMin)}</div>` : ''}
            </div>
        `;
        
        if (currentUser.role === 'admin') {
            const addBtn = document.createElement('button');
            addBtn.innerHTML = `+ Ajouter`;
            addBtn.className = 'add-pointage-btn text-sm font-semibold ml-4';
            addBtn.style.color = 'var(--color-primary)';
            addBtn.dataset.date = dateString;
            dayHeader.querySelector('.flex').appendChild(addBtn);
        }

        dayWrapper.appendChild(dayHeader);
        const entriesContainer = document.createElement('div');
        entriesContainer.className = 'space-y-3';
        
        if (dayData.entries.length > 0) {
            dayData.entries.forEach(d => entriesContainer.appendChild(createHistoryEntryElement(d, trajetsMap.get(d.id))));
        } else {
            entriesContainer.innerHTML = `<p class="text-center py-4" style="color: var(--color-text-muted);">Aucun pointage pour ce jour.</p>`;
        }
        dayWrapper.appendChild(entriesContainer);
        historyList.appendChild(dayWrapper);
    });
    
    weekTotalsDisplay.innerHTML = `
        <div>
            <p class="text-sm font-medium" style="color: var(--color-text-muted);">Total Heures Semaine</p>
            <p>${formatMilliseconds(weeklyTotalMs)}</p>
        </div>
        <div>
            <p class="text-sm font-medium" style="color: var(--color-text-muted);">Total Trajets Semaine</p>
            <p>${weeklyTotalKm.toFixed(1)} km / ${formatMinutes(weeklyTotalMin)}</p>
        </div>
    `;

    const pdfBtn = document.getElementById("downloadPdfBtn");
    if (pdfBtn) {
        if (pointagesPourPdf.length === 0) {
            pdfBtn.disabled = true;
            pdfBtn.style.opacity = '0.5';
            pdfBtn.style.cursor = 'not-allowed';
            pdfBtn.title = "Aucune donnée à exporter pour cette semaine.";
        } else {
            pdfBtn.disabled = false;
            pdfBtn.style.opacity = '1';
            pdfBtn.style.cursor = 'pointer';
            pdfBtn.title = "Télécharger l'historique de la semaine en PDF";
        }
    }

    historyList.addEventListener('click', handleHistoryClick);
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
        buttonsDiv.innerHTML = `<button class="edit-btn font-bold" title="Modifier" data-id="${d.id}" style="color: var(--color-text-muted);">✏️</button><button class="delete-btn font-bold" title="Supprimer" data-id="${d.id}" style="color: var(--color-text-muted);">✖️</button>`;
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
        loadHistoryForWeek();
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
        loadHistoryForWeek();
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
    const { startOfWeek, endOfWeek } = getWeekDateRange(currentWeekOffset);
    doc.setFontSize(18);
    doc.setFont(undefined, 'bold');
    doc.text("Historique des Pointages", 40, 60);
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(100);
    doc.text(`Employé : ${userName}`, 40, 75);
    doc.text(`Semaine du ${startOfWeek.toLocaleDateString('fr-FR')} au ${endOfWeek.toLocaleDateString('fr-FR')}`, 40, 85);
    const pointagesByDay = dataForPdf.reduce((acc, p) => {
        if (!p.endTime) return acc;
        const dayKey = new Date(p.timestamp).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' });
        if (!acc[dayKey]) {
            acc[dayKey] = { entries: [], totalMs: 0 };
        }
        const durationMs = (new Date(p.endTime) - new Date(p.timestamp)) - (p.pauseDurationMs || 0);
        acc[dayKey].entries.push(p);
        acc[dayKey].totalMs += durationMs;
        return acc;
    }, {});
    const tableHead = [['Date', 'Chantier', 'Pause', 'Travail Effectif', 'Collègues']];
    const tableBody = [];
    let totalEffectiveMs = 0;
    for (const dayKey in pointagesByDay) {
        const dayData = pointagesByDay[dayKey];
        totalEffectiveMs += dayData.totalMs;
        tableBody.push([{
            content: `${dayKey} - Total : ${formatMilliseconds(dayData.totalMs)}`,
            colSpan: 5,
            styles: { fillColor: '#f3f4f6', fontStyle: 'bold', textColor: '#374151' }
        }]);
        dayData.entries.forEach(d => {
            const startDate = new Date(d.timestamp);
            const effectiveWorkMs = (new Date(d.endTime) - startDate) - (d.pauseDurationMs || 0);
            const dateStr = startDate.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
            const pauseStr = formatMilliseconds(d.pauseDurationMs || 0);
            const durationStr = formatMilliseconds(effectiveWorkMs);
            const colleaguesStr = Array.isArray(d.colleagues) && d.colleagues.length > 0 ? d.colleagues.join(", ") : 'Aucun';
            tableBody.push([dateStr, d.chantier, pauseStr, durationStr, colleaguesStr]);
        });
    }
    doc.autoTable({
        startY: 100,
        head: tableHead,
        body: tableBody,
        theme: 'striped',
        headStyles: { fillColor: [41, 51, 92], textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak' },
        columnStyles: {
            0: { cellWidth: 40 }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 50 },
            3: { cellWidth: 60 }, 4: { cellWidth: 'auto' }
        }
    });
    const finalY = doc.lastAutoTable.finalY;
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text(`Total travail effectif de la semaine : ${formatMilliseconds(totalEffectiveMs)}`, 40, finalY + 20);
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const timestamp = `${hours}h${minutes}m${seconds}s`;
    const fileName = `Historique_${userName.replace(/ /g, '_')}_${startOfWeek.toISOString().split('T')[0]}_${timestamp}.pdf`;
    doc.save(fileName);
}

