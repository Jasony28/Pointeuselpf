import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent, showInfoModal } from "../app.js";
import { getUsers } from "./data-service.js";

export async function render() {
    pageContent.innerHTML = `
        <div class="max-w-7xl mx-auto space-y-6">
            <div>
                <h2 class="text-3xl font-bold tracking-tight">Fiches de l'Équipe</h2>
                <p class="text-lg mt-1" style="color: var(--color-text-muted);">
                    Consultez et modifiez les informations de chaque membre, y compris l'historique des contrats.
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

    // --- AFFICHAGE DE L'HISTORIQUE DES CONTRATS ---
    let contractHtml = '<div class="mt-2 p-2 rounded-lg" style="background-color: var(--color-background); border: 1px solid var(--color-border);">';
    contractHtml += '<strong>🕒 Historique des contrats :</strong><ul class="ml-4 mt-1 space-y-1 list-disc">';
    if (user.contractHistory && user.contractHistory.length > 0) {
        // Trie pour afficher le plus récent en premier
        const sorted = [...user.contractHistory].sort((a,b) => b.startDate.localeCompare(a.startDate));
        sorted.forEach(c => {
            const dateStr = new Date(c.startDate).toLocaleDateString('fr-FR');
            contractHtml += `<li style="color: var(--color-text-muted);">Depuis le ${dateStr} : <strong style="color: var(--color-primary);">${c.hours}h/sem</strong></li>`;
        });
    } else {
        contractHtml += `<li style="color: var(--color-text-muted);">Fixe : <strong style="color: var(--color-primary);">${user.contractHours || 0}h/sem</strong> (Ancien système)</li>`;
    }
    contractHtml += '</ul></div>';

    cardElement.innerHTML = `
        <h3 class="text-2xl font-bold mb-5">${user.displayName}</h3>
        <div class="space-y-3 text-sm">
            ${gsmHtml}
            <p><strong>🏠 Adresse :</strong> ${address ? `<a href="${googleMapsUrl}" target="_blank" class="hover:underline" style="color: var(--color-primary);">${address}</a>` : '<span style="color: var(--color-text-muted);">Non définie</span>'}</p>
            <p><strong>💳 Registre Nat. :</strong> ${user.nationalRegistryNumber || '<span style="color: var(--color-text-muted);">Non défini</span>'}</p>
            <p><strong>🏦 IBAN :</strong> ${user.iban || '<span style="color: var(--color-text-muted);">Non défini</span>'}</p>
            ${contractHtml}
        </div>
        <div class="mt-6">
            <button class="edit-btn w-full font-semibold py-2 px-4 rounded-lg hover:opacity-80 transition-opacity" style="background-color: var(--color-background); border: 1px solid var(--color-border);">Modifier le profil</button>
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
            
            <div class="p-3 rounded-lg mt-4" style="background-color: var(--color-background); border: 1px solid var(--color-border);">
                <label class="block text-sm font-bold mb-2">Historique des contrats (H/sem)</label>
                <div id="contractHistoryContainer-${user.id}" class="space-y-2 mb-3"></div>
                <button type="button" id="addContractBtn-${user.id}" class="text-xs font-bold px-2 py-1 rounded" style="color: var(--color-primary); background-color: var(--color-surface); border: 1px solid var(--color-border);">+ Ajouter une période</button>
            </div>
        </div>
        <div class="mt-6 flex gap-3">
            <button class="cancel-btn w-full font-semibold py-2 px-4 rounded-lg" style="background-color: var(--color-background); border: 1px solid var(--color-border);">Annuler</button>
            <button class="save-btn w-full font-bold text-white py-2 px-4 rounded-lg" style="background-color: var(--color-primary);">Enregistrer</button>
        </div>
        <style>
            .input-field { width: 100%; border-radius: 0.5rem; padding: 0.5rem; background-color: var(--color-background); border: 1px solid var(--color-border); }
        </style>
    `;

    // --- GESTION DYNAMIQUE DE L'HISTORIQUE ---
    let currentHistory = user.contractHistory ? [...user.contractHistory] : [];
    // Migration de l'ancien système vers le nouveau
    if (currentHistory.length === 0 && user.contractHours) {
        currentHistory.push({ startDate: '2024-01-01', hours: user.contractHours });
    }

    const historyContainer = document.getElementById(`contractHistoryContainer-${user.id}`);
    
    function drawHistory() {
        historyContainer.innerHTML = currentHistory.map((c, index) => `
            <div class="flex items-center gap-2">
                <span class="text-xs">Dès le :</span>
                <input type="date" class="input-field hist-date flex-1 !p-1 !text-xs" value="${c.startDate}" data-index="${index}">
                <input type="number" class="input-field hist-hours w-16 !p-1 !text-xs text-center" value="${c.hours}" data-index="${index}" placeholder="Heures">
                <button type="button" class="text-red-500 font-bold px-2 delete-hist-btn" data-index="${index}" title="Supprimer ce contrat">✖</button>
            </div>
        `).join('');

        historyContainer.querySelectorAll('.hist-date').forEach(el => el.addEventListener('change', (e) => {
            currentHistory[e.target.dataset.index].startDate = e.target.value;
        }));
        historyContainer.querySelectorAll('.hist-hours').forEach(el => el.addEventListener('change', (e) => {
            currentHistory[e.target.dataset.index].hours = Number(e.target.value);
        }));
        historyContainer.querySelectorAll('.delete-hist-btn').forEach(el => el.addEventListener('click', (e) => {
            currentHistory.splice(e.target.dataset.index, 1);
            drawHistory();
        }));
    }
    
    drawHistory();

    document.getElementById(`addContractBtn-${user.id}`).addEventListener('click', () => {
        const today = new Date().toISOString().split('T')[0];
        currentHistory.push({ startDate: today, hours: 38 }); // 38h par défaut
        drawHistory();
    });
    // ----------------------------------------

    cardElement.querySelector('.cancel-btn').addEventListener('click', () => {
        renderCardView(cardElement, user);
    });

    cardElement.querySelector('.save-btn').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.textContent = 'Sauvegarde...';

        // Nettoyage et tri de l'historique
        currentHistory = currentHistory.filter(c => c.startDate && c.hours); // Évite les cases vides
        currentHistory.sort((a,b) => new Date(a.startDate) - new Date(b.startDate)); // Trie chronologiquement

        // Déduit le contrat ACTUEL pour la rétrocompatibilité du reste de l'app
        let currentHours = 0;
        const today = new Date().toISOString().split('T')[0];
        const activeContract = currentHistory.filter(c => c.startDate <= today).pop();
        if (activeContract) currentHours = activeContract.hours;
        else if (currentHistory.length > 0) currentHours = currentHistory[0].hours;

        const updatedData = {
            displayName: document.getElementById(`displayName-${user.id}`).value,
            gsm: document.getElementById(`gsm-${user.id}`).value,
            address: document.getElementById(`address-${user.id}`).value,
            nationalRegistryNumber: document.getElementById(`nationalRegistryNumber-${user.id}`).value,
            iban: document.getElementById(`iban-${user.id}`).value,
            contractHistory: currentHistory, // Le nouveau système
            contractHours: currentHours // Sécurité : on garde la variable classique à jour !
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