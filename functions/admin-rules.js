// Règles des actions réservées aux admins (testées dans tests/admin-rules.test.mjs)

const MIN_PASSWORD = 6;
const MAX_PASSWORD = 128;

/**
 * Un admin peut-il donner ce mot de passe à ce compte ?
 * Renvoie null si c'est permis, sinon { code, message } (codes d'erreur des fonctions appelables).
 *   caller / target : fiches users/{uid} (ou null si absentes)
 */
function checkSetPassword({ callerUid, caller, uid, target, password }) {
    if (!caller || caller.role !== 'admin' || caller.status === 'banned') {
        return { code: 'permission-denied', message: 'Réservé aux administrateurs.' };
    }
    if (typeof uid !== 'string' || !uid) return { code: 'invalid-argument', message: 'Employé manquant.' };
    if (typeof password !== 'string' || password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) {
        return { code: 'invalid-argument', message: `Le mot de passe doit faire au moins ${MIN_PASSWORD} caractères.` };
    }
    if (!target) return { code: 'not-found', message: 'Employé introuvable.' };
    if (target.role === 'admin' && uid !== callerUid && caller.superAdmin !== true) {
        return { code: 'permission-denied', message: "Seul un super admin peut changer le mot de passe d'un autre administrateur." };
    }
    return null;
}

module.exports = { checkSetPassword, MIN_PASSWORD };
