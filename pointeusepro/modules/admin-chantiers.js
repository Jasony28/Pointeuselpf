import { collection, query, orderBy, getDocs, addDoc, updateDoc, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent, showInfoModal, showConfirmationModal } from "../app.js";

let chantiersCache = [];

export async function render() {
    pageContent.innerHTML = `
        <div class="max-w-6xl mx-auto">
            <h2 class="text-2xl font-bold mb-4">⚙️ Gestion des Chantiers</h2>
            
            <div class="bg-white p-6 rounded-lg shadow-sm mb-6">
                <form id="addChantierForm" class="space-y-4">
                    <h3 class="text-xl font-semibold">Ajouter un nouveau chantier</h3>
                    <div>
                        <label for="chantierNameInput" class="text-sm font-medium">Nom du chantier</label>
                        <input id="chantierNameInput" type="text" placeholder="Ex: Rénovation Durand" class="w-full border p-2 rounded mt-1" required />
                    </div>
                    <div>
                        <label for="chantierAddressInput" class="text-sm font-medium">Adresse</label>
                        <input id="chantierAddressInput" type="text" placeholder="Ex: 123 Rue de la République" class="w-full border p-2 rounded mt-1" />
                    </div>
                    <div>
                        <label class="text-sm font-medium">Codes boîtiers / Accès</label>
                        <div class="flex items-center gap-2 mt-1">
                            <input id="newKeyCodeInput" type="text" placeholder="Entrez un code ou une info" class="flex-grow border p-2 rounded" />
                            <button type="button" id="addKeyCodeBtn" class="bg-green-500 hover:bg-green-600 text-white font-bold px-4 py-2 rounded">Ajouter</button>
                        </div>
                        <ul id="keyCodesList" class="mt-2 space-y-1"></ul>
                    </div>
                    <div>
                        <label for="chantierInfoInput" class="text-sm font-medium">Informations supplémentaires</label>
                        <textarea id="chantierInfoInput" placeholder="Ex: Contacter M. Smith avant d'arriver." class="w-full border p-2 rounded mt-1"></textarea>
                    </div>
                    <button type="submit" class="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded w-full sm:w-auto">
                        Ajouter le chantier
                    </button>
                </form>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <h3 class="text-xl font-semibold mb-2">Chantiers Actifs</h3>
                    <div id="activeChantiersList" class="space-y-2"></div>
                </div>
                <div>
                    <h3 class="text-xl font-semibold mb-2">Chantiers Archivés</h3>
                    <div id="archivedChantiersList" class="space-y-2"></div>
                </div>
            </div>
        </div>

        <div id="detailsModal" class="hidden fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-20 p-4">
            <div class="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg space-y-4 relative">
                <button id="closeDetailsBtn" class="absolute top-2 right-3 text-2xl font-bold text-gray-500 hover:text-gray-800">×</button>
                <h3 id="modalChantierName" class="text-2xl font-bold border-b pb-2"></h3>
                <div><h4 class="font-semibold text-sm text-gray-500">ADRESSE</h4><a id="modalChantierAddress" href="#" target="_blank" class="text-blue-600 hover:underline text-lg"></a></div>
                <div><h4 class="font-semibold text-sm text-gray-500">CODES & ACCÈS</h4><div id="modalChantierKeybox" class="text-lg"></div></div>
                <div><h4 class="font-semibold text-sm text-gray-500">INFOS SUPPLÉMENTAIRES</h4><p id="modalChantierInfo" class="text-lg whitespace-pre-wrap"></p></div>
                <div class="text-right pt-4 border-t"><button id="editChantierBtn" class="bg-purple-600 hover:bg-purple-700 text-white font-bold px-5 py-2 rounded">Modifier</button></div>
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

    setupEventListeners();
    await loadChantiers();
}

async function loadChantiers() {
    const activeList = document.getElementById("activeChantiersList");
    const archivedList = document.getElementById("archivedChantiersList");
    activeList.innerHTML = "<p>Chargement...</p>";
    archivedList.innerHTML = "<p>Chargement...</p>";

    const q = query(collection(db, "chantiers"), orderBy("name"));
    const querySnapshot = await getDocs(q);
    chantiersCache = querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));

    activeList.innerHTML = "";
    archivedList.innerHTML = "";
    let activeCount = 0, archivedCount = 0;

    chantiersCache.forEach(chantier => {
        const chantierElement = createChantierElement(chantier);
        if (chantier.status === 'active') {
            activeList.appendChild(chantierElement);
            activeCount++;
        } else {
            archivedList.appendChild(chantierElement);
            archivedCount++;
        }
    });

    if (activeCount === 0) activeList.innerHTML = "<p class='text-gray-500'>Aucun chantier actif.</p>";
    if (archivedCount === 0) archivedList.innerHTML = "<p class='text-gray-500'>Aucun chantier archivé.</p>";
}

function createChantierElement(chantier) {
    const div = document.createElement('div');
    div.className = 'p-3 bg-gray-50 border rounded flex justify-between items-center gap-2';
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'font-semibold truncate';
    nameSpan.textContent = chantier.name;
    div.appendChild(nameSpan);

    const buttonsWrapper = document.createElement('div');
    buttonsWrapper.className = 'flex items-center gap-2 flex-shrink-0';

    const detailsBtn = document.createElement('button');
    detailsBtn.textContent = 'Détails';
    detailsBtn.className = 'px-3 py-1 text-sm rounded bg-blue-500 hover:bg-blue-600 text-white';
    detailsBtn.onclick = () => showDetailsModal(chantier.id);
    buttonsWrapper.appendChild(detailsBtn);

    const archiveBtn = document.createElement('button');
    archiveBtn.className = 'px-3 py-1 text-sm rounded';
    if (chantier.status === 'active') {
        archiveBtn.textContent = 'Archiver';
        archiveBtn.className += ' bg-yellow-500 hover:bg-yellow-600 text-white';
        archiveBtn.onclick = () => updateChantierStatus(chantier.id, 'archived');
    } else {
        archiveBtn.textContent = 'Réactiver';
        archiveBtn.className += ' bg-green-500 hover:bg-green-600 text-white';
        archiveBtn.onclick = () => updateChantierStatus(chantier.id, 'active');
    }
    buttonsWrapper.appendChild(archiveBtn);
    
    div.appendChild(buttonsWrapper);
    return div;
}

async function updateChantierStatus(id, newStatus) {
    const confirmed = await showConfirmationModal("Confirmation", `Voulez-vous vraiment ${newStatus === 'active' ? 'réactiver' : 'archiver'} ce chantier ?`);
    if (!confirmed) return;

    const chantierDocRef = doc(db, "chantiers", id);
    try {
        await updateDoc(chantierDocRef, { status: newStatus });
        await loadChantiers();
    } catch (error) {
        console.error("Erreur mise à jour statut:", error);
        showInfoModal("Erreur", "Une erreur est survenue lors de la mise à jour.");
    }
}

function setupKeyCodeHandlers(inputId, addButtonId, listId) {
    const newKeyCodeInput = document.getElementById(inputId);
    const addKeyCodeBtn = document.getElementById(addButtonId);
    const keyCodesList = document.getElementById(listId);

    const addCode = () => {
        const codeText = newKeyCodeInput.value.trim();
        if (codeText) {
            const li = document.createElement('li');
            li.className = 'flex items-center justify-between bg-gray-100 p-2 rounded';
            li.innerHTML = `<span>${codeText}</span><button type="button" class="text-red-500 hover:text-red-700 font-bold">✖</button>`;
            li.querySelector('button').onclick = () => li.remove();
            keyCodesList.appendChild(li);
            newKeyCodeInput.value = '';
            newKeyCodeInput.focus();
        }
    };

    addKeyCodeBtn.onclick = addCode;
    newKeyCodeInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addCode();
        }
    };
}

function setupEventListeners() {
    const addChantierForm = document.getElementById("addChantierForm");
    addChantierForm.onsubmit = async (e) => {
        e.preventDefault();
        const name = document.getElementById("chantierNameInput").value.trim();
        if (name) {
            try {
                const keyCodesList = document.getElementById("keyCodesList");
                const keyboxCodes = Array.from(keyCodesList.querySelectorAll('li span')).map(span => span.textContent);
                await addDoc(collection(db, "chantiers"), {
                    name,
                    address: document.getElementById("chantierAddressInput").value.trim(),
                    keyboxCodes,
                    additionalInfo: document.getElementById("chantierInfoInput").value.trim(),
                    status: 'active',
                    createdAt: serverTimestamp()
                });
                addChantierForm.reset();
                keyCodesList.innerHTML = '';
                await loadChantiers();
            } catch (error) {
                console.error("Erreur ajout chantier:", error);
                showInfoModal("Erreur", "L'ajout du chantier a échoué.");
            }
        }
    };
    setupKeyCodeHandlers('newKeyCodeInput', 'addKeyCodeBtn', 'keyCodesList');

    document.getElementById('closeDetailsBtn').onclick = () => document.getElementById('detailsModal').classList.add('hidden');
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
            await loadChantiers();
            showInfoModal("Succès", "Le chantier a été mis à jour.");
        } catch (error) {
            console.error("Erreur de mise à jour: ", error);
            showInfoModal("Erreur", "La mise à jour a échoué.");
        }
    };
}

function showDetailsModal(chantierId) {
    const chantier = chantiersCache.find(c => c.id === chantierId);
    if (!chantier) return;

    document.getElementById('modalChantierName').textContent = chantier.name;
    const addressLink = document.getElementById('modalChantierAddress');
    if (chantier.address) {
        addressLink.textContent = chantier.address;
        addressLink.href = `https://www.google.com/maps/search/?api=1&query=$${encodeURIComponent(chantier.address)}`;
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
    document.getElementById('editChantierBtn').onclick = () => showEditModal(chantier);
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
