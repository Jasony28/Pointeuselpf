/*
 Fichier: modules/auto-planner.js
 Description: Planification automatique des équipes (qui va sur quel chantier) — version 2.

 Fonction pure (aucun accès Firebase) : testable en Node (tests/auto-planner.test.mjs) et exécutée
 dans un Web Worker par la page Planification (modules/auto-planner-worker.js).

 1. PRÉPARATION — personnes avec un contrat, disponibilité (congés au prorata), cible d'heures :
      taux = min(1, travail ÷ contrats disponibles) ; cible = disponibilité × taux + rattrapage du mois.
    Durée d'un chantier : durée réelle apprise des pointages (médiane, valeurs aberrantes écartées),
    sinon durée de la ligne, sinon durée prévue du chantier, sinon 2 h. Les trajets ne comptent pas.
 2. RECHERCHE — pour chaque redémarrage (graine différente) :
      a. construction gloutonne (ordre légèrement aléatoire) ;
      b. recuit simulé : remplacer une personne, échanger deux personnes de deux chantiers du même jour,
         échanger toute la journée de deux personnes ; température calibrée automatiquement ;
      c. polissage : descente exhaustive jusqu'à ce qu'AUCUN remplacement ni échange ne l'améliore.
    On garde le meilleur des redémarrages. Même graine = même résultat.
 3. CONTRÔLE — validatePlan() revérifie toutes les règles strictes avec un code indépendant
    (sans réutiliser la fonction de coût) ; evaluatePlan() calcule les indicateurs de qualité.

 Ordre des priorités (lexicographique grâce aux ordres de grandeur des poids) :
   règles strictes ≫ heures (somme des carrés + pire écart) ≫ compétences, continuité, affinités,
   habitudes d'équipe (qui travaille souvent avec qui), stabilité de la journée, kilomètres,
   changements par rapport au planning existant.
 Règles strictes : congé · chevauchement (trajet + 15 min compris) · plus de MAX_DAY_HOURS par jour ·
   équipe sans conducteur · dépassement de contrat alors qu'il reste de la place.
*/

import { THEMES, DEFAULT_TEAM_SIZE, effectiveSkill, contractHoursAt, isSuperAdmin } from "./work-profile.js";

export const MAX_DAY_HOURS = 9;
export const BUFFER_MIN = 15;          // battement minimum entre deux chantiers, en plus du trajet
export const SPEED_KMH = 45;           // vitesse moyenne sur route
export const ROAD_FACTOR = 1.3;        // distance route ≈ vol d'oiseau × 1,3
const HARD = 100000;

export const DEFAULT_WEIGHTS = { hours: 30, fairness: 20, skills: 4, continuity: 8, affinity: 6, habits: 6, stability: 5, travel: 0.3, changes: 0 };
export const WEIGHT_LABELS = {
    hours: 'Heures selon les contrats',
    fairness: 'Personne n\'est lésé (pire écart)',
    skills: 'Compétences',
    continuity: 'Connaît déjà le chantier',
    affinity: 'Affinités',
    habits: 'Garder les équipes habituelles',
    stability: 'Mêmes coéquipiers sur la journée',
    travel: 'Moins de kilomètres',
    changes: 'Changer le moins possible',
};

// ---------- Outils ----------
export const toMin = (t) => { if (!t || typeof t !== 'string') return null; const [h, m] = t.split(':').map(Number); return Number.isFinite(h) ? h * 60 + (m || 0) : null; };
const round1 = (x) => Math.round(x * 10) / 10;
const round2 = (x) => Math.round(x * 100) / 100;
export const normName = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Générateur pseudo-aléatoire reproductible (mulberry32). */
export function makeRng(seed) {
    let a = (seed >>> 0) || 1;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Distance à vol d'oiseau en km. */
export function crowKm(a, b) {
    if (!a || !b || !Number.isFinite(a.lat) || !Number.isFinite(b.lat)) return null;
    const R = 6371, rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
}
/** Trajet estimé entre deux chantiers : { km, min }. Coordonnées inconnues → 0. */
export function travelBetween(a, b) {
    const d = crowKm(a, b);
    if (d === null) return { km: 0, min: 0 };
    const km = d * ROAD_FACTOR;
    return { km, min: km / SPEED_KMH * 60 };
}

const weekDays = (weekStart) => Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + i); return d.toISOString().split('T')[0]; });
const onLeaveDays = (userId, days, leaves) => new Set(days.filter(d => leaves.some(l => l.userId === userId && l.startDate <= d && (l.endDate || l.startDate) >= d)));
const plannablePeople = (users, weekStart) => users
    .filter(u => u.status === 'approved' && (u.role === 'user' || u.role === 'admin') && !isSuperAdmin(u))
    .map(u => ({ ...u, contract: contractHoursAt(u, weekStart) }))
    .filter(u => u.contract > 0);

/** Ligne « Congé » créée par la page Congés dans le planning (pas un chantier). */
export const isLeaveLine = (l) => l?.chantierId === 'LEAVE_ID' || !!l?.id_leaveRequest;

// ---------- Durées réelles ----------
/**
 * Apprend la durée réelle (heures totales de l'équipe) de chaque chantier à partir des pointages :
 * somme des pointages par chantier et par jour, sur les `maxSamples` derniers jours de passage,
 * valeurs aberrantes écartées (méthode de l'écart interquartile), puis médiane.
 * @returns {Map<string, {hours:number, samples:number}>} chantierId → durée
 */
export function learnDurations(pointages, chantiers, options) {
    return durationsFromVisits(visitsFromPointages(pointages, chantiers), options);
}

// Nom de chantier (ou ancien nom « Petites Fées ») → identifiant ; les vrais noms passent avant les alias
function chantierIdResolver(chantiers) {
    const idByName = new Map(chantiers.map(c => [normName(c.name), c.id]));
    for (const c of chantiers) for (const a of c.lpfAliases || []) if (!idByName.has(normName(a))) idByName.set(normName(a), c.id);
    return (name) => idByName.get(normName(name));
}

/**
 * Passages (un par jour et par chantier) : { date, chantierId, uids: Set, minutes }.
 * minutes = durée brute de l'équipe (fin − début), pointages entre 0 et 16 h seulement ;
 * uids = toutes les personnes pointées ce jour-là sur ce chantier.
 */
export function visitsFromPointages(pointages, chantiers) {
    const resolve = chantierIdResolver(chantiers);
    const visits = new Map();
    for (const p of pointages) {
        if (!p || !p.timestamp) continue;
        const id = resolve(p.chantier);
        if (!id) continue;
        const date = String(p.timestamp).slice(0, 10);
        const key = date + '|' + id;
        if (!visits.has(key)) visits.set(key, { date, chantierId: id, uids: new Set(), minutes: 0 });
        const v = visits.get(key);
        if (p.uid) v.uids.add(p.uid);
        if (!p.endTime) continue;
        const min = (new Date(p.endTime) - new Date(p.timestamp)) / 60000;
        if (min > 0 && min <= 16 * 60) v.minutes += min;
    }
    return [...visits.values()];
}

/**
 * Mêmes passages, lus dans les résumés quotidiens (resumesJour, champ planif) au lieu des pointages :
 * une lecture par jour au lieu d'une par pointage. Seuls les pointages terminés y figurent.
 */
export function visitsFromDaySummaries(days, chantiers) {
    const resolve = chantierIdResolver(chantiers);
    const visits = new Map();
    for (const day of days) {
        for (const [name, plan] of Object.entries(day?.planif || {})) {
            const id = resolve(name);
            if (!id) continue;
            const key = day.date + '|' + id;
            if (!visits.has(key)) visits.set(key, { date: day.date, chantierId: id, uids: new Set(), minutes: 0 });
            const v = visits.get(key);
            Object.entries(plan.uids || {}).forEach(([uid, n]) => { if (n > 0) v.uids.add(uid); });
            if (plan.ms > 0) v.minutes += plan.ms / 60000;
        }
    }
    return [...visits.values()];
}

/** Durée réelle de chaque chantier à partir des passages (voir learnDurations). */
export function durationsFromVisits(visits, { maxSamples = 15, minSamples = 3 } = {}) {
    const perDay = new Map(); // id → Map(date → minutes)
    for (const v of visits) {
        if (!(v.minutes > 0)) continue;
        if (!perDay.has(v.chantierId)) perDay.set(v.chantierId, new Map());
        perDay.get(v.chantierId).set(v.date, v.minutes);
    }
    const out = new Map();
    for (const [id, m] of perDay) {
        let values = [...m.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, maxSamples).map(([, v]) => v / 60);
        if (values.length >= 4) {
            const s = [...values].sort((a, b) => a - b);
            const q = (f) => s[Math.floor(f * (s.length - 1))];
            const q1 = q(0.25), q3 = q(0.75), iqr = q3 - q1;
            values = values.filter(v => v >= q1 - 1.5 * iqr && v <= q3 + 1.5 * iqr);
        }
        if (values.length < minSamples) continue;
        const s = [...values].sort((a, b) => a - b);
        const med = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
        out.set(id, { hours: Math.round(med * 4) / 4, samples: values.length });
    }
    return out;
}

/** Durée retenue pour une ligne : { hours, source }. */
export function lineDuration(line, chantier, durations, useRealDurations = true) {
    const real = durations?.get?.(line.chantierId);
    if (useRealDurations && real && real.hours > 0) return { hours: real.hours, source: 'réel', planned: Number(line.duration) || Number(chantier?.totalHeuresPrevues) || 0, samples: real.samples };
    const d = Number(line.duration);
    if (d > 0) return { hours: d, source: 'planning' };
    const c = Number(chantier?.totalHeuresPrevues);
    if (c > 0) return { hours: c, source: 'chantier' };
    return { hours: 2, source: 'défaut' };
}

// ---------- 1. Préparation ----------
export function prepare(input) {
    const { lines, users, affinities = new Map(), chantiers = [], leaves = [], pastLines = [], weekStart,
        keepExisting = true, durations = new Map(), useRealDurations = true } = input;
    const W = { ...DEFAULT_WEIGHTS, ...(input.weights || {}) };
    const days = weekDays(weekStart);
    const chantierById = new Map(chantiers.map(c => [c.id, c]));
    const dataWarnings = [];

    const people = plannablePeople(users, weekStart);
    const P = people.length;
    const idx = new Map(people.map((u, i) => [u.id, i]));
    const byName = new Map(people.map((u, i) => [u.displayName, i]));
    const superNames = new Set(users.filter(isSuperAdmin).map(u => (u.displayName || '').trim()).filter(Boolean));
    const isSuperName = (n) => superNames.has(String(n || '').trim());
    const onLeave = people.map(u => onLeaveDays(u.id, days, leaves));
    const avail = people.map((u, i) => u.contract * days.slice(0, 5).filter(d => !onLeave[i].has(d)).length / 5);
    const skill = people.map(u => Object.fromEntries(THEMES.map(t => [t.key, effectiveSkill(u, t.key) ?? 3])));
    const driver = people.map(u => u.isDriver === true);
    const needDriver = driver.some(Boolean);
    // Affinités : chacun coche les collègues avec qui il aime travailler (2 = réciproque)
    const pair = Array.from({ length: P }, () => new Float64Array(P));
    people.forEach((u, i) => {
        const a = affinities.get(u.id) || {};
        new Set(a.like || []).forEach(id => { const j = idx.get(id); if (j !== undefined && j !== i) { pair[i][j] += 1; pair[j][i] += 1; } });
    });

    // Habitudes d'équipe : part des journées passées ensemble ces derniers mois (0 à 1)
    const habit = Array.from({ length: P }, () => new Float64Array(P));
    for (const h of input.teamHabits || []) {
        const i = idx.get(h.a), j = idx.get(h.b);
        if (i === undefined || j === undefined || i === j) continue;
        habit[i][j] = habit[j][i] = Math.max(0, Math.min(1, h.share || 0));
    }

    // Historique : continuité + heures déjà faites ce mois-ci
    const known = new Map();
    const monthStart = weekStart.slice(0, 8) + '01';
    const pastHours = new Float64Array(P);
    let pastTotal = 0;
    for (const l of pastLines) {
        if (isLeaveLine(l)) continue;
        const team = (l.teamNames || []).map(n => byName.get(n)).filter(i => i !== undefined);
        if (!team.length) continue;
        if (!known.has(l.chantierId)) known.set(l.chantierId, new Int32Array(P));
        team.forEach(i => known.get(l.chantierId)[i]++);
        if (l.date >= monthStart && l.date < weekStart) {
            const n = Math.max(1, (l.teamNames || []).length);
            const h = lineDuration(l, chantierById.get(l.chantierId), durations, false).hours / n;
            team.forEach(i => { pastHours[i] += h; pastTotal += h; });
        }
    }

    // Historique des pointages : qui a déjà travaillé sur quel chantier (bien plus complet que l'ancien planning)
    for (const h of input.pointageHistory || []) {
        const i = idx.get(h.uid);
        if (i === undefined || !h.chantierId) continue;
        if (!known.has(h.chantierId)) known.set(h.chantierId, new Int32Array(P));
        known.get(h.chantierId)[i] += h.days || 1;
    }

    // Lignes à pourvoir
    const L = [];
    for (const src of lines) {
        const day = days.indexOf(src.date);
        if (day < 0 || isLeaveLine(src)) continue; // les lignes « Congé » du planning ne sont pas des chantiers
        const c = chantierById.get(src.chantierId) || {};
        const dur = lineDuration(src, c, durations, useRealDurations);
        const before = (src.teamNames || []);
        const internal = before.map(n => byName.get(n)).filter(i => i !== undefined);
        // Super admin placé à la main auparavant : retiré (jamais planifié), sa place est recalculée
        before.filter(isSuperName).forEach(n => dataWarnings.push(`${src.date} — ${n} retiré·e de ${src.chantierName} (super admin, jamais planifié) : remplacement proposé.`));
        const foreign = before.filter(n => !byName.has(n) && !isSuperName(n));
        const wanted = Math.max(1, Number(c.teamSize) || DEFAULT_TEAM_SIZE);
        // Personne placée à la main mais en congé ce jour-là : retirée (sa place est recalculée)
        const absent = internal.filter(i => onLeave[i].has(src.date));
        absent.forEach(i => dataWarnings.push(`${src.date} — ${people[i].displayName} retiré·e de ${src.chantierName} (congé) : remplacement proposé.`));
        const locked = keepExisting ? internal.filter(i => !onLeave[i].has(src.date)) : [];
        const slots = Math.min(P, Math.max(locked.length, wanted - foreign.length));
        const start = toMin(src.startTime) ?? toMin(c.fixedAppointment);
        const headcount = Math.max(1, slots + foreign.length);
        const ph = dur.hours / headcount;
        const deadline = toMin(c.timeWindowEnd), earliest = toMin(c.timeWindowStart);
        if (start !== null && earliest !== null && start < earliest) dataWarnings.push(`${src.date} — ${src.chantierName} : prévu à ${src.startTime || c.fixedAppointment}, avant l'ouverture (${c.timeWindowStart}).`);
        if (start !== null && deadline !== null && start + ph * 60 > deadline) dataWarnings.push(`${src.date} — ${src.chantierName} : en commençant à ${src.startTime || c.fixedAppointment}, l'équipe finit après ${c.timeWindowEnd}. Avancer l'heure ou ajouter une personne.`);
        if (wanted - foreign.length > P) dataWarnings.push(`${src.chantierName} demande ${wanted} personnes : il n'y en a que ${P}.`);
        L.push({
            src, day, slots, nLocked: locked.length, foreign, duration: dur.hours, durInfo: dur, ph,
            start, end: start === null ? null : start + ph * 60, coord: c.coordinates || null,
            needs: Object.entries(c.skillNeeds || {}).filter(([, v]) => v > 0), chantierId: src.chantierId,
            original: new Set(internal), team: [...locked],
        });
    }

    const totalWork = L.reduce((s, l) => s + l.ph * l.slots, 0); // heures à répartir dans l'équipe (collègues externes non comptés)
    const totalAvail = avail.reduce((s, a) => s + a, 0);
    const ratio = totalAvail > 0 ? Math.min(1, totalWork / totalAvail) : 0;
    const contractSum = people.reduce((s, u) => s + u.contract, 0);
    const target = people.map((u, i) => {
        const debt = pastTotal > 0 ? pastTotal * u.contract / contractSum - pastHours[i] : 0;
        return Math.max(0, Math.min(avail[i], avail[i] * ratio + debt));
    });

    // Borne inférieure liée aux conducteurs : chaque chantier occupe au moins un conducteur pendant sa durée
    let driverGapLB = 0;
    if (needDriver) {
        const drivers = people.map((_, i) => i).filter(i => driver[i]);
        const driverMin = L.filter(l => l.slots > 0 && !l.foreign.length).reduce((s, l) => s + l.ph, 0);
        const driverShare = drivers.reduce((s, i) => s + target[i], 0);
        if (driverMin > driverShare + 0.5) driverGapLB = (driverMin - driverShare) / drivers.length;
    }

    const warnings = [];
    if (driverGapLB > 0.75) warnings.push(`Pas assez de conducteurs : chaque chantier en demande un, donc les conducteurs feront au moins ${round1(driverGapLB)} h de plus que leur part cette semaine. Solution : un conducteur de plus, ou plus de chantiers à deux.`);
    if (!needDriver && P) warnings.push("Personne n'a coché « Je suis conducteur·rice » : la règle du conducteur est ignorée.");
    if (totalWork > totalAvail + 0.01) warnings.push(`Il y a ${round1(totalWork - totalAvail)} h de travail de plus que les contrats disponibles : certaines personnes dépasseront leur contrat (heures supplémentaires à valider).`);

    return {
        W, days, people, P, idx, byName, onLeave, avail, skill, driver, needDriver, pair, habit, known, target, ratio,
        totalWork, totalAvail, L, linesByDay: days.map((_, d) => L.filter(l => l.day === d)),
        warnings, dataWarnings, keepExisting, driverGapLB,
    };
}

// ---------- 2. Coût ----------
function makeCost(M) {
    const { W, P, L, linesByDay, onLeave, driver, needDriver, pair, habit, skill, known, target, avail, ratio } = M;
    const hours = new Float64Array(P);
    const recomputeHours = () => { hours.fill(0); for (const l of L) for (const i of l.team) hours[i] += l.ph; };

    function hoursCost() {
        let c = 0, worst = 0;
        for (let i = 0; i < P; i++) {
            const diff = hours[i] - target[i];
            c += W.hours * diff * diff;
            if (Math.abs(diff) > worst) worst = Math.abs(diff);
            const over = hours[i] - Math.max(avail[i], target[i]);
            if (over > 0.01 && ratio < 1) c += HARD * over;
        }
        return c + W.fairness * worst * worst;
    }

    function lineCost(l) {
        let c = 0;
        const t = l.team;
        if (t.length < l.slots) c += HARD * (l.slots - t.length);
        if (needDriver && t.length && !t.some(i => driver[i])) c += HARD;
        for (const [key, need] of l.needs) {
            let best = 0;
            for (const i of t) if (skill[i][key] > best) best = skill[i][key];
            c += W.skills * need * (5 - best);
        }
        for (let a = 0; a < t.length; a++) for (let b = a + 1; b < t.length; b++) {
            c -= W.affinity * pair[t[a]][t[b]];
            if (W.habits) c -= W.habits * habit[t[a]][t[b]];
        }
        const k = known.get(l.chantierId);
        if (k) for (const i of t) c -= W.continuity * Math.min(k[i], 3) / 3;
        if (W.changes && l.original.size) for (const i of t) if (!l.original.has(i)) c += W.changes;
        return c;
    }

    function dayCost(d) {
        let c = 0;
        const per = new Map();
        for (const l of linesByDay[d]) {
            c += lineCost(l);
            for (const i of l.team) {
                if (onLeave[i].has(M.days[d])) c += HARD;
                let pp = per.get(i);
                if (!pp) { pp = { h: 0, items: [], mates: new Set() }; per.set(i, pp); }
                pp.h += l.ph;
                pp.items.push(l);
                for (const j of l.team) if (j !== i) pp.mates.add(j);
            }
        }
        for (const pp of per.values()) {
            if (pp.h > MAX_DAY_HOURS + 1e-9) c += HARD * (pp.h - MAX_DAY_HOURS);
            c += W.stability * Math.max(0, pp.mates.size - 2);
            // Ordre de la journée : chantiers à heure fixe d'abord (par heure), puis les autres
            const seq = pp.items.slice().sort((a, b) => (a.start ?? 1e9) - (b.start ?? 1e9));
            for (let s = 1; s < seq.length; s++) {
                const prev = seq[s - 1], cur = seq[s];
                const tr = travelBetween(prev.coord, cur.coord);
                c += W.travel * tr.km;
                if (prev.start !== null && cur.start !== null && cur.start < prev.end + tr.min + BUFFER_MIN - 1e-9) c += HARD;
            }
        }
        return c;
    }
    return { hours, recomputeHours, hoursCost, dayCost };
}

// ---------- 3. Recherche ----------
function solveOnce(M, seed, iterations) {
    const rng = makeRng(seed);
    const { P, L, days } = M;
    L.forEach(l => { l.team = l.team.slice(0, l.nLocked); });
    const C = makeCost(M);

    // a. Glouton
    C.recomputeHours();
    const order = [...L].map(l => [l, rng()]).sort((a, b) => a[0].day - b[0].day || (a[0].start ?? 9999) - (b[0].start ?? 9999) || (b[0].duration - a[0].duration) || a[1] - b[1]).map(x => x[0]);
    for (const l of order) {
        while (l.team.length < l.slots) {
            let best = -1, bestCost = Infinity;
            const shift = (rng() * P) | 0;
            for (let n = 0; n < P; n++) {
                const i = (n + shift) % P;
                if (l.team.includes(i)) continue;
                l.team.push(i); C.hours[i] += l.ph;
                const cost = C.dayCost(l.day) + C.hoursCost();
                l.team.pop(); C.hours[i] -= l.ph;
                if (cost < bestCost - 1e-9) { bestCost = cost; best = i; }
            }
            if (best < 0) break;
            l.team.push(best); C.hours[best] += l.ph;
        }
    }

    const dayCosts = days.map((_, d) => C.dayCost(d));
    let hc = C.hoursCost();
    let current = dayCosts.reduce((s, x) => s + x, 0) + hc;
    const slots = [];
    L.forEach(l => { for (let k = l.nLocked; k < l.team.length; k++) slots.push([l, k]); });
    const slotsByDay = days.map((_, d) => slots.filter(([o]) => o.day === d));
    const snapshot = () => L.map(l => l.team.slice());
    let best = { cost: current, teams: snapshot() };

    // Mouvement aléatoire → renvoie une fonction d'annulation (ou null si impossible) et le jour touché
    function randomMove() {
        const r = rng();
        const [l, k] = slots[(rng() * slots.length) | 0];
        const sameDay = slotsByDay[l.day];
        if (r < 0.5 || sameDay.length < 2) {
            const a = l.team[k], b = (rng() * P) | 0;
            if (l.team.includes(b)) return null;
            l.team[k] = b; C.hours[a] -= l.ph; C.hours[b] += l.ph;
            return { day: l.day, undo: () => { l.team[k] = a; C.hours[a] += l.ph; C.hours[b] -= l.ph; } };
        }
        if (r < 0.85) {
            const [o, ko] = sameDay[(rng() * sameDay.length) | 0];
            if (o === l) return null;
            const a = l.team[k], b = o.team[ko];
            if (a === b || l.team.includes(b) || o.team.includes(a)) return null;
            l.team[k] = b; o.team[ko] = a;
            const dh = o.ph - l.ph; C.hours[a] += dh; C.hours[b] -= dh;
            return { day: l.day, undo: () => { l.team[k] = a; o.team[ko] = b; C.hours[a] -= dh; C.hours[b] += dh; } };
        }
        // Échanger toute la journée de deux personnes
        const a = l.team[k], b = (rng() * P) | 0;
        if (a === b) return null;
        const touched = [];
        for (const [o, ko] of sameDay) {
            const v = o.team[ko];
            if (v !== a && v !== b) continue;
            const other = v === a ? b : a;
            if (o.team.includes(other)) return null; // les deux sur le même chantier : rien à échanger proprement
            touched.push([o, ko, v, other]);
        }
        // Les créneaux verrouillés de a ou b ce jour-là empêchent l'échange
        for (const o of M.linesByDay[l.day]) for (let kk = 0; kk < o.nLocked; kk++) if (o.team[kk] === a || o.team[kk] === b) return null;
        for (const [o, ko, , other] of touched) o.team[ko] = other;
        let dh = 0;
        for (const [o, , v] of touched) dh += v === a ? o.ph : -o.ph;
        C.hours[a] -= dh; C.hours[b] += dh;
        return { day: l.day, undo: () => { for (const [o, ko, v] of touched) o.team[ko] = v; C.hours[a] += dh; C.hours[b] -= dh; } };
    }

    function tryMove(T) {
        const mv = randomMove();
        if (!mv) return 0;
        const nd = C.dayCost(mv.day), nh = C.hoursCost();
        const delta = nd - dayCosts[mv.day] + nh - hc;
        if (delta <= 1e-9 || (T > 0 && rng() < Math.exp(-delta / T))) {
            dayCosts[mv.day] = nd; hc = nh; current += delta;
            if (current < best.cost - 1e-9) best = { cost: current, teams: snapshot() };
            return delta;
        }
        mv.undo();
        return delta;
    }

    // Le premier jet est poli tout de suite : le recuit part d'un optimum local, jamais d'un brouillon
    polish(snapshot());
    best = { cost: current, teams: snapshot() };

    // b. Recuit simulé avec température calibrée sur l'amplitude des mouvements ordinaires
    if (slots.length && iterations > 0) {
        const samples = [];
        for (let s = 0; s < 300; s++) {
            const mv = randomMove();
            if (!mv) continue;
            const delta = C.dayCost(mv.day) - dayCosts[mv.day] + C.hoursCost() - hc;
            mv.undo();
            if (Math.abs(delta) > 0 && Math.abs(delta) < HARD / 10) samples.push(Math.abs(delta));
        }
        samples.sort((a, b) => a - b);
        const T0 = Math.max(1, (samples[Math.floor(samples.length * 0.6)] || 50) * 1.5);
        const T1 = T0 / 1000;
        for (let it = 0; it < iterations; it++) tryMove(T0 * Math.pow(T1 / T0, it / iterations));
    }

    // c. Polissage final à partir du meilleur trouvé
    polish(best.teams);
    best = { cost: current, teams: snapshot() };
    return best;

    // Descente exhaustive : remplacements puis échanges du même jour, jusqu'à ce que plus rien n'améliore
    function polish(teams) {
    L.forEach((l, n) => { l.team = teams[n].slice(); });
    C.recomputeHours();
    days.forEach((_, d) => { dayCosts[d] = C.dayCost(d); });
    hc = C.hoursCost();
    current = dayCosts.reduce((s, x) => s + x, 0) + hc;
    for (let pass = 0; pass < 30; pass++) {
        let improved = false;
        for (const [l, k] of slots) {
            for (let b = 0; b < P; b++) {
                const a = l.team[k];
                if (b === a || l.team.includes(b)) continue;
                l.team[k] = b; C.hours[a] -= l.ph; C.hours[b] += l.ph;
                const nd = C.dayCost(l.day), nh = C.hoursCost();
                const delta = nd - dayCosts[l.day] + nh - hc;
                if (delta < -1e-9) { dayCosts[l.day] = nd; hc = nh; current += delta; improved = true; }
                else { l.team[k] = a; C.hours[a] += l.ph; C.hours[b] -= l.ph; }
            }
        }
        for (const ds of slotsByDay) for (let x = 0; x < ds.length; x++) for (let y = x + 1; y < ds.length; y++) {
            const [l, k] = ds[x], [o, ko] = ds[y];
            if (l === o) continue;
            const a = l.team[k], b = o.team[ko];
            if (a === b || l.team.includes(b) || o.team.includes(a)) continue;
            l.team[k] = b; o.team[ko] = a;
            const dh = o.ph - l.ph; C.hours[a] += dh; C.hours[b] -= dh;
            const nd = C.dayCost(l.day), nh = C.hoursCost();
            const delta = nd - dayCosts[l.day] + nh - hc;
            if (delta < -1e-9) { dayCosts[l.day] = nd; hc = nh; current += delta; improved = true; }
            else { l.team[k] = a; o.team[ko] = b; C.hours[a] -= dh; C.hours[b] += dh; }
        }
        if (!improved) break;
    }
    }
}

/**
 * Résume les pointages en « qui a travaillé où » : [{ uid, chantierId, days }] (jours distincts).
 * Les pointages désignent le chantier par son nom (et ses autres noms côté Petites Fées).
 */
export function summarizePointageHistory(pointages, chantiers) {
    return historyFromVisits(visitsFromPointages(pointages, chantiers));
}

/** [{ uid, chantierId, days }] : nombre de jours où chacun a travaillé sur chaque chantier. */
export function historyFromVisits(visits) {
    const days = new Map(); // "uid|chantierId" → nombre de jours (un passage = un jour)
    for (const v of visits) for (const uid of v.uids) {
        const k = uid + '|' + v.chantierId;
        days.set(k, (days.get(k) || 0) + 1);
    }
    return [...days.entries()].map(([k, n]) => { const [uid, chantierId] = k.split('|'); return { uid, chantierId, days: n }; });
}

/**
 * Habitudes d'équipe : pour chaque paire, part des journées passées ensemble sur un même chantier,
 * rapportée au plus petit nombre de journées travaillées des deux (1 = toujours ensemble).
 * Seules les paires qui ont travaillé au moins 2 jours ensemble comptent.
 * @returns {Array<{a:string, b:string, together:number, share:number}>}
 */
export function teamHabitsFromVisits(visits) {
    const worked = new Map();   // uid → Set(dates)
    const together = new Map(); // "a|b" (a < b) → Set(dates)
    for (const v of visits) {
        const uids = [...v.uids].sort();
        uids.forEach(u => { if (!worked.has(u)) worked.set(u, new Set()); worked.get(u).add(v.date); });
        for (let i = 0; i < uids.length; i++) for (let j = i + 1; j < uids.length; j++) {
            const k = uids[i] + '|' + uids[j];
            if (!together.has(k)) together.set(k, new Set());
            together.get(k).add(v.date);
        }
    }
    const out = [];
    for (const [k, dates] of together) {
        if (dates.size < 2) continue;
        const [a, b] = k.split('|');
        const share = dates.size / Math.min(worked.get(a).size, worked.get(b).size);
        out.push({ a, b, together: dates.size, share: round2(share) });
    }
    return out.sort((x, y) => y.share - x.share || x.a.localeCompare(y.a) || x.b.localeCompare(y.b));
}

/**
 * Planifie la semaine.
 * @param {object} input lines, users, affinities (Map), chantiers, leaves, pastLines, weekStart,
 *   keepExisting, weights, durations (Map de learnDurations), useRealDurations, seed, restarts, iterations
 */
export function planWeek(input) {
    const M = prepare(input);
    if (M.P === 0) return { error: "Aucun membre avec des heures de contrat : renseignez les contrats dans « Fiches de l'équipe »." };
    const seed = Number.isFinite(input.seed) ? input.seed : 1;
    const nSlots = M.L.reduce((s, l) => s + l.slots - l.nLocked, 0);
    const iterations = input.iterations ?? Math.max(20000, Math.min(120000, nSlots * 600));
    const restarts = input.restarts ?? 6;
    const t0 = Date.now();
    let best = null;
    for (let r = 0; r < restarts; r++) {
        const res = solveOnce(M, seed * 1000 + r, iterations);
        if (!best || res.cost < best.cost - 1e-9) best = res;
    }
    M.L.forEach((l, n) => { l.team = best.teams[n]; });
    const out = buildResult(M, input);
    out.cost = round2(best.cost);
    out.seed = seed;
    out.computeMs = Date.now() - t0;
    out.restarts = restarts;
    return out;
}

// ---------- Résultat expliqué ----------
function buildResult(M, input) {
    const { people, L, days, skill, driver, needDriver, pair, habit, known, onLeave, target, avail } = M;
    const name = (i) => people[i].displayName;
    const hours = new Float64Array(M.P);
    L.forEach(l => l.team.forEach(i => { hours[i] += l.ph; }));

    const result = L.map(l => {
        const t = l.team;
        const reasons = [], issues = [];
        const drivers = t.filter(i => driver[i]);
        if (needDriver) drivers.length ? reasons.push(`🚗 ${drivers.map(name).join(', ')}`) : issues.push('Aucun conducteur');
        for (const [key, need] of l.needs) {
            if (need < 2 || !t.length) continue;
            let bi = t[0]; t.forEach(i => { if (skill[i][key] > skill[bi][key]) bi = i; });
            const label = THEMES.find(x => x.key === key)?.label || key;
            const v = skill[bi][key];
            if (v >= 4) reasons.push(`${label} : ${name(bi)} ${v}/5`);
            else if (v <= 2) issues.push(`${label} : personne à l'aise (max ${v}/5)`);
        }
        for (let a = 0; a < t.length; a++) for (let b = a + 1; b < t.length; b++) {
            const s = pair[t[a]][t[b]];
            if (s >= 2) reasons.push(`💚 ${name(t[a])} & ${name(t[b])} (réciproque)`);
            else if (s > 0) reasons.push(`💚 ${name(t[a])} & ${name(t[b])}`);
            else if (habit[t[a]][t[b]] >= 0.5) reasons.push(`🤝 ${name(t[a])} & ${name(t[b])} travaillent souvent ensemble`);
        }
        const k = known.get(l.chantierId);
        const knowers = k ? t.filter(i => k[i] > 0) : [];
        if (knowers.length) reasons.push(`Connaît le chantier : ${knowers.map(name).join(', ')}`);
        if (l.durInfo.source === 'réel' && Math.abs(l.durInfo.hours - (l.durInfo.planned || 0)) >= 0.25) reasons.push(`Durée réelle habituelle ${l.durInfo.hours} h${l.durInfo.planned ? ` (prévu ${l.durInfo.planned} h)` : ''}`);
        t.forEach(i => { if (onLeave[i].has(days[l.day])) issues.push(`${name(i)} est en congé`); });
        if (t.length < l.slots) issues.push(`Équipe incomplète (${t.length}/${l.slots})`);
        const teamNames = [...l.foreign, ...t.map(name)];
        const before = l.src.teamNames || [];
        const changed = teamNames.length !== before.length || teamNames.some(n => !before.includes(n));
        return { line: l.src, teamNames, reasons, issues, changed, personHours: round1(l.ph), duration: l.durInfo };
    });

    const teamsById = Object.fromEntries(result.map(r => [r.line.id, r.teamNames]));
    const validation = validatePlan(input, teamsById);
    const metrics = evaluatePlan(M, validation);

    return {
        result,
        warnings: [...M.warnings, ...M.dataWarnings, ...validation.violations.map(v => v.text)],
        validation,
        metrics,
        ratio: M.ratio, totalWork: round1(M.totalWork), totalAvail: round1(M.totalAvail),
        people: people.map((u, i) => ({
            id: u.id, name: u.displayName, contract: u.contract, avail: round1(avail[i]), target: round1(target[i]),
            hours: round1(hours[i]), isDriver: driver[i], leaveDays: onLeave[i].size,
        })).sort((a, b) => a.name.localeCompare(b.name)),
    };
}

/** Indicateurs de qualité d'un planning (sur le modèle préparé). */
export function evaluatePlan(M, validation) {
    const { L, P, target, driver, needDriver, skill, known, pair } = M;
    const hours = new Float64Array(P);
    L.forEach(l => l.team.forEach(i => { hours[i] += l.ph; }));
    const gaps = Array.from(hours, (h, i) => Math.abs(h - target[i]));
    const withTeam = L.filter(l => l.team.length);
    const essentials = []; // [ligne, thème] avec besoin essentiel (3)
    withTeam.forEach(l => l.needs.forEach(([k, n]) => { if (n >= 3) essentials.push([l, k]); }));
    const covered = essentials.filter(([l, k]) => Math.max(...l.team.map(i => skill[i][k])) >= 4).length;
    const withHistory = withTeam.filter(l => known.has(l.chantierId));
    let mutual = 0, habitual = 0;
    withTeam.forEach(l => { for (let a = 0; a < l.team.length; a++) for (let b = a + 1; b < l.team.length; b++) {
        if (pair[l.team[a]][l.team[b]] >= 2) mutual++;
        if (M.habit[l.team[a]][l.team[b]] >= 0.5) habitual++;
    } });
    let km = 0;
    M.linesByDay.forEach(ls => {
        const per = new Map();
        ls.forEach(l => l.team.forEach(i => { if (!per.has(i)) per.set(i, []); per.get(i).push(l); }));
        per.forEach(items => { items.sort((a, b) => (a.start ?? 1e9) - (b.start ?? 1e9)); for (let s = 1; s < items.length; s++) km += travelBetween(items[s - 1].coord, items[s].coord).km; });
    });
    const changes = L.reduce((s, l) => s + (l.original.size ? l.team.filter(i => !l.original.has(i)).length : 0), 0);
    return {
        hardViolations: validation.violations.length,
        minPossibleGap: round1(M.driverGapLB || 0), // écart d'heures inévitable (manque de conducteurs)
        maxHoursGap: round1(Math.max(0, ...gaps)),
        meanHoursGap: round1(gaps.reduce((s, g) => s + g, 0) / Math.max(1, P)),
        driverCoverage: needDriver ? Math.round(100 * withTeam.filter(l => l.team.some(i => driver[i])).length / Math.max(1, withTeam.length)) : null,
        essentialSkillCoverage: essentials.length ? Math.round(100 * covered / essentials.length) : null,
        continuity: withHistory.length ? Math.round(100 * withHistory.filter(l => l.team.some(i => known.get(l.chantierId)[i] > 0)).length / withHistory.length) : null,
        mutualPairs: mutual,
        habitualPairs: habitual,
        km: Math.round(km),
        changes,
    };
}

/**
 * CONTRÔLE INDÉPENDANT — revérifie les règles strictes à partir des données brutes,
 * sans réutiliser le modèle ni la fonction de coût.
 * @param {object} input mêmes données que planWeek
 * @param {object} teamsById lineId → [noms]
 * @returns {{ok:boolean, violations:Array<{type:string, text:string}>}}
 */
export function validatePlan(input, teamsById) {
    const { lines, users, affinities = new Map(), chantiers = [], leaves = [], weekStart, durations = new Map(), useRealDurations = true } = input;
    const days = weekDays(weekStart);
    const people = plannablePeople(users, weekStart);
    const byName = new Map(people.map(u => [u.displayName, u]));
    const chantierById = new Map(chantiers.map(c => [c.id, c]));
    const anyDriver = people.some(u => u.isDriver === true);
    const violations = [];
    const add = (type, text) => violations.push({ type, text });

    const items = []; // { date, who, start, end, ph, coord, name }
    let totalWork = 0;
    for (const l of lines) {
        if (!days.includes(l.date) || isLeaveLine(l)) continue;
        const team = teamsById[l.id] ?? l.teamNames ?? [];
        const c = chantierById.get(l.chantierId) || {};
        const hrs = lineDuration(l, c, durations, useRealDurations).hours;
        const ph = hrs / Math.max(1, team.length);
        const start = toMin(l.startTime) ?? toMin(c.fixedAppointment);
        totalWork += hrs;
        if (new Set(team).size !== team.length) add('doublon', `${l.date} — ${l.chantierName} : une personne est placée deux fois.`);
        const internal = team.map(n => byName.get(n)).filter(Boolean);
        if (anyDriver && internal.length && !internal.some(u => u.isDriver === true) && team.length === internal.length) add('conducteur', `${l.date} — ${l.chantierName} : aucun conducteur.`);
        for (const u of internal) {
            if (leaves.some(x => x.userId === u.id && x.startDate <= l.date && (x.endDate || x.startDate) >= l.date)) add('conge', `${l.date} — ${u.displayName} est en congé mais placé sur ${l.chantierName}.`);
            items.push({ date: l.date, who: u.displayName, start, end: start === null ? null : start + ph * 60, ph, coord: c.coordinates || null, name: l.chantierName });
        }
    }
    // Journées : heures max et chevauchements (trajet compris)
    const groups = new Map();
    items.forEach(it => { const k = it.date + '|' + it.who; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(it); });
    for (const [k, list] of groups) {
        const [date, who] = k.split('|');
        const h = list.reduce((s, it) => s + it.ph, 0);
        if (h > MAX_DAY_HOURS + 1e-6) add('journee', `${date} — ${who} : ${round1(h)} h dans la journée (max ${MAX_DAY_HOURS} h).`);
        const timed = list.filter(it => it.start !== null).sort((a, b) => a.start - b.start);
        for (let s = 1; s < timed.length; s++) {
            const tr = travelBetween(timed[s - 1].coord, timed[s].coord);
            if (timed[s].start < timed[s - 1].end + tr.min + BUFFER_MIN - 1e-6) add('chevauchement', `${date} — ${who} : ${timed[s - 1].name} puis ${timed[s].name}, pas le temps d'y aller (${Math.round(tr.min)} min de route).`);
        }
    }
    // Contrats : personne au-delà de son contrat disponible tant qu'il reste de la place chez les autres
    const availOf = (u) => u.contract * days.slice(0, 5).filter(d => !leaves.some(x => x.userId === u.id && x.startDate <= d && (x.endDate || x.startDate) >= d)).length / 5;
    const totalAvail = people.reduce((s, u) => s + availOf(u), 0);
    if (totalWork <= totalAvail + 0.01) {
        for (const u of people) {
            const h = items.filter(it => it.who === u.displayName).reduce((s, it) => s + it.ph, 0);
            // tolérance : le dernier chantier ne se coupe pas
            if (h > availOf(u) + 0.75) add('contrat', `${u.displayName} : ${round1(h)} h pour ${round1(availOf(u))} h de contrat disponible.`);
        }
    }
    return { ok: violations.length === 0, violations };
}
