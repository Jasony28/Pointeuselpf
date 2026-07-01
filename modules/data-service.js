import { isStealthMode } from "../app.js";
import { collection, query, where, orderBy, getDocs, writeBatch, doc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db } from "../app.js";

let chantiersCache = null;
let teamMembersCache = null;
let usersCache = null;

export async function getActiveChantiers(forceRefresh = false) {
    if (chantiersCache && !forceRefresh) return chantiersCache;
    const q = query(collection(db, "chantiers"), where("status", "==", "active"), orderBy("name"));
    const snapshot = await getDocs(q);
    chantiersCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return chantiersCache;
}

export async function getTeamMembers(forceRefresh = false) {
    if (!teamMembersCache || forceRefresh) {
        const users = await getUsers(forceRefresh);
        teamMembersCache = users
            .filter(user => user.status === 'approved' && (user.role === 'user' || user.role === 'admin'))
            .map(user => ({ id: user.id, name: user.displayName }));
    }
    return teamMembersCache;
}

export async function getUsers(forceRefresh = false) {
    if (usersCache && !forceRefresh) {
        if (isStealthMode()) return usersCache;
        return usersCache.filter(user => user.visibility !== 'hidden');
    }
    const q = query(collection(db, "users"), orderBy("displayName"));
    const snapshot = await getDocs(q);
    usersCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return usersCache;
}

export async function transferOrDuplicateUserData(oldUid, newUid, copyMode = true, newDisplayName = null) {
    let batch = writeBatch(db);
    const verifiedDisplayName = newDisplayName || 'Utilisateur inconnu';
    const collectionsToMigrate = ['pointages', 'leaveRequests']; 
    let totalItemsProcessed = 0;
    let batchOpCount = 0;

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