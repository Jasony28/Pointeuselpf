import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent, isAdmin, showInfoModal } from "../app.js";
import { getActiveChantiers } from "./data-service.js";

let chantiersCache = [];

export async function render() {
    pageContent.innerHTML = `
        <div class="max-w-4xl mx-auto">
            <h2 class="text-2xl font-bold mb-4">📄 Liste des Chantiers Actifs</h2>
            <div id="chantiers-list" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"></div>
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
                    <p id="modalChantierAddress" class="hover:underline text-lg cursor-pointer" style="color: var(--color-primary);"></p>
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
    listContainer.innerHTML = `<p class="col-span-full text-center" style="color: var(--color-text-muted);">Chargement...</p>`;
    try {
        chantiersCache = await getActiveChantiers();
        displayChantierCards();
    } catch (error) {
        console.error("Erreur de chargement des chantiers :", error);
        listContainer.innerHTML = '<p class="col-span-full text-center text-red-500">Erreur de chargement des chantiers.</p>';
    }
}

function displayChantierCards() {
    const listContainer = document.getElementById('chantiers-list');
    listContainer.innerHTML = '';
    if (chantiersCache.length === 0) {
        listContainer.innerHTML = `<p class="col-span-full text-center" style="color: var(--color-text-muted);">Aucun chantier actif trouvé.</p>`;
        return;
    }
    chantiersCache.forEach(chantier => {
        const card = document.createElement('div');
        card.className = 'p-4 rounded-lg shadow-sm cursor-pointer hover:shadow-md transition-shadow';
        card.style.backgroundColor = 'var(--color-surface)';
        card.style.border = '1px solid var(--color-border)';
        
        const tvaBadge = chantier.isTva ? `<span class="ml-2 text-[9px] bg-blue-100 text-blue-800 px-1 rounded font-bold align-middle">TVA</span>` : '';
        card.innerHTML = `<h3 class="font-bold text-lg truncate flex items-center">${chantier.name}${tvaBadge}</h3>`;
        
        card.onclick = () => showDetailsModal(chantier.id);
        listContainer.appendChild(card);
    });
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
        const ul = document.createElement('ul');
        ul.className = 'list-disc list-inside';
        chantier.keyboxCodes.forEach(code => {
            const li = document.createElement('li');
            li.textContent = code;
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
    document.getElementById('editChantierInfo').value = chantier.additionalInfo || '';
    const editList = document.getElementById('editKeyCodesList');
    editList.innerHTML = '';
    if (Array.isArray(chantier.keyboxCodes)) {
        chantier.keyboxCodes.forEach(codeText => {
            const li = document.createElement('li');
            li.className = 'flex items-center justify-between p-2 rounded';
            li.style.backgroundColor = 'var(--color-background)';
            li.innerHTML = `<span>${codeText}</span><button type="button" class="text-red-500 hover:text-red-700 font-bold">✖</button>`;
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
            li.innerHTML = `<span>${codeText}</span><button type="button" class="text-red-500 hover:text-red-700 font-bold">✖</button>`;
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
                const updatedData = {
                    name: document.getElementById('editChantierName').value,
                    isTva: document.getElementById('editChantierTva').checked,
                    address: document.getElementById('editChantierAddress').value,
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