// Résumés quotidiens des heures (collection « resumesJour ») : règles pures, sans Firebase,
// testées par tests/day-summaries.test.mjs.
// Un document par jour (date UTC du début du pointage, comme les périodes du tableau de bord) :
// { date: 'AAAA-MM-JJ', users: { uid: { name, ms } }, chantiers: { nom: ms } }
// Seuls les pointages terminés comptent ; durée = fin − début − pauseDurationMs (même calcul que le tableau de bord).

// Firestore refuse une clé vide : un pointage sans chantier est rangé sous ce nom
const NO_CHANTIER = 'Sans chantier';

/** Part d'un pointage dans les résumés, ou null s'il ne compte pas (en cours, incomplet). */
function contribution(p) {
    if (!p || !p.endTime || !p.timestamp || !p.uid) return null;
    const ms = new Date(p.endTime).getTime() - new Date(p.timestamp).getTime() - (Number(p.pauseDurationMs) || 0);
    if (!Number.isFinite(ms)) return null;
    return { day: String(p.timestamp).slice(0, 10), uid: p.uid, name: p.userName || '', chantier: p.chantier || NO_CHANTIER, ms };
}

const sameContribution = (a, b) => !!a && !!b && a.day === b.day && a.uid === b.uid && a.name === b.name && a.chantier === b.chantier && a.ms === b.ms;

/** Changements à appliquer quand un pointage passe de `before` à `after` (création, modification, suppression). */
function deltas(before, after) {
    const old = contribution(before);
    const now = contribution(after);
    if (sameContribution(old, now)) return [];
    const out = [];
    if (old) out.push({ ...old, ms: -old.ms, name: now && now.uid === old.uid ? now.name : old.name });
    if (now) out.push(now);
    return out;
}

/** Recalcul complet à partir de tous les pointages : { 'AAAA-MM-JJ': document du jour }. */
function buildAll(pointages) {
    const days = {};
    for (const p of pointages) {
        const c = contribution(p);
        if (!c) continue;
        const day = days[c.day] || (days[c.day] = { date: c.day, users: {}, chantiers: {} });
        const user = day.users[c.uid] || (day.users[c.uid] = { name: c.name, ms: 0 });
        user.ms += c.ms;
        if (c.name) user.name = c.name;
        day.chantiers[c.chantier] = (day.chantiers[c.chantier] || 0) + c.ms;
    }
    return days;
}

module.exports = { NO_CHANTIER, contribution, deltas, buildAll };
