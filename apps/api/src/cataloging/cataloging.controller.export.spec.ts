import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { CatalogingController } from './cataloging.controller';
import { ResolvedTenant } from '../tenancy/tenancy.service';
import {
  ANCIEN_PREFIX_MARCXML,
  MARCXCHANGE_NAMESPACE,
  MARCXCHANGE_PREFIX,
} from './unimarc-xml';

const TENANT: ResolvedTenant = { id: 't1', slug: 'zinda', name: 'Zinda' };

const NOTICE = {
  id: 'r1',
  title: 'Titre',
  titleComplement: null,
  isbn: null,
  publishYear: 2020,
  language: 'fr',
  publisher: null,
  publicationCity: null,
  defenseUniversity: null,
  defensePlace: null,
  category: 'droit',
  recordType: 'book',
  contributors: [{ name: 'A. Auteur', role: 'AUTEUR_PRINCIPAL', position: 0 }],
  keywords: ['droit'],
  items: [],
};

/** Réponse Express minimale : on collecte ce qui est écrit et les en-têtes. */
function makeRes() {
  const ecrit: string[] = [];
  const entetes: Record<string, string> = {};
  return {
    corps: () => ecrit.join(''),
    entetes,
    setHeader: (k: string, v: string) => {
      entetes[k] = v;
    },
    write: (c: string) => ecrit.push(c),
    end: vi.fn(),
  };
}

function makeController() {
  const cataloging = {
    // eslint-disable-next-line require-yield
    exportRecordsBatched: async function* () {
      yield [NOTICE];
    },
  };
  const prisma = { forTenant: vi.fn().mockReturnValue({ marker: 'db' }) };
  return new CatalogingController(
    cataloging as any,
    {} as any,
    prisma as any,
    { log: vi.fn() } as any,
    { enregistrer: async () => true } as never,
  );
}

describe('CatalogingController.export — l’export du bibliothécaire ne ment plus', () => {
  it('refuse l’ancien format « marcxml » en nommant son remplaçant', async () => {
    const controller = makeController();
    const res = makeRes();

    await expect(
      controller.export(TENANT, ANCIEN_PREFIX_MARCXML, '', res as any),
    ).rejects.toBeInstanceOf(BadRequestException);

    // Aucune notice n'a été servie sous l'ancien nom.
    expect(res.corps()).toBe('');
    await controller
      .export(TENANT, ANCIEN_PREFIX_MARCXML, '', makeRes() as any)
      .catch((e: BadRequestException) => {
        expect(e.message).toContain(MARCXCHANGE_PREFIX);
      });
  });

  it('exporte en MarcXchange (ISO 25577), jamais sous une annonce MARC21', async () => {
    const controller = makeController();
    const res = makeRes();

    await controller.export(TENANT, MARCXCHANGE_PREFIX, '', res as any);

    const xml = res.corps();
    expect(xml).toContain(`<collection xmlns="${MARCXCHANGE_NAMESPACE}">`);
    expect(xml).not.toContain('MARC21');
    // Témoin positif : la notice est bien dans le flux.
    expect(xml).toContain('<datafield tag="200"');
    expect(res.entetes['Content-Disposition']).toContain('.marcxchange.xml');
  });
});
