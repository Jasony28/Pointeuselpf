import { collection, query, getDocs, addDoc, serverTimestamp, orderBy, doc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, currentUser, pageContent, showInfoModal, showConfirmationModal } from "../app.js";
import { getWeekDateRange } from "./utils.js";

let currentWeekOffset = 0;
let leaveRequestsCache = [];
const CUSTOM_REASON_MAX_LENGTH = 100;

export async function render() {
    pageContent.innerHTML = `
        <div class="max-w-4xl mx-auto space-y-6">
            <div>
                <h2 class="text-2xl font-bold">📅 Congés de l'Équipe</h2>
                <p style="color: var(--color-text-muted);">Consultez les congés de l'équipe et soumettez vos propres demandes.</p>
            </div>
            
            <div class="p-6 rounded-lg shadow-sm" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                <h3 class="text-xl font-semibold mb-4">Nouvelle demande de congé</h3>
                <form id="leaveRequestForm" class="space-y-4">
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label for="leave-start-date" class="text-sm font-medium">Date de début</label>
                            <input type="date" id="leave-start-date" class="w-full border p-2 rounded mt-1" style="background-color: var(--color-background); border-color: var(--color-border);" required>
                        </div>
                        <div>
                            <label for="leave-end-date" class="text-sm font-medium">Date de fin</label>
                            <input type="date" id="leave-end-date" class="w-full border p-2 rounded mt-1" style="background-color: var(--color-background); border-color: var(--color-border);">
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <input type="checkbox" id="single-day-leave" class="h-4 w-4 rounded">
                        <label for="single-day-leave" class="text-sm">Absence d'une seule journée</label>
                    </div>
                    <div>
                        <label for="leave-reason" class="text-sm font-medium">Raison</label>
                        <select id="leave-reason" class="w-full border p-2 rounded mt-1" style="background-color: var(--color-background); border-color: var(--color-border);" required>
                            <option value="Vacances">Vacances</option>
                            <option value="Médical">Médical</option>
                            <option value="Familial">Familial</option>
                            <option value="Autre">Autre (préciser)</option>
                        </select>
                    </div>
                    <div id="custom-reason-container" class="hidden">
                        <label for="leave-reason-custom" class="text-sm font-medium">Précisez la raison</label>
                        <textarea id="leave-reason-custom" class="w-full border p-2 rounded mt-1" style="background-color: var(--color-background); border-color: var(--color-border);" rows="2"></textarea>
                        <div class="text-right text-sm" style="color: var(--color-text-muted);">
                           <span id="char-counter">0</span> / ${CUSTOM_REASON_MAX_LENGTH}
                        </div>
                    </div>
                    <div id="leave-times-container" class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label for="leave-start-time" class="text-sm font-medium">Heure de début (optionnel)</label>
                            <input type="time" id="leave-start-time" class="w-full border p-2 rounded mt-1" style="background-color: var(--color-background); border-color: var(--color-border);">
                        </div>
                        <div>
                            <label for="leave-end-time" class="text-sm font-medium">Heure de fin (optionnel)</label>
                            <input type="time" id="leave-end-time" class="w-full border p-2 rounded mt-1" style="background-color: var(--color-background); border-color: var(--color-border);">
                        </div>
                    </div>
                    <div class="text-right pt-2">
                        <button type="submit" class="text-white font-bold px-6 py-2 rounded" style="background-color: var(--color-primary);">
                            Envoyer la demande
                        </button>
                    </div>
                </form>
            </div>

            <div class="p-6 rounded-lg shadow-sm" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                <div class="flex justify-between items-center mb-4">
                    <button id="prevWeekBtn" class="px-4 py-2 rounded-lg" style="background-color: var(--color-background);">&lt;</button>
                    <h3 id="list-title" class="text-xl font-semibold text-center"></h3>
                    <button id="nextWeekBtn" class="px-4 py-2 rounded-lg" style="background-color: var(--color-background);">&gt;</button>
                </div>
                <div id="leave-list-container" class="space-y-4"></div>
            </div>
        </div>
    `;
    setTimeout(() => {
        setMinimumLeaveDate();
        setupEventListeners();
        loadAllRequestsAndDisplayList();
    }, 0);
}

function setMinimumLeaveDate() {
    const today = new Date();
    today.setDate(today.getDate() + 7); 
    const minDateString = today.toISOString().split('T')[0];
    document.getElementById('leave-start-date').min = minDateString;
    document.getElementById('leave-end-date').min = minDateString;
}

function setupEventListeners() {
    document.getElementById('prevWeekBtn').onclick = () => { currentWeekOffset--; displayLeaveList(); };
    document.getElementById('nextWeekBtn').onclick = () => { currentWeekOffset++; displayLeaveList(); };
    document.getElementById('leaveRequestForm').onsubmit = submitLeaveRequest;

    const startDateInput = document.getElementById('leave-start-date');
    const endDateInput = document.getElementById('leave-end-date');
    const singleDayCheckbox = document.getElementById('single-day-leave');

    singleDayCheckbox.addEventListener('change', () => {
        if (singleDayCheckbox.checked) {
            endDateInput.value = startDateInput.value;
            endDateInput.disabled = true;
        } else {
            endDateInput.disabled = false;
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

    document.getElementById('leave-list-container').addEventListener('click', async (e) => {
        if (e.target.classList.contains('cancel-leave-btn')) {
            const docId = e.target.dataset.id;
            const confirmed = await showConfirmationModal("Confirmation", "Êtes-vous sûr de vouloir annuler cette demande de congé ?");
            if (confirmed) {
                try {
                    await deleteDoc(doc(db, "leaveRequests", docId));
                    showInfoModal("Succès", "La demande a été annulée.");
                    loadAllRequestsAndDisplayList(); // Recharger la liste
                } catch (error) {
                    showInfoModal("Erreur", "Impossible d'annuler la demande.");
                }
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
        listContainer.innerHTML = `<p class="text-center py-4" style="color: var(--color-text-muted);">Aucun congé cette semaine.</p>`;
        return;
    }

    sortedDays.forEach(dateString => {
        const dayEntries = groupedByDay[dateString];
        const dayDate = new Date(dateString + 'T12:00:00');
        const dayWrapper = document.createElement('div');
        dayWrapper.innerHTML = `<div class="border-b pb-2 mb-3"><h3 class="font-bold text-lg">${dayDate.toLocaleDateString('fr-FR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' })}</h3></div>`;
        
        const entriesContainer = document.createElement('div');
        entriesContainer.className = 'space-y-3';

        dayEntries.forEach(entry => {
            let statusStyle = '', statusIcon = '', statusText = '';
            
            if (entry.status === 'approved') {
                statusStyle = 'background-color: rgba(22, 163, 74, 0.1); border-color: rgba(22, 163, 74, 0.4);';
                statusText = 'Accepté';
            } else if (entry.status === 'refused') {
                statusStyle = 'background-color: rgba(220, 38, 38, 0.1); border-color: rgba(220, 38, 38, 0.4);';
                statusText = 'Refusé';
            } else if (entry.status === 'pending' && entry.userId === currentUser.uid) {
                statusStyle = 'background-color: rgba(59, 130, 246, 0.1); border-color: rgba(59, 130, 246, 0.4);';
                statusText = 'En attente';
                statusIcon = `<button class="cancel-leave-btn text-red-500 hover:text-red-700 text-xs font-bold" data-id="${entry.id}">ANNULER</button>`;
            } else {
                return; // Ne pas afficher les demandes en attente des autres
            }
            
            const card = document.createElement('div');
            card.className = `p-3 border rounded-lg flex justify-between items-center`;
            card.style.cssText = statusStyle;
            card.innerHTML = `
                <div>
                    <p class="font-bold" style="color: var(--color-text-base);">${entry.userName}</p>
                    <p class="text-sm" style="color: var(--color-text-muted);">${entry.reason}</p>
                </div>
                <div class="text-right">
                    <span class="font-bold text-sm">${statusText}</span>
                    ${statusIcon}
                </div>
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
    submitButton.disabled = true;
    submitButton.textContent = "Vérification...";

    const startDate = document.getElementById('leave-start-date').value;
    const isSingleDay = document.getElementById('single-day-leave').checked;
    const endDate = isSingleDay ? startDate : document.getElementById('leave-end-date').value || startDate;
    let reason = document.getElementById('leave-reason').value;
    const customReason = document.getElementById('leave-reason-custom').value;
    const startTime = document.getElementById('leave-start-time').value;
    const endTime = document.getElementById('leave-end-time').value;

    // --- VALIDATIONS ---
    if (customReason.length > CUSTOM_REASON_MAX_LENGTH) {
        showInfoModal("Erreur", `La raison personnalisée ne doit pas dépasser ${CUSTOM_REASON_MAX_LENGTH} caractères.`);
        submitButton.disabled = false; submitButton.textContent = "Envoyer la demande"; return;
    }
    if (new Date(endDate) < new Date(startDate)) {
        showInfoModal("Attention", "La date de fin ne peut pas être antérieure à la date de début.");
        submitButton.disabled = false; submitButton.textContent = "Envoyer la demande"; return;
    }
    if (reason === 'Autre') {
        if (!customReason.trim()) {
            showInfoModal("Attention", "Veuillez préciser la raison pour votre demande 'Autre'.");
            submitButton.disabled = false; submitButton.textContent = "Envoyer la demande"; return;
        }
        reason = customReason.trim();
    }
    // --- FIN VALIDATIONS ---

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
    let summary = `Motif : **${reason}**\nDu **${new Date(startDate+'T12:00:00').toLocaleDateString('fr-FR')}** au **${new Date(endDate+'T12:00:00').toLocaleDateString('fr-FR')}**`;
    if(startTime && endTime) summary += `\nDe **${startTime}** à **${endTime}**`;
    
    const confirmed = await showConfirmationModal("Récapitulatif", summary);
    if (!confirmed) {
        submitButton.disabled = false; submitButton.textContent = "Envoyer la demande"; return;
    }
    // --- FIN CONFIRMATION ---

    submitButton.textContent = "Envoi en cours...";
    try {
        await addDoc(collection(db, "leaveRequests"), requestData);
        showInfoModal("Succès", "Votre demande de congé a bien été envoyée.");
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