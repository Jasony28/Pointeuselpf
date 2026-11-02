// Règles des notifications (functions/notify-rules.js) : qui reçoit quoi
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const rules = require('../functions/notify-rules.js');

const users = {
    patron: { displayName: 'Patron Test', role: 'admin', status: 'approved' },
    bea: { displayName: 'Bea Test', role: 'user', status: 'approved' },
    leo: { displayName: 'Léo Test', role: 'user', status: 'approved' },
    sam: { displayName: 'Sam Test', role: 'user', status: 'approved', notifPrefs: { messages: false } },
    ina: { displayName: 'Ina Test', role: 'user', status: 'banned' },
};
const group = { type: 'group', name: 'Équipe Marche', participants: ['bea', 'leo', 'sam', 'ina', 'patron'], memberNames: { bea: 'Bea Test', leo: 'Léo Test', sam: 'Sam Test', ina: 'Ina Test', patron: 'Patron Test' }, mutedBy: ['patron'] };
const uids = (list) => list.map(n => n.uid).sort();

test('message à deux : l\'autre personne reçoit « Nom : texte », pas l\'auteur', () => {
    const chat = { type: 'direct', participants: ['bea', 'leo'], memberNames: { bea: 'Bea Test', leo: 'Léo Test' } };
    const out = rules.forMessage({ chatId: 'bea_leo', chat, message: { text: 'Je prends les clés', senderId: 'bea' }, users });
    assert.deepEqual(out, [{ uid: 'leo', title: 'Bea Test', body: 'Je prends les clés', tag: 'bea_leo', page: 'user-chat', chat: 'bea_leo' }]);
});

test('groupe : titre « Groupe · Prénom », sans l\'auteur, ni case décochée, ni compte banni, ni sourdine', () => {
    const out = rules.forMessage({ chatId: 'g1', chat: group, message: { text: 'On commence à 8 h', senderId: 'bea' }, users });
    assert.deepEqual(uids(out), ['leo']);
    assert.equal(out[0].title, 'Équipe Marche · Bea');
});

test('sourdine : notifié quand même si on est @mentionné', () => {
    const out = rules.forMessage({ chatId: 'g1', chat: group, message: { text: '@Patron Test tu valides ?', senderId: 'bea' }, users });
    assert.deepEqual(uids(out), ['leo', 'patron']);
});

test('rien pour un message système ou supprimé', () => {
    assert.deepEqual(rules.forMessage({ chatId: 'g1', chat: group, message: { type: 'system', text: 'Bea a ajouté Léo', senderId: 'bea' }, users }), []);
    assert.deepEqual(rules.forMessage({ chatId: 'g1', chat: group, message: { text: 'oups', deleted: true, senderId: 'bea' }, users }), []);
});

test('aperçu coupé à 80 caractères', () => {
    const text = 'a'.repeat(200);
    const body = rules.forMessage({ chatId: 'x', chat: { participants: ['bea', 'leo'] }, message: { text, senderId: 'bea' }, users })[0].body;
    assert.equal(body.length, 80);
    assert.ok(body.endsWith('…'));
});

test('anciennes discussions : nom de l\'auteur lu dans participantNames', () => {
    const chat = { participants: ['bea', 'leo'], participantNames: ['Bea Ancienne', 'Léo Ancien'] };
    assert.equal(rules.forMessage({ chatId: 'x', chat, message: { text: 'Salut', senderId: 'bea' }, users })[0].title, 'Bea Ancienne');
});

test('planning modifié : seulement les nouveaux changements, résumés', () => {
    const old = { date: '2026-11-03', type: 'ajout', chantier: 'Gîte du Lac', timestamp: 1 };
    const before = { ...users.leo, pendingChanges: [old] };
    const after = { ...users.leo, pendingChanges: [old, { date: '2026-11-04', type: 'ajout', chantier: 'Villa des Roses', timestamp: 2 }, { date: '2026-11-05', type: 'retrait', chantier: 'Gîte du Lac', timestamp: 2 }] };
    const out = rules.forPlanningChange({ uid: 'leo', before, after });
    assert.equal(out.length, 1);
    assert.equal(out[0].tag, 'planning');
    assert.match(out[0].body, /Ajouté à Villa des Roses/);
    assert.match(out[0].body, /Retiré de Gîte du Lac/);
    assert.doesNotMatch(out[0].body, /3 nov/);
});

test('planning : rien si pendingChanges est vidé (changements lus) ou si la case est décochée', () => {
    assert.deepEqual(rules.forPlanningChange({ uid: 'leo', before: { ...users.leo, pendingChanges: [{ date: '2026-11-03', type: 'ajout', chantier: 'X' }] }, after: { ...users.leo, pendingChanges: [] } }), []);
    const off = { ...users.leo, notifPrefs: { planning: false } };
    assert.deepEqual(rules.forPlanningChange({ uid: 'leo', before: off, after: { ...off, pendingChanges: [{ date: '2026-11-03', type: 'ajout', chantier: 'X' }] } }), []);
});

test('planning publié : seulement les personnes planifiées cette semaine', () => {
    const planning = [{ teamNames: ['Bea Test', 'Léo Test'] }, { teamNames: ['Léo Test'] }];
    const out = rules.forPlanningPublished({ weekId: '2026-11-09', planning, users });
    assert.deepEqual(uids(out), ['bea', 'leo']);
    assert.match(out[0].body, /semaine du 9 novembre/);
});

test('congés : nouvelle demande pour l\'admin, réponse pour l\'employé', () => {
    const request = { userId: 'leo', userName: 'Léo Test', startDate: '2026-11-12', endDate: '2026-11-15', status: 'pending' };
    const created = rules.forLeaveCreated({ id: 'r1', request, users });
    assert.deepEqual(uids(created), ['patron']);
    assert.equal(created[0].page, 'admin-leave');
    const decided = rules.forLeaveDecision({ id: 'r1', before: request, after: { ...request, status: 'approved' }, users });
    assert.deepEqual(decided.map(n => [n.uid, n.title]), [['leo', 'Congé accepté ✅']]);
    assert.match(decided[0].body, /du jeu\. 12 nov\. au dim\. 15 nov\./);
    assert.equal(rules.forLeaveDecision({ id: 'r1', before: request, after: { ...request, status: 'refused' }, users })[0].title, 'Congé refusé');
    assert.deepEqual(rules.forLeaveDecision({ id: 'r1', before: request, after: { ...request, reason: 'x' }, users }), []);
});

const at = (hhmm) => new Date(`2026-11-04T${hhmm}:00+01:00`).getTime();
const base = {
    today: '2026-11-04',
    todayPlanning: [{ id: 'p1', date: '2026-11-04', chantierId: 'ch1', chantierName: 'Villa des Roses', startTime: '08:00', duration: 3, teamNames: ['Bea Test', 'Léo Test'] }],
    users,
    sent: new Set(),
};

test('rappel de fin : pointage ouvert 30 min après la durée prévue, pauses déduites', () => {
    const p = { id: 'pt1', uid: 'bea', chantierId: 'ch1', chantier: 'Villa des Roses', timestamp: new Date(at('08:00')).toISOString(), pauses: [] };
    const run = (hhmm, pointage = p) => rules.forReminders({ ...base, nowMs: at(hhmm), nowMinutes: 0, openPointages: [pointage], todayPointageUids: new Set(['bea', 'leo']) });
    assert.deepEqual(run('11:20'), []);
    const out = run('11:31');
    assert.equal(out.length, 1);
    assert.equal(out[0].key, 'end_pt1');
    assert.match(out[0].body, /Villa des Roses.*3 h prévues/);
    const paused = { ...p, pauses: [{ start: new Date(at('10:00')).toISOString(), end: new Date(at('10:30')).toISOString() }] };
    assert.deepEqual(run('11:45', paused), []);
});

test('rappel de fin : une seule fois, et 10 h si rien de prévu', () => {
    const p = { id: 'pt2', uid: 'leo', chantierId: 'autre', chantier: 'Chantier imprévu', timestamp: new Date(at('07:00')).toISOString() };
    const run = (hhmm, sent = new Set()) => rules.forReminders({ ...base, sent, nowMs: at(hhmm), nowMinutes: 0, openPointages: [p], todayPointageUids: new Set(['bea', 'leo']) });
    assert.deepEqual(run('17:00'), []);
    assert.equal(run('17:31').length, 1);
    assert.deepEqual(run('17:31', new Set(['end_pt2'])), []);
});

test('rappel de début : 30 min après l\'heure prévue, seulement sans pointage, pas après 3 h', () => {
    const run = (min, pointed = new Set()) => rules.forReminders({ ...base, nowMs: 0, nowMinutes: min, openPointages: [], todayPointageUids: pointed });
    assert.deepEqual(run(8 * 60 + 20), []);
    assert.deepEqual(uids(run(8 * 60 + 30)), ['bea', 'leo']);
    assert.deepEqual(uids(run(8 * 60 + 30, new Set(['bea']))), ['leo']);
    assert.deepEqual(run(11 * 60 + 1), []);
});

test('rappels : case décochée respectée, lignes de congé ignorées', () => {
    const offUsers = { ...users, bea: { ...users.bea, notifPrefs: { rappels: false } } };
    const conge = { id: 'c1', date: '2026-11-04', chantierName: 'Congé', startTime: '08:00', teamNames: ['Léo Test'] };
    const out = rules.forReminders({ ...base, users: offUsers, todayPlanning: [...base.todayPlanning, conge], nowMs: 0, nowMinutes: 8 * 60 + 45, openPointages: [], todayPointageUids: new Set() });
    assert.deepEqual(out.map(n => n.key), ['start_p1_leo']);
});

test('retour client : l\'employé concerné, même s\'il a coupé les autres notifications ; rien si annulé ou banni', () => {
    const retour = { uid: 'sam', chantier: 'Mme Dupont · Rue des Lilas', date: '2026-10-30', level: 2, cancelled: false };
    const out = rules.forRetourClient({ id: 'rc1', retour, users });
    assert.deepEqual(out, [{ uid: 'sam', title: 'Retour client', body: 'Sur le chantier Mme Dupont (ven. 30 oct.). Touche pour le lire.', tag: 'retour-rc1', page: 'user-retours' }]);
    assert.equal(rules.forRetourClient({ id: 'rc1', retour: { ...retour, level: 3 }, users })[0].title, 'Retour client important');
    assert.deepEqual(rules.forRetourClient({ id: 'rc1', retour: { ...retour, cancelled: true }, users }), []);
    assert.deepEqual(rules.forRetourClient({ id: 'rc1', retour: { ...retour, uid: 'ina' }, users }), []);
});
