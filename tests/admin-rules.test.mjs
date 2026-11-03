// Mot de passe choisi par un admin (functions/admin-rules.js) : qui peut changer quoi
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { checkSetPassword } = require('../functions/admin-rules.js');

const patron = { displayName: 'Patron Test', role: 'admin', status: 'approved', superAdmin: true };
const admin = { displayName: 'Admin Test', role: 'admin', status: 'approved' };
const bea = { displayName: 'Bea Test', role: 'user', status: 'approved' };
const ok = (args) => checkSetPassword({ password: 'Chat-4821', ...args });

test('un admin change le mot de passe d\'un employé', () => {
    assert.equal(ok({ callerUid: 'admin', caller: admin, uid: 'bea', target: bea }), null);
});

test('un employé ne peut pas changer de mot de passe', () => {
    assert.equal(ok({ callerUid: 'bea', caller: bea, uid: 'leo', target: { role: 'user' } }).code, 'permission-denied');
});

test('sans connexion ou sans fiche : refusé', () => {
    assert.equal(ok({ callerUid: undefined, caller: null, uid: 'bea', target: bea }).code, 'permission-denied');
});

test('un admin banni ne peut plus rien changer', () => {
    assert.equal(ok({ callerUid: 'x', caller: { ...admin, status: 'banned' }, uid: 'bea', target: bea }).code, 'permission-denied');
});

test('un admin ordinaire ne touche pas au mot de passe d\'un autre admin', () => {
    const r = ok({ callerUid: 'admin', caller: admin, uid: 'patron', target: patron });
    assert.equal(r.code, 'permission-denied');
    assert.match(r.message, /super admin/);
});

test('le super admin peut changer celui d\'un autre admin', () => {
    assert.equal(ok({ callerUid: 'patron', caller: patron, uid: 'admin', target: admin }), null);
});

test('un admin peut changer son propre mot de passe', () => {
    assert.equal(ok({ callerUid: 'admin', caller: admin, uid: 'admin', target: admin }), null);
});

test('mot de passe trop court ou absent : refusé', () => {
    assert.equal(checkSetPassword({ callerUid: 'admin', caller: admin, uid: 'bea', target: bea, password: '12345' }).code, 'invalid-argument');
    assert.equal(checkSetPassword({ callerUid: 'admin', caller: admin, uid: 'bea', target: bea }).code, 'invalid-argument');
});

test('compte inconnu : introuvable', () => {
    assert.equal(ok({ callerUid: 'admin', caller: admin, uid: 'fantome', target: null }).code, 'not-found');
});
