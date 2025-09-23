import { collection, query, where, onSnapshot, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent, showConfirmationModal, showInfoModal } from "../app.js";

// Garde en mémoire les timers pour pouvoir les arrêter proprement
let timers = {};
let unsubscribe = null; // Pour arrêter l'écoute en temps réel quand on quitte la page

function formatElapsedTime(startTime) {
    const now = new Date();
    const start = new Date(startTime);
    const diffMs = now - start;

    if (diffMs < 0) return "00:00:00";

    const hours = String(Math.floor(diffMs / 3600000)).padStart(2, '0');
    const minutes = String(Math.floor((diffMs % 3600000) / 60000)).padStart(2, '0');
    const seconds = String(Math.floor((diffMs % 60000) / 1000)).padStart(2, '0');
    
    return `${hours}:${minutes}:${seconds}`;
}

async function forceStopPointage(docId, userName) {
    const confirmed = await showConfirmationModal(
        "Forcer l'arrêt",
        `Voulez-vous vraiment forcer l'arrêt du pointage de ${userName} ? L'heure de fin sera l'heure actuelle.`
    );

    if (confirmed) {
        try {
            const pointageRef = doc(db, "pointages", docId);
            await updateDoc(pointageRef, {
                endTime: new Date().toISOString(),
                status: 'completed',
                notes: "(Arrêt forcé par un administrateur)"
            });
            showInfoModal("Succès", `Le pointage de ${userName} a été arrêté.`);
        } catch (error) {
            console.error("Erreur lors de l'arrêt forcé:", error);
            showInfoModal("Erreur", "L'opération a échoué.");
        }
    }
}

function renderLivePointageCard(docId, data) {
    const cardId = `live-card-${docId}`;
    let card = document.getElementById(cardId);

    if (!card) {
        card = document.createElement('div');
        card.id = cardId;
        card.className = "p-4 rounded-lg shadow-sm relative transition-all duration-300";
        card.style.backgroundColor = 'var(--color-surface)';
        card.style.border = '1px solid var(--color-border)';
        document.getElementById('live-pointages-list').appendChild(card);
    }

    const startTime = new Date(data.timestamp);
    const timeString = startTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    card.innerHTML = `
        <div class="flex justify-between items-start">
            <div>
                <p class="font-bold text-lg" style="color: var(--color-primary);">${data.userName}</p>
                <p class="text-sm" style="color: var(--color-text-muted);">sur <strong>${data.chantier}</strong></p>
                <p class="text-xs mt-1" style="color: var(--color-text-muted);">Démarré à ${timeString}</p>
            </div>
            <div class="text-right">
                <p class="font-mono text-2xl font-bold" id="timer-${docId}">${formatElapsedTime(data.timestamp)}</p>
                <button class="stop-btn text-xs bg-red-500 hover:bg-red-600 text-white font-bold py-1 px-2 rounded mt-1">Forcer l'arrêt</button>
            </div>
        </div>
    `;

    card.querySelector('.stop-btn').onclick = () => forceStopPointage(docId, data.userName);

    // Démarrer ou mettre à jour le timer
    if (timers[docId]) clearInterval(timers[docId]);
    timers[docId] = setInterval(() => {
        const timerEl = document.getElementById(`timer-${docId}`);
        if (timerEl) {
            timerEl.textContent = formatElapsedTime(data.timestamp);
        } else {
            clearInterval(timers[docId]);
        }
    }, 1000);
}

function removeLivePointageCard(docId) {
    const card = document.getElementById(`live-card-${docId}`);
    if (card) {
        card.classList.add('opacity-0');
        setTimeout(() => card.remove(), 300);
    }
    if (timers[docId]) {
        clearInterval(timers[docId]);
        delete timers[docId];
    }
}

export function render() {
    pageContent.innerHTML = `
        <div class="max-w-4xl mx-auto">
            <div class="flex items-center gap-3 mb-4">
                <span class="text-3xl">📡</span>
                <h2 class="text-2xl font-bold">Pointages en Temps Réel</h2>
            </div>
            <div id="live-pointages-list" class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <p id="loading-message" class="col-span-full text-center p-8" style="color: var(--color-text-muted);">En attente de données en temps réel...</p>
            </div>
        </div>
    `;

    // Nettoyer l'écouteur précédent si on revient sur la page
    if (unsubscribe) {
        unsubscribe();
    }

    const q = query(collection(db, "pointages"), where("endTime", "==", null));
    
    unsubscribe = onSnapshot(q, (querySnapshot) => {
        const loadingMessage = document.getElementById('loading-message');
        if (loadingMessage) {
            loadingMessage.style.display = 'none';
        }

        const currentIds = new Set();
        querySnapshot.forEach(doc => {
            currentIds.add(doc.id);
            renderLivePointageCard(doc.id, doc.data());
        });
        
        // Supprimer les cartes des pointages qui sont terminés
        const displayedCards = document.querySelectorAll('[id^="live-card-"]');
        displayedCards.forEach(card => {
            const docId = card.id.replace('live-card-', '');
            if (!currentIds.has(docId)) {
                removeLivePointageCard(docId);
            }
        });

        if (querySnapshot.empty && loadingMessage) {
            loadingMessage.textContent = "Aucun employé n'est en train de pointer actuellement.";
            loadingMessage.style.display = 'block';
        }
    });

    // S'assurer que les timers sont arrêtés quand on navigue ailleurs
    const mainContent = document.getElementById('page-content');
    const observer = new MutationObserver((mutations) => {
        if (!document.getElementById('live-pointages-list')) {
            if (unsubscribe) {
                unsubscribe();
            }
            Object.values(timers).forEach(clearInterval);
            timers = {};
            observer.disconnect();
        }
    });
    observer.observe(mainContent, { childList: true, subtree: false });
}
