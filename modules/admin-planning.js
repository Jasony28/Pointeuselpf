// modules/admin-planning.js

import { collection, query, where, getDocs, addDoc, deleteDoc, doc, orderBy, serverTimestamp, updateDoc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent, currentUser } from "../app.js";

let currentWeekOffset = 0;
let chantiersCache = [];
let colleaguesCache = [];
let currentEditingId = null;
let currentEditingDate = null;

export async function render() {
    pageContent.innerHTML = `
        <div class="max-w-full mx-auto">
            <h2 class="text-2xl font-bold mb-4">🗓️ Planification de la semaine (Glisser-Déposer)</h2>
            <div class="bg-white rounded-lg shadow-sm p-4 mb-4">
                <div class="flex flex-wrap justify-between items-center gap-4">
                    <div class="flex items-center gap-2">
                        <button id="prevWeekBtn" class="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg">&lt;</button>
                        <div id="currentPeriodDisplay" class="text-center font-semibold text-lg"></div>
                        <button id="nextWeekBtn" class="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg">&gt;</button>
                    </div>
                    <div class="flex items-center gap-2">
                        <button id="refreshPlanningBtn" title="Actualiser la vue" class="bg-gray-200 hover:bg-gray-300 p-2 rounded-lg">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
                                <path fill-rule="evenodd" d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/>
                                <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/>
                            </svg>
                        </button>
                        <button id="publishBtn" class="bg-green-600 hover:bg-green-700 text-white font-bold px-4 py-2 rounded-lg disabled:bg-gray-400">
                            {/* Le texte sera dynamique */}
                        </button>
                    </div>
                </div>
            </div>
            <div class="flex flex-col md:flex-row gap-4">
                <div class="md:w-1/4 lg:w-1/5 bg-white p-4 rounded-lg shadow-sm">
                    <h3 class="font-bold text-lg border-b pb-2 mb-2">Collègues</h3>
                    <div id="colleagues-pool" class="space-y-2 min-h-[100px]"></div>
                </div>
                <div class="flex-grow grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3" id="planning-grid"></div>
            </div>
        </div>

        <div id="planningItemModal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-20 p-4">
            <div class="bg-white p-6 rounded-lg shadow-xl w-full max-w-sm">
                <h3 id="modalTitle" class="text-xl font-bold mb-4"></h3>
                <form id="planningItemForm" class="space-y-4">
                    <div><label class="text-sm font-medium">Chantier</label><select id="chantierSelect" class="w-full border p-2 rounded" required></select></div>
                    <div><label class="text-sm font-medium">Heures prévues</label><input id="planningDuration" type="number" step="0.5" placeholder="Ex: 8" class="w-full border p-2 rounded" required /></div>
                    <div><label class="text-sm font-medium">Notes (facultatif)</label><textarea id="planningNotes" placeholder="Instructions spécifiques..." class="w-full border p-2 rounded"></textarea></div>
                    <div class="flex justify-end gap-4 pt-2"><button type="button" id="cancelPlanningItem" class="bg-gray-300 hover:bg-gray-400 px-4 py-2 rounded">Annuler</button><button type="submit" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded">Enregistrer</button></div>
                </form>
            </div>
        </div>
    `;

    setupEventListeners();
    await cacheData();
    displayWeek();
    populateColleaguesPool();
}

function setupEventListeners() {
    document.getElementById("prevWeekBtn").onclick = () => { currentWeekOffset--; displayWeek(); };
    document.getElementById("nextWeekBtn").onclick = () => { currentWeekOffset++; displayWeek(); };
    document.getElementById("planningItemForm").onsubmit = savePlanningItem;
    document.getElementById("cancelPlanningItem").onclick = closePlanningItemModal;
    document.getElementById("refreshPlanningBtn").onclick = displayWeek;
}

async function publishWeek() {
    const { startOfWeek } = getWeekDateRange(currentWeekOffset);
    const weekId = startOfWeek.toISOString().split('T')[0];
    const weekString = startOfWeek.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
    
    if (confirm(`Voulez-vous PUBLIER le planning pour la semaine du ${weekString} ?`)) {
        const publishDocRef = doc(db, "publishedSchedules", weekId);
        const notificationRef = collection(db, "notifications");
        try {
            await setDoc(publishDocRef, { published: true, publishedAt: serverTimestamp(), publishedBy: currentUser.displayName });
            await addDoc(notificationRef, {
                title: "Nouveau Planning Publié",
                body: `Le planning pour la semaine du ${weekString} est maintenant disponible.`,
                createdAt: serverTimestamp(),
                author: currentUser.displayName
            });
            alert("Planning publié et notification envoyée !");
            updatePublishButton(true);
        } catch (error) { console.error("Erreur de publication:", error); alert("La publication a échoué."); }
    }
}

async function sendUpdateNotification() {
    const { startOfWeek } = getWeekDateRange(currentWeekOffset);
    const weekString = startOfWeek.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });

    if (confirm(`Voulez-vous envoyer une notification de MISE À JOUR pour le planning de la semaine du ${weekString} ?`)) {
        const notificationRef = collection(db, "notifications");
        try {
            await addDoc(notificationRef, {
                title: "Planning Mis à Jour",
                body: `Le planning de la semaine du ${weekString} a été modifié.`,
                createdAt: serverTimestamp(),
                author: currentUser.displayName
            });
            alert("Notification de mise à jour envoyée !");
        } catch (error) { console.error("Erreur de notification:", error); alert("L'envoi a échoué."); }
    }
}

async function updatePublishButton(isPublished) {
    const btn = document.getElementById('publishBtn');
    btn.disabled = false;
    if (isPublished) {
        btn.textContent = 'Notifier les changements';
        btn.className = 'bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-lg';
        btn.onclick = sendUpdateNotification;
    } else {
        btn.textContent = 'Publier la semaine';
        btn.className = 'bg-green-600 hover:bg-green-700 text-white font-bold px-4 py-2 rounded-lg';
        btn.onclick = publishWeek;
    }
}

async function displayWeek() {
    const { startOfWeek } = getWeekDateRange(currentWeekOffset);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    document.getElementById("currentPeriodDisplay").textContent = `Semaine du ${startOfWeek.toLocaleDateString('fr-FR', {day: 'numeric', month: 'long'})} au ${endOfWeek.toLocaleDateString('fr-FR', {day: 'numeric', month: 'long'})}`;
    
    const weekId = startOfWeek.toISOString().split('T')[0];
    const publishDoc = await getDoc(doc(db, "publishedSchedules", weekId));
    updatePublishButton(publishDoc.exists());

    const planningGrid = document.getElementById("planning-grid");
    planningGrid.innerHTML = "";
    const days = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
    for (let i = 0; i < 7; i++) {
        const dayDate = new Date(startOfWeek);
        dayDate.setDate(startOfWeek.getDate() + i);
        const dateString = dayDate.toISOString().split('T')[0];
        const dayCol = document.createElement('div');
        dayCol.className = 'bg-gray-100 rounded-lg p-2 min-h-[200px]';
        dayCol.innerHTML = `<div class="flex justify-between items-center mb-2"><h4 class="font-bold text-center">${days[i]} <span class="text-sm font-normal text-gray-500">${dayDate.toLocaleDateString('fr-FR', {day: '2-digit'})}</span></h4><button data-date="${dateString}" class="add-chantier-btn text-lg font-bold text-purple-600 hover:text-purple-800">+</button></div><div class="day-tasks-container space-y-2" id="day-col-${dateString}"></div>`;
        planningGrid.appendChild(dayCol);
    }
    planningGrid.querySelectorAll('.add-chantier-btn').forEach(btn => btn.onclick = () => openPlanningItemModal(null, btn.dataset.date));
    loadPlanningForWeek(startOfWeek, endOfWeek);
}

function createChantierBlock(planningDoc) {
    const { id, chantierName, teamNames, duration, notes } = planningDoc;
    const block = document.createElement('div');
    block.className = 'p-2 bg-white rounded shadow cursor-pointer hover:bg-gray-50';
    block.dataset.planningId = id;
    
    const noteIndicator = notes ? `📝` : '';
    block.innerHTML = `
        <div class="flex justify-between items-center">
            <p class="font-bold text-sm text-purple-800">${chantierName}</p>
            <button class="delete-planning-btn text-red-500 hover:text-red-700 font-bold text-xs">✖</button>
        </div>
        <div class="text-xs text-gray-600">${duration || 'N/A'}h prévues <span class="text-blue-500">${noteIndicator}</span></div>
        <div class="colleague-drop-zone min-h-[30px] mt-2 space-y-1 bg-gray-50 p-1 rounded"></div>
    `;
    
    block.onclick = (e) => {
        if (e.target.classList.contains('delete-planning-btn')) return;
        openPlanningItemModal(planningDoc);
    };

    const dropZone = block.querySelector('.colleague-drop-zone');
    if (teamNames) {
        teamNames.forEach(name => {
            const item = document.createElement('div');
            item.className = 'p-1 bg-blue-100 text-blue-800 rounded text-xs';
            item.textContent = name;
            item.dataset.colleagueName = name;
            dropZone.appendChild(item);
        });
    }
    
    new Sortable(dropZone, {
        group: 'shared',
        onAdd: async function (evt) {
            const droppedName = evt.item.dataset.colleagueName;
            let isDuplicate = false;
            evt.to.querySelectorAll('div').forEach(el => {
                if (el !== evt.item && el.dataset.colleagueName === droppedName) { isDuplicate = true; }
            });
            if (isDuplicate) {
                evt.item.remove();
                alert(`"${droppedName}" est déjà sur ce chantier.`);
                return;
            }
            evt.item.className = 'p-1 bg-blue-100 text-blue-800 rounded text-xs';
            await updatePlanningTeam(id, dropZone);
        },
        onRemove: async function () { await updatePlanningTeam(id, dropZone); }
    });
    
    block.querySelector('.delete-planning-btn').onclick = async (e) => {
        e.stopPropagation(); 
        if(confirm(`Supprimer le chantier "${chantierName}" de ce jour ?`)) {
            await deleteDoc(doc(db, "planning", id));
            block.remove();
        }
    };
    return block;
}

function openPlanningItemModal(planningDoc = null, date = null) {
    const modal = document.getElementById('planningItemModal');
    const form = document.getElementById('planningItemForm');
    const select = document.getElementById('chantierSelect');
    form.reset();

    if (planningDoc) {
        currentEditingId = planningDoc.id;
        document.getElementById('modalTitle').textContent = 'Modifier le travail';
        select.innerHTML = chantiersCache.map(c => `<option value="${c.id}|${c.name}" ${c.id === planningDoc.chantierId ? 'selected' : ''}>${c.name}</option>`).join('');
        document.getElementById('planningDuration').value = planningDoc.duration || '';
        document.getElementById('planningNotes').value = planningDoc.notes || '';
    } else {
        currentEditingId = null;
        currentEditingDate = date;
        document.getElementById('modalTitle').textContent = 'Ajouter un chantier';
        select.innerHTML = '<option value="" disabled selected>-- Choisissez un chantier --</option>' + chantiersCache.map(c => `<option value="${c.id}|${c.name}">${c.name}</option>`).join('');
    }
    modal.classList.remove('hidden');
}

function closePlanningItemModal() {
    document.getElementById('planningItemModal').classList.add('hidden');
}

async function savePlanningItem(e) {
    e.preventDefault();
    const [chantierId, chantierName] = document.getElementById('chantierSelect').value.split('|');
    const duration = document.getElementById('planningDuration').value;
    const notes = document.getElementById('planningNotes').value.trim();

    try {
        if (currentEditingId) {
            const docRef = doc(db, "planning", currentEditingId);
            const planningDoc = (await getDoc(docRef)).data();
            await updateDoc(docRef, { 
                chantierId, 
                chantierName, 
                duration: duration || planningDoc.duration, // Conserve l'ancienne valeur si le champ est vide
                notes: notes || planningDoc.notes,
            });
        } else {
            await addDoc(collection(db, "planning"), {
                date: currentEditingDate,
                chantierId,
                chantierName,
                duration,
                notes,
                teamNames: [],
                createdAt: serverTimestamp()
            });
        }
        closePlanningItemModal();
        displayWeek();
    } catch (error) {
        console.error("Erreur de sauvegarde:", error);
        alert("Une erreur est survenue.");
    }
}

async function cacheData() {
    const chantiersQuery = query(collection(db, "chantiers"), where("status", "==", "active"), orderBy("name"));
    const chantiersSnapshot = await getDocs(chantiersQuery);
    chantiersCache = chantiersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const colleaguesQuery = query(collection(db, "colleagues"), orderBy("name"));
    const colleaguesSnapshot = await getDocs(colleaguesQuery);
    colleaguesCache = colleaguesSnapshot.docs.map(doc => doc.data().name);
}

function populateColleaguesPool() {
    const pool = document.getElementById('colleagues-pool');
    pool.innerHTML = '';
    colleaguesCache.forEach(name => {
        const item = document.createElement('div');
        item.className = 'p-2 bg-gray-200 rounded cursor-move text-sm';
        item.textContent = name;
        item.dataset.colleagueName = name;
        pool.appendChild(item);
    });
    new Sortable(pool, {
        group: { name: 'shared', pull: 'clone', put: false },
        sort: false
    });
}

async function updatePlanningTeam(planningId, dropZone) {
    const teamNames = Array.from(dropZone.querySelectorAll('div')).map(el => el.dataset.colleagueName);
    const planningDocRef = doc(db, "planning", planningId);
    await updateDoc(planningDocRef, { teamNames: teamNames });
}

async function loadPlanningForWeek(start, end) {
    const q = query(collection(db, "planning"), where("date", ">=", start.toISOString().split('T')[0]), where("date", "<=", end.toISOString().split('T')[0]));
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach(docSnap => {
        const data = docSnap.data();
        const container = document.getElementById(`day-col-${data.date}`);
        if (container) {
            const block = createChantierBlock({ id: docSnap.id, ...data });
            container.appendChild(block);
        }
    });
}

function getWeekDateRange(offset = 0) {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1) + (offset * 7);
    const startOfWeek = new Date(now.setDate(diff));
    startOfWeek.setHours(0, 0, 0, 0);
    return { startOfWeek };
}