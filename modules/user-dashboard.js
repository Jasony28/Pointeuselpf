import { collection, query, where, getDocs, orderBy, doc, getDoc, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, currentUser, pageContent, showInfoModal, showConfirmationModal } from "../app.js";
import { getWeekDateRange } from "./utils.js";

let timerInterval = null;
let chantiersCache = [];
let colleaguesCache = [];
let currentWeekOffset = 0;

export async function render() {
    pageContent.innerHTML = `
        <div class="max-w-4xl mx-auto space-y-8">
            <div id="live-tracker-container" class="bg-white p-6 rounded-lg shadow-lg"></div>
            <div>
                <h2 class="text-xl font-bold mb-2">🗓️ Mon Planning de la Semaine</h2>
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

        <div id="stopPointageModal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-20 p-4">
            <div class="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
                <h3 class="text-xl font-bold mb-4">Finaliser le pointage</h3>
                <form id="stopPointageForm">
                    <div class="space-y-4">
                        <div>
                            <label for="pointageNotes" class="text-sm font-medium">Note (facultatif)</label>
                            <textarea id="pointageNotes" placeholder="Ex: Matériel manquant, travail terminé plus tôt..." class="w-full border p-2 rounded mt-1 h-24"></textarea>
                        </div>
                        <div class="flex justify-end gap-4 pt-4">
                            <button type="button" id="cancelStopPointage" class="bg-gray-300 hover:bg-gray-400 px-4 py-2 rounded">Annuler</button>
                            <button type="submit" class="bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2 rounded">Arrêter et Enregistrer</button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    `;
setTimeout(async () => {
        try {
            // On met les bonnes fonctions de ce fichier à l'intérieur du setTimeout
            await cacheDataForModals();
            initLiveTracker();
            displayWeekView();
        } catch (error) {
            console.error("Erreur critique dans le rendu du dashboard utilisateur:", error);
            pageContent.innerHTML = `<div class="text-red-500 text-center p-4">Erreur de chargement du tableau de bord.</div>`;
        }
    }, 0);
}

async function cacheDataForModals() {
    const chantiersQuery = query(collection(db, "chantiers"), where("status", "==", "active"), orderBy("name"));
    const colleaguesQuery = query(collection(db, "colleagues"), orderBy("name"));
    const usersQuery = query(collection(db, "users"), where("status", "==", "approved"), orderBy("displayName"));

    const [chantiersSnapshot, colleaguesSnapshot, usersSnapshot] = await Promise.all([
        getDocs(chantiersQuery),
        getDocs(colleaguesQuery),
        getDocs(usersQuery)
    ]);

    chantiersCache = chantiersSnapshot.docs.map(doc => doc.data().name);
    const colleagueNames = colleaguesSnapshot.docs.map(doc => doc.data().name);
    const userNames = usersSnapshot.docs.map(doc => doc.data().displayName);

    const combinedNames = [...new Set([...colleagueNames, ...userNames])];
    colleaguesCache = combinedNames.sort((a, b) => a.localeCompare(b));
}

function initLiveTracker() {
    const container = document.getElementById('live-tracker-container');
    const activePointage = JSON.parse(localStorage.getItem('activePointage'));

    if (activePointage && activePointage.uid === currentUser.uid) {
        const startTime = new Date(activePointage.startTime);
        container.innerHTML = `<div class="text-center"><p class="text-gray-500">Pointage en cours sur :</p><p class="text-2xl font-bold text-purple-700 my-2">${activePointage.chantier}</p><div id="timer" class="text-5xl font-mono my-4 tracking-wider">00:00:00</div><button id="stopBtn" class="w-full md:w-auto bg-red-600 hover:bg-red-700 text-white font-bold px-8 py-4 rounded-lg text-lg shadow-lg">Arrêter le pointage</button></div>`;
        updateTimerUI(startTime);
        timerInterval = setInterval(() => updateTimerUI(startTime), 1000);
        document.getElementById('stopBtn').onclick = openStopModal;
    } else {
        container.innerHTML = `<div class="text-center"><h3 class="text-xl font-bold mb-2">Prêt à commencer votre journée ?</h3><button id="startBtn" class="w-full md:w-auto bg-green-600 hover:bg-green-700 text-white font-bold px-8 py-4 rounded-lg text-lg shadow-lg">Démarrer un nouveau pointage</button></div>`;
        document.getElementById('startBtn').onclick = openStartModal;
    }
}

function updateTimerUI(startTime) {
    const timerElement = document.getElementById('timer');
    if (!timerElement) {
        clearInterval(timerInterval);
        return;
    }
    const now = new Date();
    const diff = now - startTime;
    const hours = String(Math.floor(diff / 3600000)).padStart(2, '0');
    const minutes = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0');
    const seconds = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
    timerElement.textContent = `${hours}:${minutes}:${seconds}`;
}

// REMPLACEZ votre fonction openStartModal par celle-ci

async function openStartModal() {
    const modal = document.getElementById('startPointageModal');
    const form = document.getElementById('startPointageForm');
    const chantierSelect = document.getElementById('startChantierSelect');
    const colleaguesContainer = document.getElementById('startColleaguesContainer');

    chantierSelect.innerHTML = '<option>Chargement du planning...</option>';
    colleaguesContainer.innerHTML = '<p class="text-gray-500 text-sm">Chargement...</p>';
    modal.classList.remove('hidden');

    // On récupère maintenant les 3 listes
    const { weeklyChantiers, todaysColleagues, todaysChantiers } = await getContextualLists();

    // --- Génération de la liste des chantiers avec 3 groupes ---
    const weeklyChantiersOnly = new Set([...weeklyChantiers].filter(chantier => !todaysChantiers.has(chantier)));
    const otherChantiers = chantiersCache.filter(name => !weeklyChantiers.has(name));
    
    let chantierOptionsHTML = '';

    if (todaysChantiers.size > 0) {
        chantierOptionsHTML += '<optgroup label="Chantiers du jour">';
        todaysChantiers.forEach(name => {
            chantierOptionsHTML += `<option value="${name}">${name}</option>`;
        });
        chantierOptionsHTML += '</optgroup>';
    }

    if (weeklyChantiersOnly.size > 0) {
        chantierOptionsHTML += '<optgroup label="Autres chantiers de la semaine">';
        weeklyChantiersOnly.forEach(name => {
            chantierOptionsHTML += `<option value="${name}">${name}</option>`;
        });
        chantierOptionsHTML += '</optgroup>';
    }

    if (otherChantiers.length > 0) {
        chantierOptionsHTML += '<optgroup label="Tous les autres chantiers">';
        otherChantiers.forEach(name => {
            chantierOptionsHTML += `<option value="${name}">${name}</option>`;
        });
        chantierOptionsHTML += '</optgroup>';
    }

    chantierSelect.innerHTML = chantierOptionsHTML;
    
    // Gérer le cas où il n'y a aucun chantier planifié
    if (!chantierSelect.innerHTML) {
         chantierSelect.innerHTML = '<option value="" disabled selected>-- Choisissez un chantier --</option>';
         chantiersCache.forEach(name => {
            chantierOptionsHTML += `<option value="${name}">${name}</option>`;
         });
         chantierSelect.innerHTML += chantierOptionsHTML;
    }

    // --- Génération de la liste des collègues (inchangée) ---
    const otherColleagues = colleaguesCache.filter(name => !todaysColleagues.has(name) && name !== currentUser.displayName);
    const createColleagueElement = (name) => `
        <label class="flex items-center gap-2 p-1 hover:bg-gray-100 rounded w-full">
            <input type="checkbox" value="${name}" name="colleagues" />
            <span>${name}</span>
        </label>`;
    
    let colleaguesHTML = '';
    if (todaysColleagues.size > 0) {
        todaysColleagues.forEach(name => {
            colleaguesHTML += createColleagueElement(name);
        });
        colleaguesHTML += '<div class="w-full border-t my-2"></div>';
    }
    colleaguesContainer.innerHTML = colleaguesHTML;

    if (otherColleagues.length > 0) {
        const showAllButton = document.createElement('button');
        showAllButton.type = 'button';
        showAllButton.textContent = `Afficher les ${otherColleagues.length} autres...`;
        showAllButton.className = 'text-sm text-blue-600 hover:underline w-full text-center p-1';
        showAllButton.onclick = () => {
            showAllButton.remove();
            const otherColleaguesHTML = otherColleagues.map(createColleagueElement).join('');
            colleaguesContainer.insertAdjacentHTML('beforeend', otherColleaguesHTML);
        };
        colleaguesContainer.appendChild(showAllButton);
    }
    
    // Logique du formulaire (inchangée)
    form.onsubmit = (e) => {
        e.preventDefault();
        const chantier = chantierSelect.value;
        if (!chantier) { showInfoModal("Attention", "Veuillez choisir un chantier."); return; }
        const selectedColleagues = Array.from(document.querySelectorAll('input[name="colleagues"]:checked')).map(el => el.value);
        const pointageData = { chantier, colleagues: selectedColleagues, startTime: new Date().toISOString(), uid: currentUser.uid };
        localStorage.setItem('activePointage', JSON.stringify(pointageData));
        closeStartModal();
        initLiveTracker();
    };
    document.getElementById('cancelStartPointage').onclick = closeStartModal;
}

// CORRECTION: Cette fonction est maintenant indépendante et non plus imbriquée dans openStartModal.
async function getContextualLists() {
    const { startOfWeek, endOfWeek } = getWeekDateRange(0);
    const todayStr = new Date().toISOString().split('T')[0];

    const weeklyChantiers = new Set();
    const todaysColleagues = new Set();
    const todaysChantiers = new Set(); // On ajoute cet ensemble

    try {
        const q = query(collection(db, "planning"),
            where("date", ">=", startOfWeek.toISOString().split('T')[0]),
            where("date", "<=", endOfWeek.toISOString().split('T')[0])
        );
        const querySnapshot = await getDocs(q);

        querySnapshot.docs.forEach(doc => {
            const task = doc.data();
            if (task.teamNames && task.teamNames.includes(currentUser.displayName)) {
                weeklyChantiers.add(task.chantierName);
                
                if (task.date === todayStr) {
                    todaysChantiers.add(task.chantierName); // On remplit la liste du jour
                    task.teamNames.forEach(name => {
                        if (name !== currentUser.displayName) {
                            todaysColleagues.add(name);
                        }
                    });
                }
            }
        });
    } catch (error) {
        console.error("Impossible de charger le planning contextuel:", error);
    }

    return { weeklyChantiers, todaysColleagues, todaysChantiers }; // On retourne la nouvelle liste
}
function closeStartModal() {
    document.getElementById('startPointageModal').classList.add('hidden');
}

function openStopModal() {
    const modal = document.getElementById('stopPointageModal');
    const form = document.getElementById('stopPointageForm');
    form.reset();
    modal.classList.remove('hidden');
    
    document.getElementById('cancelStopPointage').onclick = () => modal.classList.add('hidden');

    form.onsubmit = (e) => {
        e.preventDefault();
        const notes = document.getElementById('pointageNotes').value.trim();
        stopPointage(notes);
        modal.classList.add('hidden');
    };
}

async function stopPointage(notes = "") {
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
        notes: notes,
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

function displayWeekView() {
    const { startOfWeek, endOfWeek } = getWeekDateRange(currentWeekOffset);
    document.getElementById("prevWeekBtn").onclick = () => { currentWeekOffset--; displayWeekView(); };
    document.getElementById("nextWeekBtn").onclick = () => { currentWeekOffset++; displayWeekView(); };
    
    const options = { day: 'numeric', month: 'long', timeZone: 'UTC' };
    document.getElementById("currentPeriodDisplay").textContent = `Semaine du ${startOfWeek.toLocaleDateString('fr-FR', options)} au ${endOfWeek.toLocaleDateString('fr-FR', options)}`;
    
    const scheduleGrid = document.getElementById("schedule-grid");
    scheduleGrid.innerHTML = ""; 

    const days = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
    
    for (let i = 0; i < 7; i++) {
        const dayDate = new Date(startOfWeek);
        dayDate.setUTCDate(startOfWeek.getUTCDate() + i);
        
        const dayColumn = document.createElement('div');
        dayColumn.className = 'bg-gray-50 rounded-lg p-2 min-h-[100px]';
        dayColumn.innerHTML = `
            <h4 class="font-bold text-center border-b pb-1 mb-2">
                ${days[i]} <span class="text-sm font-normal text-gray-500">${dayDate.getUTCDate()}</span>
            </h4>
            <div id="day-col-${i}" class="space-y-2"></div>
        `;
        scheduleGrid.appendChild(dayColumn);
    }
    
    loadUserScheduleForWeek(startOfWeek, endOfWeek);
}

async function loadUserScheduleForWeek(start, end) {
    const weekId = start.toISOString().split('T')[0];
    const publishDoc = await getDoc(doc(db, "publishedSchedules", weekId));
    const scheduleGrid = document.getElementById("schedule-grid");

    if (!publishDoc.exists()) {
        if(scheduleGrid) scheduleGrid.innerHTML = `<p class='col-span-1 md:col-span-7 text-center text-gray-500 p-4'>Le planning de cette semaine n'a pas encore été publié.</p>`;
        return;
    }

    const q = query(collection(db, "planning"), 
        where("date", ">=", start.toISOString().split('T')[0]), 
        where("date", "<=", end.toISOString().split('T')[0]), 
        orderBy("date")
    );
    const querySnapshot = await getDocs(q);
    const scheduleData = querySnapshot.docs.map(doc => doc.data());

    const userSchedule = scheduleData.filter(task => task.teamNames && task.teamNames.includes(currentUser.displayName));
    
    userSchedule.forEach(data => {
        const utcDate = new Date(data.date + 'T12:00:00Z');
        const dayIndex = (utcDate.getUTCDay() + 6) % 7;
        const container = document.getElementById(`day-col-${dayIndex}`);
        if (container) {
            container.appendChild(createTaskElement(data));
        }
    });
}

function createTaskElement(task) {
    const el = document.createElement('div');
    el.className = 'bg-white p-3 rounded-lg shadow-sm border-l-4 border-purple-500 text-sm';
    const team = (task.teamNames && task.teamNames.length) ? `Équipe : ${task.teamNames.join(', ')}` : 'Pas d\'équipe';
    const start = task.startTime ? `<strong>${task.startTime}</strong> - ` : '';
    const note = task.notes ? `<div class="mt-2 pt-2 border-t text-blue-600 text-xs"><strong>Note:</strong> ${task.notes}</div>` : '';
    el.innerHTML = `<div class="font-semibold">${task.chantierName}</div><div class="text-xs text-gray-700 mt-1">${start}${task.duration || ''}h prévues</div><div class="text-xs text-gray-500 mt-1">${team}</div>${note}`;
    return el;
}