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
    const copies = execFileSync(
      'grep',
      // ⚠ ON CHERCHE LES LIBELLÉS, PAS LES CLÉS. Première écriture : un motif
      // sur `'these_unique'` entre guillemets — or une table s'écrit avec des
      // clés NUES (`{ these_unique: '…' }`), et le contrôle négatif n'est pas
      // tombé. C'est la même forme que le `recordType,` abrégé qui avait échappé
      // à un relevé du 11 septembre : un motif qui présume une écriture ne voit
      // pas celle qu'on emploie vraiment.
      ['-rlE', "'(Mémoire de licence|Mémoire de master|Thèse unique)'", 'app', 'components', '--include=*.tsx'],
      { cwd: process.cwd(), encoding: 'utf-8' },
    )
      .split('\n')
      .filter(Boolean);

    expect(
      copies,
      'Ces écrans réécrivent le vocabulaire des types de dépôt.\n' +
        'Utilisez `LIBELLES.typesDeDepot` — une seule source.\n' +
        '⚠ SAUF `mes-encadrements`, qui affiche `recordType` et NON\n' +
        '`documentType` : deux vocabulaires distincts, et les fondre ferait\n' +
        'apparaître « Ouvrage » dans un menu de dépôt de thèse.',
    ).toEqual(['app/mes-encadrements/page.tsx']);
  });
});
