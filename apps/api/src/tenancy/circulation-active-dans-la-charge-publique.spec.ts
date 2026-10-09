/**
 * `circulationActive` EST UN BOOLÉEN, SUR LES DEUX ROUTES PUBLIQUES.
 *
 * Contrat demandé par la session mobile le 8 octobre 2026, et ce fichier le
 * GÈLE — parce que la propriété qui compte n'est pas « le champ existe » mais
 * « le champ n'est JAMAIS ni omis ni `null` », et qu'aucun test de valeur ne
 * la porte.
 *
 * ⚠ POURQUOI PAS `GET /modules`. Mesuré par eux : elle rend **401 sans jeton**.
 * Une application qui n'a pas encore de session ne peut donc pas savoir si cet
 * établissement tient un comptoir — et sans le savoir, elle promet « étagère »
 * et « prêt » à des étudiants qui n'ont pas de rayonnages.
 *
 * ⚠ ET POURQUOI DEUX ROUTES, qui est la partie qu'on retirerait par souci de
 * simplicité : `current` sert les pages publiques et l'OPAC anonyme ; le
 * DESCRIPTEUR est mis en cache par l'application et reste lisible HORS LIGNE.
 * Les deux besoins ne se recouvrent pas, et retirer le second rendrait le
 * champ inutile à l'usage pour lequel il a été demandé.
 *
 * ⚠ 🔴 ET LE PIÈGE QUI A ÉTÉ NOMMÉ AVANT D'ÊTRE POSÉ : `null` ou l'absence ne
 * veulent PAS dire « pas de circulation ». L'absence porte déjà un AUTRE sens
 * dans ce produit — `availability: null` signifie « vous êtes anonyme, je ne
 * vous le dis pas ». Un client qui lirait l'absence comme un `false`
 * amputerait le menu d'une vraie bibliothèque au premier champ oublié : trois
 * états dans un champ qui n'en admet que deux, c'est une ambiguïté qu'aucun
 * client ne peut lever.
 */
import { describe, expect, it, vi } from 'vitest';
import { TenancyController } from './tenancy.controller';

const TENANT = { id: 't1', slug: 'zinda', name: 'Zinda' } as never;

/** Les deux routes du contrat, et ce que chacune sert. */
const ROUTES = {
  current: 'identité publique de l’école (pages publiques, OPAC anonyme)',
  descriptor: 'descripteur de connexion — MIS EN CACHE par l’app, lisible hors ligne',
};

function controleur(circulationActive: boolean) {
  const estActif = vi.fn(async (_id: string, moduleId: string) =>
    moduleId === 'circulation' ? circulationActive : true,
  );
  const ctrl = new TenancyController(
    {
      tenant: { findUnique: async () => ({ name: 'Zinda', settings: {} }) },
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {
      get: (cle: string) =>
        cle === 'API_PUBLIC_URL' ? 'http://localhost:4000' : 'http://localhost:3000',
    } as never,
    { estActif } as never,
  );
  return { ctrl, estActif };
}

describe('`circulationActive` dans la charge publique', () => {
  for (const [route, role] of Object.entries(ROUTES)) {
    it(`⚠ ${route} — un BOOLÉEN, jamais une absence (${role})`, async () => {
      for (const attendu of [true, false]) {
        const { ctrl } = controleur(attendu);
        const r = (await (ctrl as unknown as Record<string, (t: unknown) => Promise<unknown>>)[
          route
        ](TENANT)) as Record<string, unknown>;

        expect(
          Object.keys(r),
          `\`${route}\` doit TOUJOURS porter circulationActive. Omis, le client ` +
            'lit l’absence — qui veut déjà dire autre chose dans ce produit.',
        ).toContain('circulationActive');
        expect(
          typeof r.circulationActive,
          'ni null, ni undefined, ni une chaîne : un booléen',
        ).toBe('boolean');
        expect(r.circulationActive).toBe(attendu);
      }
    });
  }

  it('🔴 les deux routes lisent le MÊME module, et le nomment', async () => {
    // Témoin d'absence : sans lui, une route qui rendrait `true` en dur serait
    // indiscernable d'une route juste — les assertions ci-dessus le verraient
    // (elles éprouvent les deux valeurs), mais rien ne dirait qu'on interroge
    // bien `circulation` et non un module voisin.
    for (const route of Object.keys(ROUTES)) {
      const { ctrl, estActif } = controleur(true);
      await (ctrl as unknown as Record<string, (t: unknown) => Promise<unknown>>)[route](TENANT);
      expect(
        estActif.mock.calls.map(([, moduleId]) => moduleId),
        `\`${route}\` doit demander l’état de « circulation », pas d’autre chose`,
      ).toContain('circulation');
      expect(estActif.mock.calls[0][0], 'et pour CETTE école').toBe('t1');
    }
  });

  it('⚠ le refus d’API_PUBLIC_URL NOMME la variable et dit quoi faire', async () => {
    // Un `400` nu sur cette route envoie chercher dans le code. Mesuré le
    // 8 octobre 2026 : c'est ce qu'un développeur a obtenu en développement,
    // où la variable n'était pas dans `.env.example`.
    const { ctrl } = controleur(true);
    (ctrl as unknown as { config: { get: (c: string) => string | undefined } }).config = {
      get: () => undefined,
    };
    await expect(ctrl.descriptor(TENANT)).rejects.toThrow(/API_PUBLIC_URL/);
    const message = await ctrl.descriptor(TENANT).catch((e: Error) => e.message);
    // Le nom de la variable NE SUFFIT PAS : le message doit dire où la poser.
    expect(message, 'il doit nommer le fichier à modifier').toMatch(/\.env/);
    expect(message, 'et donner une valeur de départ').toMatch(/localhost:4000/);
  });
});
