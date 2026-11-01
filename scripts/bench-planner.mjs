// Banc d'essai de la planification automatique : node scripts/bench-planner.mjs
// Affiche les indicateurs de qualité sur des semaines fictives de tailles différentes.
import { planWeek } from "../modules/auto-planner.js";
import { scenario } from "../tests/fixtures.mjs";

const SETS = [
    { name: 'Petite équipe (5 pers.)', o: { people: 5, linesPerDay: 3 } },
    { name: 'Équipe moyenne (10 pers.)', o: { people: 10, linesPerDay: 6 } },
    { name: 'Grande équipe (20 pers.)', o: { people: 20, linesPerDay: 10 } },
    { name: 'Semaine chargée', o: { people: 6, linesPerDay: 7, leaves: 2 } },
    { name: 'Peu de conducteurs', o: { people: 8, linesPerDay: 5, driverShare: 0.25 } },
    { name: 'Beaucoup d\'horaires fixes', o: { people: 8, linesPerDay: 5, timedShare: 0.8 } },
];
const rows = [];
for (const set of SETS) {
    const runs = [1, 2, 3].map(seed => planWeek({ ...scenario(seed * 17, set.o), seed }));
    const avg = (f) => Math.round(runs.reduce((s, r) => s + (f(r) ?? 0), 0) / runs.length * 10) / 10;
    rows.push({
        'Scénario': set.name, 'Règles enfreintes': avg(r => r.metrics.hardViolations), 'Pire écart h': avg(r => r.metrics.maxHoursGap),
        'Inévitable h': avg(r => r.metrics.minPossibleGap), 'Écart moyen h': avg(r => r.metrics.meanHoursGap), 'Conducteur %': avg(r => r.metrics.driverCoverage),
        'Compétences %': avg(r => r.metrics.essentialSkillCoverage), 'km': avg(r => r.metrics.km), 'Temps ms': avg(r => r.computeMs),
    });
}
console.table(rows);
