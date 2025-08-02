import { collection, query, getDocs, doc, updateDoc, deleteDoc, orderBy } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent, navigateTo, currentUser, showConfirmationModal, showInfoModal } from "../app.js";

export async function render() {
    pageContent.innerHTML = `
        <div class="max-w-4xl mx-auto">
            <h2 class="text-2xl font-bold mb-4">👥 Gestion des Utilisateurs</h2>
            <div id="user-list-container" class="bg-white p-4 rounded-lg shadow-sm">
                <p class="text-center text-gray-500">Chargement...</p>
            </div>
        </div>
    `;
    
    setTimeout(loadUsers, 0);
}

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

function createUserElement(userData) {
    const userElement = document.createElement('div');
    userElement.className = 'p-3 border rounded flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3';

    const userInfoDiv = document.createElement('div');
    userInfoDiv.className = 'cursor-pointer hover:opacity-70 flex-grow';
    userInfoDiv.innerHTML = `
        <p class="font-semibold">${userData.displayName}</p>
        <p class="text-sm text-gray-600">${userData.email}</p>
    `;
    userInfoDiv.onclick = () => navigateTo('user-history', { userId: userData.uid, userName: userData.displayName });
    userElement.appendChild(userInfoDiv);
    
    const controlsDiv = document.createElement('div');
    controlsDiv.className = 'flex items-center gap-2 flex-wrap justify-end w-full sm:w-auto';

    if (userData.uid !== currentUser.uid) {
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
    
    let statusColor = 'bg-gray-200 text-gray-800';
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

        // --- NOUVEAU BOUTON DE SUPPRESSION ---
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'px-3 py-1 text-sm rounded text-white bg-red-600 hover:bg-red-700';
        deleteBtn.textContent = 'Supprimer';
        deleteBtn.onclick = () => deleteUser(userData.uid, userData.displayName);
        controlsDiv.appendChild(deleteBtn);
    }
    
    userElement.appendChild(controlsDiv);
    return userElement;
}

async function updateUserRole(uid, role) {
    const confirmed = await showConfirmationModal("Changement de rôle", `Voulez-vous vraiment changer le rôle de cet utilisateur en "${role}" ?`);
    if (!confirmed) {
        loadUsers();
        return;
    }
    const userRef = doc(db, "users", uid);
    try {
        await updateDoc(userRef, { role: role });
    } catch (error) {
        showInfoModal("Erreur", "La mise à jour du rôle a échoué.");
        loadUsers();
    }
}

async function updateUserStatus(uid, status) {
    const userRef = doc(db, "users", uid);
    await updateDoc(userRef, { status: status });
    loadUsers();
}

// --- FONCTION DE SUPPRESSION MISE À JOUR ---
async function deleteUser(uid, name) {
    const confirmed = await showConfirmationModal(
        "Confirmation de Suppression", 
        `Voulez-vous vraiment supprimer définitivement le compte de "${name}" ? Cette action est irréversible et supprimera l'utilisateur de l'application.`
    );
    if (confirmed) {
        try {
            await deleteDoc(doc(db, "users", uid));
            showInfoModal("Succès", `L'utilisateur "${name}" a été supprimé.`);
            loadUsers();
        } catch (error) {
            console.error("Erreur de suppression de l'utilisateur:", error);
            showInfoModal("Erreur", "La suppression a échoué.");
        }
    }
}
