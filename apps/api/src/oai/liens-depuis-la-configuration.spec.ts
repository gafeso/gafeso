import { describe, expect, it, vi } from 'vitest';
import { OaiController } from './oai.controller';

/**
 * ⚠ CORRIGÉ le 20 octobre 2026 : `baseUrl`/`publicHost`/`adminEmail` lisaient
 * le Host REÇU (`req.get('host')`, `x-forwarded-host`) — un Host FORGÉ y
 * ressortait identique, dans le corps XML renvoyé à n'importe quel
 * moissonneur. Ce fichier prouve qu'ils viennent désormais de la
 * CONFIGURATION (`APP_URL`) et du domaine PRINCIPAL du tenant RÉSOLU (en
 * base), jamais d'une requête — le contrôleur n'accepte même plus de requête
 * en paramètre de ces méthodes.
 *
 * ⚠ TÉMOIN NÉGATIF : réintroduire la lecture du Host dans `publicHost` (en
 * revenant à l'ancienne forme) fait tomber le premier test — fait, vérifié.
 */
describe('OaiController — les liens absolus viennent de la configuration, jamais du Host', () => {
  const tenant = { id: 't1', slug: 'zinda', name: 'École Zinda' };

  function construireControleur(options: {
    domainePrincipal?: string | null;
    appUrl?: string;
    contactSaisi?: string | null;
  }) {
    const prisma = {
      tenant: {
        findUnique: vi.fn().mockResolvedValue({
          domains: options.domainePrincipal ? [{ domain: options.domainePrincipal }] : [],
        }),
      },
      tenantSettings: {
        findUnique: vi.fn().mockResolvedValue({
          homepageContent: options.contactSaisi
            ? { contact: { email: options.contactSaisi } }
            : null,
        }),
      },
      forTenant: vi.fn().mockReturnValue({}),
    };
    const oai = { handle: vi.fn().mockResolvedValue('<xml/>') };
    const config = { get: vi.fn().mockReturnValue(options.appUrl) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const controller = new OaiController(oai as any, prisma as any, config as any);
    return { controller, oai, prisma };
  }

  it('⭐ adminEmail de repli porte le domaine PRINCIPAL du tenant, jamais un Host forgé', async () => {
    const { controller, oai } = construireControleur({
      domainePrincipal: 'bibliotheque.zinda.exemple.bf',
      appUrl: 'https://public.gafeso.exemple.bf',
      contactSaisi: null,
    });
    await controller.get(tenant, {});
    const [, meta] = oai.handle.mock.calls[0];
    expect(meta.adminEmail).toBe('contact@bibliotheque.zinda.exemple.bf');
  });

  it('un contact saisi dans la vitrine prime sur le repli', async () => {
    const { controller, oai } = construireControleur({
      domainePrincipal: 'bibliotheque.zinda.exemple.bf',
      appUrl: 'https://public.gafeso.exemple.bf',
      contactSaisi: 'bibliothecaire@zinda.exemple.bf',
    });
    await controller.get(tenant, {});
    const [, meta] = oai.handle.mock.calls[0];
    expect(meta.adminEmail).toBe('bibliothecaire@zinda.exemple.bf');
  });

  it('⭐ baseUrl porte le domaine PRINCIPAL du tenant et le schéma de APP_URL', async () => {
    const { controller, oai } = construireControleur({
      domainePrincipal: 'bibliotheque.zinda.exemple.bf',
      appUrl: 'https://public.gafeso.exemple.bf',
    });
    await controller.get(tenant, {});
    const [, , , baseUrl] = oai.handle.mock.calls[0];
    expect(baseUrl).toBe('https://bibliotheque.zinda.exemple.bf/api/oai');
  });

  it('sans domaine principal déclaré, repli sur APP_URL seul', async () => {
    const { controller, oai } = construireControleur({
      domainePrincipal: null,
      appUrl: 'https://public.gafeso.exemple.bf',
    });
    await controller.get(tenant, {});
    const [, meta, , baseUrl] = oai.handle.mock.calls[0];
    expect(meta.adminEmail).toBe('contact@public.gafeso.exemple.bf');
    expect(baseUrl).toBe('https://public.gafeso.exemple.bf/api/oai');
  });

  it('tenant non résolu : baseUrl reste celui de APP_URL, sans aucune donnée de requête', async () => {
    const { controller } = construireControleur({ appUrl: 'https://public.gafeso.exemple.bf' });
    const reponse = await controller.get(null, {});
    expect(reponse).toContain('https://public.gafeso.exemple.bf/api/oai');
  });
});
