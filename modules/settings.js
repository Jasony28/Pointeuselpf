// DANS : modules/settings.js

import { pageContent, currentUser, showInfoModal } from "../app.js";
import { getAuth, signOut } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db } from "../app.js";

const auth = getAuth();

// PALETTES DE THÈMES IMMERSIVES
const themes = {
    neutre: {
        name: 'Neutre',
        preview: '#ffffff',
        colors: {
            '--color-primary': '#4b5563', '--color-primary-hover': '#374151',
            '--color-background': '#f3f4f6', '--color-surface': '#ffffff',
            '--color-text-base': '#1f2937', '--color-text-muted': '#6b7280',
            '--color-border': '#e5e7eb',
        }
    },
    or: {
        name: 'Or',
        preview: '#fef9c3',
        colors: {
            '--color-primary': '#d0c338', '--color-primary-hover': '#a1921a',
            '--color-background': '#fefce8', '--color-surface': '#fef9c3',
            '--color-text-base': '#713f12', '--color-text-muted': '#a16207',
            '--color-border': '#fde68a',
        }
    },
    emeraude: {
        name: 'Émeraude',
        preview: '#dcfce7',
        colors: {
            '--color-primary': '#1fbb56', '--color-primary-hover': '#1a9f49',
            '--color-background': '#f0fdf4', '--color-surface': '#dcfce7',
            '--color-text-base': '#14532d', '--color-text-muted': '#15803d',
            '--color-border': '#bbf7d0',
        }
    },
    royal: {
        name: 'Royal',
        preview: '#dbeafe',
        colors: {
            '--color-primary': '#2262b5', '--color-primary-hover': '#1c5095',
            '--color-background': '#eff6ff', '--color-surface': '#dbeafe',
            '--color-text-base': '#1e3a8a', '--color-text-muted': '#2563eb',
            '--color-border': '#bfdbfe',
        }
    },
    rubis: {
        name: 'Rubis',
        preview: '#fee2e2',
        colors: {
            '--color-primary': '#b43737', '--color-primary-hover': '#982e2e',
            '--color-background': '#fef2f2', '--color-surface': '#fee2e2',
            '--color-text-base': '#991b1b', '--color-text-muted': '#dc2626',
            '--color-border': '#fecaca',
        }
    },
    magenta: {
        name: 'Magenta',
        preview: '#fce7f3',
        colors: {
            '--color-primary': '#cd5298', '--color-primary-hover': '#b14682',
            '--color-background': '#fdf2f8', '--color-surface': '#fce7f3',
            '--color-text-base': '#86198f', '--color-text-muted': '#c026d3',
            '--color-border': '#fbcfe8',
        }
    },
    carbone: {
    name: 'Carbone',
    preview: '#1f2937',
    colors: {
        '--color-primary': '#cd5298', '--color-primary-hover': '#b14682',
        '--color-background': '#111827', '--color-surface': '#1f1e1e',
        '--color-text-base': '#e5e7eb', // <-- NOUVELLE COULEUR (GRIS CLAIR)
        '--color-text-muted': '#9ca3af',
        '--color-border': '#374151',
    }
},
};

function applyTheme(themeName) {
    const theme = themes[themeName];
    if (!theme) return;

    for (const [key, value] of Object.entries(theme.colors)) {
        document.documentElement.style.setProperty(key, value);
    }
    localStorage.setItem('appTheme', themeName);
}
export async function render() {
    pageContent.innerHTML = `
        <div class="max-w-3xl mx-auto space-y-8">
             <div>
                <h2 class="text-3xl font-bold" style="color: var(--color-text-base);">⚙️ Paramètres</h2>
                <p style="color: var(--color-text-muted);">Gérez vos informations de profil et les réglages de l'application.</p>
            </div>

            <div style="background-color: var(--color-surface); border-color: var(--color-border);" class="border p-6 rounded-lg shadow-sm">
                <h3 class="text-xl font-semibold mb-4 border-b pb-2" style="color: var(--color-text-base); border-color: var(--color-border);">Mon Profil</h3>
                <div class="space-y-4">
                    <div>
                        <label for="displayNameInput" class="text-sm font-medium" style="color: var(--color-text-base);">Nom d'affichage</label>
                        <input id="displayNameInput" type="text" value="${currentUser.displayName}" class="w-full border p-2 rounded mt-1" style="background-color: var(--color-background); border-color: var(--color-border); color: var(--color-text-base);">
                    </div>
                    <div class="text-right">
                        <button id="saveProfileBtn" class="text-white font-bold px-6 py-2 rounded" style="background-color: var(--color-primary); transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='var(--color-primary-hover)'" onmouseout="this.style.backgroundColor='var(--color-primary)'">Enregistrer le nom</button>
                    </div>
                </div>
            </div>

            <div style="background-color: var(--color-surface); border-color: var(--color-border);" class="border p-6 rounded-lg shadow-sm">
                <h3 class="text-xl font-semibold mb-4" style="color: var(--color-text-base);">Thème de l'application</h3>
                <div id="theme-selector" class="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    ${Object.entries(themes).map(([key, theme]) => `
                        <div class="color-option p-4 rounded-lg cursor-pointer border-2 flex items-center justify-center h-20" style="background-color: ${theme.preview}; border-color: var(--color-border);" data-theme-key="${key}">
                            <p class="font-semibold text-center" style="color: ${theme.colors['--color-text-base']}">${theme.name}</p>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <div style="background-color: var(--color-surface); border-color: var(--color-border);" class="border p-6 rounded-lg shadow-sm">
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
    document.getElementById('saveProfileBtn').onclick = async () => {
        const newName = document.getElementById('displayNameInput').value.trim();
        if (newName && newName !== currentUser.displayName) {
            try {
                const userRef = doc(db, "users", currentUser.uid);
                await updateDoc(userRef, { displayName: newName });
                showInfoModal("Succès", "Votre nom a été mis à jour.");
            } catch (error) {
                showInfoModal("Erreur", "La mise à jour a échoué.");
            }
        }
    };
    
    const themeSelector = document.getElementById('theme-selector');
    const options = themeSelector.querySelectorAll('.color-option');
    const currentThemeName = localStorage.getItem('appTheme') || 'neutre';
    
    options.forEach(option => {
        if (option.dataset.themeKey === currentThemeName) {
            const primaryColor = themes[currentThemeName].colors['--color-primary'];
            option.style.borderColor = primaryColor;
            option.classList.add('ring-2');
            option.style.ringColor = primaryColor;
        }
        option.addEventListener('click', () => {
            const selectedThemeName = option.dataset.themeKey;
            applyTheme(selectedThemeName);
            render(); // On relance render() pour mettre à jour les styles et la sélection
        });
    });

    document.getElementById('logoutBtnSettings').onclick = () => signOut(auth);
}