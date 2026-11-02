// Bibliothèques lourdes (PDF, graphiques) chargées seulement au moment où on s'en sert :
// le démarrage de l'appli n'a plus à télécharger ni lire ~650 Ko de scripts.
// Versions figées (celles qui tournaient avant) : une nouvelle version ne peut pas casser l'appli sans prévenir.
import { applyChartDefaults } from "../app.js";
import { patchJsPdfForNativeApp } from "./native-files.js";

const PDF_URLS = [
    'https://cdn.jsdelivr.net/npm/jspdf@4.2.1/dist/jspdf.umd.min.js',
    'https://cdn.jsdelivr.net/npm/jspdf-autotable@5.0.9/dist/jspdf.plugin.autotable.min.js',
];
const CHART_URL = 'https://cdn.jsdelivr.net/npm/chart.js@4.6.1/dist/chart.umd.min.js';

const loading = new Map();

function loadScript(url) {
    if (!loading.has(url)) {
        loading.set(url, new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;
            script.async = true;
            script.onload = resolve;
            script.onerror = () => { loading.delete(url); script.remove(); reject(new Error(`Bibliothèque non chargée : ${url}`)); };
            document.head.appendChild(script);
        }));
    }
    return loading.get(url);
}

/** jsPDF + AutoTable (l'extension doit arriver après jsPDF). Renvoie window.jspdf. */
export async function loadPdf() {
    await loadScript(PDF_URLS[0]);
    await loadScript(PDF_URLS[1]);
    patchJsPdfForNativeApp();
    return window.jspdf;
}

/** Chart.js, aux couleurs et à la police du thème. Renvoie window.Chart. */
export async function loadChart() {
    await loadScript(CHART_URL);
    applyChartDefaults();
    return window.Chart;
}
