// modules/utils.js

/**
 * Calcule les dates de début et de fin de la semaine en UTC.
 * @param {number} offset - Le décalage en semaines.
 * @returns {{startOfWeek: Date, endOfWeek: Date}}
 */
export function getWeekDateRange(offset = 0) {
    const today = new Date();
    const todayUTC = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
    const dayOfWeekUTC = todayUTC.getUTCDay(); // Dimanche=0, Lundi=1...
    const diffToMonday = dayOfWeekUTC === 0 ? -6 : 1 - dayOfWeekUTC;
    
    const startOfWeek = new Date(todayUTC);
    startOfWeek.setUTCDate(todayUTC.getUTCDate() + diffToMonday + (offset * 7));
    
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setUTCDate(startOfWeek.getUTCDate() + 6);
    endOfWeek.setUTCHours(23, 59, 59, 999);
    
    return { startOfWeek, endOfWeek };
}

/**
 * Formate une durée en millisecondes en "Xh Ymin".
 * @param {number} ms - La durée en millisecondes.
 * @returns {string}
 */
export function formatMilliseconds(ms) {
    if (!ms || ms < 0) return "0h 0min";
    const totalMinutes = Math.round(ms / 60000);
    // On réutilise la fonction formatMinutes pour ne pas dupliquer le code
    return formatMinutes(totalMinutes);
}

/**
 * Formate une durée en minutes en "Xh Ymin".
 * @param {number} totalMinutes - La durée totale en minutes.
 * @returns {string}
 */
export function formatMinutes(totalMinutes) {
    if (!totalMinutes || totalMinutes < 0) return "0h 0min";
    const hours = Math.floor(totalMinutes / 60);
    const minutes = Math.round(totalMinutes % 60);
    return `${hours}h ${minutes}min`;
}

/**
 * Génère une URL de recherche Google Maps valide.
 * @param {string} address - L'adresse à rechercher.
 * @returns {string}
 */
export function getGoogleMapsUrl(address) {
    if (!address) return '#';
    // CORRIGÉ : Utilisation de la bonne URL et de la bonne syntaxe
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}