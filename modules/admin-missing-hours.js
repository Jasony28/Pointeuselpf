import { collection, query, where, getDocs, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent, currentUser, showInfoModal } from "../app.js";

const LOGO_BASE64 = ""; // Colle ici ton code base64

let chantiersCache = [];
let currentReportData = [];
let periodOffset = 0; // NOUVEAU : Permet de voyager dans le temps (-1, 0, +1...)

// Fonction utilitaire pour formater les minutes en HhMM
function formatTime(minutes) {
    if (minutes <= 0) return "0h00";
    const h = Math.floor(minutes / 60);
    const m = Math.floor(minutes % 60);
    return `${h}h${m.toString().padStart(2, '0')}`;
}

export async function render() {
    pageContent.innerHTML = `
        <div class="max-w-6xl mx-auto space-y-6">
            <div class="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 mb-6">
                <div>
                    <h2 class="text-3xl font-bold tracking-tight" style="color: var(--color-text-base);">Écarts d'heures</h2>
                    <p class="text-sm mt-1" style="color: var(--color-text-muted);">Analyse de rentabilité : Prévu vs Réalisé</p>
                </div>
                
                <!-- NOUVELLE BARRE DE NAVIGATION TEMPORELLE -->
                <div class="flex flex-wrap items-center gap-3">
                    <select id="missingHoursPeriod" class="border font-semibold p-2 rounded-lg cursor-pointer text-sm" style="background-color: var(--color-background); border-color: var(--color-border);">
                        <option value="week" selected>Vue par Semaine</option>
                        <option value="month">Vue par Mois</option>
                        <option value="year">Vue par Année</option>
                    </select>

                    <div class="flex items-center rounded-lg p-1" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                        <button id="prevPeriodBtn" class="nav-arrow" aria-label="Précédent"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg></button>
                        <span id="currentPeriodLabel" class="font-bold min-w-[160px] text-center text-sm" style="color: var(--color-primary);">Cette semaine</span>
                        <button id="nextPeriodBtn" class="nav-arrow" aria-label="Suivant"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></button>
                    </div>

                    <button id="exportPdfBtn" class="bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 shadow-sm">
                        📥 Exporter PDF
                    </button>
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div class="p-6 rounded-xl border shadow-sm flex flex-col justify-center" style="background-color: var(--color-surface); border-color: var(--color-border);">
                    <p class="text-xs uppercase font-bold tracking-wider" style="color: var(--color-text-muted);">Total Heures Manquantes</p>
                    <p id="totalMissingDisplay" class="text-4xl font-black text-red-600 mt-2">0h00</p>
                </div>
                <div class="p-6 rounded-xl border shadow-sm flex flex-col justify-center" style="background-color: var(--color-surface); border-color: var(--color-border);">
                    <p class="text-xs uppercase font-bold tracking-wider" style="color: var(--color-text-muted);">Heures Réalisées</p>
                    <p id="totalRealizedDisplay" class="text-4xl font-black text-green-600 mt-2">0h00</p>
                </div>
                <div class="p-6 rounded-xl border shadow-sm flex flex-col justify-center" style="background-color: var(--color-surface); border-color: var(--color-border);">
                    <p class="text-xs uppercase font-bold tracking-wider" style="color: var(--color-text-muted);">Objectif Global</p>
                    <p id="totalPlannedDisplay" class="text-4xl font-black text-blue-600 mt-2">0h00</p>
                </div>
            </div>

            <div class="p-6 rounded-xl border shadow-sm" style="background-color: var(--color-surface); border-color: var(--color-border);">
                <div class="flex justify-between items-center mb-6">
                    <h3 class="text-xl font-bold">Détails par chantiers</h3>
                    <button id="refreshDataBtn" class="text-sm font-semibold hover:underline" style="color: var(--color-primary);">↻ Actualiser</button>
                </div>
                <div id="missingHoursList" class="space-y-4">
                    <p class="text-center py-8" style="color: var(--color-text-muted);">Calcul des écarts en cours...</p>
                </div>
            </div>
        </div>

        <!-- MODALE D'AJOUT MANUEL LE PLUS SIMPLE POSSIBLE -->
        <div id="manualEntryModal" class="hidden fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-4">
            <div class="p-6 rounded-xl shadow-2xl w-full max-w-xs" style="background-color: var(--color-surface);">
                <h3 class="text-2xl font-black mb-1">Compenser un écart</h3>
                <p id="modalChantierName" class="text-sm font-bold mb-6" style="color: var(--color-primary);"></p>
                
                <form id="manualEntryForm" class="space-y-5">
                    <input type="hidden" id="entryChantier">

                    <div class="grid grid-cols-2 gap-4 p-4 rounded-lg" style="background-color: var(--color-background); border: 1px solid var(--color-border);">
                        <div>
                            <label class="block text-sm font-bold mb-1 text-center" style="color: var(--color-primary);">Heures (+)</label>
                            <input type="number" id="entryHours" min="0" placeholder="ex: 4" class="w-full border p-3 rounded-lg text-2xl font-black text-center" required style="background-color: var(--color-surface); border-color: var(--color-border);">
                        </div>
                        <div>
                            <label class="block text-sm font-bold mb-1 text-center" style="color: var(--color-primary);">Minutes (+)</label>
                            <input type="number" id="entryMinutes" min="0" max="59" value="0" class="w-full border p-3 rounded-lg text-2xl font-black text-center" required style="background-color: var(--color-surface); border-color: var(--color-border);">
                        </div>
                    </div>

                    <div class="flex justify-between gap-3 mt-6 pt-4 border-t" style="border-color: var(--color-border);">
                        <button type="button" id="closeModalBtn" class="px-4 py-2 rounded-lg font-bold" style="background-color: var(--color-background); border: 1px solid var(--color-border);">Annuler</button>
                        <button type="submit" id="saveEntryBtn" class="flex-1 bg-green-600 hover:bg-green-700 text-white font-black px-6 py-2 rounded-lg transition-colors shadow-md">Valider</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    // Réinitialiser l'offset au chargement initial
    periodOffset = 0;
    
    setupEventListeners();
    await loadInitialData();
    await calculateAndDisplayReport();
}

/**
 * Calcul intelligent des périodes avec gestion du voyage dans le temps (offset)
 */
function getDateBoundaries(period, offset) {
    const date = new Date();
    let start, end, label;

    if (period === 'week') {
        date.setDate(date.getDate() + (offset * 7));
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Lundi
        start = new Date(date.setDate(diff));
        start.setHours(0, 0, 0, 0);
        
        end = new Date(start);
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);
        
        label = `Du ${start.toLocaleDateString('fr-FR')} au ${end.toLocaleDateString('fr-FR')}`;
        if (offset === 0) label = "Cette semaine";
    } 
    else if (period === 'month') {
        date.setMonth(date.getMonth() + offset);
        start = new Date(date.getFullYear(), date.getMonth(), 1);
        end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
        
        label = start.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
        label = label.charAt(0).toUpperCase() + label.slice(1);
        if (offset === 0) label = "Ce mois-ci";
    } 
    else if (period === 'year') {
        date.setFullYear(date.getFullYear() + offset);
        start = new Date(date.getFullYear(), 0, 1);
        end = new Date(date.getFullYear(), 11, 31, 23, 59, 59, 999);
        
        label = `Année ${date.getFullYear()}`;
        if (offset === 0) label = "Cette année";
    }

    return { start, end, label };
}

async function loadInitialData() {
    try {
        const cSnap = await getDocs(collection(db, "chantiers"));
        chantiersCache = cSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error("Erreur chargement données de base:", error);
    }
}

async function calculateAndDisplayReport() {
    const listContainer = document.getElementById('missingHoursList');
    listContainer.innerHTML = `<p class="text-center py-8" style="color: var(--color-text-muted);">Analyse de la base de données en cours...</p>`;
    
    const period = document.getElementById('missingHoursPeriod').value;
    const { start, end, label } = getDateBoundaries(period, periodOffset);
    
    // Mise à jour de l'étiquette au-dessus
    document.getElementById('currentPeriodLabel').textContent = label;

    try {
        const q = query(collection(db, "pointages"), 
            where("timestamp", ">=", start.toISOString()), 
            where("timestamp", "<=", end.toISOString())
        );
        const pointagesSnap = await getDocs(q);
        
        const chantierStats = new Map();

        pointagesSnap.forEach(doc => {
            const data = doc.data();
            if (!data.endTime) return;
            
            const cNameLower = (data.chantier || "").toLowerCase().trim();
            const durationMs = new Date(data.endTime) - new Date(data.timestamp) - (data.pauseDurationMs || 0);
            const dayString = data.timestamp.split('T')[0]; 
            
            if (!chantierStats.has(cNameLower)) {
                chantierStats.set(cNameLower, { realizedMin: 0, uniqueDays: new Set() });
            }
            
            const stats = chantierStats.get(cNameLower);
            stats.realizedMin += (durationMs / 60000);
            stats.uniqueDays.add(dayString); 
        });

        currentReportData = [];
        let globalMissingMin = 0;
        let globalRealizedMin = 0;
        let globalPlannedMin = 0;

        chantiersCache.forEach(chantier => {
            const heuresParPassage = parseFloat(chantier.totalHeuresPrevues) || 0;
            if (heuresParPassage <= 0 || chantier.status !== 'active') return;

            const cNameLower = chantier.name.toLowerCase().trim();
            const stats = chantierStats.get(cNameLower);
            
            if (!stats) return; 

            const nombreDePassages = stats.uniqueDays.size;
            
            const plannedMin = Math.round(nombreDePassages * heuresParPassage * 60);
            const realizedMin = Math.round(stats.realizedMin);

            globalPlannedMin += plannedMin;
            globalRealizedMin += realizedMin;

            if (realizedMin < plannedMin) {
                const missingMin = plannedMin - realizedMin;
                globalMissingMin += missingMin;
                currentReportData.push({
                    chantierName: chantier.name,
                    plannedMin: plannedMin,
                    realizedMin: realizedMin,
                    missingMin: missingMin,
                    percentage: Math.min((realizedMin / plannedMin) * 100, 100)
                });
            }
        });

        document.getElementById('totalMissingDisplay').textContent = formatTime(globalMissingMin);
        document.getElementById('totalRealizedDisplay').textContent = formatTime(globalRealizedMin);
        document.getElementById('totalPlannedDisplay').textContent = formatTime(globalPlannedMin);

        if (currentReportData.length === 0) {
            listContainer.innerHTML = `
                <div class="text-center py-10 bg-green-50 rounded-xl border border-green-200">
                    <span class="text-4xl">🎉</span>
                    <p class="text-green-700 font-bold text-lg mt-2">Félicitations !</p>
                    <p class="text-green-600 text-sm">Aucun écart constaté. Le temps presté correspond parfaitement au temps prévu.</p>
                </div>`;
            return;
        }

        currentReportData.sort((a, b) => b.missingMin - a.missingMin);

        let html = '';
        currentReportData.forEach(item => {
            html += `
                <div class="flex flex-col md:flex-row justify-between items-start md:items-center p-4 border rounded-xl hover:shadow-md transition-shadow" style="background-color: var(--color-background); border-color: var(--color-border);">
                    <div class="w-full md:w-2/3 mb-4 md:mb-0">
                        <p class="font-bold text-lg">${item.chantierName}</p>
                        <div class="flex justify-between text-xs mb-1 font-semibold" style="color: var(--color-text-muted);">
                            <span>Réalisé: ${formatTime(item.realizedMin)}</span>
                            <span>Prévu: ${formatTime(item.plannedMin)}</span>
                        </div>
                        <div class="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                            <div class="${item.percentage < 50 ? 'bg-red-600' : 'bg-amber-500'} h-2.5 rounded-full" style="width: ${item.percentage}%"></div>
                        </div>
                    </div>
                    <div class="flex items-center justify-between w-full md:w-auto gap-6 pl-0 md:pl-6">
                        <div class="text-right">
                            <p class="text-xs font-bold uppercase tracking-wide text-red-500">Écart</p>
                            <span class="font-black text-red-600 text-2xl">-${formatTime(item.missingMin)}</span>
                        </div>
                        <button class="add-manual-btn bg-green-100 hover:bg-green-200 text-green-700 font-bold p-3 rounded-full transition-colors shadow-sm" data-chantier="${item.chantierName}" title="Ajouter des heures manquantes">
                            ➕
                        </button>
                    </div>
                </div>
            `;
        });
        
        listContainer.innerHTML = html;

        document.querySelectorAll('.add-manual-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const chantierName = e.currentTarget.dataset.chantier;
                openManualEntryModal(chantierName);
            });
        });

    } catch (error) {
        console.error("Erreur lors de l'analyse:", error);
        listContainer.innerHTML = `<p class="text-red-500 text-center py-8 font-bold">Erreur lors de la lecture de la base de données.</p>`;
    }
}

function openManualEntryModal(chantierName) {
    const modal = document.getElementById('manualEntryModal');
    document.getElementById('manualEntryForm').reset();
    
    document.getElementById('modalChantierName').textContent = `📍 ${chantierName}`;
    document.getElementById('entryChantier').value = chantierName;
    document.getElementById('entryHours').value = '';
    document.getElementById('entryMinutes').value = '0';

    modal.classList.remove('hidden');
}

function setupEventListeners() {
    // Écouteurs pour la navigation temporelle
    document.getElementById('prevPeriodBtn').addEventListener('click', () => {
        periodOffset--;
        calculateAndDisplayReport();
    });

    document.getElementById('nextPeriodBtn').addEventListener('click', () => {
        periodOffset++;
        calculateAndDisplayReport();
    });

    document.getElementById('missingHoursPeriod').addEventListener('change', () => {
        periodOffset = 0; // On remet à 0 quand on change de vue (semaine -> mois)
        calculateAndDisplayReport();
    });

    document.getElementById('refreshDataBtn').addEventListener('click', calculateAndDisplayReport);
    
    document.getElementById('closeModalBtn').addEventListener('click', () => {
        document.getElementById('manualEntryModal').classList.add('hidden');
    });

    document.getElementById('manualEntryForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('saveEntryBtn');
        btn.disabled = true;
        btn.textContent = "Sauvegarde...";

        try {
            const chantierName = document.getElementById('entryChantier').value;
            const hours = parseInt(document.getElementById('entryHours').value) || 0;
            const minutes = parseInt(document.getElementById('entryMinutes').value) || 0;
            
            if (hours === 0 && minutes === 0) {
                showInfoModal("Erreur", "Veuillez indiquer au moins 1 minute à ajouter.");
                btn.disabled = false;
                btn.textContent = "Valider";
                return;
            }

            // Si on est dans le passé, on simule l'ajout le premier jour de la période affichée
            const period = document.getElementById('missingHoursPeriod').value;
            const { start } = getDateBoundaries(period, periodOffset);
            
            // Heure fantôme basée sur la période choisie (pour qu'elle apparaisse direct dans le bon mois/semaine)
            start.setHours(8, 0, 0, 0); 
            const durationMs = (hours * 3600000) + (minutes * 60000);
            const endTime = new Date(start.getTime() + durationMs);

            const dataToSave = { 
                chantier: chantierName,
                uid: currentUser.uid, 
                userName: "Régularisation",
                timestamp: start.toISOString(), 
                endTime: endTime.toISOString(), 
                pauseDurationMs: 0,
                colleagues: [], 
                notes: `(Saisie Rapide : +${hours}h${minutes.toString().padStart(2, '0')})`,
                createdAt: serverTimestamp(),
                status: 'completed'
            };

            const docRef = await addDoc(collection(db, "pointages"), dataToSave);
            
            await addDoc(collection(db, `pointages/${docRef.id}/auditLog`), {
                action: `Régularisation Rapide (+${hours}h${minutes}m)`,
                modifiedBy: currentUser.displayName,
                timestamp: serverTimestamp()
            });

            document.getElementById('manualEntryModal').classList.add('hidden');
            showInfoModal("Succès", `Temps ajouté ! L'écart a été réduit.`);
            
            await calculateAndDisplayReport();

        } catch (error) {
            console.error("Erreur de sauvegarde:", error);
            showInfoModal("Erreur", "L'enregistrement a échoué.");
        } finally {
            btn.disabled = false;
            btn.textContent = "Valider";
        }
    });

    document.getElementById('exportPdfBtn').onclick = () => {
        if (currentReportData.length === 0) {
            showInfoModal("Info", "Rien à exporter, tout est à jour !");
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');
        
        if (LOGO_BASE64.startsWith('data:image')) {
            try { doc.addImage(LOGO_BASE64, 'PNG', 14, 10, 20, 20); } catch (e) {}
        }
        
        const periodText = document.getElementById('currentPeriodLabel').textContent;
        
        doc.setFontSize(16);
        doc.setFont(undefined, 'bold');
        doc.text("RAPPORT D'AUDIT : ÉCARTS D'HEURES", 40, 20);
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.text(`Période analysée : ${periodText}`, 40, 26);
        
        doc.setFontSize(12);
        doc.setTextColor(220, 38, 38); 
        doc.text(`TOTAL HEURES PERDUES : ${document.getElementById('totalMissingDisplay').textContent}`, 14, 45);
        doc.setTextColor(0, 0, 0);
        
        const tableRows = currentReportData.map(item => [
            item.chantierName,
            formatTime(item.plannedMin),
            formatTime(item.realizedMin),
            `-${formatTime(item.missingMin)}`
        ]);

        doc.autoTable({ 
            startY: 55, 
            head: [['CHANTIER', 'PRÉVU', 'RÉALISÉ', 'ÉCART']], 
            body: tableRows,
            theme: 'striped',
            headStyles: { fillColor: [41, 51, 92] },
            columnStyles: { 3: { textColor: [220, 38, 38], fontStyle: 'bold' } }
        });
        
        const finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 20 : 100;
        doc.text("Signature du responsable :", 140, finalY);
        doc.line(140, finalY + 10, 195, finalY + 10);
        
        const now = new Date();
        const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
        doc.save(`Rapport_Ecarts_${dateStr}.pdf`);
    };
}
