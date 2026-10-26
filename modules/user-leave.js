import { collection, query, where, getDocs, addDoc, serverTimestamp, orderBy, doc, deleteDoc, updateDoc, writeBatch, getDoc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, currentUser, pageContent, showInfoModal, showConfirmationModal } from "../app.js";
import { getWeekDateRange } from "./utils.js";

let currentWeekOffset = 0;
let leaveRequestsCache = [];
const CUSTOM_REASON_MAX_LENGTH = 100;

export async function render() {
    pageContent.innerHTML = `
        <div class="max-w-5xl mx-auto space-y-8">
            <div class="mb-6">
                <h2 class="text-3xl font-black tracking-tight">Mes Congés</h2>
                <p class="text-lg mt-1" style="color: var(--color-text-muted);">Demandez un congé et consultez le planning de l'équipe.</p>
            </div>
            
            <!-- FORMULAIRE DE DEMANDE -->
            <div class="p-6 md:p-8 rounded-xl shadow-sm border" style="background-color: var(--color-surface); border-color: var(--color-border);">
                <h3 class="text-xl font-bold mb-5">Nouvelle demande</h3>

                <form id="leaveRequestForm" class="space-y-6 relative z-10">
                    
                    <div class="leave-info">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/></svg>
                        <p>Les demandes de congés doivent être soumises <strong>au moins 7 jours à l'avance</strong>. Une fois approuvée, la demande s'affichera automatiquement dans le planning officiel.</p>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div class="space-y-4">
                            <div>
                                <label for="leave-start-date" class="text-sm font-bold uppercase tracking-wider mb-1 block" style="color: var(--color-text-muted);">Date de début</label>
                                <input type="date" id="leave-start-date" class="w-full border-2 p-3 rounded-lg font-semibold" style="background-color: var(--color-background); border-color: var(--color-border);" required>
                            </div>
                            <div>
                                <label for="leave-end-date" class="text-sm font-bold uppercase tracking-wider mb-1 block" style="color: var(--color-text-muted);">Date de fin</label>
                                <input type="date" id="leave-end-date" class="w-full border-2 p-3 rounded-lg font-semibold" style="background-color: var(--color-background); border-color: var(--color-border);">
                            </div>
                            <div class="flex items-center gap-3 p-3 rounded-lg border" style="background-color: var(--color-background); border-color: var(--color-border);">
                                <input type="checkbox" id="single-day-leave" class="h-5 w-5 rounded text-primary border-gray-300">
                                <label for="single-day-leave" class="text-sm font-bold cursor-pointer select-none">Absence d'une seule journée</label>
                            </div>
                        </div>

                        <div class="space-y-4">
                            <div>
                                <label for="leave-reason" class="text-sm font-bold uppercase tracking-wider mb-1 block" style="color: var(--color-text-muted);">Motif de l'absence</label>
                                <select id="leave-reason" class="w-full border-2 p-3 rounded-lg font-semibold cursor-pointer" style="background-color: var(--color-background); border-color: var(--color-border);" required>
                                    <option value="" disabled selected>-- Sélectionnez un motif --</option>
                                    <option value="Vacances">Vacances / Congé payé</option>
                                    <option value="Médical">Raison médicale</option>
                                    <option value="Familial">Événement familial</option>
                                    <option value="Autre">Autre (préciser)</option>
                                </select>
                            </div>
                            <div id="custom-reason-container" class="hidden">
                                <label for="leave-reason-custom" class="text-sm font-bold uppercase tracking-wider mb-1 block" style="color: var(--color-text-muted);">Précisez la raison</label>
                                <textarea id="leave-reason-custom" class="w-full border-2 p-3 rounded-lg" style="background-color: var(--color-background); border-color: var(--color-border);" rows="2"></textarea>
                                <div class="text-right text-xs font-bold mt-1" style="color: var(--color-text-muted);">
                                   <span id="char-counter">0</span> / ${CUSTOM_REASON_MAX_LENGTH} max
                                </div>
                            </div>

                            <div id="leave-times-container" class="grid grid-cols-2 gap-4 p-3 rounded-lg border bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                                <div>
                                    <label for="leave-start-time" class="text-xs font-bold uppercase mb-1 block">Heure début (opt.)</label>
                                    <input type="time" id="leave-start-time" class="w-full border p-2 rounded" style="background-color: var(--color-surface); border-color: var(--color-border);">
                                </div>
                                <div>
                                    <label for="leave-end-time" class="text-xs font-bold uppercase mb-1 block">Heure fin (opt.)</label>
                                    <input type="time" id="leave-end-time" class="w-full border p-2 rounded" style="background-color: var(--color-surface); border-color: var(--color-border);">
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="text-right pt-6 border-t" style="border-color: var(--color-border);">
                        <button type="submit" class="btn btn-primary btn-lg w-full md:w-auto">Envoyer la demande</button>
                    </div>
                </form>
            </div>

            <!-- PLANNING DES CONGÉS DE L'ÉQUIPE -->
            <div class="p-6 rounded-xl shadow-sm border" style="background-color: var(--color-surface); border-color: var(--color-border);">
                <h3 class="text-xl font-bold mb-3">Congés de l'équipe</h3>
                <div class="flex justify-between items-center gap-2 mb-5">
                    <button id="prevWeekBtn" class="nav-arrow" aria-label="Semaine précédente"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;"><path d="m15 18-6-6 6-6"/></svg></button>
                    <p id="list-title" class="font-semibold text-center"></p>
                    <button id="nextWeekBtn" class="nav-arrow" aria-label="Semaine suivante"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;"><path d="m9 18 6-6-6-6"/></svg></button>
                </div>
                <div id="leave-list-container" class="space-y-6"></div>
            </div>
        </div>
    `;
    setTimeout(() => {
        setMinimumLeaveDate();
        setupEventListeners();
        loadAllRequestsAndDisplayList();
    }, 0);
}

// --- LE MOTEUR DES 7 JOURS POUR TOUT LE MONDE (ADMIN INCLUS) ---
function setMinimumLeaveDate() {
    const today = new Date();
    // On ajoute 7 jours pleins
    today.setDate(today.getDate() + 7); 
    const minDateString = today.toISOString().split('T')[0];
    
    // On bloque les calendriers HTML
    document.getElementById('leave-start-date').min = minDateString;
    document.getElementById('leave-end-date').min = minDateString;
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

    if (!existingBatch) {
        await batch.commit();
    }
}

function setupEventListeners() {
    document.getElementById('prevWeekBtn').addEventListener('click', () => { 
        currentWeekOffset--; 
        displayLeaveList(); 
    });
    document.getElementById('nextWeekBtn').addEventListener('click', () => { 
        currentWeekOffset++; 
        displayLeaveList(); 
    });
    document.getElementById('leaveRequestForm').addEventListener('submit', submitLeaveRequest);

    const startDateInput = document.getElementById('leave-start-date');
    const endDateInput = document.getElementById('leave-end-date');
    const singleDayCheckbox = document.getElementById('single-day-leave');

    singleDayCheckbox.addEventListener('change', () => {
        if (singleDayCheckbox.checked) {
            endDateInput.value = startDateInput.value;
            endDateInput.disabled = true;
            endDateInput.classList.add('opacity-50');
        } else {
            endDateInput.disabled = false;
            endDateInput.classList.remove('opacity-50');
        }
    });
    
    startDateInput.addEventListener('change', () => {
        if (singleDayCheckbox.checked) {
            endDateInput.value = startDateInput.value;
        }
    });

    const reasonSelect = document.getElementById('leave-reason');
    const customReasonContainer = document.getElementById('custom-reason-container');
    const customReasonInput = document.getElementById('leave-reason-custom');
    
    reasonSelect.addEventListener('change', (e) => {
        if (e.target.value === 'Autre') {
            customReasonContainer.classList.remove('hidden');
            customReasonInput.required = true;
        } else {
            customReasonContainer.classList.add('hidden');
            customReasonInput.required = false;
            customReasonInput.value = '';
        }
    });

    const charCounter = document.getElementById('char-counter');
    customReasonInput.addEventListener('input', () => {
        const count = customReasonInput.value.length;
        charCounter.textContent = count;
        charCounter.style.color = count > CUSTOM_REASON_MAX_LENGTH ? 'red' : 'var(--color-text-muted)';
    });

    // Bouton Annuler
    document.getElementById('leave-list-container').addEventListener('click', async (e) => {
        const button = e.target.closest('.cancel-leave-btn');
        if (!button) return;

        const docId = button.dataset.id;
        const leaveDocRef = doc(db, "leaveRequests", docId);
        let leaveData;
        try {
            const leaveDocSnap = await getDoc(leaveDocRef);
            if (!leaveDocSnap.exists()) return;
            leaveData = leaveDocSnap.data();
        } catch (error) { return; }

        const confirmed = await showConfirmationModal("Annulation", "Êtes-vous sûr de vouloir annuler cette demande ? (Elle disparaîtra du planning officiel)");
        if (confirmed) {
            try {
                const batch = writeBatch(db);
                batch.delete(leaveDocRef);
                await updatePlanningOnLeaveChange(docId, leaveData, 'deleted', batch);
                await batch.commit();
                
                showInfoModal("Succès", "Demande annulée avec succès.");
                loadAllRequestsAndDisplayList();
            } catch (error) {
                showInfoModal("Erreur", "Impossible d'annuler la demande.");
            }
        }
    });
}

async function loadAllRequestsAndDisplayList() {
    try {
        const q = query(collection(db, "leaveRequests"), orderBy("startDate", "desc"));
        const snapshot = await getDocs(q);
        leaveRequestsCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        displayLeaveList();
    } catch (error) { console.error("Erreur de chargement des congés:", error); }
}

function displayLeaveList() {
    const listContainer = document.getElementById('leave-list-container');
    const listTitle = document.getElementById('list-title');
    listContainer.innerHTML = '';

    const { startOfWeek, endOfWeek } = getWeekDateRange(currentWeekOffset);
    listTitle.textContent = `Semaine du ${startOfWeek.toLocaleDateString('fr-FR', {day: 'numeric', month: 'long'})}`;

    const dailyEntries = [];
    leaveRequestsCache.forEach(req => {
        const start = new Date(req.startDate + 'T12:00:00Z');
        const end = new Date((req.endDate || req.startDate) + 'T12:00:00Z');
        let loopDate = new Date(start);
        while (loopDate <= end) {
            if (loopDate >= startOfWeek && loopDate <= endOfWeek) {
                dailyEntries.push({ date: new Date(loopDate), ...req });
            }
            loopDate.setUTCDate(loopDate.getUTCDate() + 1); 
        }
    });
    
    const groupedByDay = dailyEntries.reduce((acc, entry) => {
        const dateString = entry.date.toISOString().split('T')[0];
        if (!acc[dateString]) acc[dateString] = [];
        acc[dateString].push(entry);
        return acc;
    }, {});
    
    const sortedDays = Object.keys(groupedByDay).sort();

    if (sortedDays.length === 0) {
        listContainer.innerHTML = `
            <p class="hours-empty">Aucun congé prévu cette semaine-là.</p>`;
        return;
    }

    sortedDays.forEach(dateString => {
        const dayEntries = groupedByDay[dateString];
        const dayDate = new Date(dateString + 'T12:00:00Z');
        const dayWrapper = document.createElement('div');
        dayWrapper.className = "leave-day";
        dayWrapper.innerHTML = `
            <h4 class="leave-day-title">${dayDate.toLocaleDateString('fr-FR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' })}</h4>`;
        
        const entriesContainer = document.createElement('div');
        entriesContainer.className = 'grid grid-cols-1 md:grid-cols-2 gap-3';

        dayEntries.forEach(entry => {
            if (entry.status === 'pending' && entry.userId !== currentUser.uid && currentUser.role !== 'admin') {
                return;
            }

            let statusStyle = '', statusText = '', actionHtml = '';
            
            if (entry.status === 'approved') {
                statusStyle = 'is-approved';
                statusText = '<span class="leave-status is-approved">Approuvé</span>';
                if (entry.userId === currentUser.uid || currentUser.role === 'admin') {
                    actionHtml = `<button class="cancel-leave-btn leave-action" data-id="${entry.id}">Annuler ce congé</button>`;
                }
            } else if (entry.status === 'refused') {
                statusStyle = 'is-refused';
                statusText = '<span class="leave-status is-refused">Refusé</span>';
            } else if (entry.status === 'pending') {
                statusStyle = 'is-pending';
                statusText = '<span class="leave-status is-pending">En attente</span>';
                if (entry.userId === currentUser.uid) {
                    actionHtml = `<button class="cancel-leave-btn leave-action" data-id="${entry.id}">Annuler ma demande</button>`;
                }
            }

            // --- FILTRE DE CONFIDENTIALITÉ ---
            let reasonText = "";
            if (currentUser.role === 'admin' || entry.userId === currentUser.uid) {
                // L'admin ou le propriétaire voit la vraie raison
                reasonText = entry.reason;
            } else {
                // Les autres collègues voient juste "Absent(e)"
                reasonText = "Absent(e)";
            }

            // On ajoute quand même les heures si c'est une absence partielle
            if (entry.startTime && entry.endTime) {
                reasonText += ` <span class="leave-hours">de ${entry.startTime} à ${entry.endTime}</span>`;
            }
            // ---------------------------------
            
            const card = document.createElement('div');
            card.className = `leave-card ${statusStyle}`;
            card.innerHTML = `
                <div class="leave-card-head">
                    <p class="leave-card-name">${entry.userName}</p>
                    ${statusText}
                </div>
                <p class="leave-card-reason">${reasonText}</p>
                ${actionHtml}
            `;
            entriesContainer.appendChild(card);
        });

        if (entriesContainer.children.length > 0) {
            dayWrapper.appendChild(entriesContainer);
            listContainer.appendChild(dayWrapper);
        }
    });
}

async function submitLeaveRequest(e) {
    e.preventDefault();
    const form = e.target;
    const submitButton = form.querySelector('button[type="submit"]');
    
    const startDate = document.getElementById('leave-start-date').value;
    const isSingleDay = document.getElementById('single-day-leave').checked;
    const endDate = isSingleDay ? startDate : document.getElementById('leave-end-date').value || startDate;
    let reason = document.getElementById('leave-reason').value;
    const customReason = document.getElementById('leave-reason-custom').value;
    const startTime = document.getElementById('leave-start-time').value;
    const endTime = document.getElementById('leave-end-time').value;

    // --- SÉCURITÉ : VÉRIFICATION STRICTE DES 7 JOURS EN JAVASCRIPT ---
    const today = new Date();
    today.setHours(0,0,0,0); 
    const limitDate = new Date(today);
    limitDate.setDate(limitDate.getDate() + 7);
    
    const requestedStart = new Date(startDate + 'T00:00:00');
    
    if (requestedStart < limitDate) {
        showInfoModal("Opération impossible", "Rappel : Toute demande de congé doit être effectuée au strict minimum 7 jours à l'avance.");
        submitButton.disabled = false; 
        submitButton.textContent = "Envoyer la demande"; 
        return; 
    }

    // --- VALIDATIONS ---
    if (customReason.length > CUSTOM_REASON_MAX_LENGTH) {
        showInfoModal("Erreur", `La raison ne doit pas dépasser ${CUSTOM_REASON_MAX_LENGTH} caractères.`);
        return;
    }
    if (new Date(endDate) < new Date(startDate)) {
        showInfoModal("Attention", "La date de fin ne peut pas être avant le début.");
        return;
    }
    if (reason === 'Autre') {
        if (!customReason.trim()) {
            showInfoModal("Attention", "Veuillez préciser la raison.");
            return;
        }
        reason = customReason.trim();
    }

    submitButton.disabled = true;
    submitButton.textContent = "Vérification...";

    const requestData = {
        userId: currentUser.uid, userName: currentUser.displayName,
        startDate, endDate, reason, status: 'pending',
        requestedAt: serverTimestamp()
    };
    if (startTime && endTime) {
        requestData.startTime = startTime;
        requestData.endTime = endTime;
    }
    
    // --- CONFIRMATION ---
    const options = { timeZone: 'UTC', day: 'numeric', month: 'long' };
    let summary = `Motif : **${reason}**\nDu **${new Date(startDate+'T12:00:00Z').toLocaleDateString('fr-FR', options)}** au **${new Date(endDate+'T12:00:00Z').toLocaleDateString('fr-FR', options)}**`;
    if(startTime && endTime) summary += `\nDe **${startTime}** à **${endTime}**`;
    
    const confirmed = await showConfirmationModal("Récapitulatif", summary);
    if (!confirmed) {
        submitButton.disabled = false; submitButton.textContent = "Envoyer la demande"; return;
    }

    submitButton.textContent = "Envoi en cours...";
    try {
        await addDoc(collection(db, "leaveRequests"), requestData);
        showInfoModal("Succès", "Votre demande a été envoyée au bureau. Vous serez averti(e) de son statut.");
        form.reset();
        document.getElementById('single-day-leave').dispatchEvent(new Event('change'));
        document.getElementById('leave-reason').dispatchEvent(new Event('change'));
        loadAllRequestsAndDisplayList();
    } catch (error) {
        showInfoModal("Erreur", "L'envoi de la demande a échoué.");
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Envoyer la demande";
    }
}