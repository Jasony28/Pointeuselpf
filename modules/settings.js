// DANS : modules/settings.js

import { pageContent, currentUser, showInfoModal } from "../app.js";
import { getAuth, signOut } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db } from "../app.js";

const auth = getAuth();

// ## VOS COULEURS PERSONNALISÉES SONT INTÉGRÉES ICI ##
const themeColors = [
    { name: '', value: '#f3f4f6' }, // Gris clair
    { name: '', value: '#d0c338ff' },
    { name: '', value: '#1fbb56ff' },
    { name: '', value: '#2262b5ff' },
    { name: '', value: '#b43737ff' },
     { name: '', value: '#1f1e1eff' },
    { name: '', value: '#cd5298ff' }
];

export async function render() {
    pageContent.innerHTML = `
        <div class="max-w-3xl mx-auto space-y-8">
            <div>
                <h2 class="text-3xl font-bold">⚙️ Paramètres</h2>
                <p class="text-gray-600">Gérez vos informations de profil et les réglages de l'application.</p>
            </div>

            <div class="bg-white p-6 rounded-lg shadow-sm">
                <h3 class="text-xl font-semibold mb-4 border-b pb-2">Mon Profil</h3>
                <div class="space-y-4">
                    <div>
                        <label for="displayNameInput" class="text-sm font-medium">Nom d'affichage</label>
                        <input id="displayNameInput" type="text" value="${currentUser.displayName}" class="w-full border p-2 rounded mt-1">
                    </div>
                    <div class="text-right">
                        <button id="saveProfileBtn" class="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-2 rounded">Enregistrer le nom</button>
                    </div>
                </div>
            </div>

            <div class="bg-white p-6 rounded-lg shadow-sm">
                <h3 class="text-xl font-semibold mb-4">Thème de l'application</h3>
                <div id="theme-selector" class="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    ${themeColors.map(color => `
                        <div class="color-option p-4 rounded-lg cursor-pointer border-2" style="background-color: ${color.value};" data-color-value="${color.value}">
                            <p class="font-semibold text-center text-gray-800 mix-blend-difference">${color.name}</p>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <div class="bg-white p-6 rounded-lg shadow-sm">
                <h3 class="text-xl font-semibold mb-4 border-b pb-2">Sécurité</h3>
                <div class="text-center">
                    <button id="logoutBtnSettings" class="bg-red-600 hover:bg-red-700 text-white font-bold px-8 py-3 rounded-lg">
                        Se déconnecter
                    </button>
                </div>
            </div>
        </div>
    `;

    setTimeout(setupEventListeners, 0);
}

function setupEventListeners() {
    // ---- Logique pour sauvegarder le nouveau nom ----
    document.getElementById('saveProfileBtn').onclick = async () => {
        const newName = document.getElementById('displayNameInput').value.trim();
        if (newName && newName !== currentUser.displayName) {
            try {
                const userRef = doc(db, "users", currentUser.uid);
                await updateDoc(userRef, { displayName: newName });
                showInfoModal("Succès", "Votre nom a été mis à jour. La synchronisation dans l'historique peut prendre un instant.");
            } catch (error) {
                showInfoModal("Erreur", "La mise à jour a échoué.");
            }
        }
    };
    
    // ---- Logique pour la sélection du thème ----
    const themeSelector = document.getElementById('theme-selector');
    const options = themeSelector.querySelectorAll('.color-option');
    const currentTheme = localStorage.getItem('appThemeColor') || '#f3f4f6';
    
    options.forEach(option => {
        if (option.dataset.colorValue === currentTheme) {
            option.classList.add('border-purple-600');
        }
        option.addEventListener('click', () => {
            const selectedColor = option.dataset.colorValue;
            document.body.style.backgroundColor = selectedColor;
            localStorage.setItem('appThemeColor', selectedColor);
            options.forEach(opt => opt.classList.remove('border-purple-600'));
            option.classList.add('border-purple-600');
        });
    });

    // ---- Logique pour la déconnexion ----
    document.getElementById('logoutBtnSettings').onclick = () => {
        signOut(auth);
    };
}