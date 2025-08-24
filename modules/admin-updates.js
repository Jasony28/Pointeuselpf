import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, currentUser, pageContent, showInfoModal } from "../app.js";
import { getActiveChantiers } from "./data-service.js"; // <-- NOUVEAU

let chantiersCache = [];

export async function render() {
    pageContent.innerHTML = `
        <div class="max-w-3xl mx-auto space-y-6">
            <h2 class="text-2xl font-bold">📝 Mises à Jour des Chantiers</h2>
            <div class="bg-white p-6 rounded-lg shadow-sm">
                <div class="space-y-4">
                    <div>
                        <label for="chantier-select" class="text-sm font-medium">Sélectionner un chantier à modifier</label>
                        <select id="chantier-select" class="w-full border p-2 rounded mt-1">
                            <option value="">-- Choisissez un chantier --</option>
                        </select>
                    </div>
                    <div>
                        <label for="update-content" class="text-sm font-medium">Informations et consignes pour ce chantier</label>
                        <textarea id="update-content" class="w-full border p-2 rounded mt-1 h-64" placeholder="Écrivez ici les consignes, les points d'attention, les nouvelles tâches..."></textarea>
                    </div>
                    <div class="text-right">
                        <button id="save-update-btn" class="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-2 rounded-lg" disabled>
                            Enregistrer
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    setTimeout(async () => {
        await loadChantiers();
        setupEventListeners();
    }, 0);
}

async function loadChantiers() {
    const select = document.getElementById('chantier-select');
    try {
        chantiersCache = await getActiveChantiers(); // <-- MODIFIÉ
        chantiersCache.forEach(chantier => {
            select.innerHTML += `<option value="${chantier.id}">${chantier.name}</option>`;
        });
    } catch (error) {
        console.error("Erreur de chargement des chantiers:", error);
    }
}

function setupEventListeners() {
    const select = document.getElementById('chantier-select');
    const textarea = document.getElementById('update-content');
    const saveBtn = document.getElementById('save-update-btn');

    select.addEventListener('change', async () => {
        const chantierId = select.value;
        if (!chantierId) {
            textarea.value = '';
            saveBtn.disabled = true;
            return;
        }

        saveBtn.disabled = false;
        const updateDocRef = doc(db, "chantierUpdates", chantierId);
        const docSnap = await getDoc(updateDocRef);

        if (docSnap.exists()) {
            textarea.value = docSnap.data().content || '';
        } else {
            textarea.value = '';
        }
    });

    saveBtn.addEventListener('click', async () => {
        const chantierId = select.value;
        const selectedChantier = chantiersCache.find(c => c.id === chantierId);
        if (!chantierId || !selectedChantier) {
            showInfoModal("Erreur", "Veuillez sélectionner un chantier valide.");
            return;
        }

        const content = textarea.value.trim();
        const updateDocRef = doc(db, "chantierUpdates", chantierId);

        try {
            await setDoc(updateDocRef, {
                content: content,
                chantierId: chantierId,
                chantierName: selectedChantier.name,
                updatedAt: serverTimestamp(),
                updatedBy: currentUser.displayName
            }, { merge: true });
            showInfoModal("Succès", "La mise à jour a été enregistrée.");
        } catch (error) {
            console.error("Erreur d'enregistrement:", error);
            showInfoModal("Erreur", "L'enregistrement a échoué.");
        }
    });
}