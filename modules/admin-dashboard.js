// modules/admin-dashboard.js

import { collection, query, where, orderBy, getDocs, doc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent } from "../app.js";

export async function render() {
    pageContent.innerHTML = `
        <div class="max-w-7xl mx-auto space-y-6">
            <h2 class="text-2xl font-bold">📊 Tableau de Bord Administrateur</h2>
            
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div id="week-total-card" class="bg-white p-4 rounded-lg shadow-sm text-center">
                    <h3 class="text-sm font-medium text-gray-500">Heures cette semaine</h3>
                    <p class="mt-1 text-3xl font-semibold animate-pulse">...</p>
                </div>
                <div id="month-total-card" class="bg-white p-4 rounded-lg shadow-sm text-center">
                    <h3 class="text-sm font-medium text-gray-500">Heures ce mois-ci</h3>
                    <p class="mt-1 text-3xl font-semibold animate-pulse">...</p>
                </div>
                <div id="active-projects-card" class="bg-white p-4 rounded-lg shadow-sm text-center">
                    <h3 class="text-sm font-medium text-gray-500">Chantiers Actifs</h3>
                    <p class="mt-1 text-3xl font-semibold animate-pulse">...</p>
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

    loadPeriodTotal('week', document.querySelector('#week-total-card p'));
    loadPeriodTotal('month', document.querySelector('#month-total-card p'));
    loadActiveProjectsCount(document.querySelector('#active-projects-card p'));
    loadRecentActivity(document.getElementById('recent-activity-list'));
}

async function loadPeriodTotal(period, element) {
    const now = new Date();
    let startDate;

    if (period === 'week') {
        const dayOfWeek = now.getDay();
        const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
        startDate = new Date(now.setDate(diff));
        startDate.setHours(0, 0, 0, 0);
    } else {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const q = query(collection(db, "pointages"), where("timestamp", ">=", startDate.toISOString()));
    const querySnapshot = await getDocs(q);
    let totalMs = 0;
    querySnapshot.forEach(doc => {
        const data = doc.data();
        if (data.endTime) totalMs += new Date(data.endTime) - new Date(data.timestamp);
    });

    const totalHours = Math.floor(totalMs / 3600000);
    const totalMinutes = Math.round((totalMs % 3600000) / 60000);
    element.textContent = `${totalHours}h ${totalMinutes}min`;
    element.classList.remove('animate-pulse');
}

async function loadActiveProjectsCount(element) {
    const q = query(collection(db, "chantiers"), where("status", "==", "active"));
    const querySnapshot = await getDocs(q);
    element.textContent = querySnapshot.size;
    element.classList.remove('animate-pulse');
}

// --- FONCTION MODIFIÉE ---
async function loadRecentActivity(container) {
    // La requête récupère les 5 pointages les plus récents
    const q = query(collection(db, "pointages"), orderBy("createdAt", "desc"));
    const querySnapshot = await getDocs(q);
    
    container.innerHTML = "";
    if (querySnapshot.empty) {
        container.innerHTML = "<p class='text-center text-gray-500'>Aucune activité récente.</p>";
        return;
    }

    // On ne prend que les 5 plus récents
    const recentDocs = querySnapshot.docs.slice(0, 5);
    recentDocs.forEach(doc => {
        // On utilise la nouvelle fonction pour créer un affichage détaillé
        container.appendChild(createDetailedActivityElement(doc.id, doc.data()));
    });
}

// --- NOUVELLE FONCTION (INSPIRÉE DE user-history.js) ---
function createDetailedActivityElement(docId, d) {
    const wrapper = document.createElement("div");
    wrapper.className = "p-4 border rounded-lg bg-white relative shadow-sm space-y-1";
    
    const startDate = new Date(d.timestamp);
    const endDate = d.endTime ? new Date(d.endTime) : null;
    
    // On affiche toujours le nom de l'utilisateur
    const userDisplay = `<div class="text-xs text-blue-600 font-semibold">${d.userName || 'Utilisateur inconnu'}</div>`;
    let timeDisplay = "", durationDisplay = "";

    if (endDate) {
        const timeFormat = { hour: '2-digit', minute: '2-digit' };
        timeDisplay = `<div>De ${startDate.toLocaleTimeString('fr-FR', timeFormat)} à ${endDate.toLocaleTimeString('fr-FR', timeFormat)}</div>`;
        const durationMs = endDate - startDate;
        const durationHours = Math.floor(durationMs / 3600000);
        const durationMinutes = Math.round((durationMs % 3600000) / 60000);
        durationDisplay = `<div class="text-sm text-gray-600">Durée : ${durationHours}h ${durationMinutes}min</div>`;
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

    // On ajoute un bouton de suppression, comme dans l'historique
    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "✖";
    deleteBtn.className = "absolute top-2 right-3 text-gray-400 hover:text-red-600 font-bold";
    deleteBtn.onclick = async () => {
        if (confirm("Supprimer ce pointage ?")) {
            await deleteDoc(doc(db, "pointages", docId));
            // On recharge uniquement la liste d'activité pour ne pas rafraîchir toute la page
            loadRecentActivity(document.getElementById('recent-activity-list'));
        }
    };
    wrapper.appendChild(deleteBtn);
    return wrapper;
}