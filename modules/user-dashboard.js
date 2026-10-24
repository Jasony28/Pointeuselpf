import { collection, query, where, orderBy, getDocs, doc, getDoc, addDoc, setDoc, deleteDoc, serverTimestamp, updateDoc, limit, onSnapshot } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, currentUser, pageContent, showInfoModal, showToast, navigateTo } from "../app.js";
import { getWeekDateRange, formatMilliseconds } from "./utils.js";
import { getActiveChantiers, getTeamMembers } from "./data-service.js";

const MAPBOX_ACCESS_TOKEN = "pk.eyJ1IjoiamFzb255MjgiLCJhIjoiY21lMDcyYWhzMDIyODJsczl0cmM0aTVjciJ9.V14cJXdBNoq3yAQTDeUg-A";
const HOME_BASE_ADDRESS = "Marche-en-Famenne, Belgium";

let timerInterval = null;
let chantiersCache = [];
let colleaguesCache = [];
let currentWeekOffset = 0;
let unreadListener = null;

// Appelé par app.js quand on quitte la page : stoppe l'écoute des messages et le minuteur affiché
export function cleanup() {
    if (unreadListener) { unreadListener(); unreadListener = null; }
    clearInterval(timerInterval);
}

export async function render() {
    if (unreadListener) {
        unreadListener();
        unreadListener = null;
    }

    pageContent.innerHTML = `
        <div class="max-w-4xl mx-auto space-y-8">
            <div id="live-tracker-container" class="p-6 rounded-lg shadow-lg" style="background-color: var(--color-surface); border: 1px solid var(--color-border);"></div>
            <div id="missed-pointage-suggestions" class="space-y-4"></div>
            <div id="unread-messages-container" class="hidden transform transition-all duration-300 hover:scale-[1.01] cursor-pointer"></div>
            <div>
                <h2 class="text-xl font-bold mb-3">Mon Planning de la Semaine</h2>
                <div class="rounded-lg shadow-sm p-3" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                    <div class="flex justify-between items-center gap-2">
                        <button id="prevWeekBtn" class="nav-arrow" aria-label="Semaine précédente"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg></button>
                        <div class="text-center min-w-0">
                            <div id="currentPeriodDisplay" class="font-semibold"></div>
                            <div id="currentWeekTotalHours" class="week-total-pill"></div>
                        </div>
                        <button id="nextWeekBtn" class="nav-arrow" aria-label="Semaine suivante"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></button>
                    </div>
                </div>
                <p class="swipe-hint">Glissez vers la gauche ou la droite pour changer de semaine</p>
                <div id="schedule-grid" class="schedule-grid grid grid-cols-1 md:grid-cols-7 gap-2 mt-3"></div>
            </div>
        </div>

        <div id="startPointageModal" class="hidden fixed inset-0 z-50 bg-black bg-opacity-50 flex justify-center items-center p-4">
            <div class="p-6 rounded-lg w-full max-w-md bg-white text-gray-900 shadow-xl">
                <h3 class="text-xl font-bold mb-4 text-black">Démarrer un pointage</h3>
                <form id="startPointageForm" class="space-y-4">
                    <div>
                        <label class="text-sm font-medium text-gray-700">Chantier</label>
                        <select id="startChantierSelect" class="w-full border p-2 rounded mt-1 bg-white text-gray-900 border-gray-300" required></select>
                    </div>
                    <div>
                        <label class="text-sm font-medium text-gray-700">Collègues présents</label>
                        <div id="startColleaguesContainer" class="mt-1 p-2 border rounded max-h-40 overflow-y-auto space-y-1 bg-gray-50 border-gray-300 text-gray-800"></div>
                    </div>
                    <div class="pt-2 border-t border-gray-200">
                        <label class="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-gray-100">
                            <input type="checkbox" id="isDriverCheckbox" class="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"/>
                            <span class="text-sm font-medium text-gray-700">Je suis le conducteur (pour le calcul des km)</span>
                        </label>
                    </div>
                    <div class="flex justify-end gap-4 pt-4">
                        <button type="button" id="cancelStartPointage" class="px-4 py-2 rounded bg-gray-200 text-gray-800 hover:bg-gray-300 border border-gray-300 transition-colors">Annuler</button>
                        <button type="submit" class="text-white px-4 py-2 rounded font-bold transition-colors" style="background-color: var(--color-primary);">Démarrer</button>
                    </div>
                </form>
            </div>
        </div>

        <div id="stopPointageModal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
            <div class="p-6 rounded-lg shadow-xl w-full max-w-md bg-white text-gray-900">
                <h3 class="text-xl font-bold mb-4 text-black">Finaliser le pointage</h3>
                <form id="stopPointageForm">
                    <div class="space-y-4">
                        <div>
                            <label for="pointageNotes" class="text-sm font-medium text-gray-700">Note (facultatif)</label>
                            <textarea id="pointageNotes" placeholder="Ex: Matériel manquant..." class="w-full border p-2 rounded mt-1 h-24 bg-white text-gray-900 border-gray-300 focus:ring-blue-500 focus:border-blue-500"></textarea>
                        </div>
                        <div class="flex justify-end gap-4 pt-4">
                            <button type="button" id="cancelStopPointage" class="px-4 py-2 rounded bg-gray-200 text-gray-800 hover:bg-gray-300 border border-gray-300 transition-colors">Annuler</button>
                            <button type="submit" class="bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2 rounded transition-colors">Arrêter et Enregistrer</button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    `;

    // ÉCOUTE DES CLICS AU NIVEAU PARENT POUR ÉVITER L'ERREUR "NULL"
    pageContent.onclick = (e) => {
        if (e.target.id === 'startBtn') openStartModal();
        if (e.target.id === 'prevWeekBtn') { currentWeekOffset--; displayWeekView(); }
        if (e.target.id === 'nextWeekBtn') { currentWeekOffset++; displayWeekView(); }
        if (e.target.id === 'currentPeriodDisplay' && currentWeekOffset !== 0) { currentWeekOffset = 0; displayWeekView(); }
        const addDayBtn = e.target.closest?.('.add-day-task');
        if (addDayBtn) openAddTaskModal(addDayBtn.dataset.date);
        if (e.target.id === 'cancelStartPointage') document.getElementById('startPointageModal').classList.add('hidden');
        if (e.target.id === 'cancelStopPointage') document.getElementById('stopPointageModal').classList.add('hidden');
        if (e.target.id === 'closeDetailsBtn') document.getElementById('detailsModal').classList.add('hidden');
        if (e.target.id === 'closeNavModalBtn') document.getElementById('navigationModal').classList.add('hidden');
    };

    setTimeout(async () => {
        try {
            await cacheDataForModals();
            await checkForOpenPointage();
            initUnreadMessagesListener();
            if (!localStorage.getItem('activePointage')) checkForMissedPointages();
            
            displayWeekView();
            enableWeekSwipe();
        } catch (error) {
            console.error("Erreur critique dashboard:", error);
        }
    }, 100);
}

async function cacheDataForModals() {
    const chantiersData = await getActiveChantiers();
    chantiersCache = chantiersData; 
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
        const startedAt = new Date(activePointage.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        let chantierHTML = `<p class="tracker-chantier">${activePointage.chantier}</p>`;

        if (activePointage.chantierId) {
            chantierHTML = `<p id="liveChantierName" class="tracker-chantier is-link">${activePointage.chantier}</p>`;
        }

        container.innerHTML = `
            <div class="tracker ${isPaused ? 'is-paused' : 'is-running'}">
                <span class="tracker-status"><span class="tracker-dot"></span>${isPaused ? 'En pause' : 'Pointage en cours'}</span>
                ${chantierHTML}
                <div id="timer" class="tracker-timer">00:00:00</div>
                <p class="tracker-meta">Démarré à ${startedAt}${(activePointage.pauses || []).length > 0 ? ` · ${activePointage.pauses.length} pause${activePointage.pauses.length > 1 ? 's' : ''}` : ''}</p>
                <div class="tracker-actions">
                    <button id="pauseResumeBtn" class="tracker-btn ${isPaused ? 'tracker-btn-resume' : 'tracker-btn-pause'}">${isPaused ? 'Reprendre' : 'Pause'}</button>
                    <button id="stopBtn" class="tracker-btn tracker-btn-stop">Arrêter</button>
                </div>
            </div>`;

        if (activePointage.chantierId) {
            const chantierNameEl = document.getElementById('liveChantierName');
            if(chantierNameEl) {
                chantierNameEl.onclick = () => dbShowDetailsModal(activePointage.chantierId);
            }
        }

        updateTimerUI();
        clearInterval(timerInterval);
        if (!isPaused) timerInterval = setInterval(updateTimerUI, 1000);
        document.getElementById('pauseResumeBtn').onclick = isPaused ? resumePointage : pausePointage;
        document.getElementById('stopBtn').onclick = openStopModal;
    } else {
        if (document.getElementById('breadcrumb-page')?.textContent === 'Planning') document.title = 'Planning · Pointeuse LPF';
        const hour = new Date().getHours();
        const greeting = hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir';
        const firstName = (currentUser.displayName || '').split(' ')[0];
        container.innerHTML = `
            <div class="tracker is-idle">
                <p class="tracker-greeting">${greeting}${firstName ? ` ${firstName}` : ''}</p>
                <h3 class="tracker-idle-title">Prêt à commencer votre journée ?</h3>
                <p class="tracker-meta">${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                <button id="startBtn" class="tracker-btn tracker-btn-start">Démarrer un nouveau pointage</button>
            </div>`;
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
    // Minuteur visible dans l'onglet / le sélecteur d'applications (uniquement sur l'écran Planning)
    if (document.getElementById('breadcrumb-page')?.textContent === 'Planning') {
        document.title = `${activePointage.status === 'paused' ? '⏸ ' : ''}${hours}:${minutes}:${seconds} · ${activePointage.chantier}`;
    }
}

// Glisser horizontalement sur le planning pour passer à la semaine précédente / suivante
function enableWeekSwipe() {
    const area = document.getElementById('schedule-grid');
    if (!area) return;
    let startX = null, startY = null;
    area.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
    }, { passive: true });
    area.addEventListener('touchend', (e) => {
        if (startX === null) return;
        const dx = e.changedTouches[0].clientX - startX;
        const dy = e.changedTouches[0].clientY - startY;
        startX = null;
        if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
        currentWeekOffset += dx < 0 ? 1 : -1;
        vibrate(10);
        displayWeekView();
    }, { passive: true });
}

// Retour haptique discret sur les actions de pointage (Android ; ignoré ailleurs)
function vibrate(pattern) {
    if (navigator.vibrate) navigator.vibrate(pattern);
}

function pausePointage() {
    vibrate(30);
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
    vibrate(30);
    let activePointage = JSON.parse(localStorage.getItem('activePointage'));
    activePointage.status = 'running';
    const lastPause = activePointage.pauses.slice(-1)[0];
    if (lastPause && !lastPause.end) lastPause.end = new Date().toISOString();
    localStorage.setItem('activePointage', JSON.stringify(activePointage));
    const pointageRef = doc(db, "pointages", activePointage.docId);
    updateDoc(pointageRef, { status: 'running', pauses: activePointage.pauses });
    initLiveTracker();
}

async function startPointage(chantierId, chantierName, colleagues) {
    const isDriver = document.getElementById('isDriverCheckbox').checked;
    
    const newPointageData = {
        uid: currentUser.uid, userName: currentUser.displayName, 
        chantier: chantierName, 
        chantierId: chantierId,
        colleagues,
        timestamp: new Date().toISOString(), endTime: null, status: 'running', pauses: [], createdAt: serverTimestamp(),
        isDriver: isDriver
    };

    try {
        // L'identifiant est créé sur le téléphone : le minuteur démarre tout de suite, même hors ligne.
        // Firestore garde l'écriture en attente et l'envoie dès que le réseau revient.
        const newPointageRef = doc(collection(db, "pointages"));
        setDoc(newPointageRef, newPointageData).catch(error => {
            console.error("Erreur d'envoi du pointage:", error);
            showInfoModal("Erreur", "Le pointage n'a pas pu être enregistré sur le serveur.");
        });
        localStorage.setItem('activePointage', JSON.stringify({ docId: newPointageRef.id, ...newPointageData }));
        vibrate(40);
        initLiveTracker();
        if (!navigator.onLine) {
            showToast("Hors ligne : pointage démarré. Il sera envoyé dès le retour du réseau.", 'warning');
            return; // le calcul du trajet demande Internet
        }

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
        
        const newChantier = chantiersCache.find(c => c.id === chantierId);
        if (newChantier && newChantier.address) {
            const newChantierAddress = newChantier.address;
            if (newChantierAddress !== startAddressForTravel) {
                calculateAndSaveTravel(startAddressForTravel, newChantierAddress, newPointageRef.id, isDriver);
            }
        }
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
    // Arrêt immédiat à l'écran ; l'envoi au serveur se fait dès que le réseau est disponible
    const saving = updateDoc(pointageRef, { endTime: new Date().toISOString(), notes, pauseDurationMs: totalPauseMs, status: 'completed' });
    vibrate([40, 60, 40]);
    clearInterval(timerInterval);
    localStorage.removeItem('activePointage');
    initLiveTracker();
    if (!navigator.onLine) {
        showToast("Hors ligne : pointage enregistré sur le téléphone. Il sera ajouté à l'historique dès le retour du réseau.", 'warning');
        saving.catch(error => console.error("Erreur d'enregistrement:", error));
        return;
    }
    try {
        await saving;
        showInfoModal("Succès", "Pointage enregistré avec succès !");
    } catch (error) {
        console.error("Erreur d'enregistrement:", error);
        showInfoModal("Erreur", "Une erreur est survenue lors de l'enregistrement.");
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

    if (!modal || !form || !chantierSelect || !colleaguesContainer) {
        console.error("Erreur critique : Un élément du formulaire est introuvable.");
        return;
    }

    chantierSelect.innerHTML = '<option>Chargement...</option>';
    colleaguesContainer.innerHTML = `<p class="text-sm text-gray-500">Chargement...</p>`;
    
    modal.classList.remove('hidden');
    
    const { weeklyChantiers, todaysColleagues, todaysChantiers } = await getContextualLists();
    const weeklyChantiersOnly = new Set([...weeklyChantiers].filter(chantier => !todaysChantiers.has(chantier)));
    const otherChantiers = chantiersCache.filter(chantier => !weeklyChantiers.has(chantier.name));
    
    let chantierOptionsHTML = '';

    const findAndBuildOption = (name) => {
        const chantier = chantiersCache.find(c => c.name === name);
        return chantier ? `<option value="${chantier.id}">${chantier.name}</option>` : '';
    };

    if (todaysChantiers.size > 0) {
        chantierOptionsHTML += '<optgroup label="Chantiers du jour">';
        todaysChantiers.forEach(name => { chantierOptionsHTML += findAndBuildOption(name); });
        chantierOptionsHTML += '</optgroup>';
    }
    if (weeklyChantiersOnly.size > 0) {
        chantierOptionsHTML += '<optgroup label="Autres chantiers de la semaine">';
        weeklyChantiersOnly.forEach(name => { chantierOptionsHTML += findAndBuildOption(name); });
        chantierOptionsHTML += '</optgroup>';
    }
    if (otherChantiers.length > 0) {
        chantierOptionsHTML += '<optgroup label="Tous les autres chantiers">';
        otherChantiers.forEach(chantier => { chantierOptionsHTML += `<option value="${chantier.id}">${chantier.name}</option>`; });
        chantierOptionsHTML += '</optgroup>';
    }
    chantierSelect.innerHTML = chantierOptionsHTML;
    
    if (!chantierSelect.innerHTML) {
         chantierSelect.innerHTML = '<option value="" disabled selected>-- Aucun chantier disponible --</option>';
    }
    
    const otherColleagues = colleaguesCache.filter(colleague => !todaysColleagues.has(colleague.name) && colleague.name !== currentUser.displayName);
    const createColleagueElement = (name) => `<label class="flex items-center gap-3 px-2 py-2 rounded w-full cursor-pointer hover:bg-gray-100"><input type="checkbox" value="${name}" name="colleagues" class="h-5 w-5 rounded text-blue-600 focus:ring-blue-500" /><span class="text-gray-800">${name}</span></label>`;
    let colleaguesHTML = '';
    
    if (todaysColleagues.size > 0) {
        todaysColleagues.forEach(name => { colleaguesHTML += createColleagueElement(name); });
        colleaguesHTML += `<div class="w-full border-t border-gray-200 my-2"></div>`;
    }
    colleaguesContainer.innerHTML = colleaguesHTML;
    
    if (otherColleagues.length > 0) {
        const showAllButton = document.createElement('button');
        showAllButton.type = 'button';
        showAllButton.textContent = `Afficher les ${otherColleagues.length} autres...`;
        showAllButton.className = 'text-sm hover:underline w-full text-center p-2 text-blue-600 font-medium';
        showAllButton.onclick = () => {
            showAllButton.remove();
            colleaguesContainer.insertAdjacentHTML('beforeend', otherColleagues.map(c => c.name).map(createColleagueElement).join(''));
        };
        colleaguesContainer.appendChild(showAllButton);
    }

    form.onsubmit = (e) => {
        e.preventDefault();
        const chantierId = chantierSelect.value;
        if (!chantierId) { showInfoModal("Attention", "Veuillez choisir un chantier."); return; }
        
        const chantierName = chantiersCache.find(c => c.id === chantierId)?.name;
        if (!chantierName) {
            showInfoModal("Erreur", "Chantier sélectionné non trouvé."); return;
        }

        const selectedColleagues = Array.from(document.querySelectorAll('input[name="colleagues"]:checked')).map(el => el.value);
        startPointage(chantierId, chantierName, selectedColleagues);
        modal.classList.add('hidden');
    };
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

function openStopModal() {
    const modal = document.getElementById('stopPointageModal');
    const form = document.getElementById('stopPointageForm');
    if (!modal || !form) return;
    
    form.reset();
    modal.classList.remove('hidden');
    
    form.onsubmit = (e) => {
        e.preventDefault();
        const notes = document.getElementById('pointageNotes').value.trim();
        stopPointage(notes);
        modal.classList.add('hidden');
    };
}

function formatDecimalHours(decimalHours) {
    if (!decimalHours || decimalHours <= 0) return '0h';
    const hours = Math.floor(decimalHours);
    const minutes = Math.round((decimalHours - hours) * 60);
    let parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${String(minutes).padStart(2, '0')}m`);
    return parts.length > 0 ? parts.join(' ') : '0h';
}

function dbShowDetailsModal(chantierId) {
    const chantier = chantiersCache.find(c => c.id === chantierId);
    if (!chantier) return;

    // (La logique d'affichage des détails reste à implémenter si tu avais une modale "Détails" dans ton HTML d'origine)
}

function dbShowNavigationChoice(address) {
    // (La logique de navigation)
}

function displayWeekView() {
    const { startOfWeek, endOfWeek } = getWeekDateRange(currentWeekOffset);
    const options = { day: 'numeric', month: 'long', timeZone: 'UTC' };
    const displayElement = document.getElementById("currentPeriodDisplay");
    if(displayElement) {
        displayElement.textContent = `Semaine du ${startOfWeek.toLocaleDateString('fr-FR', options)} au ${endOfWeek.toLocaleDateString('fr-FR', options)}`;
    }

    const totalHoursElement = document.getElementById("currentWeekTotalHours");
    if (totalHoursElement) totalHoursElement.textContent = 'Chargement...';

    const scheduleGrid = document.getElementById("schedule-grid");
    if(scheduleGrid) {
        scheduleGrid.innerHTML = ""; 
        const days = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
        const todayStr = new Date().toISOString().split('T')[0];
        for (let i = 0; i < 7; i++) {
            const dayDate = new Date(startOfWeek);
            dayDate.setUTCDate(startOfWeek.getUTCDate() + i);
            const isToday = dayDate.toISOString().split('T')[0] === todayStr;
            const dayColumn = document.createElement('div');
            dayColumn.className = `schedule-day${isToday ? ' is-today' : ''}`;
            dayColumn.innerHTML = `<h4 class="schedule-day-head">
                                            <span class="schedule-day-name">${days[i]}${isToday ? ' <span class="schedule-today-badge">Aujourd\'hui</span>' : ''}</span>
                                            <span class="schedule-day-date">${dayDate.getUTCDate()}</span>
                                            <span id="day-total-${i}" class="schedule-day-total"></span>
                                    </h4>
                                    <div id="day-col-${i}" class="space-y-2"></div>
                                    <button type="button" class="add-day-task" data-date="${dayDate.toISOString().split('T')[0]}">+ Ajouter un chantier</button>`;
            scheduleGrid.appendChild(dayColumn);
        }
        loadUserScheduleForWeek(startOfWeek, endOfWeek);
    }
}

async function loadUserScheduleForWeek(start, end) {
    const weekId = start.toISOString().split('T')[0];
    const publishDoc = await getDoc(doc(db, "publishedSchedules", weekId));
    const scheduleGrid = document.getElementById("schedule-grid");
    const totalHoursElement = document.getElementById("currentWeekTotalHours");

    const isPublished = publishDoc.exists();

    const planningQuery = query(collection(db, "planning"), 
        where("date", ">=", start.toISOString().split('T')[0]), 
        where("date", "<=", end.toISOString().split('T')[0]), 
        orderBy("date"),
        orderBy("order")
    );
    const planningSnapshot = await getDocs(planningQuery);

    const scheduleData = planningSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    // Planning publié par l'admin + chantiers ajoutés par l'employé lui-même (visibles même avant publication)
    const userSchedule = scheduleData.filter(task =>
        (isPublished && task.teamNames && task.teamNames.includes(currentUser.displayName)) || task.addedByUid === currentUser.uid);
    if (!isPublished && totalHoursElement) {
        setTimeout(() => { totalHoursElement.textContent = 'Planning pas encore publié · vos ajouts uniquement'; }, 0);
    }

    let dailyTotals = [0, 0, 0, 0, 0, 0, 0];
    let totalWeekHours = 0;

    userSchedule.forEach(task => {
        const utcDate = new Date(task.date + 'T12:00:00Z');
        const dayIndex = (utcDate.getUTCDay() + 6) % 7;

        const chantierDetails = chantiersCache.find(c => c.id === task.chantierId);
        const teamCount = task.teamSize || (task.teamNames || []).length;
        
        if (chantierDetails && chantierDetails.totalHeuresPrevues > 0 && teamCount > 0) {
            const totalBudget = chantierDetails.totalHeuresPrevues;
            const budgetPerPerson = (totalBudget / teamCount);
            
            totalWeekHours += budgetPerPerson;
            dailyTotals[dayIndex] += budgetPerPerson;
        }
    });
    
    if (totalHoursElement) totalHoursElement.textContent = `Total semaine prévues : ${formatDecimalHours(totalWeekHours)}`;

    for (let i = 0; i < 7; i++) {
        const dayTotalEl = document.getElementById(`day-total-${i}`);
        if (dayTotalEl && dailyTotals[i] > 0) {
            dayTotalEl.textContent = formatDecimalHours(dailyTotals[i]);
        }
    }

    for (let i = 0; i < 7; i++) {
        const dayColumn = document.getElementById(`day-col-${i}`);
        if (dayColumn) dayColumn.innerHTML = '';
    }
    
    userSchedule.forEach(data => {
        const utcDate = new Date(data.date + 'T12:00:00Z');
        const dayIndex = (utcDate.getUTCDay() + 6) % 7;
        const container = document.getElementById(`day-col-${dayIndex}`);
        if (container) {
            const chantierDetails = chantiersCache.find(c => c.id === data.chantierId);
            container.appendChild(createTaskElement(data, chantierDetails));
        }
    });

    for (let i = 0; i < 7; i++) {
        const dayColumn = document.getElementById(`day-col-${i}`);
        if (dayColumn && !dayColumn.children.length) {
            dayColumn.innerHTML = `<p class="schedule-day-empty">Rien de prévu</p>`;
            dayColumn.parentElement.classList.add('is-empty');
        }
    }
}

function createTaskElement(task, chantierDetails) {
    const el = document.createElement('div');
    // Chantier ajouté par l'employé : il peut le retirer
    if (task.addedByUid === currentUser.uid && task.id) {
        setTimeout(() => {
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'own-task-remove';
            remove.textContent = 'Ajouté par vous · Retirer';
            remove.onclick = (event) => {
                event.stopPropagation();
                deleteDoc(doc(db, "planning", task.id)).catch(error => {
                    console.error(error);
                    showInfoModal("Erreur", "Impossible de retirer ce chantier.");
                });
                displayWeekView();
            };
            el.appendChild(remove);
        }, 0);
    }
    el.className = 'schedule-task p-3 rounded-lg shadow-sm border-l-4 text-sm cursor-pointer hover:shadow-md transition-shadow';
    el.style.backgroundColor = 'var(--color-surface)';
    el.style.borderColor = 'var(--color-primary)';

    if (chantierDetails) {
        el.onclick = () => dbShowDetailsModal(chantierDetails.id);
    }
    
    const teamNames = task.teamNames || [];
    const teamCount = task.teamSize || teamNames.length;
    const team = teamCount > 0 ? `Équipe : ${teamNames.join(', ')}` : 'Pas d\'équipe';
    
    const startTimeHTML = task.startTime ? `<span class="ml-2 px-2 py-0.5 rounded text-xs font-bold" style="background-color: var(--color-background); color: var(--color-primary);">${task.startTime}</span>` : '';
    const note = task.notes ? `<div class="mt-2 pt-2 border-t text-xs" style="border-color: var(--color-border); color: var(--color-primary);"><strong>Note:</strong> ${task.notes}</div>` : '';

    let projectBudgetHTML = '';
    if (chantierDetails && chantierDetails.totalHeuresPrevues > 0) {
        const totalBudget = chantierDetails.totalHeuresPrevues;
        if (teamCount > 0) {
            const budgetPerPersonDecimal = (totalBudget / teamCount);
            projectBudgetHTML = `
                <div class="text-xs mt-1" style="color: var(--color-text-muted);">Heures prévues (projet) : <strong>${formatDecimalHours(totalBudget)}</strong></div>
                <div class="text-xs mt-1" style="color: var(--color-text-muted);">Heures prévues (par pers.) : <strong>${formatDecimalHours(budgetPerPersonDecimal)}</strong></div>`;
        } else {
             projectBudgetHTML = `<div class="text-xs mt-1" style="color: var(--color-text-muted);">Heures prévues (seul) : <strong>${formatDecimalHours(totalBudget)}</strong></div>`;
        }
    }

    el.innerHTML = `<div class="flex justify-between items-start"><div class="font-semibold" style="color: var(--color-text-base);">${task.chantierName}</div>${startTimeHTML}</div><div class="text-xs mt-1" style="color: var(--color-text-muted);">${team}</div><div class="mt-2 pt-2 border-t" style="border-color: var(--color-border);">${projectBudgetHTML}</div>${note}`;
    return el;
}

async function checkForMissedPointages() {
    const suggestionsContainer = document.getElementById('missed-pointage-suggestions');
    if (!suggestionsContainer) return;
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const suggestionsQuery = query(collection(db, "pointages"), where("colleagues", "array-contains", currentUser.displayName), where("timestamp", ">=", twoDaysAgo.toISOString()), orderBy("timestamp", "desc"));
    const userPointagesQuery = query(collection(db, "pointages"), where("uid", "==", currentUser.uid), where("timestamp", ">=", twoDaysAgo.toISOString()));
    const [suggestionsSnapshot, userPointagesSnapshot] = await Promise.all([getDocs(suggestionsQuery), getDocs(userPointagesQuery)]);
    
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
    if (finalSuggestions.length > 0) renderSuggestions(finalSuggestions);
}

function renderSuggestions(suggestions) {
    const container = document.getElementById('missed-pointage-suggestions');
    container.innerHTML = `<h3 class="text-lg font-semibold" style="color: var(--color-text-base);">Suggestions de pointages manqués :</h3>`;
    suggestions.forEach(sugg => {
        const start = new Date(sugg.timestamp), end = new Date(sugg.endTime);
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
    if (!suggId || button.disabled) return;
    // Empêche un double appui d'ajouter deux fois le même pointage
    button.closest('div.border-l-4')?.querySelectorAll('button').forEach(b => { b.disabled = true; });
    if (button.classList.contains('accept-suggestion-btn')) {
        const suggDoc = await getDoc(doc(db, "pointages", suggId));
        if (!suggDoc.exists()) { showInfoModal("Erreur", "Le pointage original n'a pas été trouvé."); return; }
        const suggestion = suggDoc.data();
        const originalColleagues = suggestion.colleagues || [];
        const filteredColleagues = originalColleagues.filter(name => name !== currentUser.displayName);
        const finalColleagues = [...new Set([...filteredColleagues, suggestion.userName])];
        const newPointageData = {
            ...suggestion, uid: currentUser.uid, userName: currentUser.displayName, colleagues: finalColleagues, createdAt: serverTimestamp(), notes: `(Pointage ajouté depuis la saisie de ${suggestion.userName}) --- ${suggestion.notes || ''}`
        };
        try {
            await addDoc(collection(db, "pointages"), newPointageData);
            showInfoModal("Succès", "Le pointage a été ajouté à votre historique.");
        } catch (error) { showInfoModal("Erreur", "Impossible d'ajouter le pointage."); }
    } else if (button.classList.contains('refuse-suggestion-btn')) {
        const refusedPointages = JSON.parse(localStorage.getItem('refusedPointages') || '[]');
        if (!refusedPointages.includes(suggId)) {
            refusedPointages.push(suggId);
            localStorage.setItem('refusedPointages', JSON.stringify(refusedPointages));
        }
    }
    button.closest('div.border-l-4').remove();
}

function initUnreadMessagesListener() {
    const container = document.getElementById('unread-messages-container');
    if (!container) return;

    const q = query(collection(db, "chats"), where("participants", "array-contains", currentUser.uid));

    unreadListener = onSnapshot(q, (snapshot) => {
        let totalUnread = 0, senders = new Set(), lastMessagePreview = "";

        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.hiddenFor && data.hiddenFor.includes(currentUser.uid)) return;
            const myUnreadCount = (data.unreadCounts && data.unreadCounts[currentUser.uid]) ? data.unreadCounts[currentUser.uid] : 0;
            if (myUnreadCount > 0) {
                totalUnread += myUnreadCount;
                const otherName = data.participantNames.find(n => n !== (currentUser.displayName || 'Moi')) || 'Collègue';
                senders.add(otherName);
                lastMessagePreview = data.lastMessage;
            }
        });

        if (totalUnread > 0) {
            const senderNames = Array.from(senders).join(', '), isMultiple = senders.size > 1;
            container.innerHTML = `
                <div class="bg-white border-l-4 p-4 rounded-r-lg shadow-md flex items-center justify-between group" style="background-color: var(--color-surface); border-color: var(--color-primary);">
                    <div class="flex items-center gap-4">
                        <div class="relative">
                            <div class="w-12 h-12 rounded-full flex items-center justify-center text-white shadow-sm" style="background-color: var(--color-primary);">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
                            </div>
                            <span class="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white ring-2 ring-white animate-pulse">${totalUnread}</span>
                        </div>
                        <div>
                            <h3 class="font-bold text-lg" style="color: var(--color-text-base);">${isMultiple ? 'Nouveaux messages' : `Message de ${senderNames}`}</h3>
                            <p class="text-sm text-gray-500 line-clamp-1" style="color: var(--color-text-muted);">${isMultiple ? `Vous avez des messages de : ${senderNames}` : `"${lastMessagePreview}"`}</p>
                        </div>
                    </div>
                    <div class="text-gray-400 group-hover:translate-x-1 transition-transform">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
                    </div>
                </div>
            `;
            container.classList.remove('hidden');
            container.onclick = () => navigateTo('user-chat');
        } else {
            container.classList.add('hidden');
            container.innerHTML = '';
        }
    });
}
// --- Ajout d'un chantier par l'employé (planning reçu sur papier, changement de dernière minute…) ---
function openAddTaskModal(dateStr) {
    document.getElementById('addTaskModal')?.remove();
    const dateLabel = new Date(`${dateStr}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    const modal = document.createElement('div');
    modal.id = 'addTaskModal';
    modal.className = 'modal';
    modal.innerHTML = `
        <form class="modal-panel" id="addTaskForm">
            <div class="modal-body space-y-4">
                <div>
                    <h3 class="modal-title">Ajouter un chantier</h3>
                    <p class="modal-text">À votre planning du ${dateLabel}.</p>
                </div>
                <div class="field">
                    <label for="addTaskChantier" class="field-label">Chantier</label>
                    <select id="addTaskChantier" class="input" required>
                        <option value="">Choisir un chantier…</option>
                        ${chantiersCache.map(c => `<option value="${c.id}">${String(c.name).replace(/</g, '&lt;')}</option>`).join('')}
                    </select>
                </div>
                <div class="field">
                    <label for="addTaskTime" class="field-label">Heure de début (si imposée)</label>
                    <input id="addTaskTime" type="time" class="input">
                </div>
                <div class="field">
                    <label for="addTaskPeople" class="field-label">Personnes présentes (vous compris)</label>
                    <input id="addTaskPeople" type="number" class="input" inputmode="numeric" pattern="[0-9]*" min="1" max="20" step="1" value="1" required>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" id="cancelAddTaskBtn" class="btn btn-secondary">Annuler</button>
                <button type="submit" class="btn btn-primary">Ajouter</button>
            </div>
        </form>`;
    document.body.appendChild(modal);
    modal.querySelector('#cancelAddTaskBtn').onclick = () => modal.remove();
    const peopleInput = modal.querySelector('#addTaskPeople');
    peopleInput.addEventListener('input', () => { peopleInput.value = peopleInput.value.replace(/[^0-9]/g, ''); });
    modal.querySelector('#addTaskForm').onsubmit = (e) => {
        e.preventDefault();
        const chantier = chantiersCache.find(c => c.id === document.getElementById('addTaskChantier').value);
        if (!chantier) return;
        // Écriture sans attendre le serveur : fonctionne aussi hors ligne
        setDoc(doc(collection(db, "planning")), {
            date: dateStr,
            chantierId: chantier.id,
            chantierName: chantier.name,
            teamNames: [currentUser.displayName],
            // Nombre de personnes sur place : le temps du chantier est partagé entre elles (Ma tournée, heures prévues)
            teamSize: Math.min(20, Math.max(1, parseInt(document.getElementById("addTaskPeople").value, 10) || 1)),
            startTime: document.getElementById('addTaskTime').value || '',
            notes: '',
            order: 999,
            addedByEmployee: true,
            addedByUid: currentUser.uid,
            createdAt: serverTimestamp(),
        }).catch(error => {
            console.error("Ajout au planning refusé :", error);
            showInfoModal("Erreur", "Le chantier n'a pas pu être ajouté au planning (droits insuffisants ou problème de connexion).");
        });
        modal.remove();
        showToast(`${chantier.name} ajouté au ${dateLabel}.`, 'success');
        displayWeekView();
    };
}
