// Fiches de contrôle : lectures et écritures Firestore, PDF rempli (logique pure : fiches-controle.js)
//
// fichesControle/{chantierId}_{AAAA-MM-JJ}
//   chantierId, chantierName, date, modele, zone, horsPrestation   (copiés du chantier à la première arrivée)
//   presents [noms, ordre d'arrivée], presentsUid { nom: uid }
//   responsableNom, responsableUid, statut 'a_remplir' | 'en_cours' | 'validee'
//   reponses { n: 'F' | 'R' | 'S' }, observations, personnePrevenue, aCorrigerAvant (AAAA-MM-JJ), heure (HH:MM), valideeLe
//   envoyeeLe, envoyeeA : posés par l'appli Les Petites Fées quand le PDF part avec le mail « Nettoyage effectué »
// fichesRotation/{chantierId} : { derniers: { nom: 'AAAA-MM-JJ' } } (dernière fiche remplie par chacun)
import { doc, getDoc, getDocs, setDoc, updateDoc, onSnapshot, runTransaction, collection, query, where, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, currentUser } from "../app.js";
import { FICHES, ROTATION, ficheConfig, ficheId, jourLocal, choisirResponsable, remplirPdf, nomFichierPdf } from "./fiches-controle.js";
import { loadPdfLib } from "./libs.js";

const ficheRef = (id) => doc(db, FICHES, id);

/**
 * Arrivée sur un chantier (début de pointage) : inscrit la personne et désigne qui remplit la fiche.
 * Tant que la fiche n'est pas ouverte, une arrivée plus « prioritaire » (rotation) peut la reprendre.
 * Hors ligne : écriture simple, envoyée au retour du réseau. Ne lève jamais d'erreur (le pointage passe avant).
 */
export async function noterArrivee(chantier, when = new Date()) {
    try {
        const cfg = ficheConfig(chantier);
        if (!cfg || !currentUser) return null;
        const jour = jourLocal(when);
        const id = ficheId(chantier.id, jour);
        const moi = currentUser.displayName || currentUser.email || 'Employé';
        let derniers = {};
        try { derniers = (await getDoc(doc(db, ROTATION, chantier.id))).data()?.derniers || {}; } catch { /* hors ligne : rotation sans historique */ }

        const prochain = (data) => {
            const presents = [...new Set([...(data?.presents || []), moi])];
            const presentsUid = { ...(data?.presentsUid || {}), [moi]: currentUser.uid };
            const verrouillee = data && (data.statut === 'en_cours' || data.statut === 'validee');
            const base = data ? {} : {
                chantierId: chantier.id, chantierName: chantier.name || '', date: jour,
                modele: cfg.modele, zone: cfg.zone, horsPrestation: cfg.horsPrestation,
                reponses: {}, observations: '', personnePrevenue: '', aCorrigerAvant: '', createdAt: serverTimestamp(),
            };
            const responsable = verrouillee ? null : choisirResponsable(presents, derniers);
            return {
                ...base, presents, presentsUid, updatedAt: serverTimestamp(),
                ...(responsable ? { responsableNom: responsable, responsableUid: presentsUid[responsable], statut: 'a_remplir' } : {}),
            };
        };

        if (navigator.onLine) {
            await runTransaction(db, async (tx) => {
                const snap = await tx.get(ficheRef(id));
                const data = snap.exists() ? snap.data() : null;
                if (data?.statut === 'validee') return; // déjà remplie : plus rien à changer
                if (data) tx.update(ficheRef(id), prochain(data));
                else tx.set(ficheRef(id), prochain(null));
            });
        } else {
            let data = null;
            try { const snap = await getDoc(ficheRef(id)); data = snap.exists() ? snap.data() : null; } catch { /* rien en mémoire */ }
            if (data?.statut === 'validee') return id;
            setDoc(ficheRef(id), prochain(data), { merge: true }).catch(e => console.error('Fiche de contrôle (hors ligne) :', e));
        }
        return id;
    } catch (error) {
        console.error('Fiche de contrôle : arrivée non notée', error);
        return null;
    }
}

/** Suit la fiche en direct (null si elle n'existe pas encore). Renvoie la fonction d'arrêt. */
export function suivreFiche(id, callback) {
    return onSnapshot(ficheRef(id), snap => callback(snap.exists() ? { id: snap.id, ...snap.data() } : null),
        error => { console.error('Fiche de contrôle :', error); callback(undefined); });
}

export async function lireFiche(id) {
    const snap = await getDoc(ficheRef(id));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** « Je la remplis à sa place » (le responsable n'est pas venu ou est parti) */
export function reprendreFiche(id) {
    const moi = currentUser.displayName || currentUser.email;
    return updateDoc(ficheRef(id), { responsableNom: moi, responsableUid: currentUser.uid, statut: 'en_cours', updatedAt: serverTimestamp() });
}

/** Ouverture par le responsable : la rotation ne peut plus la donner à quelqu'un d'autre */
export function ouvrirFiche(fiche) {
    if (fiche.statut !== 'a_remplir' || fiche.responsableUid !== currentUser.uid) return Promise.resolve();
    return updateDoc(ficheRef(fiche.id), { statut: 'en_cours', updatedAt: serverTimestamp() });
}

/** Validation : écrite tout de suite sur le téléphone, envoyée dès que le réseau le permet. */
export function validerFiche(fiche, saisie) {
    const now = new Date();
    const heure = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const moi = currentUser.displayName || currentUser.email;
    const ecriture = updateDoc(ficheRef(fiche.id), {
        reponses: saisie.reponses, observations: saisie.observations, personnePrevenue: saisie.personnePrevenue,
        aCorrigerAvant: saisie.aCorrigerAvant, heure, valideeLe: now.toISOString(),
        responsableNom: moi, responsableUid: currentUser.uid, statut: 'validee', updatedAt: serverTimestamp(),
    });
    setDoc(doc(db, ROTATION, fiche.chantierId), { derniers: { [moi]: fiche.date } }, { merge: true })
        .catch(e => console.error('Rotation des fiches :', e));
    return ecriture;
}

const parDateDesc = (a, b) => String(b.date).localeCompare(String(a.date));
export async function fichesDuJour(jour = jourLocal()) {
    const snap = await getDocs(query(collection(db, FICHES), where('date', '==', jour)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function fichesDuChantier(chantierId) {
    const snap = await getDocs(query(collection(db, FICHES), where('chantierId', '==', chantierId)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort(parDateDesc);
}
export async function fichesDepuis(jour) {
    const snap = await getDocs(query(collection(db, FICHES), where('date', '>=', jour)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort(parDateDesc);
}

/** PDF rempli (le PDF d'origine du modèle, avec les cases et les champs de la fiche) */
export async function pdfDeLaFiche(fiche) {
    const [PDFLib, modele] = await Promise.all([
        loadPdfLib(),
        fetch(new URL(`../assets/fiches/${fiche.modele}.pdf`, import.meta.url)).then(r => {
            if (!r.ok) throw new Error(`Modèle ${fiche.modele} introuvable`);
            return r.arrayBuffer();
        }),
    ]);
    return new Blob([await remplirPdf(PDFLib, modele, fiche)], { type: 'application/pdf' });
}

/** Télécharge le PDF (dans l'appli Android / iPhone : menu « Partager », via native-files.js) */
export async function telechargerPdf(fiche) {
    const url = URL.createObjectURL(await pdfDeLaFiche(fiche));
    const a = document.createElement('a');
    a.href = url;
    a.download = nomFichierPdf(fiche);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
}
