/**
 * L'écran des adhérents ne contient AUCUN texte visible en dur.
 *
 * ⚠ La convention (CLAUDE.md, 10 septembre 2026) ne s'applique qu'au NEUF, et
 * cet écran est neuf : il y est donc soumis entièrement. Mais une convention
 * énoncée se contourne — la première chaîne écrite « juste pour aller vite »
 * passera à la relecture, et la suivante s'appuiera dessus.
 *
 * Le test lit les fichiers de l'écran et refuse toute chaîne de caractères qui
 * ressemble à une phrase destinée à un humain. Il tolère ce qui n'en est pas :
 * chemins, classes CSS, identifiants d'API, valeurs de formulaire.
 *
 * ⚠ Il ne remplace pas la relecture, il attrape ce qu'elle laisse passer.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const FICHIERS = [
  'app/admin/adherents/page.tsx',
  'app/admin/adherents/[id]/page.tsx',
];

/** Une chaîne littérale du source, avec sa ligne, hors imports et commentaires. */
function chainesLitterales(chemin: string): { ligne: number; valeur: string }[] {
  const source = readFileSync(join(process.cwd(), chemin), 'utf-8');
  const out: { ligne: number; valeur: string }[] = [];
  // ⚠ On suit l'ÉTAT « dans un commentaire » au lieu de juger chaque ligne pour
  // elle-même. Un commentaire JSX `{/* … */}` s'étale sur plusieurs lignes dont
  // les suivantes ne commencent par aucun marqueur : le détecteur y lisait de la
  // prose française, appariait les apostrophes de travers, et signalait
  // « était affiché plutôt qu » comme une phrase écrite en dur. Troisième fois
  // que cet instrument se trompe sur ce qu'il mesure.
  let dansCommentaire = false;
  source.split('\n').forEach((ligne, i) => {
    const nette = ligne.trim();
    if (dansCommentaire) {
      if (nette.includes('*/')) dansCommentaire = false;
      return;
    }
    if (nette.startsWith('{/*') || nette.startsWith('/*')) {
      if (!nette.includes('*/')) dansCommentaire = true;
      return;
    }
    if (nette.startsWith('//') || nette.startsWith('*')) return;
    if (nette.startsWith('import ')) return;
    // ⚠ Un balayage qui APPARIE les guillemets dans l'ordre, pas une expression
    // régulière. Sur `{ barcode: '', category: 'etudiant' }`, un motif
    // `'([^']+)'` repart du SECOND guillemet de la chaîne vide et invente une
    // chaîne « , category:  » qui n'existe pas. Le détecteur signalait alors du
    // code comme s'il s'agissait d'une phrase — un instrument qui fabrique ses
    // propres trouvailles est pire qu'un instrument aveugle.
    let j = 0;
    while (j < ligne.length) {
      const q = ligne[j];
      if (q !== "'" && q !== '"' && q !== '`') {
        j += 1;
        continue;
      }
      const fin = ligne.indexOf(q, j + 1);
      if (fin === -1) break;
      const valeur = ligne.slice(j + 1, fin);
      if (valeur.length >= 4) out.push({ ligne: i + 1, valeur });
      j = fin + 1;
    }
  });
  return out;
}

/**
 * Ce qui n'est PAS un texte destiné à un humain. La borne est la même que
 * celle de la convention : ce qui double un texte déjà visible, un chemin, un
 * identifiant technique, une classe CSS — jamais une phrase.
 */
function estTechnique(v: string): boolean {
  return (
    v.startsWith('/') || // chemins d'API et de routes
    v.startsWith('@/') ||
    /^[a-z-]+(\s+[a-z0-9:./[\]!-]+)*$/.test(v) === false // classes CSS : minuscules, tirets, deux-points
      ? /^[a-z]+\.[a-z]+$/.test(v) || // identifiants de fonctions (adherents.gerer)
        /^[A-Z0-9-]+$/.test(v) || // constantes, codes-barres d'exemple
        v === 'etudiant' ||
        /^(use client|POST|PATCH|DELETE|GET|date|button|submit|ghost|warning|error|success|ocre|text)$/.test(v)
      : true
  );
}

describe('textes de l’écran des adhérents', () => {
  for (const fichier of FICHIERS) {
    it(`${fichier} : le fichier est bien lu`, () => {
      // Témoin : un chemin erroné rendrait une liste vide et l'assertion
      // suivante serait vraie sans rien avoir regardé.
      expect(chainesLitterales(fichier).length).toBeGreaterThan(10);
    });

    it(`${fichier} : aucune phrase écrite en dur`, () => {
      const suspectes = chainesLitterales(fichier)
        .filter(({ valeur }) => !estTechnique(valeur))
        // Une phrase destinée à un humain contient une espace et une majuscule
        // ou un accent — le critère est grossier, et c'est voulu : il ne doit
        // pas manquer une phrase, quitte à demander une exception explicite.
        // ⚠ On juge le texte HORS interpolation. `` ` · ${T.validiteJusquau(d)}` ``
        // ne contient qu'un séparateur ; c'est le `T` de l'appel que le
        // détecteur prenait pour une majuscule de phrase. Un détecteur qui
        // signale du code correct finit par être désactivé, et c'est alors
        // qu'il ne sert plus à rien.
        .map(({ ligne, valeur }) => ({ ligne, valeur: valeur.replace(/\$\{[^}]*\}/g, '') }))
        .filter(({ valeur }) => / /.test(valeur) && /[A-ZÀ-Ÿéèêàùç]/.test(valeur));
      expect(suspectes.map((s) => `L${s.ligne} « ${s.valeur} »`)).toEqual([]);
    });
  }
});
