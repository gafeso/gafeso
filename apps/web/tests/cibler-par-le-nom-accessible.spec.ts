/**
 * UN TEST VISE CE QU'UN LECTEUR D'ÉCRAN NOMME — jamais une position, jamais un
 * crochet posé pour lui.
 *
 * ⚠ CE GARDE EST NÉGATIF : au 16 septembre 2026, aucun fichier du harnais ne
 * porte les formes qu'il refuse. C'est justement pour ça qu'il existe — et il
 * doit donc écrire LE GESTE qui le violera, sinon celui qui le rencontrera
 * croira avoir affaire à une coquetterie.
 *
 * ── LE SCÉNARIO, ET IL EST RAISONNABLE ──────────────────────────────────────
 * Un test échoue sur « Found multiple elements with the role "button" and name
 * "Annuler" ». La réponse qui vient d'elle-même, à onze heures du soir, est
 * `getAllByRole('button', { name: 'Annuler' })[0]` : elle est courte, elle rend
 * la suite verte, et elle n'est pas absurde — l'élément visé EST le premier.
 *
 * Or le message d'erreur ne disait pas « ce test est mal écrit ». Il disait
 * **que deux commandes de l'écran portent le même nom**, c'est-à-dire qu'un
 * lecteur d'écran annonce deux fois « Annuler » sans dire ce qui est annulé.
 * Le 15 septembre 2026, c'est exactement ce qui s'est passé sur l'écran de
 * récolement : la correction est allée dans le PRODUIT — deux `aria-label`
 * distincts — et pas dans le test. `[0]` aurait rendu le harnais vert en
 * laissant le défaut à l'écran, pour quelqu'un qui n'a que le son.
 *
 * `data-testid` est la même renonciation, posée un cran plus tôt : un crochet
 * qui n'existe que pour le test, donc qui ne peut rien dire de ce que
 * l'utilisateur perçoit. Il rend n'importe quel élément atteignable, y compris
 * ceux qu'aucune technologie d'assistance ne trouvera jamais.
 *
 * > Un harnais qui cible par le nom accessible est un lecteur d'écran qui
 * > s'exécute à chaque commit. Les deux formes ci-dessous l'éteignent.
 *
 * ── ⚠ SA BORNE, MESURÉE PLUTÔT QUE SUPPOSÉE ─────────────────────────────────
 * Ce garde NE JUGE PAS `querySelector`. Mesuré le 16 septembre : 30 appels
 * `document.querySelector*` dans `tests/`, dont 25 sont des BALAYAGES de
 * structure (`[...document.querySelectorAll('a[href], button')].filter(…)`) —
 * la forme même qu'exigent les gardes d'accessibilité, qui doivent parcourir
 * tout le document. Les 5 autres visent soit un élément invisible aux
 * technologies d'assistance (l'`input[type=file]` caché derrière une zone de
 * dépôt), soit un champ CHERCHÉ DANS un élément déjà trouvé par son nom
 * (`form.querySelector('input[type=password]')`), qui est précisément le
 * remède prescrit après le défaut du 14 septembre.
 *
 * Séparer « je balaie » de « je vise » demande de savoir ce qu'on fait du
 * résultat — une analyse de flot, pas un motif. Un garde approximatif sur
 * `querySelector` crierait sur 25 appels légitimes, et un détecteur qui crie au
 * loup se fait désactiver. La borne est donc écrite, pas franchie.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Le choix par POSITION parmi des éléments que rien ne distingue. */
const PAR_POSITION = /getAllBy[A-Za-z]+\([^;]*?\)\s*(?:\[\s*\d+\s*\]|\.at\(\s*-?\d+\s*\))/;
/** Idem, par le DOM brut. */
const POSITION_DOM = /querySelectorAll\([^;]*?\)\s*(?:\[\s*\d+\s*\]|\.item\(|\.at\(\s*-?\d+\s*\))/;
/** Le crochet posé pour le test, des deux côtés de la frontière. */
const CROCHET_DE_TEST = /data-testid|getByTestId|findByTestId|queryByTestId|\btestId\b/;

const FORMES = [
  { nom: 'choix par position (getAllBy…[n])', motif: PAR_POSITION },
  { nom: 'choix par position (querySelectorAll…[n])', motif: POSITION_DOM },
  { nom: 'crochet de test (data-testid)', motif: CROCHET_DE_TEST },
] as const;

/** Ce fichier NOMME les formes qu'il refuse : il ne peut pas s'auto-inspecter. */
const CE_FICHIER = 'tests/cibler-par-le-nom-accessible.spec.ts';

function fichiers(dossiers: string[]): string[] {
  return execFileSync('grep', ['-rl', '', ...dossiers, '--include=*.ts', '--include=*.tsx'], {
    cwd: process.cwd(),
    encoding: 'utf-8',
  })
    .split('\n')
    .filter(Boolean)
    .filter((f) => f !== CE_FICHIER);
}

function infractions(chemins: string[]): string[] {
  const trouvees: string[] = [];
  for (const f of chemins) {
    const src = readFileSync(resolve(process.cwd(), f), 'utf-8');
    src.split('\n').forEach((ligne, i) => {
      if (ligne.trimStart().startsWith('*') || ligne.trimStart().startsWith('//')) return;
      for (const forme of FORMES) {
        if (forme.motif.test(ligne)) trouvees.push(`${f}:${i + 1} — ${forme.nom}`);
      }
    });
  }
  return trouvees.sort();
}

describe('l’instrument, avant ce qu’il mesure', () => {
  it('témoin de PRÉSENCE — il voit les trois formes', () => {
    const faux = [
      "const b = screen.getAllByRole('button', { name: 'Annuler' })[0];",
      "const c = within(carte).getAllByText('Supprimer').at(-1);",
      "const d = document.querySelectorAll('button')[2];",
      '<button data-testid="valider">Valider</button>',
      "const e = screen.getByTestId('valider');",
    ];
    for (const ligne of faux) {
      expect(
        FORMES.some((f) => f.motif.test(ligne)),
        `non vue : ${ligne}`,
      ).toBe(true);
    }
  });

  it('témoin d’ABSENCE — il sait dire non sur la confusion PLAUSIBLE', () => {
    // ⚠ Chacune de ces lignes RESSEMBLE à ce qu'on refuse. Un témoin d'absence
    // sur une chaîne inventée ne prouverait rien : personne ne l'écrirait.
    const justes = [
      // Un balayage compte ou transforme : il ne vise personne.
      "const n = screen.getAllByRole('listitem').length;",
      "const noms = screen.getAllByRole('button').map((b) => b.textContent);",
      // Un index sur autre chose qu'une sélection d'éléments.
      'const premier = reponses[0];',
      "const ligne = tableau.rows.item(0);",
      // Un attribut `data-` qui n'est pas un crochet de test.
      '<span data-etat="valide" />',
      // Le NOM accessible, qui est la forme prescrite.
      "screen.getByRole('button', { name: T.annulerLeScanDe('ETU-1') });",
    ];
    for (const ligne of justes) {
      expect(
        FORMES.find((f) => f.motif.test(ligne))?.nom ?? null,
        `faux positif sur : ${ligne}`,
      ).toBeNull();
    }
  });

  it('témoin de COMPTE — il a bien lu le harnais, et pas trois fichiers', () => {
    // Un relevé qui ne trouve rien nulle part n'est pas un relevé qui innocente.
    expect(fichiers(['tests']).length).toBeGreaterThan(80);
  });
});

describe('le harnais cible par le nom accessible', () => {
  it('aucun test ne choisit par POSITION, ni ne pose de crochet de test', () => {
    expect(
      infractions(fichiers(['tests'])),
      'Un test qui vise par position ou par `data-testid` cesse d’être un lecteur ' +
        'd’écran. Si deux éléments portent le même nom accessible, le défaut est à ' +
        'l’ÉCRAN : donnez-leur des `aria-label` distincts (le produit y gagne, pas ' +
        'seulement le test). Si l’élément n’a pas de nom du tout, c’est qu’aucune ' +
        'technologie d’assistance ne peut l’atteindre — donnez-lui-en un, ou visez-le ' +
        'DANS un parent trouvé par son nom.',
    ).toEqual([]);
  });

  it('⚠ et le PRODUIT ne porte aucun crochet posé pour les tests', () => {
    // La moitié qu'on oublie : `data-testid` s'écrit dans le composant, pas dans
    // le test. Barré d'un seul côté, il entre par l'autre.
    expect(infractions(fichiers(['app', 'components', 'lib']))).toEqual([]);
  });
});
