import { collection, query, where, orderBy, getDocs, deleteDoc, doc, updateDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, currentUser, isAdmin, pageContent, showConfirmationModal, showInfoModal } from "../app.js";
import { getWeekDateRange, formatMilliseconds, formatMinutes } from "./utils.js";

// --- Variables globales du module ---
let currentWeekOffset = 0;
let targetUser = null; 
let historyDataCache = [];
let chantiersCache = [];
let colleaguesCache = [];

/**
 * Affiche la page de l'historique des pointages.
 */
export function render(params = {}) {
    if (params.userId && isAdmin) {
        targetUser = { uid: params.userId, name: params.userName };
    } else {
        targetUser = { uid: currentUser.uid, name: "Mon" };
    }

    const mainContentHTML = `
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
                <div id="weekTravelTotalsDisplay" class="mt-1 text-center text-md font-semibold text-gray-600"></div>
            </div>
            <div id="historyList" class="space-y-3"></div>
        </div>
    `;

    const modalHTML = `
        <div id="editPointageModal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-20 p-4">
            <div class="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
                <h3 class="text-xl font-bold mb-4">Modifier le pointage</h3>
                <form id="editPointageForm" class="space-y-4">
                    <input type="hidden" id="editPointageId">
                    <div>
                        <label class="text-sm font-medium">Chantier</label>
                        <select id="editChantierSelect" class="w-full border p-2 rounded mt-1" required></select>
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div><label class="text-sm font-medium">Début</label><input id="editStartTime" type="time" class="w-full border p-2 rounded mt-1" required /></div>
                        <div><label class="text-sm font-medium">Fin</label><input id="editEndTime" type="time" class="w-full border p-2 rounded mt-1" required /></div>
                    </div>
                    <div>
                        <label class="text-sm font-medium">Collègues présents</label>
                        <div id="editColleaguesContainer" class="mt-1 p-2 border rounded max-h-40 overflow-y-auto space-y-1"></div>
                    </div>
                    <div class="flex justify-end gap-4 pt-4">
                        <button type="button" id="cancelEditPointage" class="bg-gray-300 hover:bg-gray-400 px-4 py-2 rounded">Annuler</button>
                        <button type="submit" class="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded">Enregistrer</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    pageContent.innerHTML = mainContentHTML + modalHTML;

    setTimeout(() => {
        document.getElementById("prevWeekBtn").onclick = () => { currentWeekOffset--; loadHistoryForWeek(); };
        document.getElementById("nextWeekBtn").onclick = () => { currentWeekOffset++; loadHistoryForWeek(); };
        document.getElementById("downloadPdfBtn").onclick = generateHistoryPDF;
        currentWeekOffset = 0;
        loadHistoryForWeek();
    }, 0);
}

/**
 * Charge les données de l'historique pour la semaine sélectionnée.
 */
async function loadHistoryForWeek() {
    if (!targetUser) return;
    historyDataCache = [];

    const historyList = document.getElementById("historyList");
    const weekTotalsDisplay = document.getElementById("weekTotalsDisplay");
    const weekTravelTotalsDisplay = document.getElementById("weekTravelTotalsDisplay");
    const currentPeriodDisplay = document.getElementById("currentPeriodDisplay");
    
    const { startOfWeek, endOfWeek } = getWeekDateRange(currentWeekOffset);
    
    const options = { day: 'numeric', month: 'long', timeZone: 'UTC' };
    currentPeriodDisplay.textContent = `Semaine du ${startOfWeek.toLocaleDateString('fr-FR', options)} au ${endOfWeek.toLocaleDateString('fr-FR', options)}`;
    historyList.innerHTML = "<p class='text-center p-4'>Chargement...</p>";
    weekTotalsDisplay.innerHTML = "";
    weekTravelTotalsDisplay.innerHTML = "";

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
            historyList.innerHTML = "<p class='text-center text-gray-500 p-4'>Aucun pointage pour cette période.</p>";
            weekTotalsDisplay.textContent = "Total travail effectif : 0h 0min";
            weekTravelTotalsDisplay.textContent = "Total trajets : 0.00 km / 0h 0min";
            return;
        }
        
        const pointages = pointagesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const pointageIds = pointages.map(p => p.id);
        const trajetsMap = new Map();

        if (pointageIds.length > 0) {
            const trajetsQuery = query(collection(db, "trajets"), 
                where("id_utilisateur", "==", targetUser.uid),
                where("id_pointage_arrivee", "in", pointageIds.slice(0, 30))
            );
            const trajetsSnapshot = await getDocs(trajetsQuery);
            trajetsSnapshot.forEach(doc => {
                const trajet = doc.data();
                trajetsMap.set(trajet.id_pointage_arrivee, trajet);
            });
        }

        historyList.innerHTML = "";
        let totalEffectiveMs = 0;
        let totalKm = 0;
        let totalMin = 0;
        historyDataCache = pointages.map(p => ({ ...p, trajet: trajetsMap.get(p.id) }));

        historyDataCache.forEach(d => {
            historyList.appendChild(createHistoryEntryElement(d));
            if (d.endTime) {
                const totalDurationMs = new Date(d.endTime) - new Date(d.timestamp);
                const pauseMs = d.pauseDurationMs || 0;
                totalEffectiveMs += (totalDurationMs - pauseMs);
            }
            if (d.trajet) {
                totalKm += d.trajet.distance_km || 0;
                totalMin += d.trajet.duree_min || 0;
            }
        });
        
        weekTotalsDisplay.textContent = `Total travail effectif : ${formatMilliseconds(totalEffectiveMs)}`;
        weekTravelTotalsDisplay.innerHTML = `
            <span class="inline-flex items-center gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-car-front-fill" viewBox="0 0 16 16"><path d="M2.52 3.515A2.5 2.5 0 0 1 4.82 2h6.362c1 0 1.904.596 2.298 1.515l.792 1.848c.075.175.21.319.38.404.5.25.855.715.965 1.262l.335 1.679c.033.161.049.325.049.49v.413c0 .814-.39 1.543-1 1.997V13.5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5v-1.338c-1.292.048-2.745.088-4.002-.036V13.5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5v-1.892c-.61-.454-1-1.183-1-1.997v-.413a2.5 2.5 0 0 1 .049-.49l.335-1.68c.11-.546.465-1.012.964-1.261a.8.8 0 0 0 .381-.404l.792-1.848ZM3 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2m10 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2M6 8a1 1 0 0 0 0 2h4a1 1 0 1 0 0-2zM2.906 5.189a.51.51 0 0 0 .497.731c.91-.073 3.35-.17 4.597-.17s3.688.097 4.597.17a.51.51 0 0 0 .497-.731l-.956-1.912A.5.5 0 0 0 11.691 3H4.309a.5.5 0 0 0-.447.276L2.906 5.19z"/></svg>
                Total trajets : ${totalKm.toFixed(2)} km / ${formatMinutes(totalMin)}
            </span>
        `;

    } catch (error) {
        console.error("Erreur de chargement de l'historique:", error);
        historyList.innerHTML = `<p class='text-red-500 text-center p-4'>Erreur de chargement.</p>`;
    }
}

/**
 * Crée l'élément HTML pour une entrée d'historique.
 */
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
        if (d.isDriver) {
            travelDisplay = `<div class="text-sm text-blue-600">🚗 Trajet (Conducteur) : ${d.trajet.distance_km} km (${d.trajet.duree_min} min)</div>`;
        } else {
            travelDisplay = `<div class="text-sm text-gray-600">🕒 Trajet (Passager) : ${d.trajet.duree_min} min</div>`;
        }
    }

    wrapper.innerHTML = `
      <div class="font-bold text-lg">${d.chantier}</div>
      <div>${startDate.toLocaleDateString('fr-FR', {weekday: 'long', day: 'numeric', month: 'long'})}</div>
      ${timeDisplay}
      ${durationDisplay}
      ${pauseDisplay}
      ${travelDisplay}
      <div class="mt-2"><strong>Collègues :</strong> ${Array.isArray(d.colleagues) && d.colleagues.length > 0 ? d.colleagues.join(", ") : 'Aucun'}</div>
      ${d.notes ? `<div class="mt-1 pt-2 border-t text-sm whitespace-pre-wrap"><strong>Notes :</strong> ${d.notes}</div>` : ""}
    `;

    if (isAdmin || currentUser.uid === targetUser.uid) {
        const controlsDiv = document.createElement('div');
        controlsDiv.className = "absolute top-2 right-3 flex items-center gap-2";

        const editBtn = document.createElement("button");
        editBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="text-gray-400 hover:text-blue-600" viewBox="0 0 16 16"><path d="M15.502 1.94a.5.5 0 0 1 0 .706L14.459 3.69l-2-2L13.502.646a.5.5 0 0 1 .707 0l1.293 1.293zm-1.75 2.456-2-2L4.939 9.21a.5.5 0 0 0-.121.196l-.805 2.414a.25.25 0 0 0 .316.316l2.414-.805a.5.5 0 0 0 .196-.12l6.813-6.814z"/><path fill-rule="evenodd" d="M1 13.5A1.5 1.5 0 0 0 2.5 15h11a1.5 1.5 0 0 0 1.5-1.5v-6a.5.5 0 0 0-1 0v6a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5v-11a.5.5 0 0 1 .5-.5H9a.5.5 0 0 0 0-1H2.5A1.5 1.5 0 0 0 1 2.5z"/></svg>`;
        editBtn.title = "Modifier ce pointage";
        editBtn.onclick = () => openEditModal(d); 
        controlsDiv.appendChild(editBtn);

        const deleteBtn = document.createElement("button");
        deleteBtn.textContent = "✖";
        deleteBtn.className = "text-gray-400 hover:text-red-600 font-bold";
        deleteBtn.title = "Supprimer ce pointage et le trajet associé";
        deleteBtn.onclick = async () => {
            const confirmed = await showConfirmationModal("Confirmation", "Supprimer ce pointage et le trajet associé ?");
            if (confirmed) {
                try {
                    const batch = writeBatch(db);
                    const trajetQuery = query(collection(db, "trajets"), where("id_pointage_arrivee", "==", d.id));
                    const trajetSnapshot = await getDocs(trajetQuery);
                    trajetSnapshot.forEach(trajetDoc => batch.delete(trajetDoc.ref));
                    batch.delete(doc(db, "pointages", d.id));
                    await batch.commit();
                    showInfoModal("Succès", "Le pointage et le trajet ont été supprimés.");
                    loadHistoryForWeek();
                } catch (error) {
                    console.error("Erreur de suppression :", error);
                    showInfoModal("Erreur", "La suppression a échoué.");
                }
            }
        };
        controlsDiv.appendChild(deleteBtn);
        wrapper.appendChild(controlsDiv);
    }
    return wrapper;
}

/**
 * Ouvre et remplit la modale de modification de pointage.
 */
async function openEditModal(pointageData) {
    const modal = document.getElementById('editPointageModal');
    if (!modal) return;

    if (chantiersCache.length === 0) {
        const chantiersSnapshot = await getDocs(query(collection(db, "chantiers"), orderBy("name")));
        chantiersCache = chantiersSnapshot.docs.map(doc => doc.data().name);
    }
    if (colleaguesCache.length === 0) {
        const usersSnapshot = await getDocs(query(collection(db, "users"), orderBy("displayName")));
        const colleagueNamesSnapshot = await getDocs(query(collection(db, "colleagues"), orderBy("name")));
        const userNames = usersSnapshot.docs.map(doc => doc.data().displayName);
        const colleagueNames = colleagueNamesSnapshot.docs.map(doc => doc.data().name);
        colleaguesCache = [...new Set([...userNames, ...colleagueNames])].sort();
    }

    document.getElementById('editPointageId').value = pointageData.id;
    
    const chantierSelect = document.getElementById('editChantierSelect');
    chantierSelect.innerHTML = chantiersCache.map(name => `<option value="${name}" ${name === pointageData.chantier ? 'selected' : ''}>${name}</option>`).join('');

    const startTime = new Date(pointageData.timestamp);
    const endTime = new Date(pointageData.endTime);
    document.getElementById('editStartTime').value = startTime.toTimeString().slice(0, 5);
    document.getElementById('editEndTime').value = endTime.toTimeString().slice(0, 5);

    const colleaguesContainer = document.getElementById('editColleaguesContainer');
    colleaguesContainer.innerHTML = colleaguesCache.map(name => `
        <label class="flex items-center gap-2 p-1">
            <input type="checkbox" name="editColleagues" value="${name}" ${(pointageData.colleagues || []).includes(name) ? 'checked' : ''} class="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500">
            <span>${name}</span>
        </label>
    `).join('');

    document.getElementById('cancelEditPointage').onclick = () => modal.classList.add('hidden');
    document.getElementById('editPointageForm').onsubmit = (e) => {
        e.preventDefault();
        savePointageChanges(pointageData);
    };

    modal.classList.remove('hidden');
}

/**
 * Sauvegarde les modifications apportées à un pointage.
 */
async function savePointageChanges(originalData) {
    const pointageId = document.getElementById('editPointageId').value;
    const newChantier = document.getElementById('editChantierSelect').value;
    const newStartTime = document.getElementById('editStartTime').value;
    const newEndTime = document.getElementById('editEndTime').value;
    const newColleagues = Array.from(document.querySelectorAll('input[name="editColleagues"]:checked')).map(el => el.value);

    const originalDate = new Date(originalData.timestamp).toISOString().split('T')[0];
    const newStartTimestamp = new Date(`${originalDate}T${newStartTime}`).toISOString();
    const newEndTimestamp = new Date(`${originalDate}T${newEndTime}`).toISOString();

    const originalStart = new Date(originalData.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const originalEnd = new Date(originalData.endTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const modificationNote = `\n---\nModification (par ${currentUser.displayName} le ${new Date().toLocaleString('fr-FR')})\nAnciennes données :\n- Chantier: ${originalData.chantier}\n- Heures: ${originalStart} à ${originalEnd}\n- Collègues: ${(originalData.colleagues || []).join(', ')}\n---`;

    const updatedData = {
        chantier: newChantier,
        timestamp: newStartTimestamp,
        endTime: newEndTimestamp,
        colleagues: newColleagues,
        notes: (originalData.notes || "") + modificationNote
    };

    try {
        await updateDoc(doc(db, "pointages", pointageId), updatedData);
        showInfoModal("Succès", "Le pointage a été mis à jour.");
        document.getElementById('editPointageModal').classList.add('hidden');
        loadHistoryForWeek();
    } catch (error) {
        console.error("Erreur de mise à jour du pointage:", error);
        showInfoModal("Erreur", "La mise à jour a échoué.");
    }
}

/**
 * Génère un fichier PDF de l'historique des pointages.
 */
function generateHistoryPDF() {
    if (historyDataCache.length === 0) {
        showInfoModal("Information", "Il n'y a rien à télécharger pour cette période.");
        return;
    }
    
    const { jsPDF } = window.jspdf;
    if (!jsPDF || !jsPDF.API.autoTable) {
        showInfoModal("Erreur", "La librairie PDF n'a pas pu être chargée.");
        return;
    }

    const doc = new jsPDF();
    const periodText = document.getElementById("currentPeriodDisplay").textContent;
    const totalText = document.getElementById("weekTotalsDisplay").textContent;
    const userName = targetUser.name === "Mon" ? currentUser.displayName : targetUser.name;

    doc.setFontSize(18);
    doc.text("Historique des Pointages", 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Employé : ${userName}`, 14, 30);
    doc.text(periodText, 14, 36);

    const tableHead = [['Date', 'Chantier', 'Durée Travail', 'Trajet', 'Collègues']];
    const tableBody = historyDataCache.map(d => {
        const startDate = new Date(d.timestamp);
        const endDate = d.endTime ? new Date(d.endTime) : null;
        let durationStr = 'N/A';
        if (endDate) {
            const effectiveWorkMs = (endDate - startDate) - (d.pauseDurationMs || 0);
            durationStr = formatMilliseconds(effectiveWorkMs);
        }
        
        let travelStr = '-';
        if (d.trajet) {
            if (d.isDriver) {
                travelStr = `${d.trajet.distance_km} km (${d.trajet.duree_min} min)`;
            } else {
                travelStr = `${d.trajet.duree_min} min (Passager)`;
            }
        }

        const colleaguesStr = Array.isArray(d.colleagues) && d.colleagues.length > 0 ? d.colleagues.join(", ") : 'Aucun';
        return [
            startDate.toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit' }),
            d.chantier,
            durationStr,
            travelStr,
            colleaguesStr
        ];
    });

    doc.autoTable({
        startY: 50,
        head: tableHead,
        body: tableBody,
        theme: 'grid',
        headStyles: { fillColor: [79, 70, 229] }
    });
    
    const finalY = doc.lastAutoTable.finalY || 50;
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text(totalText, 14, finalY + 10);
    
    const fileName = `historique_${userName.replace(/ /g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
}
