// Tests de la planification automatique — lancer avec : npm test
import test from "node:test";
import assert from "node:assert/strict";
import { planWeek, validatePlan, learnDurations } from "../modules/auto-planner.js";
import { scenario, teamsOf, WEEK } from "./fixtures.mjs";

const FAST = { restarts: 3, iterations: 15000 };

test("même graine = même planning (reproductible)", () => {
    const s = scenario(7);
    const a = planWeek({ ...s, ...FAST, seed: 42 });
    const b = planWeek({ ...s, ...FAST, seed: 42 });
    assert.deepEqual(teamsOf(a), teamsOf(b));
    assert.equal(a.cost, b.cost);
});

test("scénarios normaux : 0 règle enfreinte selon le contrôle indépendant, écart d'heures ≤ 1,5 h", () => {
    for (let seed = 1; seed <= 12; seed++) {
        const s = scenario(seed, { people: 8, linesPerDay: 4 });
        const out = planWeek({ ...s, ...FAST, seed });
        assert.equal(out.validation.ok, true, `graine ${seed} : ${out.validation.violations.map(v => v.text).join(' | ')}`);
        const allowed = Math.max(1.5, out.metrics.minPossibleGap + 1);
        assert.ok(out.metrics.maxHoursGap <= allowed, `graine ${seed} : pire écart ${out.metrics.maxHoursGap} h (inévitable : ${out.metrics.minPossibleGap} h)`);
    }
});

test("le contrôle indépendant confirme le résultat (aucune violation cachée)", () => {
    for (let seed = 20; seed < 30; seed++) {
        const s = scenario(seed, { people: 6, linesPerDay: 5, driverShare: 0.34, avoids: 2, timedShare: 0.6 });
        const out = planWeek({ ...s, ...FAST, seed });
        const again = validatePlan(s, teamsOf(out));
        assert.deepEqual(again.violations.map(v => v.text), out.validation.violations.map(v => v.text));
    }
});

test("congés toujours respectés", () => {
    for (let seed = 40; seed < 50; seed++) {
        const s = scenario(seed, { people: 7, linesPerDay: 4, leaves: 4 });
        const out = planWeek({ ...s, ...FAST, seed });
        assert.equal(out.validation.violations.filter(v => v.type === 'conge').length, 0, `graine ${seed}`);
    }
});

test("pas assez de travail : chacun reçoit le même pourcentage de son contrat", () => {
    const s = scenario(3, { people: 8, linesPerDay: 3, leaves: 0 });
    const out = planWeek({ ...s, ...FAST, seed: 3 });
    assert.ok(out.ratio < 1);
    for (const p of out.people) {
        assert.ok(Math.abs(p.target - p.contract * out.ratio) < 0.06, `${p.name} : cible ${p.target}`);
        assert.ok(Math.abs(p.hours - p.target) <= Math.max(1.5, out.metrics.minPossibleGap + 1), `${p.name} : ${p.hours} h pour ${p.target} h`);
    }
});

test("assez de travail : tout le monde est rempli à son contrat sans le dépasser", () => {
    const s = scenario(5, { people: 4, linesPerDay: 6, leaves: 0, driverShare: 1 });
    s.lines.forEach(l => { l.duration = 3.7; l.startTime = ''; }); // 30 × 3,7 h = 111 h = total des contrats
    const out = planWeek({ ...s, ...FAST, seed: 5 });
    assert.equal(out.ratio, 1);
    for (const p of out.people) assert.ok(p.hours >= p.contract - 2 && p.hours <= p.contract + 2.01, `${p.name} : ${p.hours}/${p.contract}`);
});

test("personnes placées à la main conservées", () => {
    const s = scenario(9);
    s.lines[0].teamNames = [s.users[3].displayName];
    s.lines[5].teamNames = [s.users[1].displayName, s.users[2].displayName];
    const out = planWeek({ ...s, ...FAST, seed: 1, keepExisting: true });
    const t = teamsOf(out);
    assert.ok(t[s.lines[0].id].includes(s.users[3].displayName));
    assert.ok(t[s.lines[5].id].includes(s.users[1].displayName) && t[s.lines[5].id].includes(s.users[2].displayName));
});

test("un conducteur dans chaque équipe quand c'est possible", () => {
    for (let seed = 60; seed < 66; seed++) {
        const s = scenario(seed, { people: 10, linesPerDay: 4, driverShare: 0.5 });
        const out = planWeek({ ...s, ...FAST, seed });
        assert.equal(out.metrics.driverCoverage, 100, `graine ${seed}`);
    }
});

test("duo « à éviter » jamais ensemble", () => {
    for (let seed = 70; seed < 76; seed++) {
        const s = scenario(seed, { people: 8, avoids: 3 });
        const out = planWeek({ ...s, ...FAST, seed });
        assert.equal(out.validation.violations.filter(v => v.type === 'eviter').length, 0, `graine ${seed}`);
    }
});

test("trajet pris en compte : pas deux chantiers éloignés trop rapprochés", () => {
    const users = ['A', 'B', 'C'].map((n, i) => ({ id: 'u' + i, displayName: n, status: 'approved', role: 'user', isDriver: true, contractHistory: [{ startDate: '2025-01-01', hours: 38 }] }));
    const chantiers = [
        { id: 'near', name: 'Près', teamSize: 1, coordinates: { lat: 50.22, lng: 5.34 } },
        { id: 'far', name: 'Loin', teamSize: 1, coordinates: { lat: 50.60, lng: 5.90 } }, // ≈ 70 km
    ];
    const lines = [
        { id: 'a', date: WEEK, chantierId: 'near', chantierName: 'Près', startTime: '08:00', duration: 2, teamNames: [] },
        { id: 'b', date: WEEK, chantierId: 'far', chantierName: 'Loin', startTime: '10:30', duration: 2, teamNames: [] },
    ];
    const out = planWeek({ lines, users, chantiers, weekStart: WEEK, ...FAST });
    const t = teamsOf(out);
    assert.notEqual(t.a[0], t.b[0]);
    assert.equal(out.validation.ok, true);
});

test("le contrôle indépendant détecte les erreurs volontaires", () => {
    const s = scenario(11, { people: 6, leaves: 0 });
    const out = planWeek({ ...s, ...FAST, seed: 11 });
    const teams = teamsOf(out);
    const line = s.lines[0];
    s.leaves.push({ userId: s.users.find(u => u.displayName === teams[line.id][0]).id, startDate: line.date, endDate: line.date, status: 'approved' });
    const nonDrivers = s.users.filter(u => !u.isDriver && u.contractHistory).map(u => u.displayName);
    const bad = { ...teams, [s.lines[1].id]: nonDrivers.slice(0, 2) };
    const v = validatePlan(s, bad);
    assert.ok(v.violations.some(x => x.type === 'conge'));
    assert.ok(v.violations.some(x => x.type === 'conducteur'));
});

test("remplacement d'un absent : seules les places libérées changent", () => {
    const s = scenario(13, { people: 8, linesPerDay: 4, leaves: 0 });
    const first = planWeek({ ...s, ...FAST, seed: 1 });
    first.result.forEach(r => { s.lines.find(l => l.id === r.line.id).teamNames = r.teamNames; });
    const absent = s.users[0];
    s.leaves.push({ userId: absent.id, startDate: '2026-11-04', endDate: '2026-11-04', status: 'approved' });
    const affected = first.result.filter(r => r.line.date === '2026-11-04' && r.teamNames.includes(absent.displayName)).length;
    const out = planWeek({ ...s, ...FAST, seed: 2, keepExisting: true });
    assert.equal(out.validation.violations.filter(v => v.type === 'conge').length, 0);
    assert.equal(out.metrics.changes, affected, `${out.metrics.changes} changements pour ${affected} place(s) libérée(s)`);
});

test("« changer le moins possible » : beaucoup moins de changements quand on recalcule tout", () => {
    const s = scenario(14, { people: 8, linesPerDay: 4, leaves: 0 });
    const first = planWeek({ ...s, ...FAST, seed: 1 });
    first.result.forEach(r => { s.lines.find(l => l.id === r.line.id).teamNames = r.teamNames; });
    s.leaves.push({ userId: s.users[1].id, startDate: '2026-11-03', endDate: '2026-11-03', status: 'approved' });
    const free = planWeek({ ...s, ...FAST, seed: 2, keepExisting: false });
    const careful = planWeek({ ...s, ...FAST, seed: 2, keepExisting: false, weights: { changes: 200 } });
    assert.ok(careful.metrics.changes < free.metrics.changes, `${careful.metrics.changes} vs ${free.metrics.changes}`);
});

test("le recuit améliore le premier jet déjà poli", () => {
    let better = 0;
    for (let seed = 80; seed < 86; seed++) {
        const s = scenario(seed, { people: 10, linesPerDay: 6 });
        const greedy = planWeek({ ...s, seed, restarts: 1, iterations: 0 });
        const full = planWeek({ ...s, seed, ...FAST });
        assert.ok(full.cost <= greedy.cost + 1e-6);
        if (full.cost < greedy.cost - 1) better++;
    }
    assert.ok(better >= 3, `${better}/6 améliorés`);
});

test("durées réelles : médiane des pointages, valeurs aberrantes écartées", () => {
    const chantiers = [{ id: 'g', name: 'Gîte des Fées' }];
    const pointages = [];
    const day = (n) => `2026-10-${String(n).padStart(2, '0')}`;
    [3, 3.5, 3.25, 3.5, 3, 12].forEach((h, k) => {
        // deux personnes, chacune la moitié du temps
        const start = new Date(`${day(k + 1)}T08:00:00Z`);
        const end = new Date(start.getTime() + h / 2 * 3600000);
        pointages.push({ chantier: 'gite des fees', timestamp: start.toISOString(), endTime: end.toISOString() });
        pointages.push({ chantier: 'Gîte des Fées', timestamp: start.toISOString(), endTime: end.toISOString() });
    });
    const d = learnDurations(pointages, chantiers);
    assert.equal(d.get('g').samples, 5); // le jour à 12 h est écarté
    assert.equal(d.get('g').hours, 3.25);
});

test("performance : 20 personnes × 40 chantiers en moins de 8 s (Node)", () => {
    const s = scenario(99, { people: 20, linesPerDay: 8 });
    const t = Date.now();
    const out = planWeek({ ...s, seed: 1 });
    const ms = Date.now() - t;
    assert.ok(ms < 8000, `${ms} ms`);
    assert.equal(out.validation.ok, true, out.validation.violations.map(v => v.text).join(' | '));
});

test("robustesse : cas extrêmes sans plantage, résultats toujours cohérents", () => {
    const cases = [];
    for (let seed = 100; seed < 140; seed++) cases.push(scenario(seed, { people: 1 + (seed % 9), linesPerDay: seed % 7, driverShare: (seed % 4) / 3, leaves: seed % 6, avoids: seed % 3, timedShare: (seed % 5) / 4 }));
    const s0 = scenario(1); cases.push({ ...s0, lines: [] });                                            // semaine vide
    const s1 = scenario(2); cases.push({ ...s1, leaves: s1.users.map(u => ({ userId: u.id, startDate: '2026-11-02', endDate: '2026-11-08', status: 'approved' })) }); // tout le monde en congé
    const s2 = scenario(3); s2.lines[0].chantierId = 'supprime'; s2.lines[1].teamNames = ['Ancien employé']; s2.lines[2].date = '2027-01-01'; cases.push(s2);
    const s3 = scenario(4); s3.users.forEach(u => { u.isDriver = false; }); cases.push(s3);            // aucun conducteur
    for (const s of cases) {
        const out = planWeek({ ...s, restarts: 1, iterations: 2000, seed: 1 });
        if (out.error) { assert.match(out.error, /contrat/); continue; }
        for (const r of out.result) assert.equal(new Set(r.teamNames).size, r.teamNames.length);
        assert.deepEqual(validatePlan(s, teamsOf(out)).violations.length, out.validation.violations.length);
        assert.ok(Number.isFinite(out.cost));
    }
});
