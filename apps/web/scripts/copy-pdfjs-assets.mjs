// Copie les ressources pdf.js de node_modules vers public/pdfjs/ (hooks
// predev/prebuild).
//
// Pourquoi hors bundling ? pdfjs-dist 5 ne passe pas dans webpack/Next 14 :
// au build, SWC échoue à parser le worker minifié (« 'import.meta' cannot be
// used outside of module code ») ; en dev, l'évaluation de pdf.mjs bundlé
// casse à l'exécution (« Object.defineProperty called on non-object »).
// pdf.js est donc chargé NATIVEMENT par le navigateur (import ESM dynamique,
// voir components/pdf-reader.tsx) depuis ces fichiers statiques — toujours
// auto-hébergés (pas de CDN, l'application doit fonctionner hors ligne).
//
// Pourquoi une copie automatisée plutôt que des fichiers commités ? pdf.js
// REFUSE de démarrer si les versions de l'API et du worker diffèrent —
// copier à chaque dev/build depuis node_modules garantit qu'une montée de
// version de pdfjs-dist ne désynchronise jamais l'ensemble. public/pdfjs/
// est ignoré par git.
//
// cmaps/standard_fonts/wasm/iccs : ressources chargées à la demande par le
// worker (polices CJK, décodage JPEG2000/JBIG2 des PDF scannés, profils
// ICC) — indispensables pour des thèses numérisées, pas seulement du PDF
// « propre ».
import { cpSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
// require.resolve('pdfjs-dist') → <racine du paquet>/build/pdf.mjs
const packageRoot = dirname(dirname(require.resolve('pdfjs-dist')));
const destination = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'pdfjs');

mkdirSync(destination, { recursive: true });
cpSync(join(packageRoot, 'build', 'pdf.min.mjs'), join(destination, 'pdf.min.mjs'));
cpSync(join(packageRoot, 'build', 'pdf.worker.min.mjs'), join(destination, 'pdf.worker.min.mjs'));
for (const dir of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
  cpSync(join(packageRoot, dir), join(destination, dir), { recursive: true });
}
console.log(`Ressources pdf.js copiées vers public/pdfjs/ (depuis ${packageRoot})`);
