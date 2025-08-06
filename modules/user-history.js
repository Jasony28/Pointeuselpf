import { collection, query, where, orderBy, getDocs, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, currentUser, isAdmin, pageContent, showConfirmationModal, showInfoModal } from "../app.js";
import { getWeekDateRange, formatMilliseconds } from "./utils.js";

let currentWeekOffset = 0;
let targetUser = null; 
let historyDataCache = [];

export function render(params = {}) {
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
    `;

    setTimeout(() => {
        document.getElementById("prevWeekBtn").onclick = () => { currentWeekOffset--; loadHistoryForWeek(); };
        document.getElementById("nextWeekBtn").onclick = () => { currentWeekOffset++; loadHistoryForWeek(); };
        document.getElementById("downloadPdfBtn").onclick = generateHistoryPDF;

        currentWeekOffset = 0;
        loadHistoryForWeek();
    }, 0);
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
            // CORRECTION : On ajoute un filtre sur l'ID de l'utilisateur pour respecter les règles de sécurité.
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
        historyDataCache = pointages.map(p => {
            const trajet = trajetsMap.get(p.id);
            return { ...p, trajet };
        });

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
        const deleteBtn = document.createElement("button");
        deleteBtn.textContent = "✖";
        deleteBtn.className = "absolute top-2 right-3 text-gray-400 hover:text-red-600 font-bold";
        deleteBtn.onclick = async () => {
            const confirmed = await showConfirmationModal("Confirmation", "Supprimer ce pointage ?");
            if (confirmed) {
                await deleteDoc(doc(db, "pointages", d.id));
                loadHistoryForWeek();
            }
        };
        wrapper.appendChild(deleteBtn);
    }
    return wrapper;
}

function generateHistoryPDF() {
    if (historyDataCache.length === 0) {
        showInfoModal("Information", "Il n'y a rien à télécharger pour cette période.");
        return;
    }
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const periodText = document.getElementById("currentPeriodDisplay").textContent;
    const totalText = document.getElementById("weekTotalsDisplay").textContent;
    const userName = targetUser.uid === currentUser.uid ? currentUser.displayName : targetUser.name;

    doc.setFontSize(18);
    doc.text(`Historique des Pointages`, 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Employé : ${userName}`, 14, 30);
    doc.text(periodText, 14, 36);

    const tableData = historyDataCache.map(d => {
        const startDate = new Date(d.timestamp);
        const endDate = d.endTime ? new Date(d.endTime) : null;
        let durationStr = 'N/A';
        if (endDate) {
            const totalDurationMs = endDate - startDate;
            const pauseMs = d.pauseDurationMs || 0;
            durationStr = formatMilliseconds(totalDurationMs - pauseMs);
        }
        const travelStr = d.trajet ? `${d.trajet.distance_km} km` : '-';
        return [
            startDate.toLocaleDateString('fr-FR', {day:'2-digit', month:'2-digit'}),
            d.chantier,
            durationStr,
            travelStr
        ];
    });

    doc.autoTable({
        startY: 50,
        head: [['Date', 'Chantier', 'Durée Travail', 'Distance Trajet']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [79, 70, 229] }
    });
    
    const finalY = doc.lastAutoTable.finalY;
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text(totalText, 14, finalY + 10);
    
    const fileName = `historique_${userName.replace(/ /g, '_')}_${periodText.replace(/ /g, '_')}.pdf`;
    doc.save(fileName);
}
