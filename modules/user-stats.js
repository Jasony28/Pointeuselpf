/*
 Fichier: modules/user-stats.js
 Description: Page de statistiques utilisateur et gestion du profil personnel.
*/
import { collection, query, where, getDocs, orderBy, doc, getDoc, updateDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, currentUser, pageContent, showInfoModal, showToast } from "../app.js";
import { getTeamMembers } from "./data-service.js";
import { THEMES, MAX_LIKES, MAX_AVOIDS, ratingRowHTML, escapeHTML } from "./work-profile.js";

// Garde en mémoire le mois actuellement affiché (0 = mois en cours, -1 = mois dernier, etc.)
let currentMonthOffset = 0;

/**
 * Point d'entrée principal pour le rendu de la page.
 */
export async function render() {
    pageContent.innerHTML = `
        <div class="max-w-4xl mx-auto space-y-8">
            
            <!-- SECTION PROFIL UTILISATEUR -->
            <div>
                <h1 class="text-2xl font-bold mb-4">Mes informations</h1>
                <div id="user-profile-container" class="p-6 rounded-xl shadow-sm transition-all duration-300" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                    <p class="text-center text-sm" style="color: var(--color-text-muted);">Chargement du profil...</p>
                </div>
            </div>

            <!-- SECTION PROFIL DE TRAVAIL (utilisé pour composer les équipes du planning) -->
            <div>
                <h1 class="text-2xl font-bold mb-1">Mon profil de travail</h1>
                <p class="text-sm mb-4" style="color: var(--color-text-muted);">Aide à composer les équipes du planning. Modifiable à tout moment, enregistré automatiquement.</p>
                <div id="work-profile-container" class="wp-card">
                    <p class="text-center text-sm" style="color: var(--color-text-muted);">Chargement…</p>
                </div>
            </div>

            <!-- SECTION STATISTIQUES -->
            <div>
                <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4">
                    <h1 class="text-2xl font-bold">Mes statistiques</h1>
                    
                    <div class="flex items-center gap-2">
                        <button id="stats-prev-month" class="nav-arrow" aria-label="Précédent"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg></button>
                        <span id="stats-month-display" class="font-semibold text-lg w-32 text-center" style="color: var(--color-primary);"></span>
                        <button id="stats-next-month" class="nav-arrow" aria-label="Suivant"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></button>
                    </div>
                </div>

                <div id="stats-loader" class="text-center p-8">
                    <svg class="animate-spin h-8 w-8 mx-auto" style="color: var(--color-primary);" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p class="mt-2" style="color: var(--color-text-muted);">Chargement des statistiques...</p>
                </div>

                <div id="stats-content" class="hidden space-y-6">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div class="p-4 rounded-lg shadow" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                            <div class="text-sm font-medium" style="color: var(--color-text-muted);">Total Heures (Mois)</div>
                            <div id="stats-total-hours" class="text-3xl font-bold mt-1"></div>
                        </div>
                        
                        <div id="stats-balance-card" class="p-4 rounded-lg shadow" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                            <div id="stats-balance-title" class="text-sm font-medium">Solde (Mois)</div>
                            <div id="stats-balance-hours" class="text-3xl font-bold mt-1"></div>
                        </div>
                    </div>

                    <div class="p-4 rounded-lg shadow" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                        <div class="flex justify-between items-center mb-3">
                            <h2 class="text-lg font-bold">Top 5 des chantiers du mois</h2>
                        </div>
                        <ul id="stats-top5-list" class="space-y-2">
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Attacher les écouteurs d'événements des statistiques
    document.getElementById('stats-prev-month').onclick = () => {
        currentMonthOffset--;
        loadMonthlyStats();
    };
    document.getElementById('stats-next-month').onclick = () => {
        currentMonthOffset++;
        loadMonthlyStats();
    };

    // Charger les données
    loadUserProfile();
    loadWorkProfile();
    loadMonthlyStats();
}

// =============================================
// PROFIL DE TRAVAIL : CONDUCTEUR, COMPÉTENCES, AFFINITÉS
// =============================================

async function loadWorkProfile() {
    const container = document.getElementById('work-profile-container');
    if (!container) return;
    try {
        const [userSnap, affSnap, members] = await Promise.all([
            getDoc(doc(db, "users", currentUser.uid)),
            getDoc(doc(db, "affinites", currentUser.uid)).catch(() => null),
            getTeamMembers(),
        ]);
        const user = userSnap.exists() ? userSnap.data() : {};
        const aff = affSnap?.exists() ? affSnap.data() : {};
        const state = {
            isDriver: user.isDriver === true,
            skills: { ...(user.skillsSelf || {}) },
            like: (aff.like || []).filter(id => id !== currentUser.uid),
            avoid: (aff.avoid || []).filter(id => id !== currentUser.uid),
            colleagues: members.filter(m => m.id !== currentUser.uid),
        };
        if (!container.isConnected) return;
        renderWorkProfile(container, state);
    } catch (error) {
        console.error("Erreur profil de travail:", error);
        container.innerHTML = `<p class="text-red-500">Erreur de chargement du profil de travail.</p>`;
    }
}

function renderWorkProfile(container, state) {
    const rated = THEMES.filter(t => state.skills[t.key]).length;
    container.innerHTML = `
        <button type="button" id="wp-driver" class="wp-driver${state.isDriver ? ' is-on' : ''}" aria-pressed="${state.isDriver}">
            <span class="wp-driver-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 17h14M6 17v2M18 17v2M3 13l2-6a2 2 0 0 1 2-1.4h10A2 2 0 0 1 19 7l2 6v4H3z"/><circle cx="7.5" cy="13.5" r="1"/><circle cx="16.5" cy="13.5" r="1"/></svg></span>
            <span class="wp-driver-text"><strong>Je suis conducteur·rice</strong><small>${state.isDriver ? 'Oui — je peux conduire la voiture de l\'équipe' : 'Non — touchez pour activer'}</small></span>
            <span class="wp-switch" aria-hidden="true"></span>
        </button>

        <div class="wp-section">
            <h3 class="wp-title">Mes compétences <span>${rated}/${THEMES.length}</span></h3>
            <p class="wp-hint">1 = pas du tout à l'aise · 5 = totalement à l'aise. Soyez honnête : c'est pour vous mettre là où vous êtes le mieux.</p>
            <div id="wp-skills">${THEMES.map(t => ratingRowHTML(t, state.skills[t.key])).join('')}</div>
        </div>

        <div class="wp-section">
            <h3 class="wp-title">Avec qui j'aime travailler</h3>
            <p class="wp-hint">Touchez un nom : <b>💚 j'aime</b> (${MAX_LIKES} max) → <b>🚫 éviter</b> (${MAX_AVOIDS} max) → neutre.
                🔒 Visible uniquement par l'administrateur, jamais par vos collègues.</p>
            <div id="wp-colleagues" class="wp-chips">
                ${state.colleagues.length ? state.colleagues.map(c => {
                    const mode = state.like.includes(c.id) ? 'like' : state.avoid.includes(c.id) ? 'avoid' : '';
                    return `<button type="button" class="wp-chip${mode ? ` is-${mode}` : ''}" data-colleague="${c.id}">${mode === 'like' ? '💚 ' : mode === 'avoid' ? '🚫 ' : ''}${escapeHTML(c.name)}</button>`;
                }).join('') : '<p class="wp-hint">Aucun collègue pour le moment.</p>'}
            </div>
        </div>
    `;

    container.querySelector('#wp-driver').onclick = async () => {
        state.isDriver = !state.isDriver;
        renderWorkProfile(container, state);
        try {
            await updateDoc(doc(db, "users", currentUser.uid), { isDriver: state.isDriver });
            showToast(state.isDriver ? 'Noté : vous êtes conducteur·rice.' : 'Noté : vous n\'êtes pas conducteur·rice.', 'success');
        } catch (e) {
            console.error(e);
            state.isDriver = !state.isDriver;
            renderWorkProfile(container, state);
            showInfoModal("Erreur", "L'enregistrement a échoué.");
        }
    };

    container.querySelectorAll('#wp-skills .wp-rate').forEach(btn => btn.onclick = async () => {
        const { theme, value } = btn.dataset;
        const previous = state.skills[theme];
        state.skills[theme] = Number(value);
        renderWorkProfile(container, state);
        try {
            await updateDoc(doc(db, "users", currentUser.uid), { [`skillsSelf.${theme}`]: Number(value) });
        } catch (e) {
            console.error(e);
            if (previous) state.skills[theme] = previous; else delete state.skills[theme];
            renderWorkProfile(container, state);
            showInfoModal("Erreur", "L'enregistrement a échoué.");
        }
    });

    container.querySelectorAll('[data-colleague]').forEach(btn => btn.onclick = async () => {
        const id = btn.dataset.colleague;
        const before = { like: [...state.like], avoid: [...state.avoid] };
        if (state.like.includes(id)) {
            state.like = state.like.filter(x => x !== id);
            if (state.avoid.length >= MAX_AVOIDS) {
                showToast(`Une seule personne « à éviter » : retirez d'abord l'autre.`, 'warning');
            } else state.avoid.push(id);
        } else if (state.avoid.includes(id)) {
            state.avoid = state.avoid.filter(x => x !== id);
        } else if (state.like.length >= MAX_LIKES) {
            showToast(`${MAX_LIKES} personnes maximum : retirez-en une d'abord.`, 'warning');
            return;
        } else state.like.push(id);
        renderWorkProfile(container, state);
        try {
            await setDoc(doc(db, "affinites", currentUser.uid), { like: state.like, avoid: state.avoid, updatedAt: serverTimestamp() });
        } catch (e) {
            console.error(e);
            Object.assign(state, before);
            renderWorkProfile(container, state);
            showInfoModal("Erreur", "L'enregistrement a échoué. Si le problème continue, prévenez l'administrateur (règles Firebase « affinites »).");
        }
    });
}

// =============================================
// GESTION DU PROFIL UTILISATEUR (CARTE)
// =============================================

async function loadUserProfile() {
    try {
        const userDoc = await getDoc(doc(db, "users", currentUser.uid));
        if (userDoc.exists()) {
            const userData = { id: userDoc.id, ...userDoc.data() };
            const container = document.getElementById('user-profile-container');
            if (container) renderProfileView(container, userData);
        }
    } catch (error) {
        console.error("Erreur lors du chargement du profil:", error);
        const container = document.getElementById('user-profile-container');
        if (container) container.innerHTML = `<p class="text-red-500">Erreur de chargement du profil.</p>`;
    }
}

function renderProfileView(container, user) {
    const address = user.address || '';
    const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    const gsm = user.gsm || '';

    // Affichage de l'historique des contrats (Lecture seule pour l'employé)
    let contractHtml = '<div class="mt-4 p-3 rounded-lg" style="background-color: var(--color-background); border: 1px solid var(--color-border);">';
    contractHtml += '<strong class="text-sm">Mon contrat actuel</strong><ul class="ml-4 mt-1 space-y-1 list-disc text-sm">';
    if (user.contractHistory && user.contractHistory.length > 0) {
        const sorted = [...user.contractHistory].sort((a,b) => b.startDate.localeCompare(a.startDate));
        sorted.forEach(c => {
            const dateStr = new Date(c.startDate).toLocaleDateString('fr-FR');
            contractHtml += `<li style="color: var(--color-text-muted);">Depuis le ${dateStr} : <strong style="color: var(--color-primary);">${c.hours}h/sem</strong></li>`;
        });
    } else {
        contractHtml += `<li style="color: var(--color-text-muted);">Fixe : <strong style="color: var(--color-primary);">${user.contractHours || 0}h/sem</strong></li>`;
    }
    contractHtml += '</ul><p class="text-xs mt-2 italic" style="color: var(--color-text-muted);">* Seul l\'administrateur peut modifier les heures de contrat.</p></div>';

    container.innerHTML = `
        <div class="flex justify-between items-start mb-4">
            <h3 class="text-2xl font-bold">${user.displayName}</h3>
        </div>
        <dl class="info-rows">
            <div class="info-row"><dt>GSM</dt><dd>${gsm || '<span class="info-row-empty">Non défini</span>'}</dd></div>
            <div class="info-row"><dt>Adresse</dt><dd>${address ? `<a href="${googleMapsUrl}" target="_blank" class="link">${address}</a>` : '<span class="info-row-empty">Non définie</span>'}</dd></div>
            <div class="info-row"><dt>Registre national</dt><dd>${user.nationalRegistryNumber || '<span class="info-row-empty">Non défini</span>'}</dd></div>
            <div class="info-row"><dt>IBAN</dt><dd>${user.iban || '<span class="info-row-empty">Non défini</span>'}</dd></div>
        </dl>
        ${contractHtml}
        <div class="mt-6">
            <button id="edit-profile-btn" class="btn btn-secondary btn-block">Mettre à jour mes informations</button>
        </div>
    `;

    container.querySelector('#edit-profile-btn').addEventListener('click', () => {
        renderProfileEdit(container, user);
    });
}

function renderProfileEdit(container, user) {
    container.innerHTML = `
        <h3 class="text-xl font-bold mb-4">Modifier mes informations</h3>
        <form id="profile-edit-form" class="space-y-4">
            <div>
                <label class="block text-xs font-bold mb-1 uppercase" style="color: var(--color-text-muted);">Nom affiché</label>
                <input id="edit-displayName" type="text" value="${user.displayName || ''}" class="w-full border p-2 rounded-lg" style="background-color: var(--color-background); border-color: var(--color-border);" required>
            </div>
            <div>
                <label class="block text-xs font-bold mb-1 uppercase" style="color: var(--color-text-muted);">N° de GSM</label>
                <input id="edit-gsm" type="tel" value="${user.gsm || ''}" class="w-full border p-2 rounded-lg" style="background-color: var(--color-background); border-color: var(--color-border);">
            </div>
            <div>
                <label class="block text-xs font-bold mb-1 uppercase" style="color: var(--color-text-muted);">Adresse Complète</label>
                <input id="edit-address" type="text" value="${user.address || ''}" class="w-full border p-2 rounded-lg" style="background-color: var(--color-background); border-color: var(--color-border);">
            </div>
            <div>
                <label class="block text-xs font-bold mb-1 uppercase" style="color: var(--color-text-muted);">N° Registre National</label>
                <input id="edit-niss" type="text" value="${user.nationalRegistryNumber || ''}" class="w-full border p-2 rounded-lg" style="background-color: var(--color-background); border-color: var(--color-border);">
            </div>
             <div>
                <label class="block text-xs font-bold mb-1 uppercase" style="color: var(--color-text-muted);">N° de compte (IBAN)</label>
                <input id="edit-iban" type="text" value="${user.iban || ''}" class="w-full border p-2 rounded-lg" placeholder="BE00 0000 0000 0000" style="background-color: var(--color-background); border-color: var(--color-border);">
            </div> 
            
            <div class="mt-6 flex gap-3 pt-4 border-t" style="border-color: var(--color-border);">
                <button type="button" id="cancel-edit-btn" class="w-1/2 font-bold py-2 px-4 rounded-lg" style="background-color: var(--color-background); border: 1px solid var(--color-border);">Annuler</button>
                <button type="submit" id="save-edit-btn" class="w-1/2 font-bold text-white py-2 px-4 rounded-lg" style="background-color: var(--color-primary);">Enregistrer</button>
            </div>
        </form>
    `;

    container.querySelector('#cancel-edit-btn').addEventListener('click', () => {
        renderProfileView(container, user);
    });

    container.querySelector('#profile-edit-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('save-edit-btn');
        btn.disabled = true;
        btn.textContent = 'Sauvegarde...';

        const updatedData = {
            displayName: document.getElementById('edit-displayName').value.trim(),
            gsm: document.getElementById('edit-gsm').value.trim(),
            address: document.getElementById('edit-address').value.trim(),
            nationalRegistryNumber: document.getElementById('edit-niss').value.trim(),
            iban: document.getElementById('edit-iban').value.trim()
        };

        try {
            await updateDoc(doc(db, "users", user.id), updatedData);
            const updatedUser = { ...user, ...updatedData };
            
            // Met à jour l'objet global si le nom a changé
            if (currentUser.displayName !== updatedData.displayName) {
                currentUser.displayName = updatedData.displayName;
            }

            renderProfileView(container, updatedUser);
            showInfoModal("Succès", "Vos informations ont été mises à jour.");
        } catch (error) {
            console.error("Erreur de mise à jour:", error);
            showInfoModal("Erreur", "La sauvegarde a échoué.");
            btn.disabled = false;
            btn.textContent = 'Enregistrer';
        }
    });
}


// =============================================
// GESTION DES STATISTIQUES
// =============================================

async function loadMonthlyStats() {
    toggleLoading(true);

    const { startDate, endDate, display } = getDateRangeForMonth(currentMonthOffset);
    
    document.getElementById('stats-month-display').textContent = display;
    document.getElementById('stats-next-month').disabled = currentMonthOffset >= 0;

    try {
        // 1. Récupérer le contrat de l'utilisateur
        const userDoc = await getDoc(doc(db, "users", currentUser.uid));
        const userData = userDoc.data();
        
        let weeklyContractHours = userData?.contractHours || 0;
        
        // Si l'utilisateur a un historique de contrat, on cherche celui actif pour ce mois
        if (userData?.contractHistory && userData.contractHistory.length > 0) {
            const monthStartStr = startDate.toISOString().split('T')[0];
            const pastContracts = userData.contractHistory.filter(c => c.startDate <= monthStartStr);
            if (pastContracts.length > 0) {
                pastContracts.sort((a,b) => new Date(a.startDate) - new Date(b.startDate));
                weeklyContractHours = pastContracts[pastContracts.length - 1].hours;
            } else {
                const allSorted = [...userData.contractHistory].sort((a,b) => new Date(a.startDate) - new Date(b.startDate));
                weeklyContractHours = allSorted[0].hours;
            }
        }

        // 2. Calculer l'objectif mensuel moyen (base 52 semaines / 12 mois)
        const monthlyTargetHours = (weeklyContractHours * 52) / 12;

        // 3. Récupérer les pointages du mois
        const q = query(
            collection(db, "pointages"),
            where("uid", "==", currentUser.uid),
            where("endTime", "!=", null),
            where("timestamp", ">=", startDate.toISOString()),
            where("timestamp", "<=", endDate.toISOString())
        );
        const querySnapshot = await getDocs(q);
        
        let totalMs = 0;
        const chantierMap = new Map();

        querySnapshot.forEach(doc => {
            const p = doc.data();
            if (!p.endTime) return; // pointage en cours : pas encore de durée (évitait un total "NaN")
            const durationMs = (new Date(p.endTime) - new Date(p.timestamp)) - (p.pauseDurationMs || 0);
            
            if (durationMs > 0) {
                totalMs += durationMs;
                const currentMs = chantierMap.get(p.chantier) || 0;
                chantierMap.set(p.chantier, currentMs + durationMs);
            }
        });

        // 4. Calculer les totaux
        const totalMonthHours = totalMs / 3600000;
        const balanceHours = totalMonthHours - monthlyTargetHours;

        // 5. Préparer le Top 5
        const sortedChantiers = [...chantierMap.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        // 6. Afficher les résultats
        renderSummary(totalMonthHours, monthlyTargetHours, balanceHours);
        renderTop5(sortedChantiers);

    } catch (error) {
        console.error("Erreur lors du chargement des statistiques:", error);
        const content = document.getElementById('stats-content');
        if (content) content.innerHTML = `<p class="text-red-500 text-center">Impossible de charger les statistiques.</p>`;
    } finally {
        toggleLoading(false);
    }
}

function toggleLoading(isLoading) {
    const loader = document.getElementById('stats-loader');
    const content = document.getElementById('stats-content');
    if (loader) loader.style.display = isLoading ? 'block' : 'none';
    if (content) content.style.display = isLoading ? 'none' : 'block';
}

function renderSummary(totalHours, targetHours, balanceHours) {
    document.getElementById('stats-total-hours').textContent = formatDecimalHours(totalHours);
    
    const balanceCard = document.getElementById('stats-balance-card');
    const balanceTitle = document.getElementById('stats-balance-title');
    const balanceHoursEl = document.getElementById('stats-balance-hours');
    
    balanceCard.style.color = 'var(--color-text-base)'; 
    balanceCard.style.backgroundColor = 'var(--color-surface)';
    balanceTitle.style.color = 'var(--color-text-muted)';
    balanceHoursEl.style.color = 'var(--color-text-base)';

    if (targetHours === 0) {
        balanceTitle.textContent = 'Solde (Contrat N/D)';
        balanceHoursEl.textContent = '-';
    } else if (balanceHours >= 0) {
        balanceTitle.textContent = 'Heures Supp. (Mois)';
        balanceHoursEl.textContent = `+${formatDecimalHours(balanceHours)}`;
        balanceTitle.style.color = 'rgb(34 197 94)';
        balanceHoursEl.style.color = 'rgb(34 197 94)';
    } else {
        balanceTitle.textContent = 'Heures Manquantes (Mois)';
        balanceHoursEl.textContent = formatDecimalHours(Math.abs(balanceHours));
        balanceTitle.style.color = 'rgb(249 115 22)';
        balanceHoursEl.style.color = 'rgb(249 115 22)';
    }
}

function renderTop5(sortedChantiers) {
    const listEl = document.getElementById('stats-top5-list');
    listEl.innerHTML = ''; 
    
    if (sortedChantiers.length === 0) {
        listEl.innerHTML = `<li class="text-sm" style="color: var(--color-text-muted);">Aucun pointage pour ce mois.</li>`;
        return;
    }

    const maxMs = sortedChantiers[0][1];

    sortedChantiers.forEach(([name, ms]) => {
        const hours = ms / 3600000;
        const percentage = Math.max((ms / maxMs) * 100, 2);

        const li = document.createElement('li');
        li.className = 'space-y-1';
        li.innerHTML = `
            <div class="flex justify-between items-center text-sm mb-1">
                <span class="font-medium">${name}</span>
                <span style="color: var(--color-text-muted);">${formatDecimalHours(hours)}</span>
            </div>
            <div class="w-full h-2 rounded" style="background-color: var(--color-background);">
                <div class="h-2 rounded transition-all" style="width: ${percentage}%; background-color: var(--color-primary);"></div>
            </div>
        `;
        listEl.appendChild(li);
    });
}

function formatDecimalHours(decimalHours) {
    if (!decimalHours || decimalHours <= 0) return '0h 00m';
    
    const hours = Math.floor(decimalHours);
    const minutes = Math.round((decimalHours - hours) * 60);
    
    if (hours === 0 && minutes === 0) return '0h 00m';
    
    let parts = [];
    if (hours > 0) {
        parts.push(`${hours}h`);
    }
    if (minutes > 0) {
        parts.push(`${String(minutes).padStart(2, '0')}m`);
    } else if (hours > 0) {
        parts.push('00m');
    }
    
    return parts.join(' ');
}

function getDateRangeForMonth(offset = 0) {
    const date = new Date();
    date.setDate(1); 
    date.setMonth(date.getMonth() + offset);
    date.setHours(0, 0, 0, 0);

    const year = date.getFullYear();
    const month = date.getMonth();

    const startDate = new Date(year, month, 1, 0, 0, 0);
    const endDate = new Date(year, month + 1, 0, 23, 59, 59); 

    const display = date.toLocaleDateString('fr-FR', {
        month: 'long',
        year: 'numeric'
    });

    return { date, startDate, endDate, display: display.charAt(0).toUpperCase() + display.slice(1) };
}