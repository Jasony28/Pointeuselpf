import { collection, query, where, getDocs, orderBy, doc, getDoc, addDoc, serverTimestamp, updateDoc, limit } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, currentUser, pageContent, showInfoModal } from "../app.js";
import { getWeekDateRange, formatMilliseconds } from "./utils.js";
import { getActiveChantiers, getTeamMembers } from "./data-service.js";

const MAPBOX_ACCESS_TOKEN = "pk.eyJ1IjoiamFzb255MjgiLCJhIjoiY21lMDcyYWhzMDIyODJsczl0cmM0aTVjciJ9.V14cJXdBNoq3yAQTDeUg-A";
const HOME_BASE_ADDRESS = "Marche-en-Famenne, Belgium";

let timerInterval = null;
let chantiersCache = [];
let colleaguesCache = [];
let currentWeekOffset = 0;

export async function render() {
    pageContent.innerHTML = `
        <div class="max-w-4xl mx-auto space-y-8">
            <div id="live-tracker-container" class="p-6 rounded-lg shadow-lg" style="background-color: var(--color-surface); border: 1px solid var(--color-border);"></div>
            <div id="missed-pointage-suggestions" class="space-y-4"></div>
            <div>
                <h2 class="text-xl font-bold mb-2">🗓️ Mon Planning de la Semaine</h2>
                <div class="rounded-lg shadow-sm p-4" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                    <div class="flex justify-between items-center">
                        <button id="prevWeekBtn" class="px-4 py-2 rounded-lg hover:opacity-80" style="background-color: var(--color-background);">&lt;</button>
                        <div id="currentPeriodDisplay" class="text-center font-semibold text-lg"></div>
                        <button id="nextWeekBtn" class="px-4 py-2 rounded-lg hover:opacity-80" style="background-color: var(--color-background);">&gt;</button>
                    </div>
                </div>
                <div id="schedule-grid" class="grid grid-cols-1 md:grid-cols-7 gap-2 mt-4"></div>
            </div>
        </div>
        <div id="startPointageModal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-20 p-4">
            <div class="p-6 rounded-lg shadow-xl w-full max-w-md" style="background-color: var(--color-surface);">
                <h3 class="text-xl font-bold mb-4">Démarrer un pointage</h3>
                <form id="startPointageForm" class="space-y-4">
                    <div>
                        <label class="text-sm font-medium">Chantier</label>
                        <select id="startChantierSelect" class="w-full border p-2 rounded mt-1" style="background-color: var(--color-background); border-color: var(--color-border);" required></select>
                    </div>
                    <div>
                        <label class="text-sm font-medium">Collègues présents</label>
                        <div id="startColleaguesContainer" class="mt-1 p-2 border rounded max-h-40 overflow-y-auto space-y-1" style="border-color: var(--color-border);"></div>
                    </div>
                    <div class="pt-2 border-t" style="border-color: var(--color-border);">
                        <label class="flex items-center gap-3 cursor-pointer p-2 rounded">
                            <input type="checkbox" id="isDriverCheckbox" class="h-5 w-5 rounded border-gray-300 focus:ring-offset-0" style="color: var(--color-primary);"/>
                            <span class="text-sm font-medium">Je suis le conducteur (pour le calcul des km)</span>
                        </label>
                    </div>
                    <div class="flex justify-end gap-4 pt-4">
                        <button type="button" id="cancelStartPointage" class="px-4 py-2 rounded" style="background-color: var(--color-background); border: 1px solid var(--color-border);">Annuler</button>
                        <button type="submit" class="text-white px-4 py-2 rounded" style="background-color: var(--color-primary);">Démarrer</button>
                    </div>
                </form>
            </div>
        </div>
        <div id="stopPointageModal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-20 p-4">
            <div class="p-6 rounded-lg shadow-xl w-full max-w-md" style="background-color: var(--color-surface);">
                <h3 class="text-xl font-bold mb-4">Finaliser le pointage</h3>
                <form id="stopPointageForm">
                    <div class="space-y-4">
                        <div>
                            <label for="pointageNotes" class="text-sm font-medium">Note (facultatif)</label>
                            <textarea id="pointageNotes" placeholder="Ex: Matériel manquant..." class="w-full border p-2 rounded mt-1 h-24" style="background-color: var(--color-background); border-color: var(--color-border);"></textarea>
                        </div>
                        <div class="flex justify-end gap-4 pt-4">
                            <button type="button" id="cancelStopPointage" class="px-4 py-2 rounded" style="background-color: var(--color-background); border: 1px solid var(--color-border);">Annuler</button>
                            <button type="submit" class="bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2 rounded">Arrêter et Enregistrer</button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    `;
    setTimeout(async () => {
        try {
            await cacheDataForModals();
            await checkForOpenPointage();
            if (!localStorage.getItem('activePointage')) {
                checkForMissedPointages();
            }
            document.getElementById("prevWeekBtn").onclick = () => { currentWeekOffset--; displayWeekView(); };
            document.getElementById("nextWeekBtn").onclick = () => { currentWeekOffset++; displayWeekView(); };
            displayWeekView();
        } catch (error) {
            console.error("Erreur critique dans le rendu du dashboard utilisateur:", error);
        }
    }, 0);
}
async function cacheDataForModals() {
    const chantiersData = await getActiveChantiers();
    chantiersCache = chantiersData.map(c => c.name);
    colleaguesCache = await getTeamMembers();
}
async function checkForOpenPointage() {
    const q = query(collection(db, "pointages"), where("uid", "==", currentUser.uid), where("endTime", "==", null), limit(1));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
        const openPointageDoc = snapshot.docs[0];
        const pointageData = { docId: openPointageDoc.id, ...openPointageDoc.data() };
        if (!pointageData.pauses) pointageData.pauses = [];
        if (!pointageData.status) pointageData.status = 'running';
        localStorage.setItem('activePointage', JSON.stringify(pointageData));
    } else {
        localStorage.removeItem('activePointage');
    }
    initLiveTracker();
}
function initLiveTracker() {
    const container = document.getElementById('live-tracker-container');
    if (!container) return;
    const activePointage = JSON.parse(localStorage.getItem('activePointage'));
    if (activePointage && activePointage.uid === currentUser.uid) {
        const isPaused = activePointage.status === 'paused';
        container.innerHTML = `
            <div class="text-center">
                <p style="color: var(--color-text-muted);">Pointage en cours sur :</p>
                <p class="text-2xl font-bold my-2" style="color: var(--color-primary);">${activePointage.chantier}</p>
                <div id="timer" class="text-5xl font-mono my-4 tracking-wider ${isPaused ? 'text-yellow-500' : ''}">00:00:00</div>
                ${isPaused ? '<p class="text-yellow-600 font-semibold mb-4">PAUSE</p>' : ''}
                <div class="flex flex-col sm:flex-row gap-4 justify-center">
                    <button id="pauseResumeBtn" class="w-full sm:w-auto font-bold px-8 py-4 rounded-lg text-lg shadow-lg ${isPaused ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-yellow-500 hover:bg-yellow-600 text-white'}">${isPaused ? 'Reprendre' : 'Pause'}</button>
                    <button id="stopBtn" class="w-full sm:w-auto bg-red-600 hover:bg-red-700 text-white font-bold px-8 py-4 rounded-lg text-lg shadow-lg">Arrêter</button>
                </div>
            </div>`;
        updateTimerUI();
        if (!isPaused) timerInterval = setInterval(updateTimerUI, 1000);
        document.getElementById('pauseResumeBtn').onclick = isPaused ? resumePointage : pausePointage;
        document.getElementById('stopBtn').onclick = openStopModal;
    } else {
        container.innerHTML = `
            <div class="text-center">
                <h3 class="text-xl font-bold mb-2">Prêt à commencer votre journée ?</h3>
                <button id="startBtn" class="w-full md:w-auto text-white font-bold px-8 py-4 rounded-lg text-lg shadow-lg" style="background-color: var(--color-primary); transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='var(--color-primary-hover)'" onmouseout="this.style.backgroundColor='var(--color-primary)'">Démarrer un nouveau pointage</button>
            </div>`;
        document.getElementById('startBtn').onclick = openStartModal;
    }
}
function updateTimerUI() {
    const timerElement = document.getElementById('timer');
    const activePointage = JSON.parse(localStorage.getItem('activePointage'));
    if (!timerElement || !activePointage) { clearInterval(timerInterval); return; }
    const startTime = new Date(activePointage.timestamp);
    let totalPauseMs = (activePointage.pauses || []).reduce((acc, p) => acc + (p.end ? new Date(p.end) - new Date(p.start) : 0), 0);
    let effectiveElapsedTime;
    if (activePointage.status === 'paused') {
        const lastPauseStart = new Date(activePointage.pauses.slice(-1)[0].start);
        effectiveElapsedTime = (lastPauseStart - startTime) - totalPauseMs;
    } else {
        effectiveElapsedTime = (new Date() - startTime) - totalPauseMs;
    }
    const hours = String(Math.floor(effectiveElapsedTime / 3600000)).padStart(2, '0');
    const minutes = String(Math.floor((effectiveElapsedTime % 3600000) / 60000)).padStart(2, '0');
    const seconds = String(Math.floor((effectiveElapsedTime % 60000) / 1000)).padStart(2, '0');
    timerElement.textContent = `${hours}:${minutes}:${seconds}`;
}
function pausePointage() {
    clearInterval(timerInterval);
    let activePointage = JSON.parse(localStorage.getItem('activePointage'));
    activePointage.status = 'paused';
    if (!activePointage.pauses) activePointage.pauses = [];
    activePointage.pauses.push({ start: new Date().toISOString(), end: null });
    localStorage.setItem('activePointage', JSON.stringify(activePointage));
    const pointageRef = doc(db, "pointages", activePointage.docId);
    updateDoc(pointageRef, { status: 'paused', pauses: activePointage.pauses });
    initLiveTracker();
}
function resumePointage() {
    let activePointage = JSON.parse(localStorage.getItem('activePointage'));
    activePointage.status = 'running';
    const lastPause = activePointage.pauses.slice(-1)[0];
    if (lastPause && !lastPause.end) lastPause.end = new Date().toISOString();
    localStorage.setItem('activePointage', JSON.stringify(activePointage));
    const pointageRef = doc(db, "pointages", activePointage.docId);
    updateDoc(pointageRef, { status: 'running', pauses: activePointage.pauses });
    initLiveTracker();
}
async function startPointage(chantierName, colleagues) {
    const isDriver = document.getElementById('isDriverCheckbox').checked;
    const newPointageData = {
        uid: currentUser.uid, userName: currentUser.displayName, chantier: chantierName, colleagues,
        timestamp: new Date().toISOString(), endTime: null, status: 'running', pauses: [], createdAt: serverTimestamp(),
        isDriver: isDriver
    };
    try {
        const newPointageRef = await addDoc(collection(db, "pointages"), newPointageData);
        localStorage.setItem('activePointage', JSON.stringify({ docId: newPointageRef.id, ...newPointageData }));
        const lastPointageQuery = query(collection(db, "pointages"), where("uid", "==", currentUser.uid), where("endTime", "!=", null), orderBy("endTime", "desc"), limit(1));
        const lastPointageSnapshot = await getDocs(lastPointageQuery);
        let startAddressForTravel = HOME_BASE_ADDRESS;
        if (!lastPointageSnapshot.empty) {
            const lastPointageDoc = lastPointageSnapshot.docs[0].data();
            const lastEndTime = new Date(lastPointageDoc.endTime);
            const now = new Date();
            if (lastEndTime.toDateString() === now.toDateString()) {
                const lastChantierQuery = query(collection(db, "chantiers"), where("name", "==", lastPointageDoc.chantier), limit(1));
                const lastChantierSnapshot = await getDocs(lastChantierQuery);
                if (!lastChantierSnapshot.empty) {
                    startAddressForTravel = lastChantierSnapshot.docs[0].data().address;
                }
            }
        }
        const newChantierQuery = query(collection(db, "chantiers"), where("name", "==", chantierName), limit(1));
        const newChantierSnapshot = await getDocs(newChantierQuery);
        if (!newChantierSnapshot.empty) {
            const newChantierAddress = newChantierSnapshot.docs[0].data().address;
            if (newChantierAddress !== startAddressForTravel) {
                calculateAndSaveTravel(startAddressForTravel, newChantierAddress, newPointageRef.id, isDriver);
            }
        }
        initLiveTracker();
    } catch (error) {
        console.error("Erreur de démarrage du pointage:", error);
        showInfoModal("Erreur", "Le démarrage du pointage a échoué.");
    }
}
async function stopPointage(notes = "") {
    let activePointage = JSON.parse(localStorage.getItem('activePointage'));
    if (!activePointage || !activePointage.docId) return;
    if (activePointage.status === 'paused') {
        const lastPause = activePointage.pauses.slice(-1)[0];
        if (lastPause && !lastPause.end) lastPause.end = new Date().toISOString();
    }
    const totalPauseMs = (activePointage.pauses || []).reduce((acc, p) => acc + (p.end ? new Date(p.end) - new Date(p.start) : 0), 0);
    const pointageRef = doc(db, "pointages", activePointage.docId);
    try {
        await updateDoc(pointageRef, { endTime: new Date().toISOString(), notes, pauseDurationMs: totalPauseMs, status: 'completed' });
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
async function calculateAndSaveTravel(startAddress, endAddress, arrivalPointageId, isDriver) {
    if (!startAddress || !endAddress) {
        console.log("Adresse de départ ou d'arrivée manquante pour le calcul du trajet.");
        return;
    }
    try {
        const getCoordinates = async (address) => {
            const geocodeUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${MAPBOX_ACCESS_TOKEN}&limit=1&country=BE`;
            const response = await fetch(geocodeUrl);
            const data = await response.json();
            if (!data.features || data.features.length === 0) throw new Error(`Adresse non trouvée : ${address}`);
            return data.features[0].center;
        };
        const startCoords = await getCoordinates(startAddress);
        const endCoords = await getCoordinates(endAddress);
        const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${startCoords.join(',')};${endCoords.join(',')}?access_token=${MAPBOX_ACCESS_TOKEN}&geometries=geojson`;
        const response = await fetch(url);
        const data = await response.json();
        if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
            throw new Error(data.message || "Itinéraire non trouvé.");
        }
        const route = data.routes[0];
        const distanceKm = isDriver ? (route.distance / 1000).toFixed(2) : 0;
        const durationMin = Math.round(route.duration / 60);
        await addDoc(collection(db, "trajets"), {
            id_utilisateur: currentUser.uid,
            id_pointage_arrivee: arrivalPointageId, 
            distance_km: parseFloat(distanceKm),
            duree_min: durationMin,
            date_creation: serverTimestamp()
        });
    } catch (error) {
        console.error("Erreur lors du calcul du trajet:", error);
    }
}
async function openStartModal() {
    const modal = document.getElementById('startPointageModal');
    const form = document.getElementById('startPointageForm');
    const chantierSelect = document.getElementById('startChantierSelect');
    const colleaguesContainer = document.getElementById('startColleaguesContainer');
    chantierSelect.innerHTML = '<option>Chargement du planning...</option>';
    colleaguesContainer.innerHTML = `<p class="text-sm" style="color: var(--color-text-muted);">Chargement...</p>`;
    modal.classList.remove('hidden');
    const { weeklyChantiers, todaysColleagues, todaysChantiers } = await getContextualLists();
    const weeklyChantiersOnly = new Set([...weeklyChantiers].filter(chantier => !todaysChantiers.has(chantier)));
    const otherChantiers = chantiersCache.filter(name => !weeklyChantiers.has(name));
    let chantierOptionsHTML = '';
    if (todaysChantiers.size > 0) {
        chantierOptionsHTML += '<optgroup label="Chantiers du jour">';
        todaysChantiers.forEach(name => { chantierOptionsHTML += `<option value="${name}">${name}</option>`; });
        chantierOptionsHTML += '</optgroup>';
    }
    if (weeklyChantiersOnly.size > 0) {
        chantierOptionsHTML += '<optgroup label="Autres chantiers de la semaine">';
        weeklyChantiersOnly.forEach(name => { chantierOptionsHTML += `<option value="${name}">${name}</option>`; });
        chantierOptionsHTML += '</optgroup>';
    }
    if (otherChantiers.length > 0) {
        chantierOptionsHTML += '<optgroup label="Tous les autres chantiers">';
        otherChantiers.forEach(name => { chantierOptionsHTML += `<option value="${name}">${name}</option>`; });
        chantierOptionsHTML += '</optgroup>';
    }
    chantierSelect.innerHTML = chantierOptionsHTML;
    if (!chantierSelect.innerHTML) {
         chantierSelect.innerHTML = '<option value="" disabled selected>-- Choisissez un chantier --</option>';
         chantiersCache.forEach(name => { chantierSelect.innerHTML += `<option value="${name}">${name}</option>`; });
    }
    const otherColleagues = colleaguesCache.filter(name => !todaysColleagues.has(name) && name !== currentUser.displayName);
    const createColleagueElement = (name) => `<label class="flex items-center gap-2 p-1 rounded w-full"><input type="checkbox" value="${name}" name="colleagues" /><span>${name}</span></label>`;
    let colleaguesHTML = '';
    if (todaysColleagues.size > 0) {
        todaysColleagues.forEach(name => { colleaguesHTML += createColleagueElement(name); });
        colleaguesHTML += `<div class="w-full border-t my-2" style="border-color: var(--color-border);"></div>`;
    }
    colleaguesContainer.innerHTML = colleaguesHTML;
    if (otherColleagues.length > 0) {
        const showAllButton = document.createElement('button');
        showAllButton.type = 'button';
        showAllButton.textContent = `Afficher les ${otherColleagues.length} autres...`;
        showAllButton.className = 'text-sm hover:underline w-full text-center p-1';
        showAllButton.style.color = 'var(--color-primary)';
        showAllButton.onclick = () => {
            showAllButton.remove();
            colleaguesContainer.insertAdjacentHTML('beforeend', otherColleagues.map(createColleagueElement).join(''));
        };
        colleaguesContainer.appendChild(showAllButton);
    }
    form.onsubmit = (e) => {
        e.preventDefault();
        const chantier = chantierSelect.value;
        if (!chantier) { showInfoModal("Attention", "Veuillez choisir un chantier."); return; }
        const selectedColleagues = Array.from(document.querySelectorAll('input[name="colleagues"]:checked')).map(el => el.value);
        startPointage(chantier, selectedColleagues);
        closeStartModal();
    };
    document.getElementById('cancelStartPointage').onclick = closeStartModal;
}
async function getContextualLists() {
    const { startOfWeek, endOfWeek } = getWeekDateRange(0);
    const todayStr = new Date().toISOString().split('T')[0];
    const weeklyChantiers = new Set(), todaysColleagues = new Set(), todaysChantiers = new Set();
    try {
        const q = query(collection(db, "planning"), where("date", ">=", startOfWeek.toISOString().split('T')[0]), where("date", "<=", endOfWeek.toISOString().split('T')[0]));
        const querySnapshot = await getDocs(q);
        querySnapshot.docs.forEach(doc => {
            const task = doc.data();
            if (task.teamNames && task.teamNames.includes(currentUser.displayName)) {
                weeklyChantiers.add(task.chantierName);
                if (task.date === todayStr) {
                    todaysChantiers.add(task.chantierName);
                    task.teamNames.forEach(name => {
                        if (name !== currentUser.displayName) { todaysColleagues.add(name); }
                    });
                }
            }
        });
    } catch (error) { console.error("Impossible de charger le planning contextuel:", error); }
    return { weeklyChantiers, todaysColleagues, todaysChantiers };
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
    document.getElementById('stopPointageForm').onsubmit = (e) => {
        e.preventDefault();
        const notes = document.getElementById('pointageNotes').value.trim();
        stopPointage(notes);
        modal.classList.add('hidden');
    };
}
function displayWeekView() {
    const { startOfWeek, endOfWeek } = getWeekDateRange(currentWeekOffset);
    const options = { day: 'numeric', month: 'long', timeZone: 'UTC' };
    const displayElement = document.getElementById("currentPeriodDisplay");
    if(displayElement) {
        displayElement.textContent = `Semaine du ${startOfWeek.toLocaleDateString('fr-FR', options)} au ${endOfWeek.toLocaleDateString('fr-FR', options)}`;
    }
    const scheduleGrid = document.getElementById("schedule-grid");
    if(scheduleGrid) {
        scheduleGrid.innerHTML = ""; 
        const days = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
        for (let i = 0; i < 7; i++) {
            const dayDate = new Date(startOfWeek);
            dayDate.setUTCDate(startOfWeek.getUTCDate() + i);
            const dayColumn = document.createElement('div');
            dayColumn.className = 'rounded-lg p-2 min-h-[100px]';
            dayColumn.style.backgroundColor = 'var(--color-background)';
            dayColumn.innerHTML = `<h4 class="font-bold text-center border-b pb-1 mb-2" style="border-color: var(--color-border);"><span style="color: var(--color-text-base);">${days[i]}</span> <span class="text-sm font-normal" style="color: var(--color-text-muted);">${dayDate.getUTCDate()}</span></h4><div id="day-col-${i}" class="space-y-2"></div>`;
            scheduleGrid.appendChild(dayColumn);
        }
        loadUserScheduleForWeek(startOfWeek, endOfWeek);
    }
}
async function loadUserScheduleForWeek(start, end) {
    const weekId = start.toISOString().split('T')[0];
    const publishDoc = await getDoc(doc(db, "publishedSchedules", weekId));
    const scheduleGrid = document.getElementById("schedule-grid");

    if (!publishDoc.exists()) {
        if(scheduleGrid) scheduleGrid.innerHTML = `<p class='col-span-1 md:col-span-7 text-center p-4' style='color: var(--color-text-muted);'>Le planning de cette semaine n'a pas encore été publié.</p>`;
        return;
    }

    const planningQuery = query(collection(db, "planning"), 
        where("date", ">=", start.toISOString().split('T')[0]), 
        where("date", "<=", end.toISOString().split('T')[0]), 
        orderBy("date"),
        orderBy("order")
    );
    const planningSnapshot = await getDocs(planningQuery);

    const scheduleData = planningSnapshot.docs.map(doc => doc.data());
    const userSchedule = scheduleData.filter(task => task.teamNames && task.teamNames.includes(currentUser.displayName));

    const plannedHoursByChantier = {};
    userSchedule.forEach(task => {
        const chantierName = task.chantierName;
        const duration = parseFloat(task.duration) || 0;
        if (!plannedHoursByChantier[chantierName]) {
            plannedHoursByChantier[chantierName] = 0;
        }
        plannedHoursByChantier[chantierName] += duration;
    });

    for (let i = 0; i < 7; i++) {
        const dayColumn = document.getElementById(`day-col-${i}`);
        if (dayColumn) dayColumn.innerHTML = '';
    }
    
    userSchedule.forEach(data => {
        const utcDate = new Date(data.date + 'T12:00:00Z');
        const dayIndex = (utcDate.getUTCDay() + 6) % 7;
        const container = document.getElementById(`day-col-${dayIndex}`);
        if (container) {
            const totalPlannedHours = plannedHoursByChantier[data.chantierName] || 0;
            // On récupère les détails du chantier depuis le cache
            const chantierDetails = chantiersCache.find(c => c.id === data.chantierId);
            container.appendChild(createTaskElement(data, totalPlannedHours, chantierDetails));
        }
    });
}

function createTaskElement(task, totalPlannedHours, chantierDetails) {
    const el = document.createElement('div');
    el.className = 'p-3 rounded-lg shadow-sm border-l-4 text-sm';
    el.style.backgroundColor = 'var(--color-surface)';
    el.style.borderColor = 'var(--color-primary)';
    
    const team = (task.teamNames && task.teamNames.length) ? `Équipe : ${task.teamNames.join(', ')}` : 'Pas d\'équipe';
    const note = task.notes ? `<div class="mt-2 pt-2 border-t text-xs" style="border-color: var(--color-border); color: var(--color-primary);"><strong>Note:</strong> ${task.notes}</div>` : '';

    const start = task.startTime ? `<strong>${task.startTime}</strong> - ` : '';
    const dailyHoursText = `${start}${task.duration || ''}h prévues`;

    let plannedHoursHTML = '';
    if (totalPlannedHours > 0) {
        plannedHoursHTML = `<div class="text-xs mt-1" style="color: var(--color-text-muted);">
                               Total planifié (semaine) : <strong>${totalPlannedHours}h</strong>
                            </div>`;
    }

    // On ajoute le budget total du projet
    let projectBudgetHTML = '';
    if (chantierDetails && chantierDetails.totalHeuresPrevues > 0) {
        projectBudgetHTML = `<div class="text-xs mt-1" style="color: var(--color-text-muted);">
                                Budget total (projet) : <strong>${chantierDetails.totalHeuresPrevues}h</strong>
                             </div>`;
    }

    el.innerHTML = `<div class="font-semibold" style="color: var(--color-text-base);">${task.chantierName}</div>
                    <div class="text-xs mt-1" style="color: var(--color-text-base);">${dailyHoursText}</div>
                    <div class="text-xs mt-1" style="color: var(--color-text-muted);">${team}</div>
                    <div class="mt-2 pt-2 border-t" style="border-color: var(--color-border);">
                        ${plannedHoursHTML}
                        ${projectBudgetHTML}
                    </div>
                    ${note}`;
    return el;
}

async function checkForMissedPointages() {
    const suggestionsContainer = document.getElementById('missed-pointage-suggestions');
    if (!suggestionsContainer) return;
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const suggestionsQuery = query(
        collection(db, "pointages"),
        where("colleagues", "array-contains", currentUser.displayName),
        where("timestamp", ">=", twoDaysAgo.toISOString()),
        orderBy("timestamp", "desc")
    );
    const userPointagesQuery = query(
        collection(db, "pointages"),
        where("uid", "==", currentUser.uid),
        where("timestamp", ">=", twoDaysAgo.toISOString())
    );
    const [suggestionsSnapshot, userPointagesSnapshot] = await Promise.all([
        getDocs(suggestionsQuery),
        getDocs(userPointagesQuery)
    ]);
    const userExistingPointages = new Set();
    userPointagesSnapshot.forEach(doc => {
        const data = doc.data();
        const day = new Date(data.timestamp).toISOString().split('T')[0];
        userExistingPointages.add(`${day}_${data.chantier}`);
    });
    const refusedPointages = JSON.parse(localStorage.getItem('refusedPointages') || '[]');
    const finalSuggestions = [];
    suggestionsSnapshot.forEach(doc => {
        const suggestion = { id: doc.id, ...doc.data() };
        if (!suggestion.endTime) return;
        const suggestionDay = new Date(suggestion.timestamp).toISOString().split('T')[0];
        const suggestionKey = `${suggestionDay}_${suggestion.chantier}`;
        if (!refusedPointages.includes(suggestion.id) && !userExistingPointages.has(suggestionKey)) {
            finalSuggestions.push(suggestion);
        }
    });
    if (finalSuggestions.length > 0) {
        renderSuggestions(finalSuggestions);
    }
}
function renderSuggestions(suggestions) {
    const container = document.getElementById('missed-pointage-suggestions');
    container.innerHTML = `<h3 class="text-lg font-semibold" style="color: var(--color-text-base);">Suggestions de pointages manqués :</h3>`;
    suggestions.forEach(sugg => {
        const start = new Date(sugg.timestamp);
        const end = new Date(sugg.endTime);
        const timeFormat = { hour: '2-digit', minute: '2-digit' };
        const card = document.createElement('div');
        card.className = 'border-l-4 p-4 rounded-r-lg shadow-sm';
        card.style.borderColor = 'orange';
        card.style.backgroundColor = 'var(--color-surface)';
        card.innerHTML = `
            <p class="font-semibold">${sugg.userName} a pointé sur le chantier <strong style="color: var(--color-primary);">${sugg.chantier}</strong>.</p>
            <p class="text-sm" style="color: var(--color-text-muted);">Le ${start.toLocaleDateString('fr-FR')} de ${start.toLocaleTimeString('fr-FR', timeFormat)} à ${end.toLocaleTimeString('fr-FR', timeFormat)}.</p>
            <p class="mt-2 font-medium">Étiez-vous avec cette personne ?</p>
            <div class="flex gap-4 mt-3">
                <button class="accept-suggestion-btn bg-green-600 hover:bg-green-700 text-white font-bold px-4 py-2 rounded-lg" data-sugg-id="${sugg.id}">Oui, accepter</button>
                <button class="refuse-suggestion-btn font-bold px-4 py-2 rounded-lg" data-sugg-id="${sugg.id}" style="background-color: var(--color-background);">Non, refuser</button>
            </div>
        `;
        container.appendChild(card);
    });
    container.addEventListener('click', handleSuggestionClick);
}
async function handleSuggestionClick(e) {
    const button = e.target;
    const suggId = button.dataset.suggId;
    if (!suggId) return;
    if (button.classList.contains('accept-suggestion-btn')) {
        const suggDoc = await getDoc(doc(db, "pointages", suggId));
        if (!suggDoc.exists()) {
             showInfoModal("Erreur", "Le pointage original n'a pas été trouvé.");
             return;
        }
        const suggestion = suggDoc.data();
        const originalColleagues = suggestion.colleagues || [];
        const filteredColleagues = originalColleagues.filter(name => name !== currentUser.displayName);
        const finalColleagues = [...new Set([...filteredColleagues, suggestion.userName])];
        const newPointageData = {
            ...suggestion,
            uid: currentUser.uid,
            userName: currentUser.displayName,
            colleagues: finalColleagues,
            createdAt: serverTimestamp(),
            notes: `(Pointage ajouté depuis la saisie de ${suggestion.userName}) --- ${suggestion.notes || ''}`
        };
        try {
            await addDoc(collection(db, "pointages"), newPointageData);
            showInfoModal("Succès", "Le pointage a été ajouté à votre historique.");
        } catch (error) {
            console.error(error);
            showInfoModal("Erreur", "Impossible d'ajouter le pointage.");
        }
    } else if (button.classList.contains('refuse-suggestion-btn')) {
        const refusedPointages = JSON.parse(localStorage.getItem('refusedPointages') || '[]');
        if (!refusedPointages.includes(suggId)) {
            refusedPointages.push(suggId);
            localStorage.setItem('refusedPointages', JSON.stringify(refusedPointages));
        }
    }
    button.closest('div.border-l-4').remove();
}