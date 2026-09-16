/**
 * ⚠ UN NOMBRE AFFICHÉ EN FRANÇAIS S'ÉCRIT AVEC UNE VIRGULE.
 *
 * `toFixed` rend TOUJOURS un point décimal : c'est la syntaxe JavaScript d'un
 * nombre, pas l'écriture d'une langue. Le rapport annuel affichait donc
 * « 0.11 » pour le taux de rotation — le SEUL des vingt nombres du document à
 * échapper à la locale, sur une page destinée à être imprimée et remise à une
 * université.
 *
 * ⚠ CE QUE CE GARDE A DE PARTICULIER : `toFixed` a un usage LÉGITIME, et il
 * est fréquent — les coordonnées d'un tracé SVG, où le point est la syntaxe
 * attendue par le navigateur et où une virgule couperait le chemin en deux
 * nombres. Le motif ne désigne donc PAS la faute : c'est ce que le nombre
 * DEVIENT qui la désigne — un texte lu par quelqu'un, ou une instruction lue
 * par un moteur de rendu.
 *
 * D'où la forme : une OBLIGATION, pas un balayage. Chaque fichier qui emploie
 * `toFixed` est déclaré ci-dessous avec sa NATURE et son motif. Un fichier
 * neuf n'est dans aucune liste, et le test échoue en disant les deux issues.
 * C'est la forme de COLONNES_SERVIES et de `colonnes-ecrivables` — la seule
 * qui ne se périme pas toute seule.
 *
 * ⚠ LE GESTE QUI LE VIOLERA, parce qu'il est raisonnable : quelqu'un affichera
 * une moyenne, un pourcentage ou une taille de fichier, et écrira `toFixed(1)`
 * — c'est la façon la plus courte d'arrondir en JavaScript, et elle est juste
 * partout sauf quand le résultat est LU. `formaterDecimal` de `lib/chiffres`
 * fait la même chose dans la langue du produit.
 */

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const RACINE = resolve(__dirname, '..');

/**
 * Les fichiers autorisés à employer `toFixed`, et pourquoi.
 *
 * ⚠ `syntaxe-machine` veut dire « ce nombre n'est jamais lu par une
 * personne ». Ce n'est pas une tolérance de confort : une virgule y CASSERAIT
 * la sortie.
 */
const TOFIXED_DECLARE: Record<string, { nature: 'syntaxe-machine'; motif: string }> = {
  'components/stat-charts.tsx': {
    nature: 'syntaxe-machine',
    motif:
      'coordonnées d’un attribut `d` de tracé SVG — le navigateur attend un ' +
      'point, et une virgule y séparerait deux nombres',
  },
};

function fichiersSources(): string[] {
  const vus: string[] = [];
  const parcourir = (dossier: string) => {
    for (const nom of readdirSync(dossier)) {
      const chemin = join(dossier, nom);
      if (statSync(chemin).isDirectory()) {
        if (nom === 'node_modules' || nom === '.next' || nom === 'tests') continue;
        parcourir(chemin);
      } else if (/\.tsx?$/.test(nom)) {
        vus.push(chemin);
      }
    }
  };
  for (const racine of ['app', 'components', 'lib']) parcourir(join(RACINE, racine));
  return vus;
}

/** ⚠ Le commentaire de `formaterDecimal` PARLE de `toFixed` : il l'expliquerait. */
function sansCommentaires(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');
}

function emploientToFixed(): string[] {
  return fichiersSources()
    .filter((f) => sansCommentaires(readFileSync(f, 'utf-8')).includes('.toFixed('))
    .map((f) => relative(RACINE, f))
    .sort();
}

describe('les nombres affichés sont écrits en français', () => {
  it('⚠ témoin de COMPTE : l’instrument parcourt bien tout l’espace source', () => {
    // Sans lui, un parcours cassé rendrait une liste vide et le test suivant
    // passerait sans avoir rien regardé — le cas le plus répandu de ce dépôt.
    const tous = fichiersSources();
    expect(tous.length).toBeGreaterThan(80);
    expect(tous.some((f) => f.endsWith('app/admin/rapport-annuel/page.tsx'))).toBe(true);
  });

  it('⚠ tout emploi de `toFixed` est déclaré, avec sa nature et son motif', () => {
    const nonDeclares = emploientToFixed().filter((f) => !TOFIXED_DECLARE[f]);
    expect(
      nonDeclares,
      'Un `toFixed` neuf. DEUX ISSUES, et une seule est un ajout à cette ' +
        'liste : si ce nombre est LU par quelqu’un, remplacez-le par ' +
        '`formaterDecimal` de `lib/chiffres` — `toFixed` rend un point ' +
        'décimal, qui n’est pas l’écriture du français. Si c’est une syntaxe ' +
        'machine (coordonnée SVG, clé, identifiant), déclarez-le ici avec son ' +
        'motif.',
    ).toEqual([]);
  });

  it('⚠ une déclaration PÉRIMÉE est refusée', () => {
    // Le jour où le fichier cesse d'employer `toFixed`, sa ligne devient
    // fausse. Une dette qui ne se rappelle pas d'elle-même est un oubli en
    // attente.
    const reels = new Set(emploientToFixed());
    const perimees = Object.keys(TOFIXED_DECLARE).filter((f) => !reels.has(f));
    expect(
      perimees,
      'Ces fichiers n’emploient plus `toFixed` : retirez leur ligne.',
    ).toEqual([]);
  });

  it('⚠ et `formaterDecimal` écrit bien une VIRGULE', () => {
    // Le témoin qui compte : sans lui, le garde ci-dessus obligerait à passer
    // par une fonction dont personne n'a vérifié la sortie.
    return import('../lib/chiffres').then(({ formaterDecimal }) => {
      expect(formaterDecimal(0.11, 2)).toBe('0,11');
      expect(formaterDecimal(12.34, 1)).toBe('12,3');
      expect(formaterDecimal(2, 2)).toBe('2,00');
      expect(formaterDecimal(0.11, 2)).not.toContain('.');
    });
  });
});
