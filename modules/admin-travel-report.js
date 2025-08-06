// modules/admin-travel-report.js
import { collection, query, getDocs, orderBy, where } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent } from "../app.js";

export async function render() {
    pageContent.innerHTML = `
        <div class="max-w-4xl mx-auto">
            <h2 class="text-2xl font-bold mb-4">🚗 Rapport des Trajets</h2>
            <div class="bg-white p-4 rounded-lg shadow-sm">
                <table class="w-full text-left">
                    <thead>
                        <tr class="border-b">
                            <th class="p-2">Employé</th>
                            <th class="p-2">Total Kilomètres (ce mois-ci)</th>
                        </tr>
                    </thead>
                    <tbody id="report-body">
                        <tr><td colspan="2" class="p-4 text-center">Chargement...</td></tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;
    setTimeout(loadTravelReport, 0);
}

async function loadTravelReport() {
    const reportBody = document.getElementById('report-body');
    reportBody.innerHTML = '';

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const usersSnapshot = await getDocs(query(collection(db, "users"), orderBy("displayName")));
    const users = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const trajetsQuery = query(collection(db, "trajets"), where("date_creation", ">=", startOfMonth));
    const trajetsSnapshot = await getDocs(trajetsQuery);

    const travelByUser = {};
    trajetsSnapshot.forEach(doc => {
        const trajet = doc.data();
        travelByUser[trajet.id_utilisateur] = (travelByUser[trajet.id_utilisateur] || 0) + trajet.distance_km;
    });

    if (users.length === 0) {
        reportBody.innerHTML = `<tr><td colspan="2" class="p-4 text-center text-gray-500">Aucun utilisateur trouvé.</td></tr>`;
        return;
    }

    users.forEach(user => {
        const totalKm = travelByUser[user.uid] || 0;
        const row = document.createElement('tr');
        row.className = 'border-b';
        row.innerHTML = `
            <td class="p-2">${user.displayName}</td>
            <td class="p-2 font-semibold">${totalKm.toFixed(2)} km</td>
        `;
        reportBody.appendChild(row);
    });
}