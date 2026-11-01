// « Qui reçoit quoi » : règles pures, sans Firebase, testées par tests/notify-rules.test.mjs.
// Chaque fonction renvoie une liste de notifications { uid, title, body, tag, page, chat? }.

const DEFAULT_PREFS = { messages: true, planning: true, conges: true, rappels: true };
const PREVIEW_LENGTH = 80;
const REMINDER_MARGIN_MIN = 30;       // « oublié de pointer » 30 min après le temps prévu
const FALLBACK_DURATION_H = 10;       // pointage sans chantier prévu : rappel après 10 h
const START_REMINDER_WINDOW_MIN = 180; // rappel de début : pas plus de 3 h après l'heure prévue

const prefsOf = (user) => ({ ...DEFAULT_PREFS, ...(user?.notifPrefs || {}) });
const wants = (user, type) => !!user && user.status === 'approved' && prefsOf(user)[type];
const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || '';

function preview(text, max = PREVIEW_LENGTH) {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

// « 2026-11-04 » → « mar. 4 nov. »
function shortDate(isoDate) {
    if (!isoDate) return '';
    return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString('fr-FR', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
}

function memberName(chat, uid, users) {
    if (chat?.memberNames?.[uid]) return chat.memberNames[uid];
    const i = (chat?.participants || []).indexOf(uid);
    if (i >= 0 && chat?.participantNames?.[i]) return chat.participantNames[i];
    return users[uid]?.displayName || '';
}

/** Nouveau message : ni l'auteur, ni les messages système ; sourdine respectée sauf @mention. */
function forMessage({ chatId, chat, message, users }) {
    if (!chat || !message || message.type === 'system' || message.deleted || !message.text) return [];
    const senderName = memberName(chat, message.senderId, users) || 'Nouveau message';
    const isGroup = chat.type === 'group';
    const title = isGroup ? `${chat.name || 'Groupe'} · ${firstName(senderName)}` : senderName;
    return (chat.participants || [])
        .filter(uid => uid !== message.senderId)
        .filter(uid => wants(users[uid], 'messages'))
        .filter(uid => {
            if (!(chat.mutedBy || []).includes(uid)) return true;
            const name = memberName(chat, uid, users);
            return !!name && message.text.includes(`@${name}`);
        })
        .map(uid => ({ uid, title, body: preview(message.text), tag: chatId, page: 'user-chat', chat: chatId }));
}

const CHANGE_LABELS = { ajout: 'Ajouté à', retrait: 'Retiré de', suppression: 'Chantier annulé :', deplacement: 'Déplacé :' };
const changeKey = (c) => `${c.date}|${c.type}|${c.chantier}|${c.timestamp || ''}`;

/** Planning modifié : seulement les nouvelles lignes de pendingChanges, résumées en une notification. */
function forPlanningChange({ uid, before, after }) {
    const user = after;
    if (!wants(user, 'planning')) return [];
    const seen = new Set((before?.pendingChanges || []).map(changeKey));
    const added = (after?.pendingChanges || []).filter(c => !seen.has(changeKey(c)));
    if (!added.length) return [];
    const lines = added.slice(0, 3).map(c => `${shortDate(c.date)} : ${CHANGE_LABELS[c.type] || 'Changement :'} ${c.chantier || ''}`.trim());
    if (added.length > 3) lines.push(`et ${added.length - 3} autre${added.length - 3 > 1 ? 's' : ''} changement${added.length - 3 > 1 ? 's' : ''}`);
    return [{ uid, title: 'Planning modifié', body: lines.join('\n'), tag: 'planning', page: 'user-dashboard' }];
}

/** Planning publié : les personnes qui ont au moins un chantier cette semaine-là. */
function forPlanningPublished({ weekId, planning, users }) {
    const names = new Set(planning.flatMap(p => p.teamNames || []));
    const weekLabel = new Date(`${weekId}T12:00:00Z`).toLocaleDateString('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'long' });
    return Object.entries(users)
        .filter(([, u]) => names.has(u.displayName) && wants(u, 'planning'))
        .map(([uid]) => ({ uid, title: 'Planning publié', body: `Ton planning de la semaine du ${weekLabel} est prêt.`, tag: `planning-${weekId}`, page: 'user-dashboard' }));
}

function leavePeriod(req) {
    if (!req.endDate || req.endDate === req.startDate) return `le ${shortDate(req.startDate)}${req.startTime ? ` (${req.startTime}–${req.endTime})` : ''}`;
    return `du ${shortDate(req.startDate)} au ${shortDate(req.endDate)}`;
}

/** Nouvelle demande de congé : les administrateurs. */
function forLeaveCreated({ id, request, users }) {
    if (!request || request.status !== 'pending') return [];
    return Object.entries(users)
        .filter(([uid, u]) => u.role === 'admin' && uid !== request.userId && wants(u, 'conges'))
        .map(([uid]) => ({ uid, title: 'Nouvelle demande de congé', body: `${request.userName || 'Un employé'} : ${leavePeriod(request)}${request.reason ? ` · ${request.reason}` : ''}`, tag: `leave-${id}`, page: 'admin-leave' }));
}

/** Demande acceptée ou refusée : l'employé concerné. */
function forLeaveDecision({ id, before, after, users }) {
    if (!after || before?.status === after.status || !['approved', 'refused'].includes(after.status)) return [];
    if (!wants(users[after.userId], 'conges')) return [];
    const accepted = after.status === 'approved';
    return [{
        uid: after.userId,
        title: accepted ? 'Congé accepté ✅' : 'Congé refusé',
        body: `Ta demande ${leavePeriod(after)} a été ${accepted ? 'acceptée' : 'refusée'}.`,
        tag: `leave-${id}`,
        page: 'user-leave',
    }];
}

const isLeaveLine = (p) => !!p.id_leaveRequest || /cong[ée]/i.test(p.chantierName || '');
const minutesOf = (hhmm) => { const [h, m] = String(hhmm || '').split(':').map(Number); return Number.isFinite(h) ? h * 60 + (m || 0) : null; };

function pausedMs(pointage, nowMs) {
    return (pointage.pauses || []).reduce((acc, p) => acc + ((p.end ? new Date(p.end).getTime() : nowMs) - new Date(p.start).getTime()), 0);
}

/**
 * Rappels de pointage, appelés toutes les 15 min. `sent` = clés déjà envoyées (un seul rappel par cas).
 * - fin : pointage encore ouvert 30 min après la durée prévue au planning (10 h si rien de prévu) ;
 * - début : 30 min après l'heure prévue d'un chantier, toujours aucun pointage aujourd'hui (fenêtre de 3 h).
 */
function forReminders({ nowMs, today, nowMinutes, openPointages, todayPlanning, todayPointageUids, users, sent }) {
    const out = [];
    const uidByName = new Map(Object.entries(users).map(([uid, u]) => [u.displayName, uid]));

    for (const p of openPointages) {
        const key = `end_${p.id}`;
        if (sent.has(key) || !wants(users[p.uid], 'rappels')) continue;
        const name = users[p.uid]?.displayName;
        const planned = todayPlanning.find(l => (l.teamNames || []).includes(name) && (l.chantierId ? l.chantierId === p.chantierId : l.chantierName === p.chantier));
        const durationH = planned?.duration > 0 ? planned.duration : FALLBACK_DURATION_H;
        const workedMs = nowMs - new Date(p.timestamp).getTime() - pausedMs(p, nowMs);
        if (workedMs < (durationH * 60 + REMINDER_MARGIN_MIN) * 60000) continue;
        out.push({ key, uid: p.uid, title: 'As-tu oublié de pointer ?', body: `Ton pointage à ${p.chantier || 'ton chantier'} tourne encore${planned ? ` (${durationH} h prévues)` : ''}. Pense à l'arrêter.`, tag: key, page: 'user-dashboard' });
    }

    for (const line of todayPlanning) {
        if (line.date !== today || isLeaveLine(line)) continue;
        const start = minutesOf(line.startTime);
        if (start === null || nowMinutes < start + REMINDER_MARGIN_MIN || nowMinutes > start + START_REMINDER_WINDOW_MIN) continue;
        for (const name of line.teamNames || []) {
            const uid = uidByName.get(name);
            const key = `start_${line.id}_${uid}`;
            if (!uid || sent.has(key) || todayPointageUids.has(uid) || !wants(users[uid], 'rappels')) continue;
            out.push({ key, uid, title: 'As-tu oublié de pointer ?', body: `${line.chantierName || 'Ton chantier'} était prévu à ${line.startTime}. Pense à démarrer ton pointage.`, tag: key, page: 'user-dashboard' });
        }
    }
    return out;
}

module.exports = { DEFAULT_PREFS, preview, shortDate, forMessage, forPlanningChange, forPlanningPublished, forLeaveCreated, forLeaveDecision, forReminders };
