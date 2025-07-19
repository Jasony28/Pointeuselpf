import { collection, query, getDocs, doc, updateDoc, deleteDoc, orderBy } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent, navigateTo, currentUser, showConfirmationModal, showInfoModal } from "../app.js";

/**
 * Fonction principale pour afficher la page de gestion des utilisateurs.
 */
export async function render() {
    pageContent.innerHTML = `
        <div class="max-w-4xl mx-auto">
            <h2 class="text-2xl font-bold mb-4">👥 Gestion des Utilisateurs</h2>
            <div id="user-list-container" class="bg-white p-4 rounded-lg shadow-sm">
                <p class="text-center text-gray-500">Chargement...</p>
            </div>
        </div>
    `;
    loadUsers();
}

/**
 * Charge la liste de tous les utilisateurs depuis Firestore et les affiche.
 */
async function loadUsers() {
    const container = document.getElementById('user-list-container');
    container.innerHTML = '';

    try {
        const q = query(collection(db, "users"), orderBy("displayName"));
        const usersSnapshot = await getDocs(q);

        if (usersSnapshot.empty) {
            container.innerHTML = "<p class='text-center text-gray-500'>Aucun utilisateur trouvé.</p>";
            return;
        }

        const userListDiv = document.createElement('div');
        userListDiv.className = 'space-y-3';
        
        usersSnapshot.forEach(docSnap => {
            const userData = docSnap.data();
            userListDiv.appendChild(createUserElement(userData));
        });
        
        container.appendChild(userListDiv);

    } catch (error) {
        console.error("Erreur de chargement des utilisateurs:", error);
        container.innerHTML = "<p class='text-red-500'>Erreur de chargement.</p>";
    }
}

/**
 * Crée un élément HTML pour un utilisateur avec ses informations et les contrôles admin.
 * @param {object} userData - Les données de l'utilisateur.
 * @returns {HTMLElement} - L'élément div créé.
 */
function createUserElement(userData) {
    const userElement = document.createElement('div');
    userElement.className = 'p-3 border rounded flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3';

    // Zone d'information cliquable pour voir l'historique
    const userInfoDiv = document.createElement('div');
    userInfoDiv.className = 'cursor-pointer hover:opacity-70 flex-grow';
    userInfoDiv.innerHTML = `
        <p class="font-semibold">${userData.displayName}</p>
        <p class="text-sm text-gray-600">${userData.email}</p>
    `;
    userInfoDiv.onclick = () => navigateTo('user-history', { userId: userData.uid, userName: userData.displayName });
    userElement.appendChild(userInfoDiv);
    
    // Conteneur pour tous les boutons et interrupteurs
    const controlsDiv = document.createElement('div');
    controlsDiv.className = 'flex items-center gap-2 flex-wrap justify-end w-full sm:w-auto';

    // Interrupteur pour le rôle "Admin"
    if (userData.uid !== currentUser.uid) { // Un admin ne peut pas modifier son propre rôle
        const roleLabel = document.createElement('label');
        roleLabel.className = 'flex items-center cursor-pointer mr-4';
        const roleInput = document.createElement('input');
        roleInput.type = 'checkbox';
        roleInput.className = 'sr-only peer';
        roleInput.checked = userData.role === 'admin';
        roleInput.onchange = () => updateUserRole(userData.uid, roleInput.checked ? 'admin' : 'user');
        
        roleLabel.innerHTML = `
          <div class="relative w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:start-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
          <span class="ms-2 text-sm font-medium text-gray-900">Admin</span>
        `;
        roleLabel.prepend(roleInput);
        controlsDiv.appendChild(roleLabel);
    }
    
    // Affichage du statut (pending, approved, banned)
    let statusColor = 'bg-gray-200 text-gray-800';
    if (userData.status === 'approved') statusColor = 'bg-green-200 text-green-800';
    if (userData.status === 'pending') statusColor = 'bg-yellow-200 text-yellow-800';
    if (userData.status === 'banned') statusColor = 'bg-red-200 text-red-800';
    const statusSpan = document.createElement('span');
    statusSpan.className = `px-3 py-1 text-xs font-semibold rounded-full ${statusColor}`;
    statusSpan.textContent = userData.status;
    controlsDiv.appendChild(statusSpan);

    // Boutons d'action (sauf pour soi-même)
    if (userData.uid !== currentUser.uid) {
        if (userData.status === 'pending') {
            const approveBtn = document.createElement('button');
            approveBtn.className = 'px-3 py-1 text-sm rounded text-white bg-green-500 hover:bg-green-600';
            approveBtn.textContent = 'Approuver';
            approveBtn.onclick = () => updateUserStatus(userData.uid, 'approved');
            controlsDiv.appendChild(approveBtn);

            const denyBtn = document.createElement('button');
            denyBtn.className = 'px-3 py-1 text-sm rounded text-white bg-red-500 hover:bg-red-600';
            denyBtn.textContent = 'Refuser';
            denyBtn.onclick = () => deleteUser(userData.uid);
            controlsDiv.appendChild(denyBtn);
        }

        if (userData.status === 'approved') {
            const banBtn = document.createElement('button');
            banBtn.className = 'px-3 py-1 text-sm rounded text-white bg-red-500 hover:bg-red-600';
            banBtn.textContent = 'Bannir';
            banBtn.onclick = () => updateUserStatus(userData.uid, 'banned');
            controlsDiv.appendChild(banBtn);
        }

        if (userData.status === 'banned') {
            const unbanBtn = document.createElement('button');
            unbanBtn.className = 'px-3 py-1 text-sm rounded text-white bg-green-500 hover:bg-green-600';
            unbanBtn.textContent = 'Débannir';
            unbanBtn.onclick = () => updateUserStatus(userData.uid, 'approved');
            controlsDiv.appendChild(unbanBtn);
        }
    }
    
    userElement.appendChild(controlsDiv);
    return userElement;
}

/**
 * Met à jour le rôle d'un utilisateur dans Firestore.
 * @param {string} uid - L'ID de l'utilisateur.
 * @param {string} role - Le nouveau rôle ('admin' or 'user').
 */
async function updateUserRole(uid, role) {
    const confirmed = await showConfirmationModal("Changement de rôle", `Voulez-vous vraiment changer le rôle de cet utilisateur en "${role}" ?`);
    if (!confirmed) {
        loadUsers(); // Recharge pour annuler le changement visuel de l'interrupteur
        return;
    }
    const userRef = doc(db, "users", uid);
    try {
        await updateDoc(userRef, { role: role });
    } catch (error) {
        showInfoModal("Erreur", "La mise à jour du rôle a échoué.");
        loadUsers(); // Recharge en cas d'erreur pour être sûr de l'état
    }
}

/**
 * Met à jour le statut d'un utilisateur (approved, banned).
 * @param {string} uid - L'ID de l'utilisateur.
 * @param {string} status - Le nouveau statut.
 */
async function updateUserStatus(uid, status) {
    const userRef = doc(db, "users", uid);
    await updateDoc(userRef, { status: status });
    loadUsers();
}

/**
 * Supprime un utilisateur après confirmation.
 * @param {string} uid - L'ID de l'utilisateur à supprimer.
 */
async function deleteUser(uid) {
    const confirmed = await showConfirmationModal("Confirmation", "Voulez-vous vraiment refuser et supprimer cet utilisateur ? Cette action est irréversible.");
    if (confirmed) {
        await deleteDoc(doc(db, "users", uid));
        loadUsers();
    }
}