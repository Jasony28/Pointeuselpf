import { collection, query, where, orderBy, getDocs, deleteDoc, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, currentUser, isAdmin, pageContent, showConfirmationModal, showInfoModal } from "../app.js";
import { getWeekDateRange, formatMilliseconds } from "./utils.js";

let currentWeekOffset = 0;
let targetUser = null; 
let historyDataCache = [];
// Caches pour la modale d'édition
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
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                        <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/>
                        <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/>
                    </svg>
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
            <div id="historyList" class="space-y-3"></div>
        </div>

        <!-- NOUVELLE MODALE D'ÉDITION -->
        <div id="editPointageModal" class="hidden fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-30 p-4">
            <div class="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg">
                <h3 class="text-xl font-bold mb-4">Modifier le pointage</h3>
                <form id="editPointageForm" class="space-y-4">
                    <input type="hidden" id="editPointageId">
                    <div>
                        <label for="editChantier" class="text-sm font-medium">Chantier</label>
                        <select id="editChantier" class="w-full border p-2 rounded mt-1" required></select>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div><label for="editDate" class="text-sm font-medium">Date</label><input id="editDate" type="date" class="w-full border p-2 rounded mt-1" required /></div>
                        <div><label for="editStartTime" class="text-sm font-medium">Début</label><input id="editStartTime" type="time" class="w-full border p-2 rounded mt-1" required /></div>
                        <div><label for="editEndTime" class="text-sm font-medium">Fin</label><input id="editEndTime" type="time" class="w-full border p-2 rounded mt-1" required /></div>
                    </div>
                    <div>
                        <label class="text-sm font-medium">Collègues</label>
                        <div id="editColleaguesContainer" class="mt-1 p-2 border rounded max-h-32 overflow-y-auto space-y-1"></div>
                    </div>
                    <div>
                        <label for="editNotes" class="text-sm font-medium">Notes</label>
                        <textarea id="editNotes" class="w-full border p-2 rounded mt-1"></textarea>
                    </div>
                    <div class="flex justify-end gap-4 pt-4 border-t">
                        <button type="button" id="cancelEditBtn" class="bg-gray-300 hover:bg-gray-400 px-4 py-2 rounded">Annuler</button>
                        <button type="submit" class="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded">Enregistrer</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    setTimeout(async () => {
        await cacheEditModalData(); // On charge les données pour la modale une seule fois
        document.getElementById("prevWeekBtn").onclick = () => { currentWeekOffset--; loadHistoryForWeek(); };
        document.getElementById("nextWeekBtn").onclick = () => { currentWeekOffset++; loadHistoryForWeek(); };
        document.getElementById("downloadPdfBtn").onclick = generateHistoryPDF;
        currentWeekOffset = 0;
        loadHistoryForWeek();
    }, 0);
}

async function cacheEditModalData() {
    const chantiersQuery = query(collection(db, "chantiers"), where("status", "==", "active"), orderBy("name"));
    const colleaguesQuery = query(collection(db, "colleagues"), orderBy("name"));
    const usersQuery = query(collection(db, "users"), where("status", "==", "approved"), orderBy("displayName"));

    // CORRECTION: The variable name was incorrect here.
    const [chantiersSnapshot, colleaguesSnapshot, usersSnapshot] = await Promise.all([
        getDocs(chantiersQuery),
        getDocs(colleaguesQuery),
        getDocs(usersQuery) // Corrected from usersSnapshot to usersQuery
    ]);

    chantiersCache = chantiersSnapshot.docs.map(doc => doc.data().name);
    const colleagueNames = colleaguesSnapshot.docs.map(doc => doc.data().name);
    const userNames = usersSnapshot.docs.map(doc => doc.data().displayName);
    colleaguesCache = [...new Set([...colleagueNames, ...userNames])].sort((a, b) => a.localeCompare(b));
}

async function loadHistoryForWeek() {
    if (!targetUser) return;
    historyDataCache = [];

    const historyList = document.getElementById("historyList");
    const weekTotalsDisplay = document.getElementById("weekTotalsDisplay");
    const currentPeriodDisplay = document.getElementById("currentPeriodDisplay");
    
    const { startOfWeek, endOfWeek } = getWeekDateRange(currentWeekOffset);
    
    const options = { day: 'numeric', month: 'long', timeZone: 'UTC' };
    currentPeriodDisplay.textContent = `Semaine du ${startOfWeek.toLocaleDateString('fr-FR', options)} au ${endOfWeek.toLocaleDateString('fr-FR', options)}`;
    historyList.innerHTML = "<p class='text-center p-4'>Chargement...</p>";
    weekTotalsDisplay.innerHTML = "";
    
    try {
        const pointagesQuery = query(
            collection(db, "pointages"),
            where("uid", "==", targetUser.uid),
            where("timestamp", ">=", startOfWeek.toISOString()),
            where("timestamp", "<=", endOfWeek.toISOString()),
            orderBy("timestamp", "desc")
        );
        const pointagesSnapshot = await getDocs(pointagesQuery);
        
        if (pointagesSnapshot.empty) {
            historyList.innerHTML = "<p class='text-center text-gray-500 p-4'>Aucun pointage trouvé pour cette période.</p>";
            weekTotalsDisplay.textContent = "Total travail effectif : 0h 0min";
            return;
        }
        
        const pointages = pointagesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const pointageIds = pointages.map(p => p.id);
        const trajetsMap = new Map();

        if (pointageIds.length > 0) {
            const trajetsQuery = query(collection(db, "trajets"), 
                where("id_utilisateur", "==", targetUser.uid),
                where("id_pointage_arrivee", "in", pointageIds)
            );
            const trajetsSnapshot = await getDocs(trajetsQuery);
            trajetsSnapshot.forEach(doc => {
                const trajet = doc.data();
                trajetsMap.set(trajet.id_pointage_arrivee, trajet);
            });
        }

        historyList.innerHTML = "";
        let totalEffectiveMs = 0;
        historyDataCache = pointages.map(p => ({ ...p, trajet: trajetsMap.get(p.id) }));

        historyDataCache.forEach(d => {
            historyList.appendChild(createHistoryEntryElement(d));
            if (d.endTime) {
                const totalDurationMs = new Date(d.endTime) - new Date(d.timestamp);
                const pauseMs = d.pauseDurationMs || 0;
                totalEffectiveMs += (totalDurationMs - pauseMs);
            }
        });
        
        weekTotalsDisplay.textContent = `Total travail effectif : ${formatMilliseconds(totalEffectiveMs)}`;

    } catch (error) {
        console.error("Erreur de chargement de l'historique:", error);
        historyList.innerHTML = `<p class='text-red-500 text-center p-4'>Erreur de chargement.</p>`;
    }
}

function createHistoryEntryElement(d) {
    const wrapper = document.createElement("div");
    wrapper.className = "p-4 border rounded-lg bg-white relative shadow-sm space-y-1";
    
    const startDate = new Date(d.timestamp);
    const endDate = d.endTime ? new Date(d.endTime) : null;
    let timeDisplay = "", durationDisplay = "", pauseDisplay = "", travelDisplay = "";

    if (endDate) {
        const timeFormat = { hour: '2-digit', minute: '2-digit' };
        timeDisplay = `<div>De ${startDate.toLocaleTimeString('fr-FR', timeFormat)} à ${endDate.toLocaleTimeString('fr-FR', timeFormat)}</div>`;
        
        const totalDurationMs = endDate - startDate;
        const pauseMs = d.pauseDurationMs || 0;
        const effectiveWorkMs = totalDurationMs - pauseMs;

        durationDisplay = `<div class="text-sm text-gray-600"><strong>Durée effective :</strong> ${formatMilliseconds(effectiveWorkMs)}</div>`;
        if (pauseMs > 0) {
            pauseDisplay = `<div class="text-sm text-yellow-600">Pause : ${formatMilliseconds(pauseMs)}</div>`;
        }
    }

    if (d.trajet) {
        travelDisplay = `<div class="text-sm text-blue-600">🚗 Trajet : ${d.trajet.distance_km} km (${d.trajet.duree_min} min)</div>`;
    }

    wrapper.innerHTML = `
      <div class="font-bold text-lg">${d.chantier}</div>
      <div>${startDate.toLocaleDateString('fr-FR', {weekday: 'long', day: 'numeric', month: 'long'})}</div>
      ${timeDisplay}
      ${durationDisplay}
      ${pauseDisplay}
      ${travelDisplay}
      <div class="mt-2"><strong>Collègues :</strong> ${Array.isArray(d.colleagues) ? d.colleagues.join(", ") : 'N/A'}</div>
      ${d.notes ? `<div class="mt-1 pt-2 border-t text-sm"><strong>Notes :</strong> ${d.notes}</div>` : ""}
    `;

    if (isAdmin || currentUser.uid === targetUser.uid) {
        const controlsWrapper = document.createElement("div");
        controlsWrapper.className = "absolute top-2 right-3 flex gap-2";

        const editBtn = document.createElement("button");
        editBtn.innerHTML = `✏️`;
        editBtn.className = "text-gray-400 hover:text-blue-600 font-bold";
        editBtn.title = "Modifier ce pointage";
        editBtn.onclick = () => openEditModal(d);
        controlsWrapper.appendChild(editBtn);

        const deleteBtn = document.createElement("button");
        deleteBtn.textContent = "✖";
        deleteBtn.className = "text-gray-400 hover:text-red-600 font-bold";
        deleteBtn.title = "Supprimer ce pointage";
        deleteBtn.onclick = async () => {
            const confirmed = await showConfirmationModal("Confirmation", "Supprimer ce pointage ?");
            if (confirmed) {
                await deleteDoc(doc(db, "pointages", d.id));
                loadHistoryForWeek();
            }
        };
        controlsWrapper.appendChild(deleteBtn);
        wrapper.appendChild(controlsWrapper);
    }
    return wrapper;
}

function openEditModal(pointage) {
    const modal = document.getElementById('editPointageModal');
    const form = document.getElementById('editPointageForm');
    
    document.getElementById('editPointageId').value = pointage.id;
    
    const chantierSelect = document.getElementById('editChantier');
    chantierSelect.innerHTML = chantiersCache.map(name => `<option value="${name}" ${name === pointage.chantier ? 'selected' : ''}>${name}</option>`).join('');

    const startDate = new Date(pointage.timestamp);
    const endDate = new Date(pointage.endTime);
    document.getElementById('editDate').value = startDate.toISOString().split('T')[0];
    document.getElementById('editStartTime').value = startDate.toTimeString().substring(0, 5);
    document.getElementById('editEndTime').value = endDate.toTimeString().substring(0, 5);

    const colleaguesContainer = document.getElementById('editColleaguesContainer');
    colleaguesContainer.innerHTML = colleaguesCache.map(name => `
        <label class="flex items-center gap-2">
            <input type="checkbox" value="${name}" name="editColleagues" ${(pointage.colleagues || []).includes(name) ? 'checked' : ''} />
            <span>${name}</span>
        </label>
    `).join('');

    document.getElementById('editNotes').value = pointage.notes || '';

    form.onsubmit = savePointageChanges;
    document.getElementById('cancelEditBtn').onclick = () => modal.classList.add('hidden');
    modal.classList.remove('hidden');
}

async function savePointageChanges(e) {
    e.preventDefault();
    const modal = document.getElementById('editPointageModal');
    const pointageId = document.getElementById('editPointageId').value;
    
    const date = document.getElementById('editDate').value;
    const startTime = document.getElementById('editStartTime').value;
    const endTime = document.getElementById('editEndTime').value;
    
    const newStartTimestamp = new Date(`${date}T${startTime}`).toISOString();
    const newEndTimestamp = new Date(`${date}T${endTime}`).toISOString();

    if (newEndTimestamp <= newStartTimestamp) {
        showInfoModal("Erreur", "L'heure de fin doit être après l'heure de début.");
        return;
    }

    const selectedColleagues = Array.from(document.querySelectorAll('input[name="editColleagues"]:checked')).map(el => el.value);

    const updatedData = {
        chantier: document.getElementById('editChantier').value,
        timestamp: newStartTimestamp,
        endTime: newEndTimestamp,
        colleagues: selectedColleagues.length ? selectedColleagues : ["Seul"],
        notes: document.getElementById('editNotes').value.trim()
    };

    try {
        const pointageRef = doc(db, "pointages", pointageId);
        await updateDoc(pointageRef, updatedData);
        modal.classList.add('hidden');
        showInfoModal("Succès", "Le pointage a été mis à jour.");
        loadHistoryForWeek();
    } catch (error) {
        console.error("Erreur de mise à jour du pointage:", error);
        showInfoModal("Erreur", "La mise à jour a échoué.");
    }
}

/**
 * Génère un PDF d'historique simple et compact, avec des séparateurs de jours,
 * optimisé pour tenir sur une seule page, et qui filtre les remarques automatiques.
 */
function generateHistoryPDF() {
    // 1. Vérification initiale
    if (historyDataCache.length === 0) {
        showInfoModal("Information", "Il n'y a rien à télécharger pour cette période.");
        return;
    }
    const { jsPDF } = window.jspdf;
    if (!jsPDF || !jsPDF.API.autoTable) {
        showInfoModal("Erreur", "La librairie PDF (jsPDF avec autoTable) n'a pas pu être chargée.");
        return;
    }

    // --- ÉTAPE A : Tri des données ---
    historyDataCache.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    // --- ÉTAPE B : Création du document et de l'en-tête ---
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

    // --- ÉTAPE C : Préparation du corps du tableau avec séparateurs de jours ---
    const tableHead = [['Date', 'Chantier', 'Durée Travail', 'Collègues', 'Remarques']];
    const tableBody = [];
    let currentDayKey = null;
    let totalEffectiveMs = 0;

    historyDataCache.forEach(d => {
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

        let durationStr = 'En cours';
        if (d.endTime) {
            const effectiveWorkMs = (new Date(d.endTime) - startDate) - (d.pauseDurationMs || 0);
            durationStr = formatMilliseconds(effectiveWorkMs);
            totalEffectiveMs += effectiveWorkMs;
        }
        
        const dateStr = startDate.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
        const colleaguesStr = Array.isArray(d.colleagues) && d.colleagues.length > 0 ? d.colleagues.join(", ") : 'Aucun';
        
        // --- NOUVELLE LOGIQUE DE FILTRAGE ---
        // On ne garde que les remarques qui NE SONT PAS des logs de modification.
        let humanNotes = '';
        if (d.notes) {
            // Sépare les notes par le "---" et garde seulement les parties qui ne sont pas des logs.
            const notesParts = d.notes.split('---');
            const filteredParts = notesParts.filter(part => !part.includes("Modification (par"));
            humanNotes = filteredParts.join(' ').trim(); // Rejoint les parties valides.
        }

        tableBody.push([dateStr, d.chantier, durationStr, colleaguesStr, humanNotes]);
    });

    // --- ÉTAPE D : Génération du PDF avec autoTable ---
    doc.autoTable({
        startY: 100,
        head: tableHead,
        body: tableBody,
        theme: 'striped',
        headStyles: { 
            fillColor: [41, 51, 92],
            textColor: 255, 
            fontStyle: 'bold' 
        },
        styles: {
            fontSize: 8,
            cellPadding: 4,
            overflow: 'linebreak'
        },
        columnStyles: {
            0: { cellWidth: 40 },
            1: { cellWidth: 'auto' },
            2: { cellWidth: 60 },
            3: { cellWidth: 80 },
            4: { cellWidth: 'auto' }
        }
    });

    // --- ÉTAPE E : Ajout du total en bas de page ---
    const finalY = doc.lastAutoTable.finalY;
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text(`Total travail effectif : ${formatMilliseconds(totalEffectiveMs)}`, 40, finalY + 20);

    // --- ÉTAPE F : Sauvegarde du fichier ---
    const fileName = `Historique_${userName.replace(/ /g, '_')}_${startOfWeek.toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
}