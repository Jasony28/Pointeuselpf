// Fiches de contrôle (modules/fiches-controle.js) : rotation, réglage du chantier, validation, état, texte du PDF
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    MODELES, ficheConfig, choisirResponsable, reponsesCompletes, resume, erreurValidation, etat, sortieBloquee,
    jourLocal, ficheId, textePdf, champsTexte, nomFichierPdf, caseRect,
} from '../modules/fiches-controle.js';

const fiche = (extra = {}) => ({ modele: 'A2', horsPrestation: [7, 8], reponses: {}, observations: '', chantierName: 'Résidence Les Tilleuls', date: '2026-11-25', ...extra });
const tout = (valeur, sauf = {}) => Object.fromEntries(Array.from({ length: 15 }, (_, i) => [i + 1, (i + 1) in sauf ? sauf[i + 1] : valeur]));

test('les quatre modèles ont le bon nombre de lignes', () => {
    assert.equal(MODELES.A1.points.length, 15);
    assert.equal(MODELES.A2.points.length, 15);
    assert.equal(MODELES.B1.points.length, 14);
    assert.equal(MODELES.G1.points.length, 15);
});

test('les cases tombent sur celles du PDF (ligne 1 et ligne 15)', () => {
    assert.deepEqual(caseRect(1, 'F'), [405.3, 588.4, 421.3, 604.4]);
    assert.deepEqual(caseRect(15, 'S').map(v => Math.round(v * 10) / 10), [492.8, 182.4, 508.8, 198.4]);
});

test('réglage du chantier : modèle inconnu = pas de fiche, lignes hors prestation nettoyées', () => {
    assert.equal(ficheConfig({}), null);
    assert.equal(ficheConfig({ ficheControle: { modele: 'Z9' } }), null);
    assert.deepEqual(ficheConfig({ ficheControle: { modele: 'B1', zone: ' Plateau ', horsPrestation: [13, '5', 5, 15, 0, 'x'] } }),
        { modele: 'B1', zone: 'Plateau', horsPrestation: [5, 13] });
});

test('rotation : celui qui a rempli la fiche il y a le plus longtemps', () => {
    const derniers = { 'Léa': '2026-11-18', 'Karim': '2026-11-11' };
    assert.equal(choisirResponsable(['Léa', 'Karim'], derniers), 'Karim');
    assert.equal(choisirResponsable(['Léa'], derniers), 'Léa', 'seul sur place : c\'est lui');
    assert.equal(choisirResponsable(['Léa', 'Karim', 'Sophie'], derniers), 'Sophie', 'jamais remplie = passe en premier');
    assert.equal(choisirResponsable(['Sophie', 'Nora'], {}), 'Sophie', 'égalité : le premier arrivé');
    assert.equal(choisirResponsable([], derniers), null);
});

test('les lignes hors prestation sont S.O. d\'office', () => {
    const rep = reponsesCompletes(fiche({ reponses: { 1: 'F', 7: 'F', 9: 'X' } }));
    assert.equal(rep[1], 'F');
    assert.equal(rep[7], 'S');
    assert.equal(rep[8], 'S');
    assert.equal(rep[9], undefined);
});

test('validation : tous les points cochés ; observations facultatives, même pour un « À revoir »', () => {
    assert.match(erreurValidation(fiche({ reponses: tout('F', { 3: null }) })), /point 3/);
    assert.match(erreurValidation(fiche({ reponses: {} })), /13 points/);
    assert.equal(erreurValidation(fiche({ reponses: tout('F', { 9: 'R' }) })), null);
    assert.equal(erreurValidation(fiche({ reponses: tout('F', { 9: 'R' }), observations: 'n°9 : fuite' })), null);
    assert.equal(erreurValidation(fiche({ reponses: tout('F') })), null);
});

test('résumé : comptes et points à revoir', () => {
    const r = resume(fiche({ reponses: tout('F', { 9: 'R', 10: 'S' }) }));
    assert.deepEqual([r.total, r.aCocher, r.coches, r.F, r.R, r.S], [15, 13, 13, 11, 1, 3]);
    assert.deepEqual(r.aRevoir, [9]);
});

test('état et blocage de la sortie', () => {
    assert.equal(etat(null), 'attente');
    assert.equal(etat({ ...fiche(), responsableUid: 'u1', statut: 'a_remplir' }), 'a_remplir');
    assert.equal(etat({ ...fiche(), responsableUid: 'u1', statut: 'en_cours' }), 'en_cours');
    assert.equal(etat({ ...fiche({ reponses: tout('F') }), statut: 'validee' }), 'validee');
    assert.equal(etat({ ...fiche({ reponses: tout('F', { 2: 'R' }) }), statut: 'validee' }), 'a_revoir');
    assert.equal(etat({ ...fiche(), statut: 'validee', envoyeeLe: '2026-11-25T19:01:00Z' }), 'envoyee');
    const f = { ...fiche(), responsableUid: 'u1', statut: 'en_cours' };
    assert.equal(sortieBloquee(f, 'u1'), true);
    assert.equal(sortieBloquee(f, 'u2'), false, 'les collègues ne sont pas bloqués');
    assert.equal(sortieBloquee({ ...f, statut: 'validee' }, 'u1'), false);
    assert.equal(sortieBloquee(null, 'u1'), false, 'fiche introuvable (hors ligne) : on ne bloque pas');
});

test('jour local et identifiant de fiche', () => {
    assert.equal(jourLocal(new Date(2026, 10, 25, 0, 30)), '2026-11-25');
    assert.equal(ficheId('abc', '2026-11-25'), 'abc_2026-11-25');
});

test('texte du PDF : accents gardés, caractères impossibles retirés', () => {
    assert.equal(textePdf('Fenêtre « côté » — 3 €'), 'Fenêtre « côté » — 3 €');
    assert.equal(textePdf('OK 👍 ligne\r\nsuite'), 'OK  ligne\nsuite');
    assert.equal(textePdf('Łódź'), 'Łódź'.replace('Ł', 'L').replace('ź', 'z'));
});

test('champs texte et nom du fichier', () => {
    const f = fiche({ zone: 'Hall', heure: '10:45', responsableNom: 'Léa', personnePrevenue: 'Concierge', aCorrigerAvant: '2026-11-27' });
    assert.deepEqual(champsTexte(f), { site: 'Résidence Les Tilleuls', zone: 'Hall', date: '25/11/2026', heure: '10:45', agent: 'Léa', observations: '', responsable: 'Concierge', echeance: '27/11/2026' });
    assert.equal(nomFichierPdf({ ...f, modele: 'A2' }), 'Fiche_A2_Residence-Les-Tilleuls_2026-11-25.pdf');
});
