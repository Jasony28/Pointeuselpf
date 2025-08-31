import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent, isAdmin, showInfoModal } from "../app.js";
import { getGoogleMapsUrl } from "./utils.js";
import { getActiveChantiers } from "./data-service.js"; // <-- NOUVEAU

let chantiersCache = [];

export async function render() {
    pageContent.innerHTML = `
        <div class="max-w-4xl mx-auto">
            <h2 class="text-2xl font-bold mb-4">📄 Liste des Chantiers Actifs</h2>
            <div id="chantiers-list" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"></div>
        </div>
        
        <div id="detailsModal" class="hidden fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-20 p-4">
            <div class="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg space-y-4 relative">
                <button id="closeDetailsBtn" class="absolute top-2 right-3 text-2xl font-bold text-gray-500 hover:text-gray-800">×</button>
                <h3 id="modalChantierName" class="text-2xl font-bold border-b pb-2"></h3>
                <div><h4 class="font-semibold text-sm text-gray-500">ADRESSE</h4><a id="modalChantierAddress" href="#" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:underline text-lg"></a></div>
                <div><h4 class="font-semibold text-sm text-gray-500">CODES & ACCÈS</h4><div id="modalChantierKeybox" class="text-lg"></div></div>
                <div><h4 class="font-semibold text-sm text-gray-500">INFOS SUPPLÉMENTAIRES</h4><p id="modalChantierInfo" class="text-lg" style="white-space: pre-wrap; overflow-wrap: break-word;"></p></div>
                ${isAdmin ? `<div class="text-right pt-4 border-t"><button id="editChantierBtn" class="bg-purple-600 hover:bg-purple-700 text-white font-bold px-5 py-2 rounded">Modifier</button></div>` : ''}
            </div>
        </div>

        <div id="editModal" class="hidden fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-30 p-4 overflow-y-auto">
            <form id="editForm" class="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg space-y-4 mt-auto mb-auto">
                <h3 class="text-2xl font-bold">Modifier le chantier</h3>
                <input type="hidden" id="editChantierId">
                <div><label for="editChantierName" class="text-sm font-medium">Nom</label><input id="editChantierName" type="text" class="w-full border p-2 rounded mt-1" required /></div>
                <div><label for="editChantierAddress" class="text-sm font-medium">Adresse</label><input id="editChantierAddress" type="text" class="w-full border p-2 rounded mt-1" /></div>
                <div>
                    <label class="text-sm font-medium">Codes</label>
                    <div class="flex items-center gap-2 mt-1">
                        <input id="editNewKeyCodeInput" type="text" placeholder="Entrez un code" class="flex-grow border p-2 rounded" />
                        <button type="button" id="editAddKeyCodeBtn" class="bg-green-500 hover:bg-green-600 text-white font-bold px-4 py-2 rounded">Ajouter</button>
                    </div>
                    <ul id="editKeyCodesList" class="mt-2 space-y-1"></ul>
                </div>
                <div><label for="editChantierInfo" class="text-sm font-medium">Infos</label><textarea id="editChantierInfo" class="w-full border p-2 rounded mt-1"></textarea></div>
                <div class="flex justify-end gap-4 pt-4">
                    <button type="button" id="cancelEditBtn" class="bg-gray-300 hover:bg-gray-400 px-4 py-2 rounded">Annuler</button>
                    <button type="submit" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded">Enregistrer</button>
                </div>
            </form>
        </div>
    `;

    setTimeout(() => {
        loadChantiersList();
        setupEventListeners();
    }, 0);
}

async function loadChantiersList() {
    const listContainer = document.getElementById('chantiers-list');
    listContainer.innerHTML = '<p class="col-span-full text-center">Chargement...</p>';

    try {
        // La logique de requête complexe est remplacée par un simple appel
        chantiersCache = await getActiveChantiers(); // <-- MODIFIÉ
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
        listContainer.innerHTML = '<p class="col-span-full text-center text-gray-500">Aucun chantier actif trouvé.</p>';
        return;
    }
    chantiersCache.forEach(chantier => {
        const card = document.createElement('div');
        card.className = 'bg-white p-4 rounded-lg shadow-sm cursor-pointer hover:shadow-md hover:scale-105 transition-transform';
        card.innerHTML = `<h3 class="font-bold text-lg truncate">${chantier.name}</h3>`;
        card.onclick = () => showDetailsModal(chantier.id);
        listContainer.appendChild(card);
    });
}

function showDetailsModal(chantierId) {
    const chantier = chantiersCache.find(c => c.id === chantierId);
    if (!chantier) return;

    document.getElementById('modalChantierName').textContent = chantier.name;
    const addressLink = document.getElementById('modalChantierAddress');
    if (chantier.address) {
        addressLink.textContent = chantier.address;
        addressLink.href = getGoogleMapsUrl(chantier.address);
        addressLink.parentElement.style.display = 'block';
    } else {
        addressLink.parentElement.style.display = 'none';
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
        document.getElementById('editChantierBtn').onclick = () => showEditModal(chantier);
    }
    document.getElementById('detailsModal').classList.remove('hidden');
}

function showEditModal(chantier) {
    document.getElementById('detailsModal').classList.add('hidden');
    document.getElementById('editChantierId').value = chantier.id;
    document.getElementById('editChantierName').value = chantier.name;
    document.getElementById('editChantierAddress').value = chantier.address || '';
    document.getElementById('editChantierInfo').value = chantier.additionalInfo || '';
    const editList = document.getElementById('editKeyCodesList');
    editList.innerHTML = '';
    if (Array.isArray(chantier.keyboxCodes)) {
        chantier.keyboxCodes.forEach(codeText => {
            const li = document.createElement('li');
            li.className = 'flex items-center justify-between bg-gray-100 p-2 rounded';
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
    const addCode = () => {
        const codeText = newKeyCodeInput.value.trim();
        if (codeText) {
            const list = document.getElementById(listId);
            const li = document.createElement('li');
            li.className = 'flex items-center justify-between bg-gray-100 p-2 rounded';
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
    document.getElementById('closeDetailsBtn').onclick = () => document.getElementById('detailsModal').classList.add('hidden');
    if (isAdmin) {
        document.getElementById('cancelEditBtn').onclick = () => document.getElementById('editModal').classList.add('hidden');
        setupKeyCodeHandlers('editNewKeyCodeInput', 'editAddKeyCodeBtn', 'editKeyCodesList');
        document.getElementById('editForm').onsubmit = async (e) => {
            e.preventDefault();
            const chantierId = document.getElementById('editChantierId').value;
            const docRef = doc(db, "chantiers", chantierId);
            const editList = document.getElementById("editKeyCodesList");
            const keyboxCodes = Array.from(editList.querySelectorAll('li span')).map(span => span.textContent);
            const updatedData = {
                name: document.getElementById('editChantierName').value,
                address: document.getElementById('editChantierAddress').value,
                keyboxCodes: keyboxCodes,
                additionalInfo: document.getElementById('editChantierInfo').value
            };
            try {
                await updateDoc(docRef, updatedData);
                document.getElementById('editModal').classList.add('hidden');
                // Force le rafraîchissement du cache au prochain chargement
                await getActiveChantiers(true); // <-- MODIFIÉ
                showInfoModal("Succès", "Chantier mis à jour.");
                loadChantiersList();
            } catch(error) {
                console.error("Erreur de mise à jour: ", error);
                showInfoModal("Erreur", "La mise à jour a échoué.");
            }
        };
    }
}