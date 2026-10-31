import { doc, updateDoc, collection, getDocs, deleteField } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent, showInfoModal, showToast } from "../app.js";
import { getUsers } from "./data-service.js";
import { THEMES, effectiveSkill, ratingRowHTML } from "./work-profile.js";

export async function render() {
    pageContent.innerHTML = `
        <div class="max-w-7xl mx-auto space-y-5">
            <div class="team-head">
                <div>
                    <h2 class="text-2xl font-bold tracking-tight">Fiches de l'équipe</h2>
                    <p class="text-sm mt-1" style="color: var(--color-text-muted);">Coordonnées, contrat en cours et historique des contrats de chaque membre.</p>
                </div>
                <div class="team-tools">
                    <input id="team-search" type="search" class="input" placeholder="Rechercher un nom, un GSM…" aria-label="Rechercher dans l'équipe">
                </div>
            </div>
            <div id="team-summary" class="team-summary"></div>
            <div id="user-cards-container" class="team-grid">
                ${Array(3).fill('').map(() => `
                    <div class="emp-card animate-pulse">
                        <div class="flex items-center gap-3"><div class="emp-avatar" style="opacity:.4"></div><div class="h-5 w-2/5 rounded" style="background-color: var(--color-surface-3);"></div></div>
                        <div class="space-y-3 mt-5">
                            <div class="h-4 w-full rounded" style="background-color: var(--color-surface-3);"></div>
                            <div class="h-4 w-4/5 rounded" style="background-color: var(--color-surface-3);"></div>
                        </div>
                    </div>`).join('')}
            </div>
        </div>
    `;
    displayUserCards();
}

let allTeam = [];
let affinities = new Map(); // uid → { like: [], avoid: [] } (privé : admin uniquement)

async function displayUserCards() {
    const container = document.getElementById('user-cards-container');
    try {
        const [users, affSnap] = await Promise.all([
            getUsers(),
            getDocs(collection(db, "affinites")).catch((e) => { console.warn("Affinités illisibles (règles Firebase ?)", e); return null; }),
        ]);
        affinities = new Map((affSnap?.docs || []).map(d => [d.id, d.data()]));
        allTeam = users.filter(user => user.status !== 'banned');
        if (!container.isConnected) return;
        drawCards();
        const search = document.getElementById('team-search');
        if (search) search.addEventListener('input', drawCards);
    } catch (error) {
        console.error("Erreur lors de l'affichage des fiches utilisateurs:", error);
        container.innerHTML = `<p class="text-red-500 text-center">Impossible de charger les fiches des utilisateurs.</p>`;
    }
}

function drawCards() {
    const container = document.getElementById('user-cards-container');
    const summary = document.getElementById('team-summary');
    if (!container) return;
    const term = (document.getElementById('team-search')?.value || '').trim().toLowerCase();
    const list = allTeam.filter(u => !term || [u.displayName, u.gsm, u.address, u.email].some(v => (v || '').toLowerCase().includes(term)));

    const approved = allTeam.filter(u => u.status === 'approved');
    const totalHours = approved.reduce((sum, u) => sum + (currentContract(u)?.hours || 0), 0);
    const incomplete = approved.filter(u => missingFields(u).length > 0).length;
    if (summary) summary.innerHTML = `
        <div class="team-stat"><span>Membres</span><b>${approved.length}</b></div>
        <div class="team-stat"><span>Heures sous contrat</span><b>${totalHours} h/sem</b></div>
        <div class="team-stat ${incomplete ? 'is-warn' : ''}"><span>Fiches incomplètes</span><b>${incomplete}</b></div>`;

    container.innerHTML = '';
    if (list.length === 0) {
        container.innerHTML = `<p class="team-empty">${term ? 'Aucun membre ne correspond à cette recherche.' : 'Aucun utilisateur actif.'}</p>`;
        return;
    }
    list.forEach(user => {
        const card = document.createElement('article');
        card.className = 'emp-card';
        card.id = `user-card-${user.id}`;
        renderCardView(card, user);
        container.appendChild(card);
    });
}

// Contrat en vigueur aujourd'hui (le plus récent déjà commencé)
function currentContract(user) {
    const history = (user.contractHistory || []).filter(c => c.startDate).sort((a, b) => a.startDate.localeCompare(b.startDate));
    if (history.length === 0) return user.contractHours ? { hours: user.contractHours, startDate: null } : null;
    const today = new Date().toISOString().split('T')[0];
    return history.filter(c => c.startDate <= today).pop() || history[0];
}

function missingFields(user) {
    const missing = [];
    if (!user.gsm) missing.push('GSM');
    if (!user.address) missing.push('adresse');
    if (!user.nationalRegistryNumber) missing.push('registre national');
    if (!user.iban) missing.push('IBAN');
    return missing;
}

const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';
const esc = (v = '') => String(v).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const mask = (v = '', keep = 4) => v.length <= keep ? v : '•••• ' + v.replace(/\s/g, '').slice(-keep);
const fmtDate = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const ICON = {
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
    message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
    id: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M15 9h3M15 13h3M6 16c.5-1.2 1.6-2 3-2s2.5.8 3 2"/>',
    bank: '<path d="M3 21h18M5 21V10M19 21V10M9 21V10M15 21V10M2 10 12 3l10 7z"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
};
const icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n]}</svg>`;

// Affiche la carte en mode "consultation"
function renderCardView(cardElement, user) {
    const address = user.address || '';
    const gsm = user.gsm || '';
    const contract = currentContract(user);
    const missing = missingFields(user);
    const roleLabel = user.role === 'admin' ? 'Administrateur' : 'Employé';
    const statusChip = user.status === 'pending' ? '<span class="emp-chip is-warn">En attente</span>' : '';

    const sorted = [...(user.contractHistory || [])].filter(c => c.startDate).sort((a, b) => b.startDate.localeCompare(a.startDate));
    const contractRows = sorted.length
        ? sorted.map((c, i) => `<li class="${i === 0 ? 'is-current' : ''}"><span>${fmtDate(c.startDate)}</span><b>${c.hours} h/sem</b></li>`).join('')
        : `<li class="is-current"><span>Ancien système</span><b>${user.contractHours || 0} h/sem</b></li>`;

    const sensitiveRow = (key, label, value, ic) => `
        <div class="emp-row">
            <span class="emp-row-icon">${icon(ic)}</span>
            <div class="emp-row-body"><span class="emp-row-label">${label}</span>
                ${value ? `<span class="emp-row-value mono" data-secret="${key}">${esc(mask(value))}</span>` : '<span class="emp-row-value is-missing">Non défini</span>'}
            </div>
            ${value ? `<div class="emp-row-actions">
                <button type="button" class="emp-icon-btn" data-reveal="${key}" aria-label="Afficher ${label}">${icon('eye')}</button>
                <button type="button" class="emp-icon-btn" data-copy="${key}" aria-label="Copier ${label}">${icon('copy')}</button>
            </div>` : ''}
        </div>`;

    cardElement.innerHTML = `
        <header class="emp-top">
            <div class="emp-avatar" aria-hidden="true">${esc(initials(user.displayName))}</div>
            <div class="emp-id">
                <h3 class="emp-name">${esc(user.displayName || 'Sans nom')}</h3>
                <p class="emp-meta">${roleLabel}${user.email ? ` · ${esc(user.email)}` : ''}</p>
            </div>
            ${statusChip}
        </header>

        <div class="emp-contract">
            <div><span class="emp-row-label">Contrat en cours</span><b class="emp-contract-hours">${contract ? `${contract.hours} h/sem` : '—'}</b></div>
            <span class="emp-row-label">${contract && contract.startDate ? `depuis le ${fmtDate(contract.startDate)}` : ''}</span>
        </div>

        <div class="emp-actions">
            ${gsm ? `<a class="emp-action" href="tel:${esc(gsm)}">${icon('phone')}Appeler</a><a class="emp-action" href="sms:${esc(gsm)}">${icon('message')}SMS</a>` : ''}
            ${address ? `<a class="emp-action" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}" target="_blank" rel="noopener noreferrer">${icon('pin')}Adresse</a>` : ''}
        </div>

        <div class="emp-rows">
            <div class="emp-row">
                <span class="emp-row-icon">${icon('phone')}</span>
                <div class="emp-row-body"><span class="emp-row-label">GSM</span>${gsm ? `<span class="emp-row-value mono">${esc(gsm)}</span>` : '<span class="emp-row-value is-missing">Non défini</span>'}</div>
                ${gsm ? `<div class="emp-row-actions"><button type="button" class="emp-icon-btn" data-copy="gsm" aria-label="Copier le GSM">${icon('copy')}</button></div>` : ''}
            </div>
            <div class="emp-row">
                <span class="emp-row-icon">${icon('pin')}</span>
                <div class="emp-row-body"><span class="emp-row-label">Adresse</span>${address ? `<span class="emp-row-value">${esc(address)}</span>` : '<span class="emp-row-value is-missing">Non définie</span>'}</div>
            </div>
            ${sensitiveRow('nationalRegistryNumber', 'Registre national', user.nationalRegistryNumber, 'id')}
            ${sensitiveRow('iban', 'IBAN', user.iban, 'bank')}
        </div>

        ${workProfileHTML(user)}

        <details class="emp-history">
            <summary>Historique des contrats <span>${sorted.length || 1}</span></summary>
            <ol class="emp-timeline">${contractRows}</ol>
        </details>

        ${missing.length ? `<p class="emp-missing">À compléter : ${missing.join(', ')}</p>` : ''}

        <button type="button" class="btn btn-secondary btn-block edit-btn">Modifier la fiche</button>
    `;

    const values = { gsm, nationalRegistryNumber: user.nationalRegistryNumber || '', iban: user.iban || '' };
    cardElement.querySelectorAll('[data-reveal]').forEach(btn => btn.addEventListener('click', () => {
        const key = btn.dataset.reveal;
        const el = cardElement.querySelector(`[data-secret="${key}"]`);
        const shown = btn.getAttribute('aria-pressed') === 'true';
        el.textContent = shown ? mask(values[key]) : values[key];
        btn.setAttribute('aria-pressed', shown ? 'false' : 'true');
    }));
    cardElement.querySelectorAll('[data-copy]').forEach(btn => btn.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(values[btn.dataset.copy]);
            showToast('Copié dans le presse-papiers.', 'success');
        } catch (e) {
            showToast('Copie impossible sur cet appareil : affichez la valeur et sélectionnez-la.', 'warning');
        }
    }));
    cardElement.querySelector('.edit-btn').addEventListener('click', () => renderCardEdit(cardElement, user));
    cardElement.querySelector('.wp-edit-btn')?.addEventListener('click', () => renderWorkEdit(cardElement, user));
}

const nameOf = (uid) => allTeam.find(u => u.id === uid)?.displayName || 'Ancien membre';

// Résumé du profil de travail (conducteur, compétences, affinités) sur la fiche
function workProfileHTML(user) {
    const aff = affinities.get(user.id) || {};
    const skills = THEMES.map(t => ({ ...t, value: effectiveSkill(user, t.key), corrected: user.skillsAdmin?.[t.key] >= 1 }));
    const rated = skills.filter(s => s.value);
    const likedBy = [...affinities.entries()].filter(([uid, a]) => uid !== user.id && (a.like || []).includes(user.id)).map(([uid]) => nameOf(uid));
    return `
        <details class="emp-history wp-summary">
            <summary>Profil de travail ${user.isDriver ? '<span class="wp-badge">🚗 Conducteur</span>' : '<span class="wp-badge is-muted">Pas conducteur</span>'}</summary>
            <div class="wp-summary-body">
                ${rated.length ? `<ul class="wp-skill-bars">${skills.map(s => `
                    <li><span>${s.label}${s.corrected ? ' <small title="Note corrigée par l\'admin">✎</small>' : ''}</span>
                        <span class="wp-bar"><i style="width:${(s.value || 0) * 20}%"></i></span><b>${s.value || '–'}</b></li>`).join('')}</ul>`
                    : '<p class="wp-hint">Compétences pas encore renseignées par l\'employé.</p>'}
                <p class="wp-hint">💚 Aime travailler avec : ${(aff.like || []).length ? aff.like.map(nameOf).map(esc).join(', ') : '—'}</p>
                <p class="wp-hint">🚫 Préfère éviter : ${(aff.avoid || []).length ? aff.avoid.map(nameOf).map(esc).join(', ') : '—'}</p>
                <p class="wp-hint">Choisi·e par : ${likedBy.length ? likedBy.map(esc).join(', ') : '—'}</p>
                <button type="button" class="btn btn-secondary btn-block wp-edit-btn">Ajuster conducteur & compétences</button>
            </div>
        </details>`;
}

// L'admin peut corriger les notes (prioritaires sur l'auto-évaluation) et le statut conducteur
function renderWorkEdit(cardElement, user) {
    const admin = { ...(user.skillsAdmin || {}) };
    let isDriver = user.isDriver === true;
    const draw = () => {
        cardElement.innerHTML = `
            <header class="emp-top">
                <div class="emp-avatar" aria-hidden="true">${esc(initials(user.displayName))}</div>
                <div class="emp-id"><h3 class="emp-name">Profil de travail</h3><p class="emp-meta">${esc(user.displayName || '')}</p></div>
            </header>
            <button type="button" class="wp-driver${isDriver ? ' is-on' : ''}" data-driver aria-pressed="${isDriver}">
                <span class="wp-driver-text"><strong>Conducteur·rice</strong><small>${isDriver ? 'Oui' : 'Non'}</small></span>
                <span class="wp-switch" aria-hidden="true"></span>
            </button>
            <p class="wp-hint mt-3">Votre note remplace celle de l'employé (indiquée entre parenthèses). Touchez à nouveau la note choisie pour revenir à l'auto-évaluation.</p>
            <div>${THEMES.map(t => ratingRowHTML(t, admin[t.key], { hint: `(auto : ${user.skillsSelf?.[t.key] || '–'})` })).join('')}</div>
            <div class="mt-6 flex gap-3">
                <button class="cancel-btn btn btn-secondary btn-block">Annuler</button>
                <button class="save-btn btn btn-primary btn-block">Enregistrer</button>
            </div>`;
        cardElement.querySelector('[data-driver]').onclick = () => { isDriver = !isDriver; draw(); };
        cardElement.querySelectorAll('.wp-rate').forEach(btn => btn.onclick = () => {
            const v = Number(btn.dataset.value);
            if (admin[btn.dataset.theme] === v) delete admin[btn.dataset.theme]; else admin[btn.dataset.theme] = v;
            draw();
        });
        cardElement.querySelector('.cancel-btn').onclick = () => renderCardView(cardElement, user);
        cardElement.querySelector('.save-btn').onclick = async () => {
            try {
                const skillsAdmin = Object.keys(admin).length ? admin : deleteField();
                await updateDoc(doc(db, "users", user.id), { isDriver, skillsAdmin });
                user.isDriver = isDriver;
                user.skillsAdmin = Object.keys(admin).length ? { ...admin } : undefined;
                showToast('Profil de travail enregistré.', 'success');
                renderCardView(cardElement, user);
            } catch (e) {
                console.error(e);
                showInfoModal("Erreur", "L'enregistrement a échoué.");
            }
        };
    };
    draw();
}

// Affiche la carte en mode "édition"
function renderCardEdit(cardElement, user) {
    cardElement.innerHTML = `
        <header class="emp-top">
            <div class="emp-avatar" aria-hidden="true">${esc(initials(user.displayName))}</div>
            <div class="emp-id"><h3 class="emp-name">Modifier la fiche</h3><p class="emp-meta">${esc(user.displayName || '')}</p></div>
        </header>
        <div class="space-y-3">
            <div>
                <label class="block text-xs font-medium mb-1">Nom complet</label>
                <input id="displayName-${user.id}" type="text" value="${user.displayName || ''}" class="input-field">
            </div>
            <div>
                <label class="block text-xs font-medium mb-1">N° de GSM</label>
                <input id="gsm-${user.id}" type="tel" value="${user.gsm || ''}" class="input-field">
            </div>
            <div>
                <label class="block text-xs font-medium mb-1">Adresse</label>
                <input id="address-${user.id}" type="text" value="${user.address || ''}" class="input-field">
            </div>
            <div>
                <label class="block text-xs font-medium mb-1">N° Registre National</label>
                <input id="nationalRegistryNumber-${user.id}" type="text" value="${user.nationalRegistryNumber || ''}" class="input-field">
            </div>
             <div>
                <label class="block text-xs font-medium mb-1">N° de compte (IBAN)</label>
                <input id="iban-${user.id}" type="text" value="${user.iban || ''}" class="input-field" placeholder="BE00 0000 0000 0000">
            </div> 
            
            <div class="p-3 rounded-lg mt-4" style="background-color: var(--color-background); border: 1px solid var(--color-border);">
                <label class="block text-sm font-bold mb-2">Historique des contrats (H/sem)</label>
                <div id="contractHistoryContainer-${user.id}" class="space-y-2 mb-3"></div>
                <button type="button" id="addContractBtn-${user.id}" class="text-xs font-bold px-2 py-1 rounded" style="color: var(--color-primary); background-color: var(--color-surface); border: 1px solid var(--color-border);">+ Ajouter une période</button>
            </div>
        </div>
        <div class="mt-6 flex gap-3">
            <button class="cancel-btn btn btn-secondary btn-block">Annuler</button>
            <button class="save-btn btn btn-primary btn-block">Enregistrer</button>
        </div>
        <style>
            .input-field { width: 100%; border-radius: var(--radius-lg); padding: 0.55rem 0.7rem; background-color: var(--color-surface); color: var(--color-text-base); border: 1px solid var(--color-border); font: inherit; font-size: 0.875rem; }
            .input-field:focus { outline: none; border-color: var(--color-primary); box-shadow: 0 0 0 4px var(--color-primary-ring); }
        </style>
    `;

    // --- GESTION DYNAMIQUE DE L'HISTORIQUE ---
    let currentHistory = user.contractHistory ? [...user.contractHistory] : [];
    // Migration de l'ancien système vers le nouveau
    if (currentHistory.length === 0 && user.contractHours) {
        currentHistory.push({ startDate: '2024-01-01', hours: user.contractHours });
    }

    const historyContainer = document.getElementById(`contractHistoryContainer-${user.id}`);
    
    function drawHistory() {
        historyContainer.innerHTML = currentHistory.map((c, index) => `
            <div class="flex items-center gap-2">
                <span class="text-xs">Dès le :</span>
                <input type="date" class="input-field hist-date flex-1 !p-1 !text-xs" value="${c.startDate}" data-index="${index}">
                <input type="number" class="input-field hist-hours w-16 !p-1 !text-xs text-center" value="${c.hours}" data-index="${index}" placeholder="Heures">
                <button type="button" class="icon-btn is-danger delete-hist-btn" data-index="${index}" title="Supprimer ce contrat" aria-label="Supprimer ce contrat"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true" style="pointer-events: none;"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
            </div>
        `).join('');

        historyContainer.querySelectorAll('.hist-date').forEach(el => el.addEventListener('change', (e) => {
            currentHistory[e.target.dataset.index].startDate = e.target.value;
        }));
        historyContainer.querySelectorAll('.hist-hours').forEach(el => el.addEventListener('change', (e) => {
            currentHistory[e.target.dataset.index].hours = Number(e.target.value);
        }));
        historyContainer.querySelectorAll('.delete-hist-btn').forEach(el => el.addEventListener('click', (e) => {
            currentHistory.splice(e.target.dataset.index, 1);
            drawHistory();
        }));
    }
    
    drawHistory();

    document.getElementById(`addContractBtn-${user.id}`).addEventListener('click', () => {
        const today = new Date().toISOString().split('T')[0];
        currentHistory.push({ startDate: today, hours: 38 }); // 38h par défaut
        drawHistory();
    });
    // ----------------------------------------

    cardElement.querySelector('.cancel-btn').addEventListener('click', () => {
        renderCardView(cardElement, user);
    });

    cardElement.querySelector('.save-btn').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.textContent = 'Sauvegarde...';

        // Nettoyage et tri de l'historique
        currentHistory = currentHistory.filter(c => c.startDate && c.hours); // Évite les cases vides
        currentHistory.sort((a,b) => new Date(a.startDate) - new Date(b.startDate)); // Trie chronologiquement

        // Déduit le contrat ACTUEL pour la rétrocompatibilité du reste de l'app
        let currentHours = 0;
        const today = new Date().toISOString().split('T')[0];
        const activeContract = currentHistory.filter(c => c.startDate <= today).pop();
        if (activeContract) currentHours = activeContract.hours;
        else if (currentHistory.length > 0) currentHours = currentHistory[0].hours;

        const updatedData = {
            displayName: document.getElementById(`displayName-${user.id}`).value,
            gsm: document.getElementById(`gsm-${user.id}`).value,
            address: document.getElementById(`address-${user.id}`).value,
            nationalRegistryNumber: document.getElementById(`nationalRegistryNumber-${user.id}`).value,
            iban: document.getElementById(`iban-${user.id}`).value,
            contractHistory: currentHistory, // Le nouveau système
            contractHours: currentHours // Sécurité : on garde la variable classique à jour !
        };

        try {
            await updateDoc(doc(db, "users", user.id), updatedData);
            await getUsers(true); // Rafraîchir le cache

            const updatedUser = { ...user, ...updatedData };
            const idx = allTeam.findIndex(u => u.id === user.id);
            if (idx >= 0) allTeam[idx] = updatedUser;
            
            renderCardView(cardElement, updatedUser);

        } catch (error) {
            console.error("Erreur de mise à jour:", error);
            showInfoModal("Erreur", "La mise à jour a échoué.");
            btn.disabled = false;
            btn.textContent = 'Enregistrer';
        }
    });
}