import { collection, query, orderBy, getDocs, doc, writeBatch, where, serverTimestamp, getDoc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent, showInfoModal, showConfirmationModal } from "../app.js";

export async function render() {
    pageContent.innerHTML = `
        <div class="max-w-6xl mx-auto space-y-6">
            <div class="mb-8">
                <h2 class="text-3xl font-black tracking-tight" style="color: var(--color-text-base);">Validation des Congés</h2>
                <p class="text-lg mt-1" style="color: var(--color-text-muted);">Gérez les demandes de votre équipe en un coup d'œil.</p>
            </div>
            
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <!-- COLONNE 1 : EN ATTENTE -->
                <div class="flex flex-col h-full">
                    <h3 class="text-xl font-bold mb-4 flex items-center gap-2" style="color: var(--color-text-base);">
                        Demandes à traiter
                    </h3>
                    <div id="pending-requests-list" class="space-y-4 flex-grow p-4 rounded-xl shadow-sm border" style="background-color: var(--color-surface); border-color: var(--color-border);">
                        <p class="text-center py-4" style="color: var(--color-text-muted);">Chargement...</p>
                    </div>
                </div>

                <!-- COLONNE 2 : HISTORIQUE -->
                <div class="flex flex-col h-full">
                    <h3 class="text-xl font-bold mb-4 flex items-center gap-2" style="color: var(--color-text-base);">
                        Historique récent
                    </h3>
                    <div id="processed-requests-list" class="space-y-4 flex-grow p-4 rounded-xl shadow-sm border opacity-90" style="background-color: var(--color-surface); border-color: var(--color-border);">
                        <p class="text-center py-4" style="color: var(--color-text-muted);">Chargement...</p>
                    </div>
                </div>
            </div>
        </div>
    `;
    // Un seul écouteur par liste : les rechargements de la liste n'en ajoutent pas d'autres
    document.getElementById('pending-requests-list').addEventListener('click', handleAdminAction);
    document.getElementById('processed-requests-list').addEventListener('click', handleAdminAction);
    setTimeout(loadAllRequests, 0);
}

async function loadAllRequests() {
    const pendingContainer = document.getElementById('pending-requests-list');
    const processedContainer = document.getElementById('processed-requests-list');
    
    try {
        const q = query(collection(db, "leaveRequests"), orderBy("startDate", "desc"));
        const snapshot = await getDocs(q);

        pendingContainer.innerHTML = '';
        processedContainer.innerHTML = '';

        if (snapshot.empty) {
            pendingContainer.innerHTML = '<p class="hours-empty">Aucune demande en attente.</p>';
            processedContainer.innerHTML = '<p class="hours-empty">Aucun historique.</p>';
            return;
        }

        const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        let pendingCount = 0;
        let processedCount = 0;

        requests.forEach(data => {
            const el = createRequestElement(data.id, data);
            if (data.status === 'pending') {
                pendingContainer.appendChild(el);
                pendingCount++;
            } else {
                processedContainer.appendChild(el);
                processedCount++;
            }
        });

        if (pendingCount === 0) pendingContainer.innerHTML = '<div class="text-center py-8"><p class="font-bold mt-2" style="color: var(--color-success);">Tout est à jour !</p><p class="text-sm" style="color: var(--color-text-muted);">Aucune demande en attente.</p></div>';
        if (processedCount === 0) processedContainer.innerHTML = '<p class="hours-empty">Aucun historique.</p>';

        
    } catch (error) {
        console.error("Erreur de chargement des demandes:", error);
        pendingContainer.innerHTML = '<p class="hours-empty">Erreur de chargement.</p>';
    }
}

function createRequestElement(id, data) {
    const el = document.createElement('div');
    el.className = 'p-5 border rounded-xl flex flex-col gap-3 transition-shadow hover:shadow-md';
    el.style.backgroundColor = 'var(--color-background)';
    el.style.borderColor = 'var(--color-border)';
    
    const startDate = new Date(data.startDate + 'T12:00:00Z');
    const endDate = new Date((data.endDate || data.startDate) + 'T12:00:00Z');
    const options = { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' };

    let dateDisplay;
    if (startDate.getTime() === endDate.getTime()) {
        dateDisplay = startDate.toLocaleDateString('fr-FR', { weekday: 'long', ...options });
    } else {
        dateDisplay = `Du ${startDate.toLocaleDateString('fr-FR', options)}<br>Au ${endDate.toLocaleDateString('fr-FR', options)}`;
    }

    let statusBadge = '';
    let actionButtons = '';

    if (data.status === 'approved') {
        statusBadge = '<span class="leave-status is-approved">Approuvé</span>';
        actionButtons = `<button data-id="${id}" data-action="delete" class="action-btn leave-action">Supprimer l'archive</button>`;
    } else if (data.status === 'refused') {
        statusBadge = '<span class="leave-status is-refused">Refusé</span>';
        actionButtons = `<button data-id="${id}" data-action="delete" class="action-btn leave-action">Supprimer l'archive</button>`;
    } else {
        statusBadge = '<span class="leave-status is-pending">En attente</span>';
        actionButtons = `
            <div class="flex gap-2 w-full mt-2 pt-3 border-t" style="border-color: var(--color-border);">
                <button data-id="${id}" data-action="refused" class="action-btn btn btn-secondary flex-1">Refuser</button>
                <button data-id="${id}" data-action="approved" class="action-btn btn btn-primary flex-1">Accepter</button>
            </div>
        `;
    }

    el.innerHTML = `
        <div class="flex justify-between items-start">
            <div>
                <p class="font-black text-lg" style="color: var(--color-text-base);">${data.userName}</p>
                <p class="text-sm font-semibold mt-1" style="color: var(--color-primary);">${dateDisplay}</p>
            </div>
            <div>${statusBadge}</div>
        </div>
        <div class="p-3 rounded-lg text-sm" style="background-color: var(--color-surface-2); border: 1px solid var(--color-border);">
            <span class="kpi-label">Motif</span><br>
            <span style="color: var(--color-text-base);">${data.reason}</span>
            ${data.startTime ? `<br><span class="leave-hours mt-1">de ${data.startTime} à ${data.endTime}</span>` : ''}
        </div>
        ${actionButtons}
    `;
    return el;
}

async function updatePlanningOnLeaveChange(docId, leaveData, newStatus, existingBatch = null) {
    const batch = existingBatch || writeBatch(db);
    const planningRef = collection(db, "planning");

    const q = query(planningRef, where("id_leaveRequest", "==", docId));
    const existingEntries = await getDocs(q);
    existingEntries.forEach(doc => batch.delete(doc.ref));

    if (newStatus === 'approved') {
        const startDate = new Date(leaveData.startDate + 'T12:00:00Z');
        const endDate = new Date((leaveData.endDate || leaveData.startDate) + 'T12:00:00Z');
        const chantierName = `Congé (${leaveData.reason})`;

        for (let d = new Date(startDate); d <= endDate; d.setUTCDate(d.getUTCDate() + 1)) {
            const dateString = d.toISOString().split('T')[0];
            const newPlanningRef = doc(planningRef);
            const planningData = {
                chantierId: "LEAVE_ID",
                chantierName: chantierName,
                teamNames: [leaveData.userName],
                date: dateString,
                startTime: leaveData.startTime || "",
                notes: `Congé approuvé: ${leaveData.reason}`,
                order: 0,
                createdAt: serverTimestamp(),
                id_leaveRequest: docId
            };
            batch.set(newPlanningRef, planningData);
        }
    }
    if (!existingBatch) await batch.commit();
}

async function handleAdminAction(e) {
    const button = e.target.closest('.action-btn');
    if (!button) return;

    const action = button.dataset.action;
    const docId = button.dataset.id;
    
    const leaveDocRef = doc(db, "leaveRequests", docId);
    const leaveDocSnap = await getDoc(leaveDocRef);

    if (!leaveDocSnap.exists()) {
        showInfoModal("Erreur", "Demande de congé non trouvée.");
        loadAllRequests(); 
        return;
    }
    const leaveData = leaveDocSnap.data();

    if (action === 'delete') {
        const confirmed = await showConfirmationModal("Confirmation", `Voulez-vous vraiment supprimer l'archive de ${leaveData.userName} ?`);
        if (confirmed) {
            try {
                const batch = writeBatch(db);
                batch.delete(leaveDocRef);
                await updatePlanningOnLeaveChange(docId, leaveData, 'deleted', batch);
                await batch.commit();
                loadAllRequests();
            } catch (error) {
                showInfoModal("Erreur", "La suppression a échoué.");
            }
        }
    } else { 
        if (leaveData.status === action) return;
        
        button.disabled = true;
        button.textContent = "Traitement...";

        try {
            const batch = writeBatch(db);
            batch.update(leaveDocRef, { status: action });
            await updatePlanningOnLeaveChange(docId, leaveData, action, batch);
            await batch.commit();
            loadAllRequests();
        } catch (error) {
            showInfoModal("Erreur", "La mise à jour a échoué.");
            button.disabled = false;
        }
    }
}