// Prépare le dossier "www" utilisé par les applis iPhone / Android (Capacitor).
// Copie uniquement les fichiers de l'application (pas node_modules, ios, android…).
// Usage : npm run build
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'www');

const entries = [
    'index.html',
    'app.js',
    'splash.js',
    'sw.js',
    'manifest.json',
    'maincoon1.jpg',
    'maincoon3.jpg',
    'styles',
    'modules',
    'icons',
];

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

for (const entry of entries) {
    const source = join(root, entry);
    if (!existsSync(source)) {
        console.warn(`(ignoré, introuvable) ${entry}`);
        continue;
    }
    cpSync(source, join(out, entry), { recursive: true });
    console.log(`copié  ${entry}`);
}

console.log('\nDossier www prêt.');
