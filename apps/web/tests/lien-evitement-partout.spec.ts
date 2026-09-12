/**
 * Tout écran qui porte une barre de navigation porte un lien d'évitement.
 *
 * ⚠ POURQUOI UN TEST DE SOURCE, ET PAS UN TEST DE RENDU. La présence du lien se
 * vérifie écran par écran en jsdom — mais jsdom ne dit RIEN de celui qui sera
 * écrit demain. Cet invariant-là ne se tient qu'en partant des FICHIERS : une
 * page publique ajoutée sans lien d'évitement doit faire échouer la suite, y
 * compris quand personne n'a pensé à écrire son test.
 *
 * ⚠ ET IL PORTE AUSSI LA CIBLE. Un lien d'évitement qui pointe sur un `id` que
 * personne ne pose est pire qu'absent : il occupe la première tabulation et ne
 * mène nulle part. Les deux moitiés se vérifient donc ensemble.
 *
 * Ce que ce test ne couvre PAS, et qui est dit plutôt que tu : que le lien soit
 * VISIBLE au focus. Cela dépend d'une règle CSS et d'une mise en page, dont
 * jsdom n'a ni l'une ni l'autre — trois mesures au navigateur ont été
 * nécessaires, elles sont consignées dans `globals.css`.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const lire = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * Source débarrassée de ses commentaires.
 *
 * ⚠ ÉCRIT APRÈS COUP, PARCE QUE LE TEST S'EST TROMPÉ À SA PREMIÈRE EXÉCUTION.
 * Il annonçait un `<main>` sans cible dans `admin-shell.tsx` : le cinquième
 * n'était pas du code, c'était le commentaire qui RACONTE l'absence corrigée
 * — « ⚠ `<main>` MANQUAIT ICI ». L'instrument fabriquait sa trouvaille.
 *
 * ⚠ Et la circonstance mérite d'être écrite : j'ai signalé ce défaut exact à la
 * session back le soir même, sur son garde `motifEcrans`, avant de l'écrire
 * moi-même dans l'heure. Le retrait se fait donc PAR BLOCS et non ligne à ligne
 * — les lignes de continuation d'un commentaire JSX ne portent aucun marqueur,
 * c'est précisément ce qui l'avait pris en défaut.
 */
function sansCommentaires(src: string): string {
  return src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, ' ') // {/* … */} multilignes
    .replace(/\/\*[\s\S]*?\*\//g, ' ') //             /* … */ multilignes
    .replace(/^\s*\/\/.*$/gm, ' '); //                   // … en début de ligne
}

/** Les entrées qui posent une barre de navigation, et doivent donc l'offrir. */
const AVEC_NAVIGATION = [
  'components/admin-shell.tsx', // toute la coque professionnelle
  'app/opac/layout.tsx', // le catalogue public et la fiche d'une notice
  'app/page.tsx', // l'accueil public
];

/** Les fichiers qui rendent un `<main>` atteint par ce lien. */
const PORTEURS_DE_CIBLE = [
  'components/admin-shell.tsx',
  'app/page.tsx',
  'app/opac/page.tsx',
  'app/opac/auteurs/page.tsx',
  'app/opac/[id]/fiche-notice.tsx',
];

describe('Lien d’évitement', () => {
  it.each(AVEC_NAVIGATION)('%s rend <LienDEvitement />', (fichier) => {
    expect(lire(fichier)).toContain('<LienDEvitement />');
  });

  it.each(PORTEURS_DE_CIBLE)('%s pose id={ID_CONTENU} sur chacun de ses <main>', (fichier) => {
    const src = lire(fichier);
    const mains = sansCommentaires(src).match(/<main\b[^>]*>/g) ?? [];
    // ⚠ Un témoin qui COMPTE : chaque `<main>` du fichier, pas « au moins un ».
    // La fiche d'une notice en a DEUX — celui du chargement et celui du contenu
    // — et le lien doit fonctionner pendant le chargement aussi.
    expect(mains.length).toBeGreaterThan(0);
    expect(mains.filter((m) => m.includes('id={ID_CONTENU}'))).toHaveLength(mains.length);
  });

  it('la cible est une seule chaîne, déclarée à un seul endroit', () => {
    const src = lire('components/lien-evitement.tsx');
    expect(src).toContain("export const ID_CONTENU = 'contenu'");
    expect(src).toContain('href={`#${ID_CONTENU}`}');
  });

  /** ⚠ Témoin : la lecture regarde bien les fichiers, et sait dire non. */
  it('témoin — un fichier sans lien est bien vu comme tel', () => {
    expect(lire('app/opac/page.tsx')).not.toContain('<LienDEvitement />');
  });

  /**
   * ⚠ TÉMOIN DU RETRAIT DES COMMENTAIRES, sur le cas qui a pris le test en
   * défaut. `admin-shell.tsx` PARLE de `<main>` dans un commentaire et en rend
   * quatre : un relevé qui en compte cinq lit du texte, pas du code.
   */
  it('témoin — un <main> cité dans un commentaire n’est pas compté', () => {
    const brut = lire('components/admin-shell.tsx');
    expect(brut).toContain('`<main>` MANQUAIT ICI');
    expect(brut.match(/<main\b[^>]*>/g) ?? []).toHaveLength(5);
    expect(sansCommentaires(brut).match(/<main\b[^>]*>/g) ?? []).toHaveLength(4);
  });
});
