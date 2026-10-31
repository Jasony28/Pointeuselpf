/*
 Fichier: modules/work-profile.js
 Description: Profil de travail (conducteur, compétences par thème, affinités) et besoins des chantiers.
 Partagé par « Mes stats », les fiches de l'équipe, les fiches chantier et la planification automatique.

 Données :
  - users/{uid}.isDriver        : true si la personne peut conduire la voiture de l'équipe
  - users/{uid}.skillsSelf      : { [thème]: 1..5 } note donnée par l'employé
  - users/{uid}.skillsAdmin     : { [thème]: 1..5 } correction de l'admin (prioritaire)
  - affinites/{uid}             : { like: [uid…] (max 3), avoid: [uid…] (max 1) } — visible par l'admin seulement
  - chantiers/{id}.skillNeeds   : { [thème]: 0..3 } importance de chaque thème sur ce chantier
  - chantiers/{id}.teamSize     : nombre de personnes envoyées (défaut 2)
*/

export const THEMES = [
    { key: 'lits', label: 'Lits & linge' },
    { key: 'sdb', label: 'Salles de bain' },
    { key: 'cuisine', label: 'Cuisine' },
    { key: 'sols', label: 'Sols & aspirateur' },
    { key: 'poussiere', label: 'Poussière' },
    { key: 'vitres', label: 'Vitres' },
    { key: 'repassage', label: 'Repassage' },
    { key: 'gros', label: 'Gros nettoyage' },
];

export const SKILL_LABELS = { 1: 'Pas à l\'aise', 2: 'Peu à l\'aise', 3: 'Correct', 4: 'À l\'aise', 5: 'Très à l\'aise' };
export const NEED_LABELS = ['Pas concerné', 'Un peu', 'Important', 'Essentiel'];

export const MAX_LIKES = 3;
export const MAX_AVOIDS = 1;
export const DEFAULT_TEAM_SIZE = 2;

/** Réglages rapides des besoins selon le type de lieu */
export const NEED_PRESETS = {
    'Gîte / Airbnb': { lits: 3, sdb: 3, cuisine: 2, sols: 2, poussiere: 1 },
    'Maison': { lits: 1, sdb: 2, cuisine: 2, sols: 2, poussiere: 2, vitres: 1 },
    'Bureau': { sols: 3, poussiere: 3, sdb: 1, vitres: 1 },
    'Fin de chantier': { gros: 3, sols: 2, vitres: 2, poussiere: 2 },
};

/** Note retenue pour un thème : celle de l'admin, sinon celle de l'employé, sinon null (non renseignée). */
export function effectiveSkill(user, key) {
    const admin = user?.skillsAdmin?.[key];
    if (admin >= 1 && admin <= 5) return admin;
    const self = user?.skillsSelf?.[key];
    if (self >= 1 && self <= 5) return self;
    return null;
}

/** Heures de contrat par semaine en vigueur à une date (AAAA-MM-JJ). */
export function contractHoursAt(user, dateISO) {
    const history = (user?.contractHistory || []).filter(c => c.startDate).sort((a, b) => a.startDate.localeCompare(b.startDate));
    if (history.length === 0) return Number(user?.contractHours) || 0;
    const current = history.filter(c => c.startDate <= dateISO).pop() || history[0];
    return Number(current.hours) || 0;
}

export const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Ligne « thème : 1 2 3 4 5 » (boutons data-theme / data-value). */
export function ratingRowHTML(theme, value, { hint = '' } = {}) {
    const buttons = [1, 2, 3, 4, 5].map(n => `
        <button type="button" class="wp-rate${value === n ? ' is-active' : ''}" data-theme="${theme.key}" data-value="${n}"
            aria-pressed="${value === n}" aria-label="${theme.label} : ${n} sur 5 (${SKILL_LABELS[n]})" title="${SKILL_LABELS[n]}">${n}</button>`).join('');
    return `<div class="wp-theme-row">
        <span class="wp-theme-label">${theme.label}${hint ? ` <small>${hint}</small>` : ''}</span>
        <div class="wp-rates" role="group" aria-label="${theme.label}">${buttons}</div>
    </div>`;
}

/** Ligne « thème : Pas concerné / Un peu / Important / Essentiel » pour les chantiers. */
export function needRowHTML(theme, value = 0) {
    const buttons = NEED_LABELS.map((label, n) => `
        <button type="button" class="wp-need${value === n ? ' is-active' : ''}" data-need="${theme.key}" data-value="${n}" aria-pressed="${value === n}">${label}</button>`).join('');
    return `<div class="wp-theme-row">
        <span class="wp-theme-label">${theme.label}</span>
        <div class="wp-needs" role="group" aria-label="${theme.label}">${buttons}</div>
    </div>`;
}
