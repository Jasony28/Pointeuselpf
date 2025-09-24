import { collection, query, where, getDocs, orderBy, getDoc, doc, runTransaction, increment } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent, showInfoModal } from "../app.js";
import { formatMilliseconds } from "./utils.js";

// --- À PERSONNALISER : VOS INFORMATIONS D'ENTREPRISE ---
const MY_COMPANY_INFO = {
    name: "Nom de Votre Entreprise",
    address: "123 Rue de l'Exemple, 1000 Bruxelles",
    vat: "BE 0123.456.789",
    iban: "BE12 3456 7890 1234",
    bic: "GEBABEBB"
};
const VAT_RATE = 0.21; // 21% de TVA
// ----------------------------------------------------

export async function render() {
    pageContent.innerHTML = `
        <div class="max-w-3xl mx-auto space-y-6">
            <h2 class="text-2xl font-bold">🧾 Facturation Client</h2>
            
            <div class="p-6 rounded-lg shadow-sm space-y-4" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                <div>
                    <label for="chantier-select" class="text-sm font-medium">1. Sélectionnez un client (chantier)</label>
                    <select id="chantier-select" class="w-full border p-2 rounded mt-1" style="background-color: var(--color-background); border-color: var(--color-border);"></select>
                </div>
                <div>
                    <label class="text-sm font-medium">2. Choisissez une période à facturer</label>
                    <div class="flex flex-col sm:flex-row gap-4 mt-1">
                        <input type="date" id="start-date" class="w-full border p-2 rounded" style="background-color: var(--color-background); border-color: var(--color-border);">
                        <input type="date" id="end-date" class="w-full border p-2 rounded" style="background-color: var(--color-background); border-color: var(--color-border);">
                    </div>
                </div>
                <div class="text-right pt-4 border-t" style="border-color: var(--color-border);">
                    <button id="generate-invoice-btn" class="bg-green-600 hover:bg-green-700 text-white font-bold px-6 py-2 rounded-lg">
                        Générer la Facture
                    </button>
                </div>
            </div>
        </div>
    `;

    setTimeout(() => {
        populateChantierSelect();
        document.getElementById('generate-invoice-btn').onclick = generateInvoicePDF;
    }, 0);
}
async function populateChantierSelect() {
    const select = document.getElementById('chantier-select');
    select.innerHTML = '<option value="">Chargement...</option>';
    try {
        const q = query(collection(db, "chantiers"), orderBy("name"));
        const snapshot = await getDocs(q);
        select.innerHTML = '<option value="">-- Choisissez un client --</option>';
        snapshot.forEach(doc => {
            select.innerHTML += `<option value="${doc.id}">${doc.data().name}</option>`;
        });
    } catch (error) {
        select.innerHTML = '<option value="">Erreur de chargement</option>';
    }
}

async function generateInvoicePDF() {
    const chantierId = document.getElementById('chantier-select').value;
    const startDateValue = document.getElementById('start-date').value;
    const endDateValue = document.getElementById('end-date').value;

    if (!chantierId || !startDateValue || !endDateValue) {
        showInfoModal("Attention", "Veuillez sélectionner un client et une plage de dates complète.");
        return;
    }
    
    showInfoModal("Génération en cours...", "La facture est en cours de préparation, veuillez patienter.");

    try {
        // Étape 1 : Récupérer toutes les données nécessaires
        const chantierRef = doc(db, "chantiers", chantierId);
        const chantierSnap = await getDoc(chantierRef);
        if (!chantierSnap.exists()) throw new Error("Chantier non trouvé.");
        
        const chantierData = chantierSnap.data();
        const billingRate = chantierData.tauxFacturation || 0;
        if (billingRate === 0) {
            showInfoModal("Erreur", `Le taux de facturation pour "${chantierData.name}" n'est pas défini.`);
            return;
        }

        const startDate = new Date(startDateValue);
        const endDate = new Date(endDateValue);
        endDate.setHours(23, 59, 59, 999);

        const q = query(collection(db, "pointages"),
            where("chantier", "==", chantierData.name),
            where("timestamp", ">=", startDate.toISOString()),
            where("timestamp", "<=", endDate.toISOString()),
            orderBy("timestamp", "asc")
        );
        const pointagesSnapshot = await getDocs(q);
        if (pointagesSnapshot.empty) {
            showInfoModal("Information", "Aucune heure à facturer pour cette période.");
            return;
        }

        // Étape 2 : Lancer la transaction pour obtenir un numéro de facture unique
        const invoiceNumber = await runTransaction(db, async (transaction) => {
            const counterRef = doc(db, "counters", "invoiceCounter");
            const counterDoc = await transaction.get(counterRef);
            if (!counterDoc.exists()) throw "Le document compteur de factures est introuvable !";
            
            const currentYear = new Date().getFullYear();
            const counterData = counterDoc.data();
            let newNumber = counterData.lastNumber + 1;

            if (counterData.year !== currentYear) {
                newNumber = 1;
                transaction.update(counterRef, { lastNumber: 1, year: currentYear });
            } else {
                transaction.update(counterRef, { lastNumber: increment(1) });
            }
            
            const formattedNumber = String(newNumber).padStart(3, '0');
            return `${currentYear}-${formattedNumber}`;
        });

        // Étape 3 : Traiter les données de pointage et calculer les totaux
        let totalMs = 0;
        const pointagesToBill = [];
        pointagesSnapshot.forEach(docSnap => {
            const data = docSnap.data();
            const durationMs = new Date(data.endTime) - new Date(data.timestamp) - (data.pauseDurationMs || 0);
            totalMs += durationMs;
            pointagesToBill.push({ ...data, durationMs });
        });
        
        const totalHours = totalMs / 3600000;
        const subtotal = totalHours * billingRate;
        const vatAmount = subtotal * VAT_RATE;
        const grandTotal = subtotal + vatAmount;

        // Étape 4 : Générer le PDF avec toutes les informations
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
        
        try {
            const logoPath = 'icons/assets/logo.png';
            const response = await fetch(logoPath);
            if (!response.ok) throw new Error('Logo non trouvé');
            const blob = await response.blob();
            const reader = new FileReader();
            const logoDataUrl = await new Promise((resolve, reject) => {
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
            pdf.addImage(logoDataUrl, 'PNG', 40, 40, 80, 40);
        } catch (e) {
            console.warn("Logo non chargé, PDF généré sans logo.", e);
        }

        pdf.setFontSize(20);
        pdf.setFont(undefined, 'bold');
        pdf.text("FACTURE", 40, 100);

        pdf.setFontSize(10);
        pdf.setFont(undefined, 'normal');
        pdf.text(MY_COMPANY_INFO.name, 555, 60, { align: 'right' });
        pdf.text(MY_COMPANY_INFO.address, 555, 72, { align: 'right' });
        pdf.text(`TVA: ${MY_COMPANY_INFO.vat}`, 555, 84, { align: 'right' });

        pdf.setLineWidth(1);
        pdf.line(40, 130, 555, 130);

        pdf.setFontSize(10);
        pdf.setFont(undefined, 'bold');
        pdf.text("Facturé à :", 40, 150);
        pdf.setFont(undefined, 'normal');
        pdf.text(chantierData.name, 40, 162);
        pdf.text(chantierData.address || "Adresse non spécifiée", 40, 174);

        const invoiceDate = new Date();
        const dueDate = new Date();
        dueDate.setDate(invoiceDate.getDate() + 30);

        pdf.setFont(undefined, 'bold');
        pdf.text("Numéro de facture :", 400, 150);
        pdf.text("Date de facturation :", 400, 162);
        pdf.text("Date d'échéance :", 400, 174);
        pdf.setFont(undefined, 'normal');
        pdf.text(invoiceNumber, 555, 150, { align: 'right' });
        pdf.text(invoiceDate.toLocaleDateString('fr-FR'), 555, 162, { align: 'right' });
        pdf.text(dueDate.toLocaleDateString('fr-FR'), 555, 174, { align: 'right' });

        const tableHead = [['Date', 'Employé(s)', 'Heure début', 'Heure fin', 'Durée']];
        const tableBody = [];

        pointagesToBill.forEach(p => {
            const startDateObj = new Date(p.timestamp);
            const endDateObj = new Date(p.endTime);
            const team = [p.userName, ...(p.colleagues || [])].filter(name => name && name !== "Seul");
            
            tableBody.push([
                startDateObj.toLocaleDateString('fr-FR'),
                [...new Set(team)].join(', '),
                startDateObj.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
                endDateObj.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
                formatMilliseconds(p.durationMs)
            ]);
        });
        
        pdf.autoTable({
            startY: 200, head: tableHead, body: tableBody,
            theme: 'striped', headStyles: { fillColor: [41, 51, 92] }
        });

        const finalY = pdf.lastAutoTable.finalY;
        pdf.autoTable({
            startY: finalY > 700 ? 700 : finalY + 20,
            body: [
                ['Total HTVA :', `${subtotal.toFixed(2)} €`],
                [`TVA (${VAT_RATE * 100}%) :`, `${vatAmount.toFixed(2)} €`],
                [{ content: 'Total TVAC :', styles: { fontStyle: 'bold' } }, { content: `${grandTotal.toFixed(2)} €`, styles: { fontStyle: 'bold' } }]
            ],
            theme: 'plain', styles: { fontSize: 10, cellPadding: 4, halign: 'right' }, margin: { left: 395 }
        });

        const footerY = pdf.internal.pageSize.height - 60;
        pdf.setFontSize(9);
        pdf.setTextColor(100);
        pdf.text(`Veuillez virer le montant total sur le compte ${MY_COMPANY_INFO.iban} (BIC: ${MY_COMPANY_INFO.bic}) en mentionnant le numéro de facture.`, 40, footerY);
        pdf.text("Merci de votre confiance.", 40, footerY + 12);
        
        const fileName = `Facture_${chantierData.name.replace(/ /g, '_')}_${invoiceNumber}.pdf`;
        pdf.save(fileName);

    } catch (error) {
        console.error("Erreur de génération de la facture:", error);
        showInfoModal("Erreur", "Une erreur est survenue : " + error.message);
    }
}