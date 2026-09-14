import { describe, expect, it, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  PREFIXES_PUBLICS_POUR_TEST,
  CHEMINS_PUBLICS_POUR_TEST,
} from '@/middleware';

/**
 * ⚠ TOUTE PAGE PUBLIQUE DOIT NOMMER LA BIBLIOTHÈQUE À LAQUELLE ELLE APPARTIENT.
 *
 * Le 14 septembre 2026, elles ne le faisaient pas : un balayage du chemin
 * public SANS COOKIE a montré `<title>Gafeso</title>` — le nom du PRODUIT — sur
 * toutes les pages sauf l'accueil. Une notice dont le `<h1>` disait « Textiles
 * et motifs en Afrique de l'Ouest » s'annonçait « Gafeso » dans l'onglet, dans
 * un signet et dans l'index d'un moteur.
 *
 * ⚠ LE GESTE QUI VIOLERA CE GARDE, écrit ici parce qu'il est raisonnable :
 * quelqu'un ajoutera une page publique — une page d'aide, un plan du site, une
 * collection mise en avant — et ne pensera pas au titre d'onglet, PARCE QU'ON
 * NE LE VOIT PAS EN TRAVAILLANT. On regarde la page, pas l'onglet ; et en
 * développement l'onglet dit déjà quelque chose de plausible. Ce garde le dira
 * à sa place.
 *
 * ⚠ CE QU'IL NE PEUT PAS FAIRE, et c'est mesuré : il ne SERT pas les pages. Il
 * vérifie qu'un titre est DÉCLARÉ dans la chaîne des gabarits, pas que la
 * chaîne composée est juste — la composition dépend de la sémantique de Next
 * (un `title` en chaîne simple remet le gabarit à zéro pour les descendants),
 * qui a produit deux défauts successifs le jour même et que SEUL un relevé des
 * pages servies a montrés. Cette moitié-là reste une mesure à refaire quand on
 * touche à la composition.
 */

const RACINE = path.resolve(__dirname, '..');

/** Les segments d'`app/` qui répondent aux chemins publics DU MIDDLEWARE. */
function segmentsPublics(): string[] {
  const pages: string[] = [];
  const parcourir = (rel: string) => {
    for (const e of fs.readdirSync(path.join(RACINE, 'app', rel), { withFileTypes: true })) {
      if (e.isDirectory()) parcourir(path.join(rel, e.name));
      else if (e.name === 'page.tsx') pages.push(rel === '.' ? '/' : `/${rel}`);
    }
  };
  parcourir('.');

  // ⚠ La liste vient du MIDDLEWARE, pas d'une copie : c'est la seule chose qui
  // sépare réellement une page publique d'une redirection vers /login.
  // Un segment dynamique `[x]` répond à n'importe quel chemin — on compare donc
  // sur une forme normalisée, pas sur l'égalité littérale.
  const estPublic = (route: string) => {
    const motif = route.replace(/\[[^\]]+\]/g, 'x');
    return (
      CHEMINS_PUBLICS_POUR_TEST.includes(motif) ||
      PREFIXES_PUBLICS_POUR_TEST.some((p) => motif.startsWith(p))
    );
  };
  return pages.filter(estPublic).sort();
}

/**
 * ⚠ DEUX LISTES, ET C'EST LA FORME QUI COMPTE — pas un balayage.
 *
 * Un balayage « chaque page a-t-elle un titre ? » répondait OUI À TOUT : depuis
 * que le gabarit RACINE en déclare un, toute route en hérite. Le témoin
 * d'ABSENCE l'a montré ; ma relecture, non. Un instrument qui ne sait pas dire
 * non est indiscernable d'un instrument juste, et plus rassurant.
 *
 * L'obligation, elle, ne se périme pas : une page publique neuve n'est dans
 * aucune des deux listes, et le test dit quoi faire.
 */

/** Pages dont le titre doit porter un segment PROPRE, déclaré sous la racine. */
const TITRE_PROPRE = [
  '/definir-mot-de-passe',
  '/inscription',
  '/login',
  '/opac',
  '/opac/[id]',
  '/opac/[id]/lire',
  '/opac/auteurs',
  '/opac/auteurs/[id]',
];

/**
 * Pages où le NOM DE L'ÉCOLE SEUL est le bon titre — avec son motif, parce
 * qu'une exception sans motif est un endroit où l'on enterre les trouvailles.
 */
const NOM_DE_L_ECOLE_SUFFIT: Record<string, string> = {
  '/': "l'accueil EST la bibliothèque ; « Accueil · École » serait une redite",
  '/e/[slug]':
    "page d'atterrissage d'un QR, lue debout devant une affiche : ce qu'il faut " +
    "lire dans l'onglet est le nom de l'établissement, pas celui du segment. " +
    "Et le nom vient du HOST, pas du slug — la page l'a déjà tranché.",
};

/** Un titre déclaré SOUS la racine — le gabarit racine ne compte pas. */
function titrePropre(route: string): string | null {
  const segments = route === '/' ? [] : route.split('/').filter(Boolean);
  for (let i = segments.length; i >= 1; i--) {
    const rel = segments.slice(0, i).join('/');
    for (const f of ['page.tsx', 'layout.tsx']) {
      const abs = path.join(RACINE, 'app', rel, f);
      if (!fs.existsSync(abs)) continue;
      if (/export (async )?function generateMetadata|export const metadata/.test(
        fs.readFileSync(abs, 'utf8'),
      )) return `app/${rel}/${f}`;
    }
  }
  return null;
}

describe('Chaque page publique nomme sa bibliothèque', () => {
  it('⚠ les deux listes couvrent EXACTEMENT les pages publiques', () => {
    // Témoin de COMPTE. Une page publique neuve tombe ici, et ce test convoque
    // quelqu'un pour décider laquelle des deux listes la reçoit. Il ne dit pas
    // qu'elle est fautive — il oblige à revenir la regarder.
    expect([...TITRE_PROPRE, ...Object.keys(NOM_DE_L_ECOLE_SUFFIT)].sort()).toEqual(
      segmentsPublics(),
    );
  });

  it.each(TITRE_PROPRE)('%s déclare son propre titre', (route) => {
    expect(
      titrePropre(route),
      `Aucun titre PROPRE pour ${route}. Elle hériterait du seul nom de l'école, ` +
        `alors qu'elle est publique : son titre part dans un signet et dans ` +
        `l'index d'un moteur. Deux issues — exporter \`generateMetadata\` si la ` +
        `page est un composant serveur, sinon poser un \`layout.tsx\` à côté qui ` +
        `appelle \`metadonneesDeSection\`. Si le nom de l'école SUFFIT vraiment, ` +
        `déplacer la route dans NOM_DE_L_ECOLE_SUFFIT avec son motif.`,
    ).not.toBeNull();
  });

  it('⚠ témoin d’ABSENCE : le relevé sait dire NON', () => {
    // Le cas plausible, pas un cas inventé : `/e/[slug]` est une vraie page
    // publique qui ne déclare AUCUN titre propre — et c'est voulu. Sans ce
    // témoin, un relevé qui répond oui à tout passerait pour juste.
    expect(titrePropre('/e/[slug]')).toBeNull();
    expect(Object.keys(NOM_DE_L_ECOLE_SUFFIT)).toContain('/e/[slug]');
  });

  it('⚠ chaque exception porte son MOTIF, et il est lisible', () => {
    for (const [route, motif] of Object.entries(NOM_DE_L_ECOLE_SUFFIT)) {
      expect(motif.length, `${route} : une exception sans motif est un oubli`).toBeGreaterThan(30);
    }
  });
});

describe('Le titre ne devine jamais l’école', () => {
  beforeEach(() => vi.resetModules());

  async function titres(home: unknown) {
    vi.doMock('@/lib/server-api', () => ({ fetchTenantHome: async () => home }));
    return import('@/lib/titre-onglet');
  }

  it('quand l’école résout : elle est le défaut, et le gabarit du reste', async () => {
    const { metadonneesRacine, metadonneesDeSection } = await titres({
      name: 'Zinda',
      content: { identity: { fullName: 'Université d’Exemple', lead: 'Bienvenue' } },
    });
    expect(await metadonneesRacine()).toMatchObject({
      title: { default: 'Université d’Exemple', template: '%s · Université d’Exemple' },
      description: 'Bienvenue',
    });
    // ⚠ Le segment reste NU : un `default` est repassé au gabarit du parent, et
    // composer l'école ici la ferait apparaître deux fois.
    expect(await metadonneesDeSection('Catalogue')).toMatchObject({
      title: { default: 'Catalogue', template: '%s · Université d’Exemple' },
    });
  });

  it('⚠ quand elle NE résout PAS : aucun nom d’école n’est inventé', async () => {
    // `null` couvre l'hôte inconnu ET l'API injoignable. Dans les deux cas on
    // ignore de quelle bibliothèque il s'agit — et un titre qui en nomme une
    // autre part dans un signet et y reste.
    const { metadonneesRacine, metadonneesDeSection } = await titres(null);
    const racine = await metadonneesRacine();
    expect(racine.title).toBe('Gafeso');
    expect(JSON.stringify(racine)).not.toMatch(/Exemple|Horizon/);
    expect((await metadonneesDeSection('Catalogue')).title).toBe('Catalogue');
  });
});
