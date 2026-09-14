import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { OaiService } from './oai.service';

/**
 * ⚠ L'ENTREPÔT OAI NE DONNE JAMAIS ACCÈS À UN FICHIER — et c'est le cas que le
 * brief P6 déclare IRRATTRAPABLE.
 *
 * « Un moissonneur qui archive un fichier sous embargo est irrattrapable. » Une
 * thèse sous embargo doit rester DÉCRITE — cacher la notice entière la rendrait
 * introuvable, ce qui est la pratique inverse de celle des dépôts — mais son
 * document ne doit sortir par aucune porte publique.
 *
 * ⚠ AUJOURD'HUI C'EST VRAI PAR CONSTRUCTION, ET C'EST EXACTEMENT POUR ÇA QU'IL
 * FAUT UN GARDE. L'entrepôt ne sert que des métadonnées : ni `dc:identifier` de
 * fichier, ni lien de téléchargement, ni clé d'objet. Il n'y a donc rien à
 * filtrer — mais rien n'empêche quelqu'un d'ajouter demain, pour rendre service,
 * un `<dc:identifier>https://…/documents/x.pdf</dc:identifier>`. Ce geste est
 * naturel, il paraît utile, et il n'échouerait nulle part.
 *
 * C'est la même forme que `jamais-public.spec.ts` pour les dépôts : un garde
 * NÉGATIF sur une propriété qu'aucun code n'exerce encore.
 */

/** Les mots par lesquels un fichier entrerait dans l'entrepôt. */
const MOTS_DE_FICHIER = [
  'objectKey',
  'encObjectKey',
  'fileKey',
  'digitalCopy',
  'digitalCopies',
  'getReadUrl',
  'presigned',
  'StorageService',
];

const FICHIERS = readdirSync(__dirname)
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
  .map((f) => ({ nom: f, source: readFileSync(join(__dirname, f), 'utf8') }));

describe('⚠ Aucun fichier ne passe par l’entrepôt OAI', () => {
  it('l’instrument lit bien les sources du module', () => {
    // ⚠ TÉMOIN. Une liste vide de fichiers rendrait tous les cas ci-dessous
    // verts sans rien mesurer — « une sortie vide ne prouve rien ».
    expect(FICHIERS.map((f) => f.nom).sort()).toEqual([
      'etdms.ts',
      'oai-xml.ts',
      'oai.controller.ts',
      'oai.module.ts',
      'oai.service.ts',
      'reexposition-fidele.ts',
    ]);
  });

  for (const mot of MOTS_DE_FICHIER) {
    it(`aucune source du module ne mentionne « ${mot} »`, () => {
      const fautifs = FICHIERS.filter((f) => f.source.includes(mot)).map((f) => f.nom);
      expect(
        fautifs,
        `${mot} : l’entrepôt OAI est public et ne doit exposer que des ` +
          'MÉTADONNÉES. Un moissonneur qui archive le fichier d’une thèse sous ' +
          'embargo est irrattrapable. Si un lien de document doit sortir un ' +
          'jour, il passe par une surface qui rejoue le droit d’accès — jamais ' +
          'par ici.',
      ).toEqual([]);
    });
  }
});

describe('⚠ Et la MESURE : le XML produit ne porte aucune adresse de document', () => {
  const tenant = { slug: 'zinda', name: 'EXEMPLE', adminEmail: 'bibliotheque@exemple.bf' };
  const baseUrl = 'http://localhost/oai';
  const now = new Date('2026-07-18T10:00:00.000Z');

  /** Une thèse SOUS EMBARGO, qui porte un fichier — le pire cas. */
  const these = {
    id: 'r-embargo',
    updatedAt: new Date('2026-07-10T00:00:00Z'),
    title: 'Thèse sous embargo',
    titleComplement: null,
    isbn: null,
    publishYear: 2026,
    language: 'fr',
    publisher: null,
    publicationCity: null,
    defenseUniversity: 'Université Joseph Ki-Zerbo',
    defensePlace: 'Ouagadougou',
    category: 'droit',
    recordType: 'these',
    profile: 'academique',
    embargoUntil: new Date('2030-01-01T00:00:00Z'),
    contributors: [
      { name: 'Traoré, Awa', role: 'AUTEUR_PRINCIPAL', position: 0 },
      { name: 'Zongo, Pauline', role: 'DIRECTEUR_MEMOIRE', position: 1 },
    ],
    keywords: [{ keyword: { name: 'foncier' } }],
  };

  /**
   * ⚠ LA DOUBLURE MÉMORISE LE `where`, et c'est nécessaire : elle n'applique
   * aucun filtre. Un test qui se contenterait de lire la sortie ne verrait donc
   * PAS un `where` qui écarte les notices sous embargo — la mutation
   * s'appliquerait, le code s'exécuterait, et rien ne tomberait. C'est la
   * cinquième lecture d'une mutation qui ne casse rien : le jeu d'essai
   * n'atteint pas le chemin. On éprouve donc la REQUÊTE, pas seulement la
   * sortie.
   */
  function doublure() {
    const findMany = vi.fn(async (_a: { where?: Record<string, unknown> }) => [these]);
    const count = vi.fn(async (_a: { where?: Record<string, unknown> }) => 1);
    return {
      db: {
        biblioRecord: {
          aggregate: vi
            .fn()
            .mockResolvedValue({ _min: { updatedAt: new Date('2026-07-08T00:00:00Z') } }),
          groupBy: vi.fn().mockResolvedValue([{ category: 'droit', _count: { _all: 1 } }]),
          count,
          findMany,
          findUnique: vi.fn(async () => these),
        },
      } as never,
      findMany,
      count,
    };
  }

  const svc = new OaiService();

  it('⚠ la thèse sous embargo EST décrite — la cacher la rendrait introuvable', async () => {
    // C'est la moitié qu'on oublie : l'embargo protège le fichier, pas la
    // notice. Un dépôt dont les thèses sous embargo disparaissent du
    // moissonnage ne remplit pas son office.
    const { db, findMany, count } = doublure();
    const xml = await svc.handle(
      db,
      tenant,
      { verb: 'ListRecords', metadataPrefix: 'oai_dc' },
      baseUrl,
      now,
    );
    expect(xml).toContain('Thèse sous embargo');

    // ⚠ ET LA REQUÊTE NE CONNAÎT PAS L'EMBARGO. C'est l'autre porte : un `where`
    // qui écarterait `embargoUntil` rendrait la thèse invisible du moissonnage
    // sans qu'aucune assertion sur la SORTIE ne bronche, puisque la doublure ne
    // filtre pas. On éprouve donc les deux.
    for (const appel of [...findMany.mock.calls, ...count.mock.calls]) {
      expect(Object.keys(appel[0].where ?? {})).not.toContain('embargoUntil');
    }
  });

  it('⚠ et le XML ne contient AUCUNE adresse de document', async () => {
    for (const prefix of ['oai_dc', 'etdms']) {
      const { db } = doublure();
      const xml = await svc.handle(
        db,
        tenant,
        { verb: 'ListRecords', metadataPrefix: prefix },
        baseUrl,
        now,
      );
      // ⚠ LISTE BLANCHE, PAS LISTE NOIRE. Une liste de motifs interdits ne
      // voit que ce à quoi on a pensé ; une liste d'URL ADMISES fait échouer
      // toute adresse nouvelle, y compris celle que personne n'a imaginée.
      // C'est la seule forme qui attrape le lien de document ajouté demain.
      const ADMISES = [
        'http://www.w3.org', // xsi
        'http://www.openarchives.org', // OAI-PMH
        'http://purl.org/dc/elements/1.1/', // Dublin Core
        'http://www.ndltd.org', // ETD-MS
        baseUrl, // l'entrepôt lui-même
        // ⚠ P7-2 : LA LOCALISATION D'UNE NOTICE, ET ELLE SEULE.
        //
        // Ce garde annonçait le geste : « rien n'empêche quelqu'un d'ajouter
        // demain, pour rendre service, un <dc:identifier>https://…</…> ». Il
        // l'a attrapé le jour où je l'ai fait. La question qu'il pose est la
        // bonne — cette adresse mène-t-elle à un DOCUMENT ?
        //
        // Elle mène à `/opac/resoudre/oai:<école>:<uuid>`, qui rend la NOTICE
        // publique : le contrat de `contrat-notice-publique.ts` ne porte ni
        // clé d'objet, ni URL de fichier, et projette `digitalCopy` sur son
        // seul `fileFormat`. Le fichier reste derrière `/opac/records/:id/read`,
        // qui passe par `getRecordAccessStatus` — donc par l'embargo.
        //
        // ⚠ ON ADMET LE CHEMIN, PAS L'ORIGINE. Admettre l'origine entière
        // (`new URL(baseUrl).origin`) rouvrirait la porte pour tout ce qui est
        // servi par le même serveur — à commencer par une URL de document. Le
        // préfixe est donc le plus étroit qui laisse passer ce qu'on publie.
        `${new URL(baseUrl).origin}/opac/resoudre/`,
      ];
      const urls = [...xml.matchAll(/https?:\/\/[^\s"'<>]+/g)].map((m) => m[0]);
      const suspectes = urls.filter((u) => !ADMISES.some((a) => u.startsWith(a)));
      expect(suspectes, `${prefix} : adresses inattendues dans la sortie OAI`).toEqual([]);
      expect(xml, prefix).not.toMatch(/\.pdf|\.epub/i);
    }
  });

  it('⚠ TÉMOIN : une adresse de DOCUMENT sur la même origine échouerait encore', () => {
    // La tolérance ajoutée en P7-2 admet un CHEMIN, pas une origine. Sans ce
    // témoin, élargir demain `/opac/resoudre/` en `origin` passerait inaperçu —
    // et c'est exactement l'élargissement qui rouvrirait la porte.
    const origine = new URL(baseUrl).origin;
    const ADMISES = [`${origine}/opac/resoudre/`];
    const document = `${origine}/opac/records/abc/read`;
    expect(ADMISES.some((a) => document.startsWith(a))).toBe(false);
  });

  it('⚠ LA CONDITION DE P6-4 : l’URL résolvable publiée mène à la NOTICE, pas au fichier', async () => {
    // « Dès qu'une URL résolvable entre dans les métadonnées, un moissonneur
    // peut atteindre le fichier » — c'est ce que P6-4 avait noté comme
    // condition de P7. On la mesure plutôt que de la supposer.
    const { db } = doublure();
    const xml = await svc.handle(
      db,
      tenant,
      { verb: 'ListRecords', metadataPrefix: 'oai_dc' },
      baseUrl,
      now,
    );
    const urls = [...xml.matchAll(/https?:\/\/[^\s"'<>]+/g)].map((m) => m[0]);
    const publiees = urls.filter((u) => u.startsWith(new URL(baseUrl).origin));

    // ⚠ CE TÉMOIN A ÉTÉ CORRIGÉ APRÈS UN CONTRÔLE NÉGATIF QUI NE TOMBAIT PAS.
    // Il disait seulement « au moins une URL de notre origine » — et l'URL de
    // l'ENTREPÔT lui-même (dans `<request>`) le satisfaisait. Retirer la
    // localisation ne faisait donc rien tomber : le test ne regardait pas assez
    // large, quatrième lecture d'une mutation qui ne casse rien.
    expect(
      publiees.filter((u) => u.includes('/opac/resoudre/')).length,
      'la LOCALISATION n’est pas publiée : `dc:identifier` n’a plus d’adresse résolvable',
    ).toBeGreaterThan(0);
    expect(
      xml,
      'l’IDENTIFIANT pérenne n’est pas publié — c’est pourtant ce qui survit au déménagement',
    ).toMatch(/<dc:identifier>oai:[^<]+<\/dc:identifier>/);
    for (const u of publiees) {
      expect(u, 'une adresse publiée mène ailleurs que vers une notice').toMatch(
        /\/oai$|\/opac\/resoudre\//,
      );
    }
  });
});
