// Fichiers (PDF, CSV) dans l'appli Android / iPhone (Capacitor).
//
// Dans l'appli installée, les téléchargements du navigateur ne fonctionnent pas : le fichier est
// enregistré sur le téléphone puis proposé dans le menu « Partager » (enregistrer, e-mail, WhatsApp…).
// Dans un navigateur, rien ne change.

const plugins = () => window.Capacitor?.Plugins || {};
const isNativeApp = () => !!window.Capacitor?.isNativePlatform?.() && !!plugins().Filesystem && !!plugins().Share;

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

async function shareFile(blob, fileName) {
    const { Filesystem, Share } = plugins();
    const safeName = String(fileName || 'document').replace(/[\\/:*?"<>|]+/g, '_');
    const { uri } = await Filesystem.writeFile({ path: safeName, data: await blobToBase64(blob), directory: 'CACHE' });
    await Share.share({ title: safeName, files: [uri] });
}

function reportError(error) {
    // L'utilisateur qui ferme le menu « Partager » n'est pas une erreur
    if (/cancel/i.test(String(error?.message || error))) return;
    console.error("Partage du fichier impossible :", error);
    alert("Le fichier n'a pas pu être enregistré sur le téléphone.");
}

export function installNativeFileSaving() {
    if (!isNativeApp()) return;

    // PDF : doc.save('nom.pdf') de jsPDF
    const patchJsPdf = () => {
        const api = window.jspdf?.jsPDF?.API;
        if (!api || api.__nativeSave) return;
        api.__nativeSave = true;
        api.save = function (fileName) {
            shareFile(this.output('blob'), fileName || 'document.pdf').catch(reportError);
            return this;
        };
    };
    patchJsPdf();
    window.addEventListener('load', patchJsPdf);

    // CSV et autres : liens <a download href="blob:…">
    document.addEventListener('click', (e) => {
        const link = e.target.closest?.('a[download]');
        if (!link || !/^(blob|data):/.test(link.href)) return;
        e.preventDefault();
        fetch(link.href).then(r => r.blob()).then(blob => shareFile(blob, link.download)).catch(reportError);
    }, true);
}
