import { collection, query, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent } from "../app.js";
import { formatMilliseconds } from "./utils.js";

// --- Variables pour la mise en cache des données ---
let chantiersCache = [];
let pointagesCache = new Map();  // id chantier -> pointages (historique complet)
let activeChantiersCache = [];   // chantiers ayant au moins un pointage
let currentChantierId = null;
let listSort = 'month';

const DAY_MS = 86400000;

const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Durée effective d'un pointage terminé (0 pour un pointage encore en cours)
const effectiveMs = (p) => p.endTime ? Math.max(0, new Date(p.endTime) - new Date(p.timestamp) - (p.pauseDurationMs || 0)) : 0;
const dayKey = (iso) => String(iso).split('T')[0];

function monthBounds(offset = 0) {
    const now = new Date();
    return {
        start: new Date(now.getFullYear(), now.getMonth() + offset, 1),
        end: new Date(now.getFullYear(), now.getMonth() + offset + 1, 1),
    };
}

function relativeDay(date) {
    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
    const days = Math.round((startOfToday - new Date(date.getFullYear(), date.getMonth(), date.getDate())) / DAY_MS);
    if (days <= 0) return "aujourd'hui";
    if (days === 1) return 'hier';
    if (days < 7) return `il y a ${days} jours`;
    return `le ${date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`;
}

/**
 * Statistiques d'un chantier sur une liste de pointages.
 */
function computeStats(pointages, from = null, to = null) {
    const inRange = pointages.filter(p => {
        const d = new Date(p.timestamp);
        return (!from || d >= from) && (!to || d < to);
    });
    const done = inRange.filter(p => p.endTime);
    const totalMs = done.reduce((sum, p) => sum + effectiveMs(p), 0);
    const visits = new Set(done.map(p => dayKey(p.timestamp))).size;
    return { totalMs, visits, count: done.length, running: inRange.filter(p => !p.endTime).length };
}

/**
 * Point d'entrée principal : Affiche la structure de la page.
 */
export async function render() {
    currentChantierId = null;
    pageContent.innerHTML = `
        <div class="max-w-5xl mx-auto space-y-6">
            <div id="chantier-list-view" class="space-y-4">
                <div>
                    <h2 class="text-2xl font-bold">Heures par chantier</h2>
                    <p class="mt-1 text-sm" style="color: var(--color-text-muted);">Toutes les heures et tous les pointages enregistrés, chantier par chantier.</p>
                </div>

                <div id="hours-overview" class="hours-overview">
                    ${'<div class="hours-kpi is-loading"></div>'.repeat(3)}
                </div>

                <div class="hours-toolbar">
                    <div class="hours-search">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
                        <input type="search" id="search-chantier-input" placeholder="Rechercher un chantier…" autocomplete="off">
                    </div>
                    <div class="segmented" role="group" aria-label="Trier les chantiers">
                        <button type="button" data-sort="month" class="sort-btn is-active">Heures du mois</button>
                        <button type="button" data-sort="recent" class="sort-btn">Dernier passage</button>
                        <button type="button" data-sort="name" class="sort-btn">A → Z</button>
                    </div>
                </div>

                <div id="chantiers-summary-list" class="hours-grid"></div>
            </div>

            <div id="chantier-detail-view" class="hidden space-y-4">
                <button id="back-to-list-btn" class="hours-back">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
                    Tous les chantiers
                </button>

                <div class="p-4 sm:p-6 rounded-lg shadow-sm space-y-5" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                    <div class="flex justify-between items-start gap-4">
                        <div class="min-w-0">
                            <h3 id="detail-chantier-name" class="text-xl font-bold"></h3>
                            <p id="detail-chantier-address" class="text-sm mt-1" style="color: var(--color-text-muted);"></p>
                        </div>
                        <div class="flex gap-2 flex-shrink-0">
                            <button id="export-csv-btn" class="btn btn-secondary" title="Exporter les pointages (Excel / CSV)">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="pointer-events: none;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                                <span class="hidden sm:inline">Exporter</span>
                            </button>
                            <a id="detail-chantier-nav-link" href="#" target="_blank" rel="noopener noreferrer" class="btn btn-secondary" title="Ouvrir l'itinéraire dans Google Maps">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 11 19-9-9 19-2-8-8-2z"/></svg>
                                <span class="hidden sm:inline">Itinéraire</span>
                            </a>
                        </div>
                    </div>

                    <div id="detail-kpis" class="hours-detail-kpis"></div>

                    <div class="segmented segmented-center" role="group" aria-label="Regrouper par">
                        <button data-period="week" class="period-btn">Par semaine</button>
                        <button data-period="month" class="period-btn active">Par mois</button>
                        <button data-period="year" class="period-btn">Par année</button>
                    </div>
                    <div id="chantier-summary-content"></div>
                </div>
            </div>
        </div>
    `;

    setTimeout(() => {
        setupEventListeners();
        loadAndDisplayChantiers();
    }, 0);
}

/**
 * Charge les données, contourne les problèmes de majuscules/minuscules et affiche les chantiers.
 */
async function loadAndDisplayChantiers() {
    const listContainer = document.getElementById('chantiers-summary-list');
    listContainer.innerHTML = '<div class="hours-card is-loading"></div>'.repeat(6);

    try {
        // 1. Récupération de tous les chantiers et de TOUS les pointages (historique complet)
        const [chantiersSnapshot, pointagesSnapshot] = await Promise.all([
            getDocs(query(collection(db, "chantiers"), orderBy("name", "asc"))),
            getDocs(query(collection(db, "pointages"), orderBy("timestamp", "desc"))),
        ]);
        chantiersCache = chantiersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // 2. Regroupement insensible à la casse ("Hustuf" et "hustuf" = même chantier)
        const allPointagesMap = new Map();
        pointagesSnapshot.forEach(doc => {
            const data = doc.data();
            const normalizedName = (data.chantier || "").toLowerCase().trim();
            if (!allPointagesMap.has(normalizedName)) allPointagesMap.set(normalizedName, []);
            allPointagesMap.get(normalizedName).push(data);
        });

        // 3. On relie l'historique aux chantiers officiels et on calcule les indicateurs
        const thisMonth = monthBounds(0);
        const lastMonth = monthBounds(-1);
        pointagesCache = new Map();

        const chantiersWithHours = chantiersCache.map(chantier => {
            const normalizedName = (chantier.name || "").toLowerCase().trim();
            const pointages = allPointagesMap.get(normalizedName) || [];
            pointagesCache.set(chantier.id, pointages);

            const month = computeStats(pointages, thisMonth.start, thisMonth.end);
            const previous = computeStats(pointages, lastMonth.start, lastMonth.end);
            const lastVisit = pointages.length ? new Date(pointages[0].timestamp) : null; // trié du plus récent au plus ancien

            return {
                ...chantier,
                monthlyTotalMs: month.totalMs,
                monthlyVisits: month.visits,
                lastMonthTotalMs: previous.totalMs,
                running: pointages.filter(p => !p.endTime).length,
                lastVisit,
                hasHistory: pointages.length > 0,
            };
        });

        // On ne garde que les chantiers qui ont au moins 1 pointage enregistré dans leur histoire
        activeChantiersCache = chantiersWithHours.filter(c => c.hasHistory);

        displayOverview(activeChantiersCache);
        applyListFilters();
    } catch (error) {
        console.error("Erreur de chargement des chantiers:", error);
        listContainer.innerHTML = `<p class="hours-empty">Une erreur est survenue lors du chargement.</p>`;
        document.getElementById('hours-overview').innerHTML = '';
    }
}

/**
 * Bandeau de synthèse au-dessus de la liste.
 */
function displayOverview(chantiers) {
    const container = document.getElementById('hours-overview');
    if (!container) return;
    const monthMs = chantiers.reduce((sum, c) => sum + c.monthlyTotalMs, 0);
    const lastMonthMs = chantiers.reduce((sum, c) => sum + c.lastMonthTotalMs, 0);
    const activeThisMonth = chantiers.filter(c => c.monthlyTotalMs > 0).length;
    const running = chantiers.reduce((sum, c) => sum + c.running, 0);
    const monthName = new Date().toLocaleDateString('fr-FR', { month: 'long' });

    let trend = '';
    if (lastMonthMs > 0) {
        const pct = Math.round(((monthMs - lastMonthMs) / lastMonthMs) * 100);
        trend = `<span class="hours-trend ${pct >= 0 ? 'is-up' : 'is-down'}">${pct >= 0 ? '+' : ''}${pct} % vs mois dernier</span>`;
    }

    container.innerHTML = `
        <div class="hours-kpi">
            <span class="hours-kpi-label">Heures en ${monthName}</span>
            <span class="hours-kpi-value">${formatMilliseconds(monthMs)}</span>
            ${trend || '<span class="hours-kpi-sub">Tous chantiers confondus</span>'}
        </div>
        <div class="hours-kpi">
            <span class="hours-kpi-label">Chantiers travaillés</span>
            <span class="hours-kpi-value">${activeThisMonth}</span>
            <span class="hours-kpi-sub">ce mois-ci, sur ${chantiers.length} au total</span>
        </div>
        <div class="hours-kpi">
            <span class="hours-kpi-label">Pointages en cours</span>
            <span class="hours-kpi-value">${running}</span>
            <span class="hours-kpi-sub">${running ? 'non comptés dans les totaux' : 'aucun en ce moment'}</span>
        </div>
    `;
}

/**
 * Applique la recherche et le tri, puis affiche les cartes.
 */
function applyListFilters() {
    const input = document.getElementById('search-chantier-input');
    if (!input) return;
    const searchTerm = input.value.toLowerCase().trim();
    const filtered = activeChantiersCache.filter(c =>
        c.name.toLowerCase().includes(searchTerm) || (c.address || '').toLowerCase().includes(searchTerm)
    );
    const sorters = {
        month: (a, b) => b.monthlyTotalMs - a.monthlyTotalMs || a.name.localeCompare(b.name, 'fr'),
        recent: (a, b) => (b.lastVisit || 0) - (a.lastVisit || 0),
        name: (a, b) => a.name.localeCompare(b.name, 'fr'),
    };
    displayChantierCards(filtered.sort(sorters[listSort]));
}

/**
 * Affiche les cartes des chantiers dans la liste principale.
 * @param {Array} chantiers - La liste des chantiers à afficher.
 */
function displayChantierCards(chantiers) {
    const listContainer = document.getElementById('chantiers-summary-list');
    listContainer.innerHTML = '';

    if (chantiers.length === 0) {
        const searchTerm = document.getElementById('search-chantier-input').value;
        listContainer.innerHTML = `<p class="hours-empty">${searchTerm ? 'Aucun chantier ne correspond à votre recherche.' : "Aucun chantier n'a d'heures enregistrées."}</p>`;
        return;
    }

    const maxMonth = Math.max(...chantiers.map(c => c.monthlyTotalMs), 1);

    chantiers.forEach(chantier => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'hours-card';
        card.setAttribute('data-chantier-id', chantier.id);

        const plannedPerVisit = parseFloat(chantier.totalHeuresPrevues) || 0;
        let delta = '';
        if (chantier.lastMonthTotalMs > 0 && chantier.monthlyTotalMs > 0) {
            const pct = Math.round(((chantier.monthlyTotalMs - chantier.lastMonthTotalMs) / chantier.lastMonthTotalMs) * 100);
            delta = `<span class="hours-trend ${pct >= 0 ? 'is-up' : 'is-down'}">${pct >= 0 ? '+' : ''}${pct} %</span>`;
        }

        card.innerHTML = `
            <span class="hours-card-head">
                <span class="hours-card-name" title="${escapeHTML(chantier.name)}">${escapeHTML(chantier.name)}</span>
                ${chantier.running ? '<span class="hours-live"><span class="hours-live-dot"></span>En cours</span>' : ''}
            </span>
            ${chantier.address ? `<span class="hours-card-address">${escapeHTML(chantier.address)}</span>` : ''}
            <span class="hours-card-figure">
                <span class="hours-card-value">${formatMilliseconds(chantier.monthlyTotalMs)}</span>
                <span class="hours-card-unit">ce mois-ci</span>
                ${delta}
            </span>
            <span class="hours-card-bar"><span style="width: ${Math.round((chantier.monthlyTotalMs / maxMonth) * 100)}%"></span></span>
            <span class="hours-card-meta">
                <span>${chantier.monthlyVisits} passage${chantier.monthlyVisits > 1 ? 's' : ''}${plannedPerVisit ? ` · ${plannedPerVisit} h prévues/passage` : ''}</span>
                <span>${chantier.lastVisit ? `Dernier : ${relativeDay(chantier.lastVisit)}` : ''}</span>
            </span>
        `;
        listContainer.appendChild(card);
    });
}

/**
 * Affiche la vue détaillée pour un chantier spécifique en utilisant le cache sans refaire de requête Firebase.
 * @param {string} chantierId - L'ID du chantier à afficher.
 */
function showChantierDetails(chantierId) {
    const chantier = chantiersCache.find(c => c.id === chantierId);
    if (!chantier) return;
    currentChantierId = chantierId;

    document.getElementById('chantier-list-view').classList.add('hidden');
    document.getElementById('chantier-detail-view').classList.remove('hidden');
    window.scrollTo({ top: 0 });

    document.getElementById('detail-chantier-name').textContent = chantier.name;
    document.getElementById('detail-chantier-address').textContent = chantier.address || 'Adresse non spécifiée';
    const navLink = document.getElementById('detail-chantier-nav-link');
    navLink.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(chantier.address || chantier.name)}`;
    navLink.classList.toggle('hidden', !chantier.address);

    document.querySelectorAll('.period-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector('.period-btn[data-period="month"]').classList.add('active');

    const pointages = pointagesCache.get(chantier.id) || [];
    displayDetailKpis(chantier, pointages);
    generateSummary('month', pointages);
}

/**
 * Indicateurs du chantier : mois en cours, mois dernier, total, moyenne par passage.
 */
function displayDetailKpis(chantier, pointages) {
    const container = document.getElementById('detail-kpis');
    const month = computeStats(pointages, monthBounds(0).start, monthBounds(0).end);
    const previous = computeStats(pointages, monthBounds(-1).start, monthBounds(-1).end);
    const all = computeStats(pointages);
    const plannedPerVisit = parseFloat(chantier.totalHeuresPrevues) || 0;
    const avgPerVisitMs = all.visits ? all.totalMs / all.visits : 0;

    let avgDetail = `sur ${all.visits} passage${all.visits > 1 ? 's' : ''}`;
    if (plannedPerVisit && all.visits) {
        const ratio = avgPerVisitMs / (plannedPerVisit * 3600000);
        const state = ratio > 1.1 ? 'is-over' : ratio < 0.9 ? 'is-under' : 'is-ok';
        avgDetail = `<span class="hours-avg ${state}">Prévu : ${plannedPerVisit} h</span>`;
    }

    const kpi = (label, value, sub) => `
        <div class="hours-detail-kpi">
            <span class="hours-kpi-label">${label}</span>
            <span class="hours-detail-value">${value}</span>
            <span class="hours-kpi-sub">${sub}</span>
        </div>`;

    container.innerHTML = [
        kpi('Ce mois-ci', formatMilliseconds(month.totalMs), `${month.visits} passage${month.visits > 1 ? 's' : ''}`),
        kpi('Mois dernier', formatMilliseconds(previous.totalMs), `${previous.visits} passage${previous.visits > 1 ? 's' : ''}`),
        kpi('Moyenne / passage', formatMilliseconds(avgPerVisitMs), avgDetail),
        kpi('Total historique', formatMilliseconds(all.totalMs), `${all.count} pointage${all.count > 1 ? 's' : ''}`),
    ].join('');
}

/**
 * Génère et affiche le résumé détaillé des heures avec des sections dépliantes.
 * @param {'month'|'week'|'year'} period - La période de regroupement.
 * @param {Array} pointages - La liste des pointages pour ce chantier.
 */
function generateSummary(period, pointages) {
    const contentDiv = document.getElementById('chantier-summary-content');
    if (pointages.length === 0) {
        contentDiv.innerHTML = `<p class="hours-empty">Aucune heure enregistrée pour ce chantier.</p>`;
        return;
    }

    const getGroupKey = (date, period) => {
        if (period === 'year') return date.getFullYear().toString();
        if (period === 'month') return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
        return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
    };

    const formatGroupKey = (key, period) => {
        const parts = key.split('-');
        if (period === 'year') return `Année ${key}`;
        if (period === 'month') {
            const date = new Date(parts[0], parts[1] - 1);
            const label = date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
            return label.charAt(0).toUpperCase() + label.slice(1);
        }
        if (period === 'week') return `Semaine ${parts[1].replace('W', '')} · ${parts[0]}`;
        return key;
    };

    const grouped = pointages.reduce((acc, p) => {
        const key = getGroupKey(new Date(p.timestamp), period);
        if (!acc[key]) acc[key] = { totalMs: 0, entries: [], days: new Set() };
        const durationMs = effectiveMs(p);
        acc[key].totalMs += durationMs;
        if (p.endTime) acc[key].days.add(dayKey(p.timestamp));
        acc[key].entries.push({ ...p, durationMs });
        return acc;
    }, {});

    const sortedKeys = Object.keys(grouped).sort().reverse();
    const timeFormat = { hour: '2-digit', minute: '2-digit' };

    let html = '<div class="space-y-3">';
    sortedKeys.forEach((key, index) => {
        const group = grouped[key];
        html += `<details class="hours-group" ${index === 0 ? 'open' : ''}>
            <summary>
                <span class="hours-group-title">
                    <svg class="hours-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
                    <span>${formatGroupKey(key, period)}</span>
                    <span class="hours-group-count">${group.days.size} passage${group.days.size > 1 ? 's' : ''} · ${group.entries.length} pointage${group.entries.length > 1 ? 's' : ''}</span>
                </span>
                <span class="hours-group-total">${formatMilliseconds(group.totalMs)}</span>
            </summary>
            <div class="hours-entries">`;

        group.entries.forEach(entry => {
            const team = [...new Set([entry.userName, ...(entry.colleagues || [])].filter(Boolean))].join(', ');
            const startDate = new Date(entry.timestamp);
            const endDate = entry.endTime ? new Date(entry.endTime) : null;
            const pause = entry.pauseDurationMs > 0 ? ` · pause ${formatMilliseconds(entry.pauseDurationMs)}` : '';
            html += `
                <div class="hours-entry">
                    <div class="hours-entry-date">
                        <span class="hours-entry-day">${startDate.toLocaleDateString('fr-FR', { weekday: 'short' })}</span>
                        <span class="hours-entry-num">${startDate.getDate()}</span>
                        <span class="hours-entry-month">${startDate.toLocaleDateString('fr-FR', { month: 'short' })}</span>
                    </div>
                    <div class="hours-entry-main">
                        <span class="hours-entry-team" title="${escapeHTML(team)}">${escapeHTML(team) || '—'}</span>
                        <span class="hours-entry-time">${startDate.toLocaleTimeString('fr-FR', timeFormat)} – ${endDate ? endDate.toLocaleTimeString('fr-FR', timeFormat) : '…'}${pause}</span>
                        ${entry.notes ? `<span class="hours-entry-note">${escapeHTML(entry.notes)}</span>` : ''}
                    </div>
                    <div class="hours-entry-duration">${endDate ? formatMilliseconds(entry.durationMs) : '<span class="hours-live"><span class="hours-live-dot"></span>En cours</span>'}</div>
                </div>`;
        });
        html += `</div></details>`;
    });
    html += '</div>';

    contentDiv.innerHTML = html;
}

/**
 * Export des pointages du chantier affiché (CSV lisible par Excel).
 */
function exportChantierCSV() {
    const chantier = chantiersCache.find(c => c.id === currentChantierId);
    if (!chantier) return;
    const pointages = (pointagesCache.get(chantier.id) || []).filter(p => p.endTime);
    const cell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const hours = (ms) => (ms / 3600000).toFixed(2).replace('.', ',');
    const time = (iso) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    const rows = [['Date', 'Employé', 'Collègues', 'Début', 'Fin', 'Pause (h)', 'Durée (h)', 'Notes']];
    pointages.forEach(p => rows.push([
        new Date(p.timestamp).toLocaleDateString('fr-FR'),
        p.userName,
        (p.colleagues || []).join(', '),
        time(p.timestamp),
        time(p.endTime),
        hours(p.pauseDurationMs || 0),
        hours(effectiveMs(p)),
        (p.notes || '').replace(/\n/g, ' '),
    ]));

    const csv = '﻿' + rows.map(row => row.map(cell).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `Heures_${chantier.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_')}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Met en place tous les écouteurs d'événements de la page.
 */
function setupEventListeners() {
    document.getElementById('search-chantier-input').addEventListener('input', applyListFilters);

    document.querySelectorAll('.sort-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            listSort = btn.dataset.sort;
            document.querySelectorAll('.sort-btn').forEach(b => b.classList.toggle('is-active', b === btn));
            applyListFilters();
        });
    });
    document.querySelectorAll('.sort-btn').forEach(b => b.classList.toggle('is-active', b.dataset.sort === listSort));

    document.getElementById('chantiers-summary-list').addEventListener('click', (e) => {
        const card = e.target.closest('[data-chantier-id]');
        if (card) {
            showChantierDetails(card.dataset.chantierId);
        }
    });

    document.getElementById('back-to-list-btn').addEventListener('click', () => {
        currentChantierId = null;
        document.getElementById('chantier-detail-view').classList.add('hidden');
        document.getElementById('chantier-list-view').classList.remove('hidden');
    });

    document.getElementById('export-csv-btn').addEventListener('click', exportChantierCSV);

    document.querySelectorAll('.period-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (currentChantierId) {
                generateSummary(btn.dataset.period, pointagesCache.get(currentChantierId) || []);
            }
        });
    });
}
