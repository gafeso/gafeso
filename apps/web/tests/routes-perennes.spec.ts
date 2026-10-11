/**
 * ⭐⭐ LES DEUX ADRESSES QUE DES QR IMPRIMÉS PORTENT — VALIDES POUR TOUJOURS.
 *
 * ## ⚠ CE QUE CE GARDE EXISTE POUR EMPÊCHER
 *
 * `/opac/<id>` et `/opac/resoudre/<identifiant>` sont **imprimées** : sur des
 * étiquettes collées dans des livres, sur des affiches dans des couloirs. Elles
 * ne se reprennent pas — **on ne décolle pas huit mille étiquettes.**
 *
 * Un renommage de dossier, une réorganisation « plus propre », un passage de
 * `/opac/` à `/catalogue/` : chacun de ces gestes est raisonnable en soi, se
 * relit sans effort dans un diff, et casse un fonds entier. Rien, dans le code,
 * ne dit qu'une route est imprimée — **sauf ce fichier.**
 *
 * ⭐ Et ce dépôt a déjà payé la version faible de ce défaut : des `href`
 * pointant vers `/catalogue/:id`, un dossier qui n'a jamais existé, sur l'écran
 * « Mes encadrements ». Là, le lien menait à un 404 qu'un clic révélait. Ici le
 * lien vit sur du PAPIER, et personne ne le reverra.
 *
 * ## ⚠ POURQUOI UN TEST DE FICHIERS, et non un test de rendu
 *
 * Un test de rendu monte le composant qu'on lui désigne : il ne sait rien du
 * dossier où il vit, donc il survit à un renommage. C'est précisément le geste
 * qu'on veut barrer. L'invariant se tient donc sur les CHEMINS SUR LE DISQUE —
 * et, pour la publicité, sur la liste du MIDDLEWARE, qui est la seule chose qui
 * sépare une page publique d'une redirection vers `/login`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  CHEMINS_PUBLICS_POUR_TEST,
  PREFIXES_PUBLICS_POUR_TEST,
} from '@/middleware';

const RACINE = path.resolve(__dirname, '..');
const existe = (rel: string) => fs.existsSync(path.join(RACINE, rel));

/**
 * LES ROUTES PÉRENNES, et le MOTIF de leur permanence.
 *
 * ⚠ Une entrée ne se retire JAMAIS de cette liste. Si une adresse doit
 * disparaître de l'application, elle doit d'abord continuer de RÉPONDRE — une
 * redirection, une page qui explique — aussi longtemps que des exemplaires
 * étiquetés circulent. C'est-à-dire : indéfiniment.
 */
const PERENNES = [
  {
    route: '/opac/[id]',
    fichier: 'app/opac/[id]/page.tsx',
    porte: 'le QR des affiches A4 et l’adresse publique servie par l’API (`publicUrl`)',
  },
  {
    route: '/opac/resoudre/[identifiant]',
    fichier: 'app/opac/resoudre/[identifiant]/page.tsx',
    porte:
      'l’identifiant pérenne `oai:<école>:<uuid>`, publié depuis P4-3 dans les ' +
      'en-têtes OAI et `dc:identifier` — des moissonneurs extérieurs l’ont ' +
      'peut-être stocké',
  },
] as const;

describe('⭐⭐ les adresses IMPRIMÉES restent valides POUR TOUJOURS', () => {
  it.each(PERENNES)('$route existe sur le disque', ({ route, fichier, porte }) => {
    expect(
      existe(fichier),
      `🔴 ${route} A DISPARU (${fichier}).\n` +
        `Cette adresse est IMPRIMÉE : elle porte ${porte}.\n` +
        `Des QR codes collés dans des livres et affichés dans des couloirs y ` +
        `pointent, et ils ne se reprennent pas — on ne décolle pas huit mille ` +
        `étiquettes.\n` +
        `⚠ DEUX ISSUES, et « la renommer » n'en est pas une :\n` +
        `  · si vous déplacez l'écran, LAISSEZ une page à cette adresse qui ` +
        `redirige vers la nouvelle ;\n` +
        `  · si l'écran disparaît, laissez une page qui EXPLIQUE — un 404 nu ` +
        `sur une étiquette collée dans un livre n'apprend rien à qui tient ce ` +
        `livre.`,
    ).toBe(true);
  });

  /**
   * ⚠ LA SECONDE MOITIÉ : exister ne suffit pas, il faut RÉPONDRE SANS COOKIE.
   *
   * Ce dépôt a payé cette distinction le 9 octobre 2026 : les deux pages
   * légales existaient, avec leur `generateMetadata`, et rendaient **307 vers
   * /login** — elles manquaient aux préfixes publics du middleware. Un garde
   * qui ne vérifie que l'existence aurait été vert.
   *
   * ⚠ Et pour une adresse IMPRIMÉE, un 307 vers `/login` est pire qu'un 404 :
   * le lecteur croit qu'il doit un compte pour voir une notice publique.
   */
  it.each(PERENNES)('$route est déclarée PUBLIQUE au middleware', ({ route }) => {
    const motif = route.replace(/\[[^\]]+\]/g, 'x');
    const publique =
      CHEMINS_PUBLICS_POUR_TEST.includes(motif) ||
      PREFIXES_PUBLICS_POUR_TEST.some((p) => motif.startsWith(p));
    expect(
      publique,
      `🔴 ${route} n'est pas publique : elle rendrait 307 vers /login.\n` +
        `C'est une adresse IMPRIMÉE — ajoutez son préfixe à PUBLIC_PREFIXES ` +
        `dans middleware.ts.`,
    ).toBe(true);
  });

  /**
   * ⭐ LE TÉMOIN D'ABSENCE : ce garde doit SAVOIR dire non.
   *
   * Deux assertions vertes sur deux routes qui existent ne prouvent rien si la
   * mécanique accepte n'importe quoi. On lui soumet donc une route qui
   * n'existe PAS et une qui n'est PAS publique — et il doit les refuser.
   *
   * ⚠ Et le second cas est la confusion PLAUSIBLE : `/admin/catalogue` existe
   * bel et bien, et n'est pas publique. Un témoin sur un chemin inventé ne
   * prouverait rien — personne ne l'écrirait.
   */
  it('⚠ témoin d’ABSENCE : il refuse une route inexistante et une route privée', () => {
    expect(existe('app/catalogue/[id]/page.tsx')).toBe(false);
    expect(existe('app/admin/catalogue/page.tsx')).toBe(true);
    const privee = '/admin/catalogue';
    expect(
      CHEMINS_PUBLICS_POUR_TEST.includes(privee) ||
        PREFIXES_PUBLICS_POUR_TEST.some((p) => privee.startsWith(p)),
      'le contrôle de publicité accepte un écran d’administration : il ne mesure rien',
    ).toBe(false);
  });

  it('⚠ témoin de COMPTE : deux routes pérennes, et pas une de moins', () => {
    // Une entrée ne se RETIRE jamais : si ce compte baisse, quelqu'un a décidé
    // qu'une adresse imprimée pouvait cesser de répondre.
    expect(
      PERENNES.length,
      'une route pérenne a été RETIRÉE de la liste — c’est précisément ce que ' +
        'ce fichier existe pour empêcher',
    ).toBe(2);
    for (const p of PERENNES) {
      expect(p.porte.length, `${p.route} n’a pas de motif écrit`).toBeGreaterThan(40);
    }
  });
});
