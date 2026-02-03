import { collection, query, orderBy, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent, showInfoModal, showConfirmationModal } from "../app.js";
import { getGoogleMapsUrl } from "./utils.js";

const MAPBOX_TOKEN = "pk.eyJ1IjoiamFzb255MjgiLCJhIjoiY21lMDcyYWhzMDIyODJsczl0cmM0aTVjciJ9.V14cJXdBNoq3yAQTDeUg-A";

let chantiersCache = [];

export async function render() {
    pageContent.innerHTML = `
        <div class="max-w-6xl mx-auto">
            <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                <h2 class="text-2xl font-bold" style="color: var(--color-text-base);">⚙️ Gestion des Chantiers & Contraintes</h2>
                <button id="exportChantiersPdf" class="bg-purple-600 hover:bg-purple-700 text-white font-bold px-4 py-2 rounded-lg text-sm">Exporter Liste PDF</button>
            </div>
            
            <div class="p-6 rounded-lg shadow-sm mb-6" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                <form id="addChantierForm" class="space-y-4">
                    <h3 class="text-xl font-semibold" style="color: var(--color-text-base);">Ajouter un nouveau chantier</h3>
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label for="chantierNameInput" class="text-sm font-medium" style="color: var(--color-text-base);">Nom du chantier</label>
                            <input id="chantierNameInput" type="text" class="w-full border p-2 rounded mt-1" style="background-color: var(--color-background); border-color: var(--color-border); color: var(--color-text-base);" required>
                        </div>
                        <div>
                            <label for="chantierTotalHoursInput" class="text-sm font-medium" style="color: var(--color-text-base);">Heures totales prévues (Estimation)</label>
                            <input id="chantierTotalHoursInput" type="number" step="0.5" class="w-full border p-2 rounded mt-1" style="background-color: var(--color-background); border-color: var(--color-border); color: var(--color-text-base);">
                        </div>
                    </div>

                    <div class="flex items-center gap-2">
                        <input type="checkbox" id="chantierTvaInput" class="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500">
                        <label for="chantierTvaInput" class="text-sm font-medium" style="color: var(--color-text-base);">Assujetti TVA</label>
                    </div>

                    <div>
                        <label for="chantierAddressInput" class="text-sm font-medium" style="color: var(--color-text-base);">Adresse précise (pour calcul GPS)</label>
                        <input id="chantierAddressInput" type="text" placeholder="ex: Rue de la Gare 12, 6900 Marche-en-Famenne" class="w-full border p-2 rounded mt-1" style="background-color: var(--color-background); border-color: var(--color-border); color: var(--color-text-base);">
                    </div>

                    <div class="p-4 rounded border" style="background-color: var(--color-background); border-color: var(--color-border);">
                        <h4 class="font-bold text-sm mb-3 flex items-center gap-2" style="color: var(--color-primary);">
                            <span>⏰</span> Contraintes de temps (Optionnel)
                        </h4>
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label for="timeWindowStartInput" class="text-xs font-bold uppercase mb-1 block" style="color: var(--color-text-muted);">Pas avant (Ouverture)</label>
                                <input id="timeWindowStartInput" type="time" class="w-full border p-2 rounded" style="background-color: var(--color-surface); border-color: var(--color-border); color: var(--color-text-base);">
                            </div>
                            <div>
                                <label for="timeWindowEndInput" class="text-xs font-bold uppercase mb-1 block" style="color: var(--color-text-muted);">Pas après (Fermeture)</label>
                                <input id="timeWindowEndInput" type="time" class="w-full border p-2 rounded" style="background-color: var(--color-surface); border-color: var(--color-border); color: var(--color-text-base);">
                            </div>
                            <div>
                                <label for="fixedAppointmentInput" class="text-xs font-bold uppercase mb-1 block text-red-500">⚠️ RDV PRÉCIS (Impératif)</label>
                                <input id="fixedAppointmentInput" type="time" class="w-full border-2 p-2 rounded" style="background-color: var(--color-surface); border-color: #fca5a5; color: var(--color-text-base);">
                            </div>
                        </div>
                    </div>

                    <div>
                        <label class="text-sm font-medium" style="color: var(--color-text-base);">Codes & Accès</label>
                        <div class="flex items-center gap-2 mt-1">
                            <input id="newKeyCodeInput" type="text" placeholder="Entrez un code" class="flex-grow border p-2 rounded" style="background-color: var(--color-background); border-color: var(--color-border); color: var(--color-text-base);">
                            <button type="button" id="addKeyCodeBtn" class="bg-green-500 hover:bg-green-600 text-white font-bold px-4 py-2 rounded">Ajouter</button>
                        </div>
                        <ul id="keyCodesList" class="mt-2 space-y-1" style="color: var(--color-text-base);"></ul>
                    </div>

                    <div>
                        <label for="chantierInfoInput" class="text-sm font-medium" style="color: var(--color-text-base);">Informations supplémentaires</label>
                        <textarea id="chantierInfoInput" class="w-full border p-2 rounded mt-1" style="background-color: var(--color-background); border-color: var(--color-border); color: var(--color-text-base);"></textarea>
                    </div>

                    <div class="text-right">
                        <button type="submit" class="text-white font-bold px-4 py-2 rounded" style="background-color: var(--color-primary);">Ajouter le chantier</button>
                    </div>
                </form>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <h3 class="text-xl font-semibold mb-2" style="color: var(--color-text-base);">Chantiers Actifs</h3>
                    <div id="activeChantiersList" class="space-y-2"></div>
                </div>
                <div>
                    <h3 class="text-xl font-semibold mb-2" style="color: var(--color-text-base);">Chantiers Archivés</h3>
                    <div id="archivedChantiersList" class="space-y-2"></div>
                </div>
            </div>
        </div>
        
        <div id="detailsModal" class="hidden fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-20 p-4">
            <div class="p-6 rounded-lg shadow-xl w-full max-w-lg space-y-4 relative" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                 <button id="closeDetailsBtn" class="absolute top-2 right-3 text-2xl font-bold" style="color: var(--color-text-muted);">×</button>
                 <h3 id="modalChantierName" class="text-2xl font-bold border-b pb-2" style="color: var(--color-text-base); border-color: var(--color-border);"></h3>
                 
                 <div id="modalTimeConstraints" class="hidden p-3 rounded border text-sm" style="background-color: var(--color-background); border-color: var(--color-border); color: var(--color-text-base);"></div>

                 <div id="modalChantierAddressContainer">
                    <h4 class="font-semibold text-sm" style="color: var(--color-text-muted);">ADRESSE</h4>
                    <a id="modalChantierAddress" href="#" target="_blank" rel="noopener noreferrer" class="hover:underline text-lg" style="color: var(--color-primary);"></a>
                 </div>
                 <div>
                    <h4 class="font-semibold text-sm" style="color: var(--color-text-muted);">CODES & ACCÈS</h4>
                    <div id="modalChantierKeybox" class="text-lg" style="color: var(--color-text-base);"></div>
                 </div>
                 <div>
                    <h4 class="font-semibold text-sm" style="color: var(--color-text-muted);">INFOS SUPPLÉMENTAIRES</h4>
                    <p id="modalChantierInfo" class="text-lg" style="color: var(--color-text-base);"></p>
                 </div>
                 <div class="text-right pt-4 border-t" style="border-color: var(--color-border);">
                    <button id="editChantierBtn" class="text-white font-bold px-5 py-2 rounded" style="background-color: var(--color-primary);">Modifier</button>
                 </div>
            </div>
        </div>

        <div id="editModal" class="hidden fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-30 p-4 overflow-y-auto">
            <form id="editForm" class="p-6 rounded-lg shadow-xl w-full max-w-lg space-y-4 mt-auto mb-auto" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                 <h3 class="text-2xl font-bold" style="color: var(--color-text-base);">Modifier le chantier</h3>
                 <input type="hidden" id="editChantierId">
                 <div>
                    <label for="editChantierName" class="text-sm font-medium" style="color: var(--color-text-base);">Nom</label>
                    <input id="editChantierName" type="text" class="w-full border p-2 rounded mt-1" style="background-color: var(--color-background); border-color: var(--color-border); color: var(--color-text-base);" required>
                 </div>
                 <div>
                    <label for="editChantierTotalHours" class="text-sm font-medium" style="color: var(--color-text-base);">Heures totales prévues</label>
                    <input id="editChantierTotalHours" type="number" step="0.5" class="w-full border p-2 rounded mt-1" style="background-color: var(--color-background); border-color: var(--color-border); color: var(--color-text-base);">
                 </div>
                 <div class="flex items-center gap-2">
                    <input type="checkbox" id="editChantierTva" class="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500">
                    <label for="editChantierTva" class="text-sm font-medium" style="color: var(--color-text-base);">Assujetti TVA</label>
                 </div>
                 <div>
                    <label for="editChantierAddress" class="text-sm font-medium" style="color: var(--color-text-base);">Adresse</label>
                    <input id="editChantierAddress" type="text" class="w-full border p-2 rounded mt-1" style="background-color: var(--color-background); border-color: var(--color-border); color: var(--color-text-base);">
                 </div>
                 
                 <div class="p-3 rounded border" style="background-color: var(--color-background); border-color: var(--color-border);">
                    <h4 class="font-bold text-xs mb-2" style="color: var(--color-text-muted);">CONTRAINTES HORAIRES</h4>
                    <div class="grid grid-cols-2 gap-2 mb-2">
                        <div>
                            <label class="text-xs" style="color: var(--color-text-muted);">Pas avant</label>
                            <input id="editTimeWindowStart" type="time" class="w-full border p-1 rounded" style="background-color: var(--color-surface); border-color: var(--color-border); color: var(--color-text-base);">
                        </div>
                        <div>
                            <label class="text-xs" style="color: var(--color-text-muted);">Pas après</label>
                            <input id="editTimeWindowEnd" type="time" class="w-full border p-1 rounded" style="background-color: var(--color-surface); border-color: var(--color-border); color: var(--color-text-base);">
                        </div>
                    </div>
                    <div>
                        <label class="text-xs font-bold text-red-500">RDV Précis</label>
                        <input id="editFixedAppointment" type="time" class="w-full border p-1 rounded" style="background-color: var(--color-surface); border-color: #fca5a5; color: var(--color-text-base);">
                    </div>
                 </div>

                 <div>
                    <label class="text-sm font-medium" style="color: var(--color-text-base);">Codes</label>
                    <div class="flex items-center gap-2 mt-1">
                        <input id="editNewKeyCodeInput" type="text" placeholder="Entrez un code" class="flex-grow border p-2 rounded" style="background-color: var(--color-background); border-color: var(--color-border); color: var(--color-text-base);">
                        <button type="button" id="editAddKeyCodeBtn" class="bg-green-500 hover:bg-green-600 text-white font-bold px-4 py-2 rounded">Ajouter</button>
                    </div>
                    <ul id="editKeyCodesList" class="mt-2 space-y-1"></ul>
                </div>
                 <div>
                    <label for="editChantierInfo" class="text-sm font-medium" style="color: var(--color-text-base);">Infos</label>
                    <textarea id="editChantierInfo" class="w-full border p-2 rounded mt-1" style="background-color: var(--color-background); border-color: var(--color-border); color: var(--color-text-base);"></textarea>
                 </div>
                 <div class="flex justify-end gap-4 pt-4">
                    <button type="button" id="cancelEditBtn" class="px-4 py-2 rounded border" style="background-color: var(--color-background); border-color: var(--color-border); color: var(--color-text-base);">Annuler</button>
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
    
    let timeBadge = '';
    if (chantier.fixedAppointment) {
        timeBadge = `<span class="ml-2 text-xs text-white px-2 py-0.5 rounded-full font-bold" style="background-color: #ef4444;">RDV ${chantier.fixedAppointment}</span>`;
    } else if (chantier.timeWindowStart || chantier.timeWindowEnd) {
        timeBadge = `<span class="ml-2 text-xs px-2 py-0.5 rounded-full" style="background-color: var(--color-background); color: var(--color-text-muted); border: 1px solid var(--color-border);">🕒 Horaire</span>`;
    }

    div.innerHTML = `<div class="truncate"><span class="font-semibold" style="color: var(--color-text-base);">${chantier.name}</span>${timeBadge}</div>`;
    
    const buttonsWrapper = document.createElement('div');
    buttonsWrapper.className = 'flex items-center gap-2 flex-shrink-0';
    
    // Bouton Détails
    const detailsBtn = document.createElement('button');
    detailsBtn.textContent = 'Détails';
    detailsBtn.className = 'px-3 py-1 text-sm rounded text-white';
    detailsBtn.style.backgroundColor = 'var(--color-primary)';
    detailsBtn.onclick = () => showDetailsModal(chantier);
    buttonsWrapper.appendChild(detailsBtn);
    
    // Bouton Archive/Active
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

    // Bouton Supprimer
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Supprimer';
    deleteBtn.className = 'px-3 py-1 text-sm rounded bg-red-600 hover:bg-red-700 text-white';
    deleteBtn.onclick = () => deleteChantier(chantier.id, chantier.name);
    buttonsWrapper.appendChild(deleteBtn);

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

async function deleteChantier(id, name) {
    if (await showConfirmationModal("Attention", `Êtes-vous sûr de vouloir supprimer DÉFINITIVEMENT le chantier "${name}" ? \nCette action est irréversible.`)) {
        try {
            await deleteDoc(doc(db, "chantiers", id));
            showInfoModal("Succès", "Chantier supprimé.");
            await loadChantiers();
        } catch (e) {
            console.error(e);
            showInfoModal("Erreur", "Impossible de supprimer le chantier.");
        }
    }
}

async function exportChantiersToPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape' });
    
    doc.setFontSize(18);
    doc.text("Liste Complète des Chantiers", 14, 20);
    doc.setFontSize(10);
    doc.text(`Exporté le ${new Date().toLocaleDateString('fr-FR')}`, 14, 28);
    
    const tableData = chantiersCache.map(c => [
        c.name,
        c.address || '-',
        c.isTva ? 'OUI' : 'NON',
        c.totalHeuresPrevues ? `${c.totalHeuresPrevues}h` : '-',
        c.keyboxCodes?.join(', ') || '-',
        c.status === 'active' ? 'Actif' : 'Archivé'
    ]);

    doc.autoTable({
        startY: 35,
        head: [['Nom', 'Adresse', 'TVA', 'Heures', 'Codes', 'Statut']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [41, 128, 185] },
        styles: { fontSize: 8 }
    });

    doc.save(`Liste_Chantiers_${new Date().toISOString().split('T')[0]}.pdf`);
}

function setupEventListeners() {
    document.getElementById("exportChantiersPdf").onclick = exportChantiersToPDF;
    
    const addChantierForm = document.getElementById("addChantierForm");
    
    addChantierForm.onsubmit = async (e) => {
        e.preventDefault();
        const name = document.getElementById("chantierNameInput").value.trim();
        const address = document.getElementById("chantierAddressInput").value.trim();
        const totalHeuresPrevues = parseFloat(document.getElementById("chantierTotalHoursInput").value) || 0;
        const isTva = document.getElementById("chantierTvaInput").checked;
        
        const timeWindowStart = document.getElementById("timeWindowStartInput").value;
        const timeWindowEnd = document.getElementById("timeWindowEndInput").value;
        const fixedAppointment = document.getElementById("fixedAppointmentInput").value;

        if (name) {
            try {
                const coordinates = await geocodeAddress(address);
                const list = document.getElementById("keyCodesList");
                const keyboxCodes = Array.from(list.querySelectorAll('li span')).map(s => s.textContent);
                
                await addDoc(collection(db, "chantiers"), {
                    name, 
                    totalHeuresPrevues,
                    isTva,
                    address,
                    coordinates, 
                    timeWindowStart,
                    timeWindowEnd,
                    fixedAppointment,
                    keyboxCodes,
                    additionalInfo: document.getElementById("chantierInfoInput").value.trim(),
                    status: 'active', 
                    createdAt: serverTimestamp()
                });
                
                addChantierForm.reset();
                list.innerHTML = '';
                showInfoModal("Succès", "Chantier ajouté avec géolocalisation !");
                await loadChantiers();
            } catch (error) { 
                console.error("Erreur ajout:", error); 
                showInfoModal("Erreur", "Erreur lors de l'ajout.");
            }
        }
    };

    setupKeyCodeHandlers('newKeyCodeInput', 'addKeyCodeBtn', 'keyCodesList');
    
    document.getElementById('editForm').onsubmit = async (e) => {
        e.preventDefault();
        const id = document.getElementById('editChantierId').value;
        const address = document.getElementById('editChantierAddress').value;
        const coordinates = await geocodeAddress(address);

        const list = document.getElementById("editKeyCodesList");
        const codes = Array.from(list.querySelectorAll('li span')).map(s => s.textContent);
        
        const data = {
            name: document.getElementById('editChantierName').value, 
            totalHeuresPrevues: parseFloat(document.getElementById("editChantierTotalHours").value) || 0,
            isTva: document.getElementById('editChantierTva').checked,
            address: address,
            timeWindowStart: document.getElementById("editTimeWindowStart").value,
            timeWindowEnd: document.getElementById("editTimeWindowEnd").value,
            fixedAppointment: document.getElementById("editFixedAppointment").value,
            keyboxCodes: codes,
            additionalInfo: document.getElementById('editChantierInfo').value
        };

        if(coordinates) {
            data.coordinates = coordinates;
        }

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
    
    const timeContainer = document.getElementById('modalTimeConstraints');
    let timeText = [];
    if (chantier.fixedAppointment) timeText.push(`🔴 <strong>RDV Impératif : ${chantier.fixedAppointment}</strong>`);
    if (chantier.timeWindowStart) timeText.push(`🕒 Pas avant : ${chantier.timeWindowStart}`);
    if (chantier.timeWindowEnd) timeText.push(`🕒 Pas après : ${chantier.timeWindowEnd}`);
    
    if (timeText.length > 0) {
        timeContainer.innerHTML = timeText.join('<br>');
        timeContainer.classList.remove('hidden');
    } else {
        timeContainer.classList.add('hidden');
    }

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
    document.getElementById('editChantierTva').checked = chantier.isTva || false;
    document.getElementById('editChantierAddress').value = chantier.address || '';
    
    document.getElementById('editTimeWindowStart').value = chantier.timeWindowStart || '';
    document.getElementById('editTimeWindowEnd').value = chantier.timeWindowEnd || '';
    document.getElementById('editFixedAppointment').value = chantier.fixedAppointment || '';

    document.getElementById('editChantierInfo').value = chantier.additionalInfo || '';
    const list = document.getElementById('editKeyCodesList');
    list.innerHTML = '';
    if (Array.isArray(chantier.keyboxCodes)) {
        chantier.keyboxCodes.forEach(code => {
            const li = document.createElement('li');
            li.className = 'flex items-center justify-between p-2 rounded';
            li.style.backgroundColor = 'var(--color-background)';
            li.style.color = 'var(--color-text-base)';
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
            li.style.color = 'var(--color-text-base)';
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