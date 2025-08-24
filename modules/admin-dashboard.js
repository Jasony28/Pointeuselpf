import { collection, query, where, orderBy, getDocs, doc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent, showConfirmationModal, navigateTo } from "../app.js";
import { getWeekDateRange, formatMilliseconds } from "./utils.js";

export async function render() {
    pageContent.innerHTML = `
        <div class="max-w-7xl mx-auto space-y-8">
            <h2 class="text-2xl font-bold">📊 Tableau de Bord Administrateur</h2>
            
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div id="week-total-card" class="bg-white p-6 rounded-lg shadow-sm text-center">
                    <h3 class="text-sm font-medium text-gray-500">Heures cette semaine (Total)</h3>
                    <p class="mt-1 text-3xl font-semibold animate-pulse">...</p>
                </div>
                <div id="month-total-card" class="bg-white p-6 rounded-lg shadow-sm text-center">
                    <h3 class="text-sm font-medium text-gray-500">Heures ce mois-ci (Total)</h3>
                    <p class="mt-1 text-3xl font-semibold animate-pulse">...</p>
                </div>
                <div id="active-projects-card" class="bg-white p-6 rounded-lg shadow-sm text-center">
                    <h3 class="text-sm font-medium text-gray-500">Chantiers Actifs</h3>
                    <p class="mt-1 text-3xl font-semibold animate-pulse">...</p>
                </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div class="bg-white p-6 rounded-lg shadow-sm">
                    <h3 class="text-xl font-semibold mb-4">Heures par employé (cette semaine)</h3>
                    <div id="user-stats-list" class="space-y-3">
                        <p class="text-center text-gray-500">Calcul en cours...</p>
                    </div>
                </div>

                <div class="bg-white p-6 rounded-lg shadow-sm">
                    <h3 class="text-xl font-semibold mb-4">Heures par chantier (cette semaine)</h3>
                    <div id="chantier-stats-list" class="space-y-3">
                        <p class="text-center text-gray-500">Calcul en cours...</p>
                    </div>
                </div>
            </div>

            <div>
                <h3 class="text-xl font-semibold mb-2">Activité Récente</h3>
                <div id="recent-activity-list" class="space-y-3">
                    <p class="text-center text-gray-500">Chargement de l'activité...</p>
                </div>
            </div>
        </div>
    `;
    setTimeout(() => {
        loadGlobalStats();
        loadDetailedWeekStats();
        loadRecentActivity();
    }, 0);
}

async function loadGlobalStats() {
    const now = new Date();
    const { startOfWeek } = getWeekDateRange(0);
    const startOfMonth = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));

    const weekQuery = query(collection(db, "pointages"), where("timestamp", ">=", startOfWeek.toISOString()));
    const monthQuery = query(collection(db, "pointages"), where("timestamp", ">=", startOfMonth.toISOString()));
    const chantiersQuery = query(collection(db, "chantiers"), where("status", "==", "active"));

    try {
        const [weekSnapshot, monthSnapshot, chantiersSnapshot] = await Promise.all([
            getDocs(weekQuery),
            getDocs(monthQuery),
            getDocs(chantiersQuery)
        ]);

        let weekMs = 0;
        weekSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.endTime) weekMs += new Date(data.endTime) - new Date(data.timestamp);
        });
        
        // **CORRECTION AJOUTÉE** : Vérifie si l'élément existe avant de le modifier.
        const weekCard = document.querySelector('#week-total-card p');
        if (weekCard) {
            weekCard.textContent = formatMilliseconds(weekMs);
            weekCard.classList.remove('animate-pulse');
        }

        let monthMs = 0;
        monthSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.endTime) monthMs += new Date(data.endTime) - new Date(data.timestamp);
        });

        // **CORRECTION AJOUTÉE**
        const monthCard = document.querySelector('#month-total-card p');
        if (monthCard) {
            monthCard.textContent = formatMilliseconds(monthMs);
            monthCard.classList.remove('animate-pulse');
        }

        // **CORRECTION AJOUTÉE**
        const projectsCard = document.querySelector('#active-projects-card p');
        if (projectsCard) {
            projectsCard.textContent = chantiersSnapshot.size;
            projectsCard.classList.remove('animate-pulse');
        }

    } catch (error) {
        console.error("Erreur de chargement des statistiques globales:", error);
    }
}

async function loadDetailedWeekStats() {
    const { startOfWeek } = getWeekDateRange(0);

    try {
        const q = query(collection(db, "pointages"), where("timestamp", ">=", startOfWeek.toISOString()));
        const querySnapshot = await getDocs(q);

        const userStats = {};
        const chantierStats = {};

        querySnapshot.forEach(doc => {
            const data = doc.data();
            if (data.endTime) {
                const durationMs = new Date(data.endTime) - new Date(data.timestamp);
                userStats[data.userName] = (userStats[data.userName] || 0) + durationMs;
                chantierStats[data.chantier] = (chantierStats[data.chantier] || 0) + durationMs;
            }
        });

        displayStats(userStats, document.getElementById('user-stats-list'), "Aucun pointage cette semaine.");
        displayStats(chantierStats, document.getElementById('chantier-stats-list'), "Aucun chantier pointé cette semaine.", true);
    } catch (error) {
        console.error("Erreur de chargement des statistiques de la semaine:", error);
    }
}

function displayStats(statsObject, container, emptyMessage, isClickable = false) {
    // **CORRECTION AJOUTÉE** : Vérifie si le conteneur existe avant toute manipulation.
    if (!container) return;

    container.innerHTML = "";
    const sortedEntries = Object.entries(statsObject).sort(([, a], [, b]) => b - a);

    if (sortedEntries.length === 0) {
        container.innerHTML = `<p class="text-center text-gray-500">${emptyMessage}</p>`;
        return;
    }

    sortedEntries.forEach(([name, totalMs]) => {
        const div = document.createElement('div');
        div.className = 'flex justify-between items-center text-sm p-2 border-b';

        if (isClickable) {
            div.innerHTML = `
                <button class="font-medium text-blue-600 hover:underline text-left">${name}</button>
                <span class="font-bold text-purple-700">${formatMilliseconds(totalMs)}</span>
            `;
            div.querySelector('button').onclick = () => navigateTo('admin-chantier-details', { chantierName: name });
        } else {
            div.innerHTML = `
                <span class="font-medium">${name}</span>
                <span class="font-bold text-purple-700">${formatMilliseconds(totalMs)}</span>
            `;
        }
        container.appendChild(div);
    });
}

async function loadRecentActivity() {
    const container = document.getElementById('recent-activity-list');
    // **CORRECTION AJOUTÉE** : Ajout d'une vérification pour plus de robustesse.
    if (!container) return;

    try {
        const q = query(collection(db, "pointages"), orderBy("createdAt", "desc"), where("createdAt", "!=", null));
        const querySnapshot = await getDocs(q);
        
        container.innerHTML = "";
        if (querySnapshot.empty) {
            container.innerHTML = "<p class='text-center text-gray-500'>Aucune activité récente.</p>";
            return;
        }

        const recentDocs = querySnapshot.docs.slice(0, 5);
        recentDocs.forEach(doc => {
            container.appendChild(createDetailedActivityElement(doc.id, doc.data()));
        });
    } catch (error) {
        console.error("Erreur de chargement de l'activité récente:", error);
        container.innerHTML = "<p class='text-red-500 text-center'>Erreur de chargement.</p>";
    }
}

function createDetailedActivityElement(docId, d) {
    const wrapper = document.createElement("div");
    wrapper.className = "p-4 border rounded-lg bg-white relative shadow-sm space-y-1";
    
    const startDate = new Date(d.timestamp);
    const endDate = d.endTime ? new Date(d.endTime) : null;
    
    const userDisplay = `<div class="text-xs text-blue-600 font-semibold">${d.userName || 'Utilisateur inconnu'}</div>`;
    let timeDisplay = "", durationDisplay = "";

    if (endDate) {
        const timeFormat = { hour: '2-digit', minute: '2-digit' };
        timeDisplay = `<div>De ${startDate.toLocaleTimeString('fr-FR', timeFormat)} à ${endDate.toLocaleTimeString('fr-FR', timeFormat)}</div>`;
        durationDisplay = `<div class="text-sm text-gray-600">Durée : ${formatMilliseconds(endDate - startDate)}</div>`;
    } else {
        timeDisplay = `<div>Débuté à ${startDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} (en cours)</div>`;
    }

    wrapper.innerHTML = `
      ${userDisplay}
      <div class="font-bold text-lg">${d.chantier}</div>
      <div>${startDate.toLocaleDateString('fr-FR')}</div>
      ${timeDisplay}
      ${durationDisplay}
      <div class="mt-2"><strong>Collègues :</strong> ${d.colleagues.join(", ")}</div>
      ${d.notes ? `<div class="mt-1 pt-2 border-t text-sm"><strong>Notes :</strong> ${d.notes}</div>` : ""}
    `;

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "✖";
    deleteBtn.className = "absolute top-2 right-3 text-gray-400 hover:text-red-600 font-bold";
    deleteBtn.onclick = async () => {
        if (await showConfirmationModal("Confirmation", "Supprimer ce pointage ?")) {
            await deleteDoc(doc(db, "pointages", docId));
            render();
        }
    };
    wrapper.appendChild(deleteBtn);
    return wrapper;
}