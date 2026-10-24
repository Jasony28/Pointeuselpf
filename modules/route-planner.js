// Moteur de calcul de la tournée d'un employé sur une journée.
// Fonctions pures (aucun accès à Firebase ni au DOM) : testable seul.
//
// Règles, par ordre de priorité :
//   1. RDV (heure de début imposée) respecté, avec arrivée RDV_MARGIN_MIN minutes avant
//   2. Chantier "terminé au plus tard" fini à temps
//   3. Pas d'arrivée avant "arrivée au plus tôt" (on attend sur place)
//   4. Le moins de kilomètres possible
//   5. À égalité : la journée qui finit le plus tôt
// Tous les ordres possibles sont testés (avec élagage) : le résultat est le meilleur, pas une approximation.

export const RDV_MARGIN_MIN = 10;
const EXHAUSTIVE_LIMIT = 10; // au-delà, heuristique (cas rarissime pour une journée)

export const toMinutes = (hhmm) => {
    if (!hhmm) return null;
    const [h, m] = String(hhmm).split(':').map(Number);
    return Number.isFinite(h) ? h * 60 + (m || 0) : null;
};
export const fromMinutes = (mins) => {
    const m = Math.round(mins);
    return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(((m % 60) + 60) % 60).padStart(2, '0')}`;
};

/**
 * Simule un ordre donné et renvoie les étapes + le coût.
 * @param {number[]} order - indices des jobs dans l'ordre de passage
 * @param {Array} jobs - { durationMin, fixedMin, openMin, deadlineMin }
 * @param {{min:number[][], km:number[][]}} matrix - index 0 = dépôt, job i = index i + 1
 * @param {number} departureMin - heure de départ du dépôt (minutes)
 */
export function simulate(order, jobs, matrix, departureMin) {
    let time = departureMin;
    let location = 0;
    let km = 0;
    let lateness = 0;
    const steps = [];

    for (const index of order) {
        const job = jobs[index];
        const node = index + 1;
        const travelMin = matrix.min[location][node];
        const travelKm = matrix.km[location][node];

        // Heure d'arrivée souhaitée : RDV - marge, ou ouverture ; on part le plus tard possible pour l'atteindre
        const target = job.fixedMin !== null ? job.fixedMin - RDV_MARGIN_MIN : job.openMin;
        const earliestArrival = time + travelMin;
        const arrival = target !== null ? Math.max(earliestArrival, target) : earliestArrival;
        const leave = arrival - travelMin;

        let start = arrival;
        if (job.fixedMin !== null) start = Math.max(arrival, job.fixedMin);
        else if (job.openMin !== null) start = Math.max(arrival, job.openMin);
        const end = start + job.durationMin;

        const late = [];
        if (job.fixedMin !== null && start > job.fixedMin) late.push({ type: 'rdv', minutes: start - job.fixedMin });
        if (job.deadlineMin !== null && end > job.deadlineMin) late.push({ type: 'deadline', minutes: end - job.deadlineMin });
        const tightRdv = job.fixedMin !== null && arrival > job.fixedMin - RDV_MARGIN_MIN && start <= job.fixedMin;
        late.forEach(l => { lateness += l.minutes; });

        km += travelKm;
        steps.push({ index, leave, arrival, start, end, travelMin, travelKm, late, tightRdv });
        time = end;
        location = node;
    }
    return { steps, km, lateness, endMin: time };
}

// Comparaison lexicographique : retard total, puis km, puis heure de fin
const isBetter = (a, b) => !b
    || a.lateness < b.lateness - 0.01
    || (Math.abs(a.lateness - b.lateness) <= 0.01 && (a.km < b.km - 0.05
        || (Math.abs(a.km - b.km) <= 0.05 && a.endMin < b.endMin)));

/**
 * Cherche le meilleur ordre de passage.
 * @returns {{ steps, km, lateness, endMin, exhaustive:boolean }}
 */
export function planRoute(jobs, matrix, departureMin) {
    const n = jobs.length;
    if (n === 0) return { steps: [], km: 0, lateness: 0, endMin: departureMin, exhaustive: true };

    if (n > EXHAUSTIVE_LIMIT) {
        // Heuristique : RDV et échéances d'abord, puis le plus proche
        const order = [];
        const left = new Set(jobs.map((_, i) => i));
        let location = 0;
        while (left.size) {
            const next = [...left].sort((a, b) => {
                const ka = jobs[a].fixedMin ?? jobs[a].deadlineMin ?? 1e9;
                const kb = jobs[b].fixedMin ?? jobs[b].deadlineMin ?? 1e9;
                return ka - kb || matrix.km[location][a + 1] - matrix.km[location][b + 1];
            })[0];
            order.push(next);
            left.delete(next);
            location = next + 1;
        }
        return { ...simulate(order, jobs, matrix, departureMin), exhaustive: false };
    }

    let best = null;
    const order = [];
    const used = new Array(n).fill(false);

    // Recherche en profondeur avec élagage sur le coût partiel
    const explore = (time, location, km, lateness) => {
        if (best && (lateness > best.lateness + 0.01 || (Math.abs(lateness - best.lateness) <= 0.01 && km >= best.km + 0.05))) return;
        if (order.length === n) {
            const candidate = simulate(order, jobs, matrix, departureMin);
            if (isBetter(candidate, best)) best = candidate;
            return;
        }
        for (let i = 0; i < n; i++) {
            if (used[i]) continue;
            const job = jobs[i];
            const arrivalRaw = time + matrix.min[location][i + 1];
            const target = job.fixedMin !== null ? job.fixedMin - RDV_MARGIN_MIN : job.openMin;
            const arrival = target !== null ? Math.max(arrivalRaw, target) : arrivalRaw;
            let start = arrival;
            if (job.fixedMin !== null) start = Math.max(arrival, job.fixedMin);
            else if (job.openMin !== null) start = Math.max(arrival, job.openMin);
            const end = start + job.durationMin;
            let late = 0;
            if (job.fixedMin !== null && start > job.fixedMin) late += start - job.fixedMin;
            if (job.deadlineMin !== null && end > job.deadlineMin) late += end - job.deadlineMin;

            used[i] = true;
            order.push(i);
            explore(end, i + 1, km + matrix.km[location][i + 1], lateness + late);
            order.pop();
            used[i] = false;
        }
    };
    explore(departureMin, 0, 0, 0);
    return { ...best, exhaustive: true };
}

/**
 * Heure de départ conseillée : la plus tardive (par pas de 5 min) qui respecte encore tous les horaires.
 * Renvoie null si la journée n'a aucun horaire imposé, ou si même un départ à 05:00 ne suffit pas.
 */
export function latestDeparture(jobs, matrix, fromMin = 5 * 60, toMin = 14 * 60) {
    const constrained = jobs.some(j => j.fixedMin !== null || j.deadlineMin !== null);
    if (!constrained || planRoute(jobs, matrix, fromMin).lateness > 0) return null;
    let low = fromMin, high = toMin;
    while (high - low > 5) {
        const mid = Math.round((low + high) / 2 / 5) * 5;
        if (planRoute(jobs, matrix, mid).lateness > 0) high = mid; else low = mid;
    }
    return low;
}

/** Distance à vol d'oiseau (km), utilisée seulement si Mapbox ne répond pas */
export function haversineKm(a, b) {
    const R = 6371;
    const toRad = (d) => d * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

/** Matrice approximative (route ≈ 1,3 × vol d'oiseau, 55 km/h) */
export function estimateMatrix(points) {
    const km = points.map(a => points.map(b => haversineKm(a, b) * 1.3));
    const min = km.map(row => row.map(d => Math.round(d / 55 * 60)));
    return { km, min, estimated: true };
}
