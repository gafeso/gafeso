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
import { extractBiblio, MarcFields, MarcFormatName } from './marc-mapper';
import { ContributorDto, CreateRecordDto } from './dto/create-record.dto';
import { UpdateRecordDto } from './dto/update-record.dto';
import { CreateItemDto, UpdateItemDto } from './dto/item.dto';
import { ListRecordsDto } from './dto/list-records.dto';
import { DigitalCopyService } from './digital-copy.service';
import { normalizeItemLocation } from './item-locations';
import { foldAccents, sqlFoldExpression } from '../common/accent-folding';

/**
 * Plafond de correspondances pré-résolues par la recherche de notices.
 *
 * Large pour un fonds d'établissement (les catalogues réels se comptent en
 * dizaines de milliers), et jamais dépassé en silence : au-delà, un
 * avertissement est journalisé et l'utilisateur est invité à affiner. Même
 * raison et même ordre de grandeur que le plafond de la recherche de comptes.
 */
const RECHERCHE_PLAFOND = 5000;
import { construireOrderBy } from './tri-du-catalogue';
import {
  aplatirChampsDeProfil,
  ecrireChampsDeProfil,
  lireChampsDeProfil,
} from './champs-de-profil';
import {
  DEFAULT_RECORD_TYPE,
  DEFENSE_RECORD_TYPES,
  estUnTypeDeNotice,
} from './description-profiles';
import { profilPourTypeDeNotice } from './profil-de-notice';
import { foldCategoryName, normalizeCategoryName } from '../categories/category-name';
import { AuthorsService } from '../authors/authors.service';
import { MarcExportRecord } from './marc-export';
import { porteDuNatif, zonesPortees } from './metadonnees-natives';

export type TenantDb = PrismaClient;

export interface ImportMarcResult {
  imported: number;
  skipped: number;
  /**
   * Sort des domaines rencontrés dans le fichier. TROIS cas distincts, jamais
   * fondus en deux : « la source n'en portait pas » et « elle en portait un
   * qu'on n'a pas reconnu » sont deux situations différentes pour la
   * bibliothécaire, et les confondre serait le même silence sous une autre
   * forme (invariant I6).
   */
  /**
   * Sort des TYPES rencontrés dans le fichier (zone locale 900$a), sur le
   * modèle exact des domaines ci-dessous — trois cas, jamais fondus en deux.
   *
   * ⚠ POURQUOI LE MÊME MODÈLE ET PAS UN AUTRE. Le vocabulaire des types est
   * désormais FERMÉ (backlog n°22), et un import est le seul chemin par lequel
   * une valeur étrangère peut se présenter. Deux issues étaient possibles :
   * refuser la notice, ou l'importer sous le type par défaut. La seconde a été
   * retenue — refuser ferait perdre une notice entière pour un champ local que
   * la plupart des catalogues étrangers ne portent même pas.
   *
   * ⚠ MAIS ELLE N'EST ACCEPTABLE QU'À UNE CONDITION : que le repli se DISE.
   * Un type remplacé en silence, c'est une thèse importée en `ouvrage`, donc
   * un profil bibliographique, donc une absence d'ETD-MS que personne ne
   * cherchera. La valeur d'origine reste dans `marcData` (I3), et elle est
   * NOMMÉE ici avec son nombre d'occurrences.
   */
  types: {
    /** Notices dont la source ne portait aucun type (pas de 900$a). */
    sansValeur: number;
    /** Notices dont le type était du vocabulaire et a été repris. */
    reconnus: number;
    /** Notices importées sous le type par défaut faute de reconnaître le leur. */
    inconnus: number;
    /** Les valeurs non reconnues, du plus fréquent au moins fréquent. */
    valeursInconnues: { valeur: string; occurrences: number }[];
  };
  categories: {
    /** Notices dont la source ne portait aucun domaine (pas de 900$b). */
    sansValeur: number;
    /** Notices dont le domaine a été reconnu et repris. */
    reconnues: number;
    /**
     * Notices dont le domaine n'a pas été reconnu : la notice est importée, sa
     * catégorie reste VIDE, et la valeur d'origine reste dans les métadonnées
     * natives (`marcData`, zone 900$b) — rien n'est perdu (invariant I3).
     */
    inconnues: number;
    /**
     * Les valeurs non reconnues avec leur nombre d'occurrences, du plus
     * fréquent au moins fréquent. C'est la liste sur laquelle la
     * bibliothécaire décide : créer le domaine, ou rattacher à un existant.
     * On ne crée RIEN à sa place — importer le 900$b d'un catalogue étranger
     * remplirait son vocabulaire sans qu'elle l'ait voulu.
     */
    valeursInconnues: { valeur: string; occurrences: number }[];
  };
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
    // ⚠ P3-3 : les trois champs de profil sont LUS dans `profileData`. La
    // sortie MARC, elle, ne change pas d'un octet — 210$a, 328$c et 328$e
    // portent les mêmes valeurs (empreinte figée par
    // champs-de-profil-caracterisation.spec.ts).
    profileData: unknown;
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
      ...lireChampsDeProfil(r.profileData),
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
    const recordType = dto.recordType?.trim() || DEFAULT_RECORD_TYPE;
    requireDefenseFields(recordType, dto.defenseUniversity, contributors);
    const keywords = normalizeKeywords(dto.keywords);
    requireMinKeywords(keywords);
    const category = await this.resolveCategory(db, dto.category);
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
        // ⚠ COEXISTENCE P3-3, TEMPS 1 : les champs de profil sont écrits aux
        // DEUX endroits. Les colonnes partiront au temps 2 ; jusque-là, elles
        // sont ce qui permet de rattraper un consommateur manqué. Écrire le
        // JSON seul rendrait le temps 1 irréversible, ce qui lui retirerait sa
        // raison d'être.
        publicationCity: dto.publicationCity?.trim() || null,
        defenseUniversity: dto.defenseUniversity?.trim() || null,
        defensePlace: dto.defensePlace?.trim() || null,
        profileData: ecrireChampsDeProfil({
          publicationCity: dto.publicationCity?.trim() || null,
          defenseUniversity: dto.defenseUniversity?.trim() || null,
          defensePlace: dto.defensePlace?.trim() || null,
        }),
        summary: dto.summary?.trim() || null,
        category,
        // ⚠ L'EMBARGO SE POSE ICI, ET IL FALLAIT QU'IL SE POSE QUELQUE PART.
        // La colonne, la décision d'accès, le contrat public et quatorze tests
        // existaient depuis le matin — et aucune route ne l'écrivait. Une
        // thèse sous confidentialité ne pouvait pas être déclarée telle.
        embargoUntil: dto.embargoUntil ? new Date(dto.embargoUntil) : null,
        recordType,
        // P3-2 : le profil est DÉDUIT du type, jamais saisi. Une seule source,
        // donc aucune dérive possible entre les deux.
        profile: profilPourTypeDeNotice(recordType),
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
    return aplatirNotice(record);
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
    // MarcFormatName et non l'enum MarcFormat : on n'importe que du MARC.
    // `GAFESO` (notice Gafeso native, docs/architecture-notice.md) est une
    // valeur du format NATIF d'une notice, jamais un format d'import.
    format: MarcFormatName,
    defaultCategory?: string,
  ): Promise<ImportMarcResult> {
    const parsed = await this.parseIso2709(buffer);

    let imported = 0;
    let skipped = 0;
    const docs: RecordSearchDoc[] = [];
    // Référentiel de l'école, chargé UNE fois : l'import peut porter des
    // dizaines de milliers de notices.
    const connues = new Map(
      (await db.category.findMany()).map((c) => [foldCategoryName(c.name), c.name]),
    );
    const parDefaut = defaultCategory ? normalizeCategoryName(defaultCategory) : null;
    let sansValeur = 0;
    let reconnues = 0;
    const inconnues = new Map<string, number>();
    let typesSansValeur = 0;
    let typesReconnus = 0;
    const typesInconnus = new Map<string, number>();

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

      // ⚠ LE TYPE : trois issues, comptées séparément, et la valeur d'origine
      // n'est jamais perdue — elle reste dans `marcData` (I3). Un repli
      // silencieux ferait d'une thèse un ouvrage, donc une notice absente
      // d'ETD-MS que personne n'irait chercher.
      const typeBrut = extracted.recordType?.trim() ?? '';
      let typeDeLaNotice: string = DEFAULT_RECORD_TYPE;
      if (!typeBrut) {
        typesSansValeur++;
      } else if (estUnTypeDeNotice(typeBrut)) {
        typeDeLaNotice = typeBrut;
        typesReconnus++;
      } else {
        typesInconnus.set(typeBrut, (typesInconnus.get(typeBrut) ?? 0) + 1);
      }

      // Trois issues distinctes, comptées séparément (voir ImportMarcResult).
      const brute = extracted.category ?? parDefaut;
      let categorieDeLaNotice: string | null = null;
      if (!brute || !normalizeCategoryName(brute)) {
        sansValeur++;
      } else {
        const normalisee = normalizeCategoryName(brute);
        const connue = connues.get(foldCategoryName(normalisee));
        if (connue) {
          categorieDeLaNotice = connue;
          reconnues++;
        } else {
          inconnues.set(normalisee, (inconnues.get(normalisee) ?? 0) + 1);
        }
      }
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
          profileData: ecrireChampsDeProfil({
            publicationCity: extracted.publicationCity,
            defenseUniversity: extracted.defenseUniversity,
            defensePlace: extracted.defensePlace,
          }),
          // Domaine : celui de la notice si présent (zone locale 900$b), sinon
          // celui choisi à l'import. Voir `classerCategorie` : une valeur non
          // reconnue laisse le domaine VIDE — la notice est importée quand
          // même, et la valeur d'origine reste dans `marcData` (I3).
          category: categorieDeLaNotice,
          recordType: typeDeLaNotice,
          profile: profilPourTypeDeNotice(typeDeLaNotice),
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
    const parFrequence = (m: Map<string, number>) =>
      [...m.entries()]
        .map(([valeur, occurrences]) => ({ valeur, occurrences }))
        .sort((a, b) => b.occurrences - a.occurrences || a.valeur.localeCompare(b.valeur));
    const valeursInconnues = parFrequence(inconnues);
    const nbInconnues = valeursInconnues.reduce((n, v) => n + v.occurrences, 0);
    const typesValeursInconnues = parFrequence(typesInconnus);
    const nbTypesInconnus = typesValeursInconnues.reduce((n, v) => n + v.occurrences, 0);

    this.logger.log(
      `Import MARC (${slug}) : ${imported} notices, ${skipped} ignorées ; ` +
        `domaines — ${reconnues} reconnus, ${nbInconnues} non reconnus ` +
        `(${valeursInconnues.length} valeur(s) distincte(s)), ${sansValeur} absents ; ` +
        `types — ${typesReconnus} reconnus, ${nbTypesInconnus} repliés sur ` +
        `« ${DEFAULT_RECORD_TYPE} » (${typesValeursInconnues.length} valeur(s) ` +
        `distincte(s)), ${typesSansValeur} absents.`,
    );
    return {
      imported,
      skipped,
      types: {
        sansValeur: typesSansValeur,
        reconnus: typesReconnus,
        inconnus: nbTypesInconnus,
        valeursInconnues: typesValeursInconnues,
      },
      categories: { sansValeur, reconnues, inconnues: nbInconnues, valeursInconnues },
    };
  }

  async listRecords(db: TenantDb, query: ListRecordsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    // ⚠ LE MÊME `where` SERT AU COMPTAGE ET À LA PAGE. Le construire une seule
    // fois n'est pas une élégance : deux `where` divergents donnent un `total`
    // qui ne correspond pas aux lignes rendues — le front affiche alors un
    // nombre de pages qu'il ne peut pas atteindre, sans qu'aucune erreur ne
    // soit levée.
    const where: Prisma.BiblioRecordWhereInput = {};
    if (query.category) where.category = normalizeCategoryName(query.category);

    const recherche = query.q?.trim();
    if (recherche) {
      // Recherche d'IDENTIFICATION, côté base : le bibliothécaire cherche une
      // notice qu'il sait exister. La recherche de DÉCOUVERTE reste à l'OPAC,
      // sur Meilisearch. `summary` est délibérément hors périmètre : il fait du
      // bruit sur une liste d'administration, et c'est la colonne la plus chère.
      //
      // ⚠ INSENSIBLE AUX ACCENTS DEPUIS LE 11 SEPTEMBRE 2026, et c'était une
      // vraie panne : `contains` + `mode: 'insensitive'` repose sur `ILIKE`,
      // qui franchit la casse mais PAS les diacritiques. Mesuré sur le fonds —
      // « région » rendait 42 notices, « region » en rendait ZÉRO, et 268 des
      // 352 titres portent un accent. Un bibliothécaire qui tape sans accent ne
      // trouvait rien, et rien ne lui disait pourquoi.
      //
      // ⚠ MÊME MÉCANIQUE QUE LA RECHERCHE DE COMPTES (accounts.service) : le
      // SQL brut pré-résout les IDENTIFIANTS, puis Prisma filtre dessus — la
      // pagination, le comptage et le filtre par catégorie restent inchangés.
      // `translate()` plutôt que l'extension `unaccent` : c'est du SQL
      // standard, disponible partout, sans étape de déploiement — décision
      // déjà prise et documentée dans `common/accent-folding.ts`.
      //
      // ⚠ `biblio_records` n'est PAS qualifié par un schéma : le client tenant
      // porte `?schema=tenant_<slug>`, donc son `search_path` vise déjà la
      // bonne école, et le SQL brut emprunte la même connexion. Un test le
      // vérifie : s'il cessait d'être vrai, la requête taperait dans `public`.
      const haystack = sqlFoldExpression(
        `coalesce("title",'') || ' ' || coalesce("title_complement",'') || ' ' || ` +
          `coalesce("author",'') || ' ' || coalesce("isbn",'') || ' ' || ` +
          `coalesce("publisher",'')`,
      );
      const lignes = await db.$queryRawUnsafe<{ id: string }[]>(
        `SELECT "id" FROM "biblio_records" WHERE ${haystack} LIKE $1 ` +
          `LIMIT ${RECHERCHE_PLAFOND + 1}`,
        `%${foldAccents(recherche)}%`,
      );
      if (lignes.length > RECHERCHE_PLAFOND) {
        // Jamais de troncature silencieuse : on le dit, plutôt que de laisser
        // croire que le fonds ne contient que ces notices-là.
        this.logger.warn(
          `Recherche de notices « ${recherche} » : plus de ${RECHERCHE_PLAFOND} ` +
            `correspondances, résultats tronqués — affinez le terme.`,
        );
      }
      where.id = { in: lignes.slice(0, RECHERCHE_PLAFOND).map((l) => l.id) };
    }

    const [total, records] = await Promise.all([
      db.biblioRecord.count({ where }),
      db.biblioRecord.findMany({
        where,
        include: {
          _count: { select: { items: true } },
          // Auteurs affichés dans le tableau du catalogue admin, ordonnés.
          contributors: { orderBy: { position: 'asc' } },
        },
        // Le tri ET son départage viennent du même endroit : voir
        // `tri-du-catalogue.ts`, qui porte aussi la raison pour laquelle le tri
        // alphabétique n'est pas exposé.
        orderBy: construireOrderBy(query.sort, query.order),
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
      // Même raison qu'`aplatirNotice` : la liste renvoie la ligne entière, et
      // `profile_data` s'y serait invité.
      records: records.map((r) => aplatirChampsDeProfil(r)),
    };
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
    return aplatirNotice(record);
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

    // ⚠ INVARIANT I3 — RIEN N'ÉCRASE LA DESCRIPTION D'ORIGINE.
    //
    // `marcData` prenait la valeur reçue sans condition : un appelant qui
    // l'envoyait remplaçait l'original. Sur une école dont le catalogue a été
    // repris par import, cet original est le SEUL exemplaire de la description
    // native — le perdre est irréversible et silencieux.
    //
    // On ne se fie pas à une mesure faite ailleurs (sur dev, les 352 notices
    // sont vides) : on COMPTE À L'EXÉCUTION, sur la notice qu'on touche. Et on
    // compte sur la ligne DÉJÀ LUE juste au-dessus — un garde qui coûte une
    // requête de plus est un garde qu'on finit par déplacer.
    if (dto.marcData !== undefined && porteDuNatif(existing.marcData)) {
      throw new ConflictException(
        `Cette notice conserve sa description d'origine (${zonesPortees(existing.marcData)} ` +
          `zones, format ${existing.marcFormat}) : elle ne peut pas être écrasée. ` +
          `C'est le seul exemplaire de la description reçue à l'import (invariant I3).`,
      );
    }

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

    // ⚠ LE JSON PORTE L'ÉTAT FINAL, PAS LE DELTA. Un PATCH est partiel : un
    // champ absent doit rester, un champ vide doit s'effacer. `profile_data`
    // étant réécrit en entier à chaque modification, il doit être recomposé
    // depuis l'état existant — sinon modifier le seul titre effacerait les
    // trois champs de profil, en silence, et la colonne resterait juste (donc
    // le désaccord ne se verrait qu'au temps 2, une fois la colonne partie).
    const profilFinal = {
      publicationCity:
        dto.publicationCity === undefined
          ? existing.publicationCity
          : dto.publicationCity.trim() || null,
      defenseUniversity:
        dto.defenseUniversity === undefined
          ? existing.defenseUniversity
          : dto.defenseUniversity.trim() || null,
      defensePlace:
        dto.defensePlace === undefined
          ? existing.defensePlace
          : dto.defensePlace.trim() || null,
    };

    const record = await db.biblioRecord.update({
      where: { id },
      data: {
        title: dto.title?.trim(),
        // ⚠ TROIS ÉTATS, ET `undefined` N'EST PAS `null`. Champ absent : on ne
        // touche à rien. `null` : on LÈVE l'embargo — geste légitime, le jury
        // peut libérer une thèse avant la date prévue. Une date : on la pose.
        // Les fondre ferait d'un PATCH partiel une levée d'embargo silencieuse.
        embargoUntil:
          dto.embargoUntil === undefined
            ? undefined
            : dto.embargoUntil === null
              ? null
              : new Date(dto.embargoUntil),
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
        // Coexistence : le JSON est réécrit en entier, depuis l'état final.
        profileData: ecrireChampsDeProfil(profilFinal),
        summary: emptyToNull(dto.summary),
        category: dto.category === undefined ? undefined : await this.resolveCategory(db, dto.category),
        recordType: dto.recordType?.trim(),
        // ⚠ `undefined` quand le type n'est pas fourni : Prisma laisse alors la
        // colonne intacte. Le profil ne se recalcule QUE si le type change —
        // sinon une modification de titre réécrirait le profil, et écraserait
        // en silence le reclassement d'une notice ancienne.
        profile: dto.recordType?.trim()
          ? profilPourTypeDeNotice(dto.recordType.trim())
          : undefined,
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
    return aplatirNotice(record);
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

  /**
   * SANTÉ DE L'INDEX — l'écart entre ce que la base contient et ce que l'index
   * porte. Backlog n°19.
   *
   * ## Pourquoi cette route existe
   *
   * Depuis le lot du plafond Meilisearch, `/opac/constellation` tire son TOTAL
   * de la base et sa RÉPARTITION de l'index. Les deux s'accordent quand
   * l'index est à jour ; ils divergent quand il a dérivé — réindexation
   * échouée, notice supprimée sans désindexation.
   *
   * C'est un PROGRÈS par rapport à avant, où les deux venaient de l'index et
   * étaient donc faux ensemble, donc cohérents, donc indétectables. Mais un
   * écart que personne ne voit ne sert à rien : d'où cette route.
   *
   * ## Réservée au professionnel, jamais au public (décision du 12 septembre)
   *
   * Un lecteur ne peut RIEN faire d'une dérive d'index ; un bibliothécaire, si
   * — il relance la réindexation. Un avertissement qu'on ne peut pas suivre
   * d'un geste n'est pas une information, c'est une inquiétude. La route est
   * donc derrière `catalogue.gerer`, comme la réindexation qu'elle recommande.
   *
   * ## Les trois états, et le troisième est le piège
   *
   * `aligne` · `derive` · `indisponible`.
   *
   * ⚠ `indisponible` NE DOIT JAMAIS S'ÉCRIRE COMME UNE DÉRIVE. Si le moteur ne
   * répond pas, `dansIndex` vaut `null` et non zéro : « 0 document indexé sur
   * 8 000 » se lirait comme la pire dérive possible et enverrait quelqu'un
   * lancer une réindexation complète — une opération coûteuse sur un gros
   * catalogue — pour réparer un problème qui n'existe pas. C'est la « non-
   * réponse qui INVITE À AGIR » de CLAUDE.md, et le geste qu'elle provoque est
   * une écriture.
   *
   * ⚠ Et une dérive EST une anomalie, pas un état que quelqu'un a pu vouloir :
   * l'avertissement est donc légitime ici, contrairement à l'écart de noms d'un
   * adhérent que la bibliothécaire a corrigé exprès. C'est la troisième
   * question de CLAUDE.md — « quelqu'un a-t-il pu le vouloir ? » — et la
   * réponse est non.
   */
  async indexSante(db: TenantDb, slug: string) {
    const [enBase, comptage] = await Promise.all([
      db.biblioRecord.count(),
      this.search.countDocuments(slug),
    ]);

    if (comptage.etat === 'indisponible') {
      return {
        etat: 'indisponible' as const,
        enBase,
        // ⚠ `null`, jamais 0. Voir l'en-tête : zéro inviterait à réindexer.
        dansIndex: null,
        ecart: null,
      };
    }

    const dansIndex = comptage.documents;
    const ecart = enBase - dansIndex;
    return {
      etat: ecart === 0 ? ('aligne' as const) : ('derive' as const),
      enBase,
      dansIndex,
      // Signé, et le signe se lit : positif = des notices manquent à l'index
      // (invisibles à la recherche) ; négatif = l'index porte des documents que
      // la base n'a plus (des résultats qui mènent à une notice supprimée).
      ecart,
    };
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
  /**
   * Normalise un domaine SAISI et vérifie qu'il existe dans le référentiel de
   * l'école. Une chaîne vide efface le domaine.
   *
   * `biblio_records.category` est comparée par CHAÎNE au nom de la ligne
   * `categories` (pas de clé étrangère — choix assumé, voir `schema.prisma`).
   * Rien ne garantissait cette égalité à l'écriture : une valeur sans ligne
   * correspondante devenait un domaine fantôme — visible dans la constellation
   * (facette alimentée par la notice), absent de l'écran de gestion, et hors
   * d'atteinte du renommage comme de la suppression, qui cherchent tous deux
   * le nom exact d'une catégorie existante. Mesuré sur le jeu de démonstration
   * avant correction : 8 notices sur 12.
   *
   * On REFUSE en nommant la valeur plutôt que de créer le domaine à la volée :
   * le vocabulaire des domaines appartient à la bibliothécaire.
   */
  private async resolveCategory(
    db: TenantDb,
    saisie: string | null | undefined,
  ): Promise<string | null> {
    if (saisie === undefined || saisie === null) return null;
    const name = normalizeCategoryName(saisie);
    if (!name) return null;

    const existante = await db.category.findUnique({ where: { name } });
    if (existante) return existante.name;

    // Rapprochement sans accents : « Économie » saisi, « economie » en base.
    const cle = foldCategoryName(name);
    const toutes = await db.category.findMany();
    const proche = toutes.find((c) => foldCategoryName(c.name) === cle);
    if (proche) return proche.name;

    throw new BadRequestException(
      `Domaine inconnu : « ${name} ». Créez-le dans les catégories, ou ` +
        `choisissez-en un existant.`,
    );
  }

  /** Voir buildRecordSearchDoc : tout indexeur doit produire un document COMPLET. */
  toSearchDoc(
    record: BiblioRecord & {
      contributors?: { name: string; role?: string; position?: number }[];
      keywords?: string[] | { keyword: { name: string } }[];
    },
  ): RecordSearchDoc {
    // ⚠ APLATI AVANT D'INDEXER. `buildRecordSearchDoc` lit `defenseUniversity`
    // au premier niveau, et son contrat ne change PAS : c'est la SOURCE de la
    // valeur qui change (le JSON au lieu de la colonne). C'est ce qui garde
    // `defenseUniversity` cherchable — l'index reçoit le même document, donc
    // aucune réindexation n'est due.
    return buildRecordSearchDoc(aplatirChampsDeProfil(record));
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
  if (!(DEFENSE_RECORD_TYPES as readonly string[]).includes(recordType)) return;
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

/**
 * Mise en forme d'une notice pour l'administration : mots-clés aplatis, ET
 * champs de profil sortis de `profileData`.
 *
 * ⚠ POURQUOI LES DEUX AU MÊME ENDROIT. Ces routes renvoient la LIGNE ENTIÈRE
 * (`include`) : la colonne `profile_data` s'est donc invitée dans leur réponse
 * au moment du `db push`, sans que personne l'ait décidé — le défaut que P3-4 a
 * corrigé sur la route publique, rejoué ici. Composer la mise en forme en un
 * seul point fait que les trois routes qui l'appellent sont traitées ensemble,
 * plutôt que deux sur trois.
 */
function aplatirNotice<
  T extends { keywords?: { keyword: { name: string } }[]; profileData?: unknown },
>(record: T) {
  return aplatirChampsDeProfil(flattenKeywords(record));
}

/** Nom du premier auteur principal (dénormalisation transitoire du champ `author`). */
function principalAuthorName(contributors: { name: string; role: string }[]): string | null {
  return contributors.find((c) => c.role === 'AUTEUR_PRINCIPAL')?.name ?? null;
}
