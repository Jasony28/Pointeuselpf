import { isStealthMode } from "../app.js";
import { collection, query, where, orderBy, getDocs, writeBatch, doc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db } from "../app.js";
import { localDateKey, returnTripId } from "./trips.js";

// Listes de base (employés, chantiers, collègues) : gardées en mémoire quelques minutes au lieu d'être
// retéléchargées à chaque page. forceRefresh = true après une modification faite par l'admin.
const LISTS_TTL_MS = 5 * 60 * 1000;
let chantiersCache = null;
let allChantiersCache = null;
let teamMembersCache = null;
let usersCache = null;
let colleaguesCache = null;

const fresh = (entry) => entry && Date.now() - entry.at < LISTS_TTL_MS;
const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''));

/** Tous les chantiers (actifs ou non), triés par nom. */
export async function getAllChantiers(forceRefresh = false) {
    if (fresh(allChantiersCache) && !forceRefresh) return allChantiersCache.list;
    const snapshot = await getDocs(query(collection(db, "chantiers"), orderBy("name")));
    allChantiersCache = { at: Date.now(), list: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) };
    chantiersCache = null;
    return allChantiersCache.list;
}

export async function getActiveChantiers(forceRefresh = false) {
    if (chantiersCache && fresh(allChantiersCache) && !forceRefresh) return chantiersCache;
    const all = await getAllChantiers(forceRefresh);
    chantiersCache = all.filter(c => c.status === 'active').sort(byName);
    return chantiersCache;
}

/** Collègues hors appli (liste « colleagues »), triés par nom. */
export async function getColleagues(forceRefresh = false) {
    if (fresh(colleaguesCache) && !forceRefresh) return colleaguesCache.list;
    const snapshot = await getDocs(query(collection(db, "colleagues"), orderBy("name")));
    colleaguesCache = { at: Date.now(), list: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) };
    return colleaguesCache.list;
}

export async function getTeamMembers(forceRefresh = false) {
    if (!teamMembersCache || forceRefresh || !fresh(usersCache)) {
        const users = await getUsers(forceRefresh);
        teamMembersCache = users
            .filter(user => user.status === 'approved' && (user.role === 'user' || user.role === 'admin'))
            .map(user => ({ id: user.id, name: user.displayName, superAdmin: user.superAdmin === true }));
    }
    return teamMembersCache;
}

/** Tous les comptes, y compris ceux masqués (rapports admin). */
export async function getAllUsers(forceRefresh = false) {
    if (fresh(usersCache) && !forceRefresh) return usersCache.list;
    const snapshot = await getDocs(query(collection(db, "users"), orderBy("displayName")));
    usersCache = { at: Date.now(), list: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) };
    return usersCache.list;
}

export async function getUsers(forceRefresh = false) {
    const wasCached = fresh(usersCache) && !forceRefresh;
    const users = await getAllUsers(forceRefresh);
    // (comportement d'origine : la toute première lecture renvoie aussi les comptes masqués)
    if (!wasCached || isStealthMode()) return users;
    return users.filter(user => user.visibility !== 'hidden');
}

/** Noms des collègues + des comptes validés, sans doublon, triés (listes « avec qui ? »). */
export async function getColleagueNames() {
    const [colleagues, users] = await Promise.all([getColleagues(), getAllUsers()]);
    const names = [...colleagues.map(c => c.name), ...users.filter(u => u.status === 'approved').map(u => u.displayName)].filter(Boolean);
    return [...new Set(names)].sort((a, b) => a.localeCompare(b));
}

export async function transferOrDuplicateUserData(oldUid, newUid, copyMode = true, newDisplayName = null) {
    let batch = writeBatch(db);
    const verifiedDisplayName = newDisplayName || 'Utilisateur inconnu';
    const collectionsToMigrate = ['pointages', 'leaveRequests']; 
    let totalItemsProcessed = 0;
    let batchOpCount = 0;
    const copiedPointageIds = new Map(); // ancien pointage → copie (mode « Dupliquer »)

    for (const colName of collectionsToMigrate) {
        const colRef = collection(db, colName);
        const userField = colName === 'pointages' ? 'uid' : 'userId';
        const q = query(colRef, where(userField, "==", oldUid)); 
        const querySnapshot = await getDocs(q);

        for (const documentSnapshot of querySnapshot.docs) {
            const data = documentSnapshot.data();
            totalItemsProcessed++;
            batchOpCount++;

            if (copyMode) {
                const newDocRef = doc(collection(db, colName));
                if (colName === 'pointages') copiedPointageIds.set(documentSnapshot.id, newDocRef.id);
                const newData = { ...data, [userField]: newUid, duplicatedFrom: oldUid, updatedAt: new Date() };
                if (colName === 'pointages') newData.userName = verifiedDisplayName;
                batch.set(newDocRef, newData);
            } else {
                const docRef = doc(db, colName, documentSnapshot.id);
                const updateData = { [userField]: newUid }; 
                if (colName === 'pointages') updateData.userName = verifiedDisplayName;
                batch.update(docRef, updateData);
            }
            if (batchOpCount >= 400) { await batch.commit(); batch = writeBatch(db); batchOpCount = 0; }
        }
    }

    // Les trajets (km) suivent leurs pointages : sinon ils resteraient comptés à l'ancien employé
    const tripsSnapshot = await getDocs(query(collection(db, "trajets"), where("id_utilisateur", "==", oldUid)));
    for (const tripSnapshot of tripsSnapshot.docs) {
        const trip = tripSnapshot.data();
        const remap = (id) => (copyMode ? copiedPointageIds.get(id) : id) || id;
        const newTrip = { ...trip, id_utilisateur: newUid };
        if (trip.id_pointage_arrivee) newTrip.id_pointage_arrivee = remap(trip.id_pointage_arrivee);
        if (trip.id_pointage_depart) newTrip.id_pointage_depart = remap(trip.id_pointage_depart);
        // Le retour au dépôt a un identifiant par employé et par jour
        const day = trip.date_creation?.toDate ? localDateKey(trip.date_creation.toDate()) : null;
        const newId = trip.type === 'retour' && day ? returnTripId(newUid, day) : (copyMode ? doc(collection(db, "trajets")).id : tripSnapshot.id);
        batch.set(doc(db, "trajets", newId), newTrip);
        batchOpCount++;
        if (!copyMode && newId !== tripSnapshot.id) { batch.delete(tripSnapshot.ref); batchOpCount++; }
        if (batchOpCount >= 400) { await batch.commit(); batch = writeBatch(db); batchOpCount = 0; }
    }

    if (batchOpCount > 0) await batch.commit();
    return totalItemsProcessed > 0 ? { success: true, count: totalItemsProcessed } : { success: true, count: 0, message: "Aucune donnée trouvée." };
}

/**
 * Calcul haute précision basé sur le quota par passage (visite unique par jour)
 */
export async function getMissingHoursReport(startDate, endDate) {
    const reportList = [];
    
    try {
        const chantiers = await getActiveChantiers();
        const pointagesRef = collection(db, "pointages");
        
        const qPointages = query(
            pointagesRef, 
            where("timestamp", ">=", startDate.toISOString()), 
            where("timestamp", "<=", endDate.toISOString())
        );
        
        const snapshot = await getDocs(qPointages);
        const pointages = snapshot.docs.map(doc => doc.data());

        chantiers.forEach(chantier => {
            const heuresParPassage = parseFloat(chantier.totalHeuresPrevues) || 0;
            if (heuresParPassage <= 0) return;

            const pointagesDuChantier = pointages.filter(p => p.chantier === chantier.name);
            if (pointagesDuChantier.length === 0) return;

            // 1. Identifier les jours de passage uniques (pour avoir le nombre de visites)
            const joursUniques = new Set();
            pointagesDuChantier.forEach(p => joursUniques.add(p.timestamp.split('T')[0]));
            const nombreDePassages = joursUniques.size;

            // 2. Calcul du quota total attendu (en minutes)
            const quotaTotalMinutes = (nombreDePassages * heuresParPassage) * 60;

            // 3. Calcul du temps réel (précision absolue)
            const totalPreste = pointagesDuChantier.reduce((total, p) => {
                const start = new Date(p.timestamp);
                const end = new Date(p.endTime);
                const diffMinutes = (end.getTime() - start.getTime()) / 60000;
                return total + (diffMinutes > 0 ? diffMinutes : 0);
            }, 0);

            // 4. Si temps presté < quota, on affiche l'écart
            if (totalPreste < quotaTotalMinutes) {
                reportList.push({
                    chantierName: chantier.name,
                    minutesManquantes: Math.round(quotaTotalMinutes - totalPreste),
                    totalPreste: totalPreste,
                    quota: quotaTotalMinutes
                });
            }
        });

        reportList.sort((a, b) => b.minutesManquantes - a.minutesManquantes);
        return reportList;
    } catch (error) {
        console.error("Erreur calcul:", error);
        return [];
    }
}