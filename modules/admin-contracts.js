import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent, showInfoModal } from "../app.js";
import { getUsers } from "./data-service.js";

// La ligne ci-dessous est la plus importante.
// Le mot "export" permet à app.js de trouver et d'utiliser cette fonction.
export async function render() {
    pageContent.innerHTML = `
        <div class="max-w-3xl mx-auto space-y-8">
            <div>
                <h2 class="text-2xl font-bold mb-2">📄 Gestion des Contrats</h2>
                <p style="color: var(--color-text-muted);">Définissez le nombre d'heures hebdomadaires prévues pour chaque employé.</p>
            </div>
            <div class="p-6 rounded-lg shadow-sm" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                <h3 class="text-xl font-semibold mb-4">Heures contractuelles par semaine</h3>
                <div id="user-contracts-list" class="space-y-3">
                    <p class="text-center" style="color: var(--color-text-muted);">Chargement...</p>
                </div>
            </div>
        </div>
    `;
    setTimeout(displayContracts, 0);
}

async function displayContracts() {
    const container = document.getElementById('user-contracts-list');
    container.innerHTML = '';
    const users = await getUsers();
    const activeUsers = users.filter(user => user.status !== 'banned');

    activeUsers.forEach(user => {
        const div = document.createElement('div');
        div.className = 'flex items-center justify-between p-2 border-b';
        div.innerHTML = `
            <span class="font-medium">${user.displayName}</span>
            <div class="flex items-center gap-2">
                <input type="number" step="1" value="${user.contractHours || 0}" class="w-24 border p-1 rounded text-right" id="contract-hours-${user.id}">
                <span>heures/semaine</span>
                <button data-id="${user.id}" class="save-contract-btn bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 text-sm rounded">OK</button>
            </div>
        `;
        container.appendChild(div);
    });

    container.addEventListener('click', async (e) => {
        if (e.target.classList.contains('save-contract-btn')) {
            const btn = e.target;
            const userId = btn.dataset.id;
            const hours = document.getElementById(`contract-hours-${userId}`).valueAsNumber;
            if (isNaN(hours)) return;
            try {
                await updateDoc(doc(db, "users", userId), { contractHours: hours });
                btn.textContent = '✔️';
                await getUsers(true); // Rafraîchir le cache
                setTimeout(() => { btn.textContent = 'OK'; }, 1500);
            } catch (error) {
                showInfoModal("Erreur", "La mise à jour a échoué.");
            }
        }
    });
}

