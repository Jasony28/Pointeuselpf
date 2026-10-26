import { pageContent, currentUser, showInfoModal, showToast, db, themes, applyTheme, showUpdatesModal, getAppMode, setAppMode } from "../app.js";
import { getAuth, signOut, sendPasswordResetEmail, updateEmail, EmailAuthProvider, reauthenticateWithCredential } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";
import { doc, updateDoc, collection, query, where, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { updatesLog } from "./updates-data.js";

const auth = getAuth();

export async function render() {
    pageContent.innerHTML = `
        <div class="max-w-3xl mx-auto space-y-6 pb-12">
            <h2 class="text-3xl font-bold tracking-tight mb-6">Paramètres</h2>

            <!-- Profil -->
            <div class="settings-card p-6 rounded-lg shadow-sm" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                <h3 class="settings-section-title">Mon Profil</h3>
                <div class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium mb-1">Nom d'affichage</label>
                        <input id="displayNameInput" type="text" value="${currentUser.displayName || ''}" class="w-full border p-2 rounded" style="background-color: var(--color-background); border-color: var(--color-border);">
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-1">Rôle</label>
                        <input type="text" value="${currentUser.role === 'admin' ? 'Administrateur' : 'Employé'}" disabled class="w-full border p-2 rounded opacity-50 cursor-not-allowed" style="background-color: var(--color-background); border-color: var(--color-border);">
                    </div>
                    <div class="text-right mt-4">
                        <button id="saveProfileBtn" class="btn btn-primary">Enregistrer le profil</button>
                    </div>
                </div>
            </div>

            <!-- Sécurité -->
            <div class="settings-card p-6 rounded-lg shadow-sm" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                <h3 class="settings-section-title">Sécurité et Compte</h3>
                
                <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
                    <p class="text-sm" style="color: var(--color-text-muted);">Recevoir un e-mail pour changer votre mot de passe.</p>
                    <button id="changePasswordBtn" class="btn btn-secondary">
                        Changer le mot de passe
                    </button>
                </div>

                <div class="border-t my-4" style="border-color: var(--color-border);"></div>
                
                <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                    <div>
                        <p class="text-sm" style="color: var(--color-text-muted);">Modifier votre e-mail de connexion.</p>
                        <p class="text-xs font-semibold mt-1" style="color: var(--color-text-base);">Actuel : ${currentUser.email}</p>
                    </div>
                    <button id="changeEmailBtn" class="btn btn-secondary">
                        Changer l'e-mail
                    </button>
                </div>
            </div>

            <!-- Export PDF -->
            <div class="settings-card p-6 rounded-lg shadow-sm" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                <h3 class="settings-section-title">Gestion des Données</h3>
                <p class="text-sm" style="color: var(--color-text-muted); margin-bottom: 1rem;">Télécharger l'intégralité de votre historique de pointages.</p>
                <div class="flex">
                    <button id="exportPdfBtn" class="btn btn-secondary btn-block">
                        Exporter mon historique (PDF)
                    </button>
                </div>
            </div>

            <!-- BLOC INSTALLATION APP -->
            <div class="settings-card p-6 rounded-lg shadow-sm" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                <h3 class="settings-section-title">Télécharger l'application</h3>
                <p class="text-sm mb-4" style="color: var(--color-text-muted);">Installez la pointeuse directement sur votre écran d'accueil pour y accéder en 1 clic, comme une vraie application !</p>
                <button id="installAppBtn" class="btn btn-primary btn-lg btn-block">
                    Télécharger l'application
                </button>
            </div>

            <!-- Thèmes -->
            <div class="settings-card p-6 rounded-lg shadow-sm" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                <h3 class="settings-section-title">Thème de l'application</h3>
                <div class="segmented" role="group" aria-label="Mode d'affichage" id="mode-selector" style="width: 100%; margin-bottom: 0.5rem;">
                    <button type="button" data-mode="light" style="flex: 1;">Clair</button>
                    <button type="button" data-mode="dark" style="flex: 1;">Sombre</button>
                    <button type="button" data-mode="auto" style="flex: 1;">Automatique</button>
                </div>
                <div id="theme-selector" class="grid grid-cols-3 sm:grid-cols-5 gap-3 mt-2">
                    ${Object.entries(themes).map(([key, theme]) => `
                        <button class="theme-option flex flex-col items-center p-3 rounded-lg border-2 transition-all" data-theme-key="${key}" style="border-color: transparent;" aria-label="Thème ${theme.name}">
                            <div class="w-10 h-10 rounded-full mb-2 border shadow-inner" style="background-color: ${theme.preview}; border-color: var(--color-border);"></div>
                            <span class="text-sm font-medium" style="color: var(--color-text-base);">${theme.name}</span>
                        </button>
                    `).join('')}
                </div>
            </div>

            <!-- Nouveautés -->
            <div class="settings-card p-6 rounded-lg shadow-sm" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                <h3 class="settings-section-title">Nouveautés</h3>
                <p class="text-sm mb-4" style="color: var(--color-text-muted);">Consultez les dernières mises à jour de l'application.</p>
                <button id="showUpdatesBtn" class="btn btn-secondary">
                    Voir le journal des mises à jour
                </button>
            </div>

            <!-- Feedback -->
            <div class="settings-card p-6 rounded-lg shadow-sm" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                <h3 class="settings-section-title">Donner un feedback</h3>
                <p class="text-sm" style="color: var(--color-text-muted);">Une idée d'amélioration ? Un bug à signaler ? Vos retours sont précieux.</p>
                <textarea id="feedbackTextarea" class="w-full border p-2 rounded mt-3 h-24" style="background-color: var(--color-background); border-color: var(--color-border); color: var(--color-text-base);" placeholder="Votre idée ici..."></textarea>
                <div class="text-right mt-3">
                    <button id="sendFeedbackBtn" class="btn btn-primary">Ouvrir mon e-mail pour envoyer</button>
                </div>
            </div>

            <!-- Déconnexion -->
            <div class="settings-card p-6 rounded-lg shadow-sm" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                 <div class="text-center">
                    <button id="logoutBtnSettings" class="btn btn-danger btn-lg btn-block">
                        Déconnexion
                    </button>
                </div>
            </div>
        </div>

        <!-- Modal Changer Email -->
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
                        <button type="button" id="cancelChangeEmailBtn" class="btn btn-secondary">Annuler</button>
                        <button type="submit" id="confirmChangeEmailBtn" class="btn btn-primary">Valider</button>
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
                await updateDoc(doc(db, "users", currentUser.uid), { displayName: newName });
                currentUser.displayName = newName;
                document.getElementById('currentUserDisplay').textContent = newName;
                showInfoModal("Succès", "Votre profil a été mis à jour.");
            } catch (error) {
                console.error("Erreur de mise à jour:", error);
                showInfoModal("Erreur", "La mise à jour a échoué.");
            }
        }
    };

    // --- INSTALLATION PWA ---
    const installBtn = document.getElementById('installAppBtn');
    if (installBtn) {
        // Appli déjà installée : écran d'accueil (PWA) ou appli App Store / Play Store (Capacitor)
        const isNativeApp = !!window.Capacitor?.isNativePlatform?.();
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone || isNativeApp;
        
        if (isStandalone) {
            installBtn.innerHTML = "✅ Application déjà installée";
            installBtn.classList.remove('hover:scale-105');
            installBtn.style.backgroundColor = '#16a34a'; 
            installBtn.disabled = true;
            installBtn.style.opacity = '0.7';
        } else {
            installBtn.addEventListener('click', async () => {
                const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
                
                if (isIOS) {
                    showIOSInstallSheet();
                } else if (window.deferredPrompt || await waitForInstallPrompt(3000)) {
                    window.deferredPrompt.prompt();
                    const { outcome } = await window.deferredPrompt.userChoice;
                    if (outcome === 'accepted') {
                        installBtn.innerHTML = "✅ Application installée";
                        installBtn.style.backgroundColor = '#16a34a';
                        installBtn.disabled = true;
                    }
                    window.deferredPrompt = null;
                } else {
                    showToast("L'application est déjà installée sur cet appareil, ou ce navigateur ne permet pas l'installation.", 'info');
                }
            });
        }
    }

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

    // --- SÉCURITÉ : E-MAIL ---
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
            
            // 3. Mettre à jour Firestore
            await updateDoc(doc(db, "users", currentUser.uid), {
                email: newEmail
            });

            // 4. Succès
            showInfoModal("Succès !", "Votre e-mail a été mis à jour. Vous devrez l'utiliser lors de votre prochaine connexion.");
            emailModal.classList.add('hidden');
            document.getElementById('changeEmailForm').reset();
            currentUser.email = newEmail; 
            
            // On recharge la vue pour afficher le nouvel email
            render(); 

        } catch (error) {
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

    // --- MODE CLAIR / SOMBRE ---
    const modeButtons = document.querySelectorAll('#mode-selector [data-mode]');
    const refreshModeUI = () => modeButtons.forEach(b => b.classList.toggle('is-active', b.dataset.mode === getAppMode()));
    modeButtons.forEach(b => b.onclick = () => { setAppMode(b.dataset.mode); refreshModeUI(); });
    refreshModeUI();

    // --- NOUVEAUTÉS ---
    document.getElementById('showUpdatesBtn').onclick = () => {
        showUpdatesModal(updatesLog); 
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

// iPhone / iPad : Apple ne permet pas aux sites de lancer l'installation.
// On affiche une feuille visuelle qui montre exactement où appuyer dans Safari.
function showIOSInstallSheet() {
    document.getElementById('iosInstallSheet')?.remove();
    const shareIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>`;
    const addIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8M8 12h8"/></svg>`;
    const isSafari = /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);

    const sheet = document.createElement('div');
    sheet.id = 'iosInstallSheet';
    sheet.className = 'modal ios-install';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.innerHTML = `
        <div class="modal-panel">
            <div class="modal-body">
                <div class="ios-install-head">
                    <img src="./icons/lpf-192.png" alt="" class="ios-install-icon">
                    <div>
                        <h3 class="modal-title">Installer Pointeuse LPF</h3>
                        <p class="modal-text" style="margin-top: 0.125rem;">2 appuis, et l'appli est sur votre écran d'accueil.</p>
                    </div>
                </div>
                <ol class="ios-steps">
                    <li><span class="ios-step-num">1</span><span>Appuyez sur <span class="ios-key">${shareIcon} Partager</span> ${isSafari ? 'dans la barre en bas de Safari' : 'dans votre navigateur'}</span></li>
                    <li><span class="ios-step-num">2</span><span>Choisissez <span class="ios-key">${addIcon} Sur l'écran d'accueil</span>, puis <strong>Ajouter</strong></span></li>
                </ol>
            </div>
            <div class="modal-footer">
                <button type="button" id="closeIosInstallBtn" class="btn btn-primary btn-block">C'est compris</button>
            </div>
        </div>
        ${isSafari ? '<div class="ios-install-arrow" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v16M6 14l6 6 6-6"/></svg></div>' : ''}
    `;
    document.body.appendChild(sheet);
    sheet.querySelector('#closeIosInstallBtn').onclick = () => sheet.remove();
}

// Le navigateur peut accorder l'installation quelques instants après le chargement :
// on l'attend brièvement plutôt que d'afficher tout de suite le message de secours.
function waitForInstallPrompt(timeoutMs) {
    return new Promise(resolve => {
        const onPrompt = () => { clearTimeout(timer); setTimeout(() => resolve(!!window.deferredPrompt), 0); };
        const timer = setTimeout(() => { window.removeEventListener('beforeinstallprompt', onPrompt); resolve(false); }, timeoutMs);
        window.addEventListener('beforeinstallprompt', onPrompt, { once: true });
    });
}

function updateThemeSelectionUI(selectedKey) {
    document.querySelectorAll('.theme-option').forEach(option => {
        if (option.dataset.themeKey === selectedKey) {
            option.style.borderColor = 'var(--color-primary)';
            option.style.boxShadow = '0 0 0 2px var(--color-primary)';
        } else {
            option.style.borderColor = 'transparent';
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
        orderBy("timestamp", "asc") 
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
        if (!data.endTime) return; 

        const start = new Date(data.timestamp);
        const end = new Date(data.endTime);
        const pauseMs = data.pauseDurationMs || 0;
        const durationMs = (end - start) - pauseMs;
        if (durationMs <= 0) return;

        const dateKey = start.toISOString().split('T')[0]; 
        
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
                0: { cellWidth: 35 }, 
                1: { cellWidth: 15 }, 
                2: { cellWidth: 15 }, 
                3: { cellWidth: 18 }, 
                4: { cellWidth: 35 }, 
                5: { cellWidth: 'auto'} 
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