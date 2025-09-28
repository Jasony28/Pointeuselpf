import { isStealthMode } from "../app.js";
import { collection, query, where, orderBy, getDocs } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db } from "../app.js";

let chantiersCache = null;
let teamMembersCache = null;
let usersCache = null;

export async function getActiveChantiers(forceRefresh = false) {
    if (chantiersCache && !forceRefresh) {
        return chantiersCache;
    }
    const q = query(collection(db, "chantiers"), where("status", "==", "active"), orderBy("name"));
    const snapshot = await getDocs(q);
    chantiersCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return chantiersCache;
}

export async function getTeamMembers(forceRefresh = false) {
    if (!teamMembersCache || forceRefresh) {
        const users = await getUsers(forceRefresh);
        teamMembersCache = users
            // La ligne ci-dessous est celle qui a été modifiée
            .filter(user => user.status === 'approved' && (user.role === 'user' || user.role === 'admin'))
            .map(user => ({ id: user.id, name: user.displayName }));
    }
    return teamMembersCache;
}
export async function getUsers(forceRefresh = false) {
    if (usersCache && !forceRefresh) {
        if (isStealthMode()) {
            return usersCache;
        }
        return usersCache.filter(user => user.visibility !== 'hidden');
    }

    const q = query(collection(db, "users"), orderBy("displayName"));
    const snapshot = await getDocs(q);
    usersCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    if (isStealthMode()) {
        return usersCache;
    }
    return usersCache.filter(user => user.visibility !== 'hidden');
}