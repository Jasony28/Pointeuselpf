import { doc, updateDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent, isAdmin, showInfoModal, showToast, currentUser } from "../app.js";
import { getActiveChantiers } from "./data-service.js";
import { getWeekDateRange } from "./utils.js";
import { isValidEmail, mailButtonHTML } from "./mail.js";

let chantiersCache = [];
let myPlanning = { today: new Set(), week: new Set() }; // noms des chantiers où je suis planifié

const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function render() {
    pageContent.innerHTML = `
        <div class="max-w-4xl mx-auto space-y-4">
            <div>
                <h2 class="text-2xl font-bold">Liste des Chantiers Actifs</h2>
                <p class="mt-1 text-sm" style="color: var(--color-text-muted);">Adresses, codes d'accès et consignes de chaque chantier.</p>
            </div>
            <div class="hours-search">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
                <input type="search" id="chantier-search-input" placeholder="Rechercher un chantier ou une adresse…" autocomplete="off">
            </div>
            <div id="chantiers-list" class="space-y-5"></div>
        </div>
        
        <div id="detailsModal" class="hidden fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-20 p-4">
            <div class="p-6 rounded-lg shadow-xl w-full max-w-lg space-y-4 relative" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                <button id="closeDetailsBtn" class="absolute top-2 right-3 text-2xl font-bold" style="color: var(--color-text-muted);">×</button>
                <div class="border-b pb-2 flex items-center gap-2" style="border-color: var(--color-border);">
                    <h3 id="modalChantierName" class="text-2xl font-bold"></h3>
                    <span id="modalTvaBadge" class="hidden text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-bold">TVA</span>
                </div>
                <div>
                    <h4 class="font-semibold text-sm" style="color: var(--color-text-muted);">ADRESSE</h4>
                    <p id="modalChantierAddress" class="site-address-link text-lg cursor-pointer" style="color: var(--color-primary);"></p>
                </div>
                <div id="modalChantierEmailContainer" style="display: none;">
                    <h4 class="font-semibold text-sm" style="color: var(--color-text-muted);">E-MAIL DU CLIENT</h4>
                    <div class="mail-row"><span id="modalChantierEmail" class="mail-address"></span><span id="modalChantierEmailBtn"></span></div>
                </div>
                <div><h4 class="font-semibold text-sm" style="color: var(--color-text-muted);">HEURES PRÉVUES</h4><p id="modalChantierHours" class="text-lg"></p></div>
                <div><h4 class="font-semibold text-sm" style="color: var(--color-text-muted);">CODES & ACCÈS</h4><div id="modalChantierKeybox" class="text-lg"></div></div>
                <div><h4 class="font-semibold text-sm" style="color: var(--color-text-muted);">INFOS SUPPLÉMENTAIRES</h4><p id="modalChantierInfo" class="text-lg" style="white-space: pre-wrap; overflow-wrap: break-word;"></p></div>
                ${isAdmin ? `<div class="text-right pt-4 border-t" style="border-color: var(--color-border);"><button id="editChantierBtn" class="text-white font-bold px-5 py-2 rounded" style="background-color: var(--color-primary);">Modifier</button></div>` : ''}
            </div>
        </div>

        <div id="editModal" class="hidden fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-30 p-4 overflow-y-auto">
            <form id="editForm" class="p-6 rounded-lg shadow-xl w-full max-w-lg space-y-4 mt-auto mb-auto" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                <h3 class="text-2xl font-bold">Modifier le chantier</h3>
                <input type="hidden" id="editChantierId">
                <div><label for="editChantierName" class="text-sm font-medium">Nom</label><input id="editChantierName" type="text" class="w-full border p-2 rounded mt-1" style="background-color: var(--color-background); border-color: var(--color-border);" required /></div>
                <div class="flex items-center gap-2">
                    <input type="checkbox" id="editChantierTva" class="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500">
                    <label for="editChantierTva" class="text-sm font-medium">Assujetti TVA</label>
                </div>
                <div><label for="editChantierAddress" class="text-sm font-medium">Adresse</label><input id="editChantierAddress" type="text" class="w-full border p-2 rounded mt-1" style="background-color: var(--color-background); border-color: var(--color-border);" /></div>
                <div><label for="editChantierEmail" class="text-sm font-medium">E-mail du client</label><input id="editChantierEmail" type="email" inputmode="email" autocapitalize="off" spellcheck="false" placeholder="ex : client@gmail.com" class="w-full border p-2 rounded mt-1" style="background-color: var(--color-background); border-color: var(--color-border);" /></div>
                <div>
                    <label class="text-sm font-medium">Codes</label>
                    <div class="flex items-center gap-2 mt-1">
                        <input id="editNewKeyCodeInput" type="text" placeholder="Entrez un code" class="flex-grow border p-2 rounded" style="background-color: var(--color-background); border-color: var(--color-border);" />
                        <button type="button" id="editAddKeyCodeBtn" class="bg-green-500 hover:bg-green-600 text-white font-bold px-4 py-2 rounded">Ajouter</button>
                    </div>
                    <ul id="editKeyCodesList" class="mt-2 space-y-1"></ul>
                </div>
                <div><label for="editChantierInfo" class="text-sm font-medium">Infos</label><textarea id="editChantierInfo" class="w-full border p-2 rounded mt-1" style="background-color: var(--color-background); border-color: var(--color-border);"></textarea></div>
                <div class="flex justify-end gap-4 pt-4">
                    <button type="button" id="cancelEditBtn" class="px-4 py-2 rounded" style="background-color: var(--color-background); border: 1px solid var(--color-border);">Annuler</button>
                    <button type="submit" class="text-white px-4 py-2 rounded" style="background-color: var(--color-primary);">Enregistrer</button>
                </div>
            </form>
        </div>
        
        <div id="navigationModal" class="hidden fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-40 p-4">
            <div class="p-6 rounded-lg shadow-xl w-full max-w-xs text-center" style="background-color: var(--color-surface);">
                <h3 class="text-xl font-bold mb-5">Ouvrir l'itinéraire</h3>
                <div class="space-y-3">
                    <a id="navGoogleMaps" href="#" target="_blank" rel="noopener noreferrer" class="block w-full text-white font-semibold py-3 px-4 rounded-lg" style="background-color: #4285F4;">Google Maps</a>
                    <a id="navWaze" href="#" target="_blank" rel="noopener noreferrer" class="block w-full text-white font-semibold py-3 px-4 rounded-lg" style="background-color: #33CCFF;">Waze</a>
                </div>
                <button id="closeNavModalBtn" class="mt-6 w-full font-semibold py-2 px-4 rounded-lg" style="background-color: var(--color-background); border: 1px solid var(--color-border);">Annuler</button>
            </div>
        </div>
    `;

    setTimeout(() => {
        loadChantiersList();
        setupEventListeners();
    }, 0);
}

async function loadChantiersList() {
    const listContainer = document.getElementById('chantiers-list');
    listContainer.innerHTML = `<div class="site-grid">${'<div class="site-card is-loading"></div>'.repeat(4)}</div>`;
    try {
        const [chantiers] = await Promise.all([getActiveChantiers(), loadMyPlanning()]);
        chantiersCache = chantiers;
        displayChantierCards();
    } catch (error) {
        console.error("Erreur de chargement des chantiers :", error);
        listContainer.innerHTML = '<p class="hours-empty">Erreur de chargement des chantiers.</p>';
    }
}

// Chantiers où l'utilisateur est planifié aujourd'hui / cette semaine (affichés en premier)
async function loadMyPlanning() {
    myPlanning = { today: new Set(), week: new Set() };
    if (!currentUser) return;
    try {
        const { startOfWeek, endOfWeek } = getWeekDateRange(0);
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
        const snapshot = await getDocs(query(collection(db, "planning"),
            where("date", ">=", startOfWeek.toISOString().split('T')[0]),
            where("date", "<=", endOfWeek.toISOString().split('T')[0])));
        snapshot.forEach(d => {
            const task = d.data();
            if (!(task.teamNames || []).includes(currentUser.displayName)) return;
            myPlanning.week.add(task.chantierName);
            if (task.date === todayStr) myPlanning.today.add(task.chantierName);
        });
    } catch (error) {
        console.error("Planning indisponible pour le tri des chantiers :", error);
    }
}

function createChantierCard(chantier) {
    const card = document.createElement('div');
    card.className = 'site-card';
    card.setAttribute('role', 'button');
    card.tabIndex = 0;

    const codesCount = Array.isArray(chantier.keyboxCodes) ? chantier.keyboxCodes.length : 0;
    const badge = myPlanning.today.has(chantier.name)
        ? '<span class="site-badge is-today">Aujourd\'hui</span>'
        : myPlanning.week.has(chantier.name) ? '<span class="site-badge">Cette semaine</span>' : '';

    card.innerHTML = `
        <div class="site-card-head">
            <h3 class="site-card-name">${escapeHTML(chantier.name)}${chantier.isTva ? '<span class="site-tva">TVA</span>' : ''}</h3>
            ${badge}
        </div>
        <p class="site-card-address">${chantier.address ? escapeHTML(chantier.address) : '<em>Adresse non renseignée</em>'}</p>
        <div class="site-card-foot">
            <span class="site-card-meta">
                ${chantier.totalHeuresPrevues > 0 ? `<span>${chantier.totalHeuresPrevues} h prévues</span>` : ''}
                ${codesCount ? `<span>${codesCount} code${codesCount > 1 ? 's' : ''}</span>` : ''}
                ${chantier.additionalInfo ? '<span>Consignes</span>' : ''}
            </span>
            ${chantier.address ? `<button type="button" class="site-nav-btn" data-nav>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 11 19-9-9 19-2-8-8-2z"/></svg>Itinéraire</button>` : ''}
        </div>`;

    card.onclick = (e) => {
        if (e.target.closest('[data-nav]')) { showNavigationChoice(chantier.address); return; }
        showDetailsModal(chantier.id);
    };
    card.onkeydown = (e) => { if (e.key === 'Enter') showDetailsModal(chantier.id); };
    return card;
}

function displayChantierCards() {
    const listContainer = document.getElementById('chantiers-list');
    if (!listContainer) return;
    listContainer.innerHTML = '';
    if (chantiersCache.length === 0) {
        listContainer.innerHTML = `<p class="hours-empty">Aucun chantier actif trouvé.</p>`;
        return;
    }

    const searchTerm = (document.getElementById('chantier-search-input')?.value || '').toLowerCase().trim();
    const matches = chantiersCache.filter(c =>
        c.name.toLowerCase().includes(searchTerm) || (c.address || '').toLowerCase().includes(searchTerm)
    );
    if (matches.length === 0) {
        listContainer.innerHTML = `<p class="hours-empty">Aucun chantier ne correspond à votre recherche.</p>`;
        return;
    }

    // Mes chantiers de la semaine (aujourd'hui d'abord), puis tous les autres
    const mine = matches.filter(c => myPlanning.week.has(c.name))
        .sort((a, b) => myPlanning.today.has(b.name) - myPlanning.today.has(a.name));
    const others = matches.filter(c => !myPlanning.week.has(c.name));

    const addSection = (title, list) => {
        if (!list.length) return;
        const section = document.createElement('section');
        section.innerHTML = `<h3 class="kpi-label mb-2">${title} · ${list.length}</h3>`;
        const grid = document.createElement('div');
        grid.className = 'site-grid';
        list.forEach(chantier => grid.appendChild(createChantierCard(chantier)));
        section.appendChild(grid);
        listContainer.appendChild(section);
    };
    addSection('Mes chantiers cette semaine', mine);
    addSection(mine.length ? 'Tous les autres chantiers' : 'Tous les chantiers', others);
}

function showDetailsModal(chantierId) {
    const chantier = chantiersCache.find(c => c.id === chantierId);
    if (!chantier) return;

    document.getElementById('modalChantierName').textContent = chantier.name;
    const badge = document.getElementById('modalTvaBadge');
    if (badge) {
        if (chantier.isTva) badge.classList.remove('hidden');
        else badge.classList.add('hidden');
    }
    
    const addressTrigger = document.getElementById('modalChantierAddress');
    if (chantier.address) {
        addressTrigger.textContent = chantier.address;
        addressTrigger.onclick = () => showNavigationChoice(chantier.address);
        addressTrigger.parentElement.style.display = 'block';
    } else {
        addressTrigger.parentElement.style.display = 'none';
    }
    
    const mailContainer = document.getElementById('modalChantierEmailContainer');
    if (mailContainer) {
        if (isValidEmail(chantier.email)) {
            document.getElementById('modalChantierEmail').textContent = chantier.email;
            document.getElementById('modalChantierEmailBtn').innerHTML = mailButtonHTML(chantier);
            mailContainer.style.display = 'block';
        } else { mailContainer.style.display = 'none'; }
    }

    const hoursP = document.getElementById('modalChantierHours');
    if (chantier.totalHeuresPrevues && chantier.totalHeuresPrevues > 0) {
        hoursP.textContent = `${chantier.totalHeuresPrevues} heures`;
        hoursP.parentElement.style.display = 'block';
    } else {
        hoursP.parentElement.style.display = 'none';
    }

    const keyboxContainer = document.getElementById('modalChantierKeybox');
    keyboxContainer.innerHTML = '';
    if (Array.isArray(chantier.keyboxCodes) && chantier.keyboxCodes.length > 0) {
        // Chaque code est une pastille : un appui le copie dans le presse-papiers
        const ul = document.createElement('ul');
        ul.className = 'code-chips';
        chantier.keyboxCodes.forEach(code => {
            const li = document.createElement('li');
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'code-chip';
            chip.title = 'Copier';
            chip.innerHTML = `<span></span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
            chip.querySelector('span').textContent = code;
            chip.onclick = async () => {
                try {
                    await navigator.clipboard.writeText(code);
                    showToast(`Code copié : ${code}`, 'success');
                } catch {
                    showToast(code, 'info');
                }
            };
            li.appendChild(chip);
            ul.appendChild(li);
        });
        keyboxContainer.appendChild(ul);
    } else {
        keyboxContainer.textContent = "Non spécifié";
    }
    document.getElementById('modalChantierInfo').textContent = chantier.additionalInfo || "Aucune";
    if (isAdmin) {
        const editBtn = document.getElementById('editChantierBtn');
        if(editBtn) editBtn.onclick = () => showEditModal(chantier);
    }
    document.getElementById('detailsModal').classList.remove('hidden');
}

function showNavigationChoice(address) {
    const encodedAddress = encodeURIComponent(address);
    const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodedAddress}`;
    const wazeUrl = `https://waze.com/ul?q=${encodedAddress}&navigate=yes`;

    document.getElementById('navGoogleMaps').href = mapsUrl;
    document.getElementById('navWaze').href = wazeUrl;

    document.getElementById('navigationModal').classList.remove('hidden');
}

function showEditModal(chantier) {
    document.getElementById('detailsModal').classList.add('hidden');
    document.getElementById('editChantierId').value = chantier.id;
    document.getElementById('editChantierName').value = chantier.name;
    document.getElementById('editChantierTva').checked = chantier.isTva || false;
    document.getElementById('editChantierAddress').value = chantier.address || '';
    document.getElementById('editChantierEmail').value = chantier.email || '';
    document.getElementById('editChantierInfo').value = chantier.additionalInfo || '';
    const editList = document.getElementById('editKeyCodesList');
    editList.innerHTML = '';
    if (Array.isArray(chantier.keyboxCodes)) {
        chantier.keyboxCodes.forEach(codeText => {
            const li = document.createElement('li');
            li.className = 'flex items-center justify-between p-2 rounded';
            li.style.backgroundColor = 'var(--color-background)';
            li.innerHTML = `<span>${codeText}</span><button type="button" class="icon-btn is-danger" aria-label="Retirer ce code"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true" style="pointer-events: none;"><path d="M18 6 6 18M6 6l12 12"/></svg></button>`;
            li.querySelector('button').onclick = () => li.remove();
            editList.appendChild(li);
        });
    }
    document.getElementById('editModal').classList.remove('hidden');
}

function setupKeyCodeHandlers(inputId, addButtonId, listId) {
    const newKeyCodeInput = document.getElementById(inputId);
    const addKeyCodeBtn = document.getElementById(addButtonId);
    if (!newKeyCodeInput || !addKeyCodeBtn) return;
    
    const addCode = () => {
        const codeText = newKeyCodeInput.value.trim();
        if (codeText) {
            const list = document.getElementById(listId);
            const li = document.createElement('li');
            li.className = 'flex items-center justify-between p-2 rounded';
            li.style.backgroundColor = 'var(--color-background)';
            li.innerHTML = `<span>${codeText}</span><button type="button" class="icon-btn is-danger" aria-label="Retirer ce code"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true" style="pointer-events: none;"><path d="M18 6 6 18M6 6l12 12"/></svg></button>`;
            li.querySelector('button').onclick = () => li.remove();
            list.appendChild(li);
            newKeyCodeInput.value = '';
            newKeyCodeInput.focus();
        }
    };
    addKeyCodeBtn.onclick = addCode;
    newKeyCodeInput.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); addCode(); } };
}

function setupEventListeners() {
    const searchInput = document.getElementById('chantier-search-input');
    if (searchInput) searchInput.addEventListener('input', displayChantierCards);

    const closeBtn = document.getElementById('closeDetailsBtn');
    if(closeBtn) closeBtn.onclick = () => document.getElementById('detailsModal').classList.add('hidden');
    
    const navModal = document.getElementById('navigationModal');
    const closeNavModalBtn = document.getElementById('closeNavModalBtn');
    if(navModal && closeNavModalBtn) {
        closeNavModalBtn.onclick = () => navModal.classList.add('hidden');
        navModal.querySelectorAll('a').forEach(a => a.addEventListener('click', () => navModal.classList.add('hidden')));
    }
    
    if (isAdmin) {
        const cancelEditBtn = document.getElementById('cancelEditBtn');
        if (cancelEditBtn) cancelEditBtn.onclick = () => document.getElementById('editModal').classList.add('hidden');
        
        setupKeyCodeHandlers('editNewKeyCodeInput', 'editAddKeyCodeBtn', 'editKeyCodesList');
        
        const editForm = document.getElementById('editForm');
        if (editForm) {
            editForm.onsubmit = async (e) => {
                e.preventDefault();
                const chantierId = document.getElementById('editChantierId').value;
                const docRef = doc(db, "chantiers", chantierId);
                const editList = document.getElementById("editKeyCodesList");
                const keyboxCodes = Array.from(editList.querySelectorAll('li span')).map(span => span.textContent);
                const emailValue = document.getElementById('editChantierEmail').value.trim();
                if (emailValue && !isValidEmail(emailValue)) { showInfoModal("Attention", "L'adresse e-mail n'est pas valide (ex : client@gmail.com)."); return; }
                const updatedData = {
                    name: document.getElementById('editChantierName').value,
                    isTva: document.getElementById('editChantierTva').checked,
                    address: document.getElementById('editChantierAddress').value,
                    email: document.getElementById('editChantierEmail').value.trim().toLowerCase(),
                    keyboxCodes: keyboxCodes,
                    additionalInfo: document.getElementById('editChantierInfo').value
                };
                try {
                    await updateDoc(docRef, updatedData);
                    document.getElementById('editModal').classList.add('hidden');
                    await getActiveChantiers(true);
                    showInfoModal("Succès", "Chantier mis à jour.");
                    loadChantiersList();
                } catch(error) {
                    console.error("Erreur de mise à jour: ", error);
                    showInfoModal("Erreur", "La mise à jour a échoué.");
                }
            };
        }
    }
}