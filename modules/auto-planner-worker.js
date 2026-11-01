/*
 Fichier: modules/auto-planner-worker.js
 Description: Exécute planWeek() hors du fil principal pour que l'écran ne fige jamais.
 Message reçu : les données de planWeek (Map transmises sous forme de tableaux [clé, valeur]).
*/
import { planWeek } from "./auto-planner.js";

self.onmessage = (event) => {
    try {
        const input = { ...event.data };
        input.affinities = new Map(input.affinities || []);
        input.durations = new Map(input.durations || []);
        self.postMessage({ ok: true, outcome: planWeek(input) });
    } catch (error) {
        self.postMessage({ ok: false, error: String(error?.message || error) });
    }
};
