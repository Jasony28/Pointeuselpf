// modules/data-service.js

import { collection, query, where, orderBy, getDocs } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db } from "../app.js";

// On utilise des variables pour garder les données en cache pendant la session de l'utilisateur.
let chantiersCache = null;
let teamMembersCache = null;
let usersCache = null;

/**
 * Récupère la liste des chantiers actifs.
 * Utilise un cache pour éviter les lectures répétées sur Firestore.
 * @param {boolean} forceRefresh - Si true, ignore le cache et recharge depuis Firestore.
 * @returns {Promise<Array>}
 */
export async function getActiveChantiers(forceRefresh = false) {
    if (chantiersCache && !forceRefresh) {
        return chantiersCache;
    }
    console.log("DataService: Chargement des chantiers depuis Firestore...");
    const q = query(collection(db, "chantiers"), where("status", "==", "active"), orderBy("name"));
    const snapshot = await getDocs(q);
    chantiersCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return chantiersCache;
}

/**
 * Récupère la liste de tous les membres d'équipe (utilisateurs approuvés + collègues).
 * @param {boolean} forceRefresh - Si true, ignore le cache.
 * @returns {Promise<Array>}
 */
export async function getTeamMembers(forceRefresh = false) {
    if (teamMembersCache && !forceRefresh) {
        return teamMembersCache;
    }
    console.log("DataService: Chargement des membres d'équipe depuis Firestore...");
    const colleaguesQuery = query(collection(db, "colleagues"), orderBy("name"));
    const usersQuery = query(collection(db, "users"), where("status", "==", "approved"), orderBy("displayName"));

    const [colleaguesSnapshot, usersSnapshot] = await Promise.all([
        getDocs(colleaguesQuery),
        getDocs(usersQuery)
    ]);

    const colleagueNames = colleaguesSnapshot.docs.map(doc => doc.data().name);
    const userNames = usersSnapshot.docs.map(doc => doc.data().displayName);

    // Combine et dédoublonne les listes, puis trie alphabétiquement.
    teamMembersCache = [...new Set([...colleagueNames, ...userNames])].sort((a, b) => a.localeCompare(b));
    return teamMembersCache;
}

/**
 * Récupère la liste de tous les utilisateurs (pour la gestion admin).
 * @param {boolean} forceRefresh - Si true, ignore le cache.
 * @returns {Promise<Array>}
 */
export async function getUsers(forceRefresh = false) {
    if (usersCache && !forceRefresh) {
        return usersCache;
    }
    console.log("DataService: Chargement des utilisateurs depuis Firestore...");
    const q = query(collection(db, "users"), orderBy("displayName"));
    const snapshot = await getDocs(q);
    usersCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return usersCache;
}