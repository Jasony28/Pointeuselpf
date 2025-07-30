// modules/utils.js

/**
 * Calcule les dates de début et de fin de la semaine en UTC pour assurer la cohérence.
 * @param {number} offset - Le décalage en semaines par rapport à la semaine actuelle (0 pour cette semaine, -1 pour la précédente, etc.).
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
 * Formate une durée en millisecondes en une chaîne de caractères "Xh Ymin".
 * @param {number} ms - La durée en millisecondes.
 * @returns {string} La durée formatée.
 */
export function formatMilliseconds(ms) {
    if (!ms || ms < 0) return "0h 0min";
    const totalHours = Math.floor(ms / 3600000);
    const totalMinutes = Math.round((ms % 3600000) / 60000);
    return `${totalHours}h ${totalMinutes}min`;
}

/**
 * Génère une URL de recherche Google Maps valide.
 * @param {string} address - L'adresse à rechercher.
 * @returns {string} L'URL complète.
 */
export function getGoogleMapsUrl(address) {
    if (!address) return '#';
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}