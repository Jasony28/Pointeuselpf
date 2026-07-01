// modules/admin-team.js

import { collection, query, getDocs, doc, updateDoc, deleteDoc, orderBy, where, limit, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent, navigateTo, currentUser, showConfirmationModal, showInfoModal, isStealthMode } from "../app.js";
import { getUsers, transferOrDuplicateUserData } from "./data-service.js";
import { formatMilliseconds } from "./utils.js";

/**
 * Point d'entrée principal : Rend l'interface de gestion de l'équipe
 */
export async function render() {
    pageContent.innerHTML = `
        <div class="max-w-4xl mx-auto space-y-8">
            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h2 class="text-2xl font-bold" style="color: var(--color-text-base);">👥 Gestion de l'Équipe</h2>
                <button id="btn-open-transfer" class="bg-purple-600 hover:bg-purple-700 text-white font-bold px-4 py-2 rounded-lg text-sm transition-colors shadow-sm">
                    🔄 Transférer / Dupliquer Données
                </button>
            </div>
            
            <div class="p-4 rounded-lg shadow-sm" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                <h3 class="text-xl font-semibold mb-3 border-b pb-2" style="border-color: var(--color-border); color: var(--color-text-base);">Utilisateurs de l'application</h3>
                <div id="user-list-container">
                    <p class="text-center" style="color: var(--color-text-muted);">Chargement...</p>
                </div>
            </div>
            
            ${isStealthMode() ? `
            <div class="p-4 rounded-lg shadow-sm" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                <h3 class="text-xl font-semibold mb-3 border-b pb-2" style="border-color: var(--color-border); color: var(--color-text-base);">Autres Collègues Externes</h3>
                <div class="flex gap-2 mb-4">
                    <input type="text" id="new-colleague-name" placeholder="Nom du nouveau collègue..." 
                           class="border p-2 text-sm rounded flex-1" style="background-color: var(--color-background); border-color: var(--color-border); color: var(--color-text-base);">
                    <button id="add-colleague-btn" class="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-lg text-sm transition-colors">
                        Ajouter
                    </button>
                </div>
                <div id="colleagues-list-container" class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <p class="text-center" style="color: var(--color-text-muted);">Chargement des collègues...</p>
                </div>
            </div>
            ` : ''}
        </div>

        <div id="transferModal" class="hidden fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-4">
            <div class="p-6 rounded-lg shadow-xl w-full max-w-md space-y-4" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                <h3 class="text-xl font-bold" style="color: var(--color-text-base);">🔄 Transférer ou Dupliquer des données</h3>
                <p class="text-xs" style="color: var(--color-text-muted);">Copie ou déplace les pointages et plannings d'un employé vers un autre.</p>
                
                <div class="space-y-3 text-sm">
                    <div>
                        <label class="block font-semibold mb-1" style="color: var(--color-text-base);">Employé Source :</label>
                        <select id="transferSource" class="w-full border p-2 rounded-lg" style="background-color: var(--color-background); border-color: var(--color-border); color: var(--color-text-base);"></select>
                    </div>
                    <div>
                        <label class="block font-semibold mb-1" style="color: var(--color-text-base);">Employé de Destination :</label>
                        <select id="transferTarget" class="w-full border p-2 rounded-lg" style="background-color: var(--color-background); border-color: var(--color-border); color: var(--color-text-base);"></select>
                    </div>
                    <div>
                        <label class="block font-semibold mb-1" style="color: var(--color-text-base);">Mode d'opération :</label>
                        <select id="transferMode" class="w-full border p-2 rounded-lg" style="background-color: var(--color-background); border-color: var(--color-border); color: var(--color-text-base);">
                            <option value="duplicate">Dupliquer (Garder les données sur la source)</option>
                            <option value="transfer">Transférer (Déplacer et nettoyer la source)</option>
                        </select>
                    </div>
                </div>

                <div class="flex justify-end gap-3 pt-2 text-sm">
                    <button id="closeTransferBtn" class="px-4 py-2 rounded-lg border font-medium" style="border-color: var(--color-border); color: var(--color-text-muted);">
                        Annuler
                    </button>
                    <button id="confirmTransferBtn" class="bg-purple-600 hover:bg-purple-700 text-white font-bold px-4 py-2 rounded-lg transition-colors">
                        Confirmer l'opération
                    </button>
                </div>
            </div>
        </div>

        <div id="historyModal" class="hidden fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-4">
            <div class="p-6 rounded-lg shadow-xl w-full max-w-3xl flex flex-col max-h-[85vh] relative" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                <button id="closeHistoryModalBtn" class="absolute top-2 right-4 text-2xl font-bold" style="color: var(--color-text-muted);">&times;</button>
                <h3 id="historyModalTitle" class="text-xl font-bold mb-4 border-b pb-2" style="color: var(--color-text-base); border-color: var(--color-border);"></h3>
                <div id="historyModalContent" class="overflow-y-auto flex-1 pr-2">
                    <p class="text-center" style="color: var(--color-text-muted);">Chargement de l'historique...</p>
                </div>
            </div>
        </div>
    `;

    // Configuration des gestionnaires d'événements globaux
    setupGlobalHandlers();

    // Chargement initial des données
    await loadUsers();
    if (isStealthMode()) {
        await loadColleagues();
    }
}

/**
 * Configure les écouteurs sur les éléments persistants et les modales
 */
function setupGlobalHandlers() {
    const modal = document.getElementById('transferModal');
    const openBtn = document.getElementById('btn-open-transfer');
    const closeBtn = document.getElementById('closeTransferBtn');
    const confirmBtn = document.getElementById('confirmTransferBtn');

    if (openBtn) {
        openBtn.onclick = async () => {
            modal.classList.remove('hidden');
            await populateTransferDropdowns();
        };
    }

    if (closeBtn) {
        closeBtn.onclick = () => {
            modal.classList.add('hidden');
        };
    }

    if (confirmBtn) {
        confirmBtn.onclick = handleDataTransferAction;
    }

    // Écouteur pour fermer la modale d'historique (conservé au cas où)
    const closeHistoryBtn = document.getElementById('closeHistoryModalBtn');
    if (closeHistoryBtn) {
        closeHistoryBtn.onclick = () => {
            document.getElementById('historyModal').classList.add('hidden');
        };
    }

    if (isStealthMode()) {
        const addColleagueBtn = document.getElementById('add-colleague-btn');
        if (addColleagueBtn) {
            addColleagueBtn.onclick = async () => {
                const input = document.getElementById('new-colleague-name');
                const name = input.value.trim();
                if (!name) return;

                try {
                    await addDoc(collection(db, "colleagues"), {
                        name: name,
                        createdAt: serverTimestamp()
                    });
                    input.value = '';
                    showInfoModal("Succès", `Collègue externe "${name}" ajouté.`);
                    await loadColleagues();
                } catch (error) {
                    console.error("Erreur ajout collègue:", error);
                    showInfoModal("Erreur", "Impossible d'ajouter le collègue.");
                }
            };
        }
    }
}

/**
 * Remplit les listes déroulantes de la modale avec les utilisateurs
 */
async function populateTransferDropdowns() {
    const sourceSelect = document.getElementById('transferSource');
    const targetSelect = document.getElementById('transferTarget');
    if (!sourceSelect || !targetSelect) return;

    try {
        const users = await getUsers();
        let optionsHtml = '<option value="" disabled selected>-- Sélectionner un employé --</option>';
        users.forEach(u => {
            optionsHtml += `<option value="${u.id}">${u.displayName || 'Utilisateur inconnu'}</option>`;
        });
        sourceSelect.innerHTML = optionsHtml;
        targetSelect.innerHTML = optionsHtml;
    } catch (error) {
        console.error("Erreur alimentation modale:", error);
    }
}

/**
 * Gère l'exécution du transfert/duplication
 */
async function handleDataTransferAction() {
    const sourceId = document.getElementById('transferSource').value;
    const targetId = document.getElementById('transferTarget').value;
    const mode = document.getElementById('transferMode').value;

    if (!sourceId || !targetId) {
        showInfoModal("Attention", "Veuillez spécifier un employé source et de destination.");
        return;
    }

    if (sourceId === targetId) {
        showInfoModal("Attention", "L'employé de destination doit être différent de l'employé source.");
        return;
    }

    const actionLabel = mode === 'transfer' ? 'TRANSFÉRER définitivement' : 'DUPLIQUER';
    const isConfirmed = await showConfirmationModal(
        "Confirmer l'action", 
        `Voulez-vous vraiment ${actionLabel} les données (pointages/plannings) vers cet utilisateur ?`
    );

    if (isConfirmed) {
        const confirmBtn = document.getElementById('confirmTransferBtn');
        confirmBtn.disabled = true;
        confirmBtn.textContent = "Opération en cours...";

        try {
            const users = await getUsers();
            const targetUser = users.find(u => u.id === targetId);
            
            const targetName = targetUser && targetUser.displayName ? targetUser.displayName : 'Utilisateur inconnu';
            const isCopyMode = (mode === 'duplicate');

            const result = await transferOrDuplicateUserData(sourceId, targetId, isCopyMode, targetName);
            
            showInfoModal("Succès", `L'opération s'est terminée avec succès. ${result.count || 0} éléments ont été mis à jour.`);
            document.getElementById('transferModal').classList.add('hidden');
            
        } catch (error) {
            console.error("Erreur lors du traitement des données:", error);
            showInfoModal("Erreur", "L'opération a échoué. Une partie des données a pu être transférée. Veuillez vérifier les historiques.");
        } finally {
            confirmBtn.disabled = false;
            confirmBtn.textContent = "Confirmer l'opération";
        }
    }
}

/**
 * Charge la liste des utilisateurs enregistrés
 */
async function loadUsers() {
    const listContainer = document.getElementById('user-list-container');
    if (!listContainer) return;

    try {
        const users = await getUsers(true); // Forcer la mise à jour du cache local
        if (users.length === 0) {
            listContainer.innerHTML = '<p class="text-center text-sm" style="color: var(--color-text-muted);">Aucun utilisateur trouvé.</p>';
            return;
        }

        listContainer.innerHTML = '';
        users.forEach(user => {
            const div = document.createElement('div');
            div.className = 'p-3 rounded-lg border flex flex-col md:flex-row justify-between md:items-center gap-4 text-sm mb-2 shadow-sm';
            div.style.backgroundColor = 'var(--color-background)';
            div.style.borderColor = 'var(--color-border)';

            const isApproved = user.status === 'approved';
            const isAdminRole = user.role === 'admin';

            div.innerHTML = `
                <div class="space-y-1">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="user-name-clickable font-bold text-base cursor-pointer hover:underline text-blue-600 dark:text-blue-400" style="color: var(--color-primary);">${user.displayName || 'Sans nom'}</span>
                        <span class="text-xs px-2 py-0.5 rounded font-semibold ${isApproved ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}">
                            ${user.status || 'pending'}
                        </span>
                        <span class="text-xs px-2 py-0.5 rounded font-semibold ${isAdminRole ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}">
                            ${user.role || 'user'}
                        </span>
                    </div>
                    <div class="text-xs flex gap-4" style="color: var(--color-text-muted);">
                        <span>📧 ${user.email || 'Non renseigné'}</span>
                        ${user.gsm ? `<span>📱 ${user.gsm}</span>` : ''}
                    </div>
                </div>
                <div class="flex items-center gap-2 flex-wrap md:justify-end">
                    <button data-action="status" class="px-3 py-1.5 text-xs font-semibold rounded text-white ${isApproved ? 'bg-amber-500 hover:bg-amber-600' : 'bg-green-600 hover:bg-green-700'}">
                        ${isApproved ? 'Suspendre' : 'Approuver'}
                    </button>
                    <button data-action="role" class="bg-gray-600 hover:bg-gray-700 text-white px-3 py-1.5 text-xs font-semibold rounded">
                        Passer ${isAdminRole ? 'User' : 'Admin'}
                    </button>
                    <button data-action="delete" class="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 text-xs font-semibold rounded">
                        Supprimer
                    </button>
                </div>
            `;

            // NOUVEAU COMPORTEMENT : On utilise le routeur pour aller vers la vue complète
            div.querySelector('.user-name-clickable').onclick = () => {
                navigateTo('user-history', { 
                    userId: user.id, 
                    userName: user.displayName 
                });
            };

            // Ajout des écouteurs sur les actions utilisateur (Statut, Rôle, Suppression)
            div.querySelector('[data-action="status"]').onclick = async () => {
                const nextStatus = isApproved ? 'pending' : 'approved';
                if (await showConfirmationModal("Modifier le statut", `Changer le statut de "${user.displayName}" en "${nextStatus}" ?`)) {
                    await updateDoc(doc(db, "users", user.id), { status: nextStatus });
                    await loadUsers();
                }
            };

            div.querySelector('[data-action="role"]').onclick = async () => {
                const nextRole = isAdminRole ? 'user' : 'admin';
                if (await showConfirmationModal("Modifier le rôle", `Changer le rôle de "${user.displayName}" en "${nextRole}" ?`)) {
                    await updateDoc(doc(db, "users", user.id), { role: nextRole });
                    await loadUsers();
                }
            };

            div.querySelector('[data-action="delete"]').onclick = async () => {
                if (await showConfirmationModal("Suppression", `⚠️ Vraiment supprimer définitivement l'utilisateur "${user.displayName}" ?`)) {
                    await deleteDoc(doc(db, "users", user.id));
                    await loadUsers();
                }
            };

            listContainer.appendChild(div);
        });
    } catch (error) {
        console.error("Erreur de chargement des utilisateurs:", error);
        listContainer.innerHTML = '<p class="text-center text-red-500 text-sm">Erreur lors du chargement des profils.</p>';
    }
}

/**
 * Va chercher en base de données et affiche l'historique complet de l'utilisateur ciblé
 * Note : Cette fonction est conservée pour ne pas casser de potentielles autres dépendances,
 * mais la navigation principale se fait désormais via le routeur (navigateTo).
 */
async function showUserHistoryModal(user) {
    const modal = document.getElementById('historyModal');
    const title = document.getElementById('historyModalTitle');
    const content = document.getElementById('historyModalContent');
    
    const searchName = user.displayName || 'Utilisateur inconnu';
    
    title.textContent = `Historique de ${searchName}`;
    content.innerHTML = `<p class="text-center py-4">Chargement...</p>`;
    modal.classList.remove('hidden');
    
    try {
        const q = query(
            collection(db, "pointages"), 
            where("userName", "==", searchName), 
            orderBy("timestamp", "desc")
        );
        
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
            content.innerHTML = `<p class="text-center py-4">Aucun historique trouvé pour cet utilisateur.</p>`;
            return;
        }

        let html = `
            <table class="w-full text-left border-collapse">
                <thead>
                    <tr class="border-b" style="border-color: var(--color-border);">
                        <th class="p-2">Date</th>
                        <th class="p-2">Chantier</th>
                        <th class="p-2">Durée</th>
                    </tr>
                </thead>
                <tbody>`;
        
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const start = data.timestamp ? new Date(data.timestamp.seconds * 1000) : null;
            const end = data.end ? new Date(data.end.seconds * 1000) : null;
            
            let duration = "En cours";
            if (start && end) {
                const diff = end - start;
                duration = formatMilliseconds(diff); 
            }

            html += `
                <tr class="border-b" style="border-color: var(--color-border);">
                    <td class="p-2">${start ? start.toLocaleDateString() : '--'}</td>
                    <td class="p-2">${data.chantier || 'N/A'}</td>
                    <td class="p-2 font-bold">${duration}</td>
                </tr>`;
        });
        
        html += `</tbody></table>`;
        content.innerHTML = html;
        
    } catch (error) {
        console.error("Erreur accès historique:", error);
        content.innerHTML = `<p class="text-red-500 text-center">Erreur lors du chargement.</p>`;
    }
}

/**
 * Récupère et affiche la liste des collègues externes (mode furtif)
 */
async function loadColleagues() {
    const listContainer = document.getElementById('colleagues-list-container');
    try {
        const q = query(collection(db, "colleagues"), orderBy("name", "asc"));
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

/**
 * Crée le composant DOM pour un collègue externe
 */
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