// modules/user-dashboard.js

import { collection, query, where, getDocs, orderBy, doc, getDoc, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, currentUser, pageContent, showInfoModal, showConfirmationModal } from "../app.js";

let timerInterval = null;
let chantiersCache = [];
let colleaguesCache = [];
let currentMonthOffset = 0; // Changé de week à month

export async function render() {
    pageContent.innerHTML = `
        <div class="max-w-6xl mx-auto space-y-8">
            
            <div id="live-tracker-container" class="bg-white p-6 rounded-lg shadow-lg">
                </div>

            <div>
                <h2 class="text-xl font-bold mb-2">🗓️ Mon Planning du Mois</h2>
                <div class="bg-white rounded-lg shadow-sm p-4">
                    <div class="flex justify-between items-center">
                        <button id="prevMonthBtn" class="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg">&lt;</button>
                        <div id="currentPeriodDisplay" class="text-center font-semibold text-lg"></div>
                        <button id="nextMonthBtn" class="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg">&gt;</button>
                    </div>
                </div>
                                <div class="grid grid-cols-7 gap-1 mt-4 text-center font-bold text-gray-600">
                    <div>Lun</div><div>Mar</div><div>Mer</div><div>Jeu</div><div>Ven</div><div>Sam</div><div>Dim</div>
                </div>
                <div id="schedule-grid" class="grid grid-cols-7 gap-1 border-t border-l"></div>
            </div>
        </div>

        <div id="startPointageModal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-20 p-4">
            <div class="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
                <h3 class="text-xl font-bold mb-4">Démarrer un pointage</h3>
                <form id="startPointageForm" class="space-y-4">
                    <div>
                        <label class="text-sm font-medium">Chantier</label>
                        <select id="startChantierSelect" class="w-full border p-2 rounded mt-1" required></select>
                    </div>
                    <div>
                        <label class="text-sm font-medium">Collègues présents</label>
                        <div id="startColleaguesContainer" class="mt-1 p-2 border rounded max-h-40 overflow-y-auto space-y-1"></div>
                    </div>
                    <div class="flex justify-end gap-4 pt-4">
                        <button type="button" id="cancelStartPointage" class="bg-gray-300 hover:bg-gray-400 px-4 py-2 rounded">Annuler</button>
                        <button type="submit" class="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded">Démarrer</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    await cacheDataForModals();
    initLiveTracker(); 
    displayMonthView();
}

async function cacheDataForModals() {
    const chantiersQuery = query(collection(db, "chantiers"), where("status", "==", "active"), orderBy("name"));
    chantiersCache = (await getDocs(chantiersQuery)).docs.map(doc => doc.data().name);

    const colleaguesQuery = query(collection(db, "colleagues"), orderBy("name"));
    colleaguesCache = (await getDocs(colleaguesQuery)).docs.map(doc => doc.data().name);
}

function initLiveTracker() {
    const container = document.getElementById('live-tracker-container');
    const activePointage = JSON.parse(localStorage.getItem('activePointage'));

    if (activePointage && activePointage.uid === currentUser.uid) {
        const startTime = new Date(activePointage.startTime);
        container.innerHTML = `
            <div class="text-center">
                <p class="text-gray-500">Pointage en cours sur :</p>
                <p class="text-2xl font-bold text-purple-700 my-2">${activePointage.chantier}</p>
                <div id="timer" class="text-5xl font-mono my-4 tracking-wider">00:00:00</div>
                <button id="stopBtn" class="w-full md:w-auto bg-red-600 hover:bg-red-700 text-white font-bold px-8 py-4 rounded-lg text-lg shadow-lg">Arrêter le pointage</button>
            </div>
        `;
        updateTimerUI(startTime);
        timerInterval = setInterval(() => updateTimerUI(startTime), 1000);
        document.getElementById('stopBtn').onclick = stopPointage;
    } else {
        container.innerHTML = `
            <div class="text-center">
                <h3 class="text-xl font-bold mb-2">Prêt à commencer votre journée ?</h3>
                <button id="startBtn" class="w-full md:w-auto bg-green-600 hover:bg-green-700 text-white font-bold px-8 py-4 rounded-lg text-lg shadow-lg">Démarrer un nouveau pointage</button>
            </div>
        `;
        document.getElementById('startBtn').onclick = openStartModal;
    }
}

function updateTimerUI(startTime) {
    const timerElement = document.getElementById('timer');
    if (!timerElement) return;
    const now = new Date();
    const diff = now - startTime;
    const hours = String(Math.floor(diff / 3600000)).padStart(2, '0');
    const minutes = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0');
    const seconds = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
    timerElement.textContent = `${hours}:${minutes}:${seconds}`;
}

function openStartModal() {
    const modal = document.getElementById('startPointageModal');
    const form = document.getElementById('startPointageForm');
    const chantierSelect = document.getElementById('startChantierSelect');
    const colleaguesContainer = document.getElementById('startColleaguesContainer');

    chantierSelect.innerHTML = '<option value="" disabled selected>-- Choisissez un chantier --</option>' + chantiersCache.map(name => `<option value="${name}">${name}</option>`).join('');
    
    colleaguesContainer.innerHTML = colleaguesCache.map(name => `
        <label class="flex items-center gap-2 p-1 hover:bg-gray-100 rounded">
            <input type="checkbox" value="${name}" name="colleagues" />
            <span>${name}</span>
        </label>
    `).join('');
    
    form.onsubmit = (e) => {
        e.preventDefault();
        const chantier = chantierSelect.value;
        if (!chantier) {
            showInfoModal("Attention", "Veuillez choisir un chantier.");
            return;
        }
        const selectedColleagues = Array.from(document.querySelectorAll('input[name="colleagues"]:checked')).map(el => el.value);
        
        const pointageData = {
            chantier,
            colleagues: selectedColleagues,
            startTime: new Date().toISOString(),
            uid: currentUser.uid
        };
        
        localStorage.setItem('activePointage', JSON.stringify(pointageData));
        closeStartModal();
        initLiveTracker();
    };

    document.getElementById('cancelStartPointage').onclick = closeStartModal;
    modal.classList.remove('hidden');
}

function closeStartModal() {
    document.getElementById('startPointageModal').classList.add('hidden');
}

async function stopPointage() {
    const confirmed = await showConfirmationModal("Confirmation", "Voulez-vous vraiment arrêter ce pointage ?");
    if (!confirmed) return;

    const activePointage = JSON.parse(localStorage.getItem('activePointage'));
    if (!activePointage) return;

    const endTime = new Date();
    
    const docData = {
        uid: currentUser.uid,
        userEmail: currentUser.email,
        userName: currentUser.displayName,
        timestamp: activePointage.startTime,
        endTime: endTime.toISOString(),
        chantier: activePointage.chantier,
        colleagues: activePointage.colleagues.length ? activePointage.colleagues : ["Seul"],
        notes: "(Pointage automatique)",
        createdAt: serverTimestamp()
    };

    try {
        await addDoc(collection(db, "pointages"), docData);
        showInfoModal("Succès", "Pointage enregistré avec succès !");
    } catch (error) {
        console.error("Erreur d'enregistrement:", error);
        showInfoModal("Erreur", "Une erreur est survenue lors de l'enregistrement.");
    } finally {
        clearInterval(timerInterval);
        localStorage.removeItem('activePointage');
        initLiveTracker();
    }
}

function displayMonthView() {
    const { startOfMonth, endOfMonth } = getMonthDateRange(currentMonthOffset);
    document.getElementById("prevMonthBtn").onclick = () => { currentMonthOffset--; displayMonthView(); };
    document.getElementById("nextMonthBtn").onclick = () => { currentMonthOffset++; displayMonthView(); };
    
    const options = { month: 'long', year: 'numeric' };
    document.getElementById("currentPeriodDisplay").textContent = startOfMonth.toLocaleDateString('fr-FR', options).replace(/^\w/, c => c.toUpperCase());

    const scheduleGrid = document.getElementById("schedule-grid");
    scheduleGrid.innerHTML = "";

    const firstDay = (startOfMonth.getDay() + 6) % 7; // Lundi = 0
    const daysInMonth = endOfMonth.getDate();

    // Ajouter des cellules vides pour les jours avant le début du mois
    for (let i = 0; i < firstDay; i++) {
        scheduleGrid.innerHTML += `<div class="border-r border-b bg-gray-50"></div>`;
    }

    // Ajouter les cellules pour chaque jour du mois
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(startOfMonth.getFullYear(), startOfMonth.getMonth(), day);
        const dateString = date.toISOString().split('T')[0];
        scheduleGrid.innerHTML += `
            <div class="border-r border-b p-1 min-h-[120px]">
                <div class="font-bold text-sm">${day}</div>
                <div id="day-container-${dateString}" class="space-y-1 mt-1"></div>
            </div>
        `;
    }

    loadUserScheduleForMonth(startOfMonth, endOfMonth);
}

async function loadUserScheduleForMonth(start, end) {
    const weekId = start.toISOString().split('T')[0]; // On utilise le début du mois pour vérifier la publication
    const publishDoc = await getDoc(doc(db, "publishedSchedules", weekId));
    
    // Note : La logique de publication est basée sur la semaine. On pourrait l'adapter au mois.
    // Pour l'instant, on vérifie juste si la première semaine du mois est publiée.
    if (!publishDoc.exists()) {
        const scheduleGrid = document.getElementById("schedule-grid");
        if(scheduleGrid) {
            // Affiche un message plus discret
            const firstCell = scheduleGrid.querySelector('div');
            if(firstCell) firstCell.innerHTML += `<p class='text-xs text-gray-400 p-1'>Non publié</p>`;
        }
    }

    const q = query(collection(db, "planning"), where("date", ">=", start.toISOString().split('T')[0]), where("date", "<=", end.toISOString().split('T')[0]), orderBy("date"));
    const querySnapshot = await getDocs(q);
    const scheduleData = querySnapshot.docs.map(doc => doc.data());

    const userSchedule = scheduleData.filter(task => 
        task.teamNames && task.teamNames.includes(currentUser.displayName)
    );

    userSchedule.forEach(data => {
        const container = document.getElementById(`day-container-${data.date}`);
        if (container) container.appendChild(createTaskElement(data));
    });
}

// --- MODIFIÉ ---
// Affiche maintenant le nom du chantier ET les collègues
function createTaskElement(task) {
    const el = document.createElement('div');
    el.className = 'bg-purple-100 p-1.5 rounded border-l-2 border-purple-500 text-xs space-y-1';

    const chantierNameHTML = `<div class="font-semibold truncate">${task.chantierName}</div>`;

    let teamHTML = '';
    // Vérifie si une équipe est assignée
    if (task.teamNames && Array.isArray(task.teamNames)) {
        // Retire le nom de l'utilisateur actuel de la liste pour n'afficher que ses collègues
        const otherMembers = task.teamNames.filter(name => name !== currentUser.displayName);
        
        if (otherMembers.length > 0) {
            // S'il y a d'autres membres, on les affiche
            teamHTML = `<div class="text-gray-600 truncate">Avec : ${otherMembers.join(', ')}</div>`;
        } else if (task.teamNames.length === 1) {
            // Si l'utilisateur est seul sur la tâche
            teamHTML = `<div class="text-gray-500 italic">Seul</div>`;
        }
    }

    el.innerHTML = chantierNameHTML + teamHTML;
    return el;
}

function getMonthDateRange(offset = 0) {
    const now = new Date();
    // Important: on se base sur le 1er jour du mois pour éviter les bugs de fin de mois
    now.setDate(1); 
    now.setMonth(now.getMonth() + offset);
 
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    endOfMonth.setHours(23, 59, 59, 999);
    
    return { startOfMonth, endOfMonth };
}