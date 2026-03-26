// modules/admin-team.js

import { collection, query, getDocs, doc, updateDoc, deleteDoc, orderBy, where, limit, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent, navigateTo, currentUser, showConfirmationModal, showInfoModal, isStealthMode } from "../app.js";
import { getUsers } from "./data-service.js";

export async function render() {
    pageContent.innerHTML = `
        <div class="max-w-4xl mx-auto space-y-8">
            <h2 class="text-2xl font-bold">👥 Gestion de l'Équipe</h2>
            
            <div class="p-4 rounded-lg shadow-sm" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                <h3 class="text-xl font-semibold mb-3 border-b pb-2" style="border-color: var(--color-border);">Utilisateurs de l'application</h3>
                <div id="user-list-container"><p class="text-center" style="color: var(--color-text-muted);">Chargement...</p></div>
            </div>
            
            ${isStealthMode() ? `
            <div class="p-4 rounded-lg shadow-sm" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                <h3 class="text-xl font-semibold mb-3 border-b pb-2" style="border-color: var(--color-border);">Autres Collègues (externes)</h3>
                <form id="addColleagueForm" class="flex gap-2 mb-4">
                    <input type="text" id="colleagueNameInput" placeholder="Nom du collègue" class="border p-2 rounded flex-grow" style="background-color: var(--color-background); border-color: var(--color-border);" required>
                    <button type="submit" class="px-4 py-2 rounded text-white font-bold" style="background-color: var(--color-primary);">Ajouter</button>
                </form>
                <div id="colleaguesList" class="space-y-2"></div>
            </div>
            ` : ''}
        </div>

        <div id="archiveModal" class="hidden fixed inset-0 bg-black bg-opacity-50 overflow-y-auto z-50 p-4">
            <div class="flex min-h-full items-center justify-center">
                <div class="p-6 rounded-lg shadow-xl w-full max-w-sm" style="background-color: var(--color-surface);">
                    <h3 class="text-xl font-bold mb-2">Archiver l'employé</h3>
                    <p id="archiveUserName" class="mb-4 font-semibold text-red-600"></p>
                    <form id="archiveForm" class="space-y-4">
                        <input type="hidden" id="archiveUserId">
                        <div>
                            <label class="block text-sm font-medium mb-1">Conserver les pointages pendant :</label>
                            <select id="retentionSelect" class="w-full border p-2 rounded" style="background-color: var(--color-background); border-color: var(--color-border);">
                                <option value="1">1 an</option>
                                <option value="3">3 ans</option>
                                <option value="5">5 ans</option>
                                <option value="0" class="text-red-500 font-bold">Supprimer TOUT (Compte + Pointages)</option>
                            </select>
                            <p class="text-xs mt-2" style="color: var(--color-text-muted);">L'utilisateur n'aura plus accès à l'application et disparaîtra du planning.</p>
                        </div>
                        <div class="flex justify-end gap-3 mt-4">
                            <button type="button" id="cancelArchiveBtn" class="px-4 py-2 rounded border font-bold" style="background-color: var(--color-background); border-color: var(--color-border);">Annuler</button>
                            <button type="submit" class="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded font-bold">Confirmer</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;

    setTimeout(() => {
        loadUsers();
        setupArchiveModal();
        if (isStealthMode()) {
            loadColleagues();
            setupEventListeners();
        }
    }, 0);
}

function setupEventListeners() {
    const addColleagueForm = document.getElementById("addColleagueForm");
    if (addColleagueForm) {
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
}

function setupArchiveModal() {
    const archiveModal = document.getElementById('archiveModal');
    const archiveForm = document.getElementById('archiveForm');
    
    document.getElementById('cancelArchiveBtn').onclick = () => archiveModal.classList.add('hidden');
    
    archiveForm.onsubmit = async (e) => {
        e.preventDefault();
        const uid = document.getElementById('archiveUserId').value;
        const name = document.getElementById('archiveUserName').textContent;
        const retention = document.getElementById('retentionSelect').value;
        
        archiveModal.classList.add('hidden');

        try {
            if (retention === "0") {
                // Suppression TOTALE (Pointages + Compte)
                if (await showConfirmationModal("ATTENTION", `Cela supprimera définitivement "${name}" ET tous ses pointages. C'est irréversible. Continuer ?`)) {
                    
                    // 1. Supprimer tous les pointages de cet utilisateur
                    const pointagesQuery = query(collection(db, "pointages"), where("uid", "==", uid));
                    const pointagesSnapshot = await getDocs(pointagesQuery);
                    const deletePromises = pointagesSnapshot.docs.map(docSnap => deleteDoc(doc(db, "pointages", docSnap.id)));
                    await Promise.all(deletePromises);
                    
                    // 2. Supprimer le compte utilisateur
                    await deleteDoc(doc(db, "users", uid));
                    showInfoModal("Succès", `L'utilisateur "${name}" et tous ses pointages ont été supprimés.`);
                }
            } else {
                // ARCHIVAGE
                const retentionYears = parseInt(retention);
                await updateDoc(doc(db, "users", uid), { 
                    status: 'archived', 
                    retentionYears: retentionYears,
                    archivedAt: serverTimestamp() 
                });
                showInfoModal("Succès", `Le compte de "${name}" est archivé.\nSes pointages seront gardés pendant ${retentionYears} an(s).`);
            }
            
            await getUsers(true); // Force le rafraîchissement du cache
            loadUsers(); // Recharge la liste
        } catch (error) {
            console.error("Erreur lors de l'archivage/suppression :", error);
            showInfoModal("Erreur", "L'opération a échoué.");
        }
    };
}

async function loadUsers() {
    const container = document.getElementById('user-list-container');
    try {
        const users = await getUsers();

        if (users.length === 0) {
            container.innerHTML = "<p class='text-center text-gray-500'>Aucun utilisateur à afficher.</p>";
            return;
        }
        
        container.innerHTML = '';
        const userListDiv = document.createElement('div');
        userListDiv.className = 'space-y-3';
        
        users.forEach(userData => {
            // On ne crée pas l'élément si l'utilisateur est archivé (au cas où getUsers() ne le filtre pas déjà)
            if (userData.status !== 'archived') {
                userListDiv.appendChild(createUserElement(userData));
            }
        });
        
        container.appendChild(userListDiv);
    } catch (error) {
        console.error("Erreur de chargement des utilisateurs:", error);
        container.innerHTML = "<p class='text-red-500 text-center'>Erreur de chargement des utilisateurs.</p>";
    }
}

function createUserElement(userData) {
    const userElement = document.createElement('div');
    const visibilityClass = userData.visibility === 'hidden' ? 'opacity-50 border-l-4 border-purple-400' : 'border';
    userElement.className = `p-3 rounded flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 ${visibilityClass}`;

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

    // Visibilité (Stealth Mode)
    if (isStealthMode() && userData.uid !== currentUser.uid) {
        const visibilityBtn = document.createElement('button');
        visibilityBtn.className = 'px-3 py-1 text-sm rounded text-white font-medium';
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

    // Changement de Rôle (Admin / User)
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
            <span class="ms-2 text-sm font-medium">Admin</span>
        `;
        roleLabel.prepend(roleInput);
        controlsDiv.appendChild(roleLabel);
    }
    
    // Badge de Statut
    let statusColor = 'bg-gray-200';
    if (userData.status === 'approved') statusColor = 'bg-green-200 text-green-800';
    if (userData.status === 'pending') statusColor = 'bg-yellow-200 text-yellow-800';
    if (userData.status === 'banned') statusColor = 'bg-red-200 text-red-800';
    
    const statusSpan = document.createElement('span');
    statusSpan.className = `px-3 py-1 text-xs font-semibold rounded-full ${statusColor}`;
    statusSpan.textContent = userData.status;
    controlsDiv.appendChild(statusSpan);

    // Boutons d'actions rapides (Approuver / Bannir / Supprimer-Archiver)
    if (userData.uid !== currentUser.uid) {
        if (userData.status === 'pending') {
            const approveBtn = document.createElement('button');
            approveBtn.className = 'px-3 py-1 text-sm rounded text-white bg-green-500 hover:bg-green-600 font-medium';
            approveBtn.textContent = 'Approuver';
            approveBtn.onclick = () => updateUserStatus(userData.uid, 'approved');
            controlsDiv.appendChild(approveBtn);
        }
        
        if (userData.status === 'approved') {
            const banBtn = document.createElement('button');
            banBtn.className = 'px-3 py-1 text-sm rounded text-white bg-yellow-600 hover:bg-yellow-700 font-medium';
            banBtn.textContent = 'Bannir';
            banBtn.onclick = () => updateUserStatus(userData.uid, 'banned');
            controlsDiv.appendChild(banBtn);
        }
        
        if (userData.status === 'banned') {
            const unbanBtn = document.createElement('button');
            unbanBtn.className = 'px-3 py-1 text-sm rounded text-white bg-green-500 hover:bg-green-600 font-medium';
            unbanBtn.textContent = 'Débannir';
            unbanBtn.onclick = () => updateUserStatus(userData.uid, 'approved');
            controlsDiv.appendChild(unbanBtn);
        }
        
        // Bouton Archiver/Supprimer (remplace l'ancien bouton de suppression stricte)
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'px-3 py-1 text-sm rounded text-white bg-red-600 hover:bg-red-700 font-bold';
        deleteBtn.textContent = 'Retirer l\'employé';
        deleteBtn.onclick = () => deleteUser(userData.uid, userData.displayName);
        controlsDiv.appendChild(deleteBtn);
    }
    
    userElement.appendChild(controlsDiv);
    return userElement;
}

async function updateUserVisibility(uid, visibility) {
    try {
        await updateDoc(doc(db, "users", uid), { visibility: visibility });
        await getUsers(true); 
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
    try {
        await updateDoc(doc(db, "users", uid), { status: status });
        await getUsers(true);
        loadUsers();
    } catch (error) {
        showInfoModal("Erreur", "La mise à jour du statut a échoué.");
    }
}

// Ouvre simplement la modale d'archivage maintenant
function deleteUser(uid, name) {
    document.getElementById('archiveUserId').value = uid;
    document.getElementById('archiveUserName').textContent = name;
    document.getElementById('archiveModal').classList.remove('hidden');
}

// --- GESTION DES COLLÈGUES EXTERNES ---

async function loadColleagues() {
    const listContainer = document.getElementById("colleaguesList");
    if (!listContainer) return;
    
    listContainer.innerHTML = "<p>Chargement...</p>";
    try {
        const q = query(collection(db, "colleagues"), orderBy("name"));
        const querySnapshot = await getDocs(q);
        listContainer.innerHTML = "";
        
        if (querySnapshot.empty) {
            listContainer.innerHTML = "<p class='text-gray-500'>Aucun collègue externe trouvé.</p>";
            return;
        }
        
        querySnapshot.forEach(docSnap => {
            listContainer.appendChild(createColleagueElement(docSnap.id, docSnap.data().name));
        });
    } catch (error) {
        listContainer.innerHTML = "<p class='text-red-500'>Erreur de chargement des collègues.</p>";
    }
}

function createColleagueElement(id, name) {
    const div = document.createElement('div');
    div.className = 'p-3 border rounded flex justify-between items-center';
    div.style.backgroundColor = 'var(--color-background)';
    div.style.borderColor = 'var(--color-border)';
    
    div.innerHTML = `<span class="font-medium">${name}</span>`;
    
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Supprimer';
    deleteBtn.className = 'px-3 py-1 text-sm rounded bg-red-500 hover:bg-red-600 text-white font-medium';
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