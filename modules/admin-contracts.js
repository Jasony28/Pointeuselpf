import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent, showInfoModal } from "../app.js";
import { getUsers } from "./data-service.js";

export async function render() {
    pageContent.innerHTML = `
        <div class="max-w-7xl mx-auto space-y-6">
            <div>
                <h2 class="text-3xl font-bold tracking-tight">👤 Fiches de l'Équipe</h2>
                <p class="text-lg mt-1" style="color: var(--color-text-muted);">
                    Consultez et modifiez les informations de chaque membre.
                </p>
            </div>
            <div id="user-cards-container" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                ${Array(3).fill('').map(() => `
                    <div class="p-5 rounded-lg animate-pulse" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                        <div class="h-7 w-3/5 mb-6 rounded" style="background-color: var(--color-background);"></div>
                        <div class="space-y-4">
                            <div class="h-4 w-full rounded" style="background-color: var(--color-background);"></div>
                            <div class="h-4 w-full rounded" style="background-color: var(--color-background);"></div>
                            <div class="h-4 w-4/5 rounded" style="background-color: var(--color-background);"></div>
                        </div>
                        <div class="h-10 w-full mt-6 rounded-lg" style="background-color: var(--color-background);"></div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    displayUserCards();
}

async function displayUserCards() {
    const container = document.getElementById('user-cards-container');
    try {
        const users = await getUsers();
        const activeUsers = users.filter(user => user.status !== 'banned');
        
        container.innerHTML = ''; // Vider le squelette

        if (activeUsers.length === 0) {
            container.innerHTML = `<p class="md:col-span-3 text-center py-8" style="color: var(--color-text-muted);">Aucun utilisateur actif.</p>`;
            return;
        }

        activeUsers.forEach(user => {
            const card = document.createElement('div');
            card.className = 'p-6 rounded-xl shadow-sm transition-all duration-300';
            card.style.backgroundColor = 'var(--color-surface)';
            card.style.border = '1px solid var(--color-border)';
            card.id = `user-card-${user.id}`;
            
            renderCardView(card, user); // Affiche la carte en mode consultation
            container.appendChild(card);
        });

    } catch (error) {
        console.error("Erreur lors de l'affichage des fiches utilisateurs:", error);
        container.innerHTML = `<p class="md:col-span-3 text-red-500 text-center">Impossible de charger les fiches des utilisateurs.</p>`;
    }
}

// Affiche la carte en mode "consultation"
function renderCardView(cardElement, user) {
    const address = user.address || '';
    const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    const gsm = user.gsm || '';

    let gsmHtml;
    if (gsm) {
        gsmHtml = `
            <div id="gsm-container-${user.id}" class="gsm-trigger rounded-md -mx-2 px-2 py-1 transition-colors cursor-pointer">
                <strong>📞 GSM :</strong> ${gsm}
            </div>`;
    } else {
        gsmHtml = `<p><strong>📞 GSM :</strong> <span style="color: var(--color-text-muted);">Non défini</span></p>`;
    }

    cardElement.innerHTML = `
        <h3 class="text-2xl font-bold mb-5">${user.displayName}</h3>
        <div class="space-y-3 text-sm">
            ${gsmHtml}
            <p><strong>🏠 Adresse :</strong> ${address ? `<a href="${googleMapsUrl}" target="_blank" class="hover:underline" style="color: var(--color-primary);">${address}</a>` : '<span style="color: var(--color-text-muted);">Non définie</span>'}</p>
            <p><strong>💳 Registre Nat. :</strong> ${user.nationalRegistryNumber || '<span style="color: var(--color-text-muted);">Non défini</span>'}</p>
            <p><strong>🏦 IBAN :</strong> ${user.iban || '<span style="color: var(--color-text-muted);">Non défini</span>'}</p>
            <p><strong>🕒 Contrat :</strong> ${user.contractHours || 0} heures/semaine</p>
        </div>
        <div class="mt-6">
            <button class="edit-btn w-full font-semibold py-2 px-4 rounded-lg" style="background-color: var(--color-background); border: 1px solid var(--color-border);">Modifier</button>
        </div>
        <style>
            .gsm-trigger:hover { background-color: rgba(128, 128, 128, 0.1); }
            .gsm-action-btn { background-color: var(--color-primary); color: white; padding: 4px 10px; border-radius: 6px; font-weight: 500; }
            .gsm-action-btn:hover { opacity: 0.8; }
            .gsm-cancel-btn { font-weight: 500; padding: 4px 10px; }
        </style>
    `;

    const gsmContainer = cardElement.querySelector(`#gsm-container-${user.id}`);
    if (gsmContainer) {
        gsmContainer.addEventListener('click', () => {
            gsmContainer.classList.remove('gsm-trigger', 'cursor-pointer');
            gsmContainer.innerHTML = `
                <div class="flex items-center justify-between">
                    <span class="font-semibold text-sm">Action pour ${gsm}</span>
                    <div class="flex items-center gap-2">
                        <a href="tel:${gsm}" class="gsm-action-btn">Appeler</a>
                        <a href="sms:${gsm}" class="gsm-action-btn">Message</a>
                        <button class="gsm-cancel-btn">Annuler</button>
                    </div>
                </div>
            `;
            gsmContainer.querySelector('.gsm-cancel-btn').addEventListener('click', (e) => {
                e.stopPropagation(); 
                renderCardView(cardElement, user);
            });
        }, { once: true });
    }

    cardElement.querySelector('.edit-btn').addEventListener('click', () => {
        renderCardEdit(cardElement, user);
    });
}

// Affiche la carte en mode "édition"
function renderCardEdit(cardElement, user) {
    cardElement.innerHTML = `
        <h3 class="text-2xl font-bold mb-5">Modifier ${user.displayName}</h3>
        <div class="space-y-3">
            <div>
                <label class="block text-xs font-medium mb-1">Nom complet</label>
                <input id="displayName-${user.id}" type="text" value="${user.displayName || ''}" class="input-field">
            </div>
            <div>
                <label class="block text-xs font-medium mb-1">N° de GSM</label>
                <input id="gsm-${user.id}" type="tel" value="${user.gsm || ''}" class="input-field">
            </div>
            <div>
                <label class="block text-xs font-medium mb-1">Adresse</label>
                <input id="address-${user.id}" type="text" value="${user.address || ''}" class="input-field">
            </div>
            <div>
                <label class="block text-xs font-medium mb-1">N° Registre National</label>
                <input id="nationalRegistryNumber-${user.id}" type="text" value="${user.nationalRegistryNumber || ''}" class="input-field">
            </div>
             <div>
                <label class="block text-xs font-medium mb-1">N° de compte (IBAN)</label>
                <input id="iban-${user.id}" type="text" value="${user.iban || ''}" class="input-field" placeholder="BE00 0000 0000 0000">
            </div> 
            <div>
                <label class="block text-xs font-medium mb-1">Heures/semaine</label>
                <input id="contractHours-${user.id}" type="number" value="${user.contractHours || 0}" class="input-field">
            </div>
        </div>
        <div class="mt-6 flex gap-3">
            <button class="cancel-btn w-full font-semibold py-2 px-4 rounded-lg" style="background-color: var(--color-background); border: 1px solid var(--color-border);">Annuler</button>
            <button class="save-btn w-full font-bold text-white py-2 px-4 rounded-lg" style="background-color: var(--color-primary);">Enregistrer</button>
        </div>
        <style>.input-field { width: 100%; border-radius: 0.5rem; padding: 0.5rem; background-color: var(--color-background); border: 1px solid var(--color-border); }</style>
    `;

    cardElement.querySelector('.cancel-btn').addEventListener('click', () => {
        renderCardView(cardElement, user);
    });

    cardElement.querySelector('.save-btn').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.textContent = 'Sauvegarde...';

        const updatedData = {
            displayName: document.getElementById(`displayName-${user.id}`).value,
            gsm: document.getElementById(`gsm-${user.id}`).value,
            address: document.getElementById(`address-${user.id}`).value,
            nationalRegistryNumber: document.getElementById(`nationalRegistryNumber-${user.id}`).value,
            iban: document.getElementById(`iban-${user.id}`).value, // AJOUTÉ : Récupération de l'IBAN pour la sauvegarde
            contractHours: Number(document.getElementById(`contractHours-${user.id}`).value)
        };

        try {
            await updateDoc(doc(db, "users", user.id), updatedData);
            await getUsers(true); // Rafraîchir le cache

            const updatedUser = { ...user, ...updatedData };
            
            renderCardView(cardElement, updatedUser);

        } catch (error) {
            console.error("Erreur de mise à jour:", error);
            showInfoModal("Erreur", "La mise à jour a échoué.");
            btn.disabled = false;
            btn.textContent = 'Enregistrer';
        }
    });
}