/**
 * LES ÉCRANS PUBLICS SONT PUBLICS DANS LE MIDDLEWARE — pas seulement dans
 * l'intention.
 *
 * ⚠ CE GARDE REJOUE UN DÉFAUT TROUVÉ PAR UNE RECETTE le 9 octobre 2026, et
 * qu'aucun test ne pouvait voir. `/mentions-legales` et `/confidentialite`
 * rendaient **307** — redirigées vers `/login`. Or le pied de page affiche leur
 * lien dès qu'elles sont publiées : un visiteur qui cliquait « Mentions
 * légales » tombait sur un écran de connexion.
 *
 * > ⭐ **Des mentions légales derrière un mur d'authentification ne sont pas des
 * > mentions légales.** Et c'est la seule classe d'écrans de ce produit dont le
 * > public EST le dehors : les voir connecté ne dit rien.
 *
 * ⚠ POURQUOI MES DOUZE CAS NE L'ONT PAS VU : ils montaient le COMPOSANT, et le
 * middleware n'est pas dans ce qu'on monte. C'est « il existe des défauts
 * qu'aucun test unitaire ne peut atteindre » et « vérifier connecté ne dit rien
 * de ce que voit le public », les deux à la fois.
 *
 * ⚠ ET CE GARDE NE REMPLACE PAS LA RECETTE : il affirme qu'une route est dans la
 * liste, pas qu'un navigateur sans cookie obtient autre chose qu'un 307. La
 * mesure du dehors reste la seule qui voie le dehors — elle est dans
 * `docs/recette-bibliotheque-sans-rayon.md`.
 */
import { describe, expect, it } from 'vitest';
import { CHEMINS_PUBLICS_POUR_TEST, PREFIXES_PUBLICS_POUR_TEST } from '@/middleware';

/**
 * Les écrans dont le public EST le dehors — avec leur motif, parce qu'une liste
 * sans motif est un endroit où l'on enterre les trouvailles.
 */
const PUBLICS_PAR_NATURE: Record<string, string> = {
  '/mentions-legales':
    'obligation d’un établissement public, et son lien est affiché dans le pied dès ' +
    'qu’elle est publiée. Derrière une authentification, elle ne remplit pas son office.',
  '/confidentialite':
    'idem — et c’est la page qu’un visiteur consulte AVANT de créer un compte, donc ' +
    'précisément quand il n’en a pas.',
  '/installation':
    'sur une instance neuve il n’existe AUCUN compte : rediriger vers /login la rendrait ' +
    'ininstallable. Ce qui la protège est le jeton d’amorçage, et l’API qui refuse ses ' +
    'routes — on ne cache rien, c’est l’API qui refuse.',
};

const estPublic = (route: string) =>
  CHEMINS_PUBLICS_POUR_TEST.includes(route) ||
  PREFIXES_PUBLICS_POUR_TEST.some((p) => route.startsWith(p));

describe('les écrans publics par nature le sont dans le middleware', () => {
  it('⚠ témoin de COMPTE : les deux listes du middleware ne sont pas vides', () => {
    // Sans lui, des listes vidées rendraient `estPublic` toujours faux et le cas
    // suivant échouerait en accusant les routes — ou, si on l'écrivait à
    // l'envers, toujours vrai et il ne mesurerait rien.
    expect(PREFIXES_PUBLICS_POUR_TEST.length).toBeGreaterThan(3);
    expect(CHEMINS_PUBLICS_POUR_TEST.length).toBeGreaterThan(0);
  });

  it.each(Object.keys(PUBLICS_PAR_NATURE))('%s est public', (route) => {
    expect(
      estPublic(route),
      `${route} n’est pas dans les listes publiques du middleware : un visiteur sans ` +
        `cookie est REDIRIGÉ vers /login. Motif pour lequel cette route doit être ` +
        `publique — ${PUBLICS_PAR_NATURE[route]}`,
    ).toBe(true);
  });

  it('⚠ témoin d’ABSENCE, sur la confusion plausible', () => {
    // Un écran d'administration ne doit PAS être public. Sans ce témoin, une
    // liste élargie par mégarde à `/` rendrait tout public et les cas ci-dessus
    // passeraient pour justes.
    expect(estPublic('/admin/pages-legales')).toBe(false);
    expect(estPublic('/admin/catalogue')).toBe(false);
    expect(estPublic('/mes-consultations')).toBe(false);
  });

  it('⚠ chaque entrée porte son MOTIF, et il est lisible', () => {
    for (const [route, motif] of Object.entries(PUBLICS_PAR_NATURE)) {
      expect(motif.length, `${route} : une exception sans motif est un oubli`).toBeGreaterThan(60);
    }
  });
});
