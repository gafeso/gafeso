import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { BiblioRecord, MarcFormat, Prisma, PrismaClient } from '@prisma/client';
import { Readable } from 'stream';
import { Marc, Record as MarcRecord } from 'marcjs';
import {
  buildRecordSearchDoc,
  RecordSearchDoc,
  SearchService,
} from '../search/search.service';
import { extractBiblio, MarcFields } from './marc-mapper';
import { ContributorDto, CreateRecordDto } from './dto/create-record.dto';
import { UpdateRecordDto } from './dto/update-record.dto';
import { CreateItemDto, UpdateItemDto } from './dto/item.dto';
import { ListRecordsDto } from './dto/list-records.dto';
import { DigitalCopyService } from './digital-copy.service';
import { normalizeItemLocation } from './item-locations';
import { AuthorsService } from '../authors/authors.service';
import { MarcExportRecord } from './marc-export';

export type TenantDb = PrismaClient;

export interface ImportMarcResult {
  imported: number;
  skipped: number;
}

@Injectable()
export class CatalogingService {
  private readonly logger = new Logger(CatalogingService.name);

  constructor(
    private readonly search: SearchService,
    private readonly digitalCopy: DigitalCopyService,
    private readonly authors: AuthorsService,
  ) {}

  /**
   * Rattache chaque contributeur à une fiche d'autorité (créée si absente) →
   * déduplication À LA SOURCE : deux saisies du même nom partagent la fiche.
   */
  private async withAuthorIds(
    db: TenantDb,
    contributors: { name: string; role: string }[],
  ): Promise<{ name: string; role: string; authorId: string }[]> {
    const linked: { name: string; role: string; authorId: string }[] = [];
    for (const c of contributors) {
      const author = await this.authors.findOrCreateByName(db, c.name);
      linked.push({ name: c.name, role: c.role, authorId: author.id });
    }
    return linked;
  }

  /** Projette une notice complète (contributeurs/mots-clés/exemplaires) pour l'export MARC. */
  private toExportRecord(r: {
    id: string; title: string; titleComplement: string | null; isbn: string | null;
    publishYear: number | null; language: string; publisher: string | null;
    publicationCity: string | null; defenseUniversity: string | null; defensePlace: string | null;
    category: string | null; recordType: string;
    contributors: { name: string; role: string; position: number }[];
    keywords: { keyword: { name: string } }[];
    items: { barcode: string; callNumber: string | null; location: string | null; status: string }[];
  }): MarcExportRecord {
    return {
      id: r.id,
      title: r.title,
      titleComplement: r.titleComplement,
      isbn: r.isbn,
      publishYear: r.publishYear,
      language: r.language,
      publisher: r.publisher,
      publicationCity: r.publicationCity,
      defenseUniversity: r.defenseUniversity,
      defensePlace: r.defensePlace,
      category: r.category,
      recordType: r.recordType,
      contributors: r.contributors.map((c) => ({ name: c.name, role: c.role, position: c.position })),
      keywords: r.keywords.map((k) => k.keyword.name),
      items: r.items.map((i) => ({
        barcode: i.barcode,
        callNumber: i.callNumber,
        location: i.location,
        status: i.status,
      })),
    };
  }

  /**
   * Notices à exporter, par LOTS (streaming) : évite de charger tout le
   * catalogue en mémoire. `ids` restreint à une sélection (ou une seule notice).
   */
  async *exportRecordsBatched(
    db: TenantDb,
    ids: string[] | undefined,
    batchSize = 500,
  ): AsyncGenerator<MarcExportRecord[]> {
    const where = ids && ids.length ? { id: { in: ids } } : {};
    let skip = 0;
    for (;;) {
      const rows = await db.biblioRecord.findMany({
        where,
        include: {
          contributors: { orderBy: { position: 'asc' } },
          keywords: { include: { keyword: true } },
          items: { orderBy: { barcode: 'asc' } },
        },
        orderBy: { id: 'asc' },
        skip,
        take: batchSize,
      });
      if (rows.length === 0) return;
      yield rows.map((r) => this.toExportRecord(r));
      skip += rows.length;
      if (rows.length < batchSize) return;
    }
  }

  /** Réindexe un lot de notices (upsert Meilisearch) après édition d'auteurs. */
  async reindexRecords(db: TenantDb, slug: string, recordIds: string[]) {
    if (recordIds.length === 0) return { indexed: 0 };
    const records = await db.biblioRecord.findMany({
      where: { id: { in: recordIds } },
      include: {
        contributors: { orderBy: { position: 'asc' } },
        keywords: { include: { keyword: true } },
      },
    });
    await this.safeIndex(slug, records.map((r) => this.toSearchDoc(r)));
    return { indexed: records.length };
  }

  // ───────────────────────────────────────────────────────────
  // Notices
  // ───────────────────────────────────────────────────────────
  async createRecord(db: TenantDb, slug: string, dto: CreateRecordDto) {
    // Compat clients existants : `author` seul est accepté et converti.
    const contributors = normalizeContributors(dto.contributors, dto.author);
    requirePrincipalAuthor(contributors);
    const recordType = dto.recordType?.trim() || 'book';
    requireDefenseFields(recordType, dto.defenseUniversity, contributors);
    const keywords = normalizeKeywords(dto.keywords);
    requireMinKeywords(keywords);
    // Rattache chaque contributeur à sa fiche d'autorité (dédup à la source).
    const linkedContributors = await this.withAuthorIds(db, contributors);

    const record = await db.biblioRecord.create({
      data: {
        title: dto.title.trim(),
        titleComplement: dto.titleComplement?.trim() || null,
        // Dénormalisation transitoire (migration en deux temps, cahier §2.2) :
        // l'ancien champ reste alimenté avec le premier auteur principal tant
        // que sa suppression n'est pas actée par une migration ultérieure.
        author: principalAuthorName(contributors),
        isbn: dto.isbn?.trim() ?? null,
        publishYear: dto.publishYear ?? null,
        language: dto.language?.trim() || 'fr',
        publisher: dto.publisher?.trim() ?? null,
        publicationCity: dto.publicationCity?.trim() || null,
        defenseUniversity: dto.defenseUniversity?.trim() || null,
        defensePlace: dto.defensePlace?.trim() || null,
        summary: dto.summary?.trim() || null,
        category: dto.category?.trim().toLowerCase() ?? null,
        recordType,
        marcFormat: dto.marcFormat ?? MarcFormat.UNIMARC,
        marcData: (dto.marcData ?? { fields: [] }) as Prisma.InputJsonValue,
        coverUrl: dto.coverUrl ?? null,
        contributors: {
          create: linkedContributors.map((c, position) => ({ ...c, position })),
        },
        keywords: keywordLinks(keywords),
      },
      include: {
        contributors: { orderBy: { position: 'asc' } },
        keywords: { include: { keyword: true } },
      },
    });
    await this.safeIndex(slug, [this.toSearchDoc(record)]);
    return flattenKeywords(record);
  }

  /**
   * Import d'un fichier MARC ISO 2709 : parse via marcjs, extrait les zones
   * bibliographiques selon le format, crée les notices et les indexe.
   * Les notices sans titre exploitable sont ignorées (comptées en skipped).
   */
  async importMarc(
    db: TenantDb,
    slug: string,
    buffer: Buffer,
    format: MarcFormat,
    defaultCategory?: string,
  ): Promise<ImportMarcResult> {
    const parsed = await this.parseIso2709(buffer);

    let imported = 0;
    let skipped = 0;
    const docs: RecordSearchDoc[] = [];

    for (const marc of parsed) {
      const extracted = extractBiblio(marc.fields as MarcFields, format);
      if (!extracted.title) {
        skipped++;
        continue;
      }
      // Tous les contributeurs (avec rôles) sont rattachés à leur fiche
      // d'autorité — l'import suit le même modèle que la saisie manuelle et que
      // l'export (aller-retour sans perte). L'exigence « ≥1 auteur principal »
      // ne BLOQUE pas un import : une notice sans zone auteur reste importable.
      const linked = await this.withAuthorIds(db, extracted.contributors);
      const importedKeywords = normalizeKeywords(extracted.keywords);
      const record = await db.biblioRecord.create({
        data: {
          title: extracted.title,
          titleComplement: extracted.titleComplement,
          author: extracted.author,
          isbn: extracted.isbn,
          publishYear: extracted.publishYear,
          language: extracted.language ?? 'fr',
          publisher: extracted.publisher,
          publicationCity: extracted.publicationCity,
          defenseUniversity: extracted.defenseUniversity,
          defensePlace: extracted.defensePlace,
          // Catégorie : celle de la notice si présente (zone locale 900$b),
          // sinon la catégorie par défaut choisie à l'import.
          category: extracted.category ?? defaultCategory?.trim().toLowerCase() ?? null,
          recordType: extracted.recordType ?? 'book',
          marcFormat: format,
          marcData: {
            leader: marc.leader,
            fields: marc.fields,
          } as Prisma.InputJsonValue,
          ...(linked.length
            ? { contributors: { create: linked.map((c, position) => ({ ...c, position })) } }
            : {}),
          ...(importedKeywords.length ? { keywords: keywordLinks(importedKeywords) } : {}),
        },
        include: {
          contributors: { orderBy: { position: 'asc' } },
          keywords: { include: { keyword: true } },
        },
      });
      docs.push(this.toSearchDoc(record));
      imported++;
    }

    await this.safeIndex(slug, docs);
    this.logger.log(`Import MARC (${slug}) : ${imported} notices, ${skipped} ignorées.`);
    return { imported, skipped };
  }

  async listRecords(db: TenantDb, query: ListRecordsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = query.category
      ? { category: query.category.trim().toLowerCase() }
      : {};

    const [total, records] = await Promise.all([
      db.biblioRecord.count({ where }),
      db.biblioRecord.findMany({
        where,
        include: {
          _count: { select: { items: true } },
          // Auteurs affichés dans le tableau du catalogue admin, ordonnés.
          contributors: { orderBy: { position: 'asc' } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return { total, page, totalPages: Math.ceil(total / limit) || 1, records };
  }

  async getRecord(db: TenantDb, id: string) {
    const record = await db.biblioRecord.findUnique({
      where: { id },
      include: {
        items: true,
        contributors: { orderBy: { position: 'asc' } },
        keywords: { include: { keyword: true } },
      },
    });
    if (!record) throw new NotFoundException('Notice introuvable.');
    return flattenKeywords(record);
  }

  /** Mots-clés du tenant (autocomplétion du champ tags — §2.4). */
  async listKeywords(db: TenantDb, q?: string) {
    return db.keyword.findMany({
      where: q?.trim() ? { name: { contains: q.trim().toLowerCase() } } : undefined,
      orderBy: { name: 'asc' },
      take: 500,
    });
  }

  async updateRecord(db: TenantDb, slug: string, id: string, dto: UpdateRecordDto) {
    const existing = await this.getRecord(db, id);

    // Contributeurs : absents = inchangés ; fournis = remplacement complet
    // (c'est le formulaire qui envoie l'état final), avec la même règle
    // serveur qu'à la création.
    const contributors =
      dto.contributors === undefined
        ? undefined
        : normalizeContributors(dto.contributors, undefined);
    if (contributors !== undefined) requirePrincipalAuthor(contributors);

    // Règles thèse/mémoire (§4.3) sur l'ÉTAT FINAL de la notice : valeur du
    // DTO si fournie, sinon valeur déjà en base.
    requireDefenseFields(
      dto.recordType?.trim() ?? existing.recordType,
      dto.defenseUniversity ?? existing.defenseUniversity,
      contributors ?? existing.contributors,
    );

    // Mots-clés (§4.1, décision §0 — non rétroactif) : la règle des 3 s'applique
    // à TOUTE modification, sur l'état final — une fiche ancienne reste lisible
    // tant qu'on ne la modifie pas, mais l'enregistrer exige de compléter.
    const keywords = dto.keywords === undefined ? undefined : normalizeKeywords(dto.keywords);
    requireMinKeywords(keywords ?? existing.keywords);
    // Rattache les nouveaux contributeurs à leur fiche d'autorité (dédup source).
    const linkedContributors = contributors ? await this.withAuthorIds(db, contributors) : undefined;

    const record = await db.biblioRecord.update({
      where: { id },
      data: {
        title: dto.title?.trim(),
        // Chaîne vide = effacement volontaire du complément (champ optionnel).
        titleComplement:
          dto.titleComplement === undefined ? undefined : dto.titleComplement.trim() || null,
        // Dénormalisation transitoire (voir createRecord) : suit les
        // contributeurs quand ils sont fournis, sinon l'ancien champ direct.
        author: contributors ? principalAuthorName(contributors) : dto.author?.trim(),
        isbn: dto.isbn?.trim(),
        publishYear: dto.publishYear,
        language: dto.language?.trim(),
        // Chaîne vide = effacement volontaire (champs optionnels).
        publisher: emptyToNull(dto.publisher),
        publicationCity: emptyToNull(dto.publicationCity),
        defenseUniversity: emptyToNull(dto.defenseUniversity),
        defensePlace: emptyToNull(dto.defensePlace),
        summary: emptyToNull(dto.summary),
        category: dto.category?.trim().toLowerCase(),
        recordType: dto.recordType?.trim(),
        marcFormat: dto.marcFormat,
        marcData: dto.marcData as Prisma.InputJsonValue | undefined,
        coverUrl: dto.coverUrl,
        ...(linkedContributors
          ? {
              contributors: {
                deleteMany: {},
                create: linkedContributors.map((c, position) => ({ ...c, position })),
              },
            }
          : {}),
        ...(keywords ? { keywords: { deleteMany: {}, ...keywordLinks(keywords) } } : {}),
      },
      include: {
        contributors: { orderBy: { position: 'asc' } },
        keywords: { include: { keyword: true } },
      },
    });
    await this.safeIndex(slug, [this.toSearchDoc(record)]);
    return flattenKeywords(record);
  }

  /**
   * Migration des données existantes (cahier §2.2, phase 1/2) : copie le
   * champ texte `author` vers un contributeur AUTEUR_PRINCIPAL pour chaque
   * notice qui a un auteur mais encore aucun contributeur. Idempotent
   * (relance = 0 copie). L'ancien champ n'est PAS supprimé ici — migration
   * en deux temps, la suppression viendra après vérification en production.
   */
  async migrateAuthorsToContributors(db: TenantDb) {
    const records = await db.biblioRecord.findMany({
      where: { author: { not: null }, contributors: { none: {} } },
      select: { id: true, author: true },
    });

    for (const record of records) {
      await db.recordContributor.create({
        data: {
          recordId: record.id,
          name: record.author as string,
          role: 'AUTEUR_PRINCIPAL',
          position: 0,
        },
      });
    }

    this.logger.log(`Migration auteurs → contributeurs : ${records.length} notices copiées.`);
    return { migrated: records.length };
  }

  async deleteRecord(db: TenantDb, slug: string, id: string) {
    const record = await db.biblioRecord.findUnique({
      where: { id },
      include: {
        _count: { select: { items: true, holds: true } },
        digitalCopy: true,
      },
    });
    if (!record) throw new NotFoundException('Notice introuvable.');
    if (record._count.items > 0 || record._count.holds > 0) {
      throw new ConflictException(
        'Impossible de supprimer : des exemplaires ou réservations sont rattachés à cette notice.',
      );
    }
    if (record.digitalCopy) {
      // Le fichier numérique n'a de sens que rattaché à CETTE notice (1↔1,
      // pas d'historique à préserver contrairement à un prêt) — supprimé
      // avec elle (MinIO + ligne) plutôt que de bloquer la suppression.
      // Sans ce nettoyage, db.biblioRecord.delete() plante en 500 (clé
      // étrangère digital_copies.record_id).
      await this.digitalCopy.remove(db, id);
    }
    await db.biblioRecord.delete({ where: { id } });
    await this.safeRemove(slug, id);
    return { deleted: true };
  }

  /** Réindexation complète de l'école (vide l'index puis réindexe tout). */
  async reindexAll(db: TenantDb, slug: string) {
    const records = await db.biblioRecord.findMany({
      include: {
        contributors: { orderBy: { position: 'asc' } },
        keywords: { include: { keyword: true } },
      },
    });
    await this.search.ensureIndex(slug);
    await this.search.clearIndex(slug);
    await this.search.indexRecords(slug, records.map((r) => this.toSearchDoc(r)));
    return { indexed: records.length };
  }

  // ───────────────────────────────────────────────────────────
  // Exemplaires
  // ───────────────────────────────────────────────────────────
  async addItem(db: TenantDb, recordId: string, dto: CreateItemDto) {
    await this.getRecord(db, recordId);
    // Localisation : liste fixe (nouvel exemplaire → l'une des trois ou vide).
    const location = normalizeItemLocation(dto.location) ?? null;
    try {
      return await db.item.create({
        data: {
          recordId,
          barcode: dto.barcode.trim(),
          callNumber: dto.callNumber?.trim() ?? null,
          location,
          itemType: dto.itemType?.trim() ?? null,
          status: dto.status ?? undefined,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Ce code-barres est déjà utilisé.');
      }
      throw error;
    }
  }

  async updateItem(db: TenantDb, itemId: string, dto: UpdateItemDto) {
    const item = await db.item.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundException('Exemplaire introuvable.');
    // Localisation : canonique, effacement, ou valeur héritée conservée
    // (grandfather — ne casse pas un exemplaire existant non conforme).
    const location = normalizeItemLocation(dto.location, item.location);
    return db.item.update({
      where: { id: itemId },
      data: {
        barcode: dto.barcode?.trim(),
        callNumber: dto.callNumber?.trim(),
        location,
        itemType: dto.itemType?.trim(),
        status: dto.status,
      },
    });
  }

  async deleteItem(db: TenantDb, itemId: string) {
    const item = await db.item.findUnique({
      where: { id: itemId },
      include: { _count: { select: { checkouts: true } } },
    });
    if (!item) throw new NotFoundException('Exemplaire introuvable.');
    if (item._count.checkouts > 0) {
      throw new ConflictException(
        'Impossible de supprimer : des prêts sont rattachés à cet exemplaire.',
      );
    }
    await db.item.delete({ where: { id: itemId } });
    return { deleted: true };
  }

  // ───────────────────────────────────────────────────────────
  /** Voir buildRecordSearchDoc : tout indexeur doit produire un document COMPLET. */
  toSearchDoc(
    record: BiblioRecord & {
      contributors?: { name: string; role?: string; position?: number }[];
      keywords?: string[] | { keyword: { name: string } }[];
    },
  ): RecordSearchDoc {
    return buildRecordSearchDoc(record);
  }

  // ───────────────────────────────────────────────────────────
  /** Parse un fichier ISO 2709 (une ou plusieurs notices) via marcjs. */
  private parseIso2709(buffer: Buffer): Promise<MarcRecord[]> {
    return new Promise((resolve, reject) => {
      const parser = Marc.createStream('iso2709', 'parser');
      const records: MarcRecord[] = [];
      parser.on('data', (record: MarcRecord) => records.push(record));
      parser.on('end', () => resolve(records));
      parser.on('error', (error: Error) =>
        reject(new ConflictException(`Fichier MARC illisible : ${error.message}`)),
      );
      Readable.from(buffer).pipe(parser);
    });
  }

  /** L'indexation ne doit pas faire échouer l'écriture si Meilisearch est indisponible. */
  private async safeIndex(slug: string, docs: RecordSearchDoc[]): Promise<void> {
    try {
      await this.search.ensureIndex(slug);
      await this.search.indexRecords(slug, docs);
    } catch (error) {
      this.logger.warn(
        `Indexation Meilisearch échouée (${slug}) : ${(error as Error).message} — lancer /cataloging/reindex plus tard.`,
      );
    }
  }

  private async safeRemove(slug: string, id: string): Promise<void> {
    try {
      await this.search.removeRecord(slug, id);
    } catch (error) {
      this.logger.warn(
        `Suppression de l'index échouée (${slug}/${id}) : ${(error as Error).message}`,
      );
    }
  }
}

/** Noms nettoyés, lignes vides écartées ; `author` hérité converti si fourni seul. */
function normalizeContributors(
  contributors: ContributorDto[] | undefined,
  legacyAuthor: string | undefined,
): { name: string; role: string }[] {
  if (contributors !== undefined) {
    return contributors
      .map((c) => ({ name: c.name.trim(), role: c.role }))
      .filter((c) => c.name.length > 0);
  }
  const author = legacyAuthor?.trim();
  return author ? [{ name: author, role: 'AUTEUR_PRINCIPAL' }] : [];
}

/** Règle serveur (cahier §4.2) : au moins un auteur principal, nom non vide. */
function requirePrincipalAuthor(contributors: { role: string }[]): void {
  if (!contributors.some((c) => c.role === 'AUTEUR_PRINCIPAL')) {
    throw new BadRequestException('Au moins un auteur principal est requis.');
  }
}

/**
 * Types de document soumis aux règles de soutenance (travaux universitaires
 * soutenus). Doit rester aligné avec la liste front (apps/web/lib/record-types.ts).
 */
const DEFENSE_RECORD_TYPES = ['these', 'memoire', 'licence', 'master', 'these_unique'];

/**
 * Règles serveur des travaux soutenus (cahier §4.3) : université de soutenance
 * obligatoire, directeur de mémoire/thèse obligatoire (défaut retenu §8.1).
 * Sans effet sur les autres types (l'import MARC crée des « book »).
 */
function requireDefenseFields(
  recordType: string,
  defenseUniversity: string | null | undefined,
  contributors: { role: string }[],
): void {
  if (!DEFENSE_RECORD_TYPES.includes(recordType)) return;
  if (!defenseUniversity?.trim()) {
    throw new BadRequestException(
      'L’université de soutenance est requise pour une thèse ou un mémoire.',
    );
  }
  if (!contributors.some((c) => c.role === 'DIRECTEUR_MEMOIRE')) {
    throw new BadRequestException(
      'Le directeur de mémoire / de thèse est requis pour une thèse ou un mémoire.',
    );
  }
}

/** Champ texte optionnel d'un PATCH : absent = inchangé, vide = effacement. */
function emptyToNull(value: string | undefined): string | null | undefined {
  return value === undefined ? undefined : value.trim() || null;
}

const MIN_KEYWORDS = 3;

/** Normalisés comme les catégories (minuscules, espaces réduits), dédupliqués. */
function normalizeKeywords(keywords: string[] | undefined): string[] {
  return [
    ...new Set(
      (keywords ?? [])
        .map((k) => k.trim().replace(/\s+/g, ' ').toLowerCase())
        .filter((k) => k.length > 0),
    ),
  ];
}

/** Règle serveur (§4.1) — message aligné sur le cahier des charges. */
function requireMinKeywords(keywords: { length: number }): void {
  if (keywords.length < MIN_KEYWORDS) {
    throw new BadRequestException(
      `Ajoutez au moins ${MIN_KEYWORDS} mots-clés pour enregistrer.`,
    );
  }
}

/** Liaisons Prisma vers la table de mots-clés du tenant (réutilise l'existant). */
function keywordLinks(keywords: string[]) {
  return {
    create: keywords.map((name) => ({
      keyword: { connectOrCreate: { where: { name }, create: { name } } },
    })),
  };
}

/** Réponse API : `keywords` en simple tableau de chaînes (pas la table de liaison). */
function flattenKeywords<T extends { keywords?: { keyword: { name: string } }[] }>(
  record: T,
): Omit<T, 'keywords'> & { keywords: string[] } {
  return { ...record, keywords: (record.keywords ?? []).map((link) => link.keyword.name) };
}

/** Nom du premier auteur principal (dénormalisation transitoire du champ `author`). */
function principalAuthorName(contributors: { name: string; role: string }[]): string | null {
  return contributors.find((c) => c.role === 'AUTEUR_PRINCIPAL')?.name ?? null;
}
