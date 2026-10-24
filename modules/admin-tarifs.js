import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent, showInfoModal } from "../app.js";
import { getUsers, getActiveChantiers } from "./data-service.js"; // <-- NOUVEAU

let usersCache = [];
let chantiersCache = [];

export async function render() {
    pageContent.innerHTML = `
        <div class="max-w-4xl mx-auto space-y-8">
            <div>
                <h2 class="text-2xl font-bold mb-2">Gestion des Taux Horaires</h2>
                <p class="text-gray-600">Définissez ici le coût horaire de chaque employé et le tarif de facturation pour chaque chantier.</p>
            </div>

            <div class="bg-white p-6 rounded-lg shadow-sm">
                <h3 class="text-xl font-semibold mb-4">Salaires des Employés (Coût/heure)</h3>
                <div id="user-rates-list" class="space-y-3">
                    <p class="text-center text-gray-500">Chargement...</p>
                </div>
            </div>

            <div class="bg-white p-6 rounded-lg shadow-sm">
                <h3 class="text-xl font-semibold mb-4">Facturation des Chantiers (Tarif/heure)</h3>
                <div id="chantier-rates-list" class="space-y-3">
                    <p class="text-center text-gray-500">Chargement...</p>
                </div>
            </div>
        </div>
    `;
    setTimeout(async () => {
        await loadData();
        displayUsers();
        displayChantiers();
    }, 0);
}

async function loadData() {
    usersCache = await getUsers(); // <-- MODIFIÉ
    chantiersCache = await getActiveChantiers(); // <-- MODIFIÉ
}

function displayUsers() {
    const container = document.getElementById('user-rates-list');
    container.innerHTML = '';

    const activeUsers = usersCache.filter(user => user.status !== 'banned'); // Filtre supplémentaire pour l'UI

    if (activeUsers.length === 0) {
        container.innerHTML = `<p class="text-center text-gray-500">Aucun utilisateur actif trouvé.</p>`;
        return;
    }

    activeUsers.forEach(user => {
        const div = document.createElement('div');
        div.className = 'flex items-center justify-between p-2 border-b';
        div.innerHTML = `
            <span class="font-medium">${user.displayName}</span>
            <div class="flex items-center gap-2">
                <input type="number" step="0.01" value="${user.tauxHoraire || 0}" class="w-24 border p-1 rounded text-right" id="user-rate-${user.id}">
                <span>€/h</span>
                <button data-id="${user.id}" class="save-user-rate-btn bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 text-sm rounded">OK</button>
            </div>
        `;
        container.appendChild(div);
    });

    // Utilisation de la délégation d'événement pour la performance
    container.addEventListener('click', async (e) => {
        if (e.target.classList.contains('save-user-rate-btn')) {
            const btn = e.target;
            const userId = btn.dataset.id;
            const newRate = document.getElementById(`user-rate-${userId}`).valueAsNumber;
            if (isNaN(newRate)) return;
            try {
                await updateDoc(doc(db, "users", userId), { tauxHoraire: newRate });
                btn.textContent = '✔️';
                // Rafraîchir le cache des utilisateurs car une donnée a changé
                await getUsers(true);
                setTimeout(() => { btn.textContent = 'OK'; }, 1500);
            } catch (error) {
                console.error("Erreur de mise à jour du taux horaire:", error);
                showInfoModal("Erreur", "La mise à jour a échoué.");
            }
        }
    });
}

function displayChantiers() {
    const container = document.getElementById('chantier-rates-list');
    container.innerHTML = '';

    if (chantiersCache.length === 0) {
        container.innerHTML = `<p class="text-center text-gray-500">Aucun chantier actif trouvé.</p>`;
        return;
    }

    chantiersCache.forEach(chantier => {
        const div = document.createElement('div');
        div.className = 'flex items-center justify-between p-2 border-b';
        div.innerHTML = `
            <span class="font-medium">${chantier.name}</span>
            <div class="flex items-center gap-2">
                <input type="number" step="0.01" value="${chantier.tauxFacturation || 0}" class="w-24 border p-1 rounded text-right" id="chantier-rate-${chantier.id}">
                <span>€/h</span>
                <button data-id="${chantier.id}" class="save-chantier-rate-btn bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 text-sm rounded">OK</button>
            </div>
        `;
        container.appendChild(div);
    });

    // Utilisation de la délégation d'événement
    container.addEventListener('click', async (e) => {
        if (e.target.classList.contains('save-chantier-rate-btn')) {
            const btn = e.target;
            const chantierId = btn.dataset.id;
            const newRate = document.getElementById(`chantier-rate-${chantierId}`).valueAsNumber;
            if (isNaN(newRate)) return;
            try {
                await updateDoc(doc(db, "chantiers", chantierId), { tauxFacturation: newRate });
                btn.textContent = '✔️';
                // Rafraîchir le cache des chantiers
                await getActiveChantiers(true);
                setTimeout(() => { btn.textContent = 'OK'; }, 1500);
            } catch (error) {
                console.error("Erreur de mise à jour du taux de facturation:", error);
                showInfoModal("Erreur", "La mise à jour a échoué.");
            }
        }
    });
}