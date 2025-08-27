import { collection, query, where, orderBy, getDocs, deleteDoc, doc, updateDoc, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, currentUser, isAdmin, pageContent, showConfirmationModal, showInfoModal } from "../app.js";
import { getWeekDateRange, formatMilliseconds } from "./utils.js";

let currentWeekOffset = 0;
let targetUser = null;
let historyDataCache = []; // Gardé pour la fonction PDF
let chantiersCache = [];
let colleaguesCache = [];

export async function render(params = {}) {
    if (params.userId && isAdmin) {
        targetUser = { uid: params.userId, name: params.userName };
    } else {
        targetUser = { uid: currentUser.uid, name: "Mon" };
    }

    pageContent.innerHTML = `
        <div class="max-w-4xl mx-auto">
            <div class="flex flex-wrap justify-between items-center mb-4 gap-4">
                <h2 id="history-title" class="text-2xl font-bold">🗓️ Historique de ${targetUser.name}</h2>
                <button id="downloadPdfBtn" class="bg-green-600 hover:bg-green-700 text-white font-bold px-4 py-2 rounded-lg flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/><path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/></svg>
                    Télécharger PDF
                </button>
            </div>
            <div class="bg-white rounded-lg shadow-sm p-4 mb-4">
                <div class="flex justify-between items-center">
                    <button id="prevWeekBtn" class="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg">&lt;</button>
                    <div id="currentPeriodDisplay" class="text-center font-semibold text-lg"></div>
                    <button id="nextWeekBtn" class="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg">&gt;</button>
                </div>
                <div id="weekTotalsDisplay" class="mt-3 text-center text-xl font-bold text-purple-700"></div>
            </div>
            <div id="historyList" class="space-y-4"></div>
        </div>

        <div id="entryModal" class="hidden fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-30 p-4">
            <div class="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg">
                <h3 id="modalTitle" class="text-xl font-bold mb-4"></h3>
                <form id="entryForm" class="space-y-4">
                    <input type="hidden" id="entryDate">
                    <input type="hidden" id="entryId">
                    <div>
                        <label for="entryChantier" class="text-sm font-medium">Chantier</label>
                        <select id="entryChantier" class="w-full border p-2 rounded mt-1" required></select>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div><label for="entryStartTime" class="text-sm font-medium">Début</label><input id="entryStartTime" type="time" class="w-full border p-2 rounded mt-1" required /></div>
                        <div><label for="entryEndTime" class="text-sm font-medium">Fin</label><input id="entryEndTime" type="time" class="w-full border p-2 rounded mt-1" required /></div>
                    </div>
                    <div>
                        <label class="text-sm font-medium">Collègues</label>
                        <div id="entryColleaguesContainer" class="mt-1 p-2 border rounded max-h-32 overflow-y-auto space-y-1"></div>
                    </div>
                    <div>
                        <label for="entryNotes" class="text-sm font-medium">Notes</label>
                        <textarea id="entryNotes" class="w-full border p-2 rounded mt-1"></textarea>
                    </div>
                    <div class="flex justify-end gap-4 pt-4 border-t">
                        <button type="button" id="cancelEntryBtn" class="bg-gray-300 hover:bg-gray-400 px-4 py-2 rounded">Annuler</button>
                        <button type="submit" class="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded">Enregistrer</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    setTimeout(async () => {
        await cacheModalData();
        document.getElementById("prevWeekBtn").onclick = () => { currentWeekOffset--; loadHistoryForWeek(); };
        document.getElementById("nextWeekBtn").onclick = () => { currentWeekOffset++; loadHistoryForWeek(); };
        document.getElementById("downloadPdfBtn").onclick = generateHistoryPDF;
        currentWeekOffset = 0;
        loadHistoryForWeek();
    }, 0);
}

async function cacheModalData() {
    const chantiersQuery = query(collection(db, "chantiers"), where("status", "==", "active"), orderBy("name"));
    const colleaguesQuery = query(collection(db, "colleagues"), orderBy("name"));
    const usersQuery = query(collection(db, "users"), where("status", "==", "approved"), orderBy("displayName"));

    const [chantiersSnapshot, colleaguesSnapshot, usersSnapshot] = await Promise.all([
        getDocs(chantiersQuery), getDocs(colleaguesQuery), getDocs(usersQuery)
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
    historyList.innerHTML = `<p class='text-center p-4'>Chargement...</p>`;

    const pointagesQuery = query(collection(db, "pointages"),
        where("uid", "==", targetUser.uid),
        where("timestamp", ">=", startOfWeek.toISOString()),
        where("timestamp", "<=", endOfWeek.toISOString()),
        orderBy("timestamp", "asc") // Tri par ordre chronologique pour la journée
    );
    const pointagesSnapshot = await getDocs(pointagesQuery);
    historyDataCache = pointagesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const pointagesByDate = historyDataCache.reduce((acc, p) => {
        const date = new Date(p.timestamp).toISOString().split('T')[0];
        if (!acc[date]) acc[date] = [];
        acc[date].push(p);
        return acc;
    }, {});

    historyList.innerHTML = "";
    const days = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
    let totalEffectiveMs = 0;

    for (let i = 0; i < 7; i++) {
        const dayDate = new Date(startOfWeek);
        dayDate.setUTCDate(startOfWeek.getUTCDate() + i);
        const dateString = dayDate.toISOString().split('T')[0];
        
        const dayWrapper = document.createElement('div');
        dayWrapper.className = 'bg-white p-4 rounded-lg shadow-sm';
        
        const dayHeader = document.createElement('div');
        dayHeader.className = 'flex justify-between items-center border-b pb-2 mb-3';
        dayHeader.innerHTML = `<h3 class="font-bold text-lg">${days[i]} ${dayDate.toLocaleDateString('fr-FR', {day: 'numeric', month: 'long'})}</h3>`;
        
        const addBtn = document.createElement('button');
        addBtn.innerHTML = `+ Ajouter`;
        addBtn.className = 'add-pointage-btn text-blue-600 hover:text-blue-800 text-sm font-semibold';
        addBtn.dataset.date = dateString;
        dayHeader.appendChild(addBtn);
        
        dayWrapper.appendChild(dayHeader);

        const entriesContainer = document.createElement('div');
        entriesContainer.className = 'space-y-3';
        const dayEntries = pointagesByDate[dateString] || [];
        
        if (dayEntries.length === 0) {
            entriesContainer.innerHTML = `<p class="text-gray-500 text-center py-4">Aucun pointage pour ce jour.</p>`;
        } else {
            dayEntries.forEach(d => {
                entriesContainer.appendChild(createHistoryEntryElement(d));
                if (d.endTime) {
                    const duration = new Date(d.endTime) - new Date(d.timestamp) - (d.pauseDurationMs || 0);
                    totalEffectiveMs += duration;
                }
            });
        }
        dayWrapper.appendChild(entriesContainer);
        historyList.appendChild(dayWrapper);
    }
    
    weekTotalsDisplay.textContent = `Total travail effectif : ${formatMilliseconds(totalEffectiveMs)}`;
    historyList.addEventListener('click', handleHistoryClick);
}

function handleHistoryClick(e) {
    const target = e.target;
    if (target.closest('.add-pointage-btn')) {
        openEntryModal({ date: target.closest('.add-pointage-btn').dataset.date });
    } else if (target.closest('.edit-btn')) {
        const pointageId = target.closest('.edit-btn').dataset.id;
        const pointageData = historyDataCache.find(p => p.id === pointageId);
        openEntryModal(pointageData);
    } else if (target.closest('.delete-btn')) {
        const pointageId = target.closest('.delete-btn').dataset.id;
        deletePointage(pointageId);
    }
}

function createHistoryEntryElement(d) {
    const wrapper = document.createElement("div");
    wrapper.className = "p-3 border rounded-lg bg-gray-50 relative";
    
    const startDate = new Date(d.timestamp);
    const endDate = d.endTime ? new Date(d.endTime) : null;

    let timeDisplay = "", durationDisplay = "";
    if (endDate) {
        timeDisplay = `De ${startDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} à ${endDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
        // On prépare la durée ici pour la réutiliser plus tard
        durationDisplay = `<div class="text-sm font-bold text-purple-700 mt-1">${formatMilliseconds(endDate - startDate - (d.pauseDurationMs || 0))}</div>`;
    }

    // 1. On retire la durée de l'affichage principal (elle n'est plus dans un div à droite)
    wrapper.innerHTML = `
      <div class="pr-16"> <div class="font-bold">${d.chantier}</div>
        <div class="text-sm text-gray-600">${timeDisplay}</div>
        <div class="text-xs mt-1">Collègues : ${Array.isArray(d.colleagues) && d.colleagues.length > 0 ? d.colleagues.join(", ") : 'Aucun'}</div>
      </div>
      ${d.notes ? `<div class="mt-2 pt-2 border-t text-xs text-gray-500"><strong>Notes:</strong> ${d.notes}</div>` : ""}
    `;

    if (isAdmin || currentUser.uid === targetUser.uid) {
        const controlsWrapper = document.createElement("div");
        // 2. On change le style du conteneur des contrôles pour aligner verticalement
        controlsWrapper.className = "absolute top-2 right-3 flex flex-col items-end";

        // On crée un sous-conteneur pour les boutons
        const buttonsDiv = document.createElement('div');
        buttonsDiv.className = 'flex gap-2';
        buttonsDiv.innerHTML = `
            <button class="edit-btn text-gray-400 hover:text-blue-600 font-bold" title="Modifier" data-id="${d.id}">✏️</button>
            <button class="delete-btn text-gray-400 hover:text-red-600 font-bold" title="Supprimer" data-id="${d.id}">✖️</button>
        `;
        
        // 3. On ajoute les boutons, PUIS la durée juste en dessous
        controlsWrapper.appendChild(buttonsDiv);
        controlsWrapper.innerHTML += durationDisplay; // On ajoute la durée ici
        
        wrapper.appendChild(controlsWrapper);
    }
    return wrapper;
}

async function deletePointage(pointageId) {
    const confirmed = await showConfirmationModal("Confirmation", "Supprimer ce pointage ?");
    if (confirmed) {
        await deleteDoc(doc(db, "pointages", pointageId));
        loadHistoryForWeek();
    }
}

function openEntryModal(data = {}) {
    const modal = document.getElementById('entryModal');
    const form = document.getElementById('entryForm');
    const title = document.getElementById('modalTitle');
    form.reset();

    const isEditing = !!data.id;
    document.getElementById('entryId').value = isEditing ? data.id : '';
    const dateString = isEditing ? new Date(data.timestamp).toISOString().split('T')[0] : data.date;
    document.getElementById('entryDate').value = dateString;
    
    title.textContent = isEditing ? "Modifier le pointage" : `Ajouter un pointage pour le ${new Date(dateString + 'T12:00:00Z').toLocaleDateString('fr-FR', {day:'numeric', month:'long'})}`;
    
    const chantierSelect = document.getElementById('entryChantier');
    chantierSelect.innerHTML = '<option value="">-- Choisissez --</option>' + chantiersCache.map(name => `<option value="${name}" ${isEditing && name === data.chantier ? 'selected' : ''}>${name}</option>`).join('');

    if (isEditing) {
        const startDate = new Date(data.timestamp);
        const endDate = new Date(data.endTime);
        document.getElementById('entryStartTime').value = startDate.toTimeString().substring(0, 5);
        document.getElementById('entryEndTime').value = endDate.toTimeString().substring(0, 5);
        document.getElementById('entryNotes').value = data.notes || '';
    }
    
    const colleaguesContainer = document.getElementById('entryColleaguesContainer');
    const checkedColleagues = isEditing ? data.colleagues || [] : [];
    colleaguesContainer.innerHTML = colleaguesCache.map(name => `
        <label class="flex items-center gap-2"><input type="checkbox" value="${name}" name="entryColleagues" ${checkedColleagues.includes(name) ? 'checked' : ''} /><span>${name}</span></label>
    `).join('');

    form.onsubmit = saveEntry;
    document.getElementById('cancelEntryBtn').onclick = () => modal.classList.add('hidden');
    modal.classList.remove('hidden');
}

async function saveEntry(e) {
    e.preventDefault();
    const modal = document.getElementById('entryModal');
    const entryId = document.getElementById('entryId').value;
    const date = document.getElementById('entryDate').value;
    const startTime = document.getElementById('entryStartTime').value;
    const endTime = document.getElementById('entryEndTime').value;
    
    if (endTime <= startTime) {
        showInfoModal("Erreur", "L'heure de fin doit être après l'heure de début.");
        return;
    }

    const selectedColleagues = Array.from(document.querySelectorAll('input[name="entryColleagues"]:checked')).map(el => el.value);

    const dataToSave = {
        chantier: document.getElementById('entryChantier').value,
        timestamp: new Date(`${date}T${startTime}`).toISOString(),
        endTime: new Date(`${date}T${endTime}`).toISOString(),
        colleagues: selectedColleagues,
        notes: document.getElementById('entryNotes').value.trim()
    };

    try {
        if (entryId) { // Mise à jour
            const pointageRef = doc(db, "pointages", entryId);
            await updateDoc(pointageRef, dataToSave);
            showInfoModal("Succès", "Le pointage a été mis à jour.");
        } else { // Ajout
            const fullData = {
                ...dataToSave,
                uid: targetUser.uid,
                userName: targetUser.name === "Mon" ? currentUser.displayName : targetUser.name,
                createdAt: serverTimestamp(),
                status: 'completed'
            };
            await addDoc(collection(db, "pointages"), fullData);
            showInfoModal("Succès", "Le pointage a été ajouté.");
        }
        modal.classList.add('hidden');
        loadHistoryForWeek();
    } catch (error) {
        console.error("Erreur de sauvegarde:", error);
        showInfoModal("Erreur", "L'enregistrement a échoué.");
    }
}

function generateHistoryPDF() {
    if (historyDataCache.length === 0) {
        showInfoModal("Information", "Il n'y a rien à télécharger pour cette période.");
        return;
    }
    const { jsPDF } = window.jspdf;
    if (!jsPDF || !jsPDF.API.autoTable) {
        showInfoModal("Erreur", "La librairie PDF (jsPDF avec autoTable) n'a pas pu être chargée.");
        return;
    }

    historyDataCache.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

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

    const tableHead = [['Date', 'Chantier', 'Durée Travail', 'Collègues', 'Remarques']];
    const tableBody = [];
    let currentDayKey = null;
    let totalEffectiveMs = 0;

    historyDataCache.forEach(d => {
        if (!d.endTime) return; // Ignore les pointages non terminés

        const startDate = new Date(d.timestamp);
        const dayKey = startDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' });

        if (dayKey !== currentDayKey) {
            currentDayKey = dayKey;
            tableBody.push([{
                content: dayKey,
                colSpan: 5,
                styles: { fillColor: '#f3f4f6', fontStyle: 'bold', textColor: '#374151' }
            }]);
        }
        
        const effectiveWorkMs = (new Date(d.endTime) - startDate) - (d.pauseDurationMs || 0);
        const durationStr = formatMilliseconds(effectiveWorkMs);
        totalEffectiveMs += effectiveWorkMs;
        
        const dateStr = startDate.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
        const colleaguesStr = Array.isArray(d.colleagues) && d.colleagues.length > 0 ? d.colleagues.join(", ") : 'Aucun';
        let humanNotes = d.notes ? d.notes.split('---').filter(part => !part.includes("Modification (par")).join(' ').trim() : '';

        tableBody.push([dateStr, d.chantier, durationStr, colleaguesStr, humanNotes]);
    });

    doc.autoTable({
        startY: 100,
        head: tableHead,
        body: tableBody,
        theme: 'striped',
        headStyles: { fillColor: [41, 51, 92], textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak' },
        columnStyles: {
            0: { cellWidth: 40 }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 60 },
            3: { cellWidth: 80 }, 4: { cellWidth: 'auto' }
        }
    });

    const finalY = doc.lastAutoTable.finalY;
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text(`Total travail effectif : ${formatMilliseconds(totalEffectiveMs)}`, 40, finalY + 20);

    const fileName = `Historique_${userName.replace(/ /g, '_')}_${startOfWeek.toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
}