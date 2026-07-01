import { pageContent } from "../app.js";
import { getMissingHoursReport } from "./data-service.js";

const LOGO_BASE64 = ""; // Colle ici ton code base64 quand tu l'auras

function formatTime(minutes) {
    const h = Math.floor(minutes / 60);
    const m = Math.floor(minutes % 60);
    return h === 0 ? `${m}'` : `${h}h${m.toString().padStart(2, '0')}`;
}

export async function render() {
    pageContent.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <div>
                <h2 class="text-2xl font-bold" style="color: var(--color-text-base);">⚠️ Rapport des écarts d'heures</h2>
            </div>
            <button id="exportPdfBtn" class="bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2 rounded-lg text-sm">📥 Exporter PDF</button>
        </div>
        <div id="globalSummary" class="mb-6 p-4 rounded-lg border" style="background-color: var(--color-surface);">
            <p class="text-sm uppercase font-bold">Total heures perdues</p>
            <p id="totalMissingDisplay" class="text-3xl font-black text-red-600">0h00</p>
        </div>
        <div class="p-6 rounded-lg border" style="background-color: var(--color-surface);">
            <select id="missingHoursPeriod" class="border p-2 rounded mb-6">
                <option value="week">Cette semaine</option>
                <option value="month">Ce mois-ci</option>
                <option value="year">Cette année</option>
            </select>
            <div id="missingHoursList" class="space-y-3"></div>
        </div>
    `;

    const loadData = async () => {
        const period = document.getElementById('missingHoursPeriod').value;
        const now = new Date();
        let start = new Date();
        if (period === 'week') start.setDate(now.getDate() - 7);
        else if (period === 'month') start.setMonth(now.getMonth() - 1);
        else start.setFullYear(now.getFullYear() - 1);
        
        const report = await getMissingHoursReport(start, now);
        let totalMinutes = 0, html = '';
        report.forEach(item => {
            totalMinutes += item.minutesManquantes;
            html += `
                <div class="flex justify-between items-center p-4 border rounded-lg">
                    <div>
                        <p class="font-bold">${item.chantierName}</p>
                        <p class="text-xs text-gray-500">Prévu: ${formatTime(item.quota)} | Réalisé: ${formatTime(item.totalPreste)}</p>
                    </div>
                    <span class="font-black text-red-600 text-xl">-${formatTime(item.minutesManquantes)}</span>
                </div>
            `;
        });
        document.getElementById('totalMissingDisplay').textContent = formatTime(totalMinutes);
        document.getElementById('missingHoursList').innerHTML = html || `<p class="text-green-600 font-bold">Tout est parfait !</p>`;
    };

    document.getElementById('exportPdfBtn').onclick = () => {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');
        if (LOGO_BASE64.startsWith('data:image')) {
            try { doc.addImage(LOGO_BASE64, 'PNG', 14, 10, 20, 20); } catch (e) {}
        }
        doc.text("RAPPORT D'AUDIT HEURES", 40, 20);
        doc.text(`TOTAL HEURES PERDUES : ${document.getElementById('totalMissingDisplay').textContent}`, 14, 45);
        
        const tableRows = [];
        document.querySelectorAll('#missingHoursList > div').forEach(div => {
            tableRows.push([
                div.querySelector('p.font-bold').textContent,
                div.querySelector('p.text-xs').textContent,
                div.querySelector('span.text-red-600').textContent
            ]);
        });

        doc.autoTable({ startY: 55, head: [['CHANTIER', 'DÉTAILS', 'ÉCART']], body: tableRows });
        const finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 20 : 100;
        doc.text("Signature du responsable :", 140, finalY);
        doc.line(140, finalY + 10, 195, finalY + 10);
        doc.save("Rapport_Ecarts.pdf");
    };

    document.getElementById('missingHoursPeriod').onchange = loadData;
    loadData();
}