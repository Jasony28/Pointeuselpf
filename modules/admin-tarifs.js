import { collection, query, where, getDocs, doc, updateDoc, orderBy } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent, showInfoModal } from "../app.js";

let usersCache = [];
let chantiersCache = [];

export async function render() {
    pageContent.innerHTML = `
        <div class="max-w-4xl mx-auto space-y-8">
            <div>
                <h2 class="text-2xl font-bold mb-2">💰 Gestion des Taux Horaires</h2>
                <p class="text-gray-600">Définissez ici le coût horaire de chaque employé et le tarif de facturation pour chaque chantier.</p>
            </div>

            <!-- Section des Taux Employés -->
            <div class="bg-white p-6 rounded-lg shadow-sm">
                <h3 class="text-xl font-semibold mb-4">Salaires des Employés (Coût/heure)</h3>
                <div id="user-rates-list" class="space-y-3">
                    <p class="text-center text-gray-500">Chargement...</p>
                </div>
            </div>

            <!-- Section des Tarifs Chantiers -->
            <div class="bg-white p-6 rounded-lg shadow-sm">
                <h3 class="text-xl font-semibold mb-4">Facturation des Chantiers (Tarif/heure)</h3>
                <div id="chantier-rates-list" class="space-y-3">
                    <p class="text-center text-gray-500">Chargement...</p>
                </div>
            </div>
        </div>
    `;
    await loadData();
    displayUsers();
    displayChantiers();
}

/**
 * Charge uniquement les utilisateurs et les chantiers actifs depuis Firestore.
 */
async function loadData() {
    // CORRECTION : Ne charge que les utilisateurs qui ne sont PAS bannis.
    const usersQuery = query(collection(db, "users"), where("status", "!=", "banned"));
    const usersSnapshot = await getDocs(usersQuery);
    usersCache = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName)); // Tri manuel après récupération

    // CORRECTION : Ne charge que les chantiers qui sont actifs.
    const chantiersQuery = query(collection(db, "chantiers"), where("status", "==", "active"), orderBy("name"));
    const chantiersSnapshot = await getDocs(chantiersQuery);
    chantiersCache = chantiersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

function displayUsers() {
    const container = document.getElementById('user-rates-list');
    container.innerHTML = '';

    if (usersCache.length === 0) {
        container.innerHTML = `<p class="text-center text-gray-500">Aucun utilisateur actif trouvé.</p>`;
        return;
    }

    usersCache.forEach(user => {
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

    document.querySelectorAll('.save-user-rate-btn').forEach(btn => {
        btn.onclick = async () => {
            const userId = btn.dataset.id;
            const newRate = document.getElementById(`user-rate-${userId}`).valueAsNumber;
            await updateDoc(doc(db, "users", userId), { tauxHoraire: newRate });
            btn.textContent = '✔️';
            setTimeout(() => { btn.textContent = 'OK'; }, 1500);
        };
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

    document.querySelectorAll('.save-chantier-rate-btn').forEach(btn => {
        btn.onclick = async () => {
            const chantierId = btn.dataset.id;
            const newRate = document.getElementById(`chantier-rate-${chantierId}`).valueAsNumber;
            await updateDoc(doc(db, "chantiers", chantierId), { tauxFacturation: newRate });
            btn.textContent = '✔️';
            setTimeout(() => { btn.textContent = 'OK'; }, 1500);
        };
    });
}
