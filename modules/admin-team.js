// modules/admin-team.js

import { collection, query, getDocs, doc, updateDoc, deleteDoc, orderBy, where, limit, addDoc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent, navigateTo, currentUser, showConfirmationModal, showInfoModal, isStealthMode } from "../app.js";
// --- NOUVEL IMPORT ---
import { getUsers } from "./data-service.js";

export async function render() {
    pageContent.innerHTML = `
        <div class="max-w-4xl mx-auto space-y-8">
            <h2 class="text-2xl font-bold">👥 Gestion de l'Équipe</h2>
            <div class="bg-white p-4 rounded-lg shadow-sm">
                <h3 class="text-xl font-semibold mb-3 border-b pb-2">Utilisateurs de l'application</h3>
                <div id="user-list-container"><p class="text-center text-gray-500">Chargement...</p></div>
            </div>
            
            ${isStealthMode() ? `
            <div class="bg-white p-4 rounded-lg shadow-sm">
                <h3 class="text-xl font-semibold mb-3 border-b pb-2">Autres Collègues (externes)</h3>
                <form id="addColleagueForm" class="flex flex-col sm:flex-row gap-3 mb-4">
                    <input id="colleagueNameInput" type="text" placeholder="Nom du nouveau collègue" class="flex-grow border p-2 rounded" required />
                    <button type="submit" class="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded">
                        Ajouter
                    </button>
                </form>
                <div id="colleaguesList" class="space-y-2"><p>Chargement...</p></div>
            </div>
            ` : ''}
        </div>
    `;
    
    setTimeout(() => {
        loadUsers();
        if (isStealthMode()) {
            loadColleagues();
            setupEventListeners();
        }
    }, 0);
}

function setupEventListeners() {
    const addColleagueForm = document.getElementById("addColleagueForm");
    addColleagueForm.onsubmit = async (e) => {
        e.preventDefault();
        const input = document.getElementById("colleagueNameInput");
        const colleagueName = input.value.trim();
        if (colleagueName) {
            try {
                await addDoc(collection(db, "colleagues"), { name: colleagueName });
                input.value = '';
                loadColleagues();
            } catch (error) {
                showInfoModal("Erreur", "Une erreur est survenue lors de l'ajout.");
            }
        }
    };
}

// --- FONCTION MODIFIÉE ---
async function loadUsers() {
    const container = document.getElementById('user-list-container');
    try {
        // On utilise le data-service qui contient la logique de filtrage
        const users = await getUsers();

        if (users.length === 0) {
            container.innerHTML = "<p class='text-center text-gray-500'>Aucun utilisateur à afficher.</p>";
            return;
        }
        
        container.innerHTML = ''; // Vider le message de chargement
        const userListDiv = document.createElement('div');
        userListDiv.className = 'space-y-3';
        users.forEach(userData => userListDiv.appendChild(createUserElement(userData)));
        container.appendChild(userListDiv);
    } catch (error) {
        console.error("Erreur de chargement des utilisateurs:", error);
        container.innerHTML = "<p class='text-red-500'>Erreur de chargement des utilisateurs.</p>";
    }
}

// Le reste du fichier ne change pas
function createUserElement(userData) {
    const userElement = document.createElement('div');
    const visibilityClass = userData.visibility === 'hidden' ? 'opacity-50 border-l-4 border-purple-400' : 'border';
    userElement.className = `p-3 rounded flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 ${visibilityClass}`;

    const userInfoDiv = document.createElement('div');
    userInfoDiv.className = 'cursor-pointer hover:opacity-70 flex-grow';
    userInfoDiv.innerHTML = `<p class="font-semibold">${userData.displayName}</p><p class="text-sm text-gray-600">${userData.email}</p>`;
    userInfoDiv.onclick = () => navigateTo('user-history', { userId: userData.uid, userName: userData.displayName });
    userElement.appendChild(userInfoDiv);
    
    const controlsDiv = document.createElement('div');
    controlsDiv.className = 'flex items-center gap-2 flex-wrap justify-end w-full sm:w-auto';

    if (isStealthMode() && userData.uid !== currentUser.uid) {
        const visibilityBtn = document.createElement('button');
        visibilityBtn.className = 'px-3 py-1 text-sm rounded text-white';
        if (userData.visibility === 'hidden') {
            visibilityBtn.textContent = 'Rendre Visible';
            visibilityBtn.classList.add('bg-blue-500', 'hover:bg-blue-600');
            visibilityBtn.onclick = () => updateUserVisibility(userData.uid, 'visible');
        } else {
            visibilityBtn.textContent = 'Rendre Invisible';
            visibilityBtn.classList.add('bg-purple-600', 'hover:bg-purple-700');
            visibilityBtn.onclick = () => updateUserVisibility(userData.uid, 'hidden');
        }
        controlsDiv.appendChild(visibilityBtn);
    }

    if (userData.uid !== currentUser.uid) {
        const roleLabel = document.createElement('label');
        roleLabel.className = 'flex items-center cursor-pointer mr-4';
        const roleInput = document.createElement('input');
        roleInput.type = 'checkbox';
        roleInput.className = 'sr-only peer';
        roleInput.checked = userData.role === 'admin';
        roleInput.onchange = () => updateUserRole(userData.uid, roleInput.checked ? 'admin' : 'user');
        roleLabel.innerHTML = `<div class="relative w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:start-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div><span class="ms-2 text-sm font-medium">Admin</span>`;
        roleLabel.prepend(roleInput);
        controlsDiv.appendChild(roleLabel);
    }
    
    let statusColor = 'bg-gray-200';
    if (userData.status === 'approved') statusColor = 'bg-green-200 text-green-800';
    if (userData.status === 'pending') statusColor = 'bg-yellow-200 text-yellow-800';
    if (userData.status === 'banned') statusColor = 'bg-red-200 text-red-800';
    const statusSpan = document.createElement('span');
    statusSpan.className = `px-3 py-1 text-xs font-semibold rounded-full ${statusColor}`;
    statusSpan.textContent = userData.status;
    controlsDiv.appendChild(statusSpan);

    if (userData.uid !== currentUser.uid) {
        if (userData.status === 'pending') {
            const approveBtn = document.createElement('button');
            approveBtn.className = 'px-3 py-1 text-sm rounded text-white bg-green-500 hover:bg-green-600';
            approveBtn.textContent = 'Approuver';
            approveBtn.onclick = () => updateUserStatus(userData.uid, 'approved');
            controlsDiv.appendChild(approveBtn);
        }
        if (userData.status === 'approved') {
            const banBtn = document.createElement('button');
            banBtn.className = 'px-3 py-1 text-sm rounded text-white bg-yellow-600 hover:bg-yellow-700';
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
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'px-3 py-1 text-sm rounded text-white bg-red-600 hover:bg-red-700';
        deleteBtn.textContent = 'Supprimer';
        deleteBtn.onclick = () => deleteUser(userData.uid, userData.displayName);
        controlsDiv.appendChild(deleteBtn);
    }
    
    userElement.appendChild(controlsDiv);
    return userElement;
}

async function updateUserVisibility(uid, visibility) {
    try {
        await updateDoc(doc(db, "users", uid), { visibility: visibility });
        await getUsers(true); // Force le rafraîchissement du cache dans le service
        loadUsers(); 
    } catch (error) {
        showInfoModal("Erreur", "La mise à jour de la visibilité a échoué.");
    }
}
async function updateUserRole(uid, role) {
    if (!(await showConfirmationModal("Changement de rôle", `Changer le rôle en "${role}" ?`))) {
        loadUsers();
        return;
    }
    try {
        await updateDoc(doc(db, "users", uid), { role: role });
        await getUsers(true);
        loadUsers();
    } catch (error) {
        showInfoModal("Erreur", "La mise à jour du rôle a échoué.");
        loadUsers();
    }
}

async function updateUserStatus(uid, status) {
    await updateDoc(doc(db, "users", uid), { status: status });
    await getUsers(true);
    loadUsers();
}

async function deleteUser(uid, name) {
    if (await showConfirmationModal("Confirmation", `Supprimer définitivement le compte de "${name}" ?`)) {
        try {
            const pointagesQuery = query(collection(db, "pointages"), where("uid", "==", uid), limit(1));
            const pointagesSnapshot = await getDocs(pointagesQuery);
            if (!pointagesSnapshot.empty) {
                showInfoModal("Action Impossible", `Cet utilisateur ne peut pas être supprimé car il possède des fiches de pointage.`);
                return;
            }
            await deleteDoc(doc(db, "users", uid));
            showInfoModal("Succès", `L'utilisateur "${name}" a été supprimé.`);
            await getUsers(true);
            loadUsers();
        } catch (error) {
            showInfoModal("Erreur", "La suppression a échoué.");
        }
    }
}

async function loadColleagues() {
    const listContainer = document.getElementById("colleaguesList");
    listContainer.innerHTML = "<p>Chargement...</p>";
    try {
        const q = query(collection(db, "colleagues"), orderBy("name"));
        const querySnapshot = await getDocs(q);
        listContainer.innerHTML = "";
        if (querySnapshot.empty) {
            listContainer.innerHTML = "<p class='text-gray-500'>Aucun collègue externe trouvé.</p>";
            return;
        }
        querySnapshot.forEach(docSnap => listContainer.appendChild(createColleagueElement(docSnap.id, docSnap.data().name)));
    } catch (error) {
        listContainer.innerHTML = "<p class='text-red-500'>Erreur de chargement des collègues.</p>";
    }
}

function createColleagueElement(id, name) {
    const div = document.createElement('div');
    div.className = 'p-3 bg-gray-50 border rounded flex justify-between items-center';
    div.innerHTML = `<span>${name}</span>`;
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Supprimer';
    deleteBtn.className = 'px-3 py-1 text-sm rounded bg-red-500 hover:bg-red-600 text-white';
    deleteBtn.onclick = async () => {
        if (await showConfirmationModal("Confirmation", `Vraiment supprimer "${name}" ?`)) {
            try {
                await deleteDoc(doc(db, "colleagues", id));
                loadColleagues();
            } catch (error) {
                showInfoModal("Erreur", "La suppression a échoué.");
            }
        }
    };
    div.appendChild(deleteBtn);
    return div;
}