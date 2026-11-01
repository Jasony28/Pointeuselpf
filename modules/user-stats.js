/*
 Fichier: modules/user-stats.js
 Description: Page de statistiques utilisateur et gestion du profil personnel.
*/
import { collection, query, where, getDocs, orderBy, doc, getDoc, updateDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, currentUser, pageContent, showInfoModal, showToast } from "../app.js";
import { getTeamMembers } from "./data-service.js";
import { THEMES, ratingRowHTML, escapeHTML, missingProfileParts } from "./work-profile.js";

// Période affichée : 'month' ou 'year', et décalage (0 = période en cours, -1 = précédente, etc.)
let periodMode = 'month';
let currentMonthOffset = 0;
let userDataCache = null;
let showAllChantiers = false;
let lastStats = null;
// Ignore les réponses d'un chargement dépassé (clics rapides sur les flèches)
let loadToken = 0;

const WEEKDAYS_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MONTHS_SHORT = ['Janv', 'Févr', 'Mars', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc'];

const svg = (paths) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const ICONS = {
    prev: svg('<path d="m15 18-6-6 6-6"/>'),
    next: svg('<path d="m9 18 6-6-6-6"/>'),
    calendar: svg('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
    clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    car: svg('<path d="M5 17h14M6 17l1.5-5h9L18 17M7 17v2M17 17v2"/><circle cx="8" cy="14.5" r=".5"/><circle cx="16" cy="14.5" r=".5"/>'),
    sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    up: svg('<path d="m6 15 6-6 6 6"/>'),
    down: svg('<path d="m6 9 6 6 6-6"/>'),
    phone: svg('<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>'),
    home: svg('<path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>'),
    id: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="12" r="2"/><path d="M15 10h3M15 14h3"/>'),
    bank: svg('<path d="M3 21h18M5 21V10M19 21V10M9 21V10M15 21V10M12 3 3 8h18z"/>'),
    eye: svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
    eyeOff: svg('<path d="M10.7 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-2.2 3.2M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6M2 2l20 20M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
    edit: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
    users: svg('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>'),
};

/**
 * Point d'entrée principal pour le rendu de la page.
 */
export async function render() {
    showAllChantiers = false;
    userDataCache = null;

    pageContent.innerHTML = `
        <div class="st-page">
            <header class="st-header">
                <div>
                    <h1 class="st-title">Mes statistiques</h1>
                    <p class="st-subtitle">Vos heures, vos chantiers et votre rythme de travail.</p>
                </div>
                <div class="st-controls">
                    <div class="segmented" role="group" aria-label="Période">
                        <button type="button" data-mode="month" class="${periodMode === 'month' ? 'is-active' : ''}">Mois</button>
                        <button type="button" data-mode="year" class="${periodMode === 'year' ? 'is-active' : ''}">Année</button>
                    </div>
                    <div class="st-period-nav">
                        <button id="stats-prev-month" class="nav-arrow" aria-label="Période précédente">${ICONS.prev}</button>
                        <span id="stats-month-display" class="st-period-label"></span>
                        <button id="stats-next-month" class="nav-arrow" aria-label="Période suivante">${ICONS.next}</button>
                    </div>
                </div>
            </header>

            <div id="stats-content" class="st-content is-loading">${renderSkeleton()}</div>

            <section class="st-section">
                <h2 class="st-section-title">Mes informations</h2>
                <div id="user-profile-container" class="st-card st-profile">
                    <div class="st-skel" style="height: 180px;"></div>
                </div>
            </section>

            <!-- Profil de travail (utilisé pour composer les équipes du planning) -->
            <section class="st-section">
                <div>
                    <h2 class="st-section-title">Mon profil de travail</h2>
                    <p class="st-subtitle">Aide à composer les équipes du planning. Modifiable à tout moment, enregistré automatiquement.</p>
                </div>
                <div id="work-profile-container" class="wp-card">
                    <p class="text-center text-sm" style="color: var(--color-text-muted);">Chargement…</p>
                </div>
            </section>
        </div>
    `;

    // Attacher les écouteurs d'événements des statistiques
    document.getElementById('stats-prev-month').onclick = () => {
        currentMonthOffset--;
        loadStats();
    };
    document.getElementById('stats-next-month').onclick = () => {
        currentMonthOffset++;
        loadStats();
    };
    pageContent.querySelectorAll('.st-controls .segmented button').forEach(btn => {
        btn.onclick = () => {
            if (btn.dataset.mode === periodMode) return;
            periodMode = btn.dataset.mode;
            currentMonthOffset = 0;
            pageContent.querySelectorAll('.st-controls .segmented button').forEach(b => b.classList.toggle('is-active', b === btn));
            loadStats();
        };
    });

    // Charger les données
    loadUserProfile();
    loadWorkProfile();
    loadStats();
}

async function getUserData() {
    if (!userDataCache) {
        const userDoc = await getDoc(doc(db, "users", currentUser.uid));
        userDataCache = userDoc.exists() ? { id: userDoc.id, ...userDoc.data() } : null;
    }
    return userDataCache;
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
            driverAnswered: typeof user.isDriver === 'boolean',
            like: (aff.like || []).filter(id => id !== currentUser.uid),
            colleagues: members.filter(m => m.id !== currentUser.uid && !m.superAdmin),
            superAdmin: user.superAdmin === true,
        };
        if (!container.isConnected) return;
        renderWorkProfile(container, state);
    } catch (error) {
        console.error("Erreur profil de travail:", error);
        container.innerHTML = `<p class="text-red-500">Erreur de chargement du profil de travail.</p>`;
    }
}

function renderWorkProfile(container, state) {
    if (state.superAdmin) {
        container.innerHTML = '<div class="wp-progress is-done"><b>⭐ Super admin</b> — vous n\'êtes jamais placé·e sur les chantiers : pas de profil de travail à remplir.</div>';
        return;
    }
    const rated = THEMES.filter(t => state.skills[t.key]).length;
    const missing = missingProfileParts({ isDriver: state.driverAnswered ? state.isDriver : undefined, skillsSelf: state.skills });
    container.innerHTML = `
        <div class="wp-progress ${missing.length ? '' : 'is-done'}">
            ${missing.length ? `<b>Profil à compléter</b> — il manque : ${missing.join(', ')}.` : '<b>✓ Profil complet</b> — merci ! Il aide à composer des équipes où vous êtes à l\'aise.'}
        </div>
        <button type="button" id="wp-driver" class="wp-driver${state.isDriver ? ' is-on' : ''}" aria-pressed="${state.isDriver}">
            <span class="wp-driver-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 17h14M6 17v2M18 17v2M3 13l2-6a2 2 0 0 1 2-1.4h10A2 2 0 0 1 19 7l2 6v4H3z"/><circle cx="7.5" cy="13.5" r="1"/><circle cx="16.5" cy="13.5" r="1"/></svg></span>
            <span class="wp-driver-text"><strong>Je suis conducteur·rice</strong><small>${state.isDriver ? 'Oui — je peux conduire la voiture de l\'équipe' : (state.driverAnswered ? 'Non — touchez pour activer' : 'Pas encore répondu — touchez si vous conduisez')}</small></span>
            <span class="wp-switch" aria-hidden="true"></span>
        </button>
        ${state.driverAnswered ? '' : '<button type="button" id="wp-no-driver" class="btn btn-secondary btn-block">Je ne conduis pas</button>'}

        <div class="wp-section">
            <h3 class="wp-title">Mes compétences <span>${rated}/${THEMES.length}</span></h3>
            <p class="wp-hint">1 = pas du tout à l'aise · 5 = totalement à l'aise. Soyez honnête : c'est pour vous mettre là où vous êtes le mieux.</p>
            <div id="wp-skills">${THEMES.map(t => ratingRowHTML(t, state.skills[t.key])).join('')}</div>
        </div>

        <div class="wp-section">
            <h3 class="wp-title">Avec qui j'aime travailler</h3>
            <p class="wp-hint">Cochez tous les collègues avec qui vous aimez travailler (autant que vous voulez). Les autres, ne les cochez pas, simplement. 🔒 Visible uniquement par l'administrateur, jamais par vos collègues.</p>
            <div id="wp-colleagues" class="wp-chips">
                ${state.colleagues.length ? state.colleagues.map(c => {
                    const on = state.like.includes(c.id);
                    return `<button type="button" class="wp-chip${on ? ' is-like' : ''}" data-colleague="${c.id}" aria-pressed="${on}">${on ? '💚 ' : ''}${escapeHTML(c.name)}</button>`;
                }).join('') : '<p class="wp-hint">Aucun collègue pour le moment.</p>'}
            </div>
        </div>
    `;

    container.querySelector('#wp-no-driver')?.addEventListener('click', async () => {
        state.isDriver = false; state.driverAnswered = true;
        renderWorkProfile(container, state);
        try { await updateDoc(doc(db, "users", currentUser.uid), { isDriver: false }); showToast('Noté : vous ne conduisez pas.', 'success'); }
        catch (e) { console.error(e); state.driverAnswered = false; renderWorkProfile(container, state); showInfoModal("Erreur", "L'enregistrement a échoué."); }
    });

    container.querySelector('#wp-driver').onclick = async () => {
        state.isDriver = !state.isDriver;
        state.driverAnswered = true;
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
        const before = { like: [...state.like] };
        state.like = state.like.includes(id) ? state.like.filter(x => x !== id) : [...state.like, id];
        renderWorkProfile(container, state);
        try {
            await setDoc(doc(db, "affinites", currentUser.uid), { like: state.like, updatedAt: serverTimestamp() });
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
        const userData = await getUserData();
        const container = document.getElementById('user-profile-container');
        if (userData && container) renderProfileView(container, userData);
    } catch (error) {
        console.error("Erreur lors du chargement du profil:", error);
        const container = document.getElementById('user-profile-container');
        if (container) container.innerHTML = `<p class="st-error">Erreur de chargement du profil.</p>`;
    }
}

function renderProfileView(container, user) {
    const address = user.address || '';
    const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    const gsm = user.gsm || '';
    const notSet = (label) => `<span class="st-info-empty">${label}</span>`;

    // Historique des contrats (lecture seule pour l'employé)
    const contracts = (user.contractHistory && user.contractHistory.length > 0)
        ? [...user.contractHistory].sort((a, b) => b.startDate.localeCompare(a.startDate))
        : [{ hours: user.contractHours || 0, startDate: null }];
    const currentContract = contracts[0];

    const contractItems = contracts.map((c, i) => `
        <li class="st-contract${i === 0 ? ' is-current' : ''}">
            <span class="st-contract-dot" aria-hidden="true"></span>
            <span class="st-contract-hours">${c.hours}h / sem.</span>
            <span class="st-contract-date">${c.startDate ? `depuis le ${new Date(c.startDate).toLocaleDateString('fr-FR')}` : 'Fixe'}</span>
            ${i === 0 ? '<span class="st-badge">Actuel</span>' : ''}
        </li>`).join('');

    container.innerHTML = `
        <div class="st-profile-head">
            <span class="st-avatar" aria-hidden="true">${esc(initials(user.displayName))}</span>
            <div class="st-profile-id">
                <h3 class="st-profile-name">${esc(user.displayName || '')}</h3>
                <p class="st-profile-meta">${esc(user.email || currentUser.email || '')}</p>
            </div>
            <span class="st-contract-pill">${ICONS.clock}${currentContract.hours}h / semaine</span>
        </div>

        <dl class="st-info-grid">
            <div class="st-info">
                <dt>${ICONS.phone}GSM</dt>
                <dd>${gsm ? `<a href="tel:${esc(gsm.replace(/\s/g, ''))}" class="st-link">${esc(gsm)}</a>` : notSet('Non défini')}</dd>
            </div>
            <div class="st-info">
                <dt>${ICONS.home}Adresse</dt>
                <dd>${address ? `<a href="${googleMapsUrl}" target="_blank" rel="noopener" class="st-link">${esc(address)}</a>` : notSet('Non définie')}</dd>
            </div>
            <div class="st-info">
                <dt>${ICONS.id}Registre national</dt>
                <dd>${user.nationalRegistryNumber ? sensitiveValue(user.nationalRegistryNumber) : notSet('Non défini')}</dd>
            </div>
            <div class="st-info">
                <dt>${ICONS.bank}IBAN</dt>
                <dd>${user.iban ? sensitiveValue(user.iban) : notSet('Non défini')}</dd>
            </div>
        </dl>

        <div class="st-contracts">
            <h4 class="st-subhead">Mon contrat</h4>
            <ul class="st-contract-list">${contractItems}</ul>
            <p class="field-hint">Seul l'administrateur peut modifier les heures de contrat.</p>
        </div>

        <div class="st-profile-actions">
            <button id="edit-profile-btn" type="button" class="btn btn-secondary btn-block">${ICONS.edit}Mettre à jour mes informations</button>
        </div>
    `;

    // Afficher / masquer les données sensibles
    container.querySelectorAll('.st-reveal').forEach(btn => {
        btn.addEventListener('click', () => {
            const wrap = btn.closest('.st-sensitive');
            const shown = wrap.classList.toggle('is-shown');
            wrap.querySelector('.st-sensitive-value').textContent = shown ? wrap.dataset.value : maskValue(wrap.dataset.value);
            btn.innerHTML = shown ? ICONS.eyeOff : ICONS.eye;
            btn.setAttribute('aria-label', shown ? 'Masquer' : 'Afficher');
        });
    });

    container.querySelector('#edit-profile-btn').addEventListener('click', () => {
        renderProfileEdit(container, user);
    });
}

function renderProfileEdit(container, user) {
    container.innerHTML = `
        <h3 class="st-profile-name" style="margin-bottom: 1rem;">Modifier mes informations</h3>
        <form id="profile-edit-form" class="st-form">
            <div class="field st-form-full">
                <label class="field-label" for="edit-displayName">Nom affiché</label>
                <input id="edit-displayName" type="text" value="${esc(user.displayName || '')}" class="input" required>
            </div>
            <div class="field">
                <label class="field-label" for="edit-gsm">N° de GSM</label>
                <input id="edit-gsm" type="tel" value="${esc(user.gsm || '')}" class="input" placeholder="0470 00 00 00">
            </div>
            <div class="field">
                <label class="field-label" for="edit-niss">N° Registre National</label>
                <input id="edit-niss" type="text" value="${esc(user.nationalRegistryNumber || '')}" class="input" placeholder="00.00.00-000.00">
            </div>
            <div class="field st-form-full">
                <label class="field-label" for="edit-address">Adresse complète</label>
                <input id="edit-address" type="text" value="${esc(user.address || '')}" class="input" placeholder="Rue, numéro, code postal, commune">
            </div>
            <div class="field st-form-full">
                <label class="field-label" for="edit-iban">N° de compte (IBAN)</label>
                <input id="edit-iban" type="text" value="${esc(user.iban || '')}" class="input" placeholder="BE00 0000 0000 0000">
            </div>

            <div class="st-form-actions st-form-full">
                <button type="button" id="cancel-edit-btn" class="btn btn-secondary">Annuler</button>
                <button type="submit" id="save-edit-btn" class="btn btn-primary">Enregistrer</button>
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
            userDataCache = updatedUser;

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

function sensitiveValue(value) {
    return `<span class="st-sensitive" data-value="${esc(value)}">
        <span class="st-sensitive-value">${esc(maskValue(value))}</span>
        <button type="button" class="st-reveal icon-btn" aria-label="Afficher">${ICONS.eye}</button>
    </span>`;
}

// Garde les 4 derniers caractères visibles, conserve espaces et séparateurs
function maskValue(value) {
    const visible = 4;
    let seen = 0;
    return [...String(value)].reverse().map(ch => {
        if (!/[a-z0-9]/i.test(ch)) return ch;
        seen++;
        return seen <= visible ? ch : '•';
    }).reverse().join('');
}

// =============================================
// GESTION DES STATISTIQUES
// =============================================

async function loadStats() {
    const token = ++loadToken;
    const range = getPeriodRange(periodMode, currentMonthOffset);
    const content = document.getElementById('stats-content');

    document.getElementById('stats-month-display').textContent = range.label;
    document.getElementById('stats-next-month').disabled = currentMonthOffset >= 0;
    content.classList.add('is-loading');

    try {
        const userData = await getUserData();
        // Les pointages de la période précédente servent à la comparaison
        const [pointages, trajets, leaves] = await Promise.all([
            fetchPointages(range.prevStart, range.end),
            fetchTrajets(range.start, range.end).catch(err => { console.warn("Trajets indisponibles:", err); return null; }),
            fetchLeaves().catch(err => { console.warn("Congés indisponibles:", err); return null; }),
        ]);
        if (token !== loadToken) return;

        const startIso = range.start.toISOString();
        const current = pointages.filter(p => p.timestamp >= startIso);
        const previous = pointages.filter(p => p.timestamp < startIso);

        const stats = computeStats(current);
        stats.previousMs = computeStats(previous).totalMs;
        stats.target = computeTargets(userData, range);
        stats.trajets = trajets;
        stats.leaves = leaves ? computeLeaves(leaves, range) : null;
        stats.range = range;
        lastStats = stats;

        renderStats(stats);
    } catch (error) {
        if (token !== loadToken) return;
        console.error("Erreur lors du chargement des statistiques:", error);
        content.innerHTML = `<div class="st-card st-empty"><p class="st-error">Impossible de charger les statistiques.</p></div>`;
    } finally {
        if (token === loadToken) content.classList.remove('is-loading');
    }
}

async function fetchPointages(start, end) {
    const q = query(
        collection(db, "pointages"),
        where("uid", "==", currentUser.uid),
        where("timestamp", ">=", start.toISOString()),
        where("timestamp", "<", end.toISOString()),
        orderBy("timestamp", "asc")
    );
    const snapshot = await getDocs(q);
    // Un pointage en cours n'a pas encore de durée
    return snapshot.docs.map(d => d.data()).filter(p => p.endTime);
}

async function fetchTrajets(start, end) {
    const q = query(collection(db, "trajets"),
        where("id_utilisateur", "==", currentUser.uid),
        where("date_creation", ">=", start),
        where("date_creation", "<", end)
    );
    const snapshot = await getDocs(q);
    let km = 0, minutes = 0, count = 0;
    snapshot.forEach(d => {
        const t = d.data();
        km += t.distance_km || 0;
        minutes += t.duree_min || 0;
        count++;
    });
    return { km, minutes, count };
}

async function fetchLeaves() {
    const snapshot = await getDocs(query(collection(db, "leaveRequests"), where("userId", "==", currentUser.uid)));
    return snapshot.docs.map(d => d.data());
}

function computeStats(pointages) {
    const days = new Map();
    const chantiers = new Map();
    const colleagues = new Map();
    let totalMs = 0, pauseMs = 0, pauseCount = 0, entries = 0;

    pointages.forEach(p => {
        const start = new Date(p.timestamp);
        const end = new Date(p.endTime);
        const durationMs = (end - start) - (p.pauseDurationMs || 0);
        if (!(durationMs > 0)) return;

        entries++;
        totalMs += durationMs;
        if (p.pauseDurationMs > 0) { pauseMs += p.pauseDurationMs; pauseCount++; }

        const key = toKey(start);
        let day = days.get(key);
        if (!day) {
            day = { key, date: start, ms: 0, first: start, last: end, chantiers: new Map() };
            days.set(key, day);
        }
        day.ms += durationMs;
        if (start < day.first) day.first = start;
        if (end > day.last) day.last = end;
        day.chantiers.set(p.chantier, (day.chantiers.get(p.chantier) || 0) + durationMs);

        const c = chantiers.get(p.chantier) || { name: p.chantier, ms: 0, days: new Set() };
        c.ms += durationMs;
        c.days.add(key);
        chantiers.set(p.chantier, c);

        (p.colleagues || []).forEach(name => {
            if (name && name !== currentUser.displayName) colleagues.set(name, (colleagues.get(name) || 0) + 1);
        });
    });

    // Rythme : moyenne par jour de la semaine, heures d'arrivée / de départ
    const weekday = Array.from({ length: 7 }, () => ({ ms: 0, days: 0 }));
    let arrivalSum = 0, departureSum = 0, departureCount = 0, longest = null;
    days.forEach(day => {
        const wd = (day.date.getDay() + 6) % 7;
        weekday[wd].ms += day.ms;
        weekday[wd].days++;
        arrivalSum += minutesOfDay(day.first);
        if (toKey(day.last) === day.key) { departureSum += minutesOfDay(day.last); departureCount++; }
        if (!longest || day.ms > longest.ms) longest = day;
    });

    return {
        totalMs, entries, days, longest, weekday,
        chantiers: [...chantiers.values()].sort((a, b) => b.ms - a.ms),
        colleagues: [...colleagues.entries()].sort((a, b) => b[1] - a[1]),
        avgArrival: days.size ? arrivalSum / days.size : null,
        avgDeparture: departureCount ? departureSum / departureCount : null,
        avgPauseMs: pauseCount ? pauseMs / pauseCount : 0,
    };
}

/**
 * Heures de contrat hebdomadaires actives à une date (format YYYY-MM-DD).
 */
function weeklyContractHoursAt(userData, dateStr) {
    let weeklyContractHours = userData?.contractHours || 0;
    if (userData?.contractHistory && userData.contractHistory.length > 0) {
        const pastContracts = userData.contractHistory.filter(c => c.startDate <= dateStr);
        if (pastContracts.length > 0) {
            pastContracts.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
            weeklyContractHours = pastContracts[pastContracts.length - 1].hours;
        } else {
            const allSorted = [...userData.contractHistory].sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
            weeklyContractHours = allSorted[0].hours;
        }
    }
    return weeklyContractHours;
}

/**
 * Objectif de la période (base 52 semaines / 12 mois), objectif "à ce jour"
 * au prorata des jours ouvrables écoulés, et objectif journalier pour le graphique.
 */
function computeTargets(userData, range) {
    const months = range.mode === 'year'
        ? Array.from({ length: 12 }, (_, m) => new Date(range.start.getFullYear(), m, 1))
        : [range.start];
    const monthly = months.map(d => (weeklyContractHoursAt(userData, toKey(d)) * 52) / 12);
    const total = monthly.reduce((a, b) => a + b, 0);

    const workdays = countWeekdays(range.start, range.end);
    const elapsedEnd = range.isCurrent ? new Date(new Date().setHours(0, 0, 0, 0) + 86400000) : range.end;
    const elapsedWorkdays = countWeekdays(range.start, elapsedEnd);
    const weekly = weeklyContractHoursAt(userData, toKey(range.isCurrent ? new Date() : range.start));

    return {
        total,
        monthly,
        toDate: workdays ? total * (elapsedWorkdays / workdays) : total,
        daily: weekly / 5,
        workdays,
        elapsedWorkdays,
    };
}

function computeLeaves(leaves, range) {
    let approvedDays = 0, pending = 0;
    leaves.forEach(l => {
        if (!l.startDate || !l.endDate) return;
        const from = new Date(l.startDate + 'T00:00:00');
        const to = new Date(new Date(l.endDate + 'T00:00:00').getTime() + 86400000);
        const start = from > range.start ? from : range.start;
        const end = to < range.end ? to : range.end;
        if (start >= end) return;
        if (l.status === 'approved') {
            const perDay = (l.startTime && l.endTime) ? 0.5 : 1;
            approvedDays += countWeekdays(start, end) * perDay;
        } else if (l.status === 'pending') {
            pending++;
        }
    });
    return { approvedDays, pending };
}

// ----- Rendu -----

function renderStats(s) {
    const content = document.getElementById('stats-content');
    const totalH = s.totalMs / 3600000;
    const hasData = s.entries > 0;

    content.innerHTML = `
        ${renderHero(s, totalH)}
        ${renderKpis(s, totalH)}
        <section class="st-card st-chart-card">
            <div class="st-card-head">
                <div>
                    <h2 class="st-card-title">${s.range.mode === 'month' ? 'Heures par jour' : 'Heures par mois'}</h2>
                    <p class="st-card-sub">${s.range.mode === 'month' ? 'Survolez ou touchez une barre pour le détail' : 'Total travaillé chaque mois'}</p>
                </div>
                ${s.target.total > 0 ? `<span class="st-legend"><i class="st-legend-target"></i>Objectif ${s.range.mode === 'month' ? 'par jour' : 'moyen par mois'}</span>` : ''}
            </div>
            ${renderChart(s)}
        </section>
        <div class="st-grid-2">
            <section class="st-card">
                <div class="st-card-head">
                    <h2 class="st-card-title">Chantiers</h2>
                    <span class="st-card-sub">${s.chantiers.length} au total</span>
                </div>
                <div id="st-chantiers">${hasData ? renderChantierList(s) : emptyText('Aucun pointage sur cette période.')}</div>
            </section>
            <section class="st-card">
                <div class="st-card-head">
                    <h2 class="st-card-title">Mon rythme</h2>
                    <span class="st-card-sub">Moyenne par jour travaillé</span>
                </div>
                ${hasData ? renderRhythm(s) : emptyText('Pas encore de données.')}
            </section>
        </div>
        ${s.colleagues.length ? renderColleagues(s) : ''}
    `;

    bindChart(content.querySelector('.st-chart'), s);
    bindChantierToggle();
}

function renderHero(s, totalH) {
    const target = s.target.total;
    const balance = totalH - target;
    const pct = target > 0 ? totalH / target : 0;
    const circumference = 2 * Math.PI * 52;
    const dash = Math.min(pct, 1) * circumference;
    const periodWord = s.range.mode === 'month' ? 'mois' : 'année';

    let balanceHtml;
    if (target === 0) {
        balanceHtml = `<span class="st-balance">Solde indisponible (contrat non défini)</span>`;
    } else if (balance >= 0) {
        balanceHtml = `<span class="st-balance is-plus">${ICONS.up}<b>+${formatDecimalHours(balance)}</b> <small>heures supp.</small></span>`;
    } else if (s.range.isCurrent) {
        // Période en cours : le manque n'est pas encore définitif
        balanceHtml = `<span class="st-balance is-neutral"><b>${formatDecimalHours(Math.abs(balance))}</b> <small>restantes pour atteindre l'objectif</small></span>`;
    } else {
        balanceHtml = `<span class="st-balance is-minus">${ICONS.down}<b>${formatDecimalHours(Math.abs(balance))}</b> <small>heures manquantes</small></span>`;
    }

    const facts = [];
    // Comparaison avec la période précédente
    const prevH = s.previousMs / 3600000;
    if (prevH > 0 && !s.range.isCurrent) {
        const delta = (totalH - prevH) / prevH * 100;
        const cls = delta >= 0 ? 'is-up' : 'is-down';
        facts.push(`<li><span class="st-fact-label">vs ${s.range.prevLabel}</span><span class="st-trend ${cls}">${delta >= 0 ? ICONS.up : ICONS.down}${Math.abs(delta).toFixed(0)} %</span><span class="st-fact-muted">${formatDecimalHours(prevH)}</span></li>`);
    } else if (prevH > 0) {
        facts.push(`<li><span class="st-fact-label">${capitalize(s.range.prevLabel)}</span><strong>${formatDecimalHours(prevH)}</strong></li>`);
    }
    if (s.range.isCurrent && target > 0 && s.target.elapsedWorkdays > 0) {
        const ahead = totalH - s.target.toDate;
        facts.push(`<li><span class="st-fact-label">À ce jour</span><span class="st-trend ${ahead >= 0 ? 'is-up' : 'is-down'}">${ahead >= 0 ? 'En avance' : 'En retard'} de ${formatDecimalHours(Math.abs(ahead)) }</span></li>`);
    }
    if (s.range.isCurrent && totalH > 0 && s.target.elapsedWorkdays > 0) {
        const projected = totalH / s.target.elapsedWorkdays * s.target.workdays;
        facts.push(`<li><span class="st-fact-label">Projection fin de ${periodWord}</span><strong>≈ ${formatDecimalHours(projected)}</strong></li>`);
    }

    return `
        <section class="st-card st-hero">
            <div class="st-ring" role="img" aria-label="${Math.round(pct * 100)} % de l'objectif">
                <svg viewBox="0 0 120 120">
                    <circle class="st-ring-track" cx="60" cy="60" r="52"/>
                    ${dash > 0 ? `<circle class="st-ring-fill${pct >= 1 ? ' is-complete' : ''}" cx="60" cy="60" r="52"
                        stroke-dasharray="${dash} ${circumference}" transform="rotate(-90 60 60)"/>` : ''}
                </svg>
                <div class="st-ring-center">
                    <strong>${target > 0 ? Math.round(pct * 100) : '–'}<small>${target > 0 ? '%' : ''}</small></strong>
                    <span>de l'objectif</span>
                </div>
            </div>
            <div class="st-hero-body">
                <span class="st-eyebrow">Total travaillé · ${esc(s.range.label)}</span>
                <strong class="st-hero-value">${formatDecimalHours(totalH)}</strong>
                <span class="st-hero-target">${target > 0 ? `sur un objectif de ${formatDecimalHours(target)}` : 'Aucun objectif de contrat défini'}</span>
                ${balanceHtml}
            </div>
            ${facts.length ? `<ul class="st-hero-facts">${facts.join('')}</ul>` : ''}
        </section>
    `;
}

function renderKpis(s, totalH) {
    const daysWorked = s.days.size;
    const avg = daysWorked ? totalH / daysWorked : 0;
    const workdaysRef = s.range.isCurrent ? s.target.elapsedWorkdays : s.target.workdays;
    const kpi = (icon, label, value, sub) => `
        <div class="st-kpi">
            <span class="st-kpi-icon">${icon}</span>
            <span class="st-kpi-label">${label}</span>
            <span class="st-kpi-value">${value}</span>
            <span class="st-kpi-sub">${sub}</span>
        </div>`;

    const trajets = s.trajets;
    const leaves = s.leaves;
    return `
        <div class="st-kpis">
            ${kpi(ICONS.calendar, 'Jours travaillés', daysWorked, `sur ${workdaysRef} jour${workdaysRef > 1 ? 's' : ''} ouvrable${workdaysRef > 1 ? 's' : ''}`)}
            ${kpi(ICONS.clock, 'Moyenne par jour', formatDecimalHours(avg), `${s.entries} pointage${s.entries > 1 ? 's' : ''}`)}
            ${kpi(ICONS.car, 'Trajets', trajets ? `${Math.round(trajets.km)} km` : '–', trajets ? `${formatDecimalHours(trajets.minutes / 60)} de route` : 'Indisponible')}
            ${kpi(ICONS.sun, 'Congés', leaves ? formatDays(leaves.approvedDays) : '–', leaves ? (leaves.pending ? `${leaves.pending} demande${leaves.pending > 1 ? 's' : ''} en attente` : 'jours approuvés') : 'Indisponible')}
        </div>
    `;
}

function buildBuckets(s) {
    const { range } = s;
    const today = new Date();
    const todayKey = toKey(today);

    if (range.mode === 'month') {
        const year = range.start.getFullYear(), month = range.start.getMonth();
        const count = new Date(year, month + 1, 0).getDate();
        return Array.from({ length: count }, (_, i) => {
            const date = new Date(year, month, i + 1);
            const key = toKey(date);
            const day = s.days.get(key);
            const dow = date.getDay();
            return {
                label: String(i + 1),
                title: date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }),
                hours: day ? day.ms / 3600000 : 0,
                target: dow === 0 || dow === 6 ? 0 : s.target.daily,
                detail: day ? [...day.chantiers.entries()].sort((a, b) => b[1] - a[1]) : [],
                range: day ? `${formatTime(day.first)} → ${formatTime(day.last)}` : '',
                weekend: dow === 0 || dow === 6,
                today: key === todayKey,
                future: date > today,
                showLabel: i === 0 || (i + 1) % 5 === 0 || key === todayKey,
            };
        });
    }

    const year = range.start.getFullYear();
    const perMonth = Array.from({ length: 12 }, () => ({ ms: 0, days: 0 }));
    s.days.forEach(day => {
        const m = day.date.getMonth();
        perMonth[m].ms += day.ms;
        perMonth[m].days++;
    });
    return perMonth.map((m, i) => ({
        label: MONTHS_SHORT[i],
        title: new Date(year, i, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }),
        hours: m.ms / 3600000,
        target: s.target.monthly[i],
        days: m.days,
        detail: [],
        today: year === today.getFullYear() && i === today.getMonth(),
        future: new Date(year, i, 1) > today,
        showLabel: true,
    }));
}

function renderChart(s) {
    const buckets = buildBuckets(s);
    s.buckets = buckets;
    const lineTarget = s.range.mode === 'month' ? s.target.daily : s.target.total / 12;
    const maxValue = Math.max(...buckets.map(b => b.hours), lineTarget, 1);
    const step = niceStep(maxValue);
    const top = Math.ceil((maxValue * 1.05) / step) * step;
    const pctOf = (h) => (h / top) * 100;

    const gridlines = [];
    for (let v = step; v <= top + 0.001; v += step) {
        gridlines.push(`<div class="st-gridline" style="bottom: ${pctOf(v)}%;"><span>${v}h</span></div>`);
    }

    const cols = buckets.map((b, i) => `
        <button type="button" class="st-col${b.weekend ? ' is-weekend' : ''}${b.today ? ' is-today' : ''}${b.future ? ' is-future' : ''}" data-i="${i}"
            aria-label="${esc(b.title)} : ${formatDecimalHours(b.hours)}">
            ${b.hours > 0 ? `<span class="st-bar${b.target > 0 && b.hours >= b.target ? ' is-met' : ''}" style="height: ${Math.max(pctOf(b.hours), 1.5)}%;"></span>` : ''}
        </button>`).join('');

    const labels = buckets.map(b => `<span class="${b.today ? 'is-today' : ''}">${b.showLabel ? esc(b.label) : ''}</span>`).join('');

    return `
        <div class="st-chart" style="--cols: ${buckets.length};">
            <div class="st-plot">
                <div class="st-gridline is-base" style="bottom: 0;"><span>0</span></div>
                ${gridlines.join('')}
                ${lineTarget > 0 ? `<div class="st-target-line" style="bottom: ${pctOf(lineTarget)}%;"></div>` : ''}
                <div class="st-cols">${cols}</div>
                ${s.entries === 0 ? `<div class="st-chart-empty">Aucun pointage sur cette période</div>` : ''}
            </div>
            <div class="st-axis">${labels}</div>
            ${lineTarget > 0 ? `<div class="st-chart-legend"><span><i></i>Objectif atteint</span><span><i class="is-under"></i>Sous l'objectif</span></div>` : ''}
            <div class="st-tooltip" role="status" hidden></div>
        </div>
    `;
}

function bindChart(chart, s) {
    if (!chart) return;
    const tooltip = chart.querySelector('.st-tooltip');
    let activeCol = null;

    const show = (col) => {
        const b = s.buckets[Number(col.dataset.i)];
        if (!b) return;
        activeCol?.classList.remove('is-active');
        activeCol = col;
        col.classList.add('is-active');

        let detail = '';
        if (b.detail.length) {
            detail = `<ul>${b.detail.slice(0, 4).map(([name, ms]) => `<li><span>${esc(name)}</span><span>${formatDecimalHours(ms / 3600000)}</span></li>`).join('')}</ul>`;
        }
        const meta = [];
        if (b.range) meta.push(b.range);
        if (b.days !== undefined) meta.push(`${b.days} jour${b.days > 1 ? 's' : ''} travaillé${b.days > 1 ? 's' : ''}`);
        if (b.target > 0) meta.push(`Objectif ${formatDecimalHours(b.target)}`);

        tooltip.innerHTML = `
            <span class="st-tooltip-title">${esc(capitalize(b.title))}</span>
            <strong>${b.hours > 0 ? formatDecimalHours(b.hours) : (b.future ? 'À venir' : 'Aucun pointage')}</strong>
            ${meta.length ? `<span class="st-tooltip-meta">${meta.join(' · ')}</span>` : ''}
            ${detail}`;
        tooltip.hidden = false;

        // À droite de la colonne, ou à gauche si elle est trop près du bord
        const chartRect = chart.getBoundingClientRect();
        const colRect = col.getBoundingClientRect();
        const tipWidth = tooltip.offsetWidth;
        let left = colRect.right - chartRect.left + 8;
        if (left + tipWidth > chartRect.width) left = colRect.left - chartRect.left - tipWidth - 8;
        tooltip.style.left = `${Math.max(0, left)}px`;
    };
    const hide = () => {
        activeCol?.classList.remove('is-active');
        activeCol = null;
        tooltip.hidden = true;
    };

    chart.querySelectorAll('.st-col').forEach(col => {
        col.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') show(col); });
        col.addEventListener('focus', () => show(col));
        col.addEventListener('click', () => show(col));
    });
    chart.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(); });
    // Au toucher : un appui hors du graphique referme le détail
    const onOutside = (e) => {
        if (!document.contains(chart)) return document.removeEventListener('pointerdown', onOutside);
        if (!chart.contains(e.target)) hide();
    };
    document.addEventListener('pointerdown', onOutside);
    chart.addEventListener('focusout', (e) => { if (!chart.contains(e.relatedTarget)) hide(); });
}

function renderChantierList(s) {
    const list = showAllChantiers ? s.chantiers : s.chantiers.slice(0, 5);
    const max = s.chantiers[0]?.ms || 1;
    const rows = list.map((c, i) => {
        const share = s.totalMs ? (c.ms / s.totalMs) * 100 : 0;
        return `
            <li class="st-site">
                <span class="st-site-rank">${i + 1}</span>
                <div class="st-site-main">
                    <div class="st-site-line">
                        <span class="st-site-name">${esc(c.name)}</span>
                        <span class="st-site-hours">${formatDecimalHours(c.ms / 3600000)}</span>
                    </div>
                    <span class="st-site-bar"><span style="width: ${Math.max((c.ms / max) * 100, 2)}%;"></span></span>
                    <span class="st-site-meta">${share.toFixed(0)} % du temps · ${c.days.size} jour${c.days.size > 1 ? 's' : ''}</span>
                </div>
            </li>`;
    }).join('');
    const more = s.chantiers.length > 5
        ? `<button type="button" id="st-chantiers-toggle" class="st-more">${showAllChantiers ? 'Afficher moins' : `Voir les ${s.chantiers.length} chantiers`}</button>`
        : '';
    return `<ol class="st-sites">${rows}</ol>${more}`;
}

function bindChantierToggle() {
    const btn = document.getElementById('st-chantiers-toggle');
    if (!btn) return;
    btn.onclick = () => {
        showAllChantiers = !showAllChantiers;
        document.getElementById('st-chantiers').innerHTML = renderChantierList(lastStats);
        bindChantierToggle();
    };
}

function renderRhythm(s) {
    const avgs = s.weekday.map(w => (w.days ? w.ms / w.days / 3600000 : 0));
    const maxAvg = Math.max(...avgs, 1);
    const rows = s.weekday.map((w, i) => `
        <li class="st-wd${w.days ? '' : ' is-empty'}">
            <span class="st-wd-name">${WEEKDAYS_SHORT[i]}</span>
            <span class="st-wd-bar"><span style="width: ${(avgs[i] / maxAvg) * 100}%;"></span></span>
            <span class="st-wd-value">${w.days ? formatDecimalHours(avgs[i]) : '–'}</span>
            <span class="st-wd-days">${w.days ? `${w.days} j` : ''}</span>
        </li>`).join('');

    const longest = s.longest;
    const facts = [
        ['Arrivée moyenne', s.avgArrival !== null ? formatMinutesOfDay(s.avgArrival) : '–'],
        ['Départ moyen', s.avgDeparture !== null ? formatMinutesOfDay(s.avgDeparture) : '–'],
        ['Plus longue journée', longest ? `${formatDecimalHours(longest.ms / 3600000)}<small>${longest.date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}</small>` : '–'],
        ['Pause moyenne', s.avgPauseMs ? formatDecimalHours(s.avgPauseMs / 3600000) : 'Aucune'],
    ];

    return `
        <ul class="st-weekdays">${rows}</ul>
        <dl class="st-facts">
            ${facts.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}
        </dl>
    `;
}

function renderColleagues(s) {
    const chips = s.colleagues.slice(0, 8).map(([name, count]) => `
        <li class="st-mate">
            <span class="st-avatar st-avatar-sm" aria-hidden="true">${esc(initials(name))}</span>
            <span class="st-mate-name">${esc(name)}</span>
            <span class="st-mate-count">${count}×</span>
        </li>`).join('');
    return `
        <section class="st-card">
            <div class="st-card-head">
                <h2 class="st-card-title">${ICONS.users}Avec qui j'ai travaillé</h2>
                <span class="st-card-sub">Nombre de pointages en commun</span>
            </div>
            <ul class="st-mates">${chips}</ul>
        </section>
    `;
}

function renderSkeleton() {
    return `
        <div class="st-skel" style="height: 168px;"></div>
        <div class="st-kpis">${'<div class="st-skel" style="height: 112px;"></div>'.repeat(4)}</div>
        <div class="st-skel" style="height: 280px;"></div>
    `;
}

const esc = escapeHTML;
const emptyText = (text) => `<p class="st-empty-text">${text}</p>`;

// ----- Utilitaires -----

function formatDecimalHours(decimalHours) {
    if (!decimalHours || decimalHours <= 0) return '0h 00m';

    let hours = Math.floor(decimalHours);
    let minutes = Math.round((decimalHours - hours) * 60);
    if (minutes === 60) { hours++; minutes = 0; }

    if (hours === 0 && minutes === 0) return '0h 00m';
    if (hours === 0) return `${minutes}m`;
    return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}

function formatDays(days) {
    const str = Number.isInteger(days) ? String(days) : days.toFixed(1).replace('.', ',');
    return `${str} j`;
}

function formatTime(date) {
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function formatMinutesOfDay(minutes) {
    const m = Math.round(minutes);
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function minutesOfDay(date) {
    return date.getHours() * 60 + date.getMinutes();
}

function niceStep(max) {
    return [1, 2, 4, 5, 10, 20, 25, 50, 100, 200].find(step => max / step <= 4) || 500;
}

function countWeekdays(start, end) {
    let count = 0;
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    while (d < end) {
        const dow = d.getDay();
        if (dow !== 0 && dow !== 6) count++;
        d.setDate(d.getDate() + 1);
    }
    return count;
}

function toKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function initials(name = '') {
    return name.trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
}

function capitalize(str) {
    return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

function getPeriodRange(mode, offset = 0) {
    const now = new Date();
    if (mode === 'year') {
        const year = now.getFullYear() + offset;
        return {
            mode,
            start: new Date(year, 0, 1),
            end: new Date(year + 1, 0, 1),
            prevStart: new Date(year - 1, 0, 1),
            label: String(year),
            prevLabel: String(year - 1),
            isCurrent: offset === 0,
        };
    }

    const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    const prevStart = new Date(start.getFullYear(), start.getMonth() - 1, 1);
    const label = start.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    return {
        mode,
        start,
        end,
        prevStart,
        label: capitalize(label),
        prevLabel: prevStart.toLocaleDateString('fr-FR', { month: 'long' }),
        isCurrent: offset === 0,
    };
}
