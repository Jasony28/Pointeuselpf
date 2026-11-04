// modules/admin-team.js

import { collection, query, getDocs, doc, updateDoc, deleteDoc, orderBy, where, limit, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent, navigateTo, currentUser, showConfirmationModal, showInfoModal, showToast, isStealthMode } from "../app.js";
import { getUsers, getColleagues, transferOrDuplicateUserData } from "./data-service.js";
import { formatMilliseconds } from "./utils.js";
import { clearTripCaches, findWorkedDays, rebuildTripsBulk } from "./trips.js";

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
                <div class="flex flex-wrap gap-2">
                    <button id="btn-open-km-recalc" class="btn btn-secondary">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="pointer-events: none;"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>
                        Recalculer les km
                    </button>
                    <button id="btn-open-transfer" class="btn btn-secondary">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="pointer-events: none;"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                        Transférer / Dupliquer
                    </button>
                </div>
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
            <div class="team-card">
                <h3 class="text-lg font-semibold" style="color: var(--color-text-base);">Autres collègues externes</h3>
                <div class="flex gap-2">
                    <input type="text" id="new-colleague-name" placeholder="Nom du nouveau collègue…" class="input flex-1">
                    <button id="add-colleague-btn" class="btn btn-primary">Ajouter</button>
                </div>
                <div id="colleagues-list-container" class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <p class="text-center" style="color: var(--color-text-muted);">Chargement des collègues...</p>
                </div>
            </div>
            ` : ''}
        </div>

        <div id="kmRecalcModal" class="modal hidden" role="dialog" aria-modal="true" aria-labelledby="kmRecalcTitle">
            <div class="modal-panel">
                <div class="modal-body space-y-4">
                    <div>
                        <h3 id="kmRecalcTitle" class="modal-title">Recalculer les kilomètres</h3>
                        <p class="modal-text">Refait tous les trajets de toute l'équipe sur la période choisie, avec les adresses actuelles des chantiers.</p>
                        <p class="modal-text">Chacun a ses km, conducteur ou passager. Le retour au dépôt n'est compté qu'à partir du 26 octobre 2026.</p>
                    </div>
                    <div class="segmented km-recalc-periods" role="group" aria-label="Période">
                        <button type="button" data-period="week" class="km-period is-active">Cette semaine</button>
                        <button type="button" data-period="lastWeek" class="km-period">Sem. dernière</button>
                        <button type="button" data-period="month" class="km-period">Ce mois-ci</button>
                        <button type="button" data-period="lastMonth" class="km-period">Mois dernier</button>
                        <button type="button" data-period="all" class="km-period km-period-all">Depuis le début</button>
                    </div>
                    <p id="kmRecalcSummary" class="text-sm" style="color: var(--color-text-muted);"></p>
                    <div id="kmRecalcProgress" class="km-progress hidden" aria-live="polite">
                        <div class="km-progress-bar"><span id="kmRecalcBar"></span></div>
                        <p id="kmRecalcStatus" class="text-sm" style="color: var(--color-text-muted);"></p>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" id="kmRecalcCloseBtn" class="btn btn-secondary">Fermer</button>
                    <button type="button" id="kmRecalcStartBtn" class="btn btn-primary" disabled>Recalculer</button>
                </div>
            </div>
        </div>

        <div id="passwordModal" class="modal hidden" role="dialog" aria-modal="true" aria-labelledby="passwordModalTitle">
            <form id="passwordForm" class="modal-panel" novalidate>
                <div class="modal-body space-y-4">
                    <div>
                        <h3 id="passwordModalTitle" class="modal-title">Nouveau mot de passe</h3>
                        <p class="modal-text" id="passwordModalText"></p>
                    </div>
                    <div id="passwordFormFields" class="space-y-1">
                        <label for="newPasswordInput" class="field-label">Nouveau mot de passe (6 caractères minimum)</label>
                        <div class="pw-row">
                            <input id="newPasswordInput" class="input" type="text" minlength="6" maxlength="128" autocomplete="new-password" spellcheck="false" required>
                            <button type="button" id="generatePasswordBtn" class="btn btn-secondary">Proposer</button>
                        </div>
                        <p class="field-hint">L'employé se reconnecte avec ce mot de passe. Ses autres appareils sont déconnectés.</p>
                        <p id="passwordError" class="pw-error" role="alert" hidden></p>
                    </div>
                    <div id="passwordDone" class="pw-done" hidden>
                        <p>Mot de passe changé. Donnez-le à <b id="passwordDoneName"></b> :</p>
                        <div class="pw-row"><code id="passwordDoneValue" class="pw-value"></code><button type="button" id="copyPasswordBtn" class="btn btn-secondary">Copier</button></div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" id="closePasswordBtn" class="btn btn-secondary">Annuler</button>
                    <button type="submit" id="savePasswordBtn" class="btn btn-primary">Enregistrer</button>
                </div>
            </form>
        </div>

        <div id="transferModal" class="modal hidden" role="dialog" aria-modal="true" aria-labelledby="transferModalTitle">
            <div class="modal-panel">
                <div class="modal-body space-y-4">
                    <div>
                        <h3 id="transferModalTitle" class="modal-title">Transférer ou dupliquer des données</h3>
                        <p class="modal-text">Copie ou déplace les pointages et plannings d'un employé vers un autre.</p>
                    </div>
                    <div class="space-y-1">
                        <label for="transferSource" class="field-label">Employé source</label>
                        <select id="transferSource" class="input"></select>
                    </div>
                    <div class="space-y-1">
                        <label for="transferTarget" class="field-label">Employé de destination</label>
                        <select id="transferTarget" class="input"></select>
                    </div>
                    <div class="space-y-1">
                        <label for="transferMode" class="field-label">Mode d'opération</label>
                        <select id="transferMode" class="input">
                            <option value="duplicate">Dupliquer (garder les données sur la source)</option>
                            <option value="transfer">Transférer (déplacer et nettoyer la source)</option>
                        </select>
                    </div>
                </div>
                <div class="modal-footer">
                    <button id="closeTransferBtn" class="btn btn-secondary">Annuler</button>
                    <button id="confirmTransferBtn" class="btn btn-primary">Confirmer l'opération</button>
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
    document.getElementById('btn-open-km-recalc').onclick = openKmRecalc;
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
                    getColleagues(true).catch(() => {});
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
    key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.8-9.8M17 6l3 3M14 9l2 2"/></svg>',
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
    const isSuper = user.superAdmin === true;
    const status = user.status || 'pending';

    div.innerHTML = `
        <div class="team-card-head">
            <span class="avatar team-avatar">${escapeHTML(initials(user.displayName))}</span>
            <div class="min-w-0" style="flex: 1;">
                <button type="button" class="user-name-clickable team-name">${escapeHTML(user.displayName || 'Sans nom')}</button>
                <div class="cchips" style="padding-top: 0.25rem;">
                    <span class="cchip team-status-${escapeHTML(status)}">${STATUS_LABELS[status] || escapeHTML(status)}</span>
                    <span class="cchip${isAdminRole ? ' team-admin' : ''}">${isSuper ? '⭐ Super admin' : (isAdminRole ? 'Administrateur' : 'Employé')}</span>
                    ${isSuper ? '<span class="cchip">Jamais planifié</span>' : ''}
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
            ${!isSuper ? `<button data-action="role" class="icon-btn" title="Passer ${isAdminRole ? 'Employé' : 'Admin'}" aria-label="Passer ${isAdminRole ? 'Employé' : 'Admin'}">${teamIcons.role}</button>` : ''}
            ${isApproved ? `<button data-action="super" class="icon-btn" title="${isSuper ? 'Retirer super admin' : 'Passer super admin (jamais planifié)'}" aria-label="${isSuper ? 'Retirer super admin' : 'Passer super admin'}" aria-pressed="${isSuper}">⭐</button>` : ''}
            <button data-action="password" class="icon-btn" title="Changer le mot de passe" aria-label="Changer le mot de passe de ${escapeHTML(user.displayName || '')}">${teamIcons.key}</button>
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

    div.querySelector('[data-action="super"]')?.addEventListener('click', async () => {
        const msg = isSuper
            ? `Retirer le statut super admin de "${user.displayName}" ? Il redeviendra administrateur et pourra de nouveau être placé sur les chantiers.`
            : `Passer "${user.displayName}" en super admin ?\n\n• Tous les droits d'administrateur\n• N'est JAMAIS placé sur les chantiers (ni par la proposition automatique, ni dans la liste Équipe du planning)\n• Pas de profil de travail à remplir`;
        if (await showConfirmationModal("Super admin", msg)) {
            await updateDoc(doc(db, "users", user.id), isSuper ? { superAdmin: false } : { superAdmin: true, role: 'admin' });
            await loadUsers();
        }
    });

    div.querySelector('[data-action="role"]')?.addEventListener('click', async () => {
        const nextRole = isAdminRole ? 'user' : 'admin';
        if (await showConfirmationModal("Modifier le rôle", `Passer "${user.displayName}" en ${nextRole === 'admin' ? 'Administrateur' : 'Employé'} ?`)) {
            await updateDoc(doc(db, "users", user.id), { role: nextRole });
            await loadUsers();
        }
    });

    div.querySelector('[data-action="password"]').onclick = () => openPasswordModal(user);

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
            listContainer.innerHTML = "<p class='hours-empty col-span-full'>Aucun collègue externe trouvé.</p>";
            return;
        }
        
        querySnapshot.forEach(docSnap => {
            listContainer.appendChild(createColleagueElement(docSnap.id, docSnap.data().name));
        });
    } catch (error) {
        listContainer.innerHTML = "<p class='hours-empty col-span-full'>Erreur de chargement des collègues.</p>";
    }
}

/**
 * Crée le composant DOM pour un collègue externe
 */
function createColleagueElement(id, name) {
    const div = document.createElement('div');
    div.className = 'colleague-row';
    div.innerHTML = `<span class="font-medium">${escapeHTML(name)}</span>`;

    const deleteBtn = document.createElement('button');
    deleteBtn.innerHTML = teamIcons.trash;
    deleteBtn.className = 'icon-btn is-danger';
    deleteBtn.title = 'Supprimer';
    deleteBtn.setAttribute('aria-label', `Supprimer ${name}`);
    deleteBtn.onclick = async () => {
        if (await showConfirmationModal("Confirmation", `Vraiment supprimer "${name}" ?`)) {
            try {
                await deleteDoc(doc(db, "colleagues", id));
                getColleagues(true).catch(() => {});
                loadColleagues();
            } catch (error) {
                showInfoModal("Erreur", "La suppression a échoué.");
            }
        }
    };
    div.appendChild(deleteBtn);
    return div;
}

// --- Recalcul des kilomètres de toute l'équipe ---------------------------------

let kmRecalc = { days: [], range: null, period: 'week', running: false, cancelled: false };
// « Depuis le début » peut durer longtemps : la journée où reprendre est gardée sur cet appareil
// si le recalcul est arrêté (fenêtre fermée, téléphone en veille, connexion perdue…).
const KM_RESUME_KEY = 'lpf.kmRecalcAll.resumeFrom';
const KM_HISTORY_START = new Date(2020, 0, 1);
const readResume = () => { try { return localStorage.getItem(KM_RESUME_KEY) || null; } catch { return null; } };
const writeResume = (dayKey) => { try { dayKey ? localStorage.setItem(KM_RESUME_KEY, dayKey) : localStorage.removeItem(KM_RESUME_KEY); } catch { /* stockage indisponible */ } };
const dayLabel = (dayKey) => new Date(`${dayKey}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

function kmPeriodRange(period) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monday = new Date(today); monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
    switch (period) {
        case 'lastWeek': { const start = new Date(monday); start.setDate(monday.getDate() - 7); const end = new Date(monday); end.setDate(monday.getDate() - 1); return { start, end: endOfDay(end) }; }
        case 'month': return { start: new Date(today.getFullYear(), today.getMonth(), 1), end: endOfDay(today) };
        case 'all': return { start: KM_HISTORY_START, end: endOfDay(today) };
        case 'lastMonth': return { start: new Date(today.getFullYear(), today.getMonth() - 1, 1), end: endOfDay(new Date(today.getFullYear(), today.getMonth(), 0)) };
        default: return { start: monday, end: endOfDay(today) };
    }
}

async function selectKmPeriod(period) {
    document.querySelectorAll('.km-period').forEach(b => b.classList.toggle('is-active', b.dataset.period === period));
    const summary = document.getElementById('kmRecalcSummary');
    const startBtn = document.getElementById('kmRecalcStartBtn');
    startBtn.disabled = true;
    summary.textContent = 'Recherche des journées pointées…';
    kmRecalc.period = period;
    const { start, end } = kmPeriodRange(period);
    kmRecalc.range = { start, end };
    try {
        kmRecalc.days = await findWorkedDays(start, end);
    } catch (error) {
        console.error("Recherche des journées à recalculer:", error);
        summary.textContent = 'Impossible de lire les pointages. Vérifiez la connexion.';
        return;
    }
    if (kmRecalc.period !== period) return; // une autre période a été choisie entre-temps
    if (period === 'all') {
        const resume = readResume();
        const all = kmRecalc.days;
        if (resume) {
            kmRecalc.days = all.filter(d => d.dayKey >= resume);
            kmRecalc.range = { start: new Date(`${resume}T00:00:00`), end };
        }
        const people = new Set(kmRecalc.days.map(d => d.uid)).size;
        const minutes = Math.max(1, Math.round(kmRecalc.days.length * 0.6 / 60));
        summary.textContent = !all.length
            ? 'Aucune journée pointée.'
            : resume && kmRecalc.days.length
                ? `Reprise là où le recalcul s'était arrêté (${dayLabel(resume)}) : il reste ${kmRecalc.days.length} journée${kmRecalc.days.length > 1 ? 's' : ''} sur ${all.length}, ${people} personne${people > 1 ? 's' : ''}. Environ ${minutes} min.`
                : `Depuis le premier pointage (${dayLabel(all[0].dayKey)}) : ${all.length} journée${all.length > 1 ? 's' : ''} pointée${all.length > 1 ? 's' : ''}, ${people} personne${people > 1 ? 's' : ''}. Environ ${minutes} min.`;
        if (resume && !kmRecalc.days.length) { writeResume(null); kmRecalc.days = all; kmRecalc.range = { start, end }; }
        startBtn.disabled = !kmRecalc.days.length;
        return;
    }
    const fmt = (d) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
    const people = new Set(kmRecalc.days.map(d => d.uid)).size;
    summary.textContent = kmRecalc.days.length
        ? `Du ${fmt(start)} au ${fmt(end)} : ${kmRecalc.days.length} journée${kmRecalc.days.length > 1 ? 's' : ''} pointée${kmRecalc.days.length > 1 ? 's' : ''}, ${people} personne${people > 1 ? 's' : ''}.`
        : `Du ${fmt(start)} au ${fmt(end)} : aucune journée pointée.`;
    startBtn.disabled = !kmRecalc.days.length;
}

function openKmRecalc() {
    if (kmRecalc.running) return;
    document.getElementById('kmRecalcModal').classList.remove('hidden');
    document.getElementById('kmRecalcProgress').classList.add('hidden');
    const startBtn = document.getElementById('kmRecalcStartBtn');
    startBtn.textContent = 'Recalculer';
    document.querySelectorAll('.km-period').forEach(b => { b.disabled = false; b.onclick = () => selectKmPeriod(b.dataset.period); });
    document.getElementById('kmRecalcCloseBtn').onclick = () => {
        kmRecalc.cancelled = true;
        document.getElementById('kmRecalcModal').classList.add('hidden');
    };
    startBtn.onclick = runKmRecalc;
    selectKmPeriod('week');
}

async function runKmRecalc() {
    const days = kmRecalc.days;
    if (!days.length || kmRecalc.running) return;
    if (!navigator.onLine) {
        showInfoModal("Hors ligne", "Pas de connexion : impossible de recalculer les kilomètres.");
        return;
    }
    const isAll = kmRecalc.period === 'all';
    if (isAll && !await showConfirmationModal("Recalculer tous les kilomètres",
        `Les trajets des ${days.length} journées vont être refaits avec les adresses actuelles des chantiers. ` +
        "Ça prend du temps : gardez l'appli ouverte et le téléphone branché. " +
        "Si c'est interrompu, rouvrez « Depuis le début » : le recalcul reprendra là où il s'était arrêté.")) return;
    document.getElementById('kmRecalcModal').classList.remove('hidden');
    const startBtn = document.getElementById('kmRecalcStartBtn');
    const bar = document.getElementById('kmRecalcBar');
    const status = document.getElementById('kmRecalcStatus');
    document.getElementById('kmRecalcProgress').classList.remove('hidden');
    document.querySelectorAll('.km-period').forEach(b => { b.disabled = true; });
    startBtn.disabled = true;
    startBtn.textContent = 'En cours…';
    kmRecalc.running = true;
    kmRecalc.cancelled = false;
    clearTripCaches();
    // Écran allumé pendant le recalcul (sinon le téléphone se met en veille et tout s'arrête)
    let wakeLock = null;
    try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* pas disponible */ }

    const update = ({ done, failed }) => {
        bar.style.width = `${Math.round((done + failed) / days.length * 100)}%`;
        status.textContent = `${done + failed} / ${days.length} journées${failed ? ` · ${failed} en échec` : ''}. Gardez cette fenêtre ouverte.`;
    };
    update({ done: 0, failed: 0 });
    let result = null;
    try {
        result = await rebuildTripsBulk(days, kmRecalc.range, {
            onProgress: update,
            onChunkDone: (nextDayKey) => { if (isAll) writeResume(nextDayKey); },
            isCancelled: () => kmRecalc.cancelled,
        });
    } catch (error) {
        console.error("Recalcul des kilomètres :", error);
    }
    kmRecalc.running = false;
    try { await wakeLock?.release(); } catch { /* déjà relâché */ }

    const n = (count, word) => `${count.toLocaleString('fr-FR')} ${word}${count > 1 ? 's' : ''}`;
    if (!result) {
        status.textContent = "Erreur : impossible de lire ou d'enregistrer les trajets. Vérifiez la connexion et relancez" + (isAll ? " (le recalcul reprendra là où il s'était arrêté)." : ".");
    } else {
        const { done, failed, written, deleted, unchanged } = result;
        const stopped = done + failed < days.length;
        if (!stopped) bar.style.width = '100%';
        status.textContent = stopped
            ? `Arrêté : ${n(done, 'journée')} recalculée${done > 1 ? 's' : ''} sur ${days.length}.${isAll ? ' Rouvrez « Depuis le début » pour continuer.' : ''}`
            : `Terminé : ${n(done, 'journée')} recalculée${done > 1 ? 's' : ''}${failed ? `, ${failed} en échec (adresse de chantier introuvable ? Utilisez « Vérifier les adresses » dans Chantiers)` : ''}.`;
        status.textContent += ` Trajets : ${n(written, 'modifié')}, ${n(unchanged, 'déjà juste')}${deleted ? `, ${n(deleted, 'supprimé')} (sans pointage)` : ''}.`;
        if (isAll && !stopped) writeResume(null);
    }
    startBtn.textContent = 'Recalculer';
    startBtn.disabled = false;
    document.querySelectorAll('.km-period').forEach(b => { b.disabled = false; });
}


// --- Nouveau mot de passe choisi par l'admin (Cloud Function adminSetPassword) --------
// Pour un employé qui a oublié son mot de passe ou n'a pas de vraie adresse e-mail.

// Mot de passe facile à dicter : sans lettres ambiguës (l, I, O, 0, 1)
function suggestPassword() {
    const letters = 'abcdefghjkmnpqrstuvwxyz';
    const pick = (chars) => chars[crypto.getRandomValues(new Uint32Array(1))[0] % chars.length];
    const word = Array.from({ length: 5 }, () => pick(letters)).join('');
    const digits = Array.from({ length: 4 }, () => pick('23456789')).join('');
    return `${word[0].toUpperCase()}${word.slice(1)}-${digits}`;
}

const PASSWORD_ERRORS = {
    'functions/permission-denied': null, // message du serveur
    'functions/invalid-argument': null,
    'functions/not-found': "Ce compte n'existe plus.",
    'functions/unauthenticated': 'Reconnectez-vous puis réessayez.',
    'functions/unavailable': 'Pas de connexion au serveur. Vérifiez le réseau et réessayez.',
    'functions/internal': "La fonction « adminSetPassword » n'est pas encore installée sur Firebase (voir le guide), ou elle a rencontré une erreur.",
};

function openPasswordModal(user) {
    const modal = document.getElementById('passwordModal');
    const input = document.getElementById('newPasswordInput');
    const error = document.getElementById('passwordError');
    const saveBtn = document.getElementById('savePasswordBtn');
    const closeBtn = document.getElementById('closePasswordBtn');
    document.getElementById('passwordModalText').textContent = `Choisissez le nouveau mot de passe de ${user.displayName || 'cet employé'}. Utile s'il l'a oublié ou s'il n'a pas de vraie adresse e-mail.`;
    document.getElementById('passwordFormFields').hidden = false;
    document.getElementById('passwordDone').hidden = true;
    error.hidden = true;
    input.value = suggestPassword();
    saveBtn.hidden = false;
    saveBtn.disabled = false;
    saveBtn.textContent = 'Enregistrer';
    closeBtn.textContent = 'Annuler';
    modal.classList.remove('hidden');
    input.focus();
    input.select();

    const close = () => modal.classList.add('hidden');
    closeBtn.onclick = close;
    document.getElementById('generatePasswordBtn').onclick = () => { input.value = suggestPassword(); error.hidden = true; input.focus(); };
    document.getElementById('copyPasswordBtn').onclick = async () => {
        const value = document.getElementById('passwordDoneValue').textContent;
        try { await navigator.clipboard.writeText(value); showToast('Mot de passe copié'); }
        catch (e) { window.getSelection()?.selectAllChildren(document.getElementById('passwordDoneValue')); }
    };

    document.getElementById('passwordForm').onsubmit = async (e) => {
        e.preventDefault();
        const password = input.value.trim();
        if (password.length < 6) {
            error.textContent = 'Le mot de passe doit faire au moins 6 caractères.';
            error.hidden = false;
            return;
        }
        if (!navigator.onLine) {
            error.textContent = 'Pas de connexion : impossible de changer le mot de passe.';
            error.hidden = false;
            return;
        }
        saveBtn.disabled = true;
        saveBtn.textContent = 'Enregistrement…';
        error.hidden = true;
        try {
            const [{ getApp }, { getFunctions, httpsCallable }] = await Promise.all([
                import("https://www.gstatic.com/firebasejs/10.5.0/firebase-app.js"),
                import("https://www.gstatic.com/firebasejs/10.5.0/firebase-functions.js"),
            ]);
            await httpsCallable(getFunctions(getApp(), 'us-central1'), 'adminSetPassword')({ uid: user.id, password });
            document.getElementById('passwordFormFields').hidden = true;
            document.getElementById('passwordDoneName').textContent = user.displayName || 'cet employé';
            document.getElementById('passwordDoneValue').textContent = password;
            document.getElementById('passwordDone').hidden = false;
            saveBtn.hidden = true;
            closeBtn.textContent = 'Fermer';
        } catch (err) {
            console.error("Changement de mot de passe:", err);
            const known = Object.prototype.hasOwnProperty.call(PASSWORD_ERRORS, err?.code) ? PASSWORD_ERRORS[err.code] : undefined;
            error.textContent = known || (known === null && err?.message) || "Le mot de passe n'a pas pu être changé. Réessayez.";
            error.hidden = false;
            saveBtn.disabled = false;
            saveBtn.textContent = 'Enregistrer';
        }
    };
}
