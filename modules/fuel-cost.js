// Coût carburant des trajets (page « Rapport trajets », réservée à l'admin).
//
// - Chaque employé a ses propres trajets en base, comme s'il conduisait. Pour le carburant, on compte par
//   voiture : les trajets du même jour, avec le même départ et la même arrivée, sont faits ensemble (1 voiture).
// - Le carburant d'une voiture est mis sur une personne de ce groupe qui a le permis (users.isDriver) ; s'il y
//   en a plusieurs, la première par ordre alphabétique. Personne avec le permis : « Sans conducteur connu ».
// - Prix : moyenne approximative diesel + essence de la semaine du trajet (Belgique, à la pompe), relevée
//   chaque semaine dans data/carburant.json par le workflow « Prix carburant ».
// Fichier sans Firebase : testé par tests/fuel-cost.test.mjs.

export const CONSO_L_100KM = 7;           // consommation moyenne approximative d'une voiture / camionnette
export const FALLBACK_PRICE = 2.0;        // €/L si aucun prix n'a pu être lu
export const NO_DRIVER = '__sans_conducteur__';

let pricesPromise = null;

// Prix par semaine { 'AAAA-MM-JJ': { diesel, essence } }, lus une fois par session
export function loadFuelPrices() {
    if (!pricesPromise) {
        pricesPromise = fetch('data/carburant.json', { cache: 'no-cache' })
            .then(r => (r.ok ? r.json() : null))
            .then(d => (d && d.semaines ? d : null))
            .catch(() => null);
        pricesPromise.then(d => { if (!d) pricesPromise = null; }); // réessayer la prochaine fois
    }
    return pricesPromise;
}

// Prix moyen (diesel + essence) / 2 du dernier relevé fait au plus tard le jour du trajet
export function priceForDay(prices, dayKey) {
    const weeks = prices?.semaines ? Object.keys(prices.semaines).sort() : [];
    if (!weeks.length) return { price: FALLBACK_PRICE, week: null, estimated: true };
    let week = null;
    for (const w of weeks) { if (w <= dayKey) week = w; else break; }
    const estimated = !week || daysBetween(week, dayKey) > 14; // relevé trop ancien (ou trajet avant le premier)
    week = week || weeks[0];
    const { diesel, essence } = prices.semaines[week];
    return { price: (diesel + essence) / 2, week, estimated };
}

function daysBetween(a, b) {
    return Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / 86400000);
}

/**
 * trips : [{ uid, dayKey, from, to, isReturn, km }] (un par employé et par trajet)
 * users : [{ uid, name, isDriver }]
 * Renvoie { cars, byDriver: Map(uid|NO_DRIVER → { km, litres, cost, cars }), km, litres, cost, avgPrice, estimated, weeks }
 */
export function computeFuelCost(trips, users, prices, conso = CONSO_L_100KM) {
    const people = new Map(users.map(u => [u.uid, u]));
    const groups = new Map();
    trips.forEach(t => {
        if (!t.km) return;
        const key = `${t.dayKey}|${t.isReturn ? 'R' : 'A'}|${t.from}|${t.to}`;
        if (!groups.has(key)) groups.set(key, { dayKey: t.dayKey, km: 0, uids: new Set() });
        const g = groups.get(key);
        g.km = Math.max(g.km, t.km); // même itinéraire : mêmes km (au cas où, le plus long)
        g.uids.add(t.uid);
    });

    const byDriver = new Map();
    const weeks = new Map();
    let estimated = false;
    const cars = [...groups.values()].map(g => {
        const drivers = [...g.uids].map(id => people.get(id)).filter(u => u && u.isDriver === true)
            .sort((a, b) => String(a.name).localeCompare(String(b.name), 'fr'));
        const driver = drivers[0]?.uid || NO_DRIVER;
        const { price, week, estimated: est } = priceForDay(prices, g.dayKey);
        if (est) estimated = true;
        if (week) weeks.set(week, prices.semaines[week]);
        const litres = g.km * conso / 100;
        const cost = litres * price;
        const d = byDriver.get(driver) || { km: 0, litres: 0, cost: 0, cars: 0 };
        d.km += g.km; d.litres += litres; d.cost += cost; d.cars++;
        byDriver.set(driver, d);
        return { ...g, uids: [...g.uids], driver, price, litres, cost };
    });

    const km = cars.reduce((s, c) => s + c.km, 0);
    const litres = cars.reduce((s, c) => s + c.litres, 0);
    const cost = cars.reduce((s, c) => s + c.cost, 0);
    return { cars, byDriver, km, litres, cost, avgPrice: litres ? cost / litres : null, estimated, weeks, conso };
}

export const euros = (v) => `${(v || 0).toFixed(2).replace('.', ',')} €`;
