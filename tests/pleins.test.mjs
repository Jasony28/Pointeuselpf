// Pleins de carburant (modules/pleins.js) : lecture des nombres, plaque, contrôle de la saisie, totaux
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAmount, normalizePlate, validatePlein, summarize, pricePerLitre, byNewest, DEFAULT_PLATES, NO_PLATE, plateLabel } from '../modules/pleins.js';

const ok = { date: '2026-11-10', plaque: '1-abc-123', litres: '42,5', montant: '78,40', hasPhoto: true };

test('les nombres se lisent avec une virgule ou un point', () => {
    assert.equal(parseAmount('42,5'), 42.5);
    assert.equal(parseAmount(' 78.40 € '), 78.4);
    assert.equal(parseAmount('50 L'), 50);
    assert.ok(Number.isNaN(parseAmount('')));
    assert.ok(Number.isNaN(parseAmount('abc')));
    assert.ok(Number.isNaN(parseAmount('1,2,3')));
    assert.ok(Number.isNaN(parseAmount('-5')));
});

test('la plaque est mise au propre', () => {
    assert.equal(normalizePlate(' 1-abc 123 '), '1-ABC-123');
    assert.equal(normalizePlate('1abc123'), '1ABC123');
    assert.equal(normalizePlate('--'), '');
});

test('un plein complet est accepté et arrondi au centime', () => {
    assert.deepEqual(validatePlein({ ...ok, litres: '42,555' }, '2026-11-14').value,
        { date: '2026-11-10', plaque: '1-ABC-123', litres: 42.56, montant: 78.4 });
});

test('chaque champ manquant ou faux est refusé', () => {
    const refused = (change) => assert.ok(validatePlein({ ...ok, ...change }, '2026-11-14').error, JSON.stringify(change));
    refused({ date: '' });
    refused({ date: '2026-11-15' }); // futur
    refused({ plaque: 'ab' });
    refused({ litres: '0' });
    refused({ litres: '900' });
    refused({ montant: '' });
    refused({ montant: '5000' });
    refused({ hasPhoto: false });
});

test('plaques par défaut et « plaque non disponible »', () => {
    DEFAULT_PLATES.forEach(p => {
        assert.equal(normalizePlate(p.plaque), p.plaque, p.plaque);
        assert.equal(validatePlein({ ...ok, plaque: p.plaque }, '2026-11-14').value.plaque, p.plaque);
    });
    assert.equal(new Set(DEFAULT_PLATES.map(p => p.plaque)).size, DEFAULT_PLATES.length);
    const sansPlaque = validatePlein({ ...ok, plaque: NO_PLATE }, '2026-11-14').value.plaque;
    assert.equal(sansPlaque, NO_PLATE);
    assert.ok(sansPlaque.length >= 4 && sansPlaque.length <= 12); // règles Firestore
    assert.equal(plateLabel(NO_PLATE), 'Plaque non dispo');
    assert.equal(plateLabel('1-ABC-123'), '1-ABC-123');
    refusedPlate('');
});

function refusedPlate(plaque) {
    assert.ok(validatePlein({ ...ok, plaque }, '2026-11-14').error);
}

test('totaux et détail par plaque', () => {
    const s = summarize([
        { plaque: 'A', litres: 40, montant: 70 },
        { plaque: 'B', litres: 50, montant: 95 },
        { plaque: 'A', litres: 30, montant: 55 },
    ]);
    assert.equal(s.count, 3);
    assert.equal(s.litres, 120);
    assert.equal(s.montant, 220);
    assert.deepEqual(s.plates.map(p => [p.plaque, p.count, p.montant]), [['A', 2, 125], ['B', 1, 95]]);
    assert.equal(pricePerLitre(s), 220 / 120);
    assert.equal(pricePerLitre({ litres: 0, montant: 10 }), null);
});

test('les pleins les plus récents viennent en premier', () => {
    const list = [{ date: '2026-11-01', createdMs: 1 }, { date: '2026-11-10', createdMs: 2 }, { date: '2026-11-10', createdMs: 5 }];
    assert.deepEqual(list.sort(byNewest).map(p => p.createdMs), [5, 2, 1]);
});
