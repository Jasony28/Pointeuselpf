// Affichage immédiat depuis la mémoire du téléphone, puis mise à jour quand le serveur répond.
// Firestore garde une copie locale des documents déjà lus (cache persistant, voir app.js) : on l'affiche
// tout de suite, et on réaffiche seulement si la réponse du serveur est différente.
// Une requête n'est servie depuis le cache que si elle a déjà été faite en entier sur cet appareil
// (sinon le cache pourrait n'en contenir qu'une partie et afficher un total faux le temps d'un instant).
import { getDocs, getDocsFromCache } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";

const SEEN_KEY = 'fastQueries';
const MAX_SEEN = 300;

function readSeen() {
    try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); } catch { return []; }
}
function markSeen(key) {
    try {
        const seen = readSeen().filter(k => k !== key);
        seen.push(key);
        localStorage.setItem(SEEN_KEY, JSON.stringify(seen.slice(-MAX_SEEN)));
    } catch { /* stockage indisponible : on lira le serveur à chaque fois */ }
}

// Identifiant stable d'une requête (collection + filtres)
function queryKey(q) {
    try { return JSON.stringify(q._query ?? q); } catch { return null; }
}

/**
 * Renvoie transform(résultat) le plus vite possible.
 * onUpdate(nouveauRésultat) est appelé plus tard si le serveur renvoie autre chose que le cache.
 */
export async function getDocsFast(q, transform, onUpdate) {
    const key = queryKey(q);
    const canUseCache = key && readSeen().includes(key);

    const fromServer = getDocs(q).then(snap => {
        if (key) markSeen(key);
        return transform(snap);
    });

    if (!canUseCache) return fromServer;
    let cached;
    try { cached = transform(await getDocsFromCache(q)); } catch { return fromServer; }

    fromServer.then(fresh => {
        if (JSON.stringify(fresh) !== JSON.stringify(cached)) onUpdate?.(fresh);
    }).catch(() => { /* hors ligne : on garde l'affichage du cache */ });
    return cached;
}
