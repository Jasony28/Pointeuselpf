// Page admin « Fiches de contrôle » : les fiches du jour, puis chaque chantier → toutes ses fiches, en détail.
<<<<<<< HEAD
import { collection, query, where, getDocs, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent, navigateTo, showInfoModal, showToast } from "../app.js";
=======
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent, navigateTo, showInfoModal } from "../app.js";
>>>>>>> 26d3b52bc99c33b56ecebf3aa3633ba6caa06486
import { getActiveChantiers } from "./data-service.js";
import { MODELES, LIBELLES, PAGE, caseRect, ficheConfig, reponsesCompletes, resume, etat, champsTexte, dateFr, jourLocal } from "./fiches-controle.js";
import { fichesDuJour, fichesDuChantier, fichesDepuis, telechargerPdf } from "./fiches-store.js";
import { escapeHTML } from "./work-profile.js";

const JOURS_RESUME = 60;
const esc = escapeHTML;
const jourLong = (iso) => {
    const d = new Date(`${iso}T12:00:00`);
    const s = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return s.charAt(0).toUpperCase() + s.slice(1);
};

function pastille(fiche, aujourdhui = jourLocal()) {
    const e = etat(fiche);
    if (e === 'attente') return `<span class="fc-pill">Personne n'a encore pointé</span>`;
    if (e === 'a_remplir') return `<span class="fc-pill pri">À remplir par ${esc(fiche.responsableNom)}</span>`;
    if (e === 'en_cours') return `<span class="fc-pill pri">En cours · ${esc(fiche.responsableNom)}</span>`;
    if (e === 'envoyee') return `<span class="fc-pill ok">Envoyée au client${fiche.envoyeeLe ? ` le ${new Date(fiche.envoyeeLe).toLocaleDateString('fr-FR')}` : ''}</span>`;
    const revoir = e === 'a_revoir' ? `<span class="fc-pill warn">${resume(fiche).R} point(s) à revoir</span> ` : '';
    const envoi = fiche.date === aujourdhui ? `<span class="fc-pill ok">Validée · part ce soir avec le mail</span>` : `<span class="fc-pill">Validée · pas encore envoyée</span>`;
    return revoir + envoi;
}

export async function render(params = {}) {
    pageContent.innerHTML = `<div class="page-loader"><div class="spinner" role="status" aria-label="Chargement"></div></div>`;
    try {
        if (params.chantierId) await renderChantier(params.chantierId);
<<<<<<< HEAD
        else if (params.vue === 'classer') await renderClasser();
=======
>>>>>>> 26d3b52bc99c33b56ecebf3aa3633ba6caa06486
        else await renderListe();
    } catch (error) {
        console.error('Fiches de contrôle :', error);
        pageContent.innerHTML = `<div class="max-w-md mx-auto text-center py-16"><p class="text-lg font-semibold">Fiches indisponibles</p><p class="fc-sub">Vérifiez la connexion puis rouvrez la page.</p></div>`;
    }
}

/* ---------- Vue d'ensemble ---------- */
async function renderListe() {
    const today = jourLocal();
    const depuis = new Date(); depuis.setDate(depuis.getDate() - JOURS_RESUME);
    const [chantiers, duJour, recentes, planning] = await Promise.all([
        getActiveChantiers(),
        fichesDuJour(today),
        fichesDepuis(jourLocal(depuis)),
        getDocs(query(collection(db, 'planning'), where('date', '==', today))).then(s => s.docs.map(d => d.data())).catch(() => []),
    ]);
    const avecFiche = chantiers.filter(c => ficheConfig(c)).sort((a, b) => String(a.name).localeCompare(String(b.name), 'fr'));
    const sansFiche = chantiers.length - avecFiche.length;

    // Aujourd'hui : chantiers prévus au planning (avec une fiche) + fiches déjà commencées
    const prevus = new Map();
    planning.forEach(t => { const c = avecFiche.find(x => x.id === t.chantierId); if (c) prevus.set(c.id, { chantier: c, equipe: t.teamNames || [] }); });
    duJour.forEach(f => { if (!prevus.has(f.chantierId)) prevus.set(f.chantierId, { chantier: chantiers.find(c => c.id === f.chantierId) || { id: f.chantierId, name: f.chantierName }, equipe: [] }); });
    const ficheDe = (id) => duJour.find(f => f.chantierId === id) || null;

    const parChantier = new Map();
    recentes.forEach(f => { const l = parChantier.get(f.chantierId) || []; l.push(f); parChantier.set(f.chantierId, l); });

    pageContent.innerHTML = `
    <div class="max-w-4xl mx-auto space-y-6">
        <div>
            <h2 class="text-2xl font-bold">Fiches de contrôle</h2>
            <p class="fc-sub">Remplies sur place à chaque passage, à tour de rôle. Chaque fiche validée part automatiquement au client en PDF avec le mail « Nettoyage effectué » du soir.</p>
        </div>
<<<<<<< HEAD
        <button type="button" class="btn btn-primary" id="goClasser">Classer les chantiers (A1, A2, B1)</button>
=======
>>>>>>> 26d3b52bc99c33b56ecebf3aa3633ba6caa06486

        <section class="space-y-3">
            <h3 class="kpi-label">Aujourd'hui · ${esc(jourLong(today))}</h3>
            ${prevus.size ? `<div class="fc-list">${[...prevus.values()].map(({ chantier, equipe }) => {
                const f = ficheDe(chantier.id);
                const r = f && f.statut === 'validee' ? resume(f) : null;
                const sub = r ? `Fiche ${f.modele} · ${esc(f.responsableNom)} à ${esc(f.heure || '')} · ${r.coches}/${r.aCocher} points`
                    : `Fiche ${esc(f?.modele || ficheConfig(chantier)?.modele || '')}${equipe.length ? ` · équipe prévue : ${equipe.map(esc).join(', ')}` : ''}`;
                return `<button type="button" class="fc-row${f && etat(f) === 'a_revoir' ? ' is-alert' : ''}" data-chantier="${esc(chantier.id)}"><div><b>${esc(chantier.name)}</b><small>${sub}</small></div><span class="fc-actions">${pastille(f, today)}</span></button>`;
            }).join('')}</div>` : `<p class="fc-sub">Aucun chantier avec fiche de contrôle n'est prévu aujourd'hui.</p>`}
        </section>

        <section class="space-y-3">
            <h3 class="kpi-label">Par chantier · toutes les fiches</h3>
            ${avecFiche.length ? `<div class="fc-list">${avecFiche.map(c => {
                const cfg = ficheConfig(c);
                const liste = parChantier.get(c.id) || [];
                const valides = liste.filter(f => f.statut === 'validee');
                const revoir = valides.filter(f => resume(f).R > 0).length;
                return `<button type="button" class="fc-row" data-chantier="${esc(c.id)}"><div><b>${esc(c.name)}</b>
                    <small>${MODELES[cfg.modele].titre}${cfg.zone ? ` · ${esc(cfg.zone)}` : ''}</small></div>
                    <span class="fc-actions"><span class="fc-pill">${valides.length} fiche${valides.length > 1 ? 's' : ''} en ${JOURS_RESUME} jours</span>${valides[0] ? `<span class="fc-pill">dernière le ${dateFr(valides[0].date)}</span>` : ''}${revoir ? `<span class="fc-pill warn">${revoir} avec un point à revoir</span>` : ''}</span></button>`;
            }).join('')}</div>` : ''}
            <p class="fc-sub">${sansFiche ? `${sansFiche} chantier${sansFiche > 1 ? 's' : ''} sans fiche. ` : ''}Le modèle de fiche se règle dans <button type="button" class="link fc-link" id="goChantiers">Chantiers</button> → modifier le chantier → « Fiche de contrôle ».</p>
        </section>
    </div>`;

    pageContent.querySelectorAll('[data-chantier]').forEach(b => b.onclick = () => navigateTo('admin-fiches', { chantierId: b.dataset.chantier }));
    document.getElementById('goChantiers').onclick = () => navigateTo('admin-chantiers');
<<<<<<< HEAD
    document.getElementById('goClasser').onclick = () => navigateTo('admin-fiches', { vue: 'classer' });
}

/* ---------- Classer les chantiers : un modèle par chantier, en un toucher ---------- */
let classerChantiers = [];
let classerFiltre = 'tous';
let classerTexte = '';
async function renderClasser() {
    classerChantiers = await getActiveChantiers(true);
    const choix = [...Object.values(MODELES).map(m => [m.code, m.court]), ['', 'Pas de fiche']];
    pageContent.innerHTML = `
    <div class="max-w-4xl mx-auto space-y-5">
        <button type="button" class="link font-semibold fc-back" id="backFiches">&larr; Fiches de contrôle</button>
        <div>
            <h2 class="text-2xl font-bold">Classer les chantiers</h2>
            <p class="fc-sub">Touchez le bon modèle pour chaque chantier : c'est enregistré tout de suite. ${choix.slice(0, 3).map(([c, n]) => `<b>${c}</b> ${esc(n.toLowerCase())}`).join(' · ')}. Votre choix n'est jamais remplacé automatiquement.</p>
        </div>
        <div class="hours-toolbar">
            <div class="hours-search">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
                <input type="search" id="classerRecherche" placeholder="Rechercher un chantier…" autocomplete="off" value="${esc(classerTexte)}">
            </div>
            <div class="segmented" role="group" aria-label="Filtre">
                ${[['tous', 'Tous'], ['A1', 'A1'], ['A2', 'A2'], ['B1', 'B1'], ['aucune', 'Sans fiche']].map(([v, l]) =>
                    `<button type="button" data-filtre="${v}" class="${classerFiltre === v ? 'is-active' : ''}" aria-pressed="${classerFiltre === v}">${l}</button>`).join('')}
            </div>
        </div>
        <div class="fc-count" id="classerCompte" style="flex-wrap:wrap"></div>
        <div class="fc-list" id="classerListe"></div>
    </div>`;
    document.getElementById('backFiches').onclick = () => navigateTo('admin-fiches');
    document.getElementById('classerRecherche').oninput = (e) => { classerTexte = e.target.value; dessinerClasser(); };
    pageContent.querySelectorAll('[data-filtre]').forEach(b => b.onclick = () => {
        classerFiltre = b.dataset.filtre;
        pageContent.querySelectorAll('[data-filtre]').forEach(x => { x.classList.toggle('is-active', x === b); x.setAttribute('aria-pressed', String(x === b)); });
        dessinerClasser();
    });
    dessinerClasser();
}

function dessinerClasser() {
    const liste = document.getElementById('classerListe');
    if (!liste) return;
    const t = classerTexte.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const visibles = classerChantiers.filter(c => {
        const m = ficheConfig(c)?.modele || 'aucune';
        if (classerFiltre !== 'tous' && m !== classerFiltre) return false;
        return !t || String(c.name).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(t);
    });
    const compte = (code) => classerChantiers.filter(c => (ficheConfig(c)?.modele || 'aucune') === code).length;
    document.getElementById('classerCompte').innerHTML = `<span><b>${visibles.length}</b> chantier${visibles.length > 1 ? 's' : ''}</span><span class="fc-sub">A1 : ${compte('A1')} · A2 : ${compte('A2')} · B1 : ${compte('B1')} · sans fiche : ${compte('aucune')}</span>`;
    liste.innerHTML = visibles.length ? visibles.map(c => {
        const actuel = ficheConfig(c)?.modele || '';
        return `<div class="fc-row" style="cursor:default"><div><b>${esc(c.name)}</b><small>${esc(c.address || 'Adresse non renseignée')}</small></div>
            <div class="wp-chips" role="group" aria-label="Fiche de ${esc(c.name)}">${[...Object.keys(MODELES), ''].map(code =>
                `<button type="button" class="wp-chip" data-classer="${esc(c.id)}" data-modele="${code}" aria-pressed="${actuel === code}" title="${code ? esc(MODELES[code].titre) : 'Pas de fiche de contrôle'}">${code || 'Aucune'}</button>`).join('')}</div></div>`;
    }).join('') : `<p class="fc-sub">Aucun chantier ne correspond.</p>`;
    liste.querySelectorAll('[data-classer]').forEach(b => b.onclick = () => classer(b.dataset.classer, b.dataset.modele || null, b));
}

async function classer(chantierId, modele, bouton) {
    const c = classerChantiers.find(x => x.id === chantierId);
    if (!c) return;
    const avant = ficheConfig(c);
    if ((avant?.modele || null) === modele) return;
    // Nouveau modèle : la zone est gardée, les lignes hors prestation sont remises à zéro (ce ne sont plus les mêmes)
    const valeur = modele ? { modele, zone: avant?.zone || '', horsPrestation: avant?.modele === modele ? avant.horsPrestation : [] } : null;
    const ancien = c.ficheControle;
    c.ficheControle = valeur;
    dessinerClasser();
    try {
        await updateDoc(doc(db, 'chantiers', chantierId), { ficheControle: valeur });
        getActiveChantiers(true).catch(() => {});
        showToast(`${c.name} : ${modele ? `fiche ${modele}` : 'pas de fiche'}.`, 'success');
    } catch (error) {
        console.error('Classement du chantier :', error);
        c.ficheControle = ancien;
        dessinerClasser();
        showInfoModal('Erreur', "Le classement n'a pas pu être enregistré. Vérifiez la connexion et réessayez.");
    }
=======
>>>>>>> 26d3b52bc99c33b56ecebf3aa3633ba6caa06486
}

/* ---------- Un chantier : toutes ses fiches, en détail ---------- */
let fichesAffichees = [];
async function renderChantier(chantierId) {
    const [chantiers, fiches] = await Promise.all([getActiveChantiers(), fichesDuChantier(chantierId)]);
    const chantier = chantiers.find(c => c.id === chantierId);
    const nom = chantier?.name || fiches[0]?.chantierName || 'Chantier';
    const cfg = ficheConfig(chantier);
    fichesAffichees = fiches;
    const valides = fiches.filter(f => f.statut === 'validee');
    const revoir = valides.filter(f => resume(f).R > 0).length;

    pageContent.innerHTML = `
    <div class="max-w-4xl mx-auto space-y-6">
        <button type="button" class="link font-semibold fc-back" id="backFiches">&larr; Toutes les fiches</button>
        <div>
            <p class="kpi-label">Fiches de contrôle</p>
            <h2 class="text-2xl font-bold">${esc(nom)}</h2>
            <p class="fc-sub">${cfg ? `${MODELES[cfg.modele].titre}${cfg.zone ? ` · ${esc(cfg.zone)}` : ''}${cfg.horsPrestation.length ? ` · hors prestation : n° ${cfg.horsPrestation.join(', ')}` : ''}` : 'Pas de fiche réglée pour ce chantier actuellement.'}
            ${chantier?.email ? ` · envoyées à ${esc(chantier.email)}` : ' · <span class="fc-err">pas d\'e-mail client</span>'}</p>
        </div>
        <div class="fc-actions"><span class="fc-pill">${valides.length} fiche${valides.length > 1 ? 's' : ''} remplie${valides.length > 1 ? 's' : ''}</span>${revoir ? `<span class="fc-pill warn">${revoir} avec un point à revoir</span>` : ''}</div>
        ${fiches.length ? fiches.map((f, i) => ficheDetailHTML(f, i)).join('') : `<p class="fc-sub">Aucune fiche pour l'instant. La première sera créée au prochain pointage sur ce chantier.</p>`}
    </div>`;

    document.getElementById('backFiches').onclick = () => navigateTo('admin-fiches');
    pageContent.querySelectorAll('[data-apercu]').forEach(b => b.onclick = () => {
        const box = document.getElementById(`apercu-${b.dataset.apercu}`);
        const f = fichesAffichees[Number(b.dataset.apercu)];
        if (!box.innerHTML) box.innerHTML = apercuHTML(f);
        box.hidden = !box.hidden;
        b.textContent = box.hidden ? 'Voir la fiche' : 'Masquer la fiche';
    });
    pageContent.querySelectorAll('[data-pdf]').forEach(b => b.onclick = async () => {
        b.disabled = true;
        const label = b.textContent;
        b.textContent = 'Préparation…';
        try { await telechargerPdf(fichesAffichees[Number(b.dataset.pdf)]); }
        catch (e) { console.error('PDF de la fiche :', e); showInfoModal('Erreur', "Le PDF n'a pas pu être créé. Vérifiez la connexion et réessayez."); }
        finally { b.disabled = false; b.textContent = label; }
    });
}

function ficheDetailHTML(f, i) {
    const modele = MODELES[f.modele];
    if (!modele) return '';
    const validee = f.statut === 'validee';
    const rep = reponsesCompletes(f);
    const r = resume(f);
    const points = modele.points.map(([titre], k) => {
        const v = rep[k + 1];
        return `<li><span class="fc-dot ${v || ''}" title="${v ? LIBELLES[v] : 'Pas coché'}">${v ? (v === 'F' ? '✓' : v === 'R' ? '!' : 'S.O.') : '–'}</span><span>${k + 1}. ${esc(titre)}</span></li>`;
    }).join('');
    return `<article class="fc-card${etat(f) === 'a_revoir' ? ' is-todo' : ''}">
        <div class="fc-count" style="align-items:flex-start;flex-wrap:wrap">
            <div><p class="fc-title">${esc(jourLong(f.date))}</p>
            <p class="fc-sub">${validee ? `Remplie par ${esc(f.responsableNom)} à ${esc(f.heure || '')} · ${r.F} fait · ${r.R} à revoir · ${r.S} S.O.` : `Prévue pour ${esc(f.responsableNom || '—')}${(f.presents || []).length ? ` · sur place : ${f.presents.map(esc).join(', ')}` : ''}`}</p></div>
            <span class="fc-actions">${pastille(f)}</span>
        </div>
        ${validee ? `<ul class="fc-points" style="list-style:none;margin:0;padding:0">${points}</ul>
        ${f.observations ? `<p class="fc-obs${r.R ? ' is-warn' : ''}"><b>Observations :</b> ${esc(f.observations)}</p>` : ''}
        ${f.personnePrevenue || f.aCorrigerAvant ? `<p class="fc-sub">${f.personnePrevenue ? `Personne prévenue : <b>${esc(f.personnePrevenue)}</b>` : ''}${f.personnePrevenue && f.aCorrigerAvant ? ' · ' : ''}${f.aCorrigerAvant ? `À corriger avant le <b>${dateFr(f.aCorrigerAvant)}</b>` : ''}</p>` : ''}
        <div class="fc-actions"><button type="button" class="btn btn-secondary" data-apercu="${i}">Voir la fiche</button><button type="button" class="btn btn-secondary" data-pdf="${i}">Télécharger le PDF</button></div>
        <div id="apercu-${i}" hidden></div>` : ''}
    </article>`;
}

// Aperçu fidèle : l'image de la page du PDF d'origine, avec les valeurs posées sur ses champs
function apercuHTML(f) {
    const modele = MODELES[f.modele];
    const box = ([x1, y1, x2, y2]) => `left:${x1 / PAGE.largeur * 100}%;top:${(PAGE.hauteur - y2) / PAGE.hauteur * 100}%;width:${(x2 - x1) / PAGE.largeur * 100}%;height:${(y2 - y1) / PAGE.hauteur * 100}%`;
    const textes = Object.entries(champsTexte(f)).filter(([, v]) => v)
        .map(([nom, v]) => `<div class="fc-pdf-txt${nom === 'observations' ? ' is-multi' : ''}" style="${box(modele.champs[nom])}">${esc(v)}</div>`).join('');
    const rep = reponsesCompletes(f);
    const coches = Object.entries(rep).map(([n, v]) =>
        `<svg class="fc-pdf-chk" style="${box(caseRect(Number(n), v))}" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.2 8.6 6.4 12 13 3.6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`).join('');
    return `<div class="fc-pdf-page" role="img" aria-label="Fiche ${f.modele} remplie"><img src="./assets/fiches/${f.modele}.png" alt="" loading="lazy">${textes}${coches}</div>`;
}
