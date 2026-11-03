// Export PDF de tous les chantiers (Admin → Chantiers → « Exporter en PDF »).
// A4 paysage : un tableau des chantiers actifs puis un des archivés, triés par nom,
// avec toutes les données de la fiche (adresse, GPS, durée, équipe, horaires, tâches, codes, infos, e-mail).
import { loadPdf } from "./libs.js";
import { THEMES, NEED_LABELS } from "./work-profile.js";

const DARK = [30, 41, 59];
const MUTED = [100, 116, 139];
const WARN = [185, 28, 28];
const LINE = [226, 232, 240];

// La police standard du PDF ne connaît pas certains signes : on les remplace.
const clean = (value) => String(value ?? '')
    .replace(/[→⇒]/g, '->').replace(/[✓✔]/g, 'OK').replace(/[•●]/g, '·')
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')
    .replace(/[ \t]+/g, ' ').trim();

const formatHours = (h) => {
    if (!h) return '';
    const hours = Math.floor(h);
    const minutes = Math.round((h - hours) * 60);
    return minutes ? `${hours} h ${String(minutes).padStart(2, '0')}` : `${hours} h`;
};

function scheduleText(c) {
    const parts = [];
    if (c.fixedAppointment) parts.push(`RDV à ${c.fixedAppointment}`);
    if (c.timeWindowStart && c.timeWindowEnd) parts.push(`Entre ${c.timeWindowStart} et ${c.timeWindowEnd}`);
    else if (c.timeWindowStart) parts.push(`Pas avant ${c.timeWindowStart}`);
    else if (c.timeWindowEnd) parts.push(`Fini avant ${c.timeWindowEnd}`);
    return parts.join('\n') || '-';
}

function needsText(c) {
    const needs = c.skillNeeds || {};
    return THEMES.filter(t => needs[t.key] >= 2)
        .sort((a, b) => needs[b.key] - needs[a.key])
        .map(t => `${t.label} (${NEED_LABELS[needs[t.key]].toLowerCase()})`)
        .join('\n') || '-';
}

function rowFor(c, index) {
    const tags = [];
    if (c.isHideable) tags.push('Hors forfait');
    if (c.source === 'lpf' || c.lpfGiteId) tags.push('Petites Fées');
    const name = clean(c.name) || '(sans nom)';
    const durationTeam = [formatHours(c.totalHeuresPrevues), c.teamSize ? `${c.teamSize} pers.` : ''].filter(Boolean).join('\n') || '-';
    const notes = [
        clean(c.additionalInfo),
        c.email ? `E-mail : ${clean(c.email)}` : '',
    ].filter(Boolean).join('\n') || '-';
    return {
        cells: [
            String(index + 1),
            tags.length ? `${name}\n${tags.join(' · ')}` : name,
            clean(c.address) || 'Adresse non renseignée',
            !c.address ? '-' : c.coordinates?.lat ? 'OK' : 'Manquant',
            durationTeam,
            scheduleText(c),
            needsText(c),
            (c.keyboxCodes || []).map(clean).filter(Boolean).join('\n') || '-',
            notes,
        ],
        noAddress: !c.address,
        noGps: !!c.address && !c.coordinates?.lat,
    };
}

const COLUMNS = ['N°', 'Chantier', 'Adresse', 'GPS', 'Durée / équipe', 'Horaires', 'Tâches importantes', 'Codes & accès', 'Infos'];

export async function exportChantiersPdf(chantiers) {
    const { jsPDF } = await loadPdf();
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 10;
    const today = new Date().toLocaleDateString('fr-FR');

    const byName = (a, b) => clean(a.name).localeCompare(clean(b.name), 'fr', { sensitivity: 'base', numeric: true });
    const active = chantiers.filter(c => c.status === 'active').sort(byName);
    const archived = chantiers.filter(c => c.status !== 'active').sort(byName);
    const noAddress = active.filter(c => !c.address).length;
    const noGps = active.filter(c => c.address && !c.coordinates?.lat).length;

    // En-tête
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(...DARK);
    doc.text('Liste des chantiers', margin, 16);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    doc.text(`Pointeuse LPF · export du ${today}`, margin, 22);

    const summary = [
        `${active.length} actif${active.length > 1 ? 's' : ''}`,
        `${archived.length} archivé${archived.length > 1 ? 's' : ''}`,
        noAddress ? `${noAddress} actif${noAddress > 1 ? 's' : ''} sans adresse` : '',
        noGps ? `${noGps} actif${noGps > 1 ? 's' : ''} sans GPS` : '',
    ].filter(Boolean).join('   ·   ');
    doc.setFontSize(10);
    doc.setTextColor(...DARK);
    doc.text(summary, pageW - margin, 16, { align: 'right' });
    doc.setTextColor(...MUTED);
    doc.text('GPS « Manquant » : kilomètres impossibles à calculer pour ce chantier.', pageW - margin, 22, { align: 'right' });
    doc.setDrawColor(...LINE);
    doc.line(margin, 26, pageW - margin, 26);

    let y = 32;
    const section = (title, list) => {
        if (!list.length) return;
        if (y > pageH - 40) { doc.addPage(); y = 16; }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(...DARK);
        doc.text(`${title} (${list.length})`, margin, y);
        const rows = list.map(rowFor);
        doc.autoTable({
            startY: y + 3,
            head: [COLUMNS],
            body: rows.map(r => r.cells),
            theme: 'grid',
            rowPageBreak: 'avoid',
            showHead: 'everyPage',
            margin: { left: margin, right: margin, top: 14, bottom: 14 },
            styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 1.8, overflow: 'linebreak', valign: 'top', lineColor: LINE, lineWidth: 0.2, textColor: [30, 30, 30] },
            headStyles: { fillColor: DARK, textColor: 255, fontStyle: 'bold', fontSize: 8, valign: 'middle' },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            columnStyles: {
                0: { cellWidth: 8, halign: 'center', textColor: MUTED },
                1: { cellWidth: 38, fontStyle: 'bold' },
                2: { cellWidth: 50 },
                3: { cellWidth: 17, halign: 'center' },
                4: { cellWidth: 20 },
                5: { cellWidth: 26 },
                6: { cellWidth: 32 },
                7: { cellWidth: 32 },
                8: { cellWidth: 'auto' },
            },
            didParseCell: (data) => {
                if (data.section !== 'body') return;
                const r = rows[data.row.index];
                if (data.column.index === 2 && r.noAddress) { data.cell.styles.textColor = WARN; data.cell.styles.fontStyle = 'italic'; }
                if (data.column.index === 3 && r.noGps) { data.cell.styles.textColor = WARN; data.cell.styles.fontStyle = 'bold'; }
            },
        });
        y = doc.lastAutoTable.finalY + 10;
    };
    section('Chantiers actifs', active);
    section('Chantiers archivés', archived);

    // Pied de page sur chaque page
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
        doc.setPage(i);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...MUTED);
        doc.text(`Liste des chantiers · ${today}`, margin, pageH - 6);
        doc.text(`Page ${i} / ${pages}`, pageW - margin, pageH - 6, { align: 'right' });
    }

    doc.save(`Chantiers_${today.replace(/\//g, '-')}.pdf`);
}
