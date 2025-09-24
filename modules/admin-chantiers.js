import { collection, query, orderBy, getDocs, addDoc, updateDoc, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent, showInfoModal, showConfirmationModal } from "../app.js";
import { getGoogleMapsUrl } from "./utils.js";

let chantiersCache = [];

export async function render() {
    pageContent.innerHTML = `
        <div class="max-w-6xl mx-auto">
            <h2 class="text-2xl font-bold mb-4">⚙️ Gestion des Chantiers</h2>
            
            <div class="p-6 rounded-lg shadow-sm mb-6" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                <form id="addChantierForm" class="space-y-4">
                    <h3 class="text-xl font-semibold">Ajouter un nouveau chantier</h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label for="chantierNameInput" class="text-sm font-medium">Nom du chantier</label>
                            <input id="chantierNameInput" type="text" class="w-full border p-2 rounded mt-1" style="background-color: var(--color-background); border-color: var(--color-border);" required>
                        </div>
                        <div>
                            <label for="chantierTotalHoursInput" class="text-sm font-medium">Heures totales prévues</label>
                            <input id="chantierTotalHoursInput" type="number" class="w-full border p-2 rounded mt-1" style="background-color: var(--color-background); border-color: var(--color-border);">
                        </div>
                    </div>
                    <div>
                        <label for="chantierAddressInput" class="text-sm font-medium">Adresse</label>
                        <input id="chantierAddressInput" type="text" class="w-full border p-2 rounded mt-1" style="background-color: var(--color-background); border-color: var(--color-border);">
                    </div>
                    <div>
                        <label class="text-sm font-medium">Codes & Accès</label>
                        <div class="flex items-center gap-2 mt-1">
                            <input id="newKeyCodeInput" type="text" placeholder="Entrez un code" class="flex-grow border p-2 rounded" style="background-color: var(--color-background); border-color: var(--color-border);">
                            <button type="button" id="addKeyCodeBtn" class="bg-green-500 hover:bg-green-600 text-white font-bold px-4 py-2 rounded">Ajouter</button>
                        </div>
                        <ul id="keyCodesList" class="mt-2 space-y-1"></ul>
                    </div>
                    <div>
                        <label for="chantierInfoInput" class="text-sm font-medium">Informations supplémentaires</label>
                        <textarea id="chantierInfoInput" class="w-full border p-2 rounded mt-1" style="background-color: var(--color-background); border-color: var(--color-border);"></textarea>
                    </div>
                    <div class="text-right">
                        <button type="submit" class="text-white font-bold px-4 py-2 rounded" style="background-color: var(--color-primary);">Ajouter le chantier</button>
                    </div>
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
            <div class="p-6 rounded-lg shadow-xl w-full max-w-lg space-y-4 relative" style="background-color: var(--color-surface);">
                 <button id="closeDetailsBtn" class="absolute top-2 right-3 text-2xl font-bold" style="color: var(--color-text-muted);">&times;</button>
                 <h3 id="modalChantierName" class="text-2xl font-bold border-b pb-2" style="border-color: var(--color-border);"></h3>
                 <div id="modalChantierAddressContainer"><h4 class="font-semibold text-sm" style="color: var(--color-text-muted);">ADRESSE</h4><a id="modalChantierAddress" href="#" target="_blank" rel="noopener noreferrer" class="hover:underline text-lg" style="color: var(--color-primary);"></a></div>
                 <div><h4 class="font-semibold text-sm" style="color: var(--color-text-muted);">CODES & ACCÈS</h4><div id="modalChantierKeybox" class="text-lg"></div></div>
                 <div><h4 class="font-semibold text-sm" style="color: var(--color-text-muted);">INFOS SUPPLÉMENTAIRES</h4><p id="modalChantierInfo" class="text-lg"></p></div>
                 <div class="text-right pt-4 border-t" style="border-color: var(--color-border);"><button id="editChantierBtn" class="text-white font-bold px-5 py-2 rounded" style="background-color: var(--color-primary);">Modifier</button></div>
            </div>
        </div>

        <div id="editModal" class="hidden fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-30 p-4">
            <form id="editForm" class="p-6 rounded-lg shadow-xl w-full max-w-lg space-y-4" style="background-color: var(--color-surface);">
                 <h3 class="text-2xl font-bold">Modifier le chantier</h3>
                 <input type="hidden" id="editChantierId">
                 <div><label for="editChantierName" class="text-sm font-medium">Nom</label><input id="editChantierName" type="text" class="w-full border p-2 rounded mt-1" style="background-color: var(--color-background); border-color: var(--color-border);" required></div>
                 <div><label for="editChantierTotalHours" class="text-sm font-medium">Heures totales prévues</label><input id="editChantierTotalHours" type="number" class="w-full border p-2 rounded mt-1" style="background-color: var(--color-background); border-color: var(--color-border);"></div>
                 <div><label for="editChantierAddress" class="text-sm font-medium">Adresse</label><input id="editChantierAddress" type="text" class="w-full border p-2 rounded mt-1" style="background-color: var(--color-background); border-color: var(--color-border);"></div>
                 <div>
                    <label class="text-sm font-medium">Codes</label>
                    <div class="flex items-center gap-2 mt-1">
                        <input id="editNewKeyCodeInput" type="text" placeholder="Entrez un code" class="flex-grow border p-2 rounded" style="background-color: var(--color-background); border-color: var(--color-border);">
                        <button type="button" id="editAddKeyCodeBtn" class="bg-green-500 hover:bg-green-600 text-white font-bold px-4 py-2 rounded">Ajouter</button>
                    </div>
                    <ul id="editKeyCodesList" class="mt-2 space-y-1"></ul>
                </div>
                 <div><label for="editChantierInfo" class="text-sm font-medium">Infos</label><textarea id="editChantierInfo" class="w-full border p-2 rounded mt-1" style="background-color: var(--color-background); border-color: var(--color-border);"></textarea></div>
                 <div class="flex justify-end gap-4 pt-4">
                    <button type="button" id="cancelEditBtn" class="px-4 py-2 rounded" style="background-color: var(--color-background); border: 1px solid var(--color-border);">Annuler</button>
                    <button type="submit" class="text-white font-bold px-4 py-2 rounded" style="background-color: var(--color-primary);">Enregistrer</button>
                </div>
            </form>
        </div>
    `;
    setTimeout(async () => {
        setupEventListeners();
        await loadChantiers();
    }, 0);
}

async function loadChantiers() {
    const activeList = document.getElementById("activeChantiersList");
    const archivedList = document.getElementById("archivedChantiersList");
    activeList.innerHTML = `<p style="color: var(--color-text-muted);">Chargement...</p>`;
    archivedList.innerHTML = `<p style="color: var(--color-text-muted);">Chargement...</p>`;
    try {
        const q = query(collection(db, "chantiers"), orderBy("name"));
        const snapshot = await getDocs(q);
        chantiersCache = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        activeList.innerHTML = "";
        archivedList.innerHTML = "";
        let activeCount = 0, archivedCount = 0;
        chantiersCache.forEach(c => {
            const el = createChantierElement(c);
            if (c.status === 'active') { activeList.appendChild(el); activeCount++; }
            else { archivedList.appendChild(el); archivedCount++; }
        });
        if (activeCount === 0) activeList.innerHTML = `<p style="color: var(--color-text-muted);">Aucun chantier actif.</p>`;
        if (archivedCount === 0) archivedList.innerHTML = `<p style="color: var(--color-text-muted);">Aucun chantier archivé.</p>`;
    } catch(error) { console.error("Erreur chargement:", error); }
}

function createChantierElement(chantier) {
    const div = document.createElement('div');
    div.className = 'p-3 border rounded flex justify-between items-center gap-2';
    div.style.backgroundColor = 'var(--color-surface)';
    div.style.borderColor = 'var(--color-border)';
    div.innerHTML = `<span class="font-semibold truncate">${chantier.name}</span>`;
    
    const buttonsWrapper = document.createElement('div');
    buttonsWrapper.className = 'flex items-center gap-2 flex-shrink-0';
    
    const detailsBtn = document.createElement('button');
    detailsBtn.textContent = 'Détails';
    detailsBtn.className = 'px-3 py-1 text-sm rounded text-white';
    detailsBtn.style.backgroundColor = 'var(--color-primary)';
    detailsBtn.onclick = () => showDetailsModal(chantier);
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
    const action = newStatus === 'active' ? 'réactiver' : 'archiver';
    if (await showConfirmationModal("Confirmation", `Voulez-vous ${action} ce chantier ?`)) {
        try { 
            await updateDoc(doc(db, "chantiers", id), { status: newStatus }); 
            await loadChantiers();
        } catch (error) { console.error("Erreur statut:", error); }
    }
}

function setupEventListeners() {
    const addChantierForm = document.getElementById("addChantierForm");
    addChantierForm.onsubmit = async (e) => {
        e.preventDefault();
        const name = document.getElementById("chantierNameInput").value.trim();
        const totalHeuresPrevues = parseFloat(document.getElementById("chantierTotalHoursInput").value) || 0;
        if (name) {
            try {
                const list = document.getElementById("keyCodesList");
                const keyboxCodes = Array.from(list.querySelectorAll('li span')).map(s => s.textContent);
                await addDoc(collection(db, "chantiers"), {
                    name, totalHeuresPrevues,
                    address: document.getElementById("chantierAddressInput").value.trim(),
                    keyboxCodes,
                    additionalInfo: document.getElementById("chantierInfoInput").value.trim(),
                    status: 'active', createdAt: serverTimestamp()
                });
                addChantierForm.reset();
                list.innerHTML = '';
                await loadChantiers();
            } catch (error) { console.error("Erreur ajout:", error); }
        }
    };
    setupKeyCodeHandlers('newKeyCodeInput', 'addKeyCodeBtn', 'keyCodesList');
    document.getElementById('editForm').onsubmit = async (e) => {
        e.preventDefault();
        const id = document.getElementById('editChantierId').value;
        const totalHours = parseFloat(document.getElementById("editChantierTotalHours").value) || 0;
        const list = document.getElementById("editKeyCodesList");
        const codes = Array.from(list.querySelectorAll('li span')).map(s => s.textContent);
        const data = {
            name: document.getElementById('editChantierName').value, totalHeuresPrevues: totalHours,
            address: document.getElementById('editChantierAddress').value,
            keyboxCodes: codes,
            additionalInfo: document.getElementById('editChantierInfo').value
        };
        try {
            await updateDoc(doc(db, "chantiers", id), data);
            document.getElementById('editModal').classList.add('hidden');
            await loadChantiers();
            showInfoModal("Succès", "Chantier mis à jour.");
        } catch (error) { console.error("Erreur MàJ:", error); }
    };
    document.getElementById('closeDetailsBtn').onclick = () => document.getElementById('detailsModal').classList.add('hidden');
    document.getElementById('cancelEditBtn').onclick = () => document.getElementById('editModal').classList.add('hidden');
    setupKeyCodeHandlers('editNewKeyCodeInput', 'editAddKeyCodeBtn', 'editKeyCodesList');
}

function showDetailsModal(chantier) {
    document.getElementById('modalChantierName').textContent = chantier.name;
    const addrContainer = document.getElementById('modalChantierAddressContainer');
    const addr = document.getElementById('modalChantierAddress');
    if (chantier.address) {
        addr.textContent = chantier.address;
        addr.href = getGoogleMapsUrl(chantier.address);
        addrContainer.style.display = 'block';
    } else { addrContainer.style.display = 'none'; }
    const keybox = document.getElementById('modalChantierKeybox');
    keybox.innerHTML = '';
    if (Array.isArray(chantier.keyboxCodes) && chantier.keyboxCodes.length > 0) {
        const ul = document.createElement('ul');
        ul.className = 'list-disc list-inside';
        chantier.keyboxCodes.forEach(c => { ul.innerHTML += `<li>${c}</li>`; });
        keybox.appendChild(ul);
    } else { keybox.textContent = "Non spécifié"; }
    document.getElementById('modalChantierInfo').textContent = chantier.additionalInfo || "Aucune";
    document.getElementById('editChantierBtn').onclick = () => showEditModal(chantier);
    document.getElementById('detailsModal').classList.remove('hidden');
}

function showEditModal(chantier) {
    document.getElementById('detailsModal').classList.add('hidden');
    document.getElementById('editChantierId').value = chantier.id;
    document.getElementById('editChantierName').value = chantier.name;
    document.getElementById('editChantierTotalHours').value = chantier.totalHeuresPrevues || '';
    document.getElementById('editChantierAddress').value = chantier.address || '';
    document.getElementById('editChantierInfo').value = chantier.additionalInfo || '';
    const list = document.getElementById('editKeyCodesList');
    list.innerHTML = '';
    if (Array.isArray(chantier.keyboxCodes)) {
        chantier.keyboxCodes.forEach(code => {
            const li = document.createElement('li');
            li.className = 'flex items-center justify-between p-2 rounded';
            li.style.backgroundColor = 'var(--color-background)';
            li.innerHTML = `<span>${code}</span><button type="button" class="text-red-500 hover:text-red-700 font-bold">✖</button>`;
            li.querySelector('button').onclick = () => li.remove();
            list.appendChild(li);
        });
    }
    document.getElementById('editModal').classList.remove('hidden');
}

function setupKeyCodeHandlers(inputId, addButtonId, listId) {
    const input = document.getElementById(inputId);
    const btn = document.getElementById(addButtonId);
    const list = document.getElementById(listId);
    const addCode = () => {
        const text = input.value.trim();
        if (text) {
            const li = document.createElement('li');
            li.className = 'flex items-center justify-between p-2 rounded';
            li.style.backgroundColor = 'var(--color-background)';
            li.innerHTML = `<span>${text}</span><button type="button" class="text-red-500 hover:text-red-700 font-bold">✖</button>`;
            li.querySelector('button').onclick = () => li.remove();
            list.appendChild(li);
            input.value = '';
            input.focus();
        }
    };
    btn.onclick = addCode;
    input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); addCode(); } };
}