import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Marc, Record as MarcRecord } from 'marcjs';
import { CatalogingService } from './cataloging.service';

function makeSearch() {
  return {
    ensureIndex: vi.fn().mockResolvedValue(undefined),
    indexRecords: vi.fn().mockResolvedValue(undefined),
    removeRecord: vi.fn().mockResolvedValue(undefined),
    clearIndex: vi.fn().mockResolvedValue(undefined),
    search: vi.fn(),
  };
}

function makeDigitalCopy() {
  return { remove: vi.fn().mockResolvedValue({ deleted: true }) };
}

/** 3 liaisons mots-clés telles que le `include` Prisma les renvoie. */
const KW3 = [
  { keyword: { name: 'foncier' } },
  { keyword: { name: 'droit rural' } },
  { keyword: { name: 'burkina faso' } },
];

/** Mots-clés du DTO créés par connectOrCreate → forme renvoyée par l'include. */
function linkedKeywords(data: any) {
  return (data.keywords?.create ?? []).map((c: any) => ({
    keyword: { name: c.keyword.connectOrCreate.create.name },
  }));
}

/** Contributeurs du DTO (écriture imbriquée) → forme renvoyée par l'include. */
function linkedContributors(data: any) {
  return data.contributors?.create ?? [];
}

let seq = 0;
function makeDb() {
  return {
    biblioRecord: {
      create: vi.fn(async ({ data }: any) => ({
        id: `rec-${++seq}`,
        coverUrl: null,
        author: null,
        isbn: null,
        publishYear: null,
        category: null,
        ...data,
        keywords: linkedKeywords(data), // forme du `include` Prisma
        contributors: linkedContributors(data),
      })),
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      update: vi.fn(async ({ where, data }: any) => ({
        id: where.id,
        ...data,
        keywords: linkedKeywords(data),
        contributors: linkedContributors(data),
      })),
      delete: vi.fn().mockResolvedValue({}),
    },
    item: {
      create: vi.fn(async ({ data }: any) => ({ id: 'item-1', ...data })),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn(async ({ where, data }: any) => ({ id: where.id, ...data })),
      delete: vi.fn().mockResolvedValue({}),
    },
    recordContributor: {
      create: vi.fn(async ({ data }: any) => ({ id: 'contrib-1', ...data })),
    },
  } as any;
}

describe('CatalogingService — notices', () => {
  let service: CatalogingService;
  let search: ReturnType<typeof makeSearch>;
  let digitalCopy: ReturnType<typeof makeDigitalCopy>;
  let db: any;

  beforeEach(() => {
    search = makeSearch();
    digitalCopy = makeDigitalCopy();
    // Stub du fichier d'autorités : chaque nom → une fiche (créée si absente).
    const authors = { findOrCreateByName: vi.fn().mockResolvedValue({ id: 'author-1' }) };
    service = new CatalogingService(search as any, digitalCopy as any, authors as any);
    db = makeDb();
  });

  it('createRecord normalise la catégorie et indexe le document', async () => {
    const record = await service.createRecord(db, 'zinda', {
      title: '  Droit foncier  ',
      category: 'Droit',
      author: 'Traoré, Awa',
      keywords: ['foncier', 'droit rural', 'burkina faso'],
    });

    const created = db.biblioRecord.create.mock.calls[0][0].data;
    expect(created.title).toBe('Droit foncier');
    expect(created.category).toBe('droit'); // minuscules pour la constellation
    expect(created.language).toBe('fr');
    expect(created.recordType).toBe('book');

    expect(search.indexRecords).toHaveBeenCalledTimes(1);
    const [slug, docs] = search.indexRecords.mock.calls[0];
    expect(slug).toBe('zinda');
    expect(docs[0]).toMatchObject({
      id: record.id,
      title: 'Droit foncier',
      category: 'droit',
    });
  });

  it('createRecord stocke le complément de titre SÉPARÉMENT (jamais concaténé)', async () => {
    await service.createRecord(db, 'zinda', {
      title: 'Droit foncier',
      titleComplement: '  principes et jurisprudence  ',
      author: 'Traoré, Awa',
      keywords: ['foncier', 'droit rural', 'burkina faso'],
    });
    const created = db.biblioRecord.create.mock.calls[0][0].data;
    expect(created.title).toBe('Droit foncier'); // pas de « : complément » stocké
    expect(created.titleComplement).toBe('principes et jurisprudence');
  });

  it('updateRecord : complément vide = effacement, absent = inchangé', async () => {
    db.biblioRecord.findUnique.mockResolvedValue({ id: 'rec-1', items: [], keywords: KW3 });

    await service.updateRecord(db, 'zinda', 'rec-1', { titleComplement: '  ' });
    expect(db.biblioRecord.update.mock.calls[0][0].data.titleComplement).toBeNull();

    await service.updateRecord(db, 'zinda', 'rec-1', { title: 'Nouveau titre' });
    expect(db.biblioRecord.update.mock.calls[1][0].data.titleComplement).toBeUndefined();
  });

  it("l'écriture n'échoue pas si Meilisearch est indisponible", async () => {
    search.indexRecords.mockRejectedValue(new Error('meili down'));
    const record = await service.createRecord(db, 'zinda', {
      title: 'Titre',
      author: 'Traoré, Awa',
      keywords: ['foncier', 'droit rural', 'burkina faso'],
    });
    expect(record.id).toBeDefined(); // la notice est créée malgré tout
  });

  it('createRecord exige au moins un auteur principal (validation serveur)', async () => {
    await expect(
      service.createRecord(db, 'zinda', { title: 'Sans auteur' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    // Un auteur secondaire seul ne suffit pas non plus.
    await expect(
      service.createRecord(db, 'zinda', {
        title: 'Sans principal',
        contributors: [{ name: 'Kaboré, Issa', role: 'AUTEUR_SECONDAIRE' }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.biblioRecord.create).not.toHaveBeenCalled();
  });

  it('createRecord : contributeurs ordonnés + dénormalisation transitoire de author', async () => {
    await service.createRecord(db, 'zinda', {
      title: 'Droit foncier',
      keywords: ['foncier', 'droit rural', 'burkina faso'],
      contributors: [
        { name: 'Traoré, Awa', role: 'AUTEUR_PRINCIPAL' },
        { name: 'Kaboré, Issa', role: 'AUTEUR_SECONDAIRE' },
        { name: 'Sana, Boukary', role: 'AUTEUR_SECONDAIRE' },
      ],
    });
    const created = db.biblioRecord.create.mock.calls[0][0].data;
    // Chaque contributeur est désormais rattaché à sa fiche d'autorité (authorId).
    expect(created.contributors.create).toEqual([
      { name: 'Traoré, Awa', role: 'AUTEUR_PRINCIPAL', position: 0, authorId: 'author-1' },
      { name: 'Kaboré, Issa', role: 'AUTEUR_SECONDAIRE', position: 1, authorId: 'author-1' },
      { name: 'Sana, Boukary', role: 'AUTEUR_SECONDAIRE', position: 2, authorId: 'author-1' },
    ]);
    // L'ancien champ reste alimenté tant que la migration en deux temps
    // n'est pas terminée (affichages/recherche existants).
    expect(created.author).toBe('Traoré, Awa');
  });

  it('createRecord : `author` hérité seul est converti en AUTEUR_PRINCIPAL (compat clients)', async () => {
    await service.createRecord(db, 'zinda', {
      title: 'Titre',
      author: 'Traoré, Awa',
      keywords: ['foncier', 'droit rural', 'burkina faso'],
    });
    const created = db.biblioRecord.create.mock.calls[0][0].data;
    expect(created.contributors.create).toEqual([
      { name: 'Traoré, Awa', role: 'AUTEUR_PRINCIPAL', position: 0, authorId: 'author-1' },
    ]);
  });

  it('updateRecord : contributeurs fournis = remplacement complet, avec la même règle', async () => {
    db.biblioRecord.findUnique.mockResolvedValue({ id: 'rec-1', items: [], keywords: KW3 });

    await expect(
      service.updateRecord(db, 'zinda', 'rec-1', {
        contributors: [{ name: 'Kaboré, Issa', role: 'AUTEUR_SECONDAIRE' }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await service.updateRecord(db, 'zinda', 'rec-1', {
      contributors: [
        { name: 'Zongo, Mariam', role: 'AUTEUR_PRINCIPAL' },
        { name: 'Pr Ouédraogo', role: 'DIRECTEUR_MEMOIRE' },
      ],
    });
    const updated = db.biblioRecord.update.mock.calls[0][0].data;
    expect(updated.contributors.deleteMany).toEqual({});
    expect(updated.contributors.create).toHaveLength(2);
    expect(updated.author).toBe('Zongo, Mariam');
  });

  it('thèse/mémoire : université de soutenance ET directeur requis (validation serveur)', async () => {
    const base = {
      title: 'Mémoire de master',
      recordType: 'memoire',
      keywords: ['foncier', 'droit rural', 'burkina faso'],
      contributors: [{ name: 'Zongo, Mariam', role: 'AUTEUR_PRINCIPAL' as const }],
    };
    // Sans université → 400.
    await expect(service.createRecord(db, 'zinda', base)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    // Avec université mais sans directeur → 400.
    await expect(
      service.createRecord(db, 'zinda', { ...base, defenseUniversity: 'EXEMPLE' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    // Complet → OK ; un ouvrage n'est jamais soumis à ces règles.
    await service.createRecord(db, 'zinda', {
      ...base,
      defenseUniversity: 'Université d’Exemple',
      contributors: [
        ...base.contributors,
        { name: 'Pr Ouédraogo', role: 'DIRECTEUR_MEMOIRE' as const },
      ],
    });
    await service.createRecord(db, 'zinda', {
      title: 'Un ouvrage',
      recordType: 'ouvrage',
      author: 'Traoré, Awa',
      keywords: ['foncier', 'droit rural', 'burkina faso'],
    });
    expect(db.biblioRecord.create).toHaveBeenCalledTimes(2);
  });

  it('licence / master / thèse unique déclenchent AUSSI les règles de soutenance', async () => {
    for (const recordType of ['licence', 'master', 'these_unique']) {
      // Sans université → 400 (comme mémoire/thèse).
      await expect(
        service.createRecord(db, 'zinda', {
          title: `Travail ${recordType}`,
          recordType,
          keywords: ['a', 'b', 'c'],
          contributors: [{ name: 'Étudiant, X', role: 'AUTEUR_PRINCIPAL' as const }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(db.biblioRecord.create).not.toHaveBeenCalled();
  });

  it('updateRecord applique les règles de soutenance sur l’ÉTAT FINAL de la notice', async () => {
    // Notice existante : ouvrage → on la bascule en mémoire sans université ni
    // directeur → refus ; l'état en base sert de valeur par défaut.
    db.biblioRecord.findUnique.mockResolvedValue({
      id: 'rec-1',
      recordType: 'ouvrage',
      defenseUniversity: null,
      items: [],
      keywords: KW3,
      contributors: [{ name: 'Traoré, Awa', role: 'AUTEUR_PRINCIPAL', position: 0 }],
    });
    await expect(
      service.updateRecord(db, 'zinda', 'rec-1', { recordType: 'memoire' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    // Mémoire déjà complet en base : un PATCH partiel (ex. titre) passe.
    db.biblioRecord.findUnique.mockResolvedValue({
      id: 'rec-2',
      recordType: 'memoire',
      defenseUniversity: 'EXEMPLE',
      items: [],
      keywords: KW3,
      contributors: [
        { name: 'Zongo, Mariam', role: 'AUTEUR_PRINCIPAL', position: 0 },
        { name: 'Pr Ouédraogo', role: 'DIRECTEUR_MEMOIRE', position: 1 },
      ],
    });
    await service.updateRecord(db, 'zinda', 'rec-2', { title: 'Titre corrigé' });
    expect(db.biblioRecord.update).toHaveBeenCalledTimes(1);
  });

  it('création : moins de 3 mots-clés → 400 avec le message du cahier des charges', async () => {
    await expect(
      service.createRecord(db, 'zinda', {
        title: 'Titre',
        author: 'Traoré, Awa',
        keywords: ['foncier', 'foncier', '  '], // doublon + vide = 1 seul réel
      }),
    ).rejects.toMatchObject({ message: 'Ajoutez au moins 3 mots-clés pour enregistrer.' });
    expect(db.biblioRecord.create).not.toHaveBeenCalled();
  });

  it('création : mots-clés normalisés (minuscules), dédupliqués, réutilisés via connectOrCreate', async () => {
    const record = await service.createRecord(db, 'zinda', {
      title: 'Titre',
      author: 'Traoré, Awa',
      keywords: ['  Foncier ', 'DROIT  rural', 'Burkina Faso', 'foncier'],
    });
    const created = db.biblioRecord.create.mock.calls[0][0].data;
    expect(created.keywords.create).toHaveLength(3);
    expect(created.keywords.create[0].keyword.connectOrCreate).toEqual({
      where: { name: 'foncier' },
      create: { name: 'foncier' },
    });
    // Réponse API : simple tableau de chaînes.
    expect(record.keywords).toEqual(['foncier', 'droit rural', 'burkina faso']);
  });

  it('modification d’une ancienne fiche sans mots-clés → 400 tant qu’on n’en fournit pas 3', async () => {
    // Fiche d'avant la règle : 0 mot-clé en base — consultable, mais toute
    // MODIFICATION exige de compléter (décision §0, non rétroactif en lecture).
    db.biblioRecord.findUnique.mockResolvedValue({ id: 'rec-1', items: [], keywords: [] });
    await expect(
      service.updateRecord(db, 'zinda', 'rec-1', { title: 'Titre corrigé' }),
    ).rejects.toMatchObject({ message: 'Ajoutez au moins 3 mots-clés pour enregistrer.' });

    // La même modification passe dès que 3 mots-clés sont fournis.
    await service.updateRecord(db, 'zinda', 'rec-1', {
      title: 'Titre corrigé',
      keywords: ['foncier', 'droit rural', 'burkina faso'],
    });
    const updated = db.biblioRecord.update.mock.calls[0][0].data;
    expect(updated.keywords.deleteMany).toEqual({});
    expect(updated.keywords.create).toHaveLength(3);
  });

  it('migrateAuthorsToContributors : copie idempotente, ne touche pas à author', async () => {
    db.biblioRecord.findMany.mockResolvedValue([
      { id: 'rec-1', author: 'Traoré, Awa' },
      { id: 'rec-2', author: 'Kaboré, Issa' },
    ]);
    const result = await service.migrateAuthorsToContributors(db);

    expect(result).toEqual({ migrated: 2 });
    // Seules les notices AVEC auteur et SANS contributeur sont ciblées.
    expect(db.biblioRecord.findMany.mock.calls[0][0].where).toEqual({
      author: { not: null },
      contributors: { none: {} },
    });
    expect(db.recordContributor.create).toHaveBeenCalledTimes(2);
    expect(db.recordContributor.create.mock.calls[0][0].data).toEqual({
      recordId: 'rec-1',
      name: 'Traoré, Awa',
      role: 'AUTEUR_PRINCIPAL',
      position: 0,
    });
    expect(db.biblioRecord.update).not.toHaveBeenCalled(); // author intact
  });

  it('updateRecord réindexe la notice', async () => {
    db.biblioRecord.findUnique.mockResolvedValue({ id: 'rec-1', items: [], keywords: KW3 });
    await service.updateRecord(db, 'zinda', 'rec-1', { category: 'Medecine' });
    expect(db.biblioRecord.update.mock.calls[0][0].data.category).toBe('medecine');
    expect(search.indexRecords).toHaveBeenCalledTimes(1);
  });

  it('deleteRecord refuse si des exemplaires ou réservations existent', async () => {
    db.biblioRecord.findUnique.mockResolvedValue({
      id: 'rec-1',
      _count: { items: 2, holds: 0 },
    });
    await expect(service.deleteRecord(db, 'zinda', 'rec-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(db.biblioRecord.delete).not.toHaveBeenCalled();
  });

  it('deleteRecord supprime la notice et son document indexé', async () => {
    db.biblioRecord.findUnique.mockResolvedValue({
      id: 'rec-1',
      _count: { items: 0, holds: 0 },
    });
    await service.deleteRecord(db, 'zinda', 'rec-1');
    expect(db.biblioRecord.delete).toHaveBeenCalled();
    expect(search.removeRecord).toHaveBeenCalledWith('zinda', 'rec-1');
    expect(digitalCopy.remove).not.toHaveBeenCalled();
  });

  it('deleteRecord supprime aussi l’exemplaire numérique rattaché (bug 500 corrigé)', async () => {
    // Reproduit en réel : sans ce nettoyage, db.biblioRecord.delete() plante
    // (clé étrangère digital_copies.record_id) dès qu'un fichier est attaché.
    db.biblioRecord.findUnique.mockResolvedValue({
      id: 'rec-1',
      _count: { items: 0, holds: 0 },
      digitalCopy: { id: 'dc-1', recordId: 'rec-1' },
    });
    await service.deleteRecord(db, 'zinda', 'rec-1');
    expect(digitalCopy.remove).toHaveBeenCalledWith(db, 'rec-1');
    expect(db.biblioRecord.delete).toHaveBeenCalled();
  });

  it('le document indexé porte les nouveaux champs cherchables (§5)', async () => {
    await service.createRecord(db, 'zinda', {
      title: 'Gouvernance foncière',
      titleComplement: 'le cas du Plateau central',
      recordType: 'memoire',
      defenseUniversity: 'Université d’Exemple',
      keywords: ['foncier', 'droit rural', 'burkina faso'],
      summary: 'Analyse des dynamiques agraires du Plateau central.',
      contributors: [
        { name: 'Nikiema, Rasmata', role: 'AUTEUR_PRINCIPAL' },
        { name: 'Pr Ouédraogo, Albert', role: 'DIRECTEUR_MEMOIRE' },
      ],
    });
    const doc = search.indexRecords.mock.calls[0][1][0];
    expect(doc).toMatchObject({
      titleComplement: 'le cas du Plateau central',
      // Tous rôles confondus : le directeur de mémoire est cherchable.
      contributors: ['Nikiema, Rasmata', 'Pr Ouédraogo, Albert'],
      keywords: ['foncier', 'droit rural', 'burkina faso'],
      defenseUniversity: 'Université d’Exemple',
      // Résumé indexé (poids le plus faible, §3).
      summary: 'Analyse des dynamiques agraires du Plateau central.',
    });
    // Affichage : contributeurs ordonnés AVEC leur rôle (auteur puis directeur).
    expect(doc.contributorList).toEqual([
      { name: 'Nikiema, Rasmata', role: 'AUTEUR_PRINCIPAL', authorId: 'author-1' },
      { name: 'Pr Ouédraogo, Albert', role: 'DIRECTEUR_MEMOIRE', authorId: 'author-1' },
    ]);
  });

  it('contributorList est trié par position (principal en premier), quel que soit l’ordre reçu', async () => {
    db.biblioRecord.findMany.mockResolvedValue([
      {
        id: 'a', title: 'A', author: null, isbn: null, category: null, language: 'fr',
        publishYear: null, recordType: 'book', coverUrl: null,
        contributors: [
          { name: 'Second, B', role: 'AUTEUR_SECONDAIRE', position: 1 },
          { name: 'Principal, A', role: 'AUTEUR_PRINCIPAL', position: 0 },
        ],
      },
    ]);
    await service.reindexAll(db, 'zinda');
    const doc = search.indexRecords.mock.calls[0][1][0];
    expect(doc.contributorList).toEqual([
      { name: 'Principal, A', role: 'AUTEUR_PRINCIPAL', authorId: null },
      { name: 'Second, B', role: 'AUTEUR_SECONDAIRE', authorId: null },
    ]);
    expect(doc.contributors).toEqual(['Principal, A', 'Second, B']);
  });

  it('notice sans contributeur (pas encore migrée) : repli sur author pour rester cherchable', async () => {
    db.biblioRecord.findMany.mockResolvedValue([
      { id: 'a', title: 'A', author: 'Traoré, Awa', isbn: null, category: null, language: 'fr', publishYear: null, recordType: 'book', coverUrl: null },
    ]);
    await service.reindexAll(db, 'zinda');
    const doc = search.indexRecords.mock.calls[0][1][0];
    expect(doc.contributors).toEqual(['Traoré, Awa']);
    expect(doc.contributorList).toEqual([
      { name: 'Traoré, Awa', role: 'AUTEUR_PRINCIPAL', authorId: null },
    ]);
    expect(doc.keywords).toEqual([]);
  });

  it('reindexAll vide puis réindexe tout le catalogue', async () => {
    db.biblioRecord.findMany.mockResolvedValue([
      { id: 'a', title: 'A', author: null, isbn: null, category: 'droit', language: 'fr', publishYear: null, recordType: 'book', coverUrl: null },
      { id: 'b', title: 'B', author: null, isbn: null, category: null, language: 'fr', publishYear: null, recordType: 'book', coverUrl: null },
    ]);
    const result = await service.reindexAll(db, 'zinda');
    expect(result.indexed).toBe(2);
    expect(search.clearIndex).toHaveBeenCalledWith('zinda');
    expect(search.indexRecords.mock.calls[0][1]).toHaveLength(2);
  });
});

describe('CatalogingService — import MARC (fichier réel ISO 2709)', () => {
  let service: CatalogingService;
  let search: ReturnType<typeof makeSearch>;
  let db: any;

  beforeEach(() => {
    search = makeSearch();
    const authors = { findOrCreateByName: vi.fn().mockResolvedValue({ id: 'author-1' }) };
    service = new CatalogingService(search as any, makeDigitalCopy() as any, authors as any);
    db = makeDb();
  });

  function unimarcFile(): Buffer {
    const mk = (title: string, author: [string, string], isbn: string) => {
      const r = new MarcRecord();
      r.append(['010', '  ', 'a', isbn]);
      r.append(['101', '  ', 'a', 'fre']);
      r.append(['200', '1 ', 'a', title]);
      r.append(['210', '  ', 'd', '2023']);
      r.append(['700', ' 1', 'a', author[0], 'b', author[1]]);
      return Buffer.from(Marc.format(r, 'iso2709'), 'utf8');
    };
    const empty = new MarcRecord();
    empty.append(['010', '  ', 'a', 'sans-titre']); // notice sans titre → ignorée
    return Buffer.concat([
      mk('Droit foncier rural é', ['Traoré', 'Awa'], '978-2-0001'),
      mk('Anatomie générale', ['Ouédraogo', 'Salif'], '978-2-0002'),
      Buffer.from(Marc.format(empty, 'iso2709'), 'utf8'),
    ]);
  }

  it('importe les notices valides, ignore celles sans titre, indexe le lot', async () => {
    const result = await service.importMarc(db, 'zinda', unimarcFile(), 'UNIMARC', 'Droit');

    expect(result).toEqual({ imported: 2, skipped: 1 });

    const first = db.biblioRecord.create.mock.calls[0][0].data;
    expect(first.title).toBe('Droit foncier rural é'); // UTF-8 intact
    expect(first.author).toBe('Traoré, Awa');
    expect(first.isbn).toBe('978-2-0001');
    expect(first.publishYear).toBe(2023);
    expect(first.language).toBe('fre');
    expect(first.category).toBe('droit'); // catégorie par défaut appliquée
    expect(first.marcFormat).toBe('UNIMARC');
    expect(first.marcData.fields.length).toBeGreaterThan(0); // MARC brut conservé
    // La zone auteur du MARC devient le contributeur principal, rattaché à sa
    // fiche d'autorité (authorId), comme la saisie manuelle.
    expect(first.contributors.create).toEqual([
      { name: 'Traoré, Awa', role: 'AUTEUR_PRINCIPAL', authorId: 'author-1', position: 0 },
    ]);

    expect(search.indexRecords).toHaveBeenCalledTimes(1);
    expect(search.indexRecords.mock.calls[0][1]).toHaveLength(2);
  });
});

describe('CatalogingService — exemplaires', () => {
  let service: CatalogingService;
  let db: any;

  beforeEach(() => {
    service = new CatalogingService(makeSearch() as any, makeDigitalCopy() as any);
    db = makeDb();
    db.biblioRecord.findUnique.mockResolvedValue({ id: 'rec-1', items: [] });
  });

  it('addItem crée l’exemplaire rattaché à la notice', async () => {
    const item = await service.addItem(db, 'rec-1', { barcode: ' ZK-1 ' });
    expect(item.barcode).toBe('ZK-1');
    expect(db.item.create.mock.calls[0][0].data.recordId).toBe('rec-1');
  });

  it('addItem refuse un code-barres déjà utilisé (P2002 → 409)', async () => {
    const { Prisma } = await import('@prisma/client');
    db.item.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    await expect(service.addItem(db, 'rec-1', { barcode: 'ZK-1' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('deleteItem refuse si des prêts sont rattachés', async () => {
    db.item.findUnique.mockResolvedValue({ id: 'item-1', _count: { checkouts: 3 } });
    await expect(service.deleteItem(db, 'item-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('updateItem échoue proprement si exemplaire introuvable', async () => {
    await expect(service.updateItem(db, 'ghost', {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('addItem : localisation canonique acceptée, valeur libre refusée (liste fixe)', async () => {
    const ok = await service.addItem(db, 'rec-1', { barcode: 'ZK-2', location: 'Réserve' });
    expect(db.item.create.mock.calls[0][0].data.location).toBe('Réserve');
    expect(ok.barcode).toBe('ZK-2');
    // Valeur hors liste → 400.
    await expect(
      service.addItem(db, 'rec-1', { barcode: 'ZK-3', location: 'Rez-de-chaussée' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    // Vide → null (sans localisation), accepté.
    await service.addItem(db, 'rec-1', { barcode: 'ZK-4', location: '  ' });
    expect(db.item.create.mock.calls[1][0].data.location).toBeNull();
  });

  it('updateItem : conserve une localisation héritée non conforme (grandfather)', async () => {
    // Exemplaire existant avec une localisation libre historique.
    db.item.findUnique.mockResolvedValue({ id: 'item-1', location: 'Rez-de-chaussée' });
    // Renvoyer la MÊME valeur héritée ne casse pas la mise à jour.
    await service.updateItem(db, 'item-1', { location: 'Rez-de-chaussée', callNumber: '900 X' });
    expect(db.item.update.mock.calls[0][0].data.location).toBe('Rez-de-chaussée');
    // Mais passer à une AUTRE valeur non canonique est refusé.
    await expect(
      service.updateItem(db, 'item-1', { location: 'Cave' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    // Passer à une valeur canonique est accepté.
    await service.updateItem(db, 'item-1', { location: 'Documentation' });
    expect(db.item.update.mock.calls[1][0].data.location).toBe('Documentation');
  });
});
