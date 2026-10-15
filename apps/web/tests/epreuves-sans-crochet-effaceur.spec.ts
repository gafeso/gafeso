import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * ⭐⭐ UNE ÉPREUVE PAR L'EFFET N'EFFACE PAS SA DOUBLURE DANS UN `beforeEach`.
 *
 * ## La cause, bisectée le 15 octobre 2026 jusqu'à douze lignes
 *
 * Sans Next, sans module doublé, sans notre écran :
 *
 * | crochet | promesse rendue par la doublure | résultat |
 * |---|---|---|
 * | `beforeEach(mockClear)` | RÉSOLUE | passe, 1 s |
 * | `beforeEach(mockClear)` | **ÉTERNELLE** | 🔴 le worker ne rend JAMAIS la main |
 * | aucun crochet | éternelle | passe, 2 s |
 * | `afterEach(mockClear)` | éternelle | échoue proprement, code 1 |
 *
 * `mockReset` se comporte comme `mockClear` — ce sont les deux méthodes qui
 * EFFACENT les résultats enregistrés. Référencer la doublure, lire
 * `mock.calls`, ou poser l'implémentation dans le crochet ne bloquent pas.
 *
 * ## ⚠ POURQUOI UN GARDE ET PAS UNE LIGNE DE DOCUMENTATION
 *
 * Le blocage **ne nomme aucun cas**. Il ne dit pas quel fichier, quel test, ni
 * quelle ligne — la suite s'arrête, et c'est tout. Il m'a coûté une heure, et
 * j'ai soupçonné trois causes avant la bonne, parce que je cherchais dans ce
 * que je venais d'écrire au lieu de RÉDUIRE jusqu'à la plus petite forme qui
 * bloque.
 *
 * Une règle écrite protège de l'ignorance, jamais de la pente. Celui qui
 * écrira la onzième épreuve copiera la dixième — et si la dixième porte un
 * `beforeEach` effaceur, la suite de tout le monde s'arrêtera sans un mot.
 *
 * ⚠ **Les délais globaux n'y peuvent rien** : ils supposent que la boucle
 * d'événements tourne encore. Mesuré le 15 octobre — une boucle synchrone de
 * 30 s passe VERTE avec un délai à 3 s. Voir `vitest.config.ts`.
 */
const RACINE = join(process.cwd(), 'tests');
const EPREUVES = readdirSync(RACINE).filter((f) => /-formulaire-charge\.spec\.tsx$/.test(f));

/*
 * ⚠ `[^)]*` NE SUFFIT PAS : il s'arrête à la première parenthèse, qui est
 * celle de la flèche — `beforeEach(() => …`. Mon premier motif ne voyait donc
 * AUCUN crochet effaceur, et ses deux témoins de présence l'ont dit tout de
 * suite.
 */
const EFFACEUR = /beforeEach\([\s\S]{0,120}?\bmock(Clear|Reset)\s*\(/;

/**
 * ⚠ LES ÉPREUVES QUI RÈGLENT TOUTES LEURS PROMESSES peuvent effacer sans
 * risque — c'est la première ligne du tableau ci-dessus. Elles sont déclarées
 * ici AVEC leur motif plutôt que tolérées en silence : la distinction est
 * réelle, et la taire ferait croire que le garde a des exceptions arbitraires.
 */
const REGLENT_TOUT: Record<string, string> = {
  'accueil-formulaire-charge.spec.tsx':
    'chacun de ses cas RÉSOUT ou REJETTE la réponse qu’il a mise en attente',
  'etablissement-formulaire-charge.spec.tsx': 'idem — aucune promesse ne reste pendante',
  'moissonnage-formulaire-charge.spec.tsx': 'idem',
  'pages-legales-formulaire-charge.spec.tsx': 'idem',
  'comptes-formulaire-charge.spec.tsx': 'idem',
  'roles-formulaire-charge.spec.tsx': 'idem',
};

describe('les épreuves par l’effet', () => {
  it('⚠ le relevé LIT quelque chose : sinon tout ce qui suit est vert sur le vide', () => {
    expect(EPREUVES.length).toBeGreaterThan(5);
    // ⚠ TÉMOIN DE PRÉSENCE sur un fichier dont je connais la réponse.
    expect(EPREUVES).toContain('collections-formulaire-charge.spec.tsx');
  });

  it('⚠ l’instrument DISCRIMINE : il voit un crochet effaceur, et pas un crochet quelconque', () => {
    expect(EFFACEUR.test('  beforeEach(() => api.mockReset());')).toBe(true);
    expect(EFFACEUR.test('  beforeEach(() => api.mockClear());')).toBe(true);
    // ⚠ TÉMOIN D'ABSENCE sur les formes LÉGITIMES — celles qui ne bloquent pas.
    expect(EFFACEUR.test('  beforeEach(() => {});')).toBe(false);
    expect(EFFACEUR.test('  afterEach(() => api.mockClear());')).toBe(false);
    expect(EFFACEUR.test('  beforeEach(() => api.mockImplementation(f));')).toBe(false);
  });

  /*
   * ⚠ LES COMMENTAIRES SONT ÉCARTÉS, et ce n'est pas une précaution : ce
   * fichier-ci DÉCRIT la forme fautive dans un tableau, et
   * `collections-formulaire-charge` la décrit aussi. Un relevé qui lit les
   * commentaires signale le texte qui EXPLIQUE la faute — c'est arrivé trois
   * fois dans ce dépôt, dont une sur le garde du lien d'évitement.
   *
   * Le motif y échappait par CHANCE (il exige un appel, `mockClear(`, et les
   * tableaux écrivent `mockClear)`). On ne laisse pas une propriété tenir à ça.
   */
  const sansCommentaires = (src: string) => {
    const net = src.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(net.length, 'le nettoyage a mangé le fichier').toBeGreaterThan(src.length * 0.2);
    return net;
  };

  it('⚠ le nettoyage des commentaires DISCRIMINE', () => {
    const avec = '/* beforeEach(() => api.mockClear()); */\nconst x = 1;';
    expect(EFFACEUR.test(avec), 'le motif voit la forme dans un commentaire').toBe(true);
    expect(EFFACEUR.test(sansCommentaires(avec)), 'et il ne la voit plus une fois nettoyé').toBe(
      false,
    );
  });

  it('⚠ aucune épreuve non déclarée n’efface sa doublure dans un `beforeEach`', () => {
    const fautives = EPREUVES.filter(
      (f) => !REGLENT_TOUT[f] && EFFACEUR.test(sansCommentaires(readFileSync(join(RACINE, f), 'utf8'))),
    );
    expect(
      fautives,
      'elles laissent des promesses NON RÉGLÉES — c’est le principe d’une épreuve par ' +
        'l’effet — et un `beforeEach` qui efface la doublure fait que la suite NE REND ' +
        'JAMAIS LA MAIN, sans nommer aucun cas. Retirez le crochet, ou déclarez le ' +
        'fichier dans REGLENT_TOUT avec son motif.',
    ).toEqual([]);
  });

  it('⚠ et une déclaration PÉRIMÉE est refusée : un fichier disparu doit sortir de la liste', () => {
    expect(Object.keys(REGLENT_TOUT).filter((f) => !EPREUVES.includes(f))).toEqual([]);
  });
});
