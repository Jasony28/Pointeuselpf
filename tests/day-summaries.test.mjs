// Résumés quotidiens (functions/day-summaries.js) : mêmes totaux que les calculs faits sur les pointages
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { normName, learnDurations, summarizePointageHistory, visitsFromPointages, visitsFromDaySummaries, durationsFromVisits, historyFromVisits, teamHabitsFromVisits } from '../modules/auto-planner.js';

const require = createRequire(import.meta.url);
const s = require('../functions/day-summaries.js');

const H = 3600000;
const p = (over = {}) => ({ uid: 'bea', userName: 'Bea Test', chantier: 'Villa des Roses', timestamp: '2026-11-04T07:00:00.000Z', endTime: '2026-11-04T10:00:00.000Z', pauseDurationMs: 0, ...over });

test('contribution : durée moins la pause, jour = date du début ; pointage en cours ignoré', () => {
    const c = s.contribution(p({ pauseDurationMs: 30 * 60000 }));
    assert.deepEqual(c, { day: '2026-11-04', uid: 'bea', name: 'Bea Test', chantier: 'Villa des Roses', ms: 2.5 * H, planMs: 3 * H, routeKey: 'villa des roses', routeMs: 2.5 * H });
    assert.equal(s.contribution(p({ endTime: null })), null);
    assert.equal(s.contribution(null), null);
    assert.equal(s.contribution(p({ chantier: '' })).chantier, s.NO_CHANTIER);
    assert.equal(s.contribution(p({ chantier: '' })).routeKey, '');
    // Comme learnDurations : durée brute comptée seulement entre 0 et 16 h ; « Ma tournée » : seulement si positive
    assert.equal(s.contribution(p({ endTime: '2026-11-05T05:00:00.000Z' })).planMs, 0);
    assert.equal(s.contribution(p({ pauseDurationMs: 4 * H })).routeMs, 0);
});

test('normName identique à celui de la planification', () => {
    for (const name of ['Villa des Roses', 'Gîte « Les Tilleuls »', 'M. Lefèvre / Fin de travaux', 'ÉCOLE  n°3']) assert.equal(s.normName(name), normName(name));
});

test('deltas : création, fin de pointage, déplacement de jour, réattribution, suppression', () => {
    assert.deepEqual(s.deltas(null, p({ endTime: null })), []);
    assert.deepEqual(s.deltas(p({ endTime: null }), p()).map(d => [d.day, d.uid, d.ms, d.count]), [['2026-11-04', 'bea', 3 * H, 1]]);
    assert.deepEqual(s.deltas(p(), p()), []);
    const moved = s.deltas(p(), p({ timestamp: '2026-11-05T07:00:00.000Z', endTime: '2026-11-05T09:00:00.000Z' }));
    assert.deepEqual(moved.map(d => [d.day, d.ms, d.planMs, d.count]), [['2026-11-04', -3 * H, -3 * H, -1], ['2026-11-05', 2 * H, 2 * H, 1]]);
    const reassigned = s.deltas(p(), p({ uid: 'leo', userName: 'Léo Test' }));
    assert.deepEqual(reassigned.map(d => [d.uid, d.name, d.ms]), [['bea', 'Bea Test', -3 * H], ['leo', 'Léo Test', 3 * H]]);
    assert.deepEqual(s.deltas(p(), null).map(d => [d.ms, d.routeMs, d.count]), [[-3 * H, -3 * H, -1]]);
});

// Applique les deltas comme le font les incréments Firestore
function applyAll(list) {
    const days = {}, routes = {};
    const apply = (before, after) => s.deltas(before, after).forEach(d => {
        const day = days[d.day] || (days[d.day] = { date: d.day, users: {}, chantiers: {}, planif: {} });
        const u = day.users[d.uid] || (day.users[d.uid] = { name: d.name, ms: 0 });
        u.ms += d.ms; u.name = d.name;
        day.chantiers[d.chantier] = (day.chantiers[d.chantier] || 0) + d.ms;
        const pl = day.planif[d.chantier] || (day.planif[d.chantier] = { ms: 0, uids: {} });
        pl.ms += d.planMs;
        pl.uids[d.uid] = (pl.uids[d.uid] || 0) + d.count;
        if (d.routeKey) {
            const r = routes[d.routeKey] || (routes[d.routeKey] = { name: d.chantier, jours: {} });
            r.jours[d.day] = (r.jours[d.day] || 0) + d.routeMs;
        }
    });
    list.forEach(x => apply(null, x));
    return { days, routes, apply };
}

test('buildAll : la somme des deltas successifs donne le même résultat que le recalcul complet', () => {
    const list = [p(), p({ uid: 'leo', userName: 'Léo Test', chantier: 'Gîte', endTime: '2026-11-04T08:00:00.000Z' }), p({ timestamp: '2026-11-05T07:00:00.000Z', endTime: '2026-11-05T08:30:00.000Z' }), p({ endTime: null })];
    const { days, routes } = s.buildAll(list);
    assert.deepEqual(Object.keys(days).sort(), ['2026-11-04', '2026-11-05']);
    assert.deepEqual(days['2026-11-04'].users, { bea: { name: 'Bea Test', ms: 3 * H }, leo: { name: 'Léo Test', ms: 1 * H } });
    assert.deepEqual(days['2026-11-04'].chantiers, { 'Villa des Roses': 3 * H, 'Gîte': 1 * H });
    assert.deepEqual(days['2026-11-04'].planif, { 'Villa des Roses': { ms: 3 * H, uids: { bea: 1 } }, 'Gîte': { ms: 1 * H, uids: { leo: 1 } } });
    assert.deepEqual(routes['villa des roses'], { name: 'Villa des Roses', jours: { '2026-11-04': 3 * H, '2026-11-05': 1.5 * H } });

    const incremental = applyAll(list);
    assert.deepEqual(incremental.days, days);
    assert.deepEqual(incremental.routes, routes);
});

test('planif : la planification lit les résumés et obtient exactement les mêmes durées, historique et habitudes', () => {
    const chantiers = [{ id: 'c1', name: 'Villa des Roses' }, { id: 'c2', name: 'Gîte', lpfAliases: ['Gite Durbuy'] }];
    const list = [];
    for (let d = 1; d <= 9; d++) {
        const day = `2026-10-0${d}`;
        // équipe de 3 sur la villa : plus de 16 h cumulées certains jours (cas qui piégeait l'ancien test)
        for (const uid of ['bea', 'leo', 'ana']) list.push(p({ uid, timestamp: `${day}T06:00:00.000Z`, endTime: `${day}T${String(11 + (d % 3)).padStart(2, '0')}:15:00.000Z`, pauseDurationMs: 20 * 60000 }));
        list.push(p({ uid: 'leo', chantier: d % 2 ? 'Gite Durbuy' : 'Gîte', timestamp: `${day}T14:00:00.000Z`, endTime: `${day}T16:30:00.000Z` }));
        if (d % 3 === 0) list.push(p({ uid: 'bea', chantier: 'Gîte', timestamp: `${day}T14:00:00.000Z`, endTime: `${day}T15:00:00.000Z` }));
    }
    list.push(p({ timestamp: '2026-10-08T06:00:00.000Z', endTime: '2026-10-09T06:00:00.000Z' })); // 24 h : écarté des durées
    const fromPointages = visitsFromPointages(list, chantiers);
    const fromDays = visitsFromDaySummaries(Object.values(s.buildAll(list).days), chantiers);
    assert.deepEqual([...durationsFromVisits(fromDays)], [...durationsFromVisits(fromPointages)]);
    assert.deepEqual([...learnDurations(list, chantiers)], [...durationsFromVisits(fromDays)]);
    const sortH = (h) => h.sort((a, b) => (a.uid + a.chantierId).localeCompare(b.uid + b.chantierId));
    assert.deepEqual(sortH(historyFromVisits(fromDays)), sortH(summarizePointageHistory(list, chantiers)));
    assert.deepEqual(teamHabitsFromVisits(fromDays), teamHabitsFromVisits(fromPointages));
    assert.ok(teamHabitsFromVisits(fromDays).length > 0);
});
