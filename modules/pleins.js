// Pleins de carburant : le conducteur note chaque plein (litres, prix payé, plaque, photo de la pompe ou du ticket).
// Collection « pleins » (règles : docs/firestore.rules, 13) — un document par plein :
//   { uid, userName, date (AAAA-MM-JJ), litres, montant (€ payés), plaque, createdAt }
// La photo (image réduite, en data URL) est à part dans « pleinsPhotos/{même id} » : { uid, photo, createdAt },
// pour que les listes restent légères ; elle n'est lue que quand on l'ouvre.
// Les fonctions sans Firebase (parseAmount, normalizePlate, validatePlein, summarize) sont testées par tests/pleins.test.mjs.
// Plaque inconnue : le conducteur choisit « Plaque non disponible », enregistré comme NO_PLATE (« NON-DISPO »).

export const PLEINS = 'pleins';
export const PLEINS_PHOTOS = 'pleinsPhotos';
export const PLATE_MAX = 12;
export const LITRES_MAX = 500;
export const MONTANT_MAX = 2000;
// Un document Firestore fait 1 Mo au plus : la photo (en texte) doit rester nettement en dessous
export const PHOTO_MAX_CHARS = 700000;

// Voitures de l'équipe, proposées par défaut dans la liste du formulaire (plaque déjà au format de normalizePlate).
export const DEFAULT_PLATES = [
    { plaque: '2-FSZ-885', label: 'Julien (BMW)' },
    { plaque: '2-JEG-688', label: 'Aline' },
    { plaque: '2-JTX-792', label: 'Florian' },
    { plaque: '1-UBE-231', label: 'Laura' },
    { plaque: '2-HHF-723', label: 'Sandrine (Hyundai)' },
    { plaque: '2-HTE-549', label: 'Sandrine (Clio blanche)' },
    { plaque: '2-KEA-776', label: 'Sandrine (Renault)' },
    { plaque: 'K-9718-BT', label: 'Sandrine (Fiat)' },
];
// Valeur enregistrée quand le conducteur ne connaît pas la plaque (respecte les règles : 4 à 12 caractères).
export const NO_PLATE = 'NON-DISPO';

/** Texte à afficher pour une plaque enregistrée. */
export const plateLabel = (plaque) => (plaque === NO_PLATE ? 'Plaque non dispo' : (plaque || ''));

/** « 45,3 » ou « 45.30 € » → 45.3 ; texte invalide → NaN. */
export function parseAmount(text) {
    const clean = String(text ?? '').replace(/[\s€lL]/g, '').replace(',', '.');
    if (!/^\d+(\.\d+)?$/.test(clean)) return NaN;
    return Number(clean);
}

/** « 1-abc 123 » → « 1-ABC-123 » : majuscules, tirets entre les blocs, rien d'autre que lettres et chiffres. */
export function normalizePlate(text) {
    return String(text ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, PLATE_MAX);
}

/** Vérifie un plein saisi ; renvoie { value } ou { error } (message à afficher). */
export function validatePlein({ date, plaque, litres, montant, hasPhoto }, today) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return { error: "Indique la date du plein." };
    if (today && date > today) return { error: "La date du plein ne peut pas être dans le futur." };
    const plate = plaque === NO_PLATE ? NO_PLATE : normalizePlate(plaque);
    if (plate.replace(/-/g, '').length < 4) return { error: "Indique la plaque de la voiture (ex. : 1-ABC-123)." };
    const l = parseAmount(litres);
    if (!(l > 0)) return { error: "Indique le nombre de litres (ex. : 42,5)." };
    if (l > LITRES_MAX) return { error: `${LITRES_MAX} litres au plus : vérifie le nombre de litres.` };
    const m = parseAmount(montant);
    if (!(m > 0)) return { error: "Indique le prix payé en euros (ex. : 78,40)." };
    if (m > MONTANT_MAX) return { error: "Vérifie le prix payé : il paraît trop élevé." };
    if (!hasPhoto) return { error: "Ajoute la photo de la pompe ou du ticket." };
    return { value: { date, plaque: plate, litres: Math.round(l * 100) / 100, montant: Math.round(m * 100) / 100 } };
}

export const pricePerLitre = (p) => (p?.litres > 0 ? p.montant / p.litres : null);

/** Totaux d'une liste de pleins, et détail par plaque (trié par dépense). */
export function summarize(pleins) {
    const byPlate = new Map();
    let litres = 0, montant = 0;
    pleins.forEach(p => {
        litres += p.litres || 0;
        montant += p.montant || 0;
        const s = byPlate.get(p.plaque) || { plaque: p.plaque, litres: 0, montant: 0, count: 0 };
        s.litres += p.litres || 0; s.montant += p.montant || 0; s.count++;
        byPlate.set(p.plaque, s);
    });
    return { count: pleins.length, litres, montant, plates: [...byPlate.values()].sort((a, b) => b.montant - a.montant) };
}

export const byNewest = (a, b) => (b.date || '').localeCompare(a.date || '') || ((b.createdMs || 0) - (a.createdMs || 0));

const fr = (v, digits) => (v || 0).toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const litresLabel = (v) => `${fr(v, 2)} L`;
export const eurosLabel = (v) => `${fr(v, 2)} €`;
export const perLitreLabel = (p) => { const v = pricePerLitre(p); return v ? `${fr(v, 3)} €/L` : ''; };
