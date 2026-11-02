// Résumés quotidiens des heures (collection « resumesJour ») et durées des passages par chantier
// (collection « dureesChantiers ») : règles pures, sans Firebase, testées par tests/day-summaries.test.mjs.
//
// resumesJour/{AAAA-MM-JJ} (date UTC du début du pointage, comme les périodes du tableau de bord), admin seulement :
//   { date, users: { uid: { name, ms } }, chantiers: { nom: ms },
//     planif: { nom: { ms, uids: { uid: nombre de pointages } } } }
//   users / chantiers : durée = fin − début − pauseDurationMs (calcul du tableau de bord).
//   planif : pour la planification automatique — qui était sur quel chantier, et durée brute (fin − début,
//   comptée seulement entre 0 et 16 h, comme learnDurations dans modules/auto-planner.js).
// dureesChantiers/{nom normalisé}, lisible par tous (aucun nom de personne) : { name, jours: { AAAA-MM-JJ: ms } }
//   ms = fin − début − pause, seulement si positif (estimation de « Ma tournée »).
// Seuls les pointages terminés comptent.

// Firestore refuse une clé vide : un pointage sans chantier est rangé sous ce nom
const NO_CHANTIER = 'Sans chantier';
// Version des résumés : passée à 2 avec « planif » ; le tableau de bord redemande un recalcul complet si elle est plus ancienne
const SUMMARY_VERSION = 2;
const MAX_PLAN_MS = 16 * 3600000;

// Même normalisation que normName (modules/auto-planner.js) : sert d'identifiant de document (lettres, chiffres, espaces)
const normName = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Part d'un pointage dans les résumés, ou null s'il ne compte pas (en cours, incomplet). */
function contribution(p) {
    if (!p || !p.endTime || !p.timestamp || !p.uid) return null;
    const rawMs = new Date(p.endTime).getTime() - new Date(p.timestamp).getTime();
    const ms = rawMs - (Number(p.pauseDurationMs) || 0);
    if (!Number.isFinite(ms) || !Number.isFinite(rawMs)) return null;
    return {
        day: String(p.timestamp).slice(0, 10), uid: p.uid, name: p.userName || '', chantier: p.chantier || NO_CHANTIER, ms,
        planMs: rawMs > 0 && rawMs <= MAX_PLAN_MS ? rawMs : 0,
        routeKey: p.chantier ? normName(p.chantier) : '',
        routeMs: ms > 0 ? ms : 0,
    };
}

const FIELDS = ['day', 'uid', 'name', 'chantier', 'ms', 'planMs', 'routeKey', 'routeMs'];
const sameContribution = (a, b) => !!a && !!b && FIELDS.every(f => a[f] === b[f]);

/**
 * Changements à appliquer quand un pointage passe de `before` à `after` (création, modification, suppression).
 * Chaque changement : contribution avec ms / planMs / routeMs signés et count = −1 ou +1.
 */
function deltas(before, after) {
    const old = contribution(before);
    const now = contribution(after);
    if (sameContribution(old, now)) return [];
    const out = [];
    if (old) out.push({ ...old, ms: -old.ms, planMs: -old.planMs, routeMs: -old.routeMs, count: -1, name: now && now.uid === old.uid ? now.name : old.name });
    if (now) out.push({ ...now, count: 1 });
    return out;
}

/** Recalcul complet à partir de tous les pointages : { days: { 'AAAA-MM-JJ': doc }, routes: { cléChantier: doc } }. */
function buildAll(pointages) {
    const days = {};
    const routes = {};
    for (const p of pointages) {
        const c = contribution(p);
        if (!c) continue;
        const day = days[c.day] || (days[c.day] = { date: c.day, users: {}, chantiers: {}, planif: {} });
        const user = day.users[c.uid] || (day.users[c.uid] = { name: c.name, ms: 0 });
        user.ms += c.ms;
        if (c.name) user.name = c.name;
        day.chantiers[c.chantier] = (day.chantiers[c.chantier] || 0) + c.ms;
        const plan = day.planif[c.chantier] || (day.planif[c.chantier] = { ms: 0, uids: {} });
        plan.ms += c.planMs;
        plan.uids[c.uid] = (plan.uids[c.uid] || 0) + 1;
        if (c.routeKey) {
            const route = routes[c.routeKey] || (routes[c.routeKey] = { name: c.chantier, jours: {} });
            route.jours[c.day] = (route.jours[c.day] || 0) + c.routeMs;
        }
    }
    return { days, routes };
}

module.exports = { NO_CHANTIER, SUMMARY_VERSION, normName, contribution, deltas, buildAll };
