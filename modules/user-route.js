import { collection, query, where, getDocs, getDoc, doc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent, currentUser } from "../app.js";
import { getActiveChantiers } from "./data-service.js";
import { planRoute, simulate, latestDeparture, toMinutes, fromMinutes, estimateMatrix, RDV_MARGIN_MIN } from "./route-planner.js";

// Ma tournée : l'employé choisit un jour et son heure de départ du dépôt, puis lance le calcul lui-même.
// La tournée calculée est gardée sur le téléphone (par jour) et l'ordre peut être modifié à la main.

const MAPBOX_TOKEN = "pk.eyJ1IjoiamFzb255MjgiLCJhIjoiY21lMDcyYWhzMDIyODJsczl0cmM0aTVjciJ9.V14cJXdBNoq3yAQTDeUg-A";
const DEPOT = { name: 'Dépôt (Marche-en-Famenne)', address: 'Marche-en-Famenne, Belgium' };
const DEFAULT_DEPARTURE = '07:00';
const ESTIMATE_PASSAGES = 10;           // passages pris en compte pour la durée estimée
const ESTIMATE_TTL_MS = 7 * 86400000;   // durée estimée gardée 7 jours

let state = null;        // tournée affichée (voir computeRoute)
let selectedDate = null;

const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const localDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const normalizeName = (name) => String(name || '').trim().toLowerCase();
const formatDuration = (mins) => {
    const m = Math.round(mins);
    return m >= 60 ? `${Math.floor(m / 60)} h ${pad(m % 60)}` : `${m} min`;
};
const dayLabel = (d, opts = { weekday: 'long', day: 'numeric', month: 'long' }) => new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', opts);
const storage = {
    get: (key) => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
    set: (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* stockage indisponible */ } },
    remove: (key) => { try { localStorage.removeItem(key); } catch { /* ignoré */ } },
};
const savedKey = (date) => `route:${currentUser.uid}:${date}`;

function mondayOf(dateStr) {
    const d = new Date(`${dateStr}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toISOString().split('T')[0];
}
function addDays(dateStr, days) {
    const d = new Date(`${dateStr}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().split('T')[0];
}

export async function render() {
    selectedDate = localDateStr(new Date());
    pageContent.innerHTML = `
        <div class="max-w-3xl mx-auto space-y-4">
            <div>
                <h2 class="text-2xl font-bold">Ma tournée</h2>
                <p class="mt-1 text-sm" style="color: var(--color-text-muted);">L'ordre idéal de vos chantiers, avec les heures de départ et les kilomètres.</p>
            </div>

            <div class="p-4 rounded-lg shadow-sm space-y-4" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                <div class="flex items-center justify-between gap-2">
                    <button id="routePrevWeek" class="nav-arrow" aria-label="Semaine précédente"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg></button>
                    <div id="routeDays" class="route-days"></div>
                    <button id="routeNextWeek" class="nav-arrow" aria-label="Semaine suivante"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></button>
                </div>
                <div class="flex items-end gap-3">
                    <div class="field" style="flex: 1;">
                        <label for="routeDeparture" class="field-label">Départ de Marche</label>
                        <input id="routeDeparture" type="time" class="input" value="${storage.get('routeDeparture') || DEFAULT_DEPARTURE}">
                    </div>
                    <button id="computeRouteBtn" class="btn btn-primary btn-lg" style="flex: 1.4;">Calculer ma journée</button>
                </div>
            </div>

            <div id="routeResult"></div>
        </div>
    `;

    document.getElementById('computeRouteBtn').onclick = () => computeRoute();
    document.getElementById('routePrevWeek').onclick = () => selectDate(addDays(mondayOf(selectedDate), -7));
    document.getElementById('routeNextWeek').onclick = () => selectDate(addDays(mondayOf(selectedDate), 7));
    // Changer l'heure de départ recalcule tout de suite à partir des données déjà chargées (sans réseau)
    document.getElementById('routeDeparture').addEventListener('change', (e) => {
        storage.set('routeDeparture', e.target.value);
        if (state && e.target.value) {
            state.departureMin = toMinutes(e.target.value);
            if (!state.custom) state.order = planRoute(state.tasks, state.matrix, state.departureMin).steps.map(s => s.index);
            saveState();
            renderResult();
        }
    });
    selectDate(selectedDate);
}

function selectDate(dateStr) {
    selectedDate = dateStr;
    renderDays();
    state = storage.get(savedKey(dateStr));
    if (state) {
        document.getElementById('routeDeparture').value = fromMinutes(state.departureMin);
        renderResult();
    } else {
        document.getElementById('routeResult').innerHTML = `<p class="hours-empty">Appuyez sur « Calculer ma journée » pour obtenir votre tournée du ${dayLabel(dateStr)}.</p>`;
    }
}

function renderDays() {
    const monday = mondayOf(selectedDate);
    const today = localDateStr(new Date());
    const container = document.getElementById('routeDays');
    container.innerHTML = Array.from({ length: 7 }, (_, i) => {
        const d = addDays(monday, i);
        const saved = !!storage.get(savedKey(d));
        return `<button type="button" class="route-day${d === selectedDate ? ' is-selected' : ''}${d === today ? ' is-today' : ''}" data-day="${d}">
            <span>${dayLabel(d, { weekday: 'short' }).replace('.', '')}</span>
            <strong>${new Date(`${d}T12:00:00`).getDate()}</strong>
            ${saved ? '<i class="route-day-dot" title="Tournée enregistrée"></i>' : ''}
        </button>`;
    }).join('');
    container.querySelectorAll('[data-day]').forEach(btn => btn.onclick = () => selectDate(btn.dataset.day));
}

function saveState() {
    if (state) storage.set(savedKey(state.date), state);
}

// --- Données ---

async function loadMyTasks(dateStr) {
    const monday = mondayOf(dateStr);
    const [published, planningSnap, chantiers] = await Promise.all([
        getDoc(doc(db, "publishedSchedules", monday)),
        getDocs(query(collection(db, "planning"), where("date", ">=", monday), where("date", "<=", addDays(monday, 6)))),
        getActiveChantiers(),
    ]);
    const isPublished = published.exists();
    const me = normalizeName(currentUser.displayName);
    // Planning publié + chantiers ajoutés par l'employé lui-même
    const myWeek = planningSnap.docs.map(d => d.data())
        .filter(task => (isPublished && (task.teamNames || []).some(name => normalizeName(name) === me)) || task.addedByUid === currentUser.uid);
    if (!isPublished && !myWeek.length) return { notPublished: true, tasks: [], weekDays: {} };
    const weekDays = {};
    myWeek.forEach(task => { weekDays[task.date] = (weekDays[task.date] || 0) + 1; });

    const tasks = await Promise.all(myWeek.filter(task => task.date === dateStr).map(async task => {
        const chantier = chantiers.find(c => c.id === task.chantierId) || chantiers.find(c => c.name === task.chantierName) || {};
        const name = task.chantierName || chantier.name || 'Chantier';
        const teamSize = Math.max(1, task.teamSize || (task.teamNames || []).length);

        // Durée : heures prévues du chantier, sinon médiane des derniers passages pointés
        let totalHours = parseFloat(chantier.totalHeuresPrevues) || 0;
        let durationSource = totalHours ? 'planned' : 'unknown';
        if (!totalHours) {
            const estimate = await estimateHoursPerVisit(name);
            if (estimate) { totalHours = estimate; durationSource = 'estimated'; }
        }

        return {
            name,
            address: chantier.address || '',
            coordinates: chantier.coordinates?.lat ? chantier.coordinates : null,
            // Heures du chantier partagées entre les personnes prévues (8 h à 4 = 2 h chacun)
            durationMin: Math.round((totalHours / teamSize) * 60),
            durationSource,
            // Heure imposée : celle du planning si l'admin en a mis une, sinon le RDV du chantier
            fixedMin: toMinutes(task.startTime || chantier.fixedAppointment),
            openMin: toMinutes(chantier.timeWindowStart),
            deadlineMin: toMinutes(chantier.timeWindowEnd),
            teamNames: task.teamNames || [],
        };
    }));
    return { notPublished: false, tasks, weekDays };
}

/**
 * Durée d'un passage (total équipe, en heures) d'après l'historique : médiane des derniers passages.
 * Un passage = tous les pointages terminés d'une même journée sur ce chantier.
 */
async function estimateHoursPerVisit(chantierName) {
    const cacheKey = `durationEstimate:${normalizeName(chantierName)}`;
    const cached = storage.get(cacheKey);
    if (cached && Date.now() - cached.at < ESTIMATE_TTL_MS) return cached.hours;
    try {
        const snapshot = await getDocs(query(collection(db, "pointages"), where("chantier", "==", chantierName)));
        const byDay = {};
        snapshot.forEach(d => {
            const p = d.data();
            if (!p.endTime) return;
            const ms = new Date(p.endTime) - new Date(p.timestamp) - (p.pauseDurationMs || 0);
            if (ms <= 0) return;
            const day = String(p.timestamp).split('T')[0];
            byDay[day] = (byDay[day] || 0) + ms;
        });
        const passages = Object.keys(byDay).sort().slice(-ESTIMATE_PASSAGES).map(day => byDay[day] / 3600000).sort((a, b) => a - b);
        if (!passages.length) return null;
        const mid = Math.floor(passages.length / 2);
        const median = passages.length % 2 ? passages[mid] : (passages[mid - 1] + passages[mid]) / 2;
        const hours = Math.round(median * 4) / 4; // arrondi au quart d'heure
        storage.set(cacheKey, { hours, at: Date.now() });
        return hours;
    } catch (error) {
        console.error("Estimation de durée impossible :", error);
        return null;
    }
}

async function geocodeDepot() {
    const cached = storage.get('depotCoordinates');
    if (cached) return cached;
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(DEPOT.address)}.json?access_token=${MAPBOX_TOKEN}&limit=1&country=BE`;
    const data = await (await fetch(url)).json();
    const [lng, lat] = data.features[0].center;
    storage.set('depotCoordinates', { lat, lng });
    return { lat, lng };
}

// Temps et distances de route réels (Mapbox) ; estimation si le service ne répond pas
async function getTravelMatrix(points) {
    const coords = points.map(p => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(';');
    try {
        const url = `https://api.mapbox.com/directions-matrix/v1/mapbox/driving/${coords}?annotations=duration,distance&access_token=${MAPBOX_TOKEN}`;
        const data = await (await fetch(url)).json();
        if (data.code !== 'Ok') throw new Error(data.message || data.code);
        return {
            min: data.durations.map(row => row.map(s => Math.round((s || 0) / 60))),
            km: data.distances.map(row => row.map(m => Math.round((m || 0) / 100) / 10)),
        };
    } catch (error) {
        console.error("Matrice Mapbox indisponible, estimation utilisée :", error);
        return estimateMatrix(points);
    }
}

// --- Calcul ---

async function computeRoute() {
    const result = document.getElementById('routeResult');
    const btn = document.getElementById('computeRouteBtn');
    const departureInput = document.getElementById('routeDeparture');
    if (!departureInput.value) return;
    storage.set('routeDeparture', departureInput.value);

    btn.disabled = true;
    btn.textContent = 'Calcul…';
    result.innerHTML = '<div class="page-loader"><div class="spinner"></div></div>';

    try {
        const { notPublished, tasks, weekDays } = await loadMyTasks(selectedDate);
        if (notPublished) {
            result.innerHTML = `<p class="hours-empty">Le planning de cette semaine n'a pas encore été publié.</p>`;
            return;
        }
        if (!tasks.length) {
            const otherDays = Object.keys(weekDays).sort();
            result.innerHTML = `
                <div class="hours-empty">
                    <p style="margin: 0;">Aucun chantier prévu pour vous le ${dayLabel(selectedDate)}.</p>
                    ${otherDays.length ? `
                        <p style="margin: 0.75rem 0 0.5rem;">Cette semaine, vous avez des chantiers :</p>
                        <div class="flex flex-wrap justify-center gap-2">
                            ${otherDays.map(d => `<button type="button" class="btn btn-secondary" data-goto="${d}">${dayLabel(d)} · ${weekDays[d]}</button>`).join('')}
                        </div>` : ''}
                </div>`;
            result.querySelectorAll('[data-goto]').forEach(b => b.onclick = () => { selectDate(b.dataset.goto); computeRoute(); });
            return;
        }

        const routable = tasks.filter(t => t.coordinates);
        const depot = await geocodeDepot();
        const matrix = await getTravelMatrix([depot, ...routable.map(t => t.coordinates)]);
        const departureMin = toMinutes(departureInput.value);
        const optimal = planRoute(routable, matrix, departureMin);

        state = {
            date: selectedDate,
            departureMin,
            tasks: routable,
            skipped: tasks.filter(t => !t.coordinates).map(t => t.name),
            matrix,
            order: optimal.steps.map(s => s.index),
            custom: false,
            exhaustive: optimal.exhaustive,
            computedAt: Date.now(),
        };
        saveState();
        renderDays();
        renderResult();
    } catch (error) {
        console.error("Erreur calcul tournée :", error);
        result.innerHTML = `<p class="hours-empty">Le calcul a échoué. Vérifiez votre connexion et réessayez.</p>`;
    } finally {
        btn.disabled = false;
        btn.textContent = 'Calculer ma journée';
    }
}

// Déplace une étape d'un cran (ordre choisi par l'employé) puis recalcule les heures
function moveStep(position, delta) {
    const target = position + delta;
    if (!state || target < 0 || target >= state.order.length) return;
    [state.order[position], state.order[target]] = [state.order[target], state.order[position]];
    state.custom = true;
    saveState();
    renderResult();
}

function resetOrder() {
    state.order = planRoute(state.tasks, state.matrix, state.departureMin).steps.map(s => s.index);
    state.custom = false;
    saveState();
    renderResult();
}

// --- Affichage ---

function renderResult() {
    const result = document.getElementById('routeResult');
    if (!state) return;
    const { tasks, matrix, departureMin } = state;
    const plan = simulate(state.order, tasks, matrix, departureMin);
    const optimal = planRoute(tasks, matrix, departureMin);
    const advised = latestDeparture(tasks, matrix);
    const parts = [];

    // Bandeau : quand a été calculée la tournée, ordre personnalisé
    const computed = new Date(state.computedAt);
    parts.push(`
        <div class="route-meta">
            <span>Calculée le ${computed.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} à ${computed.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}${state.custom ? ' · <strong>ordre modifié</strong>' : ''}</span>
            ${state.custom ? `<button type="button" class="hours-back" data-reset>Ordre optimal</button>` : ''}
        </div>`);

    // Conseil d'heure de départ
    if (advised !== null) {
        const tooLate = departureMin > advised;
        parts.push(`
            <div class="route-advice ${tooLate ? 'is-late' : ''}">
                <span>${tooLate
                    ? `<strong>Partez plus tôt :</strong> départ au plus tard à <strong>${fromMinutes(advised)}</strong> pour respecter les horaires.`
                    : `Départ conseillé : <strong>${fromMinutes(advised)}</strong> au plus tard.`}</span>
                ${departureMin !== advised ? `<button type="button" class="btn btn-secondary" data-use-advised>Partir à ${fromMinutes(advised)}</button>` : ''}
            </div>`);
    }

    if (plan.lateness > 0) {
        parts.push(`<div class="todo-alert" style="cursor: default;"><span><strong>Horaires non tenus :</strong> ${state.custom && optimal.lateness < plan.lateness ? "votre ordre crée des retards, l'ordre optimal les évite ou les réduit." : 'certains horaires ne peuvent pas être respectés, même dans le meilleur ordre (en rouge).'}</span></div>`);
    } else if (state.custom && plan.km > optimal.km + 0.5) {
        parts.push(`<p class="field-hint" style="text-align: center;">Votre ordre fait ${Math.round(plan.km - optimal.km)} km de plus que l'ordre optimal.</p>`);
    }

    const workMin = plan.steps.reduce((s, st) => s + (st.end - st.start), 0);
    const driveMin = plan.steps.reduce((s, st) => s + st.travelMin, 0);
    parts.push(`
        <div class="hours-overview">
            <div class="hours-kpi"><span class="hours-kpi-label">Fin de journée</span><span class="hours-kpi-value">${fromMinutes(plan.endMin)}</span><span class="hours-kpi-sub">${tasks.length} chantier${tasks.length > 1 ? 's' : ''}</span></div>
            <div class="hours-kpi"><span class="hours-kpi-label">Kilomètres</span><span class="hours-kpi-value">${Math.round(plan.km)} km</span><span class="hours-kpi-sub">${formatDuration(driveMin)} de route${matrix.estimated ? ' (estimation)' : ''}</span></div>
            <div class="hours-kpi"><span class="hours-kpi-label">Sur chantier</span><span class="hours-kpi-value">${formatDuration(workMin)}</span><span class="hours-kpi-sub">temps de travail prévu</span></div>
        </div>`);

    // Étape en cours (uniquement pour la tournée du jour)
    const isToday = state.date === localDateStr(new Date());
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    const currentPos = isToday ? plan.steps.findIndex(st => st.end > nowMin) : -1;

    const steps = plan.steps.map((step, i) => {
        const task = tasks[step.index];
        const destination = encodeURIComponent(task.address || `${task.coordinates.lat},${task.coordinates.lng}`);
        const constraint = task.fixedMin !== null ? `<span class="cchip is-fixed">RDV ${fromMinutes(task.fixedMin)}</span>`
            : task.deadlineMin !== null ? `<span class="cchip is-window">Fini avant ${fromMinutes(task.deadlineMin)}</span>`
            : task.openMin !== null ? `<span class="cchip is-window">Dès ${fromMinutes(task.openMin)}</span>` : '';
        const durationText = task.durationSource === 'unknown' ? 'durée inconnue'
            : `${formatDuration(task.durationMin)}${task.durationSource === 'estimated' ? ' (estimée)' : ''}`;
        const lateText = step.late.map(l => l.type === 'rdv' ? `Arrivée ${l.minutes} min après le RDV` : `Fini ${l.minutes} min après l'échéance`).join(' · ');
        const waitMin = step.start - step.arrival;
        const status = i < currentPos ? ' is-done' : i === currentPos ? ' is-current' : '';

        return `
            <li class="route-step${step.late.length ? ' is-late' : ''}${status}">
                <div class="route-drive">Partir à <strong>${fromMinutes(step.leave)}</strong> · ${formatDuration(step.travelMin)} · ${step.travelKm.toFixed(1)} km</div>
                <div class="route-card">
                    <div class="route-card-head">
                        <span class="route-num">${i + 1}</span>
                        <div class="min-w-0" style="flex: 1;">
                            <p class="route-name">${escapeHTML(task.name)}${i === currentPos ? ' <span class="site-badge is-today">Maintenant</span>' : ''}</p>
                            <p class="route-time">${fromMinutes(step.start)} → ${fromMinutes(step.end)} · ${durationText}</p>
                        </div>
                        <div class="route-move">
                            <button type="button" class="icon-btn" data-move="-1" data-pos="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Monter"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg></button>
                            <button type="button" class="icon-btn" data-move="1" data-pos="${i}" ${i === plan.steps.length - 1 ? 'disabled' : ''} aria-label="Descendre"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></button>
                        </div>
                    </div>
                    <div class="cchips">
                        ${constraint}
                        ${waitMin > 0 ? `<span class="cchip">Arrivée ${fromMinutes(step.arrival)}${task.fixedMin !== null ? ` (${RDV_MARGIN_MIN} min d'avance)` : ''}</span>` : ''}
                        ${task.teamNames.length > 1 ? `<span class="cchip">Avec ${escapeHTML(task.teamNames.filter(n => normalizeName(n) !== normalizeName(currentUser.displayName)).join(', '))}</span>` : ''}
                    </div>
                    ${lateText ? `<p class="constraint-issue" style="margin: 0.5rem 0 0; font-size: 0.8125rem;">⚠ ${lateText}</p>` : ''}
                    <div class="route-nav">
                        <a class="site-nav-btn" href="https://waze.com/ul?q=${destination}&navigate=yes" target="_blank" rel="noopener noreferrer">Waze</a>
                        <a class="site-nav-btn" href="https://www.google.com/maps/dir/?api=1&destination=${destination}" target="_blank" rel="noopener noreferrer">Google Maps</a>
                    </div>
                </div>
            </li>`;
    }).join('');

    parts.push(`
        <ol class="route-steps">
            <li class="route-step"><div class="route-card route-depot"><span class="route-num">D</span><div><p class="route-name">${DEPOT.name}</p><p class="route-time">Départ ${fromMinutes(departureMin)}</p></div></div></li>
            ${steps}
        </ol>`);

    if (state.skipped.length) parts.push(`<p class="field-hint" style="text-align: center;">Non placés (adresse non localisée) : ${state.skipped.map(escapeHTML).join(', ')}.</p>`);
    if (!state.exhaustive) parts.push(`<p class="field-hint" style="text-align: center;">Beaucoup de chantiers ce jour-là : ordre calculé par approximation.</p>`);
    parts.push(`<p class="field-hint" style="text-align: center;">Le planning a changé ? Appuyez sur « Calculer ma journée » pour mettre la tournée à jour.</p>`);

    result.innerHTML = parts.join('');
    result.querySelector('[data-reset]')?.addEventListener('click', resetOrder);
    result.querySelector('[data-use-advised]')?.addEventListener('click', () => {
        document.getElementById('routeDeparture').value = fromMinutes(advised);
        document.getElementById('routeDeparture').dispatchEvent(new Event('change'));
    });
    result.querySelectorAll('[data-move]').forEach(b => b.onclick = () => moveStep(Number(b.dataset.pos), Number(b.dataset.move)));
}
