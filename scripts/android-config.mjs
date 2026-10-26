// Réglages propres à l'appli Android (appelé par la compilation GitHub, voir .github/workflows/android.yml).
//
// L'appli Android affiche le site en ligne (GitHub Pages) au lieu d'une copie embarquée :
// chaque mise à jour du site arrive dans l'appli sans republier sur le Play Store.
// Le fichier capacitor.config.json du dépôt n'est pas modifié (l'appli iPhone garde sa copie embarquée) :
// seul l'exemplaire de la compilation l'est.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SITE_URL = 'https://jasony28.github.io/Pointeuselpf/';

const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'capacitor.config.json');
const config = JSON.parse(readFileSync(file, 'utf8'));

config.server = { ...(config.server || {}), url: SITE_URL };
// Android 15 affiche les applis « bord à bord » : on garde l'appli sous la barre d'état, pas derrière
config.android = { ...(config.android || {}), adjustMarginsForEdgeToEdge: 'auto', backgroundColor: '#0f172a' };

writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
console.log('Configuration Android :', JSON.stringify(config, null, 2));
