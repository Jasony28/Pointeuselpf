import { collection, query, getDocs, addDoc, serverTimestamp, orderBy } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, currentUser, pageContent, showInfoModal } from "../app.js";
import { getWeekDateRange } from "./utils.js";

// MODIFIÉ : On revient à un offset de semaine
let currentWeekOffset = 0;
let leaveRequestsCache = [];

export async function render() {
    pageContent.innerHTML = `
        <div class="max-w-4xl mx-auto space-y-6">
            <div>
                <h2 class="text-2xl font-bold">📅 Congés de l'Équipe</h2>
                <p class="text-gray-600">Consultez les congés de l'équipe et soumettez vos propres demandes.</p>
            </div>
            
            <div class="bg-white p-6 rounded-lg shadow-sm">
                <h3 class="text-xl font-semibold mb-4">Nouvelle demande de congé</h3>
                <form id="leaveRequestForm" class="space-y-4">
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label for="leave-start-date" class="text-sm font-medium">Date de début</label>
                            <input type="date" id="leave-start-date" class="w-full border p-2 rounded mt-1" required>
                        </div>
                        <div>
                            <label for="leave-end-date" class="text-sm font-medium">Date de fin (optionnel)</label>
                            <input type="date" id="leave-end-date" class="w-full border p-2 rounded mt-1">
                        </div>
                    </div>
                    <div>
                        <label for="leave-reason" class="text-sm font-medium">Raison</label>
                        <select id="leave-reason" class="w-full border p-2 rounded mt-1" required>
                            <option value="Vacances">Vacances</option>
                            <option value="Médical">Médical</option>
                            <option value="Familial">Familial</option>
                            <option value="Autre">Autre</option>
                        </select>
                    </div>
                    <div id="medical-times-container" class="hidden grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label for="leave-start-time" class="text-sm font-medium">Heure de début</label>
                            <input type="time" id="leave-start-time" class="w-full border p-2 rounded mt-1">
                        </div>
                        <div>
                            <label for="leave-end-time" class="text-sm font-medium">Heure de fin</label>
                            <input type="time" id="leave-end-time" class="w-full border p-2 rounded mt-1">
                        </div>
                    </div>
                    <div class="text-right pt-2">
                        <button type="submit" class="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-2 rounded">
                            Envoyer la demande
                        </button>
                    </div>
                </form>
            </div>

            <div class="bg-white p-6 rounded-lg shadow-sm">
                <div class="flex justify-between items-center mb-4">
                    <button id="prevWeekBtn" class="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg">&lt;</button>
                    <h3 id="list-title" class="text-xl font-semibold text-center"></h3>
                    <button id="nextWeekBtn" class="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg">&gt;</button>
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
    // On ajoute 7 jours à la date d'aujourd'hui
    today.setDate(today.getDate() + 7); 

    // On formate la date en YYYY-MM-DD, requis pour l'attribut 'min'
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const minDateString = `${year}-${month}-${day}`;

    document.getElementById('leave-start-date').min = minDateString;
    document.getElementById('leave-end-date').min = minDateString;
}
function setupEventListeners() {
    // MODIFIÉ : On utilise les boutons de semaine
    document.getElementById('prevWeekBtn').onclick = () => {
        currentWeekOffset--;
        displayLeaveList();
    };
    document.getElementById('nextWeekBtn').onclick = () => {
        currentWeekOffset++;
        displayLeaveList();
    };
    document.getElementById('leaveRequestForm').onsubmit = submitLeaveRequest;

    document.getElementById('leave-reason').addEventListener('change', (e) => {
        const medicalContainer = document.getElementById('medical-times-container');
        if (e.target.value === 'Médical') {
            medicalContainer.classList.remove('hidden');
        } else {
            medicalContainer.classList.add('hidden');
        }
    });
}

async function loadAllRequestsAndDisplayList() {
    try {
        // La requête reste la même, on charge tout une seule fois
        const q = query(collection(db, "leaveRequests"), orderBy("startDate", "desc"));
        const snapshot = await getDocs(q);
        leaveRequestsCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        displayLeaveList();
    } catch (error) {
        console.error("Erreur de chargement des congés:", error);
    }
}

// MODIFIÉ : La fonction affiche maintenant une semaine sous forme de liste
// MODIFICATION DANS modules/user-leave.js

function displayLeaveList() {
    const listContainer = document.getElementById('leave-list-container');
    const listTitle = document.getElementById('list-title');
    listContainer.innerHTML = '';

    const { startOfWeek, endOfWeek } = getWeekDateRange(currentWeekOffset);
    
    listTitle.textContent = `Semaine du ${startOfWeek.toLocaleDateString('fr-FR', {day: 'numeric', month: 'long'})}`;

    const dailyEntries = [];
    leaveRequestsCache.forEach(req => {
        // CORRECTION ICI : On crée la date en UTC pour éviter les problèmes de fuseau horaire
        const start = new Date(req.startDate + 'T12:00:00Z');
        const end = new Date((req.endDate || req.startDate) + 'T12:00:00Z');

        let loopDate = new Date(start);
        while (loopDate <= end) {
            if (loopDate >= startOfWeek && loopDate <= endOfWeek) {
                dailyEntries.push({
                    date: new Date(loopDate),
                    ...req
                });
            }
            // On utilise setUTCDate pour travailler en UTC
            loopDate.setUTCDate(loopDate.getUTCDate() + 1);
        }
    });
    
    const groupedByDay = dailyEntries.reduce((acc, entry) => {
        // CORRECTION ICI : On utilise getUTCDate() pour ne pas avoir de décalage
        const year = entry.date.getUTCFullYear();
        const month = String(entry.date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(entry.date.getUTCDate()).padStart(2, '0');
        const dateString = `${year}-${month}-${day}`;
        
        if (!acc[dateString]) acc[dateString] = [];
        acc[dateString].push(entry);
        return acc;
    }, {});
    
    const sortedDays = Object.keys(groupedByDay).sort();

    if (sortedDays.length === 0) {
        listContainer.innerHTML = '<p class="text-center text-gray-500 py-4">Aucun congé cette semaine.</p>';
        return;
    }

    sortedDays.forEach(dateString => {
        const dayEntries = groupedByDay[dateString];
        // On recrée la date à midi pour être sûr du jour lors de l'affichage
        const dayDate = new Date(dateString + 'T12:00:00');

        const dayWrapper = document.createElement('div');
        const dayHeader = `
            <div class="flex justify-between items-center border-b pb-2 mb-3">
                <h3 class="font-bold text-lg">${dayDate.toLocaleDateString('fr-FR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' })}</h3>
            </div>
        `;
        
        const entriesContainer = document.createElement('div');
        entriesContainer.className = 'space-y-3';

        dayEntries.forEach(entry => {
            let statusClass = '', statusIcon = '';
            
            if (entry.status === 'approved') {
                statusClass = 'border-l-4 border-green-500';
                statusIcon = '<span class="text-green-600 font-bold">Accepté</span>';
            } else if (entry.status === 'refused') {
                statusClass = 'border-l-4 border-red-500';
                statusIcon = '<span class="text-red-600 font-bold">Refusé</span>';
            } else if (entry.status === 'pending' && entry.userId === currentUser.uid) {
                statusClass = 'border-l-4 border-blue-500';
                statusIcon = '<span class="text-blue-600 font-bold">En attente</span>';
            } else {
                return;
            }
            
            const card = document.createElement('div');
            card.className = `p-3 border rounded-lg bg-gray-50 flex justify-between items-center ${statusClass}`;
            card.innerHTML = `
                <div>
                    <p class="font-bold">${entry.userName}</p>
                    <p class="text-sm text-gray-600">${entry.reason}</p>
                </div>
                ${statusIcon}
            `;
            entriesContainer.appendChild(card);
        });

        if (entriesContainer.children.length > 0) {
            dayWrapper.innerHTML = dayHeader;
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
    submitButton.textContent = "Envoi en cours...";

    const startDate = document.getElementById('leave-start-date').value;
    const endDate = document.getElementById('leave-end-date').value || startDate;
    const reason = document.getElementById('leave-reason').value;
    const startTime = document.getElementById('leave-start-time').value;
    const endTime = document.getElementById('leave-end-time').value;

    // --- VALIDATION STRICTE DES 7 JOURS ---
    const today = new Date();
    today.setHours(0, 0, 0, 0); // On compare les jours uniquement

    const requestedDate = new Date(startDate);

    const timeDiff = requestedDate.getTime() - today.getTime();
    const dayDiff = Math.floor(timeDiff / (1000 * 3600 * 24));

    // Si la différence est inférieure à 7 jours, on bloque.
    if (dayDiff < 7) {
        showInfoModal("Délai insuffisant", "Vous ne pouvez pas demander de congé moins de 7 jours à l'avance.");
        submitButton.disabled = false;
        submitButton.textContent = "Envoyer la demande";
        return; // On arrête tout
    }
    // --- FIN DE LA VALIDATION ---

    if (new Date(endDate) < new Date(startDate)) {
        showInfoModal("Attention", "La date de fin ne peut pas être antérieure à la date de début.");
        submitButton.disabled = false;
        submitButton.textContent = "Envoyer la demande";
        return;
    }

    const requestData = {
        userId: currentUser.uid,
        userName: currentUser.displayName,
        startDate: startDate,
        endDate: endDate,
        reason: reason,
        status: 'pending',
        requestedAt: serverTimestamp()
    };

    if (reason === 'Médical' && startTime && endTime) {
        requestData.startTime = startTime;
        requestData.endTime = endTime;
    }

    try {
        await addDoc(collection(db, "leaveRequests"), requestData);
        showInfoModal("Succès", "Votre demande de congé a bien été envoyée.");
        form.reset();
        document.getElementById('medical-times-container').classList.add('hidden');
        loadAllRequestsAndDisplayList();
    } catch (error) {
        console.error("Erreur d'envoi de la demande:", error);
        showInfoModal("Erreur", "L'envoi de la demande a échoué.");
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Envoyer la demande";
    }
}