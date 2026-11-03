import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

/**
 * 🔴 LE SEED DE DÉMONSTRATION — DEUX DÉFAUTS DE LA MÊME FAMILLE.
 *
 * *Mesurés le 3 novembre 2026 par le responsable, sur la démo.*
 *
 * ## ① UN PAS SAUTÉ NE CHANGEAIT PAS LA CONCLUSION
 *
 *     • réindexation ignorée (login bibliothécaire indisponible)
 *     ✔ Démo prête.
 *
 * Il annonçait « prête » APRÈS avoir sauté la réindexation. Le catalogue n'en a
 * pas souffert ce jour-là — l'index de la passe précédente tenait — mais sur une
 * PREMIÈRE exécution, il aurait rendu une démo au catalogue VIDE en se
 * déclarant prête. Deux autres sections pouvaient disparaître pareillement, et
 * une quatrième a été trouvée en relisant `reindex()` pour corriger la
 * première : `await fetch(...)` sans lire `ok` annonçait « catalogue réindexé »
 * sur un refus de l'API.
 *
 * ## ② LE GARDE-FOU MESURAIT L'AUTO-ADRESSE DU SCRIPT
 *
 * Il interrogeait `SEED_API_URL`, qui vaut `http://localhost:4000` DANS le
 * conteneur `api` : l'adresse à laquelle le script se parle à lui-même. Le
 * garde était donc vert sur un serveur PUBLIC, et ce seed y a tourné — créant
 * un établissement aux domaines `localhost`, invisible depuis Internet.
 *
 * C'est « une mesure prise depuis l'intérieur du système ne dit rien du
 * dehors », appliquée à un garde-fou. Ce qui désigne le DÉPLOIEMENT est
 * `APP_URL`.
 *
 * ## ⚠ CE QUE CE FICHIER MESURE, ET CE QU'IL NE MESURE PAS
 *
 * Le garde-fou est éprouvé PAR L'EFFET : on exécute le script, il refuse avant
 * tout travail, on lit son code de sortie. Les RÉSERVES, elles, ne sont
 * éprouvées que structurellement ici — les atteindre exige une base et une API
 * vivantes. Le code de sortie 3 a été mesuré à la main, par mutation du login
 * bibliothécaire : `code de sortie : 3`, réserve nommée, restauré → 0. Cette
 * moitié-là n'est PAS gardée en continu, et il faut le savoir.
 */

const RACINE = join(__dirname, '..', '..', '..', '..');
const SEED = join(RACINE, 'scripts', 'seed-demo.mjs');
const SOURCE = readFileSync(SEED, 'utf-8');

/** Le CODE du seed — commentaires dépouillés. */
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(?<!:)\/\/[^\n]*/g, ' ');

/** Exécute le seed et rend { code, sortie }. Le garde-fou refuse avant tout travail. */
function lancer(env: Record<string, string | undefined>, cwd = RACINE) {
  try {
    const sortie = execFileSync('node', [SEED], {
      cwd,
      encoding: 'utf-8',
      timeout: 60_000,
      env: { ...process.env, ...env } as NodeJS.ProcessEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, sortie };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? -1, sortie: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

describe('🔴 ② LE GARDE-FOU MESURE LE DÉPLOIEMENT — par l’effet', () => {
  it('⭐⭐ LE CAS EXACT DE LA DÉMO : auto-adresse locale, déploiement PUBLIC → REFUS', () => {
    // C'est la combinaison qui a laissé le seed tourner sur un serveur public.
    const r = lancer({
      APP_URL: 'https://demo.exemple.org',
      SEED_API_URL: 'http://localhost:4000',
      SEED_FORCE: undefined,
    });
    expect(r.code, 'le seed a tourné sur un déploiement public').toBe(2);
    expect(r.sortie).toMatch(/DÉPLOIEMENT NON LOCAL/);
    // ⚠ Et le message NOMME l'auto-adresse pour que la confusion ne revienne
    // pas : sans ça, le prochain lecteur refera le même raisonnement.
    expect(r.sortie).toMatch(/localhost:4000/);
  });

  it('🔴 APP_URL absente → INDÉCIDABLE, pas « locale »', () => {
    // ⚠ Hors du dépôt : `loadEnvIfPresent()` cherche `.env` dans le répertoire
    // COURANT, et depuis la racine il en trouverait un qui repose APP_URL —
    // mon premier relevé mesurait ainsi son propre bac, pas le produit.
    const r = lancer({ APP_URL: undefined, SEED_FORCE: undefined }, tmpdir());
    expect(r.code, 'un garde qui n’a pas pu mesurer ne dit jamais « bon »').toBe(2);
    expect(r.sortie).toMatch(/INDÉCIDABLE/);
  });

  it('⚠ TÉMOIN D’ABSENCE — le garde ne décide PAS sur SEED_API_URL', () => {
    // La régression exacte : remettre l'auto-adresse au centre de la décision.
    const decision = CODE.slice(CODE.indexOf('const DEPLOIEMENT'), CODE.indexOf('const PASSWORD'));
    expect(decision, 'la décision est revenue sur l’auto-adresse du script').not.toMatch(
      /test\(\s*API\s*\)|EST_LOCAL\s*=.*\bAPI\b/,
    );
    expect(decision, 'la décision doit porter sur APP_URL').toMatch(/APP_URL/);
  });
});

describe('🔴 ① UN PAS SAUTÉ CHANGE LA CONCLUSION ET LE CODE DE SORTIE', () => {
  it('⭐ chaque pas sauté passe par `reserver()` — population DÉRIVÉE du fichier', () => {
    // ⚠ On ne redit pas la liste des sections ici : on CHERCHE les formes qui
    // annoncent un saut, et on exige qu'aucune ne subsiste hors de `reserver`.
    // Une section ajoutée demain avec « section ignorée » entre d'elle-même
    // dans la propriété.
    const sauts = [...CODE.matchAll(/console\.log\([^)]*ignor[ée]e?[^)]*\)/g)].map((m) => m[0]);
    expect(
      sauts,
      'un saut annoncé par un simple console.log ne change pas la conclusion',
    ).toEqual([]);
    expect(
      (CODE.match(/reserver\(/g) ?? []).length,
      'aucun appel à reserver() : le registre n’est pas branché',
    ).toBeGreaterThanOrEqual(3);
  });

  it('🔴 la conclusion DÉPEND des réserves — « prête » n’est plus inconditionnel', () => {
    expect(CODE).toMatch(/RESERVES\.length\s*>\s*0/);
    expect(CODE, 'la conclusion avec réserve doit être nommée').toMatch(/AVEC RÉSERVE/);
    // Et la conclusion sans réserve n'est atteignable que dans l'autre branche.
    const i = CODE.indexOf('RESERVES.length > 0');
    const j = CODE.indexOf('Démo prête — aucun pas sauté');
    expect(j, 'la conclusion « aucun pas sauté » a disparu').toBeGreaterThan(-1);
    expect(j, 'elle doit suivre le test des réserves, donc vivre dans son `else`').toBeGreaterThan(i);
  });

  it('⭐⭐ ET LE CODE DE SORTIE TOMBE — sinon un appelant conclut au succès', () => {
    // ⚠ C'est l'exigence du responsable : « rendre le login bibliothécaire
    // indisponible doit faire TOMBER son code de sortie, pas seulement
    // imprimer une ligne ». Un `set -e`, une CI ou un `&&` ne regardent que le
    // code.
    expect(CODE, 'les réserves n’affectent pas le code de sortie').toMatch(
      /RESERVES\.length\s*>\s*0\s*\)\s*process\.exit\(3\)/,
    );
  });

  it('⚠ et la réindexation REGARDE la réponse de l’API', () => {
    // Le quatrième défaut, trouvé en corrigeant le premier : `await fetch(...)`
    // sans lire `ok` annonçait « catalogue réindexé » sur un refus.
    const i = CODE.indexOf('cataloging/reindex');
    expect(i).toBeGreaterThan(0);
    const apres = CODE.slice(i, i + 400);
    expect(apres, 'le résultat du fetch de réindexation n’est pas lu').toMatch(/\.ok\b/);
  });
});
