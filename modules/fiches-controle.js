// Fiches de contrôle (« Les Petites Fées de Marche / Contrôle journalier ») : modèles, rotation, état et PDF.
// Module sans Firebase (testé dans tests/fiches-controle.test.mjs) ; les lectures / écritures sont dans fiches-store.js.
//
// Une fiche par chantier et par jour : fichesControle/{chantierId}_{AAAA-MM-JJ}.
// Le PDF envoyé au client est le PDF d'origine (assets/fiches/A1.pdf…) dont on remplit les champs.

export const FICHES = 'fichesControle';
export const ROTATION = 'fichesRotation';

const ZONES_COMMUNES = [
    ['Entrées et accès', 'Seuils, poignées, tapis et portes propres selon le périmètre.'],
    ['Circulations et escaliers', 'Sols, rampes et points de contact propres ; obstacle ou dommage signalé.'],
    ['Sols', 'Aspiration/lavage adapté au revêtement ; sol séché ou balisé.'],
    ['Surfaces et mobilier', 'Tables, comptoirs, rebords et surfaces accessibles dépoussiérés.'],
    ['Points de contact', 'Poignées, interrupteurs, boutons et rampes nettoyés selon la consigne.'],
    ['Vitres et cloisons', 'Traces visibles retirées si la prestation est prévue.'],
    ['Vestiaires', 'Bancs, casiers extérieurs et sols propres ; affaires laissées en place.'],
    ['Salle de pause', 'Tables, plans, évier et extérieurs des appareils propres si compris.'],
    ['Sanitaires', 'WC, lavabos, miroirs, robinetterie, points de contact et sols contrôlés.'],
    ['Consommables', 'Papier, savon et essuie-mains complétés selon les quantités convenues.'],
    ['Poubelles et tri', 'Bacs vidés et remis avec sacs appropriés ; consignes de tri appliquées.'],
    ['Odeurs et aération', 'Odeur persistante ou défaut de ventilation signalé.'],
    ['Produits et matériel', 'Rangés en sécurité ; aucun équipement ou produit oublié.'],
    ['Mobilier et fermeture', 'Mobilier remis à sa place ; portes et accès selon consigne.'],
    ['Contrôle final', 'Défaut, casse ou tâche non réalisable communiqué au responsable.'],
];

// Champs texte des PDF (en points, origine en bas à gauche) : identiques pour les 3 modèles,
// sauf le bas de la fiche B1 (une ligne d'intro en plus, une ligne de tableau en moins).
const HAUT = { site: [34, 713.9, 262, 735.9], zone: [272, 713.9, 561.3, 735.9], date: [34, 674.9, 141, 696.9], heure: [151, 674.9, 263, 696.9], agent: [273, 674.9, 561.3, 696.9] };
const BAS_15 = { observations: [34, 112.9, 561.3, 152.9], responsable: [34, 67.9, 252, 89.9], echeance: [262, 67.9, 561.3, 89.9] };
const BAS_14 = { observations: [34, 141.9, 561.3, 181.9], responsable: [34, 96.9, 252, 118.9], echeance: [262, 96.9, 561.3, 118.9] };

export const MODELES = {
    A1: { code: 'A1', titre: 'A1 · Autres locaux professionnels', court: 'Autres locaux professionnels',
        intro: 'Fiche polyvalente pour boutiques et autres espaces professionnels. Adapter les lignes au cahier des charges.',
        points: ZONES_COMMUNES, champs: { ...HAUT, ...BAS_15 } },
    A2: { code: 'A2', titre: 'A2 · Espaces communs', court: 'Espaces communs',
        intro: 'Fiche pour les entrées, couloirs, escaliers, vestiaires, salles de pause et autres locaux partagés.',
        points: ZONES_COMMUNES, champs: { ...HAUT, ...BAS_15 } },
    B1: { code: 'B1', titre: 'B1 · Bureaux et locaux administratifs', court: 'Bureaux et locaux administratifs',
        intro: 'Espaces de travail, accueil, salles de réunion et circulations. Respecter le cahier des charges et ne pas déplacer les documents ou effets personnels.',
        points: [
            ['Entrée et accueil', 'Sol, tapis, porte et poignée propres ; accueil rangé selon les consignes.'],
            ['Sols durs', 'Aspiration ou lavage prévu effectué ; angles et bords accessibles contrôlés.'],
            ['Sols textiles', 'Aspiration régulière ; taches ou dommages signalés.'],
            ['Bureaux et plans de travail', 'Surfaces accessibles dépoussiérées et nettoyées ; documents laissés en place.'],
            ['Écrans et matériel informatique', 'Nettoyage uniquement si prévu et avec méthode autorisée ; aucun branchement déplacé.'],
            ['Téléphones et points de contact', 'Poignées, interrupteurs, boutons et téléphones traités selon la consigne.'],
            ['Chaises et fauteuils', 'Assises, accoudoirs et piètements propres ; mobilier remis à sa place.'],
            ['Tables de réunion', 'Plateaux et pieds propres ; chaises alignées si demandé.'],
            ['Étagères et rebords', 'Surfaces accessibles dépoussiérées ; objets non déplacés.'],
            ['Vitres intérieures et cloisons', 'Traces visibles retirées lorsque cette prestation est prévue.'],
            ['Poubelles et tri', 'Poubelles vidées, propres si prévu, sacs replacés ; tri respecté.'],
            ['Sanitaires attenants', 'Lavabos, WC, miroirs, points de contact et sols vérifiés si compris.'],
            ['Salle de pause', 'Évier, plans, tables et appareils extérieurs propres selon le périmètre convenu.'],
            ['Finition et signalement', 'Odeur, dégâts, matériel manquant ou anomalie signalés ; locaux refermés selon consigne.'],
        ], champs: { ...HAUT, ...BAS_14 } },
};

// Cases Fait / À revoir / S.O. : 16 pt, colonnes fixes, une ligne tous les 29 pt
export const CASE = { taille: 16, x: { F: 405.3, R: 450.3, S: 492.8 }, y1: 588.4, pas: 29 };
export const PAGE = { largeur: 595.2756, hauteur: 841.8898 };
export const caseRect = (n, v) => { const y = CASE.y1 - CASE.pas * (n - 1); return [CASE.x[v], y, CASE.x[v] + CASE.taille, y + CASE.taille]; };

export const VALEURS = ['F', 'R', 'S'];
export const LIBELLES = { F: 'Fait', R: 'À revoir', S: 'S.O.' };
const OPTION_PDF = { F: 'Fait', R: 'A_revoir', S: 'Sans_objet' };

// Modèle proposé d'après le « Type de lieu » du chantier (le choix reste à l'admin)
export const MODELE_SUGGERE = { 'Bureau': 'B1', 'Gîte / Airbnb': 'A1', 'Maison': 'A1', 'Fin de chantier': 'A1' };

/** Réglage de fiche d'un chantier, nettoyé ; null si le chantier n'a pas de fiche. */
export function ficheConfig(chantier) {
    const c = chantier?.ficheControle;
    const modele = c && MODELES[c.modele];
    if (!modele) return null;
    const max = modele.points.length;
    const hors = [...new Set((c.horsPrestation || []).map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= max))].sort((a, b) => a - b);
    return { modele: modele.code, zone: String(c.zone || '').trim(), horsPrestation: hors };
}

/** AAAA-MM-JJ du jour local (et non UTC : un pointage à 0 h 30 compte pour le bon jour). */
export function jourLocal(date = new Date()) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export const ficheId = (chantierId, jour) => `${chantierId}_${jour}`;

/**
 * Rotation : parmi les personnes présentes, celle qui a rempli la fiche de ce chantier il y a le plus longtemps
 * (jamais = la plus ancienne). À égalité : la première arrivée.
 *   presents : noms dans l'ordre d'arrivée ; derniers : { nom: 'AAAA-MM-JJ' } (dernière fiche remplie ici)
 */
export function choisirResponsable(presents, derniers = {}) {
    const liste = [...new Set((presents || []).filter(Boolean))];
    if (!liste.length) return null;
    return liste.reduce((best, nom) => ((derniers[nom] || '') < (derniers[best] || '') ? nom : best));
}

/** Réponses complètes : les lignes hors prestation sont « S.O. » d'office. */
export function reponsesCompletes(fiche) {
    const modele = MODELES[fiche.modele];
    const out = {};
    modele.points.forEach((_, i) => {
        const n = i + 1;
        const v = (fiche.horsPrestation || []).includes(n) ? 'S' : fiche.reponses?.[n] ?? fiche.reponses?.[String(n)];
        if (VALEURS.includes(v)) out[n] = v;
    });
    return out;
}

export function pointsACocher(fiche) {
    const n = MODELES[fiche.modele].points.length;
    return Array.from({ length: n }, (_, i) => i + 1).filter(k => !(fiche.horsPrestation || []).includes(k));
}

export function resume(fiche) {
    const rep = reponsesCompletes(fiche);
    const total = MODELES[fiche.modele].points.length;
    const compte = { F: 0, R: 0, S: 0 };
    Object.values(rep).forEach(v => { compte[v]++; });
    const aCocher = pointsACocher(fiche);
    return { total, coches: aCocher.filter(n => rep[n]).length, aCocher: aCocher.length, ...compte, aRevoir: Object.keys(rep).filter(n => rep[n] === 'R').map(Number) };
}

/** null si la fiche peut être validée (tous les points cochés), sinon le message à afficher. Observations : facultatives. */
export function erreurValidation(fiche) {
    const rep = reponsesCompletes(fiche);
    const manquants = pointsACocher(fiche).filter(n => !rep[n]);
    if (manquants.length) return manquants.length === 1 ? `Il reste le point ${manquants[0]} à cocher.` : `Il reste ${manquants.length} points à cocher (n° ${manquants.join(', ')}).`;
    return null;
}

/**
 * État d'une fiche pour l'affichage :
 *   'aucune' (pas de fiche), 'attente' (personne n'est encore arrivé), 'a_remplir', 'en_cours' (ouverte),
 *   'validee', 'a_revoir' (validée avec un point « À revoir »), 'envoyee' (partie au client avec le mail).
 */
export function etat(fiche) {
    if (!fiche) return 'attente';
    if (fiche.envoyeeLe) return 'envoyee';
    if (fiche.statut === 'validee') return resume(fiche).R ? 'a_revoir' : 'validee';
    if (fiche.statut === 'en_cours') return 'en_cours';
    return fiche.responsableUid ? 'a_remplir' : 'attente';
}

/** Le pointage de sortie de cette personne doit-il attendre la fiche ? */
export function sortieBloquee(fiche, uid) {
    return !!fiche && fiche.statut !== 'validee' && fiche.responsableUid === uid;
}

export const dateFr = (iso) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('/') : '');
export const nomFichierPdf = (fiche) => `Fiche_${fiche.modele}_${String(fiche.chantierName || 'chantier').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')}_${fiche.date}.pdf`;

// Police standard des PDF (Helvetica, encodage WinAnsi) : on remplace ce qu'elle ne sait pas écrire
const WINANSI_EN_PLUS = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
export function textePdf(value) {
    return String(value ?? '').normalize('NFC').replace(/\r\n?/g, '\n').split('').map(ch => {
        const code = ch.charCodeAt(0);
        if (ch === '\n' || (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WINANSI_EN_PLUS.includes(ch)) return ch;
        if (ch === 'Ł' || ch === 'ł') return ch === 'Ł' ? 'L' : 'l';
        const sansAccent = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
        return /^[\x20-\x7e]$/.test(sansAccent) ? sansAccent : '';
    }).join('');
}

/** Valeurs à écrire dans les champs texte du PDF. */
export function champsTexte(fiche) {
    return {
        site: fiche.chantierName || '',
        zone: fiche.zone || '',
        date: dateFr(fiche.date),
        heure: fiche.heure || '',
        agent: fiche.responsableNom || '',
        observations: fiche.observations || '',
        responsable: fiche.personnePrevenue || '',
        echeance: dateFr(fiche.aCorrigerAvant),
    };
}

/**
 * Remplit le PDF d'origine (octets) et renvoie le PDF final (Uint8Array), champs aplatis.
 *   PDFLib : la bibliothèque pdf-lib (window.PDFLib dans l'appli, le paquet npm ailleurs)
 */
export async function remplirPdf(PDFLib, modeleBytes, fiche) {
    const doc = await PDFLib.PDFDocument.load(modeleBytes);
    const form = doc.getForm();
    for (const [nom, valeur] of Object.entries(champsTexte(fiche))) {
        const champ = form.getTextField(nom);
        if (nom === 'observations') champ.enableMultiline();
        champ.setText(textePdf(valeur));
    }
    const rep = reponsesCompletes(fiche);
    MODELES[fiche.modele].points.forEach((_, i) => {
        const v = rep[i + 1];
        if (v) form.getRadioGroup(`point_${String(i + 1).padStart(2, '0')}`).select(OPTION_PDF[v]);
    });
    form.flatten();
    // pdf-lib laisse dans la page des renvois vers les cases supprimées : on les retire (sinon PDF abîmé)
    doc.getPages().forEach(page => {
        const annots = page.node.Annots();
        if (!annots) return;
        const garder = annots.asArray().filter(ref => doc.context.lookup(ref));
        if (garder.length) page.node.set(PDFLib.PDFName.of('Annots'), doc.context.obj(garder));
        else page.node.delete(PDFLib.PDFName.of('Annots'));
    });
    return doc.save();
}
