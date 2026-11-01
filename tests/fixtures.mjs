// Jeux de données fictifs mais réalistes pour tester et mesurer la planification automatique.
import { makeRng } from "../modules/auto-planner.js";

export const WEEK = '2026-11-02'; // un lundi
export const DAYS = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'];
const NAMES = ['Anna', 'Bea', 'Cleo', 'Dina', 'Emma', 'Fanny', 'Gaelle', 'Hanna', 'Ines', 'Julie', 'Karine', 'Lea', 'Manon', 'Nora', 'Oceane', 'Pauline', 'Quitterie', 'Rose', 'Sarah', 'Tania'];
const CONTRACTS = [38, 30, 24, 19, 15, 38, 30];
const THEMES = ['lits', 'sdb', 'cuisine', 'sols', 'poussiere', 'vitres', 'repassage', 'gros'];
const TYPES = [
    { kind: 'Gîte', teamSize: 2, needs: { lits: 3, sdb: 3, cuisine: 2, sols: 2 }, dur: [3, 6] },
    { kind: 'Bureau', teamSize: 1, needs: { sols: 3, poussiere: 3 }, dur: [1.5, 3] },
    { kind: 'Maison', teamSize: 2, needs: { sdb: 2, cuisine: 2, sols: 2, poussiere: 2 }, dur: [3, 5] },
];

/**
 * @param {number} seed
 * @param {object} o people, linesPerDay, driverShare, leaves, avoids, likes, timedShare
 */
export function scenario(seed, o = {}) {
    const rng = makeRng(seed);
    const pick = (arr) => arr[(rng() * arr.length) | 0];
    const nPeople = o.people ?? 8;
    const users = Array.from({ length: nPeople }, (_, i) => ({
        id: 'u' + i, displayName: NAMES[i % NAMES.length] + (i >= NAMES.length ? ' ' + i : ''),
        status: 'approved', role: 'user',
        contractHistory: [{ startDate: '2025-01-01', hours: CONTRACTS[i % CONTRACTS.length] }],
        isDriver: i < Math.max(1, Math.round(nPeople * (o.driverShare ?? 0.5))),
        skillsSelf: Object.fromEntries(THEMES.map(t => [t, 1 + ((rng() * 5) | 0)])),
    }));
    users.push({ id: 'boss', displayName: 'Patron', status: 'approved', role: 'admin' }); // sans contrat : jamais planifié

    const nChantiers = Math.max(4, Math.round((o.linesPerDay ?? 4) * 2.5));
    const chantiers = Array.from({ length: nChantiers }, (_, i) => {
        const t = TYPES[i % TYPES.length];
        return {
            id: 'c' + i, name: `${t.kind} ${i}`, teamSize: t.teamSize, skillNeeds: t.needs,
            totalHeuresPrevues: Math.round((t.dur[0] + rng() * (t.dur[1] - t.dur[0])) * 2) / 2,
            coordinates: { lat: 50.226 + (rng() - 0.5) * 0.25, lng: 5.344 + (rng() - 0.5) * 0.35 },
        };
    });

    let n = 0;
    const lines = [];
    for (const date of DAYS) {
        const today = [...chantiers].sort(() => rng() - 0.5).slice(0, o.linesPerDay ?? 4);
        today.forEach((c, k) => {
            const timed = rng() < (o.timedShare ?? 0.3);
            lines.push({ id: 'l' + n++, date, chantierId: c.id, chantierName: c.name, startTime: timed ? (k % 2 ? '13:30' : '08:30') : '', duration: c.totalHeuresPrevues, teamNames: [] });
        });
    }

    const leaves = [];
    for (let k = 0; k < (o.leaves ?? 1); k++) { const d = pick(DAYS); leaves.push({ userId: 'u' + ((rng() * nPeople) | 0), startDate: d, endDate: d, status: 'approved' }); }
    const affinities = new Map();
    for (let k = 0; k < (o.likes ?? 3); k++) {
        const a = (rng() * nPeople) | 0, b = (rng() * nPeople) | 0;
        if (a === b) continue;
        const cur = affinities.get('u' + a) || { like: [], avoid: [] };
        if (!cur.like.includes('u' + b) && cur.like.length < 3) cur.like.push('u' + b);
        affinities.set('u' + a, cur);
    }
    for (let k = 0; k < (o.avoids ?? 1); k++) {
        const a = (rng() * nPeople) | 0, b = (rng() * nPeople) | 0;
        if (a === b) continue;
        const cur = affinities.get('u' + a) || { like: [], avoid: [] };
        cur.like = cur.like.filter(x => x !== 'u' + b);
        cur.avoid = ['u' + b];
        affinities.set('u' + a, cur);
    }
    return { lines, users, chantiers, leaves, affinities, pastLines: [], weekStart: WEEK };
}

export const teamsOf = (outcome) => Object.fromEntries(outcome.result.map(r => [r.line.id, r.teamNames]));
