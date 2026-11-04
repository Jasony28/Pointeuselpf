// Mise en page commune des PDF de l'appli (même style que le « Relevé d'heures » de l'Historique) :
// bandeau foncé en haut, cases de résumé, tableau sobre, total, signatures, pied de page numéroté.
// Unités : millimètres, format A4 (portrait ou paysage).
import { loadPdf } from "./libs.js";

export const C = {
    DARK: [15, 23, 42],
    PRIMARY: [79, 70, 229],
    MUTED: [100, 116, 139],
    LIGHT: [241, 245, 249],
    LINE: [226, 232, 240],
    TEXT: [30, 41, 59],
    SOFT: [203, 213, 225],
    DANGER: [185, 28, 28],
    OK: [21, 128, 61],
};
export const MARGIN = 14;
const BRAND = "Pointeuse LPF · Les Petites Fées, service de nettoyage";

// La police standard du PDF ne connaît pas tous les signes (émojis, flèches…) : remplacés ou retirés.
export const pdfText = (value) => String(value ?? '')
    .replace(/[→⇒]/g, '->').replace(/[✓✔]/g, 'OK').replace(/[•●]/g, '·')
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '')
    .replace(/[^\x09\x0A\x0D\x20-\x7E -ÿŒœ–—‘’“”…€]/g, '?')
    .replace(/[ \t]+/g, ' ').trim();

/** Nouveau document A4. */
export async function createPdf(orientation = 'portrait') {
    const { jsPDF } = await loadPdf();
    const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
    doc.setFont('helvetica', 'normal');
    return doc;
}

const pageW = (doc) => doc.internal.pageSize.getWidth();
const pageH = (doc) => doc.internal.pageSize.getHeight();

/**
 * Bandeau du haut. right : jusqu'à 3 lignes à droite (la première en gras), ex. [nom, période, mention].
 * Renvoie la position (y) sous le bandeau.
 */
export function pdfHeader(doc, { title, subtitle = BRAND, right = [] }) {
    const w = pageW(doc);
    doc.setFillColor(...C.DARK);
    doc.rect(0, 0, w, 32, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(255);
    doc.text(pdfText(title), MARGIN, 15);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...C.SOFT);
    doc.text(pdfText(subtitle), MARGIN, 21.5);
    const now = new Date();
    doc.text(`Généré le ${now.toLocaleDateString('fr-FR')} à ${now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`, MARGIN, 26.5);
    right.filter(Boolean).slice(0, 3).forEach((line, i) => {
        doc.setFont('helvetica', i === 0 ? 'bold' : 'normal');
        doc.setFontSize(i === 0 ? 11 : 9);
        doc.setTextColor(...(i === 0 ? [255, 255, 255] : C.SOFT));
        doc.text(pdfText(line), w - MARGIN, [15, 21.5, 26.5][i], { align: 'right' });
    });
    doc.setFont('helvetica', 'normal');
    return 40;
}

/** Cases de résumé : [[libellé, valeur, couleur?]]. Renvoie la position (y) sous les cases. */
export function pdfStats(doc, y, boxes) {
    const gap = 3.5;
    const width = (pageW(doc) - MARGIN * 2 - gap * (boxes.length - 1)) / boxes.length;
    boxes.forEach(([label, value, color], i) => {
        const x = MARGIN + i * (width + gap);
        doc.setFillColor(...C.LIGHT);
        doc.roundedRect(x, y, width, 18, 2, 2, 'F');
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...C.MUTED);
        doc.text(pdfText(label).toUpperCase(), x + 3.5, y + 6);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...(color || (i === 0 ? C.PRIMARY : C.DARK)));
        doc.text(pdfText(value), x + 3.5, y + 14);
    });
    doc.setFont('helvetica', 'normal');
    return y + 25;
}

/** Titre de section (passe à la page suivante s'il ne reste presque plus de place). */
export function pdfSection(doc, y, title, note = '') {
    if (y > pageH(doc) - 40) { doc.addPage(); y = 18; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...C.DARK);
    doc.text(pdfText(title), MARGIN, y);
    if (note) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...C.MUTED);
        doc.text(pdfText(note), pageW(doc) - MARGIN, y, { align: 'right' });
    }
    doc.setFont('helvetica', 'normal');
    return y + 3;
}

/** Tableau au style commun. Les options données remplacent ou complètent celles par défaut. */
export function pdfTable(doc, options) {
    const { styles = {}, headStyles = {}, didParseCell, ...rest } = options;
    doc.autoTable({
        // Titre de colonne aligné comme ses valeurs (chiffres à droite, petites colonnes centrées)
        didParseCell: (data) => {
            const align = options.columnStyles?.[data.column.index]?.halign;
            if (data.section === 'head' && align) data.cell.styles.halign = align;
            didParseCell?.(data);
        },
        theme: 'plain',
        rowPageBreak: 'avoid',
        showHead: 'everyPage',
        margin: { left: MARGIN, right: MARGIN, top: 16, bottom: 18 },
        styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2, overflow: 'linebreak', valign: 'top', textColor: C.TEXT, lineColor: C.LINE, lineWidth: { bottom: 0.2 }, ...styles },
        headStyles: { fillColor: C.DARK, textColor: 255, fontStyle: 'bold', fontSize: 8.5, valign: 'middle', ...headStyles },
        ...rest,
    });
    return doc.lastAutoTable.finalY;
}

/** Ligne de jour / de groupe dans un tableau (fond clair, en gras), sur toute la largeur moins la dernière colonne. */
export const groupRow = (label, value, columns) => [
    { content: pdfText(label), colSpan: columns - 1, styles: { fillColor: C.LIGHT, fontStyle: 'bold', textColor: C.DARK } },
    { content: pdfText(value), styles: { fillColor: C.LIGHT, fontStyle: 'bold', textColor: C.PRIMARY, halign: 'right' } },
];

/** Bandeau de total (fond violet). Renvoie la position (y) sous le bandeau. */
export function pdfTotal(doc, y, label, value) {
    if (y > pageH(doc) - 30) { doc.addPage(); y = 18; }
    doc.setFillColor(...C.PRIMARY);
    doc.roundedRect(MARGIN, y, pageW(doc) - MARGIN * 2, 12, 2, 2, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(255);
    doc.text(pdfText(label), MARGIN + 5, y + 7.8);
    doc.text(pdfText(value), pageW(doc) - MARGIN - 5, y + 7.8, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    return y + 18;
}

/** Cadres de signature côte à côte. */
export function pdfSignatures(doc, y, labels) {
    if (y > pageH(doc) - 36) { doc.addPage(); y = 18; }
    const gap = 10;
    const width = (pageW(doc) - MARGIN * 2 - gap * (labels.length - 1)) / labels.length;
    labels.forEach((label, i) => {
        const x = MARGIN + i * (width + gap);
        doc.setDrawColor(...C.SOFT);
        doc.roundedRect(x, y, width, 22, 1.5, 1.5, 'S');
        doc.setFontSize(8); doc.setTextColor(...C.MUTED);
        doc.text(pdfText(label), x + 3, y + 5);
    });
    return y + 28;
}

/** Message centré quand il n'y a rien à afficher dans une section. */
export function pdfEmpty(doc, y, text) {
    doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(...C.MUTED);
    doc.text(pdfText(text), MARGIN, y + 6);
    doc.setFont('helvetica', 'normal');
    return y + 12;
}

/** Pied de page sur chaque page (titre · page x / y), puis enregistrement. */
export function pdfFinish(doc, footer, fileName) {
    const count = doc.getNumberOfPages();
    for (let i = 1; i <= count; i++) {
        doc.setPage(i);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...C.MUTED);
        doc.text(pdfText(footer), MARGIN, pageH(doc) - 7);
        doc.text(`Page ${i} / ${count}`, pageW(doc) - MARGIN, pageH(doc) - 7, { align: 'right' });
    }
    doc.save(fileName);
}

/** « 2026-11-04_14h05 » pour les noms de fichiers. */
export function fileStamp(date = new Date()) {
    const p = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}_${p(date.getHours())}h${p(date.getMinutes())}`;
}
export const safeName = (value) => pdfText(value).replace(/[^\wÀ-ÿ-]+/g, '_').replace(/^_+|_+$/g, '') || 'export';
