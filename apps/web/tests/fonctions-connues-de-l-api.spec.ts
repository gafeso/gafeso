/**
 * Toute fonction exigée par le front DOIT exister côté API.
 *
 * ⚠ POURQUOI CE TEST EXISTE. Le 8 septembre 2026, l'API a renommé et découpé
 * ses permissions (`comptes.voir` → `lecteurs.voir`, `etablissement.gerer`
 * éclaté en six…). Le front, lui, continuait d'exiger les anciens noms. Comme
 * le filtrage est un `includes`, une fonction qui n'existe plus n'est jamais
 * détenue par personne : ONZE des dix-sept entrées d'administration
 * disparaissaient pour TOUT LE MONDE, administrateur compris — et en silence,
 * sans une erreur, sans un log.
 *
 * Ce test lit le catalogue réel de l'API et refuse toute fonction inconnue. Il
 * transforme une panne silencieuse en suite rouge.
 *
 * ⚠ Il lit `apps/api` depuis `apps/web` — franchir la frontière est délibéré :
 * le couplage EXISTE dans les faits, autant qu'il soit vérifié. En lecture
 * seule, et seulement ce fichier.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NAVIGATION_PERSONNEL, ongletsVisibles } from '@/lib/navigation';
import { PERMISSIONS_CIBLES } from '@/lib/permissions-cibles';

const CATALOGUE_API = resolve(process.cwd(), '..', 'api', 'src', 'auth', 'functions.ts');

/** Les identifiants du catalogue de l'API, lus dans le fichier source. */
function fonctionsDeLApi(): Set<string> {
  const source = readFileSync(CATALOGUE_API, 'utf-8');
  const bloc = source.slice(source.indexOf('export const FONCTIONS'), source.indexOf('} as const;'));
  return new Set([...bloc.matchAll(/'([a-z]+\.[a-z]+)'/g)].map((m) => m[1]));
}

/** Toutes les fonctions qu'un fichier de apps/web exige via `includes('x.y')`. */
function fonctionsExigeesParLesEcrans(): { fichier: string; fonction: string }[] {
  const { execFileSync } = require('node:child_process') as typeof import('node:child_process');
  const brut = execFileSync(
    'grep',
    ['-rhoE', "includes\\('[a-z]+\\.[a-z]+'\\)", 'app', 'components', 'lib'],
    { cwd: process.cwd(), encoding: 'utf-8' },
  );
  return brut
    .split('\n')
    .filter(Boolean)
    .map((l) => ({ fichier: 'apps/web', fonction: l.replace(/.*'([^']+)'.*/, '$1') }));
}

describe('catalogue de fonctions', () => {
  it('est lisible, et contient un nombre plausible de fonctions', () => {
    // Témoin : sans lui, un chemin erroné rendrait un ensemble VIDE et toutes
    // les assertions ci-dessous passeraient sans rien vérifier.
    const api = fonctionsDeLApi();
    expect(api.size).toBeGreaterThan(10);
    expect(api).toContain('catalogue.gerer');
  });

  it('la NAVIGATION n’exige que des fonctions que l’API connaît', () => {
    const api = fonctionsDeLApi();
    const inconnues = NAVIGATION_PERSONNEL.flatMap((o) =>
      o.entrees.flatMap((e) =>
        e.fonctions.filter((f) => !api.has(f)).map((f) => `${e.href} → ${f}`),
      ),
    );
    expect(inconnues).toEqual([]);
  });

  it('les GARDES D’ÉCRAN n’exigent que des fonctions que l’API connaît', () => {
    // La navigation ne suffit pas : chaque écran porte sa propre garde, et une
    // entrée visible menant à un écran qui refuse est le même défaut déplacé.
    const api = fonctionsDeLApi();
    const exigees = fonctionsExigeesParLesEcrans();
    expect(exigees.length).toBeGreaterThan(5); // témoin : le grep a bien vu
    const inconnues = [...new Set(exigees.map((e) => e.fonction))].filter((f) => !api.has(f));
    expect(inconnues).toEqual([]);
  });

  it('la table de correspondance n’exige que des fonctions que l’API connaît', () => {
    const api = fonctionsDeLApi();
    const inconnues = Object.entries(PERMISSIONS_CIBLES).flatMap(([href, c]) =>
      c.actuelle.filter((f) => !api.has(f)).map((f) => `${href} → ${f}`),
    );
    expect(inconnues).toEqual([]);
  });
});

describe('l’administrateur voit TOUT', () => {
  /** Le rôle Administrateur porte TOUTES_LES_FONCTIONS : on les lit à la source. */
  function toutesLesFonctions(): string[] {
    return [...fonctionsDeLApi()];
  }

  it('les vingt entrées lui restent visibles', () => {
    // ⚠ C'est LE cas que le renommage a cassé : le filtre étant un `includes`,
    // une fonction disparue n'est détenue par personne — pas même par celui qui
    // les a toutes. Onze des dix-sept entrées s'évanouissaient en silence.
    const toutes = NAVIGATION_PERSONNEL.flatMap((o) => o.entrees);
    const vues = ongletsVisibles(toutesLesFonctions()).flatMap((o) => o.entrees);

    // Témoin : la nav n'a pas rétréci en route. 17 jusqu'au 10 septembre 2026,
    // 18 depuis /admin/adherents — l'écran qui ouvre `adherents.gerer`, une
    // fonction que le Bibliothécaire détenait sans qu'aucune porte n'existe
    // (backlog n° 8). Ce chiffre s'écrit en dur pour qu'une entrée ajoutée ou
    // perdue par accident fasse tomber le test.
    // ⚠ 24 depuis le 15 septembre 2026 : /admin/rapport-annuel (P8-3). Le
    // rapport annuel est un DOCUMENT, pas une vue du tableau de bord — les
    // confondre ferait chercher un bilan d'année dans une page de pilotage.
    expect(toutes.length).toBe(24);
    expect(vues.map((e) => e.href).sort()).toEqual(toutes.map((e) => e.href).sort());
  });

  it('les six onglets lui sont ouverts', () => {
    expect(ongletsVisibles(toutesLesFonctions()).map((o) => o.id)).toEqual([
      'catalogue',
      'lecteurs',
      'guichet',
      'outils',
      'statistiques',
      'administration',
    ]);
  });

  it('l’onglet Outils s’ouvre par l’un OU l’autre de ses deux droits', () => {
    // outils.catalogue → import de notices, récolement.
    // outils.lecteurs  → import des étudiants.
    // Les deux sous-groupes se filtrent séparément : détenir l'un ouvre
    // l'onglet sans donner l'autre.
    const parCatalogue = ongletsVisibles(['outils.catalogue']).find((o) => o.id === 'outils');
    const parLecteurs = ongletsVisibles(['outils.lecteurs']).find((o) => o.id === 'outils');

    expect(parCatalogue?.entrees.map((e) => e.libelle)).toEqual([
      'Import de notices',
      // ⚠ Le moissonnage est un outil qui OPÈRE sur le catalogue, au même titre
      // que l'import : même fonction, même onglet, aucune porte nouvelle.
      'Moissonnage',
      'Récolement',
    ]);
    expect(parLecteurs?.entrees.map((e) => e.libelle)).toEqual(['Import des étudiants']);
  });

  it('⚠ chaque métier du paramétrage a SA porte et SA permission', () => {
    // Avant le 11 septembre 2026, /admin/parametres s'atteignait par l'une OU
    // l'autre de deux permissions : un seul écran pour deux métiers. Il est
    // scindé. Ce test vérifie que la scission n'a fait perdre l'accès à
    // personne — chacun garde ce qu'il atteignait — et n'a rien ouvert de neuf.
    const vues = (f: string) =>
      ongletsVisibles([f]).flatMap((o) => o.entrees.map((e) => e.href));

    expect(vues('etablissement.apparence')).toContain('/admin/etablissement');
    expect(vues('etablissement.apparence')).not.toContain('/admin/regles-de-pret');

    expect(vues('etablissement.regles')).toContain('/admin/regles-de-pret');
    expect(vues('etablissement.regles')).not.toContain('/admin/etablissement');
  });
});
