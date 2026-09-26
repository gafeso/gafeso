/**
 * LE VOCABULAIRE DES TYPES DE DÉPÔT — une seule source, et elle doit être la
 * BONNE.
 *
 * ⚠ POURQUOI CE FICHIER EXISTE. Le 13 septembre 2026, la même table était
 * recopiée dans CINQ écrans neufs — et les cinq copies avaient déjà DIVERGÉ en
 * moins d'une journée. Un vocabulaire dupliqué se désynchronise à la vitesse où
 * l'on ajoute des écrans, et rien ne le signale : chaque copie est correcte
 * isolément.
 *
 * ⚠ ET LA SOURCE UNIQUE NE SUFFIT PAS. Un libellé sorti du code reste faux s'il
 * nomme un type que l'API refuse, ou s'il en oublie un qu'elle accepte. Ce test
 * lit donc `DEFENSE_RECORD_TYPES` dans `apps/api` — la valeur réelle, pas une
 * copie — et compare dans les DEUX sens.
 *
 * L'API valide `documentType` contre cette liste, et son commentaire dit
 * pourquoi ce n'est pas décoratif : le PROFIL d'une notice est déduit de son
 * type. Un type hors liste produirait silencieusement une notice
 * `bibliographique` — donc absente d'ETD-MS, donc une thèse invisible du dépôt
 * dont dépendent les promotions.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LIBELLES } from '@/lib/libelles';

const SOURCE_API = resolve(
  process.cwd(),
  '..',
  'api',
  'src',
  'cataloging',
  'description-profiles.ts',
);

/** Le vocabulaire tel que l'API le porte, lu à la source. */
function typesDeLApi(): string[] {
  const src = readFileSync(SOURCE_API, 'utf-8');
  const debut = src.indexOf('export const DEFENSE_RECORD_TYPES');
  expect(debut, 'la constante a-t-elle été renommée ?').toBeGreaterThan(-1);
  const bloc = src.slice(debut, src.indexOf(']', debut));
  return [...bloc.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

describe('le vocabulaire des types de dépôt', () => {
  it('l’instrument lit une liste PLAUSIBLE — sinon il ne mesure rien', () => {
    // ⚠ TÉMOIN. Un chemin erroné rendrait une liste vide, et les deux
    // assertions suivantes seraient vraies sans avoir rien regardé.
    const api = typesDeLApi();
    expect(api.length).toBeGreaterThanOrEqual(4);
    expect(api).toContain('these');
  });

  it('⚠ chaque type accepté par l’API a son libellé', () => {
    // Sans quoi l'écran affiche l'identifiant brut — « these_unique » — à
    // quelqu'un qui vient déposer le travail de deux ans de sa vie.
    const sansLibelle = typesDeLApi().filter((t) => !(t in LIBELLES.typesDeDepot));
    expect(sansLibelle).toEqual([]);
  });

  it('⚠ aucun libellé ne nomme un type que l’API REFUSE', () => {
    // L'autre sens, et il compte autant : un menu qui propose « Ouvrage » sur
    // un dépôt de thèse fait choisir une valeur que la création rejettera — et
    // la personne cherchera ce qu'elle a mal fait.
    const api = typesDeLApi();
    const inconnus = Object.keys(LIBELLES.typesDeDepot).filter((t) => !api.includes(t));
    expect(inconnus).toEqual([]);
  });

  it('⚠ le vocabulaire n’est plus recopié dans les écrans', () => {
    // La duplication est ce qui a produit la divergence. Un écran qui réécrit
    // sa propre table recommence exactement ce qu'on vient de défaire.
    const { execFileSync } = require('node:child_process') as typeof import('node:child_process');
    // ⚠ `grep` SORT EN 1 QUAND IL NE TROUVE RIEN, et `execFileSync` LÈVE sur un
    // code non nul. Ce garde a donc cassé le 22 septembre 2026 — non pas parce
    // que la propriété était violée, mais parce qu'elle est devenue VRAIE :
    // `mes-encadrements` était le dernier écran à porter sa table, elle est
    // partie dans `libelles.ts`, et grep n'a plus rien trouvé.
    //
    // ⭐ Un instrument qui LÈVE quand ce qu'il traque disparaît est un
    // instrument qui ne sait pas dire « zéro ». Le cas le plus favorable lui
    // était inconnu, parce qu'il n'était jamais arrivé.
    const sansCorrespondance = (e: unknown) =>
      (e as { status?: number }).status === 1 ? '' : (() => { throw e; })();
    let brut: string;
    try {
      brut = execFileSync(
      'grep',
      // ⚠ ON CHERCHE LES LIBELLÉS, PAS LES CLÉS. Première écriture : un motif
      // sur `'these_unique'` entre guillemets — or une table s'écrit avec des
      // clés NUES (`{ these_unique: '…' }`), et le contrôle négatif n'est pas
      // tombé. C'est la même forme que le `recordType,` abrégé qui avait échappé
      // à un relevé du 11 septembre : un motif qui présume une écriture ne voit
      // pas celle qu'on emploie vraiment.
      ['-rlE', "'(Mémoire de licence|Mémoire de master|Thèse unique)'", 'app', 'components', '--include=*.tsx'],
      { cwd: process.cwd(), encoding: 'utf-8' },
      );
    } catch (e) {
      brut = sansCorrespondance(e);
    }
    const copies = brut.split('\n').filter(Boolean);

    expect(
      copies,
      'Ces écrans réécrivent le vocabulaire des types de dépôt.\n' +
        'Utilisez `LIBELLES.typesDeDepot` — une seule source.\n' +
        '⚠ SAUF `mes-encadrements`, qui affiche `recordType` et NON\n' +
        '`documentType` : deux vocabulaires distincts, et les fondre ferait\n' +
        'apparaître « Ouvrage » dans un menu de dépôt de thèse.',
    ).toEqual([]);
  });

  /**
   * ⚠ L'EXCEPTION A ÉTÉ RÉSOLUE, PAS SUPPRIMÉE — 22 septembre 2026.
   *
   * Ce test attendait EXACTEMENT `['app/mes-encadrements/page.tsx']` : un écran
   * déclaré, refusé dans les deux sens. Il a donc REFUSÉ le jour où l'écran a
   * cessé de recopier la table — c'est-à-dire le jour où la dette s'est
   * résolue, et c'est précisément ce qu'on lui demande. Une dette qui ne se
   * rappelle qu'en s'aggravant laisserait passer sa propre résolution.
   *
   * ⚠ MAIS LA PROPRIÉTÉ QUI COMPTAIT N'ÉTAIT PAS « l'écran a sa table » : c'est
   * que les DEUX VOCABULAIRES RESTENT DISTINCTS. Elle a changé de porteur — des
   * écrans vers `libelles.ts` — et une propriété qui change de porteur est
   * exactement le moment où elle disparaît sans bruit. Elle est donc regardée
   * ici, là où elle vit maintenant.
   */
  it('⚠ les deux vocabulaires restent DISTINCTS — fondus, « Ouvrage » entrerait dans un dépôt', () => {
    const depot = Object.keys(LIBELLES.typesDeDepot);
    const notice = Object.keys(LIBELLES.typesDeNotice);
    // `recordType` décrit tout le catalogue : il porte au moins une valeur que
    // le vocabulaire du dépôt n'a pas, et c'est elle qui interdit de les fondre.
    expect(notice).toContain('ouvrage');
    expect(depot).not.toContain('ouvrage');
    // Et ils ne sont pas devenus le même objet par mégarde.
    expect(LIBELLES.typesDeDepot).not.toBe(LIBELLES.typesDeNotice);
  });
});
