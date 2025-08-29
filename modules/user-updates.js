// modules/user-updates.js

import { collection, query, orderBy, getDocs } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent } from "../app.js";

export async function render() {
    pageContent.innerHTML = `
        <div class="max-w-3xl mx-auto space-y-4">
            <h2 class="text-2xl font-bold">ℹ️ Mises à Jour des Chantiers</h2>
            <p class="text-gray-600">Retrouvez ici les dernières informations et consignes importantes pour chaque chantier.</p>
            <div id="updates-list" class="space-y-4">
                <p>Chargement des mises à jour...</p>
            </div>
        </div>
    `;

    setTimeout(loadUpdates, 0);
}

async function loadUpdates() {
    const listContainer = document.getElementById('updates-list');
    listContainer.innerHTML = '';

    try {
        const q = query(collection(db, "chantierUpdates"), orderBy("updatedAt", "desc"));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            listContainer.innerHTML = '<p class="text-center text-gray-500">Aucune mise à jour de chantier pour le moment.</p>';
            return;
        }

        snapshot.forEach(doc => {
            const update = doc.data();
            if (update.content) {
                const card = document.createElement('div');
                card.className = 'bg-white rounded-lg shadow-sm overflow-hidden'; // overflow-hidden est une bonne pratique ici

                const updateDate = update.updatedAt ? new Date(update.updatedAt.seconds * 1000).toLocaleString('fr-FR') : 'Date inconnue';

                // On sépare l'en-tête (cliquable) du contenu (caché)
                card.innerHTML = `
                    <div class="update-header p-4 cursor-pointer hover:bg-gray-50 border-b">
                        <h3 class="text-xl font-bold text-purple-700 pointer-events-none">${update.chantierName}</h3>
                        <p class="text-xs text-gray-500 pointer-events-none">Dernière mise à jour par ${update.updatedBy} le ${updateDate}</p>
                    </div>
                    <div class="update-content p-4 hidden">
                        <div class="prose max-w-none whitespace-pre-wrap">${update.content}</div>
                    </div>
                `;
                listContainer.appendChild(card);
            }
        });

        // On ajoute la logique pour déplier/replier au clic
        document.querySelectorAll('.update-header').forEach(header => {
            header.addEventListener('click', () => {
                const content = header.nextElementSibling;
                content.classList.toggle('hidden');
            });
        });

    } catch (error) {
        console.error("Erreur de chargement des mises à jour:", error);
        listContainer.innerHTML = '<p class="text-center text-red-500">Impossible de charger les informations.</p>';
    }
}