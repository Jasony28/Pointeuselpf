/*
 Fichier: modules/auto-planner.js
 Description: Planification automatique des équipes (qui va sur quel chantier) pour une semaine.

 Principe : construction gloutonne puis amélioration par « recuit simulé » (des milliers de petits
 échanges : une personne remplacée par une autre, deux personnes qui échangent leur chantier du jour).
 Chaque planning reçoit un coût ; on garde le moins cher.

 Règles strictes (coût très élevé, donc évitées) :
   congé approuvé · deux chantiers en même temps · plus de MAX_DAY_HOURS par jour ·
   deux personnes « à éviter » ensemble · équipe sans conducteur · dépasser son contrat.
 Préférences (dans l'ordre d'importance par défaut) :
   1. Heures : chacun reçoit son contrat ; s'il n'y a pas assez de travail, le même pourcentage
      de son contrat pour tout le monde (avec rattrapage des écarts depuis le début du mois).
   2. Compétences : au moins une personne à l'aise sur chaque tâche importante du chantier.
   3. Continuité : quelqu'un qui connaît déjà le chantier.
   4. Affinités : les binômes qui aiment travailler ensemble (réciproque = double).
   5. Stabilité : garder les mêmes coéquipiers sur la journée.
 Les trajets ne comptent pas dans les heures.
*/

import { THEMES, DEFAULT_TEAM_SIZE, effectiveSkill, contractHoursAt } from "./work-profile.js";

export const MAX_DAY_HOURS = 9;
const BUFFER_MIN = 15; // battement minimum entre deux chantiers qui ont une heure de début
const HARD = 1000;

export const DEFAULT_WEIGHTS = { hours: 30, skills: 4, continuity: 8, affinity: 6, stability: 5 };
export const WEIGHT_LABELS = {
    hours: 'Heures selon les contrats',
    skills: 'Compétences',
    continuity: 'Connaît déjà le chantier',
    affinity: 'Affinités',
    stability: 'Mêmes coéquipiers sur la journée',
};

const toMin = (t) => { if (!t) return null; const [h, m] = t.split(':').map(Number); return Number.isFinite(h) ? h * 60 + (m || 0) : null; };
const round1 = (x) => Math.round(x * 10) / 10;

/**
 * @param {object} p
 * @param {Array}  p.lines      lignes du planning de la semaine { id, date, chantierId, chantierName, startTime, duration, teamNames }
 * @param {Array}  p.users      utilisateurs (docs « users » avec id)
 * @param {Map}    p.affinities uid → { like: [uid], avoid: [uid] }
 * @param {Array}  p.chantiers  chantiers { id, teamSize, skillNeeds, totalHeuresPrevues }
 * @param {Array}  p.leaves     congés approuvés { userId, startDate, endDate }
 * @param {Array}  p.pastLines  lignes passées (8 semaines) pour la continuité et le rattrapage du mois
 * @param {string} p.weekStart  lundi AAAA-MM-JJ
 * @param {boolean} p.keepExisting garder les personnes déjà placées
 * @param {object} p.weights    poids des préférences
 */
export function planWeek({ lines, users, affinities = new Map(), chantiers = [], leaves = [], pastLines = [], weekStart, keepExisting = true, weights = DEFAULT_WEIGHTS, iterations = 40000 }) {
    const W = { ...DEFAULT_WEIGHTS, ...weights };
    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + i); return d.toISOString().split('T')[0]; });
    const chantierById = new Map(chantiers.map(c => [c.id, c]));
    const warnings = [];

    // ---------- Personnes ----------
    const people = users
        .filter(u => u.status === 'approved' && (u.role === 'user' || u.role === 'admin'))
        .map(u => ({ ...u, contract: contractHoursAt(u, weekStart) }))
        .filter(u => u.contract > 0);
    if (people.length === 0) return { error: "Aucun membre avec des heures de contrat : renseignez les contrats dans « Fiches de l'équipe »." };
    const P = people.length;
    const idx = new Map(people.map((u, i) => [u.id, i]));
    const byName = new Map(people.map((u, i) => [u.displayName, i]));

    const onLeave = people.map(u => new Set(days.filter(d => leaves.some(l => l.userId === u.id && l.startDate <= d && (l.endDate || l.startDate) >= d))));
    // Disponibilité : contrat au prorata des jours ouvrables (lun-ven) sans congé
    const avail = people.map((u, i) => u.contract * days.slice(0, 5).filter(d => !onLeave[i].has(d)).length / 5);
    const skill = people.map(u => Object.fromEntries(THEMES.map(t => [t.key, effectiveSkill(u, t.key) ?? 3])));
    const driver = people.map(u => u.isDriver === true);
    const pairScore = Array.from({ length: P }, () => new Float64Array(P)); // >0 affinité, <0 à éviter
    people.forEach((u, i) => {
        const a = affinities.get(u.id) || {};
        (a.like || []).forEach(id => { const j = idx.get(id); if (j !== undefined && j !== i) { pairScore[i][j] += 1; pairScore[j][i] += 1; } });
        (a.avoid || []).forEach(id => { const j = idx.get(id); if (j !== undefined && j !== i) { pairScore[i][j] = -99; pairScore[j][i] = -99; } });
    });
    if (!driver.some(Boolean)) warnings.push("Personne n'a coché « Je suis conducteur·rice » : la règle du conducteur est ignorée.");
    const needDriver = driver.some(Boolean);

    // ---------- Historique : continuité + rattrapage du mois ----------
    const known = new Map(); // chantierId → Int32Array(P) nombre de passages
    const monthStart = weekStart.slice(0, 8) + '01';
    const pastHours = new Float64Array(P);
    let pastTotal = 0;
    for (const l of pastLines) {
        const team = (l.teamNames || []).map(n => byName.get(n)).filter(i => i !== undefined);
        if (!team.length) continue;
        if (!known.has(l.chantierId)) known.set(l.chantierId, new Int32Array(P));
        team.forEach(i => known.get(l.chantierId)[i]++);
        if (l.date >= monthStart && l.date < weekStart) {
            const h = lineDuration(l, chantierById) / team.length;
            team.forEach(i => { pastHours[i] += h; pastTotal += h; });
        }
    }

    // ---------- Créneaux à remplir ----------
    const L = lines.map(l => {
        const c = chantierById.get(l.chantierId) || {};
        const size = Math.max(1, Math.min(P, Number(c.teamSize) || DEFAULT_TEAM_SIZE));
        const existing = (l.teamNames || []).map(n => byName.get(n)).filter(i => i !== undefined);
        const locked = keepExisting ? existing.slice(0, Math.max(size, existing.length)) : [];
        const team = [...locked];
        return {
            src: l, day: days.indexOf(l.date), size: Math.max(size, locked.length), duration: lineDuration(l, chantierById),
            start: toMin(l.startTime), needs: c.skillNeeds || {}, chantierId: l.chantierId,
            team, nLocked: locked.length, foreign: (l.teamNames || []).filter(n => !byName.has(n)),
        };
    }).filter(l => l.day >= 0);
    const totalWork = L.reduce((s, l) => s + l.duration, 0);
    const totalAvail = avail.reduce((s, a) => s + a, 0);
    const ratio = totalAvail > 0 ? Math.min(1, totalWork / totalAvail) : 0;

    // Cible = contrat disponible × taux de remplissage, corrigée de l'écart accumulé depuis le début du mois
    const contractSum = people.reduce((s, u) => s + u.contract, 0);
    const target = people.map((u, i) => {
        const debt = pastTotal > 0 ? pastTotal * u.contract / contractSum - pastHours[i] : 0;
        return Math.max(0, Math.min(avail[i], avail[i] * ratio + debt));
    });
    if (totalWork > totalAvail + 0.01) warnings.push(`Il y a ${round1(totalWork - totalAvail)} h de travail de plus que les contrats disponibles : certaines personnes dépasseront leur contrat (heures supplémentaires à valider).`);

    const linesByDay = days.map((_, d) => L.filter(l => l.day === d));

    // ---------- Coûts ----------
    const hours = new Float64Array(P);
    const personHours = (l) => l.duration / Math.max(1, l.team.length + l.foreign.length);
    const recomputeHours = () => { hours.fill(0); L.forEach(l => { const h = personHours(l); l.team.forEach(i => { hours[i] += h; }); }); };

    function hoursCost() {
        let c = 0;
        for (let i = 0; i < P; i++) {
            const diff = hours[i] - target[i];
            c += W.hours * diff * diff;
            const over = hours[i] - Math.max(avail[i], target[i]);
            if (over > 0.01 && ratio < 1) c += HARD * over; // dépasser son contrat alors qu'il reste de la place ailleurs
        }
        return c;
    }

    function lineCost(l) {
        let c = 0;
        const t = l.team;
        // Conducteur
        if (needDriver && t.length && !t.some(i => driver[i])) c += HARD;
        // Compétences : la meilleure personne de l'équipe sur chaque tâche demandée
        for (const [key, need] of Object.entries(l.needs)) {
            if (!need) continue;
            let best = 0;
            for (const i of t) best = Math.max(best, skill[i][key]);
            c += W.skills * need * (5 - best);
        }
        // Affinités / à éviter
        for (let a = 0; a < t.length; a++) for (let b = a + 1; b < t.length; b++) {
            const s = pairScore[t[a]][t[b]];
            c += s < 0 ? HARD : -W.affinity * s;
        }
        // Continuité
        const k = known.get(l.chantierId);
        if (k) for (const i of t) c -= W.continuity * Math.min(k[i], 3) / 3;
        return c;
    }

    function dayCost(d) {
        let c = 0;
        const ls = linesByDay[d];
        const perPerson = new Map(); // i → { h, slots: [[s,e]], mates: Set }
        for (const l of ls) {
            c += lineCost(l);
            const h = personHours(l);
            for (const i of l.team) {
                if (onLeave[i].has(days[d])) c += HARD;
                let pp = perPerson.get(i);
                if (!pp) { pp = { h: 0, slots: [], mates: new Set() }; perPerson.set(i, pp); }
                pp.h += h;
                if (l.start !== null) pp.slots.push([l.start, l.start + h * 60]);
                for (const j of l.team) if (j !== i) pp.mates.add(j);
            }
        }
        for (const pp of perPerson.values()) {
            if (pp.h > MAX_DAY_HOURS) c += HARD * (pp.h - MAX_DAY_HOURS);
            pp.slots.sort((a, b) => a[0] - b[0]);
            for (let s = 1; s < pp.slots.length; s++) if (pp.slots[s][0] < pp.slots[s - 1][1] + BUFFER_MIN) c += HARD;
            c += W.stability * Math.max(0, pp.mates.size - 2);
        }
        return c;
    }

    // ---------- 1. Construction gloutonne ----------
    recomputeHours();
    const dayCosts = days.map((_, d) => dayCost(d));
    const order = [...L].sort((a, b) => a.day - b.day || (a.start ?? 9999) - (b.start ?? 9999) || b.duration - a.duration);
    for (const l of order) {
        while (l.team.length < l.size) {
            let best = -1, bestCost = Infinity;
            for (let i = 0; i < P; i++) {
                if (l.team.includes(i)) continue;
                l.team.push(i);
                recomputeHours();
                const cost = dayCost(l.day) + hoursCost();
                l.team.pop();
                if (cost < bestCost) { bestCost = cost; best = i; }
            }
            if (best < 0) break;
            l.team.push(best);
        }
    }
    recomputeHours();
    days.forEach((_, d) => { dayCosts[d] = dayCost(d); });

    // ---------- 2. Amélioration (recuit simulé) ----------
    const slots = [];
    L.forEach(l => { for (let k = l.nLocked; k < l.team.length; k++) slots.push([l, k]); });
    let hoursCostCache = hoursCost();
    let current = dayCosts.reduce((s, x) => s + x, 0) + hoursCostCache;
    const slotsByDay = days.map((_, d) => slots.filter(([o]) => o.day === d));
    const bestTeams = () => L.map(l => [...l.team]);
    let best = { cost: current, teams: bestTeams() };

    if (slots.length) {
        const T0 = 60, T1 = 0.3;
        for (let it = 0; it < iterations; it++) {
            const T = T0 * Math.pow(T1 / T0, it / iterations);
            const [l, k] = slots[(Math.random() * slots.length) | 0];
            const sameDay = slotsByDay[l.day].filter(([o]) => o !== l);
            const doSwap = sameDay.length && Math.random() < 0.4;
            let undo;
            if (doSwap) {
                const [o, ko] = sameDay[(Math.random() * sameDay.length) | 0];
                const a = l.team[k], b = o.team[ko];
                if (l.team.includes(b) || o.team.includes(a)) continue;
                const ha = personHours(l), hb = personHours(o);
                l.team[k] = b; o.team[ko] = a;
                hours[a] += hb - ha; hours[b] += ha - hb;
                undo = () => { l.team[k] = a; o.team[ko] = b; hours[a] -= hb - ha; hours[b] -= ha - hb; };
            } else {
                const a = l.team[k];
                const b = (Math.random() * P) | 0;
                if (l.team.includes(b)) continue;
                const h = personHours(l);
                l.team[k] = b; hours[a] -= h; hours[b] += h;
                undo = () => { l.team[k] = a; hours[a] += h; hours[b] -= h; };
            }
            const newDay = dayCost(l.day);
            const newHours = hoursCost();
            const next = current - dayCosts[l.day] + newDay - hoursCostCache + newHours;
            const delta = next - current;
            if (delta <= 0 || Math.random() < Math.exp(-delta / T)) {
                dayCosts[l.day] = newDay;
                hoursCostCache = newHours;
                current = next;
                if (current < best.cost - 1e-9) best = { cost: current, teams: bestTeams() };
            } else {
                undo();
            }
        }
    }

    L.forEach((l, n) => { l.team = best.teams[n]; });
    recomputeHours();

    // ---------- Résultat expliqué ----------
    const name = (i) => people[i].displayName;
    const result = L.map(l => {
        const t = l.team;
        const reasons = [], issues = [];
        const drivers = t.filter(i => driver[i]);
        if (needDriver) drivers.length ? reasons.push(`🚗 ${drivers.map(name).join(', ')}`) : issues.push('Aucun conducteur');
        for (const [key, need] of Object.entries(l.needs)) {
            if (need < 2) continue;
            let bi = -1; t.forEach(i => { if (bi < 0 || skill[i][key] > skill[bi][key]) bi = i; });
            if (bi < 0) continue;
            const label = THEMES.find(x => x.key === key)?.label || key;
            const v = skill[bi][key];
            if (v >= 4) reasons.push(`${label} : ${name(bi)} ${v}/5`);
            else if (v <= 2) issues.push(`${label} : personne à l'aise (max ${v}/5)`);
        }
        for (let a = 0; a < t.length; a++) for (let b = a + 1; b < t.length; b++) {
            const s = pairScore[t[a]][t[b]];
            if (s >= 2) reasons.push(`💚 ${name(t[a])} & ${name(t[b])} (réciproque)`);
            else if (s > 0) reasons.push(`💚 ${name(t[a])} & ${name(t[b])}`);
            else if (s < 0) issues.push(`${name(t[a])} & ${name(t[b])} à éviter`);
        }
        const k = known.get(l.chantierId);
        const knowers = k ? t.filter(i => k[i] > 0) : [];
        if (knowers.length) reasons.push(`Connaît le chantier : ${knowers.map(name).join(', ')}`);
        t.forEach(i => { if (onLeave[i].has(days[l.day])) issues.push(`${name(i)} est en congé`); });
        if (t.length + l.foreign.length < l.size) issues.push(`Équipe incomplète (${t.length}/${l.size})`);
        const teamNames = [...l.foreign, ...t.map(name)];
        const before = l.src.teamNames || [];
        const changed = teamNames.length !== before.length || teamNames.some(n => !before.includes(n));
        return { line: l.src, teamNames, reasons, issues, changed, personHours: round1(personHours(l)) };
    });

    // Contrôles de journée (chevauchements, journées trop longues) affichés par personne
    const dayIssues = [];
    days.forEach((date, d) => {
        const per = new Map();
        linesByDay[d].forEach(l => l.team.forEach(i => {
            const pp = per.get(i) || { h: 0, slots: [] };
            pp.h += personHours(l);
            if (l.start !== null) pp.slots.push([l.start, l.start + personHours(l) * 60, l.src.chantierName]);
            per.set(i, pp);
        }));
        per.forEach((pp, i) => {
            if (pp.h > MAX_DAY_HOURS) dayIssues.push(`${date} — ${name(i)} : ${round1(pp.h)} h dans la journée`);
            pp.slots.sort((a, b) => a[0] - b[0]);
            for (let s = 1; s < pp.slots.length; s++) if (pp.slots[s][0] < pp.slots[s - 1][1] + BUFFER_MIN) dayIssues.push(`${date} — ${name(i)} : ${pp.slots[s - 1][2]} et ${pp.slots[s][2]} se chevauchent`);
        });
    });

    return {
        result,
        warnings: [...warnings, ...dayIssues],
        ratio, totalWork: round1(totalWork), totalAvail: round1(totalAvail),
        people: people.map((u, i) => ({
            id: u.id, name: u.displayName, contract: u.contract, avail: round1(avail[i]), target: round1(target[i]),
            hours: round1(hours[i]), isDriver: driver[i], leaveDays: onLeave[i].size,
        })).sort((a, b) => a.name.localeCompare(b.name)),
    };
}

/** Heures totales de l'équipe pour une ligne : sa durée, sinon la durée prévue du chantier, sinon 2 h. */
function lineDuration(l, chantierById) {
    const d = Number(l.duration);
    if (d > 0) return d;
    const c = Number(chantierById.get(l.chantierId)?.totalHeuresPrevues);
    return c > 0 ? c : 2;
}
