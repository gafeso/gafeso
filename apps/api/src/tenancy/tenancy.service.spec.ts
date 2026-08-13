import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TenancyService } from './tenancy.service';

function makePrisma() {
  return {
    domain: { findUnique: vi.fn() },
    tenantSettings: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn(async ({ create, update }: any) => ({ ...create, ...update })),
    },
  } as any;
}

describe('TenancyService — updateSettings', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: TenancyService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new TenancyService(prisma);
  });

  it('crée la ligne tenant_settings si elle n’existe pas encore (upsert)', async () => {
    await service.updateSettings('tenant-1', { primaryColor: '#1B5E3A' });

    const call = prisma.tenantSettings.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ tenantId: 'tenant-1' });
    expect(call.create).toMatchObject({ tenantId: 'tenant-1', primaryColor: '#1B5E3A' });
    expect(call.update).toEqual({ primaryColor: '#1B5E3A' });
  });

  it('ne modifie que les champs fournis (secondaryColor seul, primaryColor intact)', async () => {
    await service.updateSettings('tenant-1', { secondaryColor: '#2E7D32' });

    const call = prisma.tenantSettings.upsert.mock.calls[0][0];
    expect(call.update).toEqual({ secondaryColor: '#2E7D32' });
    expect(call.update.primaryColor).toBeUndefined();
  });

  it('cible toujours le tenantId reçu en paramètre, jamais une valeur du DTO', async () => {
    await service.updateSettings('tenant-exemple', {
      primaryColor: '#1B5E3A',
      // @ts-expect-error — un tenantId dans le DTO ne doit avoir aucun effet
      tenantId: 'tenant-autre-ecole',
    });

    const call = prisma.tenantSettings.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ tenantId: 'tenant-exemple' });
    expect(call.create.tenantId).toBe('tenant-exemple');
  });

  it('themeTokens : fusionne les clés fournies (nettoyées) sur les tokens stockés', async () => {
    // Déjà en base : bg personnalisé. Le PATCH ne touche que surface + une
    // clé inconnue (écartée) → bg conservé, surface écrasée, evil ignorée.
    prisma.tenantSettings.findUnique.mockResolvedValue({
      themeTokens: { bg: '#101010' },
    });
    await service.updateSettings('tenant-1', {
      themeTokens: { surface: '#202020', evil: '#123456' },
    });

    const call = prisma.tenantSettings.upsert.mock.calls[0][0];
    expect(call.update.themeTokens.bg).toBe('#101010'); // conservé
    expect(call.update.themeTokens.surface).toBe('#202020'); // écrasé
    expect(call.update.themeTokens.evil).toBeUndefined(); // clé inconnue écartée
    // La palette écrite est complète (défauts appliqués pour le reste).
    expect(call.update.themeTokens.text).toBeDefined();
  });

  it('latticeEnabled : le toggle du motif est persisté tel quel', async () => {
    await service.updateSettings('tenant-1', { latticeEnabled: true });
    const call = prisma.tenantSettings.upsert.mock.calls[0][0];
    expect(call.update).toEqual({ latticeEnabled: true });

    await service.updateSettings('tenant-1', { latticeEnabled: false });
    const call2 = prisma.tenantSettings.upsert.mock.calls[1][0];
    expect(call2.update).toEqual({ latticeEnabled: false });
  });

  it('homepageContent : stocké nettoyé/normalisé (clé parasite écartée, stats bornées)', async () => {
    await service.updateSettings('tenant-1', {
      homepageContent: {
        identity: { fullName: '  BUC  ', evil: '<script>' },
        stats: Array.from({ length: 9 }, (_, i) => ({ value: `${i}`, label: `l${i}` })),
        hackers: [1, 2, 3],
      },
    });
    const stored = prisma.tenantSettings.upsert.mock.calls[0][0].update.homepageContent;
    expect(stored.identity.fullName).toBe('BUC'); // trim
    expect(stored.identity.evil).toBeUndefined(); // clé inconnue écartée
    expect(stored.stats).toHaveLength(4); // borné à 4
    expect(stored.hackers).toBeUndefined(); // section inconnue écartée
  });
});
