/**
 * Tout fichier illustrant une page PUBLIQUE doit être atteignable sans compte.
 *
 * ⚠ Le piège est structurel, et le middleware le documente déjà pour le logo :
 * son `matcher` n'exempte que `_next/static`, donc TOUT fichier de `public/`
 * traverse la garde d'authentification. Un fichier oublié dans
 * `PUBLIC_PREFIXES` part en 307 vers /login.
 *
 * Ce défaut ne se voit pas :
 *  — le HTML contient la balise <img> dans les deux cas, seule la REQUÊTE
 *    diffère, donc lire le DOM ne prouve rien ;
 *  — on vérifie en étant connecté, cas où l'image se charge.
 *
 * D'où ce test, qui part des FICHIERS réellement présents et non d'une liste
 * tenue à la main : un fichier ajouté demain sera couvert sans qu'on y pense.
 */

import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PREFIXES_PUBLICS_POUR_TEST,
  CHEMINS_PUBLICS_POUR_TEST,
} from '@/middleware';

/** Les dossiers de `public/` qui illustrent une page sans authentification. */
const DOSSIERS_DE_PAGE_PUBLIQUE = ['marque', 'demo'];

const racine = join(__dirname, '..', 'public');

function fichiers(dir: string): string[] {
  const base = join(racine, dir);
  if (!existsSync(base)) return [];
  return readdirSync(base, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? fichiers(join(dir, e.name)) : [`/${join(dir, e.name)}`],
  );
}

const estPublic = (chemin: string) =>
  CHEMINS_PUBLICS_POUR_TEST.includes(chemin) ||
  PREFIXES_PUBLICS_POUR_TEST.some((p) => chemin.startsWith(p));

describe('fichiers illustrant une page publique', () => {
  for (const dossier of DOSSIERS_DE_PAGE_PUBLIQUE) {
    const trouves = fichiers(dossier);

    it(`public/${dossier}/ contient bien des fichiers`, () => {
      // Témoin. Sans lui, un dossier renommé viderait la boucle ci-dessous et
      // le test resterait vert en ne regardant plus rien.
      expect(trouves.length).toBeGreaterThan(0);
    });

    it(`aucun fichier de public/${dossier}/ ne part vers /login`, () => {
      expect(trouves.filter((f) => !estPublic(f))).toEqual([]);
    });
  }

  it('ne rend pas public ce qui ne doit pas l’être', () => {
    // Contre-témoin : la garde protège toujours l'espace professionnel.
    for (const chemin of ['/admin/accueil', '/catalogue', '/adherents']) {
      expect(estPublic(chemin)).toBe(false);
    }
  });
});
