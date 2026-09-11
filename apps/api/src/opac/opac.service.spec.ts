import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { OpacService } from './opac.service';
import { StudentAccessContext } from '../access-control/access-control.matching';

/** OpacService injecte PrismaService depuis les chiffres publics ; ces cas-ci
 *  ne l'utilisent pas, un objet inerte suffit. */
function fauxPrisma() {
  return { forTenant: () => ({}) };
}

function makeSearch(result: Partial<Record<string, unknown>> = {}) {
  return {
    search: vi.fn().mockResolvedValue({
      hits: [],
      totalHits: 0,
      page: 1,
      totalPages: 0,
      facetDistribution: {},
      ...result,
    }),
  };
}

function makeDigitalCopyService() {
  return {
    getDownloadUrl: vi.fn().mockResolvedValue({
      url: 'https://minio.local/signed-read-url',
      fileFormat: 'EPUB',
      expiresInSeconds: 300,
    }),
  };
}

function makeAccessControl(status: unknown = { granted: true }) {
  return { getRecordAccessStatus: vi.fn().mockResolvedValue(status) };
}

const ctx: StudentAccessContext = {
  tenantId: 'school-1',
  className: 'L1_DROIT',
  subscriptionTier: 'free',
};

describe('OpacService — recherche', () => {
  it('construit les filtres échappés et demande les facettes', async () => {
    const search = makeSearch();
    const service = new OpacService(search as any, makeDigitalCopyService() as any, makeAccessControl() as any, fauxPrisma() as any);

    await service.searchCatalog('zinda', {
      q: 'droit',
      category: 'droit',
      language: 'fr',
      year: 2023,
      page: 2,
      limit: 10,
    });

    expect(search.search).toHaveBeenCalledWith('zinda', {
      q: 'droit',
      filter: ['category = "droit"', 'language = "fr"', 'publishYear = 2023'],
      page: 2,
      hitsPerPage: 10,
      facets: ['category', 'language', 'publishYear', 'recordType'],
    });
  });

  it('échappe les guillemets dans les valeurs de facette', async () => {
    const search = makeSearch();
    const service = new OpacService(search as any, makeDigitalCopyService() as any, makeAccessControl() as any, fauxPrisma() as any);
    await service.searchCatalog('zinda', { category: 'a"b' });
    expect(search.search.mock.calls[0][1].filter).toEqual(['category = "a\\"b"']);
  });

  it('valeurs par défaut : page 1, 20 résultats, pas de filtre', async () => {
    const search = makeSearch({ totalHits: 3 });
    const service = new OpacService(search as any, makeDigitalCopyService() as any, makeAccessControl() as any, fauxPrisma() as any);
    const result = await service.searchCatalog('zinda', {});
    expect(search.search.mock.calls[0][1]).toMatchObject({
      filter: [],
      page: 1,
      hitsPerPage: 20,
    });
    expect(result.totalHits).toBe(3);
  });
});

describe('OpacService — constellation', () => {
  it('mappe la facette category en domaines triés par volume', async () => {
    const search = makeSearch({
      totalHits: 6,
      facetDistribution: { category: { droit: 2, medecine: 3, informatique: 1 } },
    });
    const service = new OpacService(search as any, makeDigitalCopyService() as any, makeAccessControl() as any, fauxPrisma() as any);

    const result = await service.constellation('zinda');

    expect(result.totalRecords).toBe(6);
    expect(result.domains).toEqual([
      { category: 'medecine', count: 3 },
      { category: 'droit', count: 2 },
      { category: 'informatique', count: 1 },
    ]);
  });

  it('catalogue vide → aucun domaine', async () => {
    const service = new OpacService(makeSearch() as any, makeDigitalCopyService() as any, makeAccessControl() as any, fauxPrisma() as any);
    expect(await service.constellation('zinda')).toEqual({
      totalRecords: 0,
      domains: [],
    });
  });
});

describe('OpacService — fiche détaillée', () => {
  function makeDb(record: unknown) {
    return {
      biblioRecord: {
        findUnique: vi
          .fn()
          // `keywords` est toujours présent avec le vrai include Prisma —
          // valeur par défaut pour ne pas la répéter dans chaque cas de test.
          .mockResolvedValue(record ? { keywords: [], ...(record as object) } : null),
      },
    } as any;
  }

  let service: OpacService;

  beforeEach(() => {
    service = new OpacService(makeSearch() as any, makeDigitalCopyService() as any, makeAccessControl() as any, fauxPrisma() as any);
  });

  it('synthétise la disponibilité depuis les exemplaires', async () => {
    const db = makeDb({
      id: 'rec-1',
      title: 'Droit foncier',
      items: [
        { id: 'i1', status: 'AVAILABLE' },
        { id: 'i2', status: 'CHECKED_OUT' },
        { id: 'i3', status: 'AVAILABLE' },
        { id: 'i4', status: 'LOST' },
      ],
      digitalCopy: null,
    });

    const result = await service.recordDetail(db, 'rec-1');

    expect(result.availability).toEqual({
      totalItems: 4,
      available: 2,
      borrowable: true,
    });
  });

  it('aucun exemplaire disponible → borrowable false', async () => {
    const db = makeDb({
      id: 'rec-1',
      items: [{ id: 'i1', status: 'CHECKED_OUT' }],
      digitalCopy: null,
    });
    const result = await service.recordDetail(db, 'rec-1');
    // `recordDetail` rend un `Record<string, unknown>` (contrat gelé, composé
    // clé par clé) : on nomme donc la forme qu'on inspecte, au lieu d'un `any`
    // qui tairait un changement de cette clé.
    const dispo = result.availability as { borrowable: boolean } | null;
    expect(dispo?.borrowable).toBe(false);
  });

  it('notice introuvable → 404', async () => {
    const db = makeDb(null);
    await expect(service.recordDetail(db, 'ghost')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('visiteur anonyme : exemplaires, disponibilité ET exemplaire numérique masqués', async () => {
    const db = makeDb({
      id: 'rec-1',
      title: 'Droit foncier',
      items: [{ id: 'i1', status: 'AVAILABLE', barcode: 'ZK-1' }],
      digitalCopy: { fileFormat: 'PDF' },
    });

    const result = await service.recordDetail(db, 'rec-1', false);

    expect(result.membersOnly).toBe(true);
    expect(result.items).toEqual([]);
    expect(result.availability).toBeNull();
    expect(result.digitalCopy).toBeNull();
    expect(result.title).toBe('Droit foncier'); // les infos biblio restent publiques
  });

  it('membre : expose le format de l’exemplaire numérique, jamais l’URL/clé objet', async () => {
    const db = makeDb({
      id: 'rec-1',
      title: 'Droit foncier',
      items: [],
      digitalCopy: { fileFormat: 'EPUB', objectKey: 'rec-1/secret.epub' },
    });

    const result = await service.recordDetail(db, 'rec-1', true);

    expect(result.digitalCopy).toEqual({ fileFormat: 'EPUB' });
  });

  it('notice sans exemplaire numérique → digitalCopy: null', async () => {
    const db = makeDb({ id: 'rec-1', title: 'Droit foncier', items: [], digitalCopy: null });
    const result = await service.recordDetail(db, 'rec-1', true);
    expect(result.digitalCopy).toBeNull();
  });
});

describe('OpacService — URL de lecture en ligne', () => {
  // TTL court À DESSEIN : les lecteurs téléchargent le fichier en entier à
  // l'ouverture, l'URL n'a pas besoin de couvrir la session de lecture (voir
  // READ_URL_TTL_SECONDS dans opac.service.ts).
  it('renvoie une URL signée à expiration courte (5 min) et le titre de la notice, quand l’accès est accordé', async () => {
    const digitalCopy = makeDigitalCopyService();
    const accessControl = makeAccessControl({ granted: true });
    const service = new OpacService(makeSearch() as any, digitalCopy as any, accessControl as any, fauxPrisma() as any);
    const db = {
      biblioRecord: { findUnique: vi.fn().mockResolvedValue({ title: 'Droit foncier' }) },
    } as any;

    const result = await service.getReadUrl(db, 'rec-1', ctx);

    expect(accessControl.getRecordAccessStatus).toHaveBeenCalledWith(ctx, 'rec-1');
    expect(digitalCopy.getDownloadUrl).toHaveBeenCalledWith(db, 'rec-1', 300);
    expect(result).toEqual({
      url: 'https://minio.local/signed-read-url',
      fileFormat: 'EPUB',
      expiresInSeconds: 300,
      title: 'Droit foncier',
    });
  });

  it('notice introuvable → 404, aucune URL générée', async () => {
    const digitalCopy = makeDigitalCopyService();
    const service = new OpacService(makeSearch() as any, digitalCopy as any, makeAccessControl() as any, fauxPrisma() as any);
    const db = { biblioRecord: { findUnique: vi.fn().mockResolvedValue(null) } } as any;

    await expect(service.getReadUrl(db, 'ghost', ctx)).rejects.toBeInstanceOf(NotFoundException);
    expect(digitalCopy.getDownloadUrl).not.toHaveBeenCalled();
  });

  it('personnel (ctx null) : lecture sans contrôle de classe/abonnement', async () => {
    const digitalCopy = makeDigitalCopyService();
    const accessControl = makeAccessControl({ granted: false, message: 'peu importe' });
    const service = new OpacService(makeSearch() as any, digitalCopy as any, accessControl as any, fauxPrisma() as any);
    const db = {
      biblioRecord: { findUnique: vi.fn().mockResolvedValue({ title: 'Droit foncier' }) },
    } as any;

    const result = await service.getReadUrl(db, 'rec-1', null);

    // Aucune évaluation de règles pour le personnel, URL délivrée.
    expect(accessControl.getRecordAccessStatus).not.toHaveBeenCalled();
    expect(result.url).toBe('https://minio.local/signed-read-url');
  });

  it('étudiant sans droit d’accès (classe/abonnement) → 403, aucune URL signée générée', async () => {
    const digitalCopy = makeDigitalCopyService();
    const accessControl = makeAccessControl({
      granted: false,
      code: 'CLASS_MISMATCH',
      requiredClassName: 'L1_DROIT',
      message: 'Réservé aux étudiants de L1_DROIT.',
    });
    const service = new OpacService(makeSearch() as any, digitalCopy as any, accessControl as any, fauxPrisma() as any);
    const db = {
      biblioRecord: { findUnique: vi.fn().mockResolvedValue({ title: 'Droit foncier' }) },
    } as any;

    await expect(service.getReadUrl(db, 'rec-1', ctx)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.getReadUrl(db, 'rec-1', ctx)).rejects.toMatchObject({
      message: 'Réservé aux étudiants de L1_DROIT.',
    });
    // Jamais d'URL signée délivrée sans accès accordé.
    expect(digitalCopy.getDownloadUrl).not.toHaveBeenCalled();
  });
});
