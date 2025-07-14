// modules/admin-colleagues.js

import { collection, getDocs, addDoc, deleteDoc, doc, orderBy, query } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent } from "../app.js";

const colleaguesCollection = collection(db, "colleagues");

export async function render() {
    pageContent.innerHTML = `
        <div class="max-w-2xl mx-auto">
            <h2 class="text-2xl font-bold mb-4">👷 Gestion des Collègues</h2>
            
            <div class="bg-white p-4 rounded-lg shadow-sm mb-6">
                <form id="addColleagueForm" class="flex flex-col sm:flex-row gap-3">
                    <input id="colleagueNameInput" type="text" placeholder="Nom du nouveau collègue" class="flex-grow border p-2 rounded" required />
                    <button type="submit" class="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded">
                        Ajouter
                    </button>
                </form>
            </div>

            <div>
                <h3 class="text-xl font-semibold mb-2">Liste des Collègues</h3>
                <div id="colleaguesList" class="space-y-2">
                    <p>Chargement...</p>
                </div>
            </div>
        </div>
    `;

    const addColleagueForm = document.getElementById("addColleagueForm");
    addColleagueForm.onsubmit = async (e) => {
        e.preventDefault();
        const input = document.getElementById("colleagueNameInput");
        const colleagueName = input.value.trim();
        if (colleagueName) {
            try {
                await addDoc(colleaguesCollection, { name: colleagueName });
                input.value = '';
                loadColleagues(); // Recharger la liste
            } catch (error) {
                console.error("Erreur ajout collègue:", error);
                alert("Une erreur est survenue.");
            }
        }
    };

    loadColleagues();
}

async function loadColleagues() {
    const listContainer = document.getElementById("colleaguesList");
    listContainer.innerHTML = "<p>Chargement...</p>";

    try {
        const q = query(colleaguesCollection, orderBy("name"));
        const querySnapshot = await getDocs(q);

        listContainer.innerHTML = "";
        if (querySnapshot.empty) {
            listContainer.innerHTML = "<p class='text-gray-500'>Aucun collègue trouvé.</p>";
            return;
        }

        querySnapshot.forEach(docSnap => {
            const colleague = docSnap.data();
            const element = createColleagueElement(docSnap.id, colleague.name);
            listContainer.appendChild(element);
        });

    } catch (error) {
        console.error("Erreur chargement collègues:", error);
        listContainer.innerHTML = "<p class='text-red-500'>Erreur de chargement.</p>";
    }
}

function createColleagueElement(id, name) {
    const div = document.createElement('div');
    div.className = 'p-3 bg-gray-50 border rounded flex justify-between items-center';
    
    const nameSpan = document.createElement('span');
    nameSpan.textContent = name;
    div.appendChild(nameSpan);

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Supprimer';
    deleteBtn.className = 'px-3 py-1 text-sm rounded bg-red-500 hover:bg-red-600 text-white';
    deleteBtn.onclick = async () => {
        if (confirm(`Voulez-vous vraiment supprimer "${name}" ?`)) {
            try {
                await deleteDoc(doc(db, "colleagues", id));
                loadColleagues(); // Recharger la liste
            } catch (error) {
                console.error("Erreur suppression collègue:", error);
                alert("La suppression a échoué.");
            }
        }
    };
    div.appendChild(deleteBtn);
    return div;
}