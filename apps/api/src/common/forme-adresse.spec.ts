import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FORME_ADRESSE } from './forme-adresse';

/**
 * 🔴 CINQ COPIES DEVENUES UNE, ET LA CINQUIÈME EST GARDÉE.
 *
 * *Posé le 3 novembre 2026, par le balayage de clôture de la V1.* Le motif
 * d'adresse électronique existait à l'identique dans cinq fichiers. Quatre
 * consomment désormais `FORME_ADRESSE` ; le cinquième est un `.mjs` qui ne peut
 * pas importer du TypeScript, donc sa copie SUBSISTE.
 *
 * ⚠ UNE DIVERGENCE QUI SUBSISTE SE DÉCLARE ET SE GARDE, elle ne se tait pas
 * (CLAUDE.md §5). Ce fichier la CONFRONTE : si l'une des deux bouge sans
 * l'autre, le cas tombe.
 */

const RACINE = join(__dirname, '..', '..', '..', '..');

/** Les lignes de CODE d'une source — commentaires dépouillés. */
const sansCommentaires = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(?<!:)\/\/[^\n]*/g, ' ');

describe('⭐ UNE SEULE FORME D’ADRESSE — et la copie en .mjs est confrontée', () => {
  it('⭐ aucun fichier TypeScript ne redéclare le motif', () => {
    // Population DÉRIVÉE : on ne redit pas la liste des quatre fichiers, on
    // cherche la forme partout. Un cinquième service qui la recopierait demain
    // entre de lui-même dans la propriété.
    const coupables: string[] = [];
    const parcourir = (dossier: string) => {
      for (const e of readdirSync(dossier, { withFileTypes: true })) {
        const chemin = join(dossier, e.name);
        if (e.isDirectory()) parcourir(chemin);
        else if (e.name.endsWith('.ts') && chemin !== join(__dirname, 'forme-adresse.ts')) {
          const code = sansCommentaires(readFileSync(chemin, 'utf-8'));
          if (/\/\^\[\^\\s@\]\+@/.test(code)) coupables.push(chemin);
        }
      }
    };
    parcourir(join(RACINE, 'apps', 'api', 'src'));
    expect(
      coupables.map((c) => c.replace(`${RACINE}/`, '')),
      'une copie du motif est revenue : deux sources s’accordent jusqu’au jour où l’une bouge',
    ).toEqual([]);
  });

  it('🔴 et la copie du script .mjs est IDENTIQUE à la source', () => {
    // ⚠ Elle ne peut pas disparaître : un `.mjs` lancé par `node` ne compile
    // pas le TypeScript. On la CONFRONTE donc, plutôt que de la tolérer en
    // silence — et si l'une bouge sans l'autre, ce cas tombe.
    const script = sansCommentaires(
      readFileSync(join(RACINE, 'scripts', 'creer-activite-de-reservation.mjs'), 'utf-8'),
    );
    const trouve = script.match(/\/\^\[\^\\s@\][^/\n]*\$\//);
    expect(trouve, 'le script ne porte plus de motif d’adresse : retirez cette garde').toBeTruthy();
    expect(
      trouve![0],
      'le script et FORME_ADRESSE ont DIVERGÉ — alignez-les, ou faites-le consommer autrement',
    ).toBe(FORME_ADRESSE.source.replace(/^/, '/').replace(/$/, '/'));
  });

  it('⚠ TÉMOIN — la forme accepte et refuse ce qu’elle doit', () => {
    // Un motif cassé satisferait les deux cas précédents sans rien valider.
    for (const bonne of ['a@b.bf', 'jean.kors@exemple.org']) {
      expect(FORME_ADRESSE.test(bonne), bonne).toBe(true);
    }
    for (const mauvaise of ['', 'a@b', 'a b@c.bf', '@b.bf', 'a@.bf']) {
      expect(FORME_ADRESSE.test(mauvaise), mauvaise).toBe(false);
    }
  });
});
