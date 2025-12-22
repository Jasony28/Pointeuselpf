import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent } from "../app.js";
import { calculatePerfectRoute } from "./planning-optimizer.js";

export async function render() {
    // Date par défaut : Aujourd'hui
    const today = new Date().toISOString().split('T')[0];

    pageContent.innerHTML = `
        <div class="max-w-4xl mx-auto h-[calc(100vh-100px)] flex flex-col">
            <h2 class="text-2xl font-bold mb-4" style="color: var(--color-text-base);">✨ Optimiseur de Tournées (Intelligent)</h2>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 h-full pb-6">
                <div class="flex flex-col p-4 rounded shadow h-full" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                    <h3 class="font-bold mb-2" style="color: var(--color-text-base);">1. Configuration</h3>
                    
                    <div class="mb-4">
                        <label class="block text-sm font-bold mb-1" style="color: var(--color-text-muted);">Pour quelle date ?</label>
                        <input id="optDateInput" type="date" value="${today}" class="w-full border p-2 rounded" style="background-color: var(--color-background); border-color: var(--color-border); color: var(--color-text-base);">
                        <p class="text-xs mt-1 italic" style="color: var(--color-text-muted);">Le système ira chercher le nombre d'ouvriers prévus dans le planning ce jour-là.</p>
                    </div>

                    <div class="flex justify-between items-end mb-2">
                        <h3 class="font-bold text-sm" style="color: var(--color-text-base);">Chantiers actifs</h3>
                        <button id="refreshDataBtn" class="text-xs underline hover:text-purple-500" style="color: var(--color-text-muted);">Actualiser</button>
                    </div>

                    <div id="optimizer-list" class="overflow-y-auto flex-grow space-y-2 pr-2 mb-4">
                        <p style="color: var(--color-text-muted);">Chargement...</p>
                    </div>
                    
                    <button id="btn-calculate" class="mt-2 w-full text-white font-bold py-3 rounded shadow transition-opacity hover:opacity-90" style="background-color: var(--color-primary);">
                        🚀 Générer la Journée Parfaite
                    </button>
                </div>

                <div class="p-4 rounded shadow h-full overflow-y-auto" style="background-color: var(--color-background); border: 1px solid var(--color-border);">
                    <h3 class="font-bold mb-4" style="color: var(--color-text-base);">2. Résultat Optimisé</h3>
                    <div id="optimizer-result" class="space-y-0 relative ml-3 pl-4" style="border-left: 2px solid var(--color-border);">
                        <p class="text-sm" style="color: var(--color-text-muted);">Sélectionnez une date et des chantiers...</p>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Chargeurs d'événements
    const dateInput = document.getElementById('optDateInput');
    dateInput.onchange = () => loadDataContext(dateInput.value);
    document.getElementById('refreshDataBtn').onclick = () => loadDataContext(dateInput.value);
    document.getElementById('btn-calculate').onclick = runCalculation;

    // Chargement initial
    await loadDataContext(today);
}

let availableChantiers = [];
let planningMap = {}; // Stocke { chantierId: nombreOuvriers }

async function loadDataContext(dateStr) {
    const list = document.getElementById('optimizer-list');
    list.innerHTML = `<p style="color: var(--color-text-muted);">Récupération du planning du ${dateStr}...</p>`;

    try {
        // 1. Récupérer le planning pour cette date
        const qPlan = query(collection(db, "planning"), where("date", "==", dateStr));
        const snapPlan = await getDocs(qPlan);
        
        planningMap = {};
        snapPlan.forEach(doc => {
            const data = doc.data();
            // On compte le nombre de noms dans le tableau teamNames
            const teamSize = (data.teamNames && Array.isArray(data.teamNames)) ? data.teamNames.length : 0;
            // On stocke ça dans la map (Clé = ID Chantier, Valeur = Nb Personnes)
            if (data.chantierId) {
                // Si plusieurs tâches pour le même chantier, on prend le max ou on additionne (ici on écrase, souvent suffisant)
                planningMap[data.chantierId] = teamSize > 0 ? teamSize : 1; 
            }
        });

        // 2. Récupérer les chantiers actifs avec GPS
        const qChantier = query(collection(db, "chantiers"), where("status", "==", "active"));
        const snapChantier = await getDocs(qChantier);
        
        availableChantiers = [];
        snapChantier.forEach(doc => {
            const data = { id: doc.id, ...doc.data() };
            if(data.coordinates && data.coordinates.lat) {
                // On injecte directement le nombre de personnes prévu ce jour-là
                data.plannedTeamSize = planningMap[data.id] || 0; 
                availableChantiers.push(data);
            }
        });

        renderChantierList(list);

    } catch (e) {
        console.error(e);
        list.innerHTML = `<p class="text-red-500">Erreur de chargement.</p>`;
    }
}

function renderChantierList(container) {
    container.innerHTML = "";
    if(availableChantiers.length === 0) {
        container.innerHTML = `<div class="text-sm p-2 rounded border border-red-200 text-red-600" style="background-color: #fef2f2;">Aucun chantier actif avec GPS trouvé.</div>`;
        return;
    }

    // On trie : ceux prévus au planning en premier
    availableChantiers.sort((a, b) => b.plannedTeamSize - a.plannedTeamSize);

    availableChantiers.forEach(c => {
        const isPlanned = c.plannedTeamSize > 0;
        
        // Si c'est planifié, on coche par défaut
        const checkedState = isPlanned ? 'checked' : '';
        const borderClass = isPlanned ? 'border-l-4 border-l-purple-500' : 'border';
        const bgStyle = isPlanned ? 'background-color: var(--color-surface);' : 'background-color: var(--color-background); opacity: 0.8;';

        const div = document.createElement('label');
        div.className = `flex items-center gap-3 p-2 rounded cursor-pointer transition-colors ${borderClass}`;
        div.style.cssText = `${bgStyle} border-color: var(--color-border);`;
        
        div.innerHTML = `
            <input type="checkbox" value="${c.id}" class="opt-check w-5 h-5 rounded border-gray-300" style="accent-color: var(--color-primary);" ${checkedState}>
            <div class="flex-grow">
                <div class="flex justify-between items-center">
                    <span class="font-bold text-sm" style="color: var(--color-text-base);">${c.name}</span>
                    ${isPlanned 
                        ? `<span class="text-xs font-bold px-2 py-0.5 rounded bg-green-100 text-green-800">👤 ${c.plannedTeamSize} prévus</span>` 
                        : `<span class="text-xs text-gray-400">Non planifié</span>`
                    }
                </div>
                <div class="text-xs" style="color: var(--color-text-muted);">${c.totalHeuresPrevues || 0}h (totales) • ${c.address}</div>
                ${c.fixedAppointment ? `<div class="text-xs text-white inline-block px-1.5 py-0.5 rounded mt-1 font-bold" style="background-color: #ef4444;">RDV ${c.fixedAppointment}</div>` : ''}
            </div>
        `;
        container.appendChild(div);
    });
}

function runCalculation() {
    const checkedBoxes = document.querySelectorAll('.opt-check:checked');
    const selectedIds = Array.from(checkedBoxes).map(cb => cb.value);
    
    if(selectedIds.length === 0) return;

    const selection = availableChantiers.filter(c => selectedIds.includes(c.id));
    
    // On passe une MAP (Dictionnaire) des tailles d'équipe à l'algo
    // { "chantier_id_1": 3, "chantier_id_2": 1 }
    const teamSizeMap = {};
    selection.forEach(c => {
        // Si planifié > 0 on prend ça, sinon par défaut 1 personne
        teamSizeMap[c.id] = c.plannedTeamSize > 0 ? c.plannedTeamSize : 1;
    });

    const timeline = calculatePerfectRoute(selection, null, teamSizeMap);
    
    displayResult(timeline, teamSizeMap);
}

function displayResult(timeline, teamSizeMap) {
    const container = document.getElementById('optimizer-result');
    container.innerHTML = "";

    timeline.forEach(step => {
        const el = document.createElement('div');
        el.className = "mb-6 relative";
        
        if(step.type === 'job') {
            const nbWorkers = teamSizeMap[step.id] || 1;
            const realDurationDecimal = (step.totalHeuresPrevues / nbWorkers);
            
            const toHM = (dec) => {
                const h = Math.floor(dec);
                const m = Math.round((dec - h) * 60);
                return m > 0 ? `${h}h${m}` : `${h}h`;
            };

            el.innerHTML = `
                <div class="absolute -left-[23px] rounded-full w-4 h-4 mt-1 border-2 border-white shadow-sm" style="background-color: var(--color-primary);"></div>
                <div class="p-3 rounded shadow-sm border" style="background-color: var(--color-surface); border-color: var(--color-border);">
                    <div class="flex justify-between items-center mb-1">
                        <span class="font-bold text-sm" style="color: var(--color-primary);">${step.start} - ${step.end}</span>
                        <span class="text-xs font-bold px-2 py-1 rounded flex items-center gap-1" style="background-color: var(--color-background); color: var(--color-text-muted);">
                            ⏱️ ${toHM(realDurationDecimal)} (à ${nbWorkers} 👤)
                        </span>
                    </div>
                    <div class="font-bold text-lg" style="color: var(--color-text-base);">${step.name}</div>
                    <div class="text-xs" style="color: var(--color-text-muted);">${step.address}</div>
                    ${step.fixedAppointment ? `<div class="mt-2 text-xs text-red-500 font-bold flex items-center gap-1">🔒 RDV Impératif : ${step.fixedAppointment}</div>` : ''}
                </div>
            `;
        } else if (step.type === 'travel') {
            el.innerHTML = `
                <div class="text-xs italic flex items-center gap-2 my-2 ml-1" style="color: var(--color-text-muted);">
                    🚗 Trajet : ${step.duration} min
                </div>
            `;
        } else if (step.type === 'wait') {
             el.innerHTML = `
                <div class="text-xs italic flex items-center gap-2 my-2 ml-1 text-yellow-600 font-semibold">
                    ⏳ Attente : ${step.duration} min (RDV fixe)
                </div>
            `;
        }
        
        container.appendChild(el);
    });
}