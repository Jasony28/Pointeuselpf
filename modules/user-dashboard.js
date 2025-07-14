// modules/user-dashboard.js

import { collection, query, where, getDocs, orderBy, doc, getDoc, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, currentUser, pageContent } from "../app.js";

let timerInterval = null;
let chantiersCache = [];
let colleaguesCache = [];

export async function render() {
    pageContent.innerHTML = `
        <div class="max-w-4xl mx-auto space-y-6">
            
            <div id="live-tracker-container" class="bg-white p-6 rounded-lg shadow-md">
                </div>

            <div>
                <h2 class="text-xl font-bold mb-2">🗓️ Planning de la Semaine</h2>
                <div class="bg-white rounded-lg shadow-sm p-4">
                    <div class="flex justify-between items-center">
                        <button id="prevWeekBtn" class="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg">&lt;</button>
                        <div id="currentPeriodDisplay" class="text-center font-semibold text-lg"></div>
                        <button id="nextWeekBtn" class="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg">&gt;</button>
                    </div>
                </div>
                <div id="schedule-grid" class="grid grid-cols-1 md:grid-cols-7 gap-2 mt-4"></div>
            </div>
        </div>

        <div id="startPointageModal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-20 p-4">
            <div class="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
                <h3 class="text-xl font-bold mb-4">Démarrer un pointage</h3>
                <form id="startPointageForm" class="space-y-4">
                    <div>
                        <label class="text-sm font-medium">Chantier</label>
                        <select id="startChantierSelect" class="w-full border p-2 rounded" required></select>
                    </div>
                    <div>
                        <label class="text-sm font-medium">Collègues présents</label>
                        <div id="startColleaguesContainer" class="mt-1 p-2 border rounded max-h-40 overflow-y-auto space-y-1"></div>
                    </div>
                    <div class="flex justify-end gap-4 pt-2">
                        <button type="button" id="cancelStartPointage" class="bg-gray-300 hover:bg-gray-400 px-4 py-2 rounded">Annuler</button>
                        <button type="submit" class="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded">Démarrer</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    document.getElementById("prevWeekBtn").onclick = () => { /* ... */ };
    document.getElementById("nextWeekBtn").onclick = () => { /* ... */ };
    
    await cacheData();
    initLiveTracker(); // Initialise le chronomètre
    displayWeekView(); // Affiche le planning
}

async function cacheData() {
    const chantiersQuery = query(collection(db, "chantiers"), where("status", "==", "active"), orderBy("name"));
    chantiersCache = (await getDocs(chantiersQuery)).docs.map(doc => doc.data().name);

    const colleaguesQuery = query(collection(db, "colleagues"), orderBy("name"));
    colleaguesCache = (await getDocs(colleaguesQuery)).docs.map(doc => doc.data().name);
}

// --- NOUVELLE LOGIQUE DE CHRONOMÈTRE ---

function initLiveTracker() {
    const container = document.getElementById('live-tracker-container');
    const activePointage = JSON.parse(localStorage.getItem('activePointage'));

    if (activePointage) {
        // Un pointage est déjà en cours, on affiche l'écran "Stop"
        const startTime = new Date(activePointage.startTime);
        container.innerHTML = `
            <div class="text-center">
                <p class="text-gray-500">Pointage en cours sur le chantier :</p>
                <p class="text-2xl font-bold text-purple-700 my-2">${activePointage.chantier}</p>
                <div id="timer" class="text-4xl font-mono my-4">00:00:00</div>
                <button id="stopBtn" class="bg-red-600 hover:bg-red-700 text-white font-bold px-8 py-4 rounded-lg text-lg">Arrêter le pointage</button>
            </div>
        `;
        updateTimerUI(startTime);
        timerInterval = setInterval(() => updateTimerUI(startTime), 1000);
        document.getElementById('stopBtn').onclick = stopPointage;
    } else {
        // Pas de pointage en cours, on affiche l'écran "Start"
        container.innerHTML = `
            <div class="text-center">
                <h3 class="text-xl font-bold mb-2">Prêt à commencer ?</h3>
                <button id="startBtn" class="bg-green-600 hover:bg-green-700 text-white font-bold px-8 py-4 rounded-lg text-lg">Démarrer un nouveau pointage</button>
            </div>
        `;
        document.getElementById('startBtn').onclick = openStartModal;
    }
}

function updateTimerUI(startTime) {
    const now = new Date();
    const diff = now - startTime;
    const hours = String(Math.floor(diff / 3600000)).padStart(2, '0');
    const minutes = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0');
    const seconds = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
    document.getElementById('timer').textContent = `${hours}:${minutes}:${seconds}`;
}

function openStartModal() {
    const modal = document.getElementById('startPointageModal');
    const form = document.getElementById('startPointageForm');
    const chantierSelect = document.getElementById('startChantierSelect');
    const colleaguesContainer = document.getElementById('startColleaguesContainer');

    chantierSelect.innerHTML = '<option value="" disabled selected>-- Choisissez --</option>' + chantiersCache.map(name => `<option value="${name}">${name}</option>`).join('');
    
    colleaguesContainer.innerHTML = colleaguesCache.map(name => `
        <label class="flex items-center gap-2 p-1 hover:bg-gray-100 rounded">
            <input type="checkbox" value="${name}" name="colleagues" />
            <span>${name}</span>
        </label>
    `).join('');
    
    form.onsubmit = (e) => {
        e.preventDefault();
        const chantier = chantierSelect.value;
        const selectedColleagues = Array.from(document.querySelectorAll('input[name="colleagues"]:checked')).map(el => el.value);
        
        const pointageData = {
            chantier,
            colleagues: selectedColleagues,
            startTime: new Date().toISOString()
        };
        
        localStorage.setItem('activePointage', JSON.stringify(pointageData));
        closeStartModal();
        initLiveTracker(); // On rafraîchit l'affichage
    };

    document.getElementById('cancelStartPointage').onclick = closeStartModal;
    modal.classList.remove('hidden');
}

function closeStartModal() {
    document.getElementById('startPointageModal').classList.add('hidden');
}

async function stopPointage() {
    if (!confirm("Voulez-vous vraiment arrêter ce pointage ?")) return;

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
        alert("Pointage enregistré !");
    } catch (error) {
        console.error("Erreur d'enregistrement:", error);
        alert("Une erreur est survenue lors de l'enregistrement.");
    } finally {
        clearInterval(timerInterval);
        localStorage.removeItem('activePointage');
        initLiveTracker(); // On rafraîchit l'affichage
    }
}


// Le code pour afficher le planning public reste le même...
// ...
function displayWeekView() {const { startOfWeek, endOfWeek } = getWeekDateRange(currentWeekOffset);const options = { day: 'numeric', month: 'long' };document.getElementById("currentPeriodDisplay").textContent = `Semaine du ${startOfWeek.toLocaleDateString('fr-FR', options)} au ${endOfWeek.toLocaleDateString('fr-FR', options)}`;const scheduleGrid = document.getElementById("schedule-grid");if(scheduleGrid){scheduleGrid.innerHTML = "<p class='text-center text-gray-500 p-4 col-span-7'>Chargement...</p>";const days = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];let gridHtml = '';for (let i = 0; i < 7; i++) {const dayDate = new Date(startOfWeek);dayDate.setDate(startOfWeek.getDate() + i);gridHtml += `<div class="bg-gray-50 rounded-lg p-2 min-h-[100px]"><h4 class="font-bold text-center border-b pb-1 mb-2">${days[i]} <span class="text-sm font-normal text-gray-500">${dayDate.toLocaleDateString('fr-FR', {day: '2-digit'})}</span></h4><div id="day-col-${i}" class="space-y-2"></div></div>`;}scheduleGrid.innerHTML = gridHtml;loadUserScheduleForWeek(startOfWeek, endOfWeek);}}
async function loadUserScheduleForWeek(start, end) { const scheduleGrid = document.getElementById("schedule-grid"); const weekId = start.toISOString().split('T')[0]; const publishDoc = await getDoc(doc(db, "publishedSchedules", weekId)); if (!publishDoc.exists()) { scheduleGrid.innerHTML = `<p class='col-span-1 md:col-span-7 text-center text-gray-500 p-4'>Le planning de cette semaine n'a pas encore été publié.</p>`; return; } const q = query(collection(db, "planning"), where("date", ">=", start.toISOString().split('T')[0]), where("date", "<=", end.toISOString().split('T')[0]), orderBy("date")); try { const querySnapshot = await getDocs(q); const scheduleData = querySnapshot.docs.map(doc => doc.data()); for (let i = 0; i < 7; i++) { const dayCol = document.getElementById(`day-col-${i}`); if (dayCol) dayCol.innerHTML = ''; } if (querySnapshot.empty) return; scheduleData.forEach(data => { const dayIndex = (new Date(data.date + 'T00:00:00').getDay() + 6) % 7; const container = document.getElementById(`day-col-${dayIndex}`); if (container) container.appendChild(createTaskElement(data)); }); } catch (error) { console.error("Erreur:", error); } }
function createTaskElement(task) { const el = document.createElement('div'); el.className = 'bg-white p-3 rounded-lg shadow-sm border-l-4 border-purple-500 text-sm'; const team = task.teamNames && task.teamNames.length > 0 ? `Équipe : ${task.teamNames.join(', ')}` : 'Pas d\'équipe'; const start = task.startTime ? `<strong>${task.startTime}</strong> - ` : ''; const note = task.notes ? `<div class="mt-2 pt-2 border-t text-blue-600 text-xs"><strong>Note:</strong> ${task.notes}</div>` : ''; el.innerHTML = `<div class="font-semibold">${task.chantierName}</div><div class="text-xs text-gray-700 mt-1">${start}${task.duration || ''}h prévues</div><div class="text-xs text-gray-500 mt-1">${team}</div>${note}`; return el; }
function getWeekDateRange(offset = 0) { const now = new Date(); const dayOfWeek = now.getDay(); const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1) + (offset * 7); const startOfWeek = new Date(now.setDate(diff)); startOfWeek.setHours(0, 0, 0, 0); const endOfWeek = new Date(startOfWeek); endOfWeek.setDate(startOfWeek.getDate() + 6); endOfWeek.setHours(23, 59, 59, 999); return { startOfWeek, endOfWeek }; }
document.getElementById("prevWeekBtn").onclick = () => { currentWeekOffset--; displayWeekView(); }; document.getElementById("nextWeekBtn").onclick = () => { currentWeekOffset++; displayWeekView(); };