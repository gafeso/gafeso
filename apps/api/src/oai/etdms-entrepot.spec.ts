import { describe, expect, it, vi } from 'vitest';
import { OaiService } from './oai.service';
import { ETDMS_PREFIX } from './etdms';
import { MARCXCHANGE_PREFIX } from '../cataloging/unimarc-xml';

/**
 * ETD-MS DANS L'ENTREPÔT — les trois points où le profil décide.
 *
 * Le mapping est éprouvé ailleurs (`etdms.spec.ts`). Ici on vérifie ce que le
 * SERVICE fait du profil : ce qu'il annonce, ce qu'il refuse, et ce qu'il
 * moissonne.
 */
const tenant = { slug: 'zinda', name: 'EXEMPLE', adminEmail: 'bib@exemple.bf' };
const baseUrl = 'http://localhost/oai';
const now = new Date('2026-09-11T22:00:00.000Z');

/** Une ligne telle que Prisma la rend DEPUIS P3-3 : profil + profileData. */
interface LigneOai {
  id: string;
  updatedAt: Date;
  title: string;
  titleComplement: string | null;
  isbn: string | null;
  publishYear: number | null;
  language: string;
  publisher: string | null;
  summary: string | null;
  profile: string;
  profileData: unknown;
  category: string | null;
  recordType: string;
  contributors: { name: string; role: string; position: number }[];
  keywords: { keyword: { name: string } }[];
}

function notice(id: string, profile: string): LigneOai {
  return {
    id,
    updatedAt: new Date('2026-09-10T00:00:00Z'),
    title: `Titre ${id}`,
    titleComplement: null,
    isbn: null,
    publishYear: 2023,
    language: 'fr',
    publisher: null,
    summary: 'Un résumé.',
    profile,
    profileData: { defenseUniversity: 'Université d’Exemple' },
    category: 'droit',
    recordType: profile === 'academique' ? 'these' : 'ouvrage',
    contributors: [{ name: 'Auteur, Un', role: 'AUTEUR_PRINCIPAL', position: 0 }],
    keywords: [] as { keyword: { name: string } }[],
  };
}

function db(notices: LigneOai[]) {
  const parId = new Map(notices.map((n) => [n.id, n]));
  return {
    biblioRecord: {
      aggregate: vi.fn().mockResolvedValue({ _min: { updatedAt: new Date(0) } }),
      // ⚠ Le comptage et la page reçoivent le MÊME `where` : la doublure filtre
      // donc comme la base le ferait, sinon le total et les lignes
      // divergeraient et le test ne dirait rien du filtre réel.
      count: vi.fn(async ({ where }: { where?: { profile?: string } }) =>
        notices.filter((n) => !where?.profile || n.profile === where.profile).length,
      ),
      findMany: vi.fn(async ({ where }: { where?: { profile?: string } }) =>
        notices.filter((n) => !where?.profile || n.profile === where.profile),
      ),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => parId.get(where.id) ?? null),
      groupBy: vi.fn().mockResolvedValue([{ category: 'droit', _count: { _all: 1 } }]),
    },
  } as never;
}

const service = () => new OaiService();
const appel = (notices: LigneOai[], params: Record<string, string>) =>
  service().handle(db(notices), tenant, params, baseUrl, now);

describe('ETD-MS · ce que l’entrepôt ANNONCE', () => {
  it('sans identifiant, l’entrepôt annonce les trois formats', async () => {
    const xml = await appel([notice('a', 'academique')], { verb: 'ListMetadataFormats' });
    for (const p of ['oai_dc', MARCXCHANGE_PREFIX, ETDMS_PREFIX]) {
      expect(xml, p).toContain(`<metadataPrefix>${p}</metadataPrefix>`);
    }
  });

  it('⚠ sur une notice BIBLIOGRAPHIQUE, il n’annonce PAS etdms', async () => {
    // C'est la moitié du I4 qui se joue ici : annoncer un format qu'on refusera
    // ensuite enverrait un moissonneur de thèses chercher une notice pour rien,
    // et lui ferait croire que l'entrepôt est incohérent.
    const xml = await appel([notice('b', 'bibliographique')], {
      verb: 'ListMetadataFormats',
      identifier: 'oai:zinda:b',
    });
    expect(xml).toContain('<metadataPrefix>oai_dc</metadataPrefix>');
    expect(xml).not.toContain(`<metadataPrefix>${ETDMS_PREFIX}</metadataPrefix>`);
  });

  it('sur une notice ACADÉMIQUE, il l’annonce', async () => {
    const xml = await appel([notice('a', 'academique')], {
      verb: 'ListMetadataFormats',
      identifier: 'oai:zinda:a',
    });
    expect(xml).toContain(`<metadataPrefix>${ETDMS_PREFIX}</metadataPrefix>`);
  });

  it('sur un identifiant INCONNU, il rend idDoesNotExist — pas une liste', async () => {
    const xml = await appel([notice('a', 'academique')], {
      verb: 'ListMetadataFormats',
      identifier: 'oai:zinda:absente',
    });
    expect(xml).toContain('idDoesNotExist');
  });
});

describe('ETD-MS · ce que l’entrepôt REFUSE', () => {
  it('⚠ GetRecord etdms sur une notice bibliographique → cannotDisseminateFormat', async () => {
    const xml = await appel([notice('b', 'bibliographique')], {
      verb: 'GetRecord',
      metadataPrefix: ETDMS_PREFIX,
      identifier: 'oai:zinda:b',
    });
    expect(xml).toContain('cannotDisseminateFormat');
    // ⚠ ET PAS `idDoesNotExist` : la notice EXISTE, c'est le format qui ne
    // s'applique pas. Confondre les deux ferait croire à un catalogue troué.
    expect(xml).not.toContain('idDoesNotExist');
    // Le message dit quoi demander à la place.
    expect(xml).toContain('oai_dc');
  });

  it('GetRecord etdms sur une notice académique → le <thesis>', async () => {
    const xml = await appel([notice('a', 'academique')], {
      verb: 'GetRecord',
      metadataPrefix: ETDMS_PREFIX,
      identifier: 'oai:zinda:a',
    });
    expect(xml).toContain('<thesis');
    expect(xml).toContain('<grantor>Université d’Exemple</grantor>');
  });

  it('les deux autres formats restent servis sur une notice académique', async () => {
    for (const p of ['oai_dc', MARCXCHANGE_PREFIX]) {
      const xml = await appel([notice('a', 'academique')], {
        verb: 'GetRecord',
        metadataPrefix: p,
        identifier: 'oai:zinda:a',
      });
      expect(xml, p).not.toContain('cannotDisseminateFormat');
    }
  });
});

describe('ETD-MS · ce que l’entrepôt MOISSONNE', () => {
  it('⚠ ListRecords etdms ne rend QUE les notices académiques', async () => {
    const xml = await appel(
      [notice('a', 'academique'), notice('b', 'bibliographique'), notice('c', 'academique')],
      { verb: 'ListRecords', metadataPrefix: ETDMS_PREFIX },
    );
    expect(xml).toContain('oai:zinda:a');
    expect(xml).toContain('oai:zinda:c');
    expect(xml).not.toContain('oai:zinda:b');
    expect((xml.match(/<thesis/g) ?? []).length).toBe(2);
  });

  it('ListRecords oai_dc rend TOUT — le filtre ne fuit pas sur les autres formats', async () => {
    const xml = await appel(
      [notice('a', 'academique'), notice('b', 'bibliographique')],
      { verb: 'ListRecords', metadataPrefix: 'oai_dc' },
    );
    expect(xml).toContain('oai:zinda:a');
    expect(xml).toContain('oai:zinda:b');
  });

  it('⚠ un fonds SANS travaux universitaires rend noRecordsMatch, pas un jeu vide', async () => {
    // « Il n'y a rien » et « c'est éteint » sont deux réponses différentes, et
    // celle-ci est la troisième : « rien ne correspond à ce critère ». C'est
    // l'erreur qu'OAI prévoit, et elle se distingue du 403 du garde de module.
    const xml = await appel([notice('b', 'bibliographique')], {
      verb: 'ListRecords',
      metadataPrefix: ETDMS_PREFIX,
    });
    expect(xml).toContain('noRecordsMatch');
    expect(xml).not.toContain('<thesis');
  });

  it('ListIdentifiers etdms filtre aussi', async () => {
    const xml = await appel(
      [notice('a', 'academique'), notice('b', 'bibliographique')],
      { verb: 'ListIdentifiers', metadataPrefix: ETDMS_PREFIX },
    );
    expect(xml).toContain('oai:zinda:a');
    expect(xml).not.toContain('oai:zinda:b');
  });
});

describe('dc:description — le résumé que rien n’émettait', () => {
  it('⚠ oai_dc porte enfin le résumé', async () => {
    // 143 notices sur 352 portent un résumé, et aucune exposition ne l'émettait.
    const xml = await appel([notice('a', 'academique')], {
      verb: 'GetRecord',
      metadataPrefix: 'oai_dc',
      identifier: 'oai:zinda:a',
    });
    expect(xml).toContain('<dc:description>Un résumé.</dc:description>');
  });

  it('sans résumé, aucune balise vide', async () => {
    const n = { ...notice('a', 'academique'), summary: null };
    const xml = await appel([n], {
      verb: 'GetRecord',
      metadataPrefix: 'oai_dc',
      identifier: 'oai:zinda:a',
    });
    expect(xml).not.toContain('<dc:description>');
  });
});
