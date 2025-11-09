// DANS : modules/settings.js

import { pageContent, currentUser, showInfoModal, db, themes, applyTheme, showUpdatesModal } from "../app.js";
// MODIFIÉ : Ajout des fonctions de re-authentification et de mise à jour d'e-mail
import { getAuth, signOut, sendPasswordResetEmail, updateEmail, EmailAuthProvider, reauthenticateWithCredential } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";
import { doc, updateDoc, collection, query, where, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { updatesLog } from "./updates-data.js";

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
                <h3 class="text-xl font-semibold mb-4 border-b pb-2" style="color: var(--color-text-base); border-color: var(--color-border);">🛡️ Sécurité et Compte</h3>
                
                <div class="flex justify-between items-center">
                    <p class="text-sm" style="color: var(--color-text-muted);">Recevoir un e-mail pour changer votre mot de passe.</p>
                    <button id="changePasswordBtn" class="font-bold px-6 py-2 rounded transition-colors" style="background-color: var(--color-background); border: 1px solid var(--color-border);">
                        Changer le mot de passe
                    </button>
                </div>

                <div class="border-t my-4" style="border-color: var(--color-border);"></div>
                <div class="flex justify-between items-center">
                    <p class="text-sm" style="color: var(--color-text-muted);">Modifier votre e-mail de connexion.</p>
                    <button id="changeEmailBtn" class="font-bold px-6 py-2 rounded transition-colors" style="background-color: var(--color-background); border: 1px solid var(--color-border);">
                        Changer l'e-mail
                    </button>
                </div>
            </div>

            <div class="p-6 rounded-lg shadow-sm" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                <h3 class="text-xl font-semibold mb-4 border-b pb-2" style="color: var(--color-text-base); border-color: var(--color-border);">🗂️ Gestion des Données</h3>
                <p class="text-sm" style="color: var(--color-text-muted); margin-bottom: 1rem;">Télécharger l'intégralité de votre historique de pointages.</p>
                <div class="flex">
                    <button id="exportPdfBtn" class="font-bold w-full px-6 py-2 rounded transition-colors" style="background-color: var(--color-background); border: 1px solid var(--color-primary); color: var(--color-primary);">
                        Exporter mon historique (PDF)
                    </button>
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
                <h3 class="text-xl font-semibold mb-4 border-b pb-2" style="color: var(--color-text-base); border-color: var(--color-border);">À propos de l'application</h3>
                <div class="flex justify-between items-center">
                    <p class="text-sm" style="color: var(--color-text-muted);">Consultez les dernières améliorations et corrections.</p>
                    <button id="showUpdatesBtn" class="font-bold px-6 py-2 rounded transition-colors" style="background-color: var(--color-background); border: 1px solid var(--color-primary); color: var(--color-primary);">
                        Voir les nouveautés
                    </button>
                </div>
            </div>

            <div class="p-6 rounded-lg shadow-sm" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                <h3 class="text-xl font-semibold mb-4 border-b pb-2" style="color: var(--color-text-base); border-color: var(--color-border);">Donner un feedback</h3>
                <p class="text-sm" style="color: var(--color-text-muted);">Une idée d'amélioration ? Un bug à signaler ? Vos retours sont précieux.</p>
                <textarea id="feedbackTextarea" class="w-full border p-2 rounded mt-3 h-24" style="background-color: var(--color-background); border-color: var(--color-border); color: var(--color-text-base);" placeholder="Votre idée ici..."></textarea>
                <div class="text-right mt-3">
                    <button id="sendFeedbackBtn" class="text-white font-bold px-6 py-2 rounded" style="background-color: var(--color-primary);">Ouvrir mon e-mail pour envoyer</button>
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

        <div id="changeEmailModal" class="hidden fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-4">
            <div class="p-6 rounded-lg shadow-xl w-full max-w-sm" style="background-color: var(--color-surface);">
                <h3 class="text-xl font-bold mb-4">Changer l'e-mail de connexion</h3>
                <form id="changeEmailForm" class="space-y-4">
                    <div>
                        <label for="newEmailInput" class="block text-sm font-medium mb-1">Nouvel e-mail</label>
                        <input id="newEmailInput" type="email" required class="w-full border p-2 rounded" style="background-color: var(--color-background); border-color: var(--color-border);">
                    </div>
                    <div>
                        <label for="currentPasswordInput" class="block text-sm font-medium mb-1">Mot de passe actuel (pour vérification)</label>
                        <input id="currentPasswordInput" type="password" required class="w-full border p-2 rounded" style="background-color: var(--color-background); border-color: var(--color-border);">
                    </div>
                    <div class="flex justify-end gap-4 pt-4">
                        <button type="button" id="cancelChangeEmailBtn" class="font-bold px-6 py-2 rounded" style="background-color: var(--color-background); border: 1px solid var(--color-border);">Annuler</button>
                        <button type="submit" id="confirmChangeEmailBtn" class="text-white font-bold px-6 py-2 rounded" style="background-color: var(--color-primary);">Valider</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    setupEventListeners();
}

function setupEventListeners() {
    // --- PROFIL ---
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

    // --- SÉCURITÉ : MOT DE PASSE ---
    document.getElementById('changePasswordBtn').onclick = async () => {
        try {
            await sendPasswordResetEmail(auth, currentUser.email);
            showInfoModal("E-mail envoyé", `Un e-mail pour changer votre mot de passe a été envoyé à ${currentUser.email}.`);
        } catch (error) {
            console.error(error);
            showInfoModal("Erreur", "Impossible d'envoyer l'e-mail de réinitialisation.");
        }
    };

    // --- SÉCURITÉ : E-MAIL (NOUVEAU) ---
    const emailModal = document.getElementById('changeEmailModal');
    document.getElementById('changeEmailBtn').onclick = () => {
        emailModal.classList.remove('hidden');
    };
    document.getElementById('cancelChangeEmailBtn').onclick = () => {
        emailModal.classList.add('hidden');
        document.getElementById('changeEmailForm').reset();
    };
    document.getElementById('changeEmailForm').onsubmit = async (e) => {
        e.preventDefault();
        const newEmail = document.getElementById('newEmailInput').value;
        const currentPassword = document.getElementById('currentPasswordInput').value;
        const confirmBtn = document.getElementById('confirmChangeEmailBtn');

        if (!newEmail || !currentPassword) {
            showInfoModal("Erreur", "Veuillez remplir les deux champs.");
            return;
        }

        confirmBtn.disabled = true;
        confirmBtn.textContent = "Vérification...";

        try {
            // 1. Re-authentifier l'utilisateur
            const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
            await reauthenticateWithCredential(auth.currentUser, credential);

            // 2. Si l'authentification réussit, mettre à jour l'e-mail
            confirmBtn.textContent = "Mise à jour...";
            await updateEmail(auth.currentUser, newEmail);
            
            // 3. Mettre à jour Firestore (bonne pratique)
            await updateDoc(doc(db, "users", currentUser.uid), {
                email: newEmail
            });

            // 4. Succès
            showInfoModal("Succès !", "Votre e-mail a été mis à jour. Vous devrez l'utiliser lors de votre prochaine connexion.");
            emailModal.classList.add('hidden');
            document.getElementById('changeEmailForm').reset();
            // Mettre à jour l'objet currentUser localement
            currentUser.email = newEmail; 

        } catch (error) {
            // Gérer les erreurs
            console.error("Erreur de mise à jour e-mail:", error.code);
            if (error.code === 'auth/wrong-password') {
                showInfoModal("Erreur", "Le mot de passe actuel est incorrect.");
            } else if (error.code === 'auth/email-already-in-use') {
                showInfoModal("Erreur", "Ce nouvel e-mail est déjà utilisé par un autre compte.");
            } else if (error.code === 'auth/invalid-email') {
                showInfoModal("Erreur", "Le format du nouvel e-mail est invalide.");
            } else {
                showInfoModal("Erreur", "Une erreur est survenue. " + error.message);
            }
        } finally {
            confirmBtn.disabled = false;
            confirmBtn.textContent = "Valider";
        }
    };


    // --- EXPORT PDF ---
    document.getElementById('exportPdfBtn').onclick = async (e) => {
        const btn = e.currentTarget;
        btn.textContent = 'Génération...';
        btn.disabled = true;
        try {
            await exportUserHistoryToPDF();
        } catch (error) {
            console.error("Erreur Export PDF:", error);
            showInfoModal("Erreur", "L'exportation PDF a échoué. " + error.message);
        }
        btn.textContent = 'Exporter mon historique (PDF)';
        btn.disabled = false;
    };

    // --- THÈMES ---
    updateThemeSelectionUI(localStorage.getItem('appTheme') || 'neutre');
    document.querySelectorAll('.theme-option').forEach(option => {
        option.addEventListener('click', () => {
            const selectedThemeKey = option.dataset.themeKey;
            applyTheme(selectedThemeKey);
            updateThemeSelectionUI(selectedThemeKey);
        });
    });

    // --- NOUVEAUTÉS ---
    document.getElementById('showUpdatesBtn').onclick = () => {
        showUpdatesModal(updatesLog); // Affiche toutes les mises à jour
    };

    // --- FEEDBACK ---
    document.getElementById('sendFeedbackBtn').onclick = () => {
        const feedbackBody = document.getElementById('feedbackTextarea').value;
        if (feedbackBody.trim() === '') {
            showInfoModal("Texte vide", "Veuillez écrire votre idée avant de l'envoyer.");
            return;
        }
        const mailtoEmail = 'jasonpougin1@gmail.com';
        const mailtoSubject = 'Feedback Pointeuse App';
        const fullBody = `Feedback de : ${currentUser.displayName} (Email: ${currentUser.email})\n-------------------------------------------------\n\n${feedbackBody}`;
        const mailtoLink = `mailto:${mailtoEmail}?subject=${encodeURIComponent(mailtoSubject)}&body=${encodeURIComponent(fullBody)}`;
        try {
            window.location.href = mailtoLink;
        } catch (error) {
            console.error("Erreur mailto:", error);
            showInfoModal("Erreur", "Impossible d'ouvrir l'application d'e-mail.");
        }
    };

    // --- DÉCONNEXION ---
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

/**
 * Formate des millisecondes en "Xh YYm"
 */
function formatMsToHHm(ms) {
    if (!ms || ms <= 0) return '0h 00m';
    const totalMinutes = Math.floor(ms / 60000); 
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}

/**
 * Récupère tous les pointages et les groupe par jour (formaté).
 */
async function fetchAndGroupPointages() {
    const q = query(
        collection(db, "pointages"),
        where("uid", "==", currentUser.uid),
        orderBy("timestamp", "asc") // Tri ascendant pour le PDF
    );
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
        showInfoModal("Info", "Vous n'avez aucun pointage à exporter.");
        return null;
    }

    const timeFormat = { hour: '2-digit', minute: '2-digit' };
    const dateFormat = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
    
    const groupedData = new Map();
    let totalExportMs = 0;

    querySnapshot.forEach(doc => {
        const data = doc.data();
        if (!data.endTime) return; // Ignorer les pointages non terminés

        const start = new Date(data.timestamp);
        const end = new Date(data.endTime);
        const pauseMs = data.pauseDurationMs || 0;
        const durationMs = (end - start) - pauseMs;
        if (durationMs <= 0) return;

        const dateKey = start.toISOString().split('T')[0]; // Clé "YYYY-MM-DD"
        
        if (!groupedData.has(dateKey)) {
            groupedData.set(dateKey, {
                dateDisplay: start.toLocaleDateString('fr-FR', dateFormat),
                entries: [],
                totalDayMs: 0
            });
        }

        const dayData = groupedData.get(dateKey);
        
        dayData.totalDayMs += durationMs; 
        totalExportMs += durationMs; 

        dayData.entries.push({
            chantier: data.chantier || '',
            startTime: start.toLocaleTimeString('fr-FR', timeFormat),
            endTime: end.toLocaleTimeString('fr-FR', timeFormat),
            duration: formatMsToHHm(durationMs), 
            colleagues: (data.colleagues || []).join(', '),
            notes: (data.notes || '').replace(/\n/g, ' ') 
        });
    });
    
    if (groupedData.size === 0) {
         showInfoModal("Info", "Aucun pointage complet à exporter.");
        return null;
    }

    return { groupedData, totalExportMs };
}

/**
 * Exporte l'historique complet de l'utilisateur en PDF.
 */
async function exportUserHistoryToPDF() {
    const exportData = await fetchAndGroupPointages();
    if (!exportData) return; 

    const { groupedData, totalExportMs } = exportData;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    let startY = 20; 

    // --- 1. TITRE GÉNÉRAL ---
    doc.setFontSize(18);
    doc.setFont(undefined, 'bold');
    doc.text("Mon Historique de Pointages", 14, startY);
    startY += 8;

    doc.setFontSize(11);
    doc.setFont(undefined, 'normal');
    doc.text(`Export pour : ${currentUser.displayName}`, 14, startY);
    startY += 5;
    doc.text(`Date de l'export : ${new Date().toLocaleDateString('fr-FR')}`, 14, startY);
    startY += 5;
    doc.setFont(undefined, 'bold');
    doc.text(`Total des heures exportées : ${formatMsToHHm(totalExportMs)}`, 14, startY);
    startY += 12; 

    // --- 2. DÉFINITION DES COLONNES DU TABLEAU ---
    const tableHeaders = ["Chantier", "Début", "Fin", "Durée", "Collègues", "Notes"];
    
    // --- 3. BOUCLE SUR CHAQUE JOURNÉE ---
    for (const [dateKey, dayData] of groupedData.entries()) {
        
        if (startY > 240) { 
            doc.addPage();
            startY = 20; 
        }

        // --- Titre du Jour ---
        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.text(dayData.dateDisplay, 14, startY);
        startY += 8;

        // --- Préparation des données du tableau ---
        const tableBody = dayData.entries.map(e => [
            e.chantier,
            e.startTime,
            e.endTime,
            e.duration,
            e.colleagues,
            e.notes
        ]);
        
        // --- Génération du Tableau ---
        doc.autoTable({
            head: [tableHeaders],
            body: tableBody,
            startY: startY,
            theme: 'striped',
            headStyles: { fillColor: [41, 128, 185] }, 
            styles: { fontSize: 8 },
            columnStyles: {
                0: { cellWidth: 35 }, // Chantier
                1: { cellWidth: 15 }, // Début
                2: { cellWidth: 15 }, // Fin
                3: { cellWidth: 18 }, // Durée
                4: { cellWidth: 35 }, // Collègues
                5: { cellWidth: 'auto'} // Notes
            },
            
            didDrawPage: (data) => {
                const pageNum = doc.internal.getNumberOfPages();
                const pageHeight = doc.internal.pageSize.getHeight();
                
                doc.setFontSize(10);
                doc.setFont(undefined, 'normal');
                
                doc.text(
                    `Page ${pageNum}`, 
                    105, 
                    pageHeight - 10, 
                    { align: 'center' } 
                );
            }
        });

        if (doc.autoTable.previous) {
            startY = doc.autoTable.previous.finalY;
        } else {
            startY += 10; 
        }

        // --- Total de la Journée ---
        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        
        let totalY = startY + 10;
        
        if (totalY > 280) {
            doc.addPage();
            totalY = 20;
        }

        doc.text(
            `Total Journée : ${formatMsToHHm(dayData.totalDayMs)}`,
            196, 
            totalY, 
            { align: 'right' }
        );
        
        startY = totalY + 10; 
    }

    // --- 4. SAUVEGARDE DU FICHIER ---
    doc.save(`Historique_Pointages_${currentUser.displayName}.pdf`);
}