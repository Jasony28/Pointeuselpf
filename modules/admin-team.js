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
            <div class="flex flex-wrap justify-between items-end gap-3">
                <div>
                    <h2 class="text-2xl font-bold" style="color: var(--color-text-base);">Gestion de l'Équipe</h2>
                    <p class="mt-1 text-sm" style="color: var(--color-text-muted);">Comptes, accès et rôles des membres de l'équipe.</p>
                </div>
                <button id="btn-open-transfer" class="btn btn-secondary">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="pointer-events: none;"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                    Transférer / Dupliquer
                </button>
            </div>

            <div id="team-stats" class="team-stats"></div>

            <div class="hours-toolbar">
                <div class="hours-search">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
                    <input type="search" id="team-search" placeholder="Rechercher un nom ou un e-mail…" autocomplete="off">
                </div>
                <div class="segmented" role="group" aria-label="Filtrer">
                    <button type="button" data-filter="all" class="team-filter is-active">Tous</button>
                    <button type="button" data-filter="approved" class="team-filter">Actifs</button>
                    <button type="button" data-filter="pending" class="team-filter">En attente</button>
                    <button type="button" data-filter="admin" class="team-filter">Admins</button>
                </div>
            </div>

            <div id="user-list-container" class="space-y-5">
                <p class="text-center" style="color: var(--color-text-muted);">Chargement...</p>
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
                <h3 class="text-xl font-bold" style="color: var(--color-text-base);">Transférer ou Dupliquer des données</h3>
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
    document.getElementById('team-search')?.addEventListener('input', renderUserList);
    document.querySelectorAll('.team-filter').forEach(btn => btn.onclick = () => {
        teamFilter = btn.dataset.filter;
        document.querySelectorAll('.team-filter').forEach(b => b.classList.toggle('is-active', b === btn));
        renderUserList();
    });

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
let teamUsers = [];
let teamFilter = 'all';

const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() || '').join('') || '?';
const STATUS_LABELS = { approved: 'Actif', pending: 'En attente', banned: 'Banni' };
const teamIcons = {
    history: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l4 2"/></svg>',
    role: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>',
};

async function loadUsers() {
    const listContainer = document.getElementById('user-list-container');
    if (!listContainer) return;

    try {
        teamUsers = await getUsers(true); // Forcer la mise à jour du cache local
        renderTeamStats();
        renderUserList();
    } catch (error) {
        console.error("Erreur de chargement des utilisateurs:", error);
        listContainer.innerHTML = '<p class="hours-empty">Erreur lors du chargement des profils.</p>';
    }
}

function renderTeamStats() {
    const container = document.getElementById('team-stats');
    if (!container) return;
    const count = (fn) => teamUsers.filter(fn).length;
    const stats = [
        ['Membres', teamUsers.length, ''],
        ['Actifs', count(u => u.status === 'approved'), 'is-ok'],
        ['En attente', count(u => u.status !== 'approved' && u.status !== 'banned'), count(u => u.status !== 'approved' && u.status !== 'banned') ? 'is-warn' : ''],
        ['Admins', count(u => u.role === 'admin'), ''],
    ];
    container.innerHTML = stats.map(([label, value, tone]) => `<div class="team-stat ${tone}"><span>${label}</span><strong>${value}</strong></div>`).join('');
}

function renderUserList() {
    const listContainer = document.getElementById('user-list-container');
    if (!listContainer) return;
    const term = (document.getElementById('team-search')?.value || '').toLowerCase().trim();
    const isPending = (u) => u.status !== 'approved' && u.status !== 'banned';
    const filters = {
        all: () => true,
        approved: (u) => u.status === 'approved',
        pending: isPending,
        admin: (u) => u.role === 'admin',
    };
    const list = teamUsers
        .filter(filters[teamFilter])
        .filter(u => (u.displayName || '').toLowerCase().includes(term) || (u.email || '').toLowerCase().includes(term));

    listContainer.innerHTML = '';
    if (!list.length) {
        listContainer.innerHTML = `<p class="hours-empty">${teamUsers.length ? 'Aucun membre ne correspond.' : 'Aucun utilisateur trouvé.'}</p>`;
        return;
    }

    // Les comptes en attente d'approbation passent en premier
    const pending = list.filter(isPending);
    const others = list.filter(u => !isPending(u));
    const addSection = (title, users, highlight) => {
        if (!users.length) return;
        const section = document.createElement('section');
        section.innerHTML = `<h3 class="kpi-label mb-2">${title} · ${users.length}</h3>`;
        const grid = document.createElement('div');
        grid.className = 'team-grid';
        users.forEach(user => grid.appendChild(createUserCard(user, highlight)));
        section.appendChild(grid);
        listContainer.appendChild(section);
    };
    addSection('À approuver', pending, true);
    addSection(pending.length ? 'Membres' : 'Tous les membres', others, false);
}

function createUserCard(user, highlight) {
    const div = document.createElement('div');
    div.className = `team-card${highlight ? ' is-pending' : ''}`;
    const isApproved = user.status === 'approved';
    const isAdminRole = user.role === 'admin';
    const status = user.status || 'pending';

    div.innerHTML = `
        <div class="team-card-head">
            <span class="avatar team-avatar">${escapeHTML(initials(user.displayName))}</span>
            <div class="min-w-0" style="flex: 1;">
                <button type="button" class="user-name-clickable team-name">${escapeHTML(user.displayName || 'Sans nom')}</button>
                <div class="cchips" style="padding-top: 0.25rem;">
                    <span class="cchip team-status-${escapeHTML(status)}">${STATUS_LABELS[status] || escapeHTML(status)}</span>
                    <span class="cchip${isAdminRole ? ' team-admin' : ''}">${isAdminRole ? 'Administrateur' : 'Employé'}</span>
                </div>
            </div>
        </div>
        <div class="team-contact">
            <span>${escapeHTML(user.email || 'E-mail non renseigné')}</span>
            ${user.gsm ? `<a href="tel:${escapeHTML(user.gsm)}">${escapeHTML(user.gsm)}</a>` : ''}
        </div>
        <div class="team-actions">
            <button data-action="status" class="btn ${isApproved ? 'btn-secondary' : 'btn-primary'}">${isApproved ? 'Suspendre' : 'Approuver'}</button>
            <button data-action="history" class="icon-btn" title="Voir l'historique" aria-label="Voir l'historique">${teamIcons.history}</button>
            <button data-action="role" class="icon-btn" title="Passer ${isAdminRole ? 'Employé' : 'Admin'}" aria-label="Passer ${isAdminRole ? 'Employé' : 'Admin'}">${teamIcons.role}</button>
            <button data-action="delete" class="icon-btn is-danger" title="Supprimer" aria-label="Supprimer">${teamIcons.trash}</button>
        </div>
    `;

    // Vue complète de l'historique via le routeur
    const openHistory = () => navigateTo('user-history', { userId: user.id, userName: user.displayName });
    div.querySelector('.user-name-clickable').onclick = openHistory;
    div.querySelector('[data-action="history"]').onclick = openHistory;

    div.querySelector('[data-action="status"]').onclick = async () => {
        const nextStatus = isApproved ? 'pending' : 'approved';
        if (await showConfirmationModal("Modifier le statut", `${isApproved ? 'Suspendre' : 'Approuver'} le compte de "${user.displayName}" ?`)) {
            await updateDoc(doc(db, "users", user.id), { status: nextStatus });
            await loadUsers();
        }
    };

    div.querySelector('[data-action="role"]').onclick = async () => {
        const nextRole = isAdminRole ? 'user' : 'admin';
        if (await showConfirmationModal("Modifier le rôle", `Passer "${user.displayName}" en ${nextRole === 'admin' ? 'Administrateur' : 'Employé'} ?`)) {
            await updateDoc(doc(db, "users", user.id), { role: nextRole });
            await loadUsers();
        }
    };

    div.querySelector('[data-action="delete"]').onclick = async () => {
        if (await showConfirmationModal("Suppression", `Vraiment supprimer définitivement l'utilisateur "${user.displayName}" ?`)) {
            await deleteDoc(doc(db, "users", user.id));
            await loadUsers();
        }
    };
    return div;
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