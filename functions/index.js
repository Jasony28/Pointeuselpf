// Envoi des notifications (Firebase Cloud Messaging) — réglé pour rester dans le quota gratuit :
// us-central1 (même zone que la base nam5, obligatoire pour les déclencheurs), aucune instance allumée en permanence, 2 copies au plus, 256 Mo, lectures ciblées.
const { onDocumentCreated, onDocumentUpdated, onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions, logger } = require('firebase-functions/v2');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const rules = require('./notify-rules');
const summaries = require('./day-summaries');

setGlobalOptions({ region: 'us-central1', memory: '256MiB', minInstances: 0, maxInstances: 2, timeoutSeconds: 60 });
initializeApp();
const db = getFirestore();

const TIME_ZONE = 'Europe/Paris';
const DEAD_TOKEN_ERRORS = ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token', 'messaging/invalid-argument'];
// Tests sur l'émulateur : rien n'est envoyé, les notifications sont seulement écrites dans le journal
const DRY_RUN = process.env.FUNCTIONS_EMULATOR === 'true';

/** Lit seulement les fiches demandées (une lecture par personne). */
async function getUsers(uids) {
    const unique = [...new Set(uids)].filter(Boolean);
    if (!unique.length) return {};
    const snaps = await db.getAll(...unique.map(uid => db.doc(`users/${uid}`)));
    return Object.fromEntries(snaps.filter(s => s.exists).map(s => [s.id, s.data()]));
}

/** Comptes validés (une dizaine de fiches) : pour les admins et les noms du planning. */
async function getApprovedUsers() {
    const snap = await db.collection('users').where('status', '==', 'approved').get();
    return Object.fromEntries(snap.docs.map(d => [d.id, d.data()]));
}

/** Envoie chaque notification aux appareils de la personne ; les jetons morts sont supprimés. */
async function send(notifications) {
    for (const n of notifications) {
        const tokensSnap = await db.collection(`users/${n.uid}/pushTokens`).get();
        const tokens = tokensSnap.docs.map(d => d.id);
        if (!tokens.length) { logger.info('Aucun appareil abonné', { uid: n.uid, tag: n.tag }); continue; }
        const data = Object.fromEntries(Object.entries({ title: n.title, body: n.body, tag: n.tag, page: n.page, chat: n.chat })
            .filter(([, v]) => v).map(([k, v]) => [k, String(v)]));
        if (DRY_RUN) { logger.info('[test] notification', { uid: n.uid, tokens: tokens.length, ...data }); continue; }
        const res = await getMessaging().sendEachForMulticast({
            tokens,
            data,
            webpush: { headers: { Urgency: 'high', TTL: String(24 * 3600) } },
        });
        const dead = res.responses
            .map((r, i) => (!r.success && DEAD_TOKEN_ERRORS.includes(r.error?.code) ? tokensSnap.docs[i].ref : null))
            .filter(Boolean);
        await Promise.all(dead.map(ref => ref.delete()));
        logger.info('Notification envoyée', { uid: n.uid, tag: n.tag, appareils: tokens.length, reçus: res.successCount });
        if (res.failureCount) logger.warn('Envois échoués', { uid: n.uid, failures: res.failureCount, removed: dead.length, codes: res.responses.filter(r => !r.success).map(r => r.error?.code) });
    }
}

// 1. Nouveau message : la discussion + les fiches des destinataires (pas toute la messagerie)
exports.notifyNewMessage = onDocumentCreated('chats/{chatId}/messages/{messageId}', async (event) => {
    const message = event.data?.data();
    if (!message || message.type === 'system') return;
    const chatSnap = await db.doc(`chats/${event.params.chatId}`).get();
    if (!chatSnap.exists) return;
    const chat = chatSnap.data();
    const users = await getUsers([...(chat.participants || []), message.senderId]);
    const notifications = rules.forMessage({ chatId: event.params.chatId, chat, message, users });
    logger.info('Nouveau message', { chat: event.params.chatId, auteur: message.senderId, membres: (chat.participants || []).length, destinataires: notifications.map(n => n.uid) });
    await send(notifications);
});

// 2. Planning modifié : déclenché par users/{uid}.pendingChanges (aucune lecture en plus)
exports.notifyPlanningChange = onDocumentUpdated('users/{uid}', async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();
    if ((after.pendingChanges || []).length <= (before.pendingChanges || []).length) return;
    await send(rules.forPlanningChange({ uid: event.params.uid, before, after }));
});

// 3. Planning publié : le planning de la semaine (filtré par dates) + les comptes validés
exports.notifyPlanningPublished = onDocumentWritten('publishedSchedules/{weekId}', async (event) => {
    const before = event.data.before.exists ? event.data.before.data() : null;
    const after = event.data.after.exists ? event.data.after.data() : null;
    if (!after?.published || before?.published) return;
    const weekId = event.params.weekId;
    const end = new Date(`${weekId}T12:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 6);
    const planningSnap = await db.collection('planning')
        .where('date', '>=', weekId).where('date', '<=', end.toISOString().slice(0, 10)).get();
    const users = await getApprovedUsers();
    await send(rules.forPlanningPublished({ weekId, planning: planningSnap.docs.map(d => d.data()), users }));
});

// 4. Congés : nouvelle demande (admins) et réponse (employé)
exports.notifyLeaveCreated = onDocumentCreated('leaveRequests/{id}', async (event) => {
    const users = await getApprovedUsers();
    await send(rules.forLeaveCreated({ id: event.params.id, request: event.data?.data(), users }));
});

exports.notifyLeaveDecision = onDocumentUpdated('leaveRequests/{id}', async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();
    if (before.status === after.status) return;
    const users = await getUsers([after.userId]);
    await send(rules.forLeaveDecision({ id: event.params.id, before, after, users }));
});

// 4c. Résumés quotidiens des heures : le tableau de bord lit un document par jour au lieu de tous les pointages.
//     Chaque pointage créé, modifié ou supprimé ajuste le ou les jours concernés (aucune lecture, 1 ou 2 écritures).
exports.updateDaySummaries = onDocumentWritten('pointages/{id}', async (event) => {
    const before = event.data.before.exists ? event.data.before.data() : null;
    const after = event.data.after.exists ? event.data.after.data() : null;
    const changes = summaries.deltas(before, after);
    if (!changes.length) return;
    const batch = db.batch();
    for (const c of changes) {
        // set + merge avec des objets imbriqués : les noms de chantier sont pris tels quels (points, espaces…)
        batch.set(db.doc(`resumesJour/${c.day}`), {
            date: c.day,
            users: { [c.uid]: { name: c.name, ms: FieldValue.increment(c.ms) } },
            chantiers: { [c.chantier]: FieldValue.increment(c.ms) },
        }, { merge: true });
    }
    await batch.commit();
});

// 4d. Recalcul complet des résumés (une seule fois après l'installation, ou pour réparer) : admin seulement.
//     Lit tous les pointages une fois, réécrit chaque jour, puis marque resumesJour/_meta comme prêt.
exports.rebuildDaySummaries = onCall({ timeoutSeconds: 300, memory: '512MiB' }, async (request) => {
    const uid = request.auth?.uid;
    const userSnap = uid ? await db.doc(`users/${uid}`).get() : null;
    if (!userSnap?.exists || userSnap.get('role') !== 'admin') throw new HttpsError('permission-denied', 'Réservé aux administrateurs.');

    const [pointagesSnap, existingSnap] = await Promise.all([db.collection('pointages').get(), db.collection('resumesJour').get()]);
    const days = summaries.buildAll(pointagesSnap.docs.map(d => d.data()));
    const writer = db.bulkWriter();
    existingSnap.docs.filter(d => d.id !== '_meta' && !days[d.id]).forEach(d => writer.delete(d.ref));
    Object.entries(days).forEach(([day, data]) => writer.set(db.doc(`resumesJour/${day}`), data));
    await writer.close();
    await db.doc('resumesJour/_meta').set({ ready: true, builtAt: FieldValue.serverTimestamp(), pointages: pointagesSnap.size, days: Object.keys(days).length });
    logger.info('Résumés quotidiens recalculés', { pointages: pointagesSnap.size, jours: Object.keys(days).length });
    return { days: Object.keys(days).length };
});

// 4b. Retour client : l'employé concerné (une lecture : sa fiche)
exports.notifyRetourClient = onDocumentCreated('retoursClients/{id}', async (event) => {
    const retour = event.data?.data();
    if (!retour) return;
    const users = await getUsers([retour.uid]);
    await send(rules.forRetourClient({ id: event.params.id, retour, users }));
});

function parisNow() {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
        timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date()).map(p => [p.type, p.value]));
    return { today: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

// 5. Rappels de pointage : toutes les 15 min de 6 h à 21 h (heure de Paris).
//    Lectures : pointages ouverts + pointages et planning du jour + comptes validés (quelques dizaines de documents).
exports.pointageReminders = onSchedule({ schedule: 'every 15 minutes from 06:00 to 21:00', timeZone: TIME_ZONE }, async () => {
    const { today, minutes } = parisNow();
    const [openSnap, todayPointagesSnap, planningSnap, users] = await Promise.all([
        db.collection('pointages').where('endTime', '==', null).get(),
        db.collection('pointages').where('timestamp', '>=', new Date(Date.now() - 18 * 3600 * 1000).toISOString()).get(),
        db.collection('planning').where('date', '==', today).get(),
        getApprovedUsers(),
    ]);
    const todayPointageUids = new Set(todayPointagesSnap.docs
        .filter(d => new Date(d.get('timestamp')).toLocaleDateString('en-CA', { timeZone: TIME_ZONE }) === today)
        .map(d => d.get('uid')));
    const openPointages = openSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    openPointages.forEach(p => todayPointageUids.add(p.uid));
    const todayPlanning = planningSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const candidates = rules.forReminders({
        nowMs: Date.now(), today, nowMinutes: minutes, openPointages, todayPlanning, todayPointageUids, users,
        sent: new Set(),
    });
    if (!candidates.length) return;
    // Un seul rappel par cas : la clé est gardée dans pushReminders (lue seulement pour les cas trouvés)
    const refs = candidates.map(c => db.doc(`pushReminders/${c.key}`));
    const already = new Set((await db.getAll(...refs)).filter(s => s.exists).map(s => s.id));
    const toSend = candidates.filter(c => !already.has(c.key));
    if (!toSend.length) return;
    const batch = db.batch();
    toSend.forEach(c => batch.set(db.doc(`pushReminders/${c.key}`), { uid: c.uid, sentAt: FieldValue.serverTimestamp() }));
    await batch.commit();
    await send(toSend);
});
