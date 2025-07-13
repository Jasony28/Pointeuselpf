// modules/admin-users.js

import { collection, query, getDocs, doc, updateDoc, deleteDoc, orderBy } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent, navigateTo, currentUser } from "../app.js";

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
            // On ne peut pas modifier son propre statut/rôle
            if (userData.uid === currentUser.uid) return;

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
    userElement.className = 'p-3 border rounded flex justify-between items-center';

    const userInfoDiv = document.createElement('div');
    userInfoDiv.className = 'cursor-pointer hover:opacity-70 flex-grow';
    userInfoDiv.innerHTML = `
        <p class="font-semibold">${userData.displayName}</p>
        <p class="text-sm text-gray-600">${userData.email}</p>
    `;
    userInfoDiv.onclick = () => navigateTo('user-history', { userId: userData.uid, userName: userData.displayName });
    userElement.appendChild(userInfoDiv);
    
    const controlsDiv = document.createElement('div');
    controlsDiv.className = 'flex items-center gap-2 flex-wrap justify-end';
    
    // Affichage du statut
    let statusColor = 'bg-gray-200 text-gray-800';
    if (userData.status === 'approved') statusColor = 'bg-green-200 text-green-800';
    if (userData.status === 'pending') statusColor = 'bg-yellow-200 text-yellow-800';
    if (userData.status === 'banned') statusColor = 'bg-red-200 text-red-800';
    const statusSpan = document.createElement('span');
    statusSpan.className = `px-3 py-1 text-xs font-semibold rounded-full ${statusColor}`;
    statusSpan.textContent = userData.status;
    controlsDiv.appendChild(statusSpan);

    // Boutons d'action
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
    
    userElement.appendChild(controlsDiv);
    return userElement;
}

async function updateUserStatus(uid, status) {
    const userRef = doc(db, "users", uid);
    await updateDoc(userRef, { status: status });
    loadUsers();
}

async function deleteUser(uid) {
    if (confirm("Voulez-vous vraiment refuser et supprimer cet utilisateur ?")) {
        await deleteDoc(doc(db, "users", uid));
        loadUsers();
    }
}