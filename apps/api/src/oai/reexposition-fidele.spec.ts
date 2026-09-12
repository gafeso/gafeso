import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GABARIT_LEADER } from '../cataloging/unimarc-xml';
import { CatalogingService } from '../cataloging/cataloging.service';
import { recordToMarcxmlElement } from '../cataloging/marc-export';
import { versMarcxchange } from '../cataloging/unimarc-xml';
import { MARCXCHANGE_PREFIX } from '../cataloging/unimarc-xml';
import { OaiService } from './oai.service';
import { versMarcxchangeDepuisNatif } from './reexposition-fidele';

/**
 * LA PREUVE DE BOUT EN BOUT DE L'INVARIANT I3 — « ce qui arrive dans un format
 * y reste ». Elle n'avait jamais été faite : P2 avait posé l'invariant, P3-1 la
 * colonne qui conserve, et personne n'avait vérifié que la SORTIE rendait
 * l'ENTRÉE.
 *
 * ⚠ POURQUOI LA SOURCE EST ENCODÉE À LA MAIN ICI. La suite de `cataloging`
 * fabrique ses fichiers d'essai avec `Marc.format(r, 'iso2709')` — marcjs écrit,
 * marcjs relit. C'est une boucle fermée : elle prouve que marcjs est d'accord
 * avec lui-même, ce qui resterait vrai si marcjs était faux. Une preuve de
 * fidélité exige une source EXTÉRIEURE à l'outil qui la relit, d'où l'encodeur
 * ci-dessous — vingt lignes, écrites contre la norme ISO 2709, et confrontées à
 * un décodeur indépendant.
 */

const FT = '\x1e'; // fin de zone
const RT = '\x1d'; // fin de notice
const SF = '\x1f'; // début de sous-zone

type ChampMarc = string[];

/** Encodeur ISO 2709 écrit à la main : longueurs, adresse de base, répertoire. */
function construireIso2709(leaderModele: string, champs: ChampMarc[]): Buffer {
  const corps = champs.map((champ) => {
    const [tag, ...reste] = champ;
    if (reste.length === 1) return [tag, reste[0] + FT] as const; // zone de contrôle
    const [indicateurs, ...sous] = reste;
    let donnee = indicateurs;
    for (let i = 0; i < sous.length; i += 2) donnee += SF + sous[i] + sous[i + 1];
    return [tag, donnee + FT] as const;
  });

  let repertoire = '';
  let debut = 0;
  for (const [tag, donnee] of corps) {
    const longueur = Buffer.byteLength(donnee, 'utf8');
    repertoire += tag + String(longueur).padStart(4, '0') + String(debut).padStart(5, '0');
    debut += longueur;
  }
  repertoire += FT;

  const donnees = corps.map(([, d]) => d).join('');
  const adresseBase = 24 + Buffer.byteLength(repertoire, 'utf8');
  const total = adresseBase + Buffer.byteLength(donnees, 'utf8') + 1;
  const leader =
    String(total).padStart(5, '0') +
    leaderModele.slice(5, 12) +
    String(adresseBase).padStart(5, '0') +
    leaderModele.slice(17, 24);

  return Buffer.from(leader + repertoire + donnees + RT, 'utf8');
}

/**
 * Lecteur de marcxchange → zones, pour COMPARER la sortie à l'entrée.
 *
 * ⚠ C'est un instrument, donc il a son témoin (premier `describe`). Sans lui,
 * un lecteur qui ne verrait rien rendrait deux listes vides, et deux listes
 * vides sont égales — le test passerait en ne comparant rien.
 */
function lireZonesXml(xml: string): ChampMarc[] {
  const dechiffrer = (s: string) =>
    s
      .replace(/&#x([0-9A-Fa-f]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&');

  const zones: ChampMarc[] = [];
  const motif =
    /<controlfield tag="([^"]+)"[^>]*>([^<]*)<\/controlfield>|<datafield tag="([^"]+)" ind1="([^"]*)" ind2="([^"]*)"[^>]*>([\s\S]*?)<\/datafield>/g;
  for (const m of xml.matchAll(motif)) {
    if (m[1] !== undefined) {
      zones.push([m[1], dechiffrer(m[2])]);
      continue;
    }
    const champ: ChampMarc = [m[3], m[4] + m[5]];
    for (const s of m[6].matchAll(/<subfield code="([^"]*)">([\s\S]*?)<\/subfield>/g)) {
      champ.push(s[1], dechiffrer(s[2]));
    }
    zones.push(champ);
  }
  return zones;
}

// ── La source : une notice MARC21 telle qu'un catalogue tiers l'émet ─────────
//
// ⚠ AUCUN NOM DE CLIENT RÉEL ICI. La première écriture nommait une université
// cliente dans la note 500 et dans la cote 901 — et `apps/` part dans
// l'instantané public. C'est le garde de `scripts/publier-instantane.sh` qui
// l'a signalé, avant publication ; sans lui c'était la sixième occurrence du
// motif, et la première dans du code que je venais d'écrire.
//
// ⚠ TROIS DE SES ZONES SONT LE CŒUR DE LA PREUVE. `500` (note), `650` (vedette
// matière avec son référentiel) et `901` (zone locale, cote de magasin) n'ont
// AUCUNE colonne dans la notice Gafeso. Ce sont elles que la reconstruction
// perdait, et elles seules qui distinguent « réexposer » de « ressembler ».
const LEADER_MODELE = '00000nam a2200000 a 4500';
const SOURCE: ChampMarc[] = [
  ['001', 'ocn123456789'],
  ['020', '  ', 'a', '978-2-1234-5680-3'],
  ['100', '1 ', 'a', 'Ouédraogo, Salif', 'e', 'auteur'],
  ['245', '10', 'a', 'Le droit foncier rural', 'b', 'au Burkina Faso', 'c', 'Salif Ouédraogo'],
  ['500', '  ', 'a', 'Notice reprise d’un catalogue tiers, zone conservée telle quelle.'],
  ['650', ' 7', 'a', 'Droit foncier', 'x', 'Afrique de l’Ouest', '2', 'rameau'],
  ['901', '  ', 'a', 'COTE-LOCALE-MAGASIN-4412', 'b', 'Magasin 3'],
];

function makeDb() {
  return {
    category: { findMany: vi.fn(async () => [{ id: 'cat-1', name: 'droit' }]) },
    biblioRecord: {
      create: vi.fn(async ({ data }: any) => ({
        id: 'rec-1',
        ...data,
        keywords: [],
        contributors: data.contributors?.create ?? [],
      })),
    },
  } as any;
}

/** Passe la source par le VRAI chemin d'import et rend ce qui a été écrit. */
async function importerLaSource(): Promise<{ marcData: unknown; marcFormat: string }> {
  const search = {
    ensureIndex: vi.fn().mockResolvedValue(undefined),
    indexRecords: vi.fn().mockResolvedValue(undefined),
  };
  const authors = { findOrCreateByName: vi.fn().mockResolvedValue({ id: 'author-1' }) };
  const service = new CatalogingService(search as any, {} as any, authors as any);
  const db = makeDb();

  const result = await service.importMarc(
    db,
    'zinda',
    construireIso2709(LEADER_MODELE, SOURCE),
    'MARC21',
  );
  expect(result.imported, "la source doit s'importer, sinon la preuve ne porte sur rien").toBe(1);

  const data = db.biblioRecord.create.mock.calls[0][0].data;
  return { marcData: data.marcData, marcFormat: data.marcFormat };
}

describe("Les instruments, et ce qu'ils doivent trouver", () => {
  it("l'encodeur écrit un ISO 2709 que le chemin d'import relit ZONE POUR ZONE", async () => {
    const { marcData } = await importerLaSource();
    const zones = (marcData as { fields: ChampMarc[] }).fields;

    // ⚠ TÉMOIN QUI COMPTE, pas qui constate. « au moins une zone lue »
    // passerait sur un décodeur qui s'arrête à la première.
    expect(zones.length, 'sept zones encodées, sept zones attendues').toBe(7);
    expect(zones).toEqual(SOURCE);
  });

  it("le lecteur XML rend EXACTEMENT les zones de son entrée, indicateurs compris", () => {
    const xml = [
      '<record>',
      '  <controlfield tag="001">ocn1</controlfield>',
      '  <datafield tag="650" ind1=" " ind2="7">',
      '    <subfield code="a">Droit &amp; soci&#xE9;t&#xE9;</subfield>',
      '    <subfield code="2">rameau</subfield>',
      '  </datafield>',
      '</record>',
    ].join('\n');

    expect(lireZonesXml(xml)).toEqual([
      ['001', 'ocn1'],
      ['650', ' 7', 'a', 'Droit & société', '2', 'rameau'],
    ]);
  });
});

describe("I3 de bout en bout : la source ressort telle qu'elle est entrée", () => {
  let sortie: string;
  let format: string;

  beforeEach(async () => {
    const { marcData, marcFormat } = await importerLaSource();
    format = marcFormat;
    const xml = versMarcxchangeDepuisNatif(marcData, marcFormat);
    expect(xml, 'une notice importée DOIT être réexposable depuis son natif').not.toBeNull();
    sortie = xml as string;
  });

  it('les sept zones de la source se retrouvent à l’identique, et dans le même ORDRE', () => {
    // L'ordre n'est pas cosmétique : en MARC il porte du sens (ordre des
    // vedettes, des notes), et c'est la seule chose qui distingue « j'ai
    // conservé » de « j'ai reconstruit quelque chose qui ressemble ».
    expect(lireZonesXml(sortie)).toEqual(SOURCE);
  });

  it('les trois zones que le modèle plat n’accueille PAS ont survécu', () => {
    const parTag = new Map(lireZonesXml(sortie).map((z) => [z[0], z]));

    expect(parTag.get('500')).toEqual(SOURCE[4]); // la note de reprise
    expect(parTag.get('650')).toEqual(SOURCE[5]); // la vedette et son référentiel
    expect(parTag.get('901')).toEqual(SOURCE[6]); // la cote locale de l'école
  });

  it('le dialecte DÉCLARÉ est celui de la source — I4', () => {
    expect(format).toBe('MARC21');
    expect(sortie).toContain('format="MARC21"');
    // ⚠ Le défaut corrigé par ce lot : `UNIMARC` était écrit en dur. Sur du
    // MARC21 natif, le moissonneur n'avait aucun moyen de s'en apercevoir —
    // les deux dialectes ont la même forme XML.
    expect(sortie).not.toContain('format="UNIMARC"');
  });

  it('le leader de la source est conservé, pas remplacé par le nôtre', async () => {
    const { marcData } = await importerLaSource();
    const leaderSource = (marcData as { leader: string }).leader;

    expect(leaderSource).toMatch(/^\d{5}nam/); // l'encodeur a calculé la longueur
    // ⚠ Le leader porte le type de notice et le niveau bibliographique : un
    // moissonneur les lit pour classer. Le remplacer changerait le SENS de la
    // notice sans toucher à une seule zone.
    expect(sortie).toContain(`<leader>${leaderSource}</leader>`);
  });
});

describe('Le contraste : ce que la reconstruction perdait', () => {
  it('la reconstruction ne rend ni la note, ni la vedette, ni la cote locale', async () => {
    // Ce test existe pour que le lot ne soit pas décoratif : il MESURE la perte
    // que la réexposition fidèle supprime. S'il tombe un jour parce que la
    // reconstruction s'est enrichie, tant mieux — mais il faudra le savoir.
    const reconstruit = versMarcxchange(
      recordToMarcxmlElement({
        id: 'rec-1',
        title: 'Le droit foncier rural',
        titleComplement: 'au Burkina Faso',
        author: 'Ouédraogo, Salif',
        isbn: '978-2-1234-5680-3',
        publishYear: null,
        language: 'fr',
        publisher: null,
        category: 'droit',
        recordType: 'book',
        contributors: [],
        keywords: [],
        items: [],
      } as never),
      true,
    );

    const tags = lireZonesXml(reconstruit).map((z) => z[0]);
    expect(tags).not.toContain('500');
    expect(tags).not.toContain('650');
    expect(tags).not.toContain('901');
  });
});

describe("Le refus : ne rien inventer quand il n'y a rien", () => {
  it('une notice SANS description d’origine rend null, pas un document vide', () => {
    expect(versMarcxchangeDepuisNatif(null, 'UNIMARC')).toBeNull();
    expect(versMarcxchangeDepuisNatif(undefined, 'UNIMARC')).toBeNull();
    // Les deux formes que le produit écrit lui-même pour une saisie manuelle.
    expect(versMarcxchangeDepuisNatif({}, 'UNIMARC')).toBeNull();
    expect(versMarcxchangeDepuisNatif({ fields: [] }, 'UNIMARC')).toBeNull();
  });

  it('un natif réduit à son leader est réexposé — il DIT quelque chose', () => {
    const xml = versMarcxchangeDepuisNatif({ leader: LEADER_MODELE, fields: [] }, 'MARC21');
    expect(xml).not.toBeNull();
    expect(xml as string).toContain(`<leader>${LEADER_MODELE}</leader>`);
  });
});

describe('Le leader : le seul élément qu\u2019on puisse recevoir malformé', () => {
  it('le gabarit est celui du XSD de la norme, à la lettre', () => {
    // ⚠ SANS CE TEST, LA VÉRIFICATION DÉRIVE DE LA NORME QU'ELLE APPLIQUE.
    // Le gabarit est recopié d'un fichier ; une recopie ne se surveille pas
    // toute seule. On le relit donc DANS le XSD, et on compare.
    const xsd = readFileSync(
      join(__dirname, '../cataloging/__fixtures__/marcxchange-2-0.xsd'),
      'utf8',
    );
    const bloc = xsd.slice(xsd.indexOf('name="leaderDataType"'));
    const motifXsd = /<xsd:pattern value="([^"]+)"/.exec(bloc)?.[1];

    expect(motifXsd, 'le type leaderDataType doit porter un xsd:pattern').toBeTruthy();
    // `\p{IsBasicLatin}` (syntaxe XSD) et `[\x00-\x7F]` (syntaxe JS) désignent
    // le même ensemble : c'est la seule traduction, et elle est explicite ici.
    const traduit = (motifXsd as string).replace(/\\p\{IsBasicLatin\}/g, '[\\x00-\\x7F]');
    expect(GABARIT_LEADER.source).toBe(`^${traduit}$`);
  });

  it('un leader conforme est émis, un leader malformé est OMIS — jamais émis invalide', () => {
    const zones = [['245', '10', 'a', 'Titre']];

    const conforme = versMarcxchangeDepuisNatif(
      { leader: '00397nam a2200109 a 4500', fields: zones },
      'MARC21',
    ) as string;
    expect(conforme).toContain('<leader>00397nam a2200109 a 4500</leader>');

    // ⚠ Un leader tronqué est le cas réel : des catalogues émettent 22 ou 23
    // octets. `leader` est optionnel en marcxchange 2.0 ; un leader malformé
    // ne l'est pas. Servir un document invalide à un moissonneur serait pire
    // que de taire un élément facultatif.
    for (const malforme of ['trop court', '00397nam a2200109 a 45', '', 'é0397nam a2200109 a 4500']) {
      const xml = versMarcxchangeDepuisNatif({ leader: malforme, fields: zones }, 'MARC21') as string;
      expect(xml, JSON.stringify(malforme)).not.toBeNull();
      expect(xml, JSON.stringify(malforme)).not.toContain('<leader>');
      // Et la notice sort quand même : ses zones valent mieux que rien.
      expect(lireZonesXml(xml)).toEqual(zones);
    }
  });
});

describe("L'ENTREPÔT sert le natif — la preuve au niveau où le moissonneur interroge", () => {
  const tenant = { slug: 'zinda', name: 'EXEMPLE', adminEmail: 'bib@exemple.bf' };

  /**
   * ⚠ CE TEST EST AU NIVEAU DE L'ENTREPÔT, PAS DE LA FONCTION, ET C'EST LE
   * POINT. Les tests ci-dessus prouvent que `versMarcxchangeDepuisNatif` est
   * fidèle ; ils ne prouvent PAS que l'entrepôt l'appelle. Sans ce dernier
   * maillon, la fonction pourrait être parfaite et jamais atteinte — un
   * chemin mort, exactement ce que `CLAUDE.md` apprend à soupçonner d'abord.
   */
  /**
   * ⚠ CETTE DOUBLURE PROJETTE À TRAVERS LE `select`, ET CE N'EST PAS UN DÉTAIL.
   *
   * Écrite d'abord en rendant la ligne entière quel que soit le `select`, elle
   * a laissé passer un contrôle négatif : retirer `marcData: true` du
   * `RECORD_SELECT` de l'entrepôt cassait la réexposition en production, et les
   * quatorze tests restaient verts. Une doublure plus permissive que la base
   * rend le test aveugle exactement là où la vraie requête décide.
   */
  function projeter(ligne: Record<string, unknown>, select: Record<string, unknown>) {
    const sortie: Record<string, unknown> = {};
    for (const cle of Object.keys(select)) sortie[cle] = ligne[cle];
    return sortie;
  }

  async function moissonner(ligne: Record<string, unknown>, verb: string) {
    const db = {
      biblioRecord: {
        aggregate: vi.fn().mockResolvedValue({ _min: { updatedAt: new Date(0) } }),
        count: vi.fn().mockResolvedValue(1),
        findMany: vi.fn(async ({ select }: any) => [projeter(ligne, select)]),
        findUnique: vi.fn(async ({ select }: any) => projeter(ligne, select)),
        groupBy: vi.fn().mockResolvedValue([]),
      },
    } as never;
    return new OaiService().handle(
      db,
      tenant,
      { verb, metadataPrefix: MARCXCHANGE_PREFIX, ...(verb === 'GetRecord' ? { identifier: 'oai:zinda:rec-1' } : {}) },
      'http://localhost/oai',
      new Date('2026-09-11T22:00:00.000Z'),
    );
  }

  /** La ligne telle que Prisma la rend pour une notice IMPORTÉE. */
  async function ligneImportee() {
    const { marcData, marcFormat } = await importerLaSource();
    return {
      id: 'rec-1',
      updatedAt: new Date('2026-09-10T00:00:00Z'),
      title: 'Le droit foncier rural',
      titleComplement: 'au Burkina Faso',
      isbn: '978-2-1234-5680-3',
      publishYear: null,
      language: 'fr',
      publisher: null,
      summary: null,
      profile: 'bibliographique',
      profileData: {},
      marcData,
      marcFormat,
      category: 'droit',
      recordType: 'book',
      contributors: [],
      keywords: [] as { keyword: { name: string } }[],
    };
  }

  it('GetRecord marcxchange rend la note, la vedette et la cote locale de la SOURCE', async () => {
    const xml = await moissonner(await ligneImportee(), 'GetRecord');

    expect(lireZonesXml(xml)).toEqual(SOURCE);
    expect(xml).toContain('format="MARC21"');
  });

  it('ListRecords marcxchange aussi — les deux verbes passent par le même chemin', async () => {
    const xml = await moissonner(await ligneImportee(), 'ListRecords');
    expect(lireZonesXml(xml)).toEqual(SOURCE);
  });

  it('⚠ une notice SAISIE dans Gafeso garde la reconstruction — rien n’a changé pour elle', async () => {
    // Le contrôle de non-régression du lot : les notices sans natif sont la
    // totalité des 352 notices du fonds de développement (mesuré ce soir).
    const ligne = { ...(await ligneImportee()), marcData: {}, marcFormat: 'UNIMARC' };
    const xml = await moissonner(ligne, 'GetRecord');

    const tags = lireZonesXml(xml).map((z) => z[0]);
    expect(tags).toContain('200'); // zone UNIMARC de titre : c'est bien la reconstruction
    expect(tags).not.toContain('901');
    expect(xml).toContain('format="UNIMARC"');
    expect(xml).not.toContain('<leader>'); // jamais de leader inventé
  });
});
