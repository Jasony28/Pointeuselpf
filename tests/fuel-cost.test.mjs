// Coût carburant des trajets (modules/fuel-cost.js) : une voiture par groupe, mise sur une personne qui a le permis
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeFuelCost, priceForDay, NO_DRIVER, FALLBACK_PRICE } from '../modules/fuel-cost.js';

const prices = { semaines: {
    '2026-11-02': { diesel: 2.4, essence: 1.9 },
    '2026-11-09': { diesel: 2.2, essence: 1.8 },
} };
const users = [
    { uid: 'leo', name: 'Léo', isDriver: true },
    { uid: 'ana', name: 'Ana', isDriver: true },
    { uid: 'sam', name: 'Sam', isDriver: false },
];
const trip = (uid, dayKey, from, to, km, isReturn = false) => ({ uid, dayKey, from, to, km, isReturn });

test('prix : moyenne diesel + essence du relevé de la semaine', () => {
    assert.deepEqual(priceForDay(prices, '2026-11-05'), { price: 2.15, week: '2026-11-02', estimated: false });
    assert.equal(priceForDay(prices, '2026-11-10').price, 2.0);
    assert.equal(priceForDay(prices, '2026-12-20').estimated, true); // relevé trop ancien : estimé
    assert.equal(priceForDay(null, '2026-11-10').price, FALLBACK_PRICE);
});

test('3 employés dans la même voiture : 1 seul plein, sur la personne avec le permis (1re par ordre alphabétique)', () => {
    const r = computeFuelCost([
        trip('sam', '2026-11-10', 'Dépôt', 'A', 50),
        trip('leo', '2026-11-10', 'Dépôt', 'A', 50),
        trip('ana', '2026-11-10', 'Dépôt', 'A', 50),
    ], users, prices, 10);
    assert.equal(r.cars.length, 1);
    assert.equal(r.km, 50);
    assert.equal(r.litres, 5);
    assert.equal(r.cost, 10);
    assert.deepEqual([...r.byDriver.keys()], ['ana']);
});

test('aller et retour, deux jours, sans personne avec le permis', () => {
    const r = computeFuelCost([
        trip('sam', '2026-11-03', 'Dépôt', 'A', 20),
        trip('sam', '2026-11-03', 'A', 'Dépôt', 20, true),
        trip('leo', '2026-11-10', 'Dépôt', 'B', 30),
        trip('leo', '2026-11-10', 'Dépôt', 'B', 0), // trajet sans km : ignoré
    ], users, prices, 10);
    assert.equal(r.cars.length, 3);
    assert.equal(r.byDriver.get(NO_DRIVER).cars, 2);
    assert.equal(Math.round(r.byDriver.get(NO_DRIVER).cost * 100), 860); // 4 L × 2,15 €
    assert.equal(Math.round(r.byDriver.get('leo').cost * 100), 600);    // 3 L × 2,00 €
    assert.equal(r.weeks.size, 2);
});
