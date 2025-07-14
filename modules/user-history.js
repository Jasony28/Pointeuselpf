// modules/user-history.js

import { collection, query, where, orderBy, getDocs, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, currentUser, isAdmin, pageContent } from "../app.js";

let currentWeekOffset = 0;
let targetUser = null; 
let historyDataCache = []; // NOUVEAU : Pour garder les données de la semaine en mémoire

export function render(params = {}) {
    if (params.userId) {
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

    document.getElementById("prevWeekBtn").onclick = () => { currentWeekOffset--; loadHistoryForWeek(); };
    document.getElementById("nextWeekBtn").onclick = () => { currentWeekOffset++; loadHistoryForWeek(); };
    document.getElementById("downloadPdfBtn").onclick = generateHistoryPDF; // On lie le bouton à la fonction PDF

    currentWeekOffset = 0;
    loadHistoryForWeek();
}

function getWeekDateRange(offset = 0) {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1) + (offset * 7);
    const startOfWeek = new Date(now.setDate(diff));
    startOfWeek.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);
    return { startOfWeek, endOfWeek };
}

async function loadHistoryForWeek() {
    if (!targetUser) return;
    historyDataCache = []; // On vide le cache

    const historyList = document.getElementById("historyList");
    const weekTotalsDisplay = document.getElementById("weekTotalsDisplay");
    const currentPeriodDisplay = document.getElementById("currentPeriodDisplay");
    
    const { startOfWeek, endOfWeek } = getWeekDateRange(currentWeekOffset);
    
    const options = { day: 'numeric', month: 'long' };
    currentPeriodDisplay.textContent = `Semaine du ${startOfWeek.toLocaleDateString('fr-FR', options)} au ${endOfWeek.toLocaleDateString('fr-FR', options)}`;
    historyList.innerHTML = "<p class='text-center p-4'>Chargement...</p>";
    weekTotalsDisplay.innerHTML = "";
    
    const pointagesCollectionRef = collection(db, "pointages");
    const q = query(
        pointagesCollectionRef,
        where("uid", "==", targetUser.uid),
        where("timestamp", ">=", startOfWeek.toISOString()),
        where("timestamp", "<=", endOfWeek.toISOString()),
        orderBy("timestamp", "desc")
    );
    
    try {
        const querySnapshot = await getDocs(q);
        historyList.innerHTML = "";
        let totalMs = 0;

        if (querySnapshot.empty) {
            historyList.innerHTML = "<p class='text-center text-gray-500 p-4'>Aucun pointage trouvé pour cette période.</p>";
        } else {
            // On stocke les données dans le cache pour le PDF
            historyDataCache = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            historyDataCache.forEach(d => {
                historyList.appendChild(createHistoryEntryElement(d.id, d));
                if (d.endTime) totalMs += new Date(d.endTime) - new Date(d.timestamp);
            });
        }

        const totalHours = Math.floor(totalMs / 3600000);
        const totalMinutes = Math.round((totalMs % 3600000) / 60000);
        weekTotalsDisplay.textContent = `Total semaine : ${totalHours}h ${totalMinutes}min`;

    } catch (error) {
        console.error("Erreur de chargement de l'historique:", error);
        historyList.innerHTML = `<p class='text-red-500 text-center p-4'>Erreur de chargement.</p>`;
    }
}

function createHistoryEntryElement(docId, d) {
    const wrapper = document.createElement("div");
    wrapper.className = "p-4 border rounded-lg bg-white relative shadow-sm space-y-1";
    
    const startDate = new Date(d.timestamp);
    const endDate = d.endTime ? new Date(d.endTime) : null;
    const userDisplay = isAdmin && d.userName ? `<div class="text-xs text-blue-600 font-semibold">${d.userName}</div>` : "";
    let timeDisplay = "", durationDisplay = "";

    if (endDate) {
        const timeFormat = { hour: '2-digit', minute: '2-digit' };
        timeDisplay = `<div>De ${startDate.toLocaleTimeString('fr-FR', timeFormat)} à ${endDate.toLocaleTimeString('fr-FR', timeFormat)}</div>`;
        const durationMs = endDate - startDate;
        const durationHours = Math.floor(durationMs / 3600000);
        const durationMinutes = Math.round((durationMs % 3600000) / 60000);
        durationDisplay = `<div class="text-sm text-gray-600">Durée : ${durationHours}h ${durationMinutes}min</div>`;
    }

    wrapper.innerHTML = `
      ${userDisplay}
      <div class="font-bold text-lg">${d.chantier}</div>
      <div>${startDate.toLocaleDateString('fr-FR', {weekday: 'long', day: 'numeric', month: 'long'})}</div>
      ${timeDisplay}
      ${durationDisplay}
      <div class="mt-2"><strong>Collègues :</strong> ${d.colleagues.join(", ")}</div>
      ${d.notes ? `<div class="mt-1 pt-2 border-t text-sm"><strong>Notes :</strong> ${d.notes}</div>` : ""}
    `;

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "✖";
    deleteBtn.className = "absolute top-2 right-3 text-gray-400 hover:text-red-600 font-bold";
    deleteBtn.onclick = async () => {
        if (confirm("Supprimer ce pointage ?")) {
            await deleteDoc(doc(db, "pointages", docId));
            loadHistoryForWeek();
        }
    };
    wrapper.appendChild(deleteBtn);
    return wrapper;
}

// NOUVELLE FONCTION POUR GÉNÉRER LE PDF DE L'HISTORIQUE
function generateHistoryPDF() {
    if (historyDataCache.length === 0) {
        alert("Il n'y a rien à télécharger pour cette période.");
        return;
    }
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const periodText = document.getElementById("currentPeriodDisplay").textContent;
    const totalText = document.getElementById("weekTotalsDisplay").textContent;
    const userName = targetUser.uid === currentUser.uid ? currentUser.displayName : targetUser.name;

    // Titre du document
    doc.setFontSize(18);
    doc.text(`Historique des Pointages`, 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Employé : ${userName}`, 14, 30);
    doc.text(periodText, 14, 36);

    // Préparation des données pour le tableau
    const tableData = historyDataCache.map(d => {
        const startDate = new Date(d.timestamp);
        const endDate = d.endTime ? new Date(d.endTime) : null;
        let durationStr = 'N/A';
        if (endDate) {
            const durationMs = endDate - startDate;
            const durationHours = Math.floor(durationMs / 3600000);
            const durationMinutes = Math.round((durationMs % 3600000) / 60000);
            durationStr = `${durationHours}h ${durationMinutes}min`;
        }
        return [
            startDate.toLocaleDateString('fr-FR', {weekday: 'short', day:'2-digit', month:'2-digit'}),
            d.chantier,
            startDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
            endDate ? endDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : 'En cours',
            durationStr,
        ];
    });

    // Création du tableau
    doc.autoTable({
        startY: 50,
        head: [['Date', 'Chantier', 'Début', 'Fin', 'Durée']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [79, 70, 229] } // Couleur violette (indigo-600)
    });
    
    // Ajout du total
    const finalY = doc.lastAutoTable.finalY;
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text(totalText, 14, finalY + 10);

    // Sauvegarde du fichier
    const fileName = `historique_${userName}_${periodText.replace(/ /g, '_')}.pdf`;
    doc.save(fileName);
}