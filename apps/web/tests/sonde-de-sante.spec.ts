import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PREFIXES_PUBLICS_POUR_TEST, CHEMINS_PUBLICS_POUR_TEST } from '@/middleware';

/**
 * ⚠ LA SONDE DE SANTÉ DU CONTENEUR `web` NE DOIT RIEN MESURER D'AUTRE QUE LUI.
 *
 * Elle interrogeait `/`. Le rendu serveur de l'accueil transmet le Host à
 * l'API pour résoudre l'école ; la sonde parle depuis 127.0.0.1, qui n'est le
 * domaine d'aucun établissement. L'API journalisait donc un avertissement
 * JUSTE toutes les dix secondes — 8 640 par jour, et un avertissement qu'on
 * lit 8 640 fois par jour ne se lit plus le jour où il porte.
 *
 * ⚠ CE GARDE PORTE L'INVARIANT, PAS LE CHEMIN CORRIGÉ. Il lit l'URL réellement
 * déclarée dans `docker/docker-compose.prod.yml` — la valeur qui sera déployée,
 * jamais une copie — et vérifie trois propriétés que la correction d'hier
 * satisfait par hasard et que la prochaine pourrait rompre :
 *
 *  1. la cible n'est pas une page rendue au serveur ;
 *  2. son gestionnaire n'appelle RIEN (ni l'API, ni la base) ;
 *  3. elle est publique côté middleware — sinon la sonde reçoit une redirection
 *     vers /login et le conteneur est déclaré malsain pour toujours.
 *
 * La troisième est celle qu'on oublie : un chemin de santé derrière
 * l'authentification échoue d'une manière qui ressemble à une panne du serveur.
 *
 * ⚠ Les trois portent sur LA MÊME valeur — le chemin lu dans le compose —, donc
 * un chemin fautif en fait tomber plusieurs d'un coup. C'est mesuré, pas
 * supposé : les contrôles négatifs « retour à `/` » et « chemin non public »
 * font tomber trois assertions, celui qui remet un appel dans le gestionnaire
 * n'en fait tomber qu'une. La cascade est une conséquence de l'enchaînement,
 * pas un test qui déborde.
 */

const RACINE = join(__dirname, '..', '..', '..');
const COMPOSE = readFileSync(join(RACINE, 'docker', 'docker-compose.prod.yml'), 'utf8');

/** Les URL de sonde déclarées dans le compose de production, dans l'ordre. */
function urlsDeSonde(): string[] {
  return [...COMPOSE.matchAll(/test:\s*\[.*?"(https?:\/\/[^"]+)"\s*\]/g)].map((m) => m[1]);
}

describe("L'instrument : le relevé des sondes du compose de production", () => {
  it('⚠ il en trouve EXACTEMENT trois — meilisearch, api, web', () => {
    // ⚠ TÉMOIN QUI COMPTE, et pas « au moins une » — et il a fait son office
    // en tombant : j'avais écrit DEUX, oubliant la sonde de Meilisearch, qui
    // est HTTP elle aussi. Un témoin de présence aurait confirmé l'instrument
    // dans mon erreur. Le jour où un quatrième service reçoit une sonde HTTP,
    // ce compte oblige à revenir ici et à se demander si elle traverse, elle
    // aussi, un chemin qu'elle ne devrait pas.
    //
    // Les sondes non-HTTP (pg_isready, mc ready) restent hors du relevé, et
    // c'est voulu : elles ne peuvent mesurer qu'elles-mêmes.
    const urls = urlsDeSonde();
    expect(urls).toHaveLength(3);
    // Témoins de PRÉSENCE : le relevé voit bien ce qu'on sait y être.
    expect(urls.some((u) => u.includes(':7700/health'))).toBe(true);
    expect(urls.some((u) => u.includes(':4000/health'))).toBe(true);
    expect(urls.some((u) => u.includes(':3000'))).toBe(true);
  });
});

describe('⚠ La sonde de `web` ne traverse pas le chemin qui résout un établissement', () => {
  const url = urlsDeSonde().find((u) => u.includes(':3000'))!;
  const chemin = new URL(url).pathname;

  it('⚠ elle n’interroge PAS la page d’accueil', () => {
    // C'est le défaut exact qui a été mesuré sur la démo en service.
    expect(chemin, 'la sonde est revenue sur une page rendue au serveur').not.toBe('/');
  });

  it('sa cible est un gestionnaire de route, et il existe', () => {
    const fichier = join(__dirname, '..', 'app', chemin.replace(/^\//, ''), 'route.ts');
    expect(existsSync(fichier), `${fichier} est déclaré dans le compose et n’existe pas`).toBe(
      true,
    );
  });

  it('⚠ ce gestionnaire n’appelle RIEN — ni l’API, ni un rendu de page', () => {
    // La propriété n'est pas « le fichier est court » mais « il ne sort pas de
    // lui-même ». Un appel quelconque ramènerait le défaut sous un autre nom :
    // la sonde redeviendrait une mesure de l'API, et Docker redémarrerait le
    // conteneur qui va bien.
    const source = readFileSync(
      join(__dirname, '..', 'app', chemin.replace(/^\//, ''), 'route.ts'),
      'utf8',
    );
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code, 'la sonde appelle l’API').not.toMatch(/server-api|apiUrl/);
    expect(code, 'la sonde émet une requête').not.toMatch(/\bfetch\s*\(/);
  });

  it('⚠ et elle est PUBLIQUE — sinon elle reçoit /login et le conteneur reste malsain', () => {
    const publique =
      CHEMINS_PUBLICS_POUR_TEST.includes(chemin) ||
      PREFIXES_PUBLICS_POUR_TEST.some((p) => chemin.startsWith(p));
    expect(publique, `${chemin} n’est pas public : la sonde sera redirigée`).toBe(true);
  });
});
