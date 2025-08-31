import { collection, query, orderBy, getDocs, getDoc, doc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent } from "../app.js";
import { formatMilliseconds } from "./utils.js";

export async function render() {
    pageContent.innerHTML = `
        <div class="max-w-5xl mx-auto space-y-6">
            <div>
                <h2 class="text-2xl font-bold">🕵️‍♂️ Journal d'Audit des Pointages</h2>
                <p class="text-gray-600">Consultez l'historique détaillé de chaque pointage. Cliquez sur une entrée pour voir ses logs.</p>
            </div>
            <div class="bg-white p-4 rounded-lg shadow-sm">
                </div>
            <div id="pointages-list-container" class="space-y-3">
                <p class="text-center p-4">Chargement des pointages...</p>
            </div>
        </div>
    `;
    setTimeout(loadAllPointages, 0);
}

async function loadAllPointages() {
    const listContainer = document.getElementById('pointages-list-container');
    try {
        const q = query(collection(db, "pointages"), orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            listContainer.innerHTML = '<p class="text-center text-gray-500">Aucun pointage trouvé.</p>';
            return;
        }

        listContainer.innerHTML = '';
        snapshot.forEach(doc => {
            listContainer.appendChild(createPointageElement(doc.id, doc.data()));
        });

        listContainer.addEventListener('click', handlePointageClick);
    } catch (error) {
        console.error("Erreur de chargement des pointages:", error);
        listContainer.innerHTML = '<p class="text-center text-red-500">Erreur de chargement.</p>';
    }
}

function createPointageElement(id, data) {
    const el = document.createElement('div');
    el.className = 'p-4 border rounded-lg bg-gray-50 cursor-pointer hover:bg-gray-100';
    el.dataset.pointageId = id;

    const startDate = new Date(data.timestamp);
    const dateDisplay = startDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    
    let durationDisplay = '<span class="text-yellow-600 font-semibold">En cours</span>';
    if (data.endTime) {
        const durationMs = new Date(data.endTime) - startDate - (data.pauseDurationMs || 0);
        durationDisplay = `<span class="font-bold text-purple-700">${formatMilliseconds(durationMs)}</span>`;
    }

    el.innerHTML = `
        <div class="flex flex-wrap justify-between items-center pointer-events-none">
            <div>
                <p class="font-bold">${data.userName} sur "${data.chantier}"</p>
                <p class="text-sm text-gray-600">${dateDisplay}</p>
            </div>
            <div class="text-right">
                ${durationDisplay}
                ${data.notes && data.notes.includes('(Saisie manuelle)') ? '<p class="text-xs text-blue-600">Saisie Manuelle</p>' : ''}
            </div>
        </div>
        <div class="audit-details hidden mt-3 pt-3 border-t border-gray-200 space-y-1 text-sm">
            <p class="text-gray-500">Chargement de l'historique...</p>
        </div>
    `;
    return el;
}

async function handlePointageClick(e) {
    const pointageElement = e.target.closest('[data-pointage-id]');
    if (!pointageElement) return;

    const pointageId = pointageElement.dataset.pointageId;
    const detailsContainer = pointageElement.querySelector('.audit-details');

    const isHidden = detailsContainer.classList.contains('hidden');
    document.querySelectorAll('.audit-details').forEach(d => d.classList.add('hidden'));

    if (isHidden) {
        detailsContainer.classList.remove('hidden');
        if (!detailsContainer.dataset.loaded) {
            await loadAndShowAuditDetails(pointageId, detailsContainer);
            detailsContainer.dataset.loaded = 'true';
        }
    }
}

async function loadAndShowAuditDetails(pointageId, container) {
    try {
        const logQuery = query(collection(db, `pointages/${pointageId}/auditLog`), orderBy("timestamp", "asc"));
        const logSnapshot = await getDocs(logQuery);

        if (logSnapshot.empty) {
            container.innerHTML = '<p class="text-gray-500">Aucun historique détaillé disponible pour ce pointage.</p>';
            return;
        }

        container.innerHTML = '';
        logSnapshot.forEach(logDoc => {
            const logData = logDoc.data();
            const logDate = new Date(logData.timestamp.seconds * 1000);
            const time = logDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
            
            const logText = `${time} - Action: ${logData.action} par ${logData.modifiedBy || 'Système'}`;

            const p = document.createElement('p');
            p.className = 'font-mono text-xs';
            p.textContent = logText;
            container.appendChild(p);
        });
    } catch (error) {
        console.error("Erreur chargement logs:", error);
        container.innerHTML = `<p class="text-red-500">Impossible de charger l'historique. Vérifiez les règles de sécurité Firestore.</p>`;
    }
}