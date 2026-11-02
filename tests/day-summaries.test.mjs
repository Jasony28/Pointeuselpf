// Résumés quotidiens des heures (functions/day-summaries.js) : mêmes totaux que le calcul sur les pointages
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const s = require('../functions/day-summaries.js');

const H = 3600000;
const p = (over = {}) => ({ uid: 'bea', userName: 'Bea Test', chantier: 'Villa des Roses', timestamp: '2026-11-04T07:00:00.000Z', endTime: '2026-11-04T10:00:00.000Z', pauseDurationMs: 0, ...over });

test('contribution : durée moins la pause, jour = date du début ; pointage en cours ignoré', () => {
    assert.deepEqual(s.contribution(p({ pauseDurationMs: 30 * 60000 })), { day: '2026-11-04', uid: 'bea', name: 'Bea Test', chantier: 'Villa des Roses', ms: 2.5 * H });
    assert.equal(s.contribution(p({ endTime: null })), null);
    assert.equal(s.contribution(null), null);
    assert.equal(s.contribution(p({ chantier: '' })).chantier, s.NO_CHANTIER);
});

test('deltas : création, fin de pointage, déplacement de jour, réattribution, suppression', () => {
    assert.deepEqual(s.deltas(null, p({ endTime: null })), []);
    assert.deepEqual(s.deltas(p({ endTime: null }), p()).map(d => [d.day, d.uid, d.ms]), [['2026-11-04', 'bea', 3 * H]]);
    assert.deepEqual(s.deltas(p(), p()), []);
    const moved = s.deltas(p(), p({ timestamp: '2026-11-05T07:00:00.000Z', endTime: '2026-11-05T09:00:00.000Z' }));
    assert.deepEqual(moved.map(d => [d.day, d.ms]), [['2026-11-04', -3 * H], ['2026-11-05', 2 * H]]);
    const reassigned = s.deltas(p(), p({ uid: 'leo', userName: 'Léo Test' }));
    assert.deepEqual(reassigned.map(d => [d.uid, d.name, d.ms]), [['bea', 'Bea Test', -3 * H], ['leo', 'Léo Test', 3 * H]]);
    assert.deepEqual(s.deltas(p(), null).map(d => d.ms), [-3 * H]);
});

test('buildAll : la somme des deltas successifs donne le même résultat que le recalcul complet', () => {
    const list = [p(), p({ uid: 'leo', userName: 'Léo Test', chantier: 'Gîte', endTime: '2026-11-04T08:00:00.000Z' }), p({ timestamp: '2026-11-05T07:00:00.000Z', endTime: '2026-11-05T08:30:00.000Z' }), p({ endTime: null })];
    const days = s.buildAll(list);
    assert.deepEqual(Object.keys(days).sort(), ['2026-11-04', '2026-11-05']);
    assert.deepEqual(days['2026-11-04'].users, { bea: { name: 'Bea Test', ms: 3 * H }, leo: { name: 'Léo Test', ms: 1 * H } });
    assert.deepEqual(days['2026-11-04'].chantiers, { 'Villa des Roses': 3 * H, 'Gîte': 1 * H });

    const incremental = {};
    const apply = (before, after) => s.deltas(before, after).forEach(d => {
        const day = incremental[d.day] || (incremental[d.day] = { date: d.day, users: {}, chantiers: {} });
        const u = day.users[d.uid] || (day.users[d.uid] = { name: d.name, ms: 0 });
        u.ms += d.ms; u.name = d.name;
        day.chantiers[d.chantier] = (day.chantiers[d.chantier] || 0) + d.ms;
    });
    list.forEach(x => apply(null, x));
    assert.deepEqual(incremental, days);
});
