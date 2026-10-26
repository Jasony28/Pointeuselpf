// Trajets en voiture : calcul des km et du temps de route (Mapbox), partagé par le Planning et l'Historique.
//
// Un trajet « aller » relie le point de départ (dépôt ou chantier précédent du jour) au chantier
// d'un pointage. Un trajet « retour » relie le dernier chantier de la journée au dépôt.
import { collection, query, where, getDocs, doc, setDoc, deleteDoc, Timestamp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db } from "../app.js";

export const MAPBOX_ACCESS_TOKEN = "pk.eyJ1IjoiamFzb255MjgiLCJhIjoiY21lMDcyYWhzMDIyODJsczl0cmM0aTVjciJ9.V14cJXdBNoq3yAQTDeUg-A";
export const DEPOT_ADDRESS = "Marche-en-Famenne, Belgium";
// À partir de cette heure, la journée en cours est considérée comme terminée (trajet retour ajouté)
export const RETURN_TRIP_HOUR = 23;

const coordsCache = new Map();
const routeCache = new Map();

async function getCoordinates(address) {
    if (coordsCache.has(address)) return coordsCache.get(address);
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${MAPBOX_ACCESS_TOKEN}&limit=1&country=BE`;
    const data = await (await fetch(url)).json();
    if (!data.features || data.features.length === 0) throw new Error(`Adresse non trouvée : ${address}`);
    coordsCache.set(address, data.features[0].center);
    return data.features[0].center;
}

// Résultat détaillé du géocodage (même recherche que pour les trajets) : sert à contrôler les adresses
export async function geocodeDetails(address) {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${MAPBOX_ACCESS_TOKEN}&limit=1&country=BE`;
    const data = await (await fetch(url)).json();
    const f = data.features && data.features[0];
    if (!f) return null;
    coordsCache.set(address, f.center);
    return { center: f.center, placeType: (f.place_type || [])[0] || '', placeName: f.place_name || '', relevance: f.relevance ?? 1 };
}

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
    coordsCache.clear();
    routeCache.clear();
}

async function addressOf(pointage) {
    const map = await getChantierAddresses();
    return (pointage.chantierId && map.byId.get(pointage.chantierId)) || map.byName.get(pointage.chantier) || null;
}

/**
 * Recalcule tous les trajets d'une journée pour un employé, à partir de ses pointages.
 * Appelé quand un pointage est ajouté, modifié, déplacé ou supprimé depuis l'Historique.
 * Les trajets inchangés (mêmes adresses) sont gardés tels quels, sans nouvel appel à Mapbox,
 * sauf avec { force: true } (bouton « Recalculer les km » de l'admin).
 * Renvoie true si le recalcul a abouti.
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
            .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const existing = new Map(tripsSnap.docs.map(d => [d.id, d.data()]));

        // Ce que la journée devrait contenir
        const wanted = new Map();
        let from = DEPOT_ADDRESS;
        for (const p of pointages) {
            const to = await addressOf(p);
            if (!to) continue;
            if (to !== from) {
                const key = [...existing].find(([, t]) => t.type !== 'retour' && t.id_pointage_arrivee === p.id)?.[0] || doc(collection(db, "trajets")).id;
                wanted.set(key, { id_utilisateur: uid, id_pointage_arrivee: p.id, adresse_depart: from, adresse_arrivee: to, date_creation: Timestamp.fromDate(new Date(p.timestamp)) });
            }
            from = to;
        }
        const last = pointages[pointages.length - 1];
        const allEnded = pointages.length > 0 && pointages.every(p => p.endTime);
        if (last && allEnded && isDayOver(dayKey) && from !== DEPOT_ADDRESS) {
            wanted.set(returnTripId(uid, dayKey), {
                id_utilisateur: uid, id_pointage_depart: last.id, type: 'retour', depart: last.chantier, arrivee: 'Dépôt',
                adresse_depart: from, adresse_arrivee: DEPOT_ADDRESS, date_creation: Timestamp.fromDate(new Date(last.endTime))
            });
        }

        // Écriture : on garde ce qui n'a pas changé, on recalcule le reste, on supprime l'obsolète
        for (const [id, t] of wanted) {
            const old = existing.get(id);
            const same = old && old.adresse_depart === t.adresse_depart && old.adresse_arrivee === t.adresse_arrivee
                && old.id_pointage_arrivee === t.id_pointage_arrivee && old.id_pointage_depart === t.id_pointage_depart;
            if (same && !force) continue;
            const { distanceKm, durationMin } = await getDrivingRoute(t.adresse_depart, t.adresse_arrivee);
            await setDoc(doc(db, "trajets", id), { ...t, distance_km: distanceKm, duree_min: durationMin });
        }
        for (const id of existing.keys()) {
            if (!wanted.has(id)) await deleteDoc(doc(db, "trajets", id));
        }
        return true;
    } catch (error) {
        console.error("Erreur lors du recalcul des trajets du jour:", error);
        return false;
    }
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
