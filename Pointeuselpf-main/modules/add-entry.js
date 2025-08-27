import { collection, addDoc, serverTimestamp, query, where, orderBy, getDocs } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, currentUser, pageContent, showInfoModal } from "../app.js";

let selectedColleagues = [];
let allColleaguesCache = [];

export async function render() {
    pageContent.innerHTML = `
        <form id="manualForm" class="space-y-4 border p-4 md:p-6 rounded-lg bg-white shadow-sm max-w-2xl mx-auto">
            <h2 class="font-bold text-center text-xl">Ajouter un nouveau pointage</h2>
            <div>
                <label for="manualChantier" class="text-sm font-medium">Client / Chantier</label>
                <select id="manualChantier" class="w-full border p-2 rounded mt-1" required>
                    <option value="" disabled selected>Chargement des chantiers...</option>
                </select>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div><label for="manualDate" class="text-sm font-medium">Date</label><input id="manualDate" type="date" class="w-full border p-2 rounded mt-1" required /></div>
                <div><label for="manualStart" class="text-sm font-medium">Début</label><input id="manualStart" type="time" class="w-full border p-2 rounded mt-1" required /></div>
                <div><label for="manualEnd" class="text-sm font-medium">Fin</label><input id="manualEnd" type="time" class="w-full border p-2 rounded mt-1" required /></div>
            </div>
            <div>
                <label class="text-sm font-medium text-center block">Collègues</label>
                <div id="manualColleaguesContainer" class="flex flex-wrap gap-2 justify-center mt-2"><p class="text-gray-500">Chargement...</p></div>
            </div>
            <div><label for="manualNotes" class="text-sm font-medium">Notes (optionnel)</label><textarea id="manualNotes" class="w-full border p-2 rounded mt-1"></textarea></div>
            <button type="submit" class="bg-purple-700 hover:bg-purple-800 text-white font-bold px-4 py-3 rounded w-full">Enregistrer le pointage</button>
        </form>
    `;
 setTimeout(() => {
    const manualForm = document.getElementById("manualForm");
    
    loadChantiersIntoSelect();
    loadColleaguesForSelection();

    manualForm.onsubmit = async (e) => {
        e.preventDefault();
        const submitButton = manualForm.querySelector('button[type="submit"]');
        submitButton.textContent = "Enregistrement...";
        submitButton.disabled = true;

        const chantier = document.getElementById("manualChantier").value;
        const date = document.getElementById("manualDate").value;
        const startTimeValue = document.getElementById("manualStart").value;
        const endTimeValue = document.getElementById("manualEnd").value;
        const notes = document.getElementById("manualNotes").value.trim();

        if (!chantier || !date || !startTimeValue || !endTimeValue) {
            showInfoModal("Attention", "Veuillez remplir tous les champs obligatoires.");
            submitButton.disabled = false;
            submitButton.textContent = "Enregistrer le pointage";
            return;
        }

        const startDateTime = new Date(`${date}T${startTimeValue}`);
        const endDateTime = new Date(`${date}T${endTimeValue}`);

        if (endDateTime <= startDateTime) {
            showInfoModal("Attention", "L'heure de fin doit être après l'heure de début.");
            submitButton.disabled = false;
            submitButton.textContent = "Enregistrer le pointage";
            return;
        }
        
        const pointagesCollectionRef = collection(db, "pointages");
        const docData = {
            uid: currentUser.uid, userEmail: currentUser.email, userName: currentUser.displayName,
            timestamp: startDateTime.toISOString(), endTime: endDateTime.toISOString(),
            chantier, notes: `(Saisie manuelle)${notes ? " " + notes : ""}`,
            colleagues: selectedColleagues.length ? selectedColleagues : ["Seul"],
            createdAt: serverTimestamp()
        };

        try {
            await addDoc(pointagesCollectionRef, docData);
            showInfoModal("Succès", "Pointage manuel enregistré !");
            manualForm.reset();
            document.getElementById('manualChantier').selectedIndex = 0;
            selectedColleagues = [];
            renderColleaguesSelection();
        } catch (error) {
            console.error("Erreur d'enregistrement manuel:", error);
            showInfoModal("Erreur", "Une erreur est survenue lors de l'enregistrement.");
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = "Enregistrer le pointage";
        }
    };
    }, 0);
}

async function loadChantiersIntoSelect() {
    const chantierSelect = document.getElementById('manualChantier');
    try {
        const q = query(collection(db, "chantiers"), where("status", "==", "active"), orderBy("name"));
        const querySnapshot = await getDocs(q);
        chantierSelect.innerHTML = '<option value="" disabled selected>-- Choisissez un chantier --</option>';
        querySnapshot.forEach((doc) => {
            const option = document.createElement('option');
            option.value = doc.data().name;
            option.textContent = doc.data().name;
            chantierSelect.appendChild(option);
        });
    } catch (error) {
        console.error("Erreur de chargement des chantiers :", error);
        chantierSelect.innerHTML = '<option value="" disabled>Erreur de chargement</option>';
    }
}

async function loadColleaguesForSelection() {
    const container = document.getElementById("manualColleaguesContainer");
    try {
        const colleaguesQuery = query(collection(db, "colleagues"), orderBy("name"));
        const colleaguesSnapshot = await getDocs(colleaguesQuery);
        const colleagueNames = colleaguesSnapshot.docs.map(doc => doc.data().name);

        const usersQuery = query(collection(db, "users"), where("status", "==", "approved"), orderBy("displayName"));
        const usersSnapshot = await getDocs(usersQuery);
        const userNames = usersSnapshot.docs.map(doc => doc.data().displayName);
        
        const uniqueNames = [...new Set([...colleagueNames, ...userNames])];
        allColleaguesCache = uniqueNames.sort((a, b) => a.localeCompare(b));
        
        selectedColleagues = [];
        renderColleaguesSelection();
    } catch (error) {
        console.error("Erreur de chargement des collègues et utilisateurs:", error);
        container.innerHTML = "<p class='text-red-500'>Erreur de chargement de la liste.</p>";
    }
}

function renderColleaguesSelection() {
    const container = document.getElementById("manualColleaguesContainer");
    container.innerHTML = ""; 

    allColleaguesCache.forEach(name => {
        const button = document.createElement("button");
        button.textContent = name;
        button.type = "button";
        const isSelected = selectedColleagues.includes(name);
        button.className = isSelected
            ? "px-4 py-2 rounded-full border bg-blue-600 text-white"
            : "px-4 py-2 rounded-full border bg-gray-200 hover:bg-gray-300";

        button.onclick = () => {
            const listIndex = selectedColleagues.indexOf(name);
            if (listIndex > -1) {
                selectedColleagues.splice(listIndex, 1);
            } else {
                selectedColleagues.push(name);
            }
            renderColleaguesSelection();
        };

        container.appendChild(button);
    });
}