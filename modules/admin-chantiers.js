// modules/admin-chantiers.js

import { collection, query, orderBy, getDocs, addDoc, updateDoc, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent } from "../app.js";

const chantiersCollection = collection(db, "chantiers");

export async function render() {
    pageContent.innerHTML = `
        <div class="max-w-4xl mx-auto">
            <h2 class="text-2xl font-bold mb-4">⚙️ Gestion des Chantiers (Ajout/Archivage)</h2>
            
            <div class="bg-white p-6 rounded-lg shadow-sm mb-6">
                <form id="addChantierForm" class="space-y-4">
                    <h3 class="text-xl font-semibold">Ajouter un nouveau chantier</h3>
                    <div>
                        <label for="chantierNameInput" class="text-sm font-medium">Nom du chantier</label>
                        <input id="chantierNameInput" type="text" placeholder="Ex: Rénovation Durand" class="w-full border p-2 rounded mt-1" required />
                    </div>
                    <div>
                        <label for="chantierAddressInput" class="text-sm font-medium">Adresse</label>
                        <input id="chantierAddressInput" type="text" placeholder="Ex: 123 Rue de la République, 75001 Paris" class="w-full border p-2 rounded mt-1" />
                    </div>

                    <div>
                        <label class="text-sm font-medium">Codes boîtiers / Accès</label>
                        <div class="flex items-center gap-2 mt-1">
                            <input id="newKeyCodeInput" type="text" placeholder="Entrez un code ou une info" class="flex-grow border p-2 rounded" />
                            <button type="button" id="addKeyCodeBtn" class="bg-green-500 hover:bg-green-600 text-white font-bold px-4 py-2 rounded">Ajouter</button>
                        </div>
                        <ul id="keyCodesList" class="mt-2 space-y-1">
                            </ul>
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

            <div>
                <h3 class="text-xl font-semibold mb-2">Chantiers Actifs</h3>
                <div id="activeChantiersList" class="space-y-2"></div>
            </div>

            <div class="mt-6">
                <h3 class="text-xl font-semibold mb-2">Chantiers Archivés</h3>
                <div id="archivedChantiersList" class="space-y-2"></div>
            </div>
        </div>
    `;

    setupKeyCodeHandlers('newKeyCodeInput', 'addKeyCodeBtn', 'keyCodesList');

    const addChantierForm = document.getElementById("addChantierForm");
    addChantierForm.onsubmit = async (e) => {
        e.preventDefault();
        const name = document.getElementById("chantierNameInput").value.trim();
        const address = document.getElementById("chantierAddressInput").value.trim();
        const additionalInfo = document.getElementById("chantierInfoInput").value.trim();
        
        // NOUVELLE LOGIQUE POUR RÉCUPÉRER LES CODES
        const keyCodesList = document.getElementById("keyCodesList");
        const keyboxCodes = Array.from(keyCodesList.querySelectorAll('li span')).map(span => span.textContent);

        if (name) {
            try {
                await addDoc(chantiersCollection, {
                    name,
                    address: address || "",
                    keyboxCodes: keyboxCodes, // Enregistre un tableau
                    additionalInfo: additionalInfo || "",
                    status: 'active',
                    createdAt: serverTimestamp()
                });
                addChantierForm.reset();
                keyCodesList.innerHTML = ''; // Vide la liste des codes dans l'UI
                loadChantiers();
            } catch (error) {
                console.error("Erreur ajout chantier:", error);
                alert("Une erreur est survenue.");
            }
        }
    };

    loadChantiers();
}

// NOUVELLE FONCTION POUR GÉRER L'AJOUT/SUPPRESSION DE CODES
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
            
            li.querySelector('button').onclick = () => {
                li.remove();
            };

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


// Les fonctions loadChantiers, createChantierElement, et updateChantierStatus
// restent exactement les mêmes qu'avant.
async function loadChantiers() {
    const activeList = document.getElementById("activeChantiersList");
    const archivedList = document.getElementById("archivedChantiersList");
    activeList.innerHTML = "<p>Chargement...</p>";
    archivedList.innerHTML = "<p>Chargement...</p>";

    const q = query(chantiersCollection, orderBy("name"));
    const querySnapshot = await getDocs(q);

    activeList.innerHTML = "";
    archivedList.innerHTML = "";
    let activeCount = 0;
    let archivedCount = 0;

    querySnapshot.forEach(docSnap => {
        const chantier = docSnap.data();
        const chantierElement = createChantierElement(docSnap.id, chantier);
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

function createChantierElement(id, data) {
    const div = document.createElement('div');
    div.className = 'p-3 bg-gray-50 border rounded flex justify-between items-center';
    div.textContent = data.name;

    const button = document.createElement('button');
    button.className = 'px-3 py-1 text-sm rounded';
    
    if (data.status === 'active') {
        button.textContent = 'Archiver';
        button.className += ' bg-yellow-500 hover:bg-yellow-600 text-white';
        button.onclick = () => updateChantierStatus(id, 'archived');
    } else {
        button.textContent = 'Réactiver';
        button.className += ' bg-green-500 hover:bg-green-600 text-white';
        button.onclick = () => updateChantierStatus(id, 'active');
    }

    div.appendChild(button);
    return div;
}

async function updateChantierStatus(id, newStatus) {
    const chantierDocRef = doc(db, "chantiers", id);
    try {
        await updateDoc(chantierDocRef, { status: newStatus });
        loadChantiers();
    } catch (error) {
        console.error("Erreur mise à jour statut:", error);
        alert("Une erreur est survenue.");
    }
}