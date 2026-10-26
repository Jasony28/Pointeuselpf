import { collection, query, orderBy, getDocs, addDoc, updateDoc, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent, showInfoModal, showConfirmationModal, showToast } from "../app.js";
import { getGoogleMapsUrl } from "./utils.js";
import { getActiveChantiers } from "./data-service.js";
import { clearTripCaches, findDaysUsingAddress, rebuildDayTrips, geocodeDetails, crowDistanceKm, DEPOT_ADDRESS } from "./trips.js";
import { isValidEmail, mailButtonHTML } from "./mail.js";

// Token Mapbox
const MAPBOX_TOKEN = "pk.eyJ1IjoiamFzb255MjgiLCJhIjoiY21lMDcyYWhzMDIyODJsczl0cmM0aTVjciJ9.V14cJXdBNoq3yAQTDeUg-A";

// Champs horaires d'un chantier (lus aussi par planning-optimizer.js — ne pas renommer) :
//  - fixedAppointment : heure de début imposée (RDV), "HH:MM"
//  - timeWindowStart  : arrivée au plus tôt (ouverture)
//  - timeWindowEnd    : doit être TERMINÉ au plus tard (échéance)
//  - totalHeuresPrevues : durée prévue par passage, en heures (total équipe)

let chantiersCache = [];
let currentTab = 'active';
let editingChantier = null; // null = création

const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toMinutes = (hhmm) => { if (!hhmm) return null; const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const fromMinutes = (mins) => `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
const formatHours = (h) => {
    if (!h) return '';
    const hours = Math.floor(h);
    const minutes = Math.round((h - hours) * 60);
    return minutes ? `${hours} h ${String(minutes).padStart(2, '0')}` : `${hours} h`;
};

const icon = {
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    archive: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="5" rx="1"/><path d="M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9M10 13h4"/></svg>',
    restore: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
};

export async function render() {
    pageContent.innerHTML = `
        <div class="max-w-6xl mx-auto space-y-4">
            <div class="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h2 class="text-2xl font-bold" style="color: var(--color-text-base);">Gestion des Chantiers & Contraintes</h2>
                    <p class="mt-1 text-sm" style="color: var(--color-text-muted);">Adresses, durées, horaires imposés et codes d'accès de chaque chantier.</p>
                </div>
                <div class="flex flex-wrap gap-2">
                    <button id="checkAddressesBtn" class="btn btn-secondary">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="pointer-events: none;"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><path d="m9 10 2 2 4-4"/></svg>
                        Vérifier les adresses
                    </button>
                    <button id="openAddChantierBtn" class="btn btn-primary">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true" style="pointer-events: none;"><path d="M12 5v14M5 12h14"/></svg>
                        Nouveau chantier
                    </button>
                </div>
            </div>

            <div class="hours-toolbar">
                <div class="hours-search">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
                    <input type="search" id="chantierSearchInput" placeholder="Rechercher un chantier ou une adresse…" autocomplete="off">
                </div>
                <div class="segmented" role="group" aria-label="Statut">
                    <button type="button" data-tab="active" class="tab-btn is-active">Actifs <span id="activeCount"></span></button>
                    <button type="button" data-tab="archived" class="tab-btn">Archivés <span id="archivedCount"></span></button>
                </div>
            </div>

            <div id="chantiersGrid" class="site-grid"></div>
        </div>

        <div id="addressCheckModal" class="modal hidden" role="dialog" aria-modal="true" aria-labelledby="addressCheckTitle">
            <div class="modal-panel modal-panel-lg">
                <div class="modal-body space-y-3">
                    <div>
                        <h3 id="addressCheckTitle" class="modal-title">Vérification des adresses</h3>
                        <p class="modal-text">Chaque adresse des chantiers actifs est recherchée sur la carte, comme pour le calcul des kilomètres. Les distances sont à vol d'oiseau depuis le dépôt (Marche-en-Famenne).</p>
                    </div>
                    <div id="addressCheckList" class="space-y-2"></div>
                </div>
                <div class="modal-footer">
                    <button type="button" id="closeAddressCheckBtn" class="btn btn-secondary">Fermer</button>
                </div>
            </div>
        </div>

        <!-- Fiche détaillée -->
        <div id="detailsModal" class="hidden fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-20 p-4">
            <div class="p-6 rounded-lg shadow-xl w-full max-w-lg space-y-4 relative" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                <button id="closeDetailsBtn" class="icon-btn" style="position: absolute; top: 0.75rem; right: 0.75rem;" aria-label="Fermer">${icon.x}</button>
                <div class="pr-10">
                    <h3 id="modalChantierName" class="text-xl font-bold" style="color: var(--color-text-base);"></h3>
                    <div id="modalChantierChips" class="cchips mt-2"></div>
                </div>
                <div id="modalTimeConstraints" class="constraint-box hidden"></div>
                <div id="modalChantierAddressContainer">
                    <h4 class="kpi-label">Adresse</h4>
                    <a id="modalChantierAddress" href="#" target="_blank" rel="noopener noreferrer" class="site-address-link" style="color: var(--color-primary);"></a>
                </div>
                <div id="modalChantierEmailContainer">
                    <h4 class="kpi-label">E-mail du client</h4>
                    <div class="mail-row"><span id="modalChantierEmail" class="mail-address"></span><span id="modalChantierEmailBtn"></span></div>
                </div>
                <div>
                    <h4 class="kpi-label">Codes & accès</h4>
                    <div id="modalChantierKeybox" style="color: var(--color-text-base);"></div>
                </div>
                <div>
                    <h4 class="kpi-label">Informations supplémentaires</h4>
                    <p id="modalChantierInfo" style="color: var(--color-text-base); white-space: pre-wrap; overflow-wrap: anywhere;"></p>
                </div>
                <div class="flex justify-end pt-4 border-t" style="border-color: var(--color-border);">
                    <button id="editChantierBtn" class="btn btn-primary">Modifier</button>
                </div>
            </div>
        </div>

        <!-- Formulaire (création et modification) -->
        <div id="chantierFormModal" class="hidden fixed inset-0 bg-black bg-opacity-60 flex justify-center items-start overflow-y-auto z-30 p-4">
            <form id="chantierForm" class="rounded-lg shadow-xl w-full max-w-xl my-8" style="background-color: var(--color-surface); border: 1px solid var(--color-border);" novalidate>
                <div class="p-6 space-y-5">
                    <h3 id="chantierFormTitle" class="text-xl font-bold" style="color: var(--color-text-base);">Nouveau chantier</h3>

                    <div class="form-section">
                        <div class="field">
                            <label for="formName" class="field-label">Nom du chantier *</label>
                            <input id="formName" type="text" class="input" placeholder="ex : Airbnb Rue Haute" required>
                        </div>
                        <div class="field">
                            <label for="formAddress" class="field-label">Adresse précise</label>
                            <input id="formAddress" type="text" class="input" placeholder="ex : Rue de la Gare 12, 6900 Marche-en-Famenne" autocomplete="off">
                            <p id="formGeoStatus" class="field-hint">Utilisée pour l'itinéraire et le calcul des kilomètres.</p>
                        </div>
                        <div class="field">
                            <label for="formEmail" class="field-label">E-mail du client <span class="field-optional">(optionnel)</span></label>
                            <input id="formEmail" type="email" inputmode="email" class="input" placeholder="ex : client@gmail.com" autocomplete="off" autocapitalize="off" spellcheck="false">
                            <p class="field-hint">Les employés pourront lui envoyer un e-mail en un clic depuis la fiche du chantier.</p>
                        </div>
                        <div class="field">
                            <label for="formHours" class="field-label">Durée prévue par passage</label>
                            <div class="input-suffix">
                                <input id="formHours" type="number" min="0" step="0.25" class="input" placeholder="ex : 2.5">
                                <span>heures</span>
                            </div>
                            <p class="field-hint">Temps total de l'équipe sur place à chaque passage.</p>
                        </div>
                    </div>

                    <div class="form-section">
                        <div>
                            <h4 class="form-section-title">${icon.clock} Horaires imposés <span>(optionnel)</span></h4>
                            <p class="field-hint">Laissez vide si le chantier peut se faire à n'importe quelle heure.</p>
                        </div>
                        <div class="time-grid">
                            <div class="field">
                                <label for="formFixed" class="field-label">Heure de début imposée</label>
                                <div class="time-input"><input id="formFixed" type="time" class="input"><button type="button" class="time-clear" data-clear="formFixed" aria-label="Effacer">${icon.x}</button></div>
                                <p class="field-hint">RDV : il faut commencer à cette heure-là.</p>
                            </div>
                            <div class="field">
                                <label for="formWindowStart" class="field-label">Arrivée au plus tôt</label>
                                <div class="time-input"><input id="formWindowStart" type="time" class="input"><button type="button" class="time-clear" data-clear="formWindowStart" aria-label="Effacer">${icon.x}</button></div>
                                <p class="field-hint">Ouverture : pas avant cette heure.</p>
                            </div>
                            <div class="field">
                                <label for="formWindowEnd" class="field-label">Terminé au plus tard</label>
                                <div class="time-input"><input id="formWindowEnd" type="time" class="input"><button type="button" class="time-clear" data-clear="formWindowEnd" aria-label="Effacer">${icon.x}</button></div>
                                <p class="field-hint">Ex : Airbnb à finir avant 10:00.</p>
                            </div>
                        </div>
                        <div id="formTimeSummary" class="constraint-box hidden"></div>
                    </div>

                    <div class="form-section">
                        <div class="field">
                            <label class="field-label" for="formNewCode">Codes & accès</label>
                            <div class="flex items-center gap-2">
                                <input id="formNewCode" type="text" class="input" placeholder="ex : boîte à clés 1234" autocomplete="off">
                                <button type="button" id="formAddCodeBtn" class="btn btn-secondary">Ajouter</button>
                            </div>
                            <ul id="formCodesList" class="code-edit-list"></ul>
                        </div>
                        <div class="field">
                            <label for="formInfo" class="field-label">Informations supplémentaires</label>
                            <textarea id="formInfo" class="input" rows="3" placeholder="Consignes, matériel, contact sur place…"></textarea>
                        </div>
                        <label class="hideable-toggle">
                            <input type="checkbox" id="formHideable">
                            <span><strong>Chantier « Hors forfait »</strong><br>Caché du PDF officiel quand le mode discret est activé.</span>
                        </label>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" id="cancelChantierFormBtn" class="btn btn-secondary">Annuler</button>
                    <button type="submit" id="saveChantierBtn" class="btn btn-primary">Enregistrer</button>
                </div>
            </form>
        </div>
    `;
    setTimeout(async () => {
        setupEventListeners();
        await loadChantiers();
    }, 0);
}

async function geocodeAddress(address) {
    if (!address) return null;
    try {
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${MAPBOX_TOKEN}&limit=1&country=BE`;
        const response = await fetch(url);
        const data = await response.json();
        if (data.features && data.features.length > 0) {
            const [lng, lat] = data.features[0].center;
            return { lat, lng };
        }
    } catch (e) {
        console.error("Erreur géocodage:", e);
    }
    return null;
}

async function loadChantiers() {
    const grid = document.getElementById("chantiersGrid");
    grid.innerHTML = '<div class="site-card is-loading"></div>'.repeat(4);
    try {
        const q = query(collection(db, "chantiers"), orderBy("name"));
        const snapshot = await getDocs(q);
        chantiersCache = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        displayChantiers();
    } catch (error) {
        console.error("Erreur chargement:", error);
        grid.innerHTML = `<p class="hours-empty">Erreur de chargement des chantiers.</p>`;
    }
}

function displayChantiers() {
    const grid = document.getElementById("chantiersGrid");
    if (!grid) return;
    const active = chantiersCache.filter(c => c.status === 'active');
    const archived = chantiersCache.filter(c => c.status !== 'active');
    document.getElementById('activeCount').textContent = `(${active.length})`;
    document.getElementById('archivedCount').textContent = `(${archived.length})`;

    const searchTerm = (document.getElementById('chantierSearchInput').value || '').toLowerCase().trim();
    const list = (currentTab === 'active' ? active : archived).filter(c =>
        (c.name || '').toLowerCase().includes(searchTerm) || (c.address || '').toLowerCase().includes(searchTerm)
    );

    grid.innerHTML = '';
    if (list.length === 0) {
        grid.innerHTML = `<p class="hours-empty">${searchTerm ? 'Aucun chantier ne correspond à votre recherche.' : currentTab === 'active' ? 'Aucun chantier actif.' : 'Aucun chantier archivé.'}</p>`;
        return;
    }
    list.forEach(c => grid.appendChild(createChantierElement(c)));
}

// Pastilles résumant un chantier (durée, horaires, alertes)
function chipsHTML(chantier) {
    const chips = [];
    if (chantier.totalHeuresPrevues > 0) chips.push(`<span class="cchip">${icon.clock}${formatHours(chantier.totalHeuresPrevues)} / passage</span>`);
    if (chantier.fixedAppointment) chips.push(`<span class="cchip is-fixed">RDV ${escapeHTML(chantier.fixedAppointment)}</span>`);
    if (chantier.timeWindowStart && chantier.timeWindowEnd) chips.push(`<span class="cchip is-window">${escapeHTML(chantier.timeWindowStart)} → ${escapeHTML(chantier.timeWindowEnd)}</span>`);
    else if (chantier.timeWindowStart) chips.push(`<span class="cchip is-window">Dès ${escapeHTML(chantier.timeWindowStart)}</span>`);
    else if (chantier.timeWindowEnd) chips.push(`<span class="cchip is-window">Fini avant ${escapeHTML(chantier.timeWindowEnd)}</span>`);
    if (chantier.isHideable) chips.push(`<span class="cchip is-hidden">Hors forfait</span>`);
    if (chantier.address && !chantier.coordinates?.lat) chips.push(`<span class="cchip is-warning" title="L'adresse n'a pas été localisée : itinéraire et kilomètres impossibles">GPS manquant</span>`);
    if (!chantier.address) chips.push(`<span class="cchip is-warning">Sans adresse</span>`);
    return chips.join('');
}

function createChantierElement(chantier) {
    const card = document.createElement('div');
    card.className = `site-card${chantier.isHideable ? ' is-hideable' : ''}`;
    card.setAttribute('role', 'button');
    card.tabIndex = 0;
    const isActive = chantier.status === 'active';

    card.innerHTML = `
        <div class="site-card-head">
            <h3 class="site-card-name">${escapeHTML(chantier.name)}</h3>
            <span class="entry-actions">
                <button type="button" class="icon-btn" data-action="edit" title="Modifier" aria-label="Modifier">${icon.edit}</button>
                <button type="button" class="icon-btn" data-action="status" title="${isActive ? 'Archiver' : 'Réactiver'}" aria-label="${isActive ? 'Archiver' : 'Réactiver'}">${isActive ? icon.archive : icon.restore}</button>
            </span>
        </div>
        <p class="site-card-address">${chantier.address ? escapeHTML(chantier.address) : '<em>Adresse non renseignée</em>'}</p>
        <div class="cchips">${chipsHTML(chantier)}</div>
    `;

    card.onclick = (e) => {
        const action = e.target.closest('[data-action]')?.dataset.action;
        if (action === 'edit') return openChantierForm(chantier);
        if (action === 'status') return updateChantierStatus(chantier.id, isActive ? 'archived' : 'active');
        showDetailsModal(chantier);
    };
    card.onkeydown = (e) => { if (e.key === 'Enter') showDetailsModal(chantier); };
    return card;
}

async function updateChantierStatus(id, newStatus) {
    const action = newStatus === 'active' ? 'réactiver' : 'archiver';
    if (await showConfirmationModal("Confirmation", `Voulez-vous ${action} ce chantier ?`)) {
        try {
            await updateDoc(doc(db, "chantiers", id), { status: newStatus });
            await getActiveChantiers(true);
            showToast(newStatus === 'active' ? 'Chantier réactivé.' : 'Chantier archivé.', 'success');
            await loadChantiers();
        } catch (error) {
            console.error("Erreur statut:", error);
            showInfoModal("Erreur", "Le changement de statut a échoué.");
        }
    }
}

/**
 * Explique en clair les contraintes horaires et signale les incohérences
 * (base des règles que l'algorithme de tournée devra respecter).
 */
function describeConstraints({ fixedAppointment, timeWindowStart, timeWindowEnd, totalHeuresPrevues }) {
    const lines = [];
    const issues = [];
    const duration = Math.round((parseFloat(totalHeuresPrevues) || 0) * 60);
    const fixed = toMinutes(fixedAppointment);
    const open = toMinutes(timeWindowStart);
    const deadline = toMinutes(timeWindowEnd);

    if (fixed !== null) {
        lines.push(`Commence à <strong>${fixedAppointment}</strong>${duration ? `, fini vers <strong>${fromMinutes(fixed + duration)}</strong>` : ''}.`);
        if (open !== null && fixed < open) issues.push(`Le RDV (${fixedAppointment}) est avant l'heure d'ouverture (${timeWindowStart}).`);
        if (deadline !== null && duration && fixed + duration > deadline) issues.push(`En commençant à ${fixedAppointment}, le chantier finit à ${fromMinutes(fixed + duration)}, après l'échéance de ${timeWindowEnd}.`);
    }
    if (open !== null && fixed === null) lines.push(`Arrivée possible dès <strong>${timeWindowStart}</strong>.`);
    if (deadline !== null) {
        if (duration && fixed === null) {
            const latestStart = deadline - duration;
            lines.push(`Doit être terminé avant <strong>${timeWindowEnd}</strong> → commencer au plus tard à <strong>${fromMinutes(Math.max(0, latestStart))}</strong>.`);
            if (open !== null && open > latestStart) issues.push(`Entre ${timeWindowStart} et ${timeWindowEnd}, il n'y a pas assez de temps pour ${formatHours(duration / 60)} de travail.`);
        } else if (fixed === null) {
            lines.push(`Doit être terminé avant <strong>${timeWindowEnd}</strong>. Indiquez la durée pour connaître l'heure de début limite.`);
        }
        if (open !== null && deadline <= open) issues.push(`L'échéance (${timeWindowEnd}) est avant l'heure d'arrivée au plus tôt (${timeWindowStart}).`);
    }
    return { lines, issues };
}

function renderConstraintBox(container, values) {
    const { lines, issues } = describeConstraints(values);
    if (!lines.length && !issues.length) {
        container.classList.add('hidden');
        container.innerHTML = '';
        return;
    }
    container.classList.remove('hidden');
    container.classList.toggle('has-issue', issues.length > 0);
    container.innerHTML = [
        ...lines.map(l => `<p>${l}</p>`),
        ...issues.map(i => `<p class="constraint-issue">⚠ ${escapeHTML(i)}</p>`),
    ].join('');
}

function readFormValues() {
    return {
        name: document.getElementById('formName').value.trim(),
        address: document.getElementById('formAddress').value.trim(),
        email: document.getElementById('formEmail').value.trim().toLowerCase(),
        totalHeuresPrevues: parseFloat(document.getElementById('formHours').value) || 0,
        fixedAppointment: document.getElementById('formFixed').value,
        timeWindowStart: document.getElementById('formWindowStart').value,
        timeWindowEnd: document.getElementById('formWindowEnd').value,
        isHideable: document.getElementById('formHideable').checked,
        keyboxCodes: Array.from(document.querySelectorAll('#formCodesList li span')).map(s => s.textContent),
        additionalInfo: document.getElementById('formInfo').value.trim(),
    };
}

function addCodeToList(text) {
    const li = document.createElement('li');
    li.innerHTML = `<span></span><button type="button" class="icon-btn is-danger" aria-label="Retirer ce code">${icon.x}</button>`;
    li.querySelector('span').textContent = text;
    li.querySelector('button').onclick = () => li.remove();
    document.getElementById('formCodesList').appendChild(li);
}

function openChantierForm(chantier = null) {
    editingChantier = chantier;
    document.getElementById('detailsModal').classList.add('hidden');
    document.getElementById('chantierForm').reset();
    document.getElementById('chantierFormTitle').textContent = chantier ? 'Modifier le chantier' : 'Nouveau chantier';
    document.getElementById('formCodesList').innerHTML = '';

    if (chantier) {
        document.getElementById('formName').value = chantier.name || '';
        document.getElementById('formAddress').value = chantier.address || '';
        document.getElementById('formEmail').value = chantier.email || '';
        document.getElementById('formHours').value = chantier.totalHeuresPrevues || '';
        document.getElementById('formFixed').value = chantier.fixedAppointment || '';
        document.getElementById('formWindowStart').value = chantier.timeWindowStart || '';
        document.getElementById('formWindowEnd').value = chantier.timeWindowEnd || '';
        document.getElementById('formHideable').checked = chantier.isHideable || false;
        document.getElementById('formInfo').value = chantier.additionalInfo || '';
        (chantier.keyboxCodes || []).forEach(addCodeToList);
    }

    updateGeoStatus();
    renderConstraintBox(document.getElementById('formTimeSummary'), readFormValues());
    document.getElementById('chantierFormModal').classList.remove('hidden');
    document.getElementById('formName').focus();
}

function closeChantierForm() {
    document.getElementById('chantierFormModal').classList.add('hidden');
    editingChantier = null;
}

// Indique si la position GPS est connue (nécessaire au calcul des kilomètres)
function updateGeoStatus() {
    const status = document.getElementById('formGeoStatus');
    const address = document.getElementById('formAddress').value.trim();
    status.className = 'field-hint';
    if (!address) {
        status.textContent = "Utilisée pour l'itinéraire et le calcul des kilomètres.";
    } else if (editingChantier && address === editingChantier.address && editingChantier.coordinates?.lat) {
        status.classList.add('is-ok');
        status.textContent = '✓ Position GPS connue.';
    } else {
        status.textContent = "La position GPS sera recherchée à l'enregistrement.";
    }
}

async function saveChantier(e) {
    e.preventDefault();
    const values = readFormValues();
    if (!values.name) {
        showInfoModal("Attention", "Le nom du chantier est obligatoire.");
        document.getElementById('formName').focus();
        return;
    }
    if (values.email && !isValidEmail(values.email)) {
        showInfoModal("Attention", "L'adresse e-mail n'est pas valide (ex : client@gmail.com).");
        document.getElementById('formEmail').focus();
        return;
    }

    const saveBtn = document.getElementById('saveChantierBtn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Enregistrement…';

    try {
        // Position GPS : réutilisée si l'adresse n'a pas changé, sinon recherchée à nouveau
        let coordinates = null;
        let geoFailed = false;
        if (values.address) {
            if (editingChantier && values.address === editingChantier.address && editingChantier.coordinates?.lat) {
                coordinates = editingChantier.coordinates;
            } else {
                coordinates = await geocodeAddress(values.address);
                geoFailed = !coordinates;
            }
        }

        const data = { ...values, coordinates };
        const isEdit = !!editingChantier;
        const oldAddress = isEdit ? (editingChantier.address || '') : '';
        const addressChanged = isEdit && oldAddress && values.address && values.address !== oldAddress;
        if (isEdit) {
            await updateDoc(doc(db, "chantiers", editingChantier.id), data);
        } else {
            await addDoc(collection(db, "chantiers"), { ...data, status: 'active', createdAt: serverTimestamp() });
        }
        await getActiveChantiers(true);

        closeChantierForm();
        await loadChantiers();
        if (addressChanged) clearTripCaches();
        if (geoFailed) {
            showInfoModal("Chantier enregistré", "Attention : l'adresse n'a pas été trouvée sur la carte. L'itinéraire et le calcul des kilomètres ne fonctionneront pas pour ce chantier tant que l'adresse n'est pas corrigée.");
        } else if (addressChanged) {
            await offerTripsRecalculation(oldAddress);
        } else {
            showInfoModal("Succès", isEdit ? "Chantier mis à jour." : "Chantier ajouté.");
        }
    } catch (error) {
        console.error("Erreur enregistrement:", error);
        showInfoModal("Erreur", "L'enregistrement du chantier a échoué.");
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Enregistrer';
    }
}

// L'adresse d'un chantier a été corrigée : on propose de recalculer les km des journées déjà enregistrées
async function offerTripsRecalculation(oldAddress) {
    let days = [];
    try {
        days = await findDaysUsingAddress(oldAddress);
    } catch (error) {
        console.error("Recherche des trajets à recalculer:", error);
    }
    if (!days.length) {
        showInfoModal("Succès", "Chantier mis à jour. Les prochains trajets utiliseront la nouvelle adresse.");
        return;
    }
    const fmt = (key) => new Date(`${key}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    const first = days[days.length - 1].dayKey, last = days[0].dayKey;
    const period = first === last ? `le ${fmt(first)}` : `du ${fmt(first)} au ${fmt(last)}`;
    const label = days.length === 1 ? '1 journée' : `${days.length} journées`;
    const ok = await showConfirmationModal("Recalculer les kilomètres ?",
        `Chantier mis à jour. ${days.length === 1 ? `Les trajets d'une journée (${period}) utilisent` : `Les trajets de ${label} (${period}) utilisent`} encore l'ancienne adresse. Recalculer leurs kilomètres avec la nouvelle adresse ?`);
    if (!ok) return;

    if (!navigator.onLine) {
        showInfoModal("Hors ligne", "Pas de connexion : le recalcul n'a pas pu être lancé.");
        return;
    }
    showToast(`Recalcul des km de ${label}…`);
    let done = 0, failed = 0;
    for (const { uid, dayKey } of days) {
        if (await rebuildDayTrips(uid, dayKey)) done++; else failed++;
    }
    showInfoModal(failed ? "Recalcul terminé avec des erreurs" : "Kilomètres recalculés",
        failed ? `${done} journée(s) recalculée(s), ${failed} en échec (vérifiez les adresses des autres chantiers de ces journées).`
               : `${done === 1 ? 'La journée a été recalculée' : `Les ${done} journées ont été recalculées`} avec la nouvelle adresse.`);
}

// Seuils du contrôle des adresses
const FAR_KM = 100;          // plus loin que ça du dépôt : adresse sûrement fausse
const GPS_GAP_KM = 2;        // écart toléré entre la position enregistrée et la position trouvée
const PRECISE_TYPES = ['address', 'poi'];

async function checkAddresses() {
    const modal = document.getElementById('addressCheckModal');
    const list = document.getElementById('addressCheckList');
    modal.classList.remove('hidden');
    if (!navigator.onLine) {
        list.innerHTML = '<p class="hours-empty">Pas de connexion : impossible de vérifier les adresses.</p>';
        return;
    }
    const chantiers = chantiersCache.filter(c => c.status === 'active');
    list.innerHTML = `<p id="addressCheckProgress" class="text-sm" style="color: var(--color-text-muted);">Vérification de ${chantiers.length} chantier(s)…</p>`;

    let depot = null;
    try { depot = (await geocodeDetails(DEPOT_ADDRESS))?.center || null; } catch (e) { console.error(e); }

    const results = [];
    for (const [i, c] of chantiers.entries()) {
        const progress = document.getElementById('addressCheckProgress');
        if (progress) progress.textContent = `Vérification… ${i + 1} / ${chantiers.length}`;
        const r = { chantier: c, issues: [], km: null, found: '' };
        if (!c.address) {
            r.issues.push({ level: 'danger', text: 'Aucune adresse : pas de kilomètres possibles' });
        } else {
            let geo = null;
            try { geo = await geocodeDetails(c.address); } catch (e) { console.error(e); }
            if (!geo) {
                r.issues.push({ level: 'danger', text: 'Adresse introuvable sur la carte' });
            } else {
                r.found = geo.placeName;
                if (depot) r.km = crowDistanceKm(depot, geo.center);
                if (r.km !== null && r.km > FAR_KM) r.issues.push({ level: 'danger', text: `À plus de ${FAR_KM} km du dépôt` });
                if (!PRECISE_TYPES.includes(geo.placeType)) r.issues.push({ level: 'warning', text: 'Adresse imprécise : seule la commune ou la région a été trouvée' });
                const saved = c.coordinates?.lat ? [c.coordinates.lng, c.coordinates.lat] : null;
                if (saved && crowDistanceKm(saved, geo.center) > GPS_GAP_KM) r.issues.push({ level: 'warning', text: 'La position GPS enregistrée ne correspond pas à l\'adresse (réenregistrez le chantier)' });
            }
        }
        results.push(r);
    }
    if (!list.isConnected) return;

    const rank = (r) => r.issues.some(x => x.level === 'danger') ? 0 : r.issues.length ? 1 : 2;
    results.sort((a, b) => rank(a) - rank(b) || (b.km ?? 0) - (a.km ?? 0));
    const problems = results.filter(r => r.issues.length).length;

    list.innerHTML = `
        <p class="address-check-summary ${problems ? 'is-warn' : 'is-ok'}">${problems
            ? `${problems} chantier${problems > 1 ? 's' : ''} à vérifier sur ${results.length}.`
            : `Les ${results.length} adresses ont été trouvées, toutes à moins de ${FAR_KM} km du dépôt.`}</p>
        ${results.map((r, i) => `
            <div class="address-check-row${r.issues.some(x => x.level === 'danger') ? ' is-danger' : r.issues.length ? ' is-warning' : ''}">
                <div class="min-w-0" style="flex: 1;">
                    <p class="address-check-name">${escapeHTML(r.chantier.name)}</p>
                    <p class="address-check-line">${r.chantier.address ? escapeHTML(r.chantier.address) : '<em>Adresse non renseignée</em>'}</p>
                    ${r.found && r.found !== r.chantier.address ? `<p class="address-check-line">Trouvée sur la carte : ${escapeHTML(r.found)}</p>` : ''}
                    ${r.issues.map(x => `<p class="address-check-issue is-${x.level}">${escapeHTML(x.text)}</p>`).join('')}
                </div>
                <div class="address-check-side">
                    ${r.km !== null ? `<span class="address-check-km">${r.km < 10 ? r.km.toFixed(1) : Math.round(r.km)} km</span>` : ''}
                    <button type="button" class="icon-btn" data-check-edit="${i}" title="Modifier le chantier" aria-label="Modifier ${escapeHTML(r.chantier.name)}">${icon.edit}</button>
                </div>
            </div>`).join('')}
    `;
    list.querySelectorAll('[data-check-edit]').forEach(btn => btn.onclick = () => {
        modal.classList.add('hidden');
        openChantierForm(results[Number(btn.dataset.checkEdit)].chantier);
    });
}

function setupEventListeners() {
    document.getElementById('openAddChantierBtn').onclick = () => openChantierForm(null);
    document.getElementById('checkAddressesBtn').onclick = checkAddresses;
    document.getElementById('closeAddressCheckBtn').onclick = () => document.getElementById('addressCheckModal').classList.add('hidden');
    document.getElementById('chantierForm').onsubmit = saveChantier;
    document.getElementById('cancelChantierFormBtn').onclick = closeChantierForm;
    document.getElementById('closeDetailsBtn').onclick = () => document.getElementById('detailsModal').classList.add('hidden');

    document.getElementById('chantierSearchInput').addEventListener('input', displayChantiers);
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = () => {
            currentTab = btn.dataset.tab;
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('is-active', b === btn));
            displayChantiers();
        };
    });

    // Résumé des horaires recalculé à chaque saisie
    ['formFixed', 'formWindowStart', 'formWindowEnd', 'formHours'].forEach(id => {
        document.getElementById(id).addEventListener('input', () => renderConstraintBox(document.getElementById('formTimeSummary'), readFormValues()));
    });
    document.querySelectorAll('[data-clear]').forEach(btn => {
        btn.onclick = () => {
            document.getElementById(btn.dataset.clear).value = '';
            renderConstraintBox(document.getElementById('formTimeSummary'), readFormValues());
        };
    });
    document.getElementById('formAddress').addEventListener('input', updateGeoStatus);

    const codeInput = document.getElementById('formNewCode');
    const addCode = () => {
        const text = codeInput.value.trim();
        if (!text) return;
        addCodeToList(text);
        codeInput.value = '';
        codeInput.focus();
    };
    document.getElementById('formAddCodeBtn').onclick = addCode;
    codeInput.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); addCode(); } };
}

function showDetailsModal(chantier) {
    document.getElementById('modalChantierName').textContent = chantier.name;
    document.getElementById('modalChantierChips').innerHTML = chipsHTML(chantier);

    const timeContainer = document.getElementById('modalTimeConstraints');
    renderConstraintBox(timeContainer, chantier);
    if (chantier.isHideable) {
        timeContainer.classList.remove('hidden');
        timeContainer.insertAdjacentHTML('beforeend', `<p><strong>Hors forfait :</strong> ce chantier n'apparaîtra pas sur le PDF de pointage si le mode discret est activé.</p>`);
    }

    const addrContainer = document.getElementById('modalChantierAddressContainer');
    const addr = document.getElementById('modalChantierAddress');
    if (chantier.address) {
        addr.textContent = chantier.address;
        addr.href = getGoogleMapsUrl(chantier.address);
        addrContainer.style.display = 'block';
    } else { addrContainer.style.display = 'none'; }

    const mailContainer = document.getElementById('modalChantierEmailContainer');
    if (isValidEmail(chantier.email)) {
        document.getElementById('modalChantierEmail').textContent = chantier.email;
        document.getElementById('modalChantierEmailBtn').innerHTML = mailButtonHTML(chantier);
        mailContainer.style.display = 'block';
    } else { mailContainer.style.display = 'none'; }

    const keybox = document.getElementById('modalChantierKeybox');
    keybox.innerHTML = '';
    if (Array.isArray(chantier.keyboxCodes) && chantier.keyboxCodes.length > 0) {
        const ul = document.createElement('ul');
        ul.className = 'code-chips';
        chantier.keyboxCodes.forEach(code => {
            const li = document.createElement('li');
            li.innerHTML = `<span class="code-chip" style="cursor: default;"></span>`;
            li.firstChild.textContent = code;
            ul.appendChild(li);
        });
        keybox.appendChild(ul);
    } else { keybox.textContent = "Non spécifié"; }

    document.getElementById('modalChantierInfo').textContent = chantier.additionalInfo || "Aucune";
    document.getElementById('editChantierBtn').onclick = () => openChantierForm(chantier);
    document.getElementById('detailsModal').classList.remove('hidden');
}
