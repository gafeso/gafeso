/**
 * ⚠ CE QUI S'IMPRIME EST UN DOCUMENT, PAS UNE CAPTURE D'ÉCRAN.
 *
 * Mesuré le 15 septembre 2026 en recettant le rapport annuel — le geste même du
 * script de démonstration. À l'impression, la page emportait **deux barres de
 * navigation, deux en-têtes, dix liens et le bouton du menu**.
 *
 * Ce rapport est ce qu'une directrice remet à son université. Imprimé avec les
 * menus de l'application autour, ce n'est plus un document : c'est une capture
 * d'écran de logiciel, et ça se voit au premier coup d'œil.
 *
 * ⚠ LA RÈGLE EST GÉNÉRALE, pas propre au rapport : imprimer un écran, c'est
 * vouloir son CONTENU. Aucun écran n'a besoin de ses menus sur le papier. Le
 * marquage vit donc dans la coque et dans l'en-tête, pas dans le rapport.
 *
 * ⚠ CE QUE CE GARDE NE PEUT PAS FAIRE, et c'est mesuré : il lit la SOURCE. Il
 * ne rend pas la page et ne peut donc pas dire ce qu'un navigateur imprimerait.
 * La vérification par émulation des règles `@media print` a été faite à
 * l'écran ; ici on tient seulement que le marquage ne DISPARAISSE pas.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const lire = (f: string) => readFileSync(resolve(__dirname, '..', f), 'utf-8');

/** La coque du personnel et l'en-tête du produit : tout ce qui entoure un écran. */
const CHROME = [
  'components/header.tsx',
  'components/admin-shell.tsx',
  'components/lien-evitement.tsx',
] as const;

describe('la coque ne s’imprime pas', () => {
  it.each(CHROME)('%s marque ses repères `print:hidden`', (fichier) => {
    expect(
      lire(fichier),
      `${fichier} entoure les écrans : ses barres et son en-tête ne doivent pas ` +
        `figurer sur une page imprimée. Marquez-les \`print:hidden\`.`,
    ).toContain('print:hidden');
  });

/** ⚠ Un commentaire qui PARLE du marquage n'est pas un marquage. */
const sansCommentaires = (source: string) =>
  source
    .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');

const marqueurs = (fichier: string) =>
  (sansCommentaires(lire(fichier)).match(/print:hidden/g) ?? []).length;

describe('le compte des repères', () => {
  it('⚠ témoin de COMPTE : cinq repères marqués, et on sait lesquels', () => {
    // Un compte, pas une présence : le jour où une sixième barre apparaît, ce
    // test convoque quelqu'un pour décider si elle s'imprime.
    //
    // ⚠ Il est passé de QUATRE à CINQ le 15 septembre 2026, et c'est lui qui
    // m'y a ramené : `print:hidden` était posé sur le `nav` de la barre de
    // section, pas sur l'`aside` qui le contient — or le TITRE de la section
    // vit au-dessus du `nav`. Le rapport annuel imprimé commençait donc par le
    // mot « Statistiques », seul, avant le nom de l'établissement.
    expect(CHROME.reduce((n, f) => n + marqueurs(f), 0)).toBe(5);
  });

  it('⚠ la barre de section se cache par son ASIDE, pas par son `nav`', () => {
    // Le titre de section n'est pas dans le `nav`. Marquer le `nav` seul
    // laisse une ligne d'interface en tête du document imprimé — et c'est
    // invisible à la lecture, parce que le marquage EXISTE, à un élément près.
    const source = sansCommentaires(lire('components/admin-shell.tsx'));
    expect(
      source,
      'le conteneur de la barre de section doit porter le marquage, sinon son ' +
        'titre s’imprime seul en tête du document',
    ).toMatch(/<aside className="print:hidden/);
  });
});

  it('⚠ témoin d’ABSENCE : le rapport ne marque PAS son propre contenu', () => {
    // Sans lui, un `print:hidden` posé par mégarde sur l'article ferait
    // imprimer une page blanche — et le garde ci-dessus resterait vert.
    const rapport = lire('app/admin/rapport-annuel/page.tsx');
    const sansCommentaires = rapport
      .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, '')
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n');
    // Seules les COMMANDES se cachent : le sélecteur d'année et le bouton.
    expect((sansCommentaires.match(/print:hidden/g) ?? []).length).toBe(1);
  });
});
