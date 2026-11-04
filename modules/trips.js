// Trajets en voiture : calcul des km et du temps de route (Mapbox), partagé par le Planning et l'Historique.
//
// Un trajet « aller » relie le point de départ (dépôt ou chantier précédent du jour) au chantier
// d'un pointage. Un trajet « retour » relie le dernier chantier de la journée au dépôt.
import { collection, query, where, getDocs, doc, setDoc, deleteDoc, writeBatch, Timestamp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db } from "../app.js";

export const MAPBOX_ACCESS_TOKEN = "pk.eyJ1IjoiamFzb255MjgiLCJhIjoiY21lMDcyYWhzMDIyODJsczl0cmM0aTVjciJ9.V14cJXdBNoq3yAQTDeUg-A";
export const DEPOT_ADDRESS = "Marche-en-Famenne, Belgium";
// Chaque employé a ses km, comme s'il était conducteur (l'ancienne case « Je suis le conducteur » est ignorée).
// Le retour au dépôt n'est compté qu'à partir du 26 octobre 2026 (v3.8.0) : avant, il n'existait pas.
export const NEW_KM_RULES_SINCE = '2026-10-26';

// À partir de cette heure, la journée en cours est considérée comme terminée (trajet retour ajouté)
export const RETURN_TRIP_HOUR = 23;

const routeCache = new Map();

// --- Recherche d'adresse sur la carte ------------------------------------------------
// La carte renvoie plusieurs lieux possibles. On garde celui qui est dans la commune (ou le code postal)
// écrite dans l'adresse, de préférence à moins de 100 km du dépôt : « Rue du facteur 5 soy » doit tomber
// à Soy, pas dans une autre « rue du Facteur » à 130 km.
const DEPOT_COORDS = [5.3444, 50.2277];
const WORK_RADIUS_KM = 100;
const geocodeCache = new Map();
const normText = (s) => ` ${String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;

// Noms de la commune / localité / code postal d'un résultat de la carte
function featurePlaces(f) {
    const items = [...(f.context || [])];
    if ((f.place_type || []).some(t => ['place', 'locality', 'postcode', 'neighborhood'].includes(t))) items.push({ id: f.place_type[0] + '.', text: f.text });
    return {
        postcodes: items.filter(c => String(c.id).startsWith('postcode')).map(c => String(c.text)),
        names: items.filter(c => /^(place|locality|neighborhood)/.test(c.id)).map(c => c.text),
    };
}

// La commune écrite dans l'adresse correspond-elle à ce résultat ? (« Marche » ↔ « Marche-en-Famenne »)
function placeNameMatches(addressText, name) {
    const n = normText(name);
    if (n.trim().length < 3) return false;
    if (addressText.includes(n)) return true;
    const mainWord = n.trim().split(' ').find(w => w.length >= 4);
    return !!mainWord && addressText.includes(` ${mainWord} `);
}

export async function geocode(address) {
    if (geocodeCache.has(address)) return geocodeCache.get(address);
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${MAPBOX_ACCESS_TOKEN}&limit=5&country=BE&language=fr&proximity=${DEPOT_COORDS.join(',')}`;
    const data = await (await fetch(url)).json();
    const features = data.features || [];
    if (!features.length) return null;

    const text = normText(address);
    const postcode = (text.match(/ ([1-9]\d{3}) /) || [])[1] || null;
    const scored = features.map((f, index) => {
        const { postcodes, names } = featurePlaces(f);
        const postcodeOk = !!postcode && postcodes.includes(postcode);
        const nameOk = names.some(n => placeNameMatches(text, n));
        const near = crowDistanceKm(DEPOT_COORDS, f.center) <= WORK_RADIUS_KM;
        return { f, index, matched: postcodeOk || nameOk, score: (postcodeOk ? 4 : 0) + (nameOk ? 2 : 0) + (near ? 1 : 0) };
    });
    // Meilleur score ; à égalité, l'ordre de la carte (pertinence + proximité de Marche)
    const best = scored.sort((a, b) => b.score - a.score || a.index - b.index)[0];
    const result = {
        center: best.f.center,
        placeType: (best.f.place_type || [])[0] || '',
        placeName: best.f.place_name || '',
        relevance: best.f.relevance ?? 1,
        matched: best.matched, // false : la commune / le code postal de l'adresse n'a pas été reconnu
    };
    geocodeCache.set(address, result);
    return result;
}

async function getCoordinates(address) {
    const geo = await geocode(address);
    if (!geo) throw new Error(`Adresse non trouvée : ${address}`);
    return geo.center;
}

// Résultat détaillé de la recherche (la même que pour les trajets) : sert à contrôler les adresses
export const geocodeDetails = geocode;

// Distance à vol d'oiseau entre deux points [lng, lat], en km
export function crowDistanceKm([lng1, lat1], [lng2, lat2]) {
    const rad = (d) => d * Math.PI / 180;
    const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(a));
}

// Itinéraire en voiture entre deux adresses : distance en km et durée en minutes
export async function getDrivingRoute(startAddress, endAddress) {
    const key = `${startAddress}→${endAddress}`;
    if (routeCache.has(key)) return routeCache.get(key);
    const [a, b] = await Promise.all([getCoordinates(startAddress), getCoordinates(endAddress)]);
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${a.join(',')};${b.join(',')}?access_token=${MAPBOX_ACCESS_TOKEN}&geometries=geojson`;
    const data = await (await fetch(url)).json();
    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) throw new Error(data.message || "Itinéraire non trouvé.");
    const route = { distanceKm: parseFloat((data.routes[0].distance / 1000).toFixed(2)), durationMin: Math.round(data.routes[0].duration / 60) };
    routeCache.set(key, route);
    return route;
}

export function localDateKey(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function returnTripId(uid, dayKey) {
    return `retour_${uid}_${dayKey}`;
}

// La journée est-elle finie ? (jour passé, ou aujourd'hui à partir de 23 h)
export function isDayOver(dayKey, now = new Date()) {
    const today = localDateKey(now);
    return dayKey < today || (dayKey === today && now.getHours() >= RETURN_TRIP_HOUR);
}

// Adresses des chantiers, relues au plus tard toutes les 2 minutes (une adresse corrigée est vite prise en compte)
const ADDRESSES_TTL_MS = 2 * 60 * 1000;
let chantierAddresses = null;
let chantierAddressesAt = 0;
async function getChantierAddresses() {
    if (chantierAddresses && Date.now() - chantierAddressesAt < ADDRESSES_TTL_MS) return chantierAddresses;
    const snap = await getDocs(collection(db, "chantiers"));
    chantierAddresses = { byId: new Map(), byName: new Map() };
    chantierAddressesAt = Date.now();
    snap.forEach(d => {
        const c = d.data();
        if (!c.address) return;
        chantierAddresses.byId.set(d.id, c.address);
        if (c.name) chantierAddresses.byName.set(c.name, c.address);
    });
    return chantierAddresses;
}

// À appeler après la modification d'une adresse de chantier
export function clearTripCaches() {
    chantierAddresses = null;
    geocodeCache.clear();
    routeCache.clear();
}

// « Régularisation rapide » de la page Écarts d'heures : du temps ajouté au nom de l'admin, pas un déplacement
export const isRegularisation = (p) => p.userName === 'Régularisation' || /^\(Saisie Rapide/.test(p.notes || '');

async function addressOf(pointage) {
    const map = await getChantierAddresses();
    return (pointage.chantierId && map.byId.get(pointage.chantierId)) || map.byName.get(pointage.chantier) || null;
}

/**
 * Trajets qu'une journée devrait contenir (sans les km) : un aller vers chaque chantier qui change,
 * puis le retour au dépôt (seulement à partir du 26/10/2026, quand la journée est finie).
 * `pointages` : ceux de la journée, hors régularisations, triés par heure.
 * `existingIdFor(p)` : identifiant du trajet déjà enregistré vers ce pointage, s'il existe.
 */
async function plannedDayTrips(uid, dayKey, pointages, existingIdFor) {
    const oldRules = dayKey < NEW_KM_RULES_SINCE;
    const wanted = new Map();
    let from = DEPOT_ADDRESS;
    for (const p of pointages) {
        const to = await addressOf(p);
        if (!to) continue;
        if (to !== from) {
            const key = existingIdFor(p) || doc(collection(db, "trajets")).id;
            wanted.set(key, { id_utilisateur: uid, id_pointage_arrivee: p.id, adresse_depart: from, adresse_arrivee: to, date_creation: Timestamp.fromDate(new Date(p.timestamp)) });
        }
        from = to;
    }
    const last = pointages[pointages.length - 1];
    const allEnded = pointages.length > 0 && pointages.every(p => p.endTime);
    if (!oldRules && last && allEnded && isDayOver(dayKey) && from !== DEPOT_ADDRESS) {
        wanted.set(returnTripId(uid, dayKey), {
            id_utilisateur: uid, id_pointage_depart: last.id, type: 'retour', depart: last.chantier, arrivee: 'Dépôt',
            adresse_depart: from, adresse_arrivee: DEPOT_ADDRESS, date_creation: Timestamp.fromDate(new Date(last.endTime))
        });
    }
    return wanted;
}

/**
 * Recalcule tous les trajets d'une journée pour un employé, à partir de ses pointages.
 * Appelé quand un pointage est ajouté, modifié, déplacé ou supprimé depuis l'Historique.
 * Les trajets inchangés (mêmes adresses) sont gardés tels quels, sans nouvel appel à Mapbox,
 * sauf avec { force: true } (bouton « Recalculer les km » de l'admin).
 * Renvoie la liste des trajets de la journée si le recalcul a abouti, sinon false.
 */
export async function rebuildDayTrips(uid, dayKey, { force = false } = {}) {
    if (!uid || !dayKey || !navigator.onLine) return false;
    try {
        const dayStart = new Date(`${dayKey}T00:00:00`);
        const dayEnd = new Date(`${dayKey}T23:59:59`);
        const [pointagesSnap, tripsSnap] = await Promise.all([
            getDocs(query(collection(db, "pointages"), where("uid", "==", uid),
                where("timestamp", ">=", dayStart.toISOString()), where("timestamp", "<=", dayEnd.toISOString()))),
            getDocs(query(collection(db, "trajets"), where("id_utilisateur", "==", uid),
                where("date_creation", ">=", dayStart), where("date_creation", "<=", dayEnd))),
        ]);
        const pointages = pointagesSnap.docs.map(d => ({ id: d.id, ...d.data() }))
            .filter(p => !isRegularisation(p))
            .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const existing = new Map(tripsSnap.docs.map(d => [d.id, d.data()]));

        // Ce que la journée devrait contenir
        const wanted = await plannedDayTrips(uid, dayKey, pointages,
            (p) => [...existing].find(([, t]) => t.type !== 'retour' && t.id_pointage_arrivee === p.id)?.[0]);

        // Écriture : on garde ce qui n'a pas changé, on recalcule le reste, on supprime l'obsolète
        for (const [id, t] of wanted) {
            const old = existing.get(id);
            const same = old && old.adresse_depart === t.adresse_depart && old.adresse_arrivee === t.adresse_arrivee
                && old.id_pointage_arrivee === t.id_pointage_arrivee && old.id_pointage_depart === t.id_pointage_depart
                && old.distance_km > 0; // un ancien trajet « passager » à 0 km est recalculé
            if (same && !force) continue;
            const { distanceKm, durationMin } = await getDrivingRoute(t.adresse_depart, t.adresse_arrivee);
            await setDoc(doc(db, "trajets", id), { ...t, distance_km: distanceKm, duree_min: durationMin });
        }
        for (const id of existing.keys()) {
            if (!wanted.has(id)) await deleteDoc(doc(db, "trajets", id));
        }
        return [...wanted.keys()];
    } catch (error) {
        console.error("Erreur lors du recalcul des trajets du jour:", error);
        return false;
    }
}

/**
 * Journées (employé + jour) pointées entre deux dates, avec leurs pointages (hors régularisations,
 * triés par heure) : sert au recalcul des km de toute l'équipe. Une seule lecture des pointages.
 */
export async function findWorkedDays(start, end) {
    const snap = await getDocs(query(collection(db, "pointages"),
        where("timestamp", ">=", start.toISOString()), where("timestamp", "<=", end.toISOString())));
    const days = new Map();
    snap.forEach(d => {
        const p = { id: d.id, ...d.data() };
        if (!p.uid || !p.timestamp || isRegularisation(p)) return;
        const dayKey = localDateKey(p.timestamp);
        const key = `${p.uid}|${dayKey}`;
        if (!days.has(key)) days.set(key, { uid: p.uid, dayKey, pointages: [] });
        days.get(key).pointages.push(p);
    });
    const list = [...days.values()].sort((a, b) => a.dayKey.localeCompare(b.dayKey) || a.uid.localeCompare(b.uid));
    list.forEach(d => d.pointages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)));
    return list;
}

const timeOf = (v) => (v?.toDate ? v.toDate().getTime() : null);
const sameValue = (a, b) => (timeOf(a) !== null || timeOf(b) !== null) ? timeOf(a) === timeOf(b) : a === b;
const BATCH_LIMIT = 450; // Firestore : 500 écritures maximum par lot

/**
 * Recalcul des km de toute l'équipe, économe en Firebase :
 *  - les pointages viennent de findWorkedDays (déjà lus une fois) et les trajets de la période sont lus
 *    en une seule requête (au lieu de deux lectures par journée) ;
 *  - chaque trajet est recalculé avec la carte (un même itinéraire n'est demandé qu'une fois), mais n'est
 *    réécrit que si quelque chose a changé ; les trajets sans pointage sont supprimés ;
 *  - les écritures partent par lots, par paquets de journées : `onChunkDone(nextDayKey)` est appelé quand
 *    un paquet est enregistré (sert à reprendre plus tard un recalcul interrompu).
 * Renvoie { done, failed, written, deleted, unchanged }.
 */
export async function rebuildTripsBulk(days, range, { onProgress, onChunkDone, isCancelled = () => false, workers = 3, chunkSize = 40 } = {}) {
    const stats = { done: 0, failed: 0, written: 0, deleted: 0, unchanged: 0 };
    const snap = await getDocs(query(collection(db, "trajets"),
        where("date_creation", ">=", range.start), where("date_creation", "<=", range.end)));
    const existing = new Map(snap.docs.map(d => [d.id, d.data()]));
    const tripByArrival = new Map();
    existing.forEach((t, id) => { if (t.type !== 'retour' && t.id_pointage_arrivee) tripByArrival.set(t.id_pointage_arrivee, id); });
    const tripDayKey = (t) => t.date_creation?.toDate ? localDateKey(t.date_creation.toDate()) : null;
    const wantedIds = new Set();
    const failedDays = new Set();
    const rangeEndKey = localDateKey(range.end);

    for (let i = 0; i < days.length && !isCancelled(); i += chunkSize) {
        const chunk = days.slice(i, i + chunkSize);
        const writes = [];
        let next = 0, finished = 0;
        const worker = async () => {
            while (next < chunk.length && !isCancelled()) {
                const { uid, dayKey, pointages } = chunk[next++];
                try {
                    const wanted = await plannedDayTrips(uid, dayKey, pointages, (p) => tripByArrival.get(p.id));
                    for (const t of wanted.values()) {
                        const route = await getDrivingRoute(t.adresse_depart, t.adresse_arrivee);
                        t.distance_km = route.distanceKm;
                        t.duree_min = route.durationMin;
                    }
                    for (const [id, t] of wanted) {
                        wantedIds.add(id);
                        const old = existing.get(id);
                        if (old && Object.keys(t).every(k => sameValue(old[k], t[k]))) stats.unchanged++;
                        else writes.push([id, t]);
                    }
                    stats.done++;
                } catch (error) {
                    console.error(`Recalcul des trajets du ${dayKey} :`, error);
                    stats.failed++;
                    failedDays.add(`${uid}|${dayKey}`);
                }
                finished++;
                onProgress?.(stats);
            }
        };
        await Promise.all(Array.from({ length: Math.min(workers, chunk.length) }, worker));

        // Trajets sans pointage (pointage supprimé, déplacé, régularisation…) jusqu'au dernier jour du paquet
        const complete = finished === chunk.length;
        const isLastChunk = i + chunkSize >= days.length;
        const deletes = [];
        if (complete) {
            const lastKey = isLastChunk ? rangeEndKey : chunk[chunk.length - 1].dayKey;
            existing.forEach((t, id) => {
                const dk = tripDayKey(t);
                if (wantedIds.has(id) || !dk || dk > lastKey || failedDays.has(`${t.id_utilisateur}|${dk}`)) return;
                deletes.push(id);
            });
        }

        const ops = [...writes.map(([id, t]) => b => b.set(doc(db, "trajets", id), t)), ...deletes.map(id => b => b.delete(doc(db, "trajets", id)))];
        for (let j = 0; j < ops.length; j += BATCH_LIMIT) {
            const batch = writeBatch(db);
            ops.slice(j, j + BATCH_LIMIT).forEach(op => op(batch));
            await batch.commit();
        }
        writes.forEach(([id, t]) => existing.set(id, t));
        deletes.forEach(id => existing.delete(id));
        stats.written += writes.length;
        stats.deleted += deletes.length;
        if (complete) onChunkDone?.(isLastChunk ? null : days[i + chunkSize].dayKey);
    }
    return stats;
}

/**
 * Journées (employé + jour) dont un trajet part de cette adresse ou y arrive.
 * Sert à recalculer les km quand l'adresse d'un chantier est corrigée.
 */
export async function findDaysUsingAddress(address) {
    if (!address) return [];
    const [arrivals, departures] = await Promise.all([
        getDocs(query(collection(db, "trajets"), where("adresse_arrivee", "==", address))),
        getDocs(query(collection(db, "trajets"), where("adresse_depart", "==", address))),
    ]);
    const days = new Map();
    [...arrivals.docs, ...departures.docs].forEach(d => {
        const t = d.data();
        const date = t.date_creation?.toDate ? t.date_creation.toDate() : null;
        if (!t.id_utilisateur || !date) return;
        const dayKey = localDateKey(date);
        days.set(`${t.id_utilisateur}|${dayKey}`, { uid: t.id_utilisateur, dayKey });
    });
    return [...days.values()].sort((a, b) => b.dayKey.localeCompare(a.dayKey));
}
