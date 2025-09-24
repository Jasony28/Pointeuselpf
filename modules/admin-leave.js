import { collection, query, orderBy, getDocs, doc, updateDoc, writeBatch, where, serverTimestamp, deleteDoc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent, showInfoModal, showConfirmationModal } from "../app.js";

export async function render() {
    pageContent.innerHTML = `
        <div class="max-w-4xl mx-auto space-y-6">
            <div>
                <h2 class="text-2xl font-bold">📬 Gestion des Demandes de Congés</h2>
                <p style="color: var(--color-text-muted);">Approuvez ou refusez les demandes de congé de votre équipe.</p>
            </div>
            <div class="p-6 rounded-lg shadow-sm" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                <div id="leave-requests-list" class="space-y-4">
                    <p class="text-center">Chargement des demandes...</p>
                </div>
            </div>
        </div>
    `;
    setTimeout(loadAllRequests, 0);
}
async function loadAllRequests() {
    const listContainer = document.getElementById('leave-requests-list');
    try {
        const q = query(collection(db, "leaveRequests"), orderBy("requestedAt", "desc"));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            listContainer.innerHTML = '<p class="text-center text-gray-500">Aucune demande de congé pour le moment.</p>';
            return;
        }

        listContainer.innerHTML = '';
        snapshot.forEach(doc => {
            listContainer.appendChild(createRequestElement(doc.id, doc.data()));
        });

        listContainer.addEventListener('click', handleAdminAction);
    } catch (error) {
        console.error("Erreur de chargement des demandes:", error);
        listContainer.innerHTML = '<p class="text-center text-red-500">Erreur de chargement.</p>';
    }
}

function createRequestElement(id, data) {
    const el = document.createElement('div');
    el.className = 'p-4 border rounded-lg flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4';
    
    const startDate = new Date(data.startDate + 'T12:00:00Z');
    const endDate = new Date((data.endDate || data.startDate) + 'T12:00:00Z');
    const options = { year: 'numeric', month: 'long', day: 'numeric' };

    let dateDisplay;
    if (startDate.getTime() === endDate.getTime()) {
        dateDisplay = startDate.toLocaleDateString('fr-FR', { weekday: 'long', ...options });
    } else {
        dateDisplay = `Du ${startDate.toLocaleDateString('fr-FR', options)} au ${endDate.toLocaleDateString('fr-FR', options)}`;
    }

    let timeDisplay = '';
    if (data.reason === 'Médical' && data.startTime && data.endTime) {
        timeDisplay = `<p class="text-sm text-purple-700 font-semibold">De ${data.startTime} à ${data.endTime}</p>`;
    }
    
    let statusBadge;
    if (data.status === 'approved') {
        statusBadge = '<span class="px-3 py-1 text-sm font-semibold rounded-full bg-green-100 text-green-800">Approuvé</span>';
    } else if (data.status === 'refused') {
        statusBadge = '<span class="px-3 py-1 text-sm font-semibold rounded-full bg-red-100 text-red-800">Refusé</span>';
    } else {
        statusBadge = '<span class="px-3 py-1 text-sm font-semibold rounded-full bg-blue-100 text-blue-800">En attente</span>';
    }

    el.innerHTML = `
        <div>
            <p class="font-bold">${data.userName}</p>
            <p class="text-gray-700">${dateDisplay}</p>
            ${timeDisplay}
            <p class="text-sm text-gray-500 mt-1">Raison: ${data.reason}</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
            ${statusBadge}
            <button data-id="${id}" data-action="approved" class="action-btn bg-green-500 hover:bg-green-600 text-white font-bold px-3 py-1 rounded ${data.status === 'approved' ? 'hidden' : ''}">Approuver</button>
            <button data-id="${id}" data-action="refused" class="action-btn bg-red-500 hover:bg-red-600 text-white font-bold px-3 py-1 rounded ${data.status === 'refused' ? 'hidden' : ''}">Refuser</button>
            <button data-id="${id}" data-action="delete" class="action-btn bg-gray-600 hover:bg-gray-700 text-white font-bold px-3 py-1 rounded">Supprimer</button>
        </div>
    `;
    return el;
}

async function updatePlanningWithLeave(leaveData, newStatus) {
    const batch = writeBatch(db);
    const planningRef = collection(db, "planning");

    const startDate = new Date(leaveData.startDate + 'T00:00:00');
    const endDate = new Date(leaveData.endDate + 'T00:00:00');

    const q = query(planningRef,
        where("teamNames", "array-contains", leaveData.userName),
        where("date", ">=", leaveData.startDate),
        where("date", "<=", leaveData.endDate),
        where("isLeave", "==", true)
    );
    const existingLeaveEntries = await getDocs(q);
    existingLeaveEntries.forEach(doc => batch.delete(doc.ref));

    if (newStatus === 'approved') {
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            // CORRECTION APPLIQUÉE ICI
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const dateString = `${year}-${month}-${day}`;
            
            const newPlanningEntryRef = doc(planningRef);
            batch.set(newPlanningEntryRef, {
                chantierName: `Congé (${leaveData.reason})`,
                teamNames: [leaveData.userName],
                date: dateString,
                isLeave: true,
                order: 99,
                createdAt: serverTimestamp()
            });
        }
    }

    await batch.commit();
}

async function handleAdminAction(e) {
    const button = e.target.closest('.action-btn');
    if (!button) return;

    const action = button.dataset.action;
    const docId = button.dataset.id;
    
    const leaveDoc = await getDocs(query(collection(db, "leaveRequests"), where("__name__", "==", docId)));
    if (leaveDoc.empty) {
        showInfoModal("Erreur", "Demande de congé non trouvée.");
        return;
    }
    const leaveData = leaveDoc.docs[0].data();
    const docRef = doc(db, "leaveRequests", docId);

    // MODIFIÉ : Ajout de la logique de suppression
    if (action === 'delete') {
        const confirmed = await showConfirmationModal("Confirmation", `Voulez-vous vraiment supprimer la demande de ${leaveData.userName} ? Cette action est irréversible.`);
        if (confirmed) {
            try {
                // On nettoie le planning au cas où le congé était approuvé
                if (leaveData.status === 'approved') {
                    await updatePlanningWithLeave(leaveData, 'deleted'); // 'deleted' va juste nettoyer
                }
                await deleteDoc(docRef);
                loadAllRequests();
            } catch (error) {
                console.error("Erreur de suppression:", error);
                showInfoModal("Erreur", "La suppression a échoué.");
            }
        }
    } else { // Logique pour Approuver/Refuser
        try {
            if (leaveData.status !== action) {
                await Promise.all([
                    updateDoc(docRef, { status: action }),
                    updatePlanningWithLeave(leaveData, action)
                ]);
            }
            loadAllRequests();
        } catch (error) {
            console.error("Erreur de mise à jour du statut:", error);
            showInfoModal("Erreur", "La mise à jour a échoué.");
        }
    }
}