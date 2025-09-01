// On importe la fonction qui nous permet de savoir si le mode confidentiel est actif
import { isStealthMode } from "../app.js";
import { collection, query, where, orderBy, getDocs } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db } from "../app.js";

// Les variables de cache restent les mêmes
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
 * La liste est filtrée en fonction du Stealth Mode.
 * @param {boolean} forceRefresh - Si true, ignore le cache.
 * @returns {Promise<Array>}
 */
export async function getTeamMembers(forceRefresh = false) {
    if (teamMembersCache && !forceRefresh) {
        return teamMembersCache;
    }
    console.log("DataService: Chargement des membres d'équipe depuis Firestore...");
    const colleaguesQuery = query(collection(db, "colleagues"), orderBy("name"));
    
    // --- MODIFIÉ : La requête pour les utilisateurs dépend du Stealth Mode ---
    let usersQuery;
    if (isStealthMode()) {
        // En mode confidentiel, on prend tous les utilisateurs approuvés, même les invisibles
        usersQuery = query(collection(db, "users"), where("status", "==", "approved"), orderBy("displayName"));
    } else {
        // Sinon, on ne prend que les utilisateurs approuvés ET visibles
        usersQuery = query(collection(db, "users"), 
            where("status", "==", "approved"), 
            where("visibility", "!=", "hidden"), 
            orderBy("displayName")
        );
    }

    const [colleaguesSnapshot, usersSnapshot] = await Promise.all([
        getDocs(colleaguesQuery),
        getDocs(usersQuery)
    ]);

    const colleagueNames = colleaguesSnapshot.docs.map(doc => doc.data().name);
    const userNames = usersSnapshot.docs.map(doc => doc.data().displayName);
    
    let combinedNames;

    // --- MODIFIÉ : On n'ajoute les collègues externes que si on n'est PAS en mode confidentiel ---
    if (isStealthMode()) {
        combinedNames = [...new Set(userNames)].sort((a, b) => a.localeCompare(b));
    } else {
        combinedNames = [...new Set([...colleagueNames, ...userNames])].sort((a, b) => a.localeCompare(b));
    }
    
    teamMembersCache = combinedNames;
    return teamMembersCache;
}

/**
 * Récupère la liste de tous les utilisateurs (pour la gestion admin).
 * La liste est filtrée en fonction du Stealth Mode.
 * @param {boolean} forceRefresh - Si true, ignore le cache.
 * @returns {Promise<Array>}
 */
export async function getUsers(forceRefresh = false) {
    if (usersCache && !forceRefresh) {
        // --- MODIFIÉ : On filtre aussi les données déjà en cache ---
        if (isStealthMode()) {
            return usersCache; // En mode confidentiel, on retourne tout
        }
        // Sinon, on retourne uniquement les utilisateurs visibles
        return usersCache.filter(user => user.visibility !== 'hidden');
    }

    console.log("DataService: Chargement des utilisateurs depuis Firestore...");
    const q = query(collection(db, "users"), orderBy("displayName"));
    const snapshot = await getDocs(q);
    usersCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // --- MODIFIÉ : On filtre les nouvelles données avant de les retourner ---
    if (isStealthMode()) {
        return usersCache; // En mode confidentiel, on retourne tout
    }
    // Sinon, on retourne uniquement les utilisateurs visibles
    return usersCache.filter(user => user.visibility !== 'hidden');
}