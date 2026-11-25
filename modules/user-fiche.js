// Page « Fiche de contrôle » (employé) : cocher Fait / À revoir / S.O. pour chaque point, puis valider.
// Le brouillon est gardé sur le téléphone (on peut quitter et revenir) ; la validation débloque la sortie.
import { pageContent, currentUser, navigateTo, showInfoModal, showToast } from "../app.js";
import { MODELES, LIBELLES, VALEURS, reponsesCompletes, resume, erreurValidation, dateFr } from "./fiches-controle.js";
import { lireFiche, ouvrirFiche, validerFiche } from "./fiches-store.js";
import { escapeHTML } from "./work-profile.js";

const ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 3v2h6V3M8.5 12l2 2 4.5-4.5M8 18h8"/></svg>';
const brouillonKey = (id) => `ficheBrouillon_${id}`;
let fiche = null;
let saisie = null;
let essai = false;

function lireBrouillon(id) {
    try { return JSON.parse(localStorage.getItem(brouillonKey(id)) || 'null'); } catch { return null; }
}
function garderBrouillon() {
    try { localStorage.setItem(brouillonKey(fiche.id), JSON.stringify(saisie)); } catch { /* stockage plein : tant pis */ }
}

export async function render(params = {}) {
    essai = false;
    try { fiche = params.id ? await lireFiche(params.id) : null; } catch (e) { console.error(e); fiche = null; }
    if (!fiche || !MODELES[fiche.modele]) {
        pageContent.innerHTML = `<div class="fc-page"><p class="fc-sub">Fiche introuvable. Vérifie la connexion puis réessaie depuis le planning.</p>
            <button type="button" class="btn btn-secondary" id="ficheBack">Retour au planning</button></div>`;
        document.getElementById('ficheBack').onclick = () => navigateTo('user-dashboard');
        return;
    }
    const d = lireBrouillon(fiche.id) || {};
    saisie = {
        reponses: { ...(fiche.reponses || {}), ...(d.reponses || {}) },
        observations: d.observations ?? fiche.observations ?? '',
        personnePrevenue: d.personnePrevenue ?? fiche.personnePrevenue ?? '',
        aCorrigerAvant: d.aCorrigerAvant ?? fiche.aCorrigerAvant ?? '',
    };
    if (fiche.statut !== 'validee') ouvrirFiche(fiche).catch(e => console.error('Ouverture de la fiche :', e));
    draw();
}

const courante = () => ({ ...fiche, ...saisie });

function draw() {
    const modele = MODELES[fiche.modele];
    const lectureSeule = fiche.statut === 'validee';
    const rep = reponsesCompletes(courante());
    const r = resume(courante());
    const aRevoir = r.R > 0;
    const err = essai ? erreurValidation(courante()) : null;
    const pasMoi = fiche.responsableUid && fiche.responsableUid !== currentUser.uid && !lectureSeule;

    pageContent.innerHTML = `
    <div class="fc-page">
        <button type="button" class="link font-semibold fc-back" id="ficheBack">&larr; Retour au planning</button>
        <div>
            <p class="kpi-label">Fiche de contrôle · ${modele.code}</p>
            <h2 class="text-2xl font-bold">${escapeHTML(modele.court)}</h2>
            <p class="fc-sub">${escapeHTML(modele.intro)}</p>
        </div>
        ${pasMoi ? `<div class="fc-card is-info"><p class="fc-sub">Cette fiche est prévue pour ${escapeHTML(fiche.responsableNom)}. En la validant, c'est toi qui la remplis.</p></div>` : ''}
        ${lectureSeule ? `<div class="fc-card is-done"><div class="fc-head"><span class="fc-ico">${ICON_CHECK}</span><div><p class="fc-title">Fiche validée à ${escapeHTML(fiche.heure || '')}</p><p class="fc-sub">Elle part au client avec le mail de passage du soir.</p></div></div></div>` : ''}
        <div class="fc-card">
            <dl class="fc-meta">
                <div><dt>Client / site</dt><dd>${escapeHTML(fiche.chantierName)}</dd></div>
                <div><dt>Local / zone</dt><dd>${escapeHTML(fiche.zone || '—')}</dd></div>
                <div><dt>Date</dt><dd>${dateFr(fiche.date)}</dd></div>
                <div><dt>Rempli par</dt><dd>${escapeHTML(lectureSeule ? fiche.responsableNom : (currentUser.displayName || ''))}</dd></div>
            </dl>
            <div class="fc-count"><span><b>${r.coches}/${r.aCocher}</b> points cochés</span><span class="fc-sub">${(fiche.horsPrestation || []).length} hors prestation</span></div>
            <div class="fc-progress"><i style="width:${r.aCocher ? r.coches / r.aCocher * 100 : 0}%"></i></div>
            <p class="fc-sub fc-small">Une case par ligne après le nettoyage. S.O. = sans objet ou hors prestation.</p>
        </div>
        ${modele.points.map(([titre, detail], i) => {
            const n = i + 1;
            const hors = (fiche.horsPrestation || []).includes(n);
            const manque = essai && !hors && !rep[n];
            return `<div class="fc-pt${hors ? ' is-locked' : ''}${manque ? ' is-missing' : ''}" id="pt-${n}">
                <div class="fc-pt-head"><span class="fc-num">${String(n).padStart(2, '0')}</span><div><div class="fc-pt-title">${escapeHTML(titre)}</div><div class="fc-pt-desc">${escapeHTML(detail)}</div></div></div>
                ${hors ? `<span class="fc-locked">Hors prestation sur ce chantier : S.O. coché d'office</span>`
                    : `<div class="fc-seg" role="group" aria-label="${escapeHTML(titre)}">${VALEURS.map(v =>
                        `<button type="button" data-pt="${n}" data-v="${v}" aria-pressed="${rep[n] === v}" ${lectureSeule ? 'disabled' : ''}>${LIBELLES[v]}</button>`).join('')}</div>
                       ${manque ? '<span class="fc-err">À cocher</span>' : ''}`}
            </div>`;
        }).join('')}
        <div class="fc-card">
            <div class="field">
                <label for="ficheObs" class="field-label">Observations / correction faite ou à prévoir ${aRevoir ? '<span class="fc-err">obligatoire : indique le n° du point</span>' : '<span class="field-optional">(facultatif)</span>'}</label>
                <textarea id="ficheObs" class="input" rows="3" maxlength="600" placeholder="Ex. n°9 : chasse d'eau du WC du 2e qui coule" ${lectureSeule ? 'readonly' : ''}>${escapeHTML(saisie.observations)}</textarea>
            </div>
            ${aRevoir || saisie.personnePrevenue || saisie.aCorrigerAvant ? `
            <div class="field">
                <label for="fichePrevenu" class="field-label">Personne prévenue</label>
                <input id="fichePrevenu" type="text" class="input" maxlength="80" placeholder="Ex. la concierge" value="${escapeHTML(saisie.personnePrevenue)}" ${lectureSeule ? 'readonly' : ''}>
            </div>
            <div class="field">
                <label for="ficheEcheance" class="field-label">À corriger avant le <span class="field-optional">(si nécessaire)</span></label>
                <input id="ficheEcheance" type="date" class="input" value="${escapeHTML(saisie.aCorrigerAvant)}" ${lectureSeule ? 'readonly' : ''}>
            </div>` : ''}
            <p class="field-hint">Signale immédiatement tout problème urgent au responsable.</p>
        </div>
        ${lectureSeule ? '' : `
        <div class="fc-sticky">
            <span class="fc-sub" id="ficheHint">${err ? `<span class="fc-err">${escapeHTML(err)}</span>` : `${r.coches}/${r.aCocher} points cochés`}</span>
            <button type="button" class="btn btn-primary" id="ficheValider">Valider la fiche</button>
        </div>`}
    </div>`;

    document.getElementById('ficheBack').onclick = () => navigateTo('user-dashboard');
    if (lectureSeule) return;
    pageContent.querySelectorAll('[data-pt]').forEach(btn => btn.onclick = () => {
        const n = btn.dataset.pt;
        saisie.reponses[n] = saisie.reponses[n] === btn.dataset.v ? null : btn.dataset.v;
        if (!saisie.reponses[n]) delete saisie.reponses[n];
        garderBrouillon();
        redraw();
    });
    const obs = document.getElementById('ficheObs');
    obs.oninput = () => {
        const avant = !!saisie.observations.trim();
        saisie.observations = obs.value;
        garderBrouillon();
        if (essai && avant !== !!obs.value.trim()) updateHint();
    };
    const prev = document.getElementById('fichePrevenu');
    if (prev) prev.oninput = () => { saisie.personnePrevenue = prev.value; garderBrouillon(); };
    const ech = document.getElementById('ficheEcheance');
    if (ech) ech.onchange = () => { saisie.aCorrigerAvant = ech.value; garderBrouillon(); };
    document.getElementById('ficheValider').onclick = valider;
}

// Redessine sans perdre la position ni le texte en cours de saisie
function redraw() {
    const y = window.scrollY;
    draw();
    window.scrollTo(0, y);
}
function updateHint() {
    const hint = document.getElementById('ficheHint');
    const err = erreurValidation(courante());
    const r = resume(courante());
    if (hint) hint.innerHTML = err ? `<span class="fc-err">${escapeHTML(err)}</span>` : `${r.coches}/${r.aCocher} points cochés`;
}

async function valider() {
    essai = true;
    const err = erreurValidation(courante());
    if (err) {
        redraw();
        const premier = pageContent.querySelector('.fc-pt.is-missing');
        if (premier) premier.scrollIntoView({ behavior: 'smooth', block: 'center' });
        else document.getElementById('ficheObs')?.focus();
        return;
    }
    const btn = document.getElementById('ficheValider');
    btn.disabled = true;
    btn.textContent = 'Enregistrement…';
    const reponses = Object.fromEntries(Object.entries(reponsesCompletes(courante())));
    const ecriture = validerFiche(fiche, {
        reponses,
        observations: saisie.observations.trim(),
        personnePrevenue: (saisie.personnePrevenue || '').trim(),
        aCorrigerAvant: saisie.aCorrigerAvant || '',
    });
    try { localStorage.removeItem(brouillonKey(fiche.id)); } catch { /* rien */ }
    if (!navigator.onLine) {
        ecriture.catch(e => console.error('Validation de la fiche :', e));
        showToast("Hors ligne : fiche enregistrée sur le téléphone, elle sera envoyée dès le retour du réseau.", 'warning');
        navigateTo('user-dashboard');
        return;
    }
    try {
        await ecriture;
        showToast('Fiche de contrôle validée. Tu peux pointer ta sortie.', 'success');
        navigateTo('user-dashboard');
    } catch (error) {
        console.error('Validation de la fiche :', error);
        btn.disabled = false;
        btn.textContent = 'Valider la fiche';
        showInfoModal('Erreur', "La fiche n'a pas pu être enregistrée. Vérifie la connexion et réessaie.");
    }
}
