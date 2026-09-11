import { describe, expect, it, vi } from 'vitest';
import { OaiService } from './oai.service';
import { oaiDatestamp } from './oai-xml';
import {
  MARCXCHANGE_FORMAT,
  MARCXCHANGE_NAMESPACE,
  MARCXCHANGE_PREFIX,
  MARCXCHANGE_SCHEMA_URL,
} from '../cataloging/unimarc-xml';

const tenant = { slug: 'zinda', name: 'EXEMPLE', adminEmail: 'bibliotheque@exemple.bf' };
const baseUrl = 'http://localhost/oai';
const now = new Date('2026-07-18T10:00:00.000Z');

function rec(i: number) {
  return {
    id: `id-${i}`,
    updatedAt: new Date('2026-07-10T00:00:00Z'),
    title: `Titre ${i}`,
    titleComplement: null,
    isbn: null,
    publishYear: 2024,
    language: 'fr',
    publisher: null,
    publicationCity: null,
    defenseUniversity: null,
    defensePlace: null,
    category: 'droit',
    recordType: 'book',
    contributors: [{ name: 'Auteur, Un', role: 'AUTEUR_PRINCIPAL', position: 0 }],
    keywords: [{ keyword: { name: 'foncier' } }],
  };
}

/** Mock du client tenant : `total` notices, pages de findMany. */
function makeDb(total: number) {
  const all = Array.from({ length: total }, (_, i) => rec(i));
  return {
    biblioRecord: {
      aggregate: vi.fn().mockResolvedValue({ _min: { updatedAt: new Date('2026-07-08T00:00:00Z') } }),
      groupBy: vi.fn().mockResolvedValue([{ category: 'droit', _count: { _all: total } }]),
      count: vi.fn().mockResolvedValue(total),
      findMany: vi.fn(async ({ skip, take }: any) => all.slice(skip, skip + take)),
      findUnique: vi.fn(async ({ where }: any) => all.find((r) => r.id === where.id) ?? null),
    },
  } as any;
}

const svc = new OaiService();

describe('OaiService — verbes & erreurs', () => {
  it('verbe inconnu → badVerb', async () => {
    const xml = await svc.handle(makeDb(1), tenant, { verb: 'Nope' }, baseUrl, now);
    expect(xml).toContain('<error code="badVerb">');
  });

  it('Identify → nom du dépôt + granularité seconde', async () => {
    const xml = await svc.handle(makeDb(1), tenant, { verb: 'Identify' }, baseUrl, now);
    expect(xml).toContain('<repositoryName>Gafeso — EXEMPLE</repositoryName>');
    expect(xml).toContain('<adminEmail>bibliotheque@exemple.bf</adminEmail>');
    expect(xml).toContain('YYYY-MM-DDThh:mm:ssZ');
  });

  it('format inconnu → cannotDisseminateFormat', async () => {
    const xml = await svc.handle(makeDb(1), tenant, { verb: 'ListRecords', metadataPrefix: 'foo' }, baseUrl, now);
    expect(xml).toContain('<error code="cannotDisseminateFormat">');
  });

  it('aucune notice → noRecordsMatch', async () => {
    const xml = await svc.handle(makeDb(0), tenant, { verb: 'ListRecords', metadataPrefix: 'oai_dc' }, baseUrl, now);
    expect(xml).toContain('<error code="noRecordsMatch">');
  });

  it('GetRecord d’un id absent → idDoesNotExist', async () => {
    const xml = await svc.handle(makeDb(2), tenant, { verb: 'GetRecord', identifier: 'oai:zinda:absent', metadataPrefix: 'oai_dc' }, baseUrl, now);
    expect(xml).toContain('<error code="idDoesNotExist">');
  });

  it('GetRecord oai_dc → Dublin Core ; jamais d’exemplaire/fichier', async () => {
    const xml = await svc.handle(makeDb(3), tenant, { verb: 'GetRecord', identifier: 'oai:zinda:id-0', metadataPrefix: 'oai_dc' }, baseUrl, now);
    expect(xml).toContain('<dc:title>Titre 0</dc:title>');
    expect(xml).toContain('<dc:creator>Auteur, Un</dc:creator>');
    expect(xml).not.toContain('995');
  });

  it('ListRecords > page : resumptionToken, puis fin de séquence', async () => {
    const p1 = await svc.handle(makeDb(150), tenant, { verb: 'ListRecords', metadataPrefix: 'oai_dc' }, baseUrl, now);
    expect((p1.match(/<record>/g) ?? []).length).toBe(100);
    const token = p1.match(/<resumptionToken[^>]*>([^<]+)<\/resumptionToken>/)?.[1];
    expect(token).toBeTruthy();
    expect(p1).toContain('completeListSize="150"');

    const p2 = await svc.handle(makeDb(150), tenant, { verb: 'ListRecords', resumptionToken: token }, baseUrl, now);
    expect((p2.match(/<record>/g) ?? []).length).toBe(50);
    expect(p2).toContain('<resumptionToken/>'); // fin
  });

  it('resumptionToken exclusif des autres arguments → badArgument', async () => {
    const xml = await svc.handle(makeDb(5), tenant, { verb: 'ListRecords', resumptionToken: 'x', metadataPrefix: 'oai_dc' }, baseUrl, now);
    expect(xml).toContain('<error code="badArgument">');
  });
});

describe('oaiDatestamp', () => {
  it('ListMetadataFormats annonce marcxchange, avec le schéma de la NORME', async () => {
    const xml = await svc.handle(makeDb(1), tenant, { verb: 'ListMetadataFormats' }, baseUrl);
    expect(xml).toContain(`<metadataPrefix>${MARCXCHANGE_PREFIX}</metadataPrefix>`);
    expect(xml).toContain(`<metadataNamespace>${MARCXCHANGE_NAMESPACE}</metadataNamespace>`);
    // Le schéma est celui d'ISO 25577, chez son mainteneur — pas une copie
    // maison : le schéma d'une norme appartient à la norme.
    expect(xml).toContain(`<schema>${MARCXCHANGE_SCHEMA_URL}</schema>`);
    // Plus aucune affirmation MARC21 : loc.gov apparaît (c'est l'hôte du
    // schéma ISO 25577), mais jamais « MARC21 ».
    expect(xml).not.toContain('MARC21');
  });

  it('l’ancien préfixe marcxml est REFUSÉ, en nommant son remplaçant', async () => {
    const xml = await svc.handle(
      makeDb(1),
      tenant,
      { verb: 'ListRecords', metadataPrefix: 'marcxml' },
      baseUrl,
    );
    expect(xml).toContain('cannotDisseminateFormat');
    // Un moissonneur qui échoue doit savoir quoi demander à la place.
    expect(xml).toContain(MARCXCHANGE_PREFIX);
    // Et surtout : aucune notice n'est servie sous l'ancien nom.
    expect(xml).not.toContain('<record>');
  });

  it('GetRecord marcxchange → notice ISO 25577 déclarant son dialecte UNIMARC', async () => {
    const xml = await svc.handle(
      makeDb(1),
      tenant,
      { verb: 'GetRecord', identifier: 'oai:zinda:id-0', metadataPrefix: MARCXCHANGE_PREFIX },
      baseUrl,
    );
    expect(xml).toContain(`<record xmlns="${MARCXCHANGE_NAMESPACE}"`);
    expect(xml).toContain(`format="${MARCXCHANGE_FORMAT}"`);
    expect(xml).not.toContain('MARC21');
    // Le label ISO 2709 n'est pas inventé (facultatif en MarcXchange 2.0).
    expect(xml).not.toContain('<leader>');
    // Témoin positif : la notice est bien là (sinon le test ne prouverait rien).
    expect(xml).toContain('<datafield tag="200"');
  });

  it('granularité seconde, UTC', () => {
    expect(oaiDatestamp(new Date('2026-07-18T10:33:00.789Z'))).toBe('2026-07-18T10:33:00Z');
  });
});
