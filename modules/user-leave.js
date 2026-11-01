import { collection, query, where, getDocs, addDoc, serverTimestamp, orderBy, doc, deleteDoc, updateDoc, writeBatch, getDoc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, currentUser, pageContent, showInfoModal, showConfirmationModal } from "../app.js";
import { getWeekDateRange } from "./utils.js";
import { escapeHTML } from "./work-profile.js";

let currentWeekOffset = 0;
let leaveRequestsCache = [];
let showPastRequests = false;
const CUSTOM_REASON_MAX_LENGTH = 100;
const MIN_NOTICE_DAYS = 7;

const svg = (paths) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const ICONS = {
    prev: svg('<path d="m15 18-6-6 6-6"/>'),
    next: svg('<path d="m9 18 6-6-6-6"/>'),
    info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>'),
    sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    medical: svg('<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z"/>'),
    family: svg('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>'),
    other: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
    clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    hourglass: svg('<path d="M5 22h14M5 2h14M17 22v-4.2a2 2 0 0 0-.6-1.4L12 12l-4.4 4.4a2 2 0 0 0-.6 1.4V22M7 2v4.2a2 2 0 0 0 .6 1.4L12 12l4.4-4.4a2 2 0 0 0 .6-1.4V2"/>'),
    plane: svg('<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>'),
    x: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
    calendar: svg('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
};

const REASONS = [
    { value: 'Vacances', label: 'Vacances', sub: 'Congé payé', icon: ICONS.sun },
    { value: 'Médical', label: 'Médical', sub: 'Raison médicale', icon: ICONS.medical },
    { value: 'Familial', label: 'Familial', sub: 'Événement familial', icon: ICONS.family },
    { value: 'Autre', label: 'Autre', sub: 'À préciser', icon: ICONS.other },
];

export async function render() {
    showPastRequests = false;
    pageContent.innerHTML = `
        <div class="lv-page">
            <header class="lv-header">
                <h2 class="lv-title">Mes congés</h2>
                <p class="lv-subtitle">Demandez un congé, suivez vos demandes et voyez qui est absent dans l'équipe.</p>
            </header>

            <div id="lv-summary" class="lv-summary">${'<div class="lv-skel"></div>'.repeat(3)}</div>

            <div class="lv-grid">
                <!-- FORMULAIRE DE DEMANDE -->
                <section class="lv-card">
                    <h3 class="lv-card-title">Nouvelle demande</h3>
                    <form id="leaveRequestForm" class="lv-form">
                        <div class="lv-notice">
                            ${ICONS.info}
                            <p>À envoyer <strong>au moins ${MIN_NOTICE_DAYS} jours à l'avance</strong> : au plus tôt le <strong id="lv-min-date"></strong>. Une fois approuvée, la demande s'affiche automatiquement dans le planning.</p>
                        </div>

                        <fieldset class="lv-field">
                            <legend class="lv-label">Motif</legend>
                            <div class="lv-reasons">
                                ${REASONS.map(r => `
                                    <label class="lv-reason">
                                        <input type="radio" name="leave-reason" value="${r.value}" required>
                                        <span class="lv-reason-icon">${r.icon}</span>
                                        <span class="lv-reason-text"><strong>${r.label}</strong><small>${r.sub}</small></span>
                                    </label>`).join('')}
                            </div>
                        </fieldset>

                        <div id="custom-reason-container" class="lv-field hidden">
                            <label for="leave-reason-custom" class="lv-label">Précisez la raison</label>
                            <textarea id="leave-reason-custom" class="input" rows="2" placeholder="Ex. : déménagement, formation…"></textarea>
                            <div class="lv-counter"><span id="char-counter">0</span> / ${CUSTOM_REASON_MAX_LENGTH}</div>
                        </div>

                        <div class="lv-field">
                            <span class="lv-label">Durée</span>
                            <div class="segmented lv-span" role="radiogroup" aria-label="Durée">
                                <label><input type="radio" name="leave-span" value="multi" checked><span>Plusieurs jours</span></label>
                                <label><input type="radio" name="leave-span" value="single" id="single-day-leave"><span>Un seul jour</span></label>
                            </div>
                        </div>

                        <div class="lv-field">
                            <div class="lv-cal-top">
                                <span class="lv-label">Dates</span>
                                <button type="button" id="lv-cal-clear" class="lv-cal-clear" hidden>Effacer</button>
                            </div>
                            <input type="hidden" id="leave-start-date">
                            <input type="hidden" id="leave-end-date">
                            <div id="lv-calendar" class="lv-cal"></div>
                            <p id="lv-cal-hint" class="lv-cal-hint"></p>
                        </div>

                        <label class="lv-check">
                            <input type="checkbox" id="leave-partial">
                            <span>Absence partielle <small>(préciser des heures)</small></span>
                        </label>
                        <div id="leave-times-container" class="lv-dates hidden">
                            <div class="lv-field">
                                <label for="leave-start-time" class="lv-label">De</label>
                                <input type="time" id="leave-start-time" class="input">
                            </div>
                            <div class="lv-field">
                                <label for="leave-end-time" class="lv-label">À</label>
                                <input type="time" id="leave-end-time" class="input">
                            </div>
                        </div>

                        <div id="lv-preview" class="lv-preview" hidden></div>

                        <button type="submit" class="btn btn-primary btn-lg btn-block">Envoyer la demande</button>
                    </form>
                </section>

                <!-- MES DEMANDES -->
                <section class="lv-card">
                    <div class="lv-card-head">
                        <h3 class="lv-card-title">Mes demandes</h3>
                    </div>
                    <div id="lv-mine" class="lv-mine"><div class="lv-skel" style="height: 220px;"></div></div>
                </section>
            </div>

            <!-- PLANNING DES CONGÉS DE L'ÉQUIPE -->
            <section class="lv-card">
                <div class="lv-card-head lv-team-head">
                    <div>
                        <h3 class="lv-card-title">Congés de l'équipe</h3>
                        <p id="lv-week-count" class="lv-card-sub"></p>
                    </div>
                    <div class="lv-week-nav">
                        <button id="lv-today-btn" type="button" class="btn btn-secondary lv-today" hidden>Cette semaine</button>
                        <button id="prevWeekBtn" class="nav-arrow" aria-label="Semaine précédente">${ICONS.prev}</button>
                        <p id="list-title" class="lv-week-title"></p>
                        <button id="nextWeekBtn" class="nav-arrow" aria-label="Semaine suivante">${ICONS.next}</button>
                    </div>
                </div>
                <div id="leave-list-container" class="lv-week"></div>
            </section>
        </div>
    `;
    setTimeout(() => {
        setMinimumLeaveDate();
        setupEventListeners();
        loadAllRequestsAndDisplayList();
    }, 0);
}

// --- LE MOTEUR DES 7 JOURS POUR TOUT LE MONDE (ADMIN INCLUS) ---
function setMinimumLeaveDate() {
    const minDate = new Date();
    // On ajoute 7 jours pleins
    minDate.setDate(minDate.getDate() + MIN_NOTICE_DAYS);
    const minDateString = toKey(minDate);

    // On bloque le calendrier
    document.getElementById('leave-start-date').min = minDateString;
    document.getElementById('leave-end-date').min = minDateString;
    document.getElementById('lv-min-date').textContent = minDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    calendar.min = minDateString;
    calendar.month = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    renderCalendar();
}

// =============================================
// CALENDRIER DE SÉLECTION DES DATES
// =============================================

// Premier appui = début, second appui = fin (en mode « plusieurs jours »)
const calendar = { min: '', month: null, start: '', end: '', pickingEnd: false };

function isSingleDayMode() {
    return document.getElementById('single-day-leave')?.checked;
}

function renderCalendar() {
    const container = document.getElementById('lv-calendar');
    if (!container || !calendar.month) return;
    const year = calendar.month.getFullYear(), month = calendar.month.getMonth();
    const minMonth = parseDay(calendar.min);
    const canGoBack = year > minMonth.getFullYear() || (year === minMonth.getFullYear() && month > minMonth.getMonth());
    const today = toKey(new Date());

    // Jours où j'ai déjà un congé (approuvé ou en attente)
    const myLeaveDays = new Set();
    myRequests().filter(r => r.status !== 'refused').forEach(r => {
        const end = parseDay(r.endDate || r.startDate);
        for (const d = parseDay(r.startDate); d <= end; d.setDate(d.getDate() + 1)) myLeaveDays.add(toKey(d));
    });

    const offset = (new Date(year, month, 1).getDay() + 6) % 7;
    const count = new Date(year, month + 1, 0).getDate();
    const cells = Array.from({ length: offset }, () => '<span></span>');
    for (let day = 1; day <= count; day++) {
        const date = new Date(year, month, day);
        const key = toKey(date);
        const dow = date.getDay();
        const disabled = key < calendar.min;
        const inRange = calendar.start && calendar.end && key > calendar.start && key < calendar.end;
        const classes = [
            'lv-cal-day',
            disabled && 'is-disabled',
            (dow === 0 || dow === 6) && 'is-weekend',
            key === today && 'is-today',
            key === calendar.start && 'is-start',
            key === calendar.end && 'is-end',
            inRange && 'is-in-range',
            myLeaveDays.has(key) && 'has-leave',
        ].filter(Boolean).join(' ');
        const label = date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
        cells.push(`<button type="button" class="${classes}" data-key="${key}" ${disabled ? 'disabled' : ''}
            aria-pressed="${key === calendar.start || key === calendar.end || !!inRange}" aria-label="${label}${myLeaveDays.has(key) ? ' (déjà en congé)' : ''}"><span>${day}</span></button>`);
    }

    container.innerHTML = `
        <div class="lv-cal-head">
            <button type="button" class="lv-cal-nav" data-cal="prev" aria-label="Mois précédent" ${canGoBack ? '' : 'disabled'}>${ICONS.prev}</button>
            <strong class="lv-cal-month">${capitalize(calendar.month.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }))}</strong>
            <button type="button" class="lv-cal-nav" data-cal="next" aria-label="Mois suivant">${ICONS.next}</button>
        </div>
        <div class="lv-cal-grid" role="group" aria-label="Choix des dates">
            ${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(d => `<span class="lv-cal-wd">${d}</span>`).join('')}
            ${cells.join('')}
        </div>
        ${myLeaveDays.size ? '<p class="lv-cal-legend"><i></i>Déjà en congé (approuvé ou en attente)</p>' : ''}
    `;

    const hint = document.getElementById('lv-cal-hint');
    if (isSingleDayMode()) hint.textContent = calendar.start ? '' : 'Touchez le jour d\'absence.';
    else if (!calendar.start) hint.textContent = 'Touchez le premier jour, puis le dernier.';
    else if (calendar.pickingEnd) hint.textContent = 'Touchez maintenant le dernier jour (ou le même pour une seule journée).';
    else hint.textContent = '';
    hint.hidden = !hint.textContent;
    document.getElementById('lv-cal-clear').hidden = !calendar.start;
}

function setCalendarDates(start, end) {
    calendar.start = start;
    calendar.end = end;
    document.getElementById('leave-start-date').value = start;
    document.getElementById('leave-end-date').value = end;
    renderCalendar();
    updatePreview();
}

function onCalendarClick(e) {
    const nav = e.target.closest('[data-cal]');
    if (nav) {
        calendar.month = new Date(calendar.month.getFullYear(), calendar.month.getMonth() + (nav.dataset.cal === 'next' ? 1 : -1), 1);
        renderCalendar();
        return;
    }
    const dayBtn = e.target.closest('.lv-cal-day');
    if (!dayBtn || dayBtn.disabled) return;
    const key = dayBtn.dataset.key;

    if (isSingleDayMode()) {
        calendar.pickingEnd = false;
        setCalendarDates(key, key);
    } else if (!calendar.pickingEnd || key < calendar.start) {
        calendar.pickingEnd = true;
        setCalendarDates(key, key);
    } else {
        calendar.pickingEnd = false;
        setCalendarDates(calendar.start, key);
    }
}

function resetCalendar() {
    calendar.pickingEnd = false;
    setCalendarDates('', '');
}

async function updatePlanningOnLeaveChange(docId, leaveData, newStatus, existingBatch = null) {
    const batch = existingBatch || writeBatch(db);
    const planningRef = collection(db, "planning");

    const q = query(planningRef, where("id_leaveRequest", "==", docId));
    const existingEntries = await getDocs(q);
    existingEntries.forEach(doc => batch.delete(doc.ref));

    if (newStatus === 'approved') {
        const startDate = new Date(leaveData.startDate + 'T12:00:00Z');
        const endDate = new Date((leaveData.endDate || leaveData.startDate) + 'T12:00:00Z');
        const chantierName = `Congé (${leaveData.reason})`;

        for (let d = new Date(startDate); d <= endDate; d.setUTCDate(d.getUTCDate() + 1)) {
            const dateString = d.toISOString().split('T')[0];
            const newPlanningRef = doc(planningRef);
            const planningData = {
                chantierId: "LEAVE_ID",
                chantierName: chantierName,
                teamNames: [leaveData.userName],
                date: dateString,
                startTime: leaveData.startTime || "",
                notes: `Congé approuvé: ${leaveData.reason}`,
                order: 0,
                createdAt: serverTimestamp(),
                id_leaveRequest: docId
            };
            batch.set(newPlanningRef, planningData);
        }
    }

    if (!existingBatch) {
        await batch.commit();
    }
}

function setupEventListeners() {
    document.getElementById('prevWeekBtn').addEventListener('click', () => {
        currentWeekOffset--;
        displayLeaveList();
    });
    document.getElementById('nextWeekBtn').addEventListener('click', () => {
        currentWeekOffset++;
        displayLeaveList();
    });
    document.getElementById('lv-today-btn').addEventListener('click', () => {
        currentWeekOffset = 0;
        displayLeaveList();
    });
    document.getElementById('leaveRequestForm').addEventListener('submit', submitLeaveRequest);

    document.getElementById('lv-calendar').addEventListener('click', onCalendarClick);
    document.getElementById('lv-cal-clear').addEventListener('click', resetCalendar);

    // Passage en « un seul jour » : on garde le premier jour choisi
    const syncSpan = () => {
        calendar.pickingEnd = false;
        if (isSingleDayMode() && calendar.start) setCalendarDates(calendar.start, calendar.start);
        else { renderCalendar(); updatePreview(); }
    };
    document.querySelectorAll('input[name="leave-span"]').forEach(r => r.addEventListener('change', syncSpan));

    const partial = document.getElementById('leave-partial');
    partial.addEventListener('change', () => {
        document.getElementById('leave-times-container').classList.toggle('hidden', !partial.checked);
        if (!partial.checked) {
            document.getElementById('leave-start-time').value = '';
            document.getElementById('leave-end-time').value = '';
        }
        updatePreview();
    });
    ['leave-start-time', 'leave-end-time'].forEach(id => document.getElementById(id).addEventListener('change', updatePreview));

    const customReasonContainer = document.getElementById('custom-reason-container');
    const customReasonInput = document.getElementById('leave-reason-custom');

    document.querySelectorAll('input[name="leave-reason"]').forEach(radio => radio.addEventListener('change', () => {
        if (radio.value === 'Autre') {
            customReasonContainer.classList.remove('hidden');
            customReasonInput.required = true;
            customReasonInput.focus();
        } else {
            customReasonContainer.classList.add('hidden');
            customReasonInput.required = false;
            customReasonInput.value = '';
        }
        updatePreview();
    }));

    const charCounter = document.getElementById('char-counter');
    customReasonInput.addEventListener('input', () => {
        const count = customReasonInput.value.length;
        charCounter.textContent = count;
        charCounter.parentElement.classList.toggle('is-over', count > CUSTOM_REASON_MAX_LENGTH);
    });

    // Bouton Annuler (mes demandes et planning de l'équipe)
    pageContent.querySelector('.lv-page').addEventListener('click', async (e) => {
        if (e.target.closest('#lv-past-toggle')) {
            showPastRequests = !showPastRequests;
            renderMyRequests();
            return;
        }

        const button = e.target.closest('.cancel-leave-btn');
        if (!button) return;

        const docId = button.dataset.id;
        const leaveDocRef = doc(db, "leaveRequests", docId);
        let leaveData;
        try {
            const leaveDocSnap = await getDoc(leaveDocRef);
            if (!leaveDocSnap.exists()) return;
            leaveData = leaveDocSnap.data();
        } catch (error) { return; }

        const confirmed = await showConfirmationModal("Annulation", "Êtes-vous sûr de vouloir annuler cette demande ? (Elle disparaîtra du planning officiel)");
        if (confirmed) {
            try {
                const batch = writeBatch(db);
                batch.delete(leaveDocRef);
                await updatePlanningOnLeaveChange(docId, leaveData, 'deleted', batch);
                await batch.commit();

                showInfoModal("Succès", "Demande annulée avec succès.");
                loadAllRequestsAndDisplayList();
            } catch (error) {
                showInfoModal("Erreur", "Impossible d'annuler la demande.");
            }
        }
    });
}

// Résumé en direct de la demande en cours de saisie
function updatePreview() {
    const preview = document.getElementById('lv-preview');
    if (!preview) return;
    const startDate = document.getElementById('leave-start-date').value;
    const single = document.getElementById('single-day-leave').checked;
    const endDate = single ? startDate : (document.getElementById('leave-end-date').value || startDate);
    if (!startDate) { preview.hidden = true; return; }

    const minDate = document.getElementById('leave-start-date').min;
    const startTime = document.getElementById('leave-start-time').value;
    const endTime = document.getElementById('leave-end-time').value;
    const reason = document.querySelector('input[name="leave-reason"]:checked')?.value;

    let html, cls = '';
    if (startDate < minDate) {
        cls = 'is-error';
        html = `${ICONS.info}<span>Trop tôt : la date de début doit être au plus tôt le ${formatDay(minDate, { weekday: 'long', day: 'numeric', month: 'long' })}.</span>`;
    } else if (endDate < startDate) {
        cls = 'is-error';
        html = `${ICONS.info}<span>La date de fin ne peut pas être avant le début.</span>`;
    } else {
        const workdays = countWeekdays(startDate, endDate);
        const range = startDate === endDate
            ? `Le ${formatDay(startDate, { weekday: 'long', day: 'numeric', month: 'long' })}`
            : `Du ${formatDay(startDate, { weekday: 'short', day: 'numeric', month: 'short' })} au ${formatDay(endDate, { weekday: 'short', day: 'numeric', month: 'short' })}`;
        const hours = startTime && endTime ? ` · de ${startTime} à ${endTime}` : '';
        html = `${ICONS.calendar}<span><strong>${range}</strong>${hours}<small>${workdays} jour${workdays > 1 ? 's' : ''} ouvrable${workdays > 1 ? 's' : ''}${reason ? ` · ${escapeHTML(reason === 'Autre' ? 'Autre motif' : reason)}` : ''}</small></span>`;
    }
    preview.className = `lv-preview ${cls}`;
    preview.innerHTML = html;
    preview.hidden = false;
}

async function loadAllRequestsAndDisplayList() {
    try {
        const q = query(collection(db, "leaveRequests"), orderBy("startDate", "desc"));
        const snapshot = await getDocs(q);
        leaveRequestsCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (!document.getElementById('leave-list-container')) return;
        renderCalendar();
        renderSummary();
        renderMyRequests();
        displayLeaveList();
    } catch (error) { console.error("Erreur de chargement des congés:", error); }
}

function myRequests() {
    return leaveRequestsCache.filter(r => r.userId === currentUser.uid);
}

function renderSummary() {
    const today = toKey(new Date());
    const year = new Date().getFullYear();
    const mine = myRequests();

    // Jours ouvrables approuvés sur l'année en cours (une absence partielle compte pour une demi-journée)
    let approvedDays = 0;
    mine.filter(r => r.status === 'approved').forEach(r => {
        const start = r.startDate > `${year}-01-01` ? r.startDate : `${year}-01-01`;
        const endRaw = r.endDate || r.startDate;
        const end = endRaw < `${year}-12-31` ? endRaw : `${year}-12-31`;
        if (start > end) return;
        approvedDays += countWeekdays(start, end) * (r.startTime && r.endTime ? 0.5 : 1);
    });
    const pending = mine.filter(r => r.status === 'pending').length;

    const next = mine
        .filter(r => r.status !== 'refused' && (r.endDate || r.startDate) >= today)
        .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
    let nextValue = '—', nextSub = 'Aucun congé prévu';
    if (next) {
        const inDays = Math.round((parseDay(next.startDate) - parseDay(today)) / 86400000);
        nextValue = next.startDate <= today ? 'En cours' : formatDay(next.startDate, { day: 'numeric', month: 'short' });
        nextSub = next.startDate <= today
            ? `jusqu'au ${formatDay(next.endDate || next.startDate, { day: 'numeric', month: 'long' })}`
            : `dans ${inDays} jour${inDays > 1 ? 's' : ''}${next.status === 'pending' ? ' · en attente' : ''}`;
    }

    const tile = (icon, label, value, sub, tone = '') => `
        <div class="lv-stat ${tone}">
            <span class="lv-stat-icon">${icon}</span>
            <span class="lv-stat-label">${label}</span>
            <span class="lv-stat-value">${value}</span>
            <span class="lv-stat-sub">${sub}</span>
        </div>`;

    document.getElementById('lv-summary').innerHTML = `
        ${tile(ICONS.sun, `Jours de congé ${year}`, formatDays(approvedDays), 'jours ouvrables approuvés')}
        ${tile(ICONS.hourglass, 'En attente', pending, pending > 1 ? 'demandes à valider' : 'demande à valider', pending ? 'is-warning' : '')}
        ${tile(ICONS.plane, 'Prochain congé', nextValue, nextSub)}
    `;
}

function renderMyRequests() {
    const container = document.getElementById('lv-mine');
    if (!container) return;
    const today = toKey(new Date());
    const mine = myRequests();
    const upcoming = mine.filter(r => (r.endDate || r.startDate) >= today).sort((a, b) => a.startDate.localeCompare(b.startDate));
    const past = mine.filter(r => (r.endDate || r.startDate) < today).sort((a, b) => b.startDate.localeCompare(a.startDate));

    if (!mine.length) {
        container.innerHTML = `<div class="lv-empty">${ICONS.plane}<p>Aucune demande pour le moment.<br>Vos demandes apparaîtront ici avec leur statut.</p></div>`;
        return;
    }

    const item = (r, isPast) => {
        const end = r.endDate || r.startDate;
        const start = parseDay(r.startDate);
        const workdays = countWeekdays(r.startDate, end);
        const range = r.startDate === end
            ? formatDay(r.startDate, { weekday: 'long', day: 'numeric', month: 'long' })
            : `${formatDay(r.startDate, { day: 'numeric', month: 'short' })} → ${formatDay(end, { day: 'numeric', month: 'short', year: start.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined })}`;
        const hours = r.startTime && r.endTime ? ` · ${r.startTime}–${r.endTime}` : '';
        const canCancel = r.status === 'pending' || r.status === 'approved';
        return `
            <li class="lv-req is-${r.status}${isPast ? ' is-past' : ''}">
                <span class="lv-req-date">
                    <small>${start.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '')}</small>
                    <strong>${start.getDate()}</strong>
                </span>
                <div class="lv-req-main">
                    <p class="lv-req-reason">${escapeHTML(r.reason)}</p>
                    <p class="lv-req-range">${range}${hours} · ${workdays} j</p>
                </div>
                ${statusBadge(r.status)}
                ${canCancel ? `<button type="button" class="cancel-leave-btn icon-btn is-danger" data-id="${r.id}" aria-label="${r.status === 'pending' ? 'Annuler ma demande' : 'Annuler ce congé'}" title="${r.status === 'pending' ? 'Annuler ma demande' : 'Annuler ce congé'}">${ICONS.x}</button>` : '<span class="lv-req-spacer"></span>'}
            </li>`;
    };

    container.innerHTML = `
        ${upcoming.length ? `<p class="lv-group-title">À venir</p><ul class="lv-reqs">${upcoming.map(r => item(r, false)).join('')}</ul>` : '<p class="lv-muted">Aucune demande à venir.</p>'}
        ${past.length ? `
            <button type="button" id="lv-past-toggle" class="lv-more">${showPastRequests ? 'Masquer l\'historique' : `Voir l'historique (${past.length})`}</button>
            ${showPastRequests ? `<ul class="lv-reqs">${past.map(r => item(r, true)).join('')}</ul>` : ''}` : ''}
    `;
}

function displayLeaveList() {
    const listContainer = document.getElementById('leave-list-container');
    const listTitle = document.getElementById('list-title');
    if (!listContainer) return;

    const { startOfWeek, endOfWeek } = getWeekDateRange(currentWeekOffset);
    const sameMonth = startOfWeek.getUTCMonth() === endOfWeek.getUTCMonth();
    listTitle.textContent = `${startOfWeek.toLocaleDateString('fr-FR', { timeZone: 'UTC', day: 'numeric', month: sameMonth ? undefined : 'short' })} – ${endOfWeek.toLocaleDateString('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'short' })}`;
    document.getElementById('lv-today-btn').hidden = currentWeekOffset === 0;

    const today = toKey(new Date());
    const people = new Set();
    const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(startOfWeek);
        d.setUTCDate(startOfWeek.getUTCDate() + i);
        const key = d.toISOString().split('T')[0];

        const entries = leaveRequestsCache.filter(req => {
            if (!(req.startDate <= key && key <= (req.endDate || req.startDate))) return false;
            // Les demandes en attente des collègues restent privées
            return !(req.status === 'pending' && req.userId !== currentUser.uid && currentUser.role !== 'admin');
        });
        entries.forEach(e => { if (e.status !== 'refused') people.add(e.userId); });
        return { key, date: d, entries, weekend: i >= 5, today: key === today };
    });

    document.getElementById('lv-week-count').textContent = people.size
        ? `${people.size} personne${people.size > 1 ? 's' : ''} absente${people.size > 1 ? 's' : ''} cette semaine`
        : 'Personne en congé cette semaine';

    listContainer.innerHTML = days.map(day => `
        <div class="lv-day${day.today ? ' is-today' : ''}${day.weekend ? ' is-weekend' : ''}${day.entries.length ? '' : ' is-empty'}">
            <div class="lv-day-head">
                <span class="lv-day-name">${day.date.toLocaleDateString('fr-FR', { timeZone: 'UTC', weekday: 'short' }).replace('.', '')}</span>
                <span class="lv-day-num">${day.date.getUTCDate()}</span>
                ${day.today ? '<span class="lv-day-badge">Aujourd\'hui</span>' : ''}
            </div>
            <div class="lv-day-body">
                ${day.entries.length ? day.entries.map(entryHTML).join('') : '<span class="lv-day-none">—</span>'}
            </div>
        </div>`).join('');
}

function entryHTML(entry) {
    // --- FILTRE DE CONFIDENTIALITÉ ---
    // L'admin ou le propriétaire voit la vraie raison, les autres collègues voient juste "Absent(e)"
    const isMine = entry.userId === currentUser.uid;
    let reasonText = (currentUser.role === 'admin' || isMine) ? escapeHTML(entry.reason) : 'Absent(e)';
    // On ajoute quand même les heures si c'est une absence partielle
    if (entry.startTime && entry.endTime) {
        reasonText += ` · ${entry.startTime}–${entry.endTime}`;
    }

    const canCancel = (entry.status === 'approved' && (isMine || currentUser.role === 'admin')) || (entry.status === 'pending' && isMine);
    return `
        <div class="lv-entry is-${entry.status}${isMine ? ' is-mine' : ''}">
            <span class="lv-avatar" aria-hidden="true">${escapeHTML(initials(entry.userName))}</span>
            <div class="lv-entry-main">
                <span class="lv-entry-name">${escapeHTML(entry.userName)}${isMine ? ' <small>(moi)</small>' : ''}</span>
                <span class="lv-entry-reason">${reasonText}</span>
            </div>
            ${entry.status !== 'approved' ? `<span class="lv-dot is-${entry.status}" title="${entry.status === 'pending' ? 'En attente' : 'Refusé'}"></span>` : ''}
            ${canCancel ? `<button type="button" class="cancel-leave-btn icon-btn is-danger" data-id="${entry.id}" aria-label="Annuler">${ICONS.x}</button>` : ''}
        </div>`;
}

async function submitLeaveRequest(e) {
    e.preventDefault();
    const form = e.target;
    const submitButton = form.querySelector('button[type="submit"]');

    const startDate = document.getElementById('leave-start-date').value;
    const isSingleDay = document.getElementById('single-day-leave').checked;
    const endDate = isSingleDay ? startDate : document.getElementById('leave-end-date').value || startDate;
    let reason = document.querySelector('input[name="leave-reason"]:checked')?.value || '';
    const customReason = document.getElementById('leave-reason-custom').value;
    const startTime = document.getElementById('leave-start-time').value;
    const endTime = document.getElementById('leave-end-time').value;

    if (!startDate) {
        showInfoModal("Attention", "Choisissez vos dates dans le calendrier.");
        return;
    }

    // --- SÉCURITÉ : VÉRIFICATION STRICTE DES 7 JOURS EN JAVASCRIPT ---
    const today = new Date();
    today.setHours(0,0,0,0);
    const limitDate = new Date(today);
    limitDate.setDate(limitDate.getDate() + MIN_NOTICE_DAYS);

    const requestedStart = new Date(startDate + 'T00:00:00');

    if (requestedStart < limitDate) {
        showInfoModal("Opération impossible", "Rappel : Toute demande de congé doit être effectuée au strict minimum 7 jours à l'avance.");
        submitButton.disabled = false;
        submitButton.textContent = "Envoyer la demande";
        return;
    }

    // --- VALIDATIONS ---
    if (!reason) {
        showInfoModal("Attention", "Veuillez choisir un motif.");
        return;
    }
    if (customReason.length > CUSTOM_REASON_MAX_LENGTH) {
        showInfoModal("Erreur", `La raison ne doit pas dépasser ${CUSTOM_REASON_MAX_LENGTH} caractères.`);
        return;
    }
    if (new Date(endDate) < new Date(startDate)) {
        showInfoModal("Attention", "La date de fin ne peut pas être avant le début.");
        return;
    }
    if (reason === 'Autre') {
        if (!customReason.trim()) {
            showInfoModal("Attention", "Veuillez préciser la raison.");
            return;
        }
        reason = customReason.trim();
    }

    submitButton.disabled = true;
    submitButton.textContent = "Vérification...";

    const requestData = {
        userId: currentUser.uid, userName: currentUser.displayName,
        startDate, endDate, reason, status: 'pending',
        requestedAt: serverTimestamp()
    };
    if (startTime && endTime) {
        requestData.startTime = startTime;
        requestData.endTime = endTime;
    }

    // --- CONFIRMATION ---
    const options = { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' };
    let summary = `Motif : ${reason}\n`;
    summary += startDate === endDate
        ? `Le ${new Date(startDate+'T12:00:00Z').toLocaleDateString('fr-FR', options)}`
        : `Du ${new Date(startDate+'T12:00:00Z').toLocaleDateString('fr-FR', options)} au ${new Date(endDate+'T12:00:00Z').toLocaleDateString('fr-FR', options)}`;
    if(startTime && endTime) summary += `\nDe ${startTime} à ${endTime}`;
    summary += `\n${countWeekdays(startDate, endDate)} jour(s) ouvrable(s)`;

    const confirmed = await showConfirmationModal("Récapitulatif", summary);
    if (!confirmed) {
        submitButton.disabled = false; submitButton.textContent = "Envoyer la demande"; return;
    }

    submitButton.textContent = "Envoi en cours...";
    try {
        await addDoc(collection(db, "leaveRequests"), requestData);
        showInfoModal("Succès", "Votre demande a été envoyée au bureau. Vous serez averti(e) de son statut.");
        form.reset();
        resetCalendar();
        document.getElementById('single-day-leave').dispatchEvent(new Event('change'));
        document.getElementById('leave-partial').dispatchEvent(new Event('change'));
        document.getElementById('custom-reason-container').classList.add('hidden');
        document.getElementById('leave-reason-custom').required = false;
        document.getElementById('lv-preview').hidden = true;
        loadAllRequestsAndDisplayList();
    } catch (error) {
        showInfoModal("Erreur", "L'envoi de la demande a échoué.");
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Envoyer la demande";
    }
}

// --- Utilitaires ---

function statusBadge(status) {
    if (status === 'approved') return '<span class="leave-status is-approved">Approuvé</span>';
    if (status === 'refused') return '<span class="leave-status is-refused">Refusé</span>';
    return '<span class="leave-status is-pending">En attente</span>';
}

function parseDay(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
}

function toKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDay(key, options) {
    return parseDay(key).toLocaleDateString('fr-FR', options);
}

// Jours du lundi au vendredi entre deux dates incluses (format YYYY-MM-DD)
function countWeekdays(startKey, endKey) {
    let count = 0;
    const end = parseDay(endKey);
    for (const d = parseDay(startKey); d <= end; d.setDate(d.getDate() + 1)) {
        const dow = d.getDay();
        if (dow !== 0 && dow !== 6) count++;
    }
    return count;
}

function formatDays(days) {
    return Number.isInteger(days) ? String(days) : days.toFixed(1).replace('.', ',');
}

function capitalize(str) {
    return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

function initials(name = '') {
    return String(name).trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
}
