// DANS : modules/settings.js

import { pageContent, currentUser, showInfoModal, db, themes, applyTheme } from "../app.js";
import { getAuth, signOut } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";

const auth = getAuth();

export async function render() {
    pageContent.innerHTML = `
        <div class="max-w-3xl mx-auto space-y-8">
             <div>
                <h2 class="text-3xl font-bold" style="color: var(--color-text-base);">⚙️ Paramètres</h2>
                <p style="color: var(--color-text-muted);">Gérez vos informations de profil et les réglages de l'application.</p>
            </div>

            <div class="p-6 rounded-lg shadow-sm" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                <h3 class="text-xl font-semibold mb-4 border-b pb-2" style="color: var(--color-text-base); border-color: var(--color-border);">Mon Profil</h3>
                <div class="space-y-4">
                    <div>
                        <label for="displayNameInput" class="text-sm font-medium" style="color: var(--color-text-base);">Nom d'affichage</label>
                        <input id="displayNameInput" type="text" value="${currentUser.displayName}" class="w-full border p-2 rounded mt-1" style="background-color: var(--color-background); border-color: var(--color-border); color: var(--color-text-base);">
                    </div>
                    <div class="text-right">
                        <button id="saveProfileBtn" class="text-white font-bold px-6 py-2 rounded" style="background-color: var(--color-primary);">Enregistrer le nom</button>
                    </div>
                </div>
            </div>

            <div class="p-6 rounded-lg shadow-sm" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                <h3 class="text-xl font-semibold mb-4" style="color: var(--color-text-base);">Thème de l'application</h3>
                <div id="theme-selector" class="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    ${Object.entries(themes).map(([key, theme]) => `
                        <div class="theme-option p-4 rounded-lg cursor-pointer border-2 flex items-center justify-center h-20 transition-all" style="background-color: ${theme.preview};" data-theme-key="${key}">
                            <p class="font-semibold text-center" style="color: ${theme.colors['--color-text-base']}">${theme.name}</p>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <div class="p-6 rounded-lg shadow-sm" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                 <div class="text-center">
                    <button id="logoutBtnSettings" class="bg-red-600 hover:bg-red-700 text-white font-bold px-8 py-3 rounded-lg">
                        Se déconnecter
                    </button>
                </div>
            </div>
        </div>
    `;
    setupEventListeners();
}

function setupEventListeners() {
    document.getElementById('saveProfileBtn').onclick = async () => {
        const newName = document.getElementById('displayNameInput').value.trim();
        if (newName && newName !== currentUser.displayName) {
            try {
                const userRef = doc(db, "users", currentUser.uid);
                await updateDoc(userRef, { displayName: newName });
                showInfoModal("Succès", "Votre nom a été mis à jour. Il sera visible au prochain rechargement.");
            } catch (error) {
                showInfoModal("Erreur", "La mise à jour a échoué.");
            }
        }
    };

    updateThemeSelectionUI(localStorage.getItem('appTheme') || 'neutre');

    document.querySelectorAll('.theme-option').forEach(option => {
        option.addEventListener('click', () => {
            const selectedThemeKey = option.dataset.themeKey;
            applyTheme(selectedThemeKey);
            updateThemeSelectionUI(selectedThemeKey);
        });
    });

    document.getElementById('logoutBtnSettings').onclick = () => signOut(auth);
}

function updateThemeSelectionUI(selectedKey) {
    document.querySelectorAll('.theme-option').forEach(option => {
        const primaryColor = themes[selectedKey].colors['--color-primary'];
        if (option.dataset.themeKey === selectedKey) {
            option.style.borderColor = primaryColor;
            option.style.boxShadow = `0 0 0 2px ${primaryColor}`;
        } else {
            option.style.borderColor = 'var(--color-border)';
            option.style.boxShadow = 'none';
        }
    });
}