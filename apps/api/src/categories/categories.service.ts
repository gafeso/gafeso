import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Category, PrismaClient } from '@prisma/client';
import { CatalogingService } from '../cataloging/cataloging.service';
import { SearchService } from '../search/search.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { DEFAULT_CATEGORIES } from './default-categories';
import { foldCategoryName, normalizeCategoryName } from './category-name';

/** Client Prisma lié au schéma d'un tenant (obtenu via PrismaService.forTenant). */
export type TenantDb = PrismaClient;

@Injectable()
export class CategoriesService {
  private readonly logger = new Logger(CategoriesService.name);

  constructor(
    private readonly cataloging: CatalogingService,
    private readonly search: SearchService,
  ) {}

  /**
   * Seed idempotent des catégories standard (les 28 issues d’un fonds universitaire réel —
   * voir default-categories.ts). N'AJOUTE que les manquantes : la comparaison
   * avec l'existant ignore la casse ET les accents (« Économie » n'est pas
   * recréée si « economie » existe), on ne supprime ni ne renomme jamais rien.
   * Rejouable sans effet de bord : une relance sur un tenant complet crée 0
   * catégorie.
   */
  async seedDefaults(db: TenantDb) {
    const existing = await db.category.findMany();
    const existingFolded = new Set(existing.map((c) => foldCategoryName(c.name)));

    let created = 0;
    for (const label of DEFAULT_CATEGORIES) {
      if (existingFolded.has(foldCategoryName(label))) continue;
      await db.category.create({ data: { name: normalizeCategoryName(label) } });
      existingFolded.add(foldCategoryName(label)); // protège aussi des doublons internes à la liste
      created++;
    }

    const skipped = DEFAULT_CATEGORIES.length - created;
    this.logger.log(`Seed catégories : ${created} créées, ${skipped} déjà présentes.`);
    return { created, skipped, total: DEFAULT_CATEGORIES.length };
  }

  async list(db: TenantDb) {
    return db.category.findMany({ orderBy: { name: 'asc' } });
  }

  async create(db: TenantDb, dto: CreateCategoryDto) {
    const name = normalizeCategoryName(dto.name);
    const existing = await db.category.findUnique({ where: { name } });
    if (existing) {
      throw new ConflictException('Cette catégorie existe déjà.');
    }
    return db.category.create({ data: { name } });
  }

  /**
   * Renomme une catégorie. Le renommage est répercuté sur les notices qui la
   * portent déjà (comme pour un renommage de classe — voir
   * EnrollmentService.updateClass) et réindexé dans Meilisearch, pour que la
   * constellation reste cohérente avec la liste des catégories.
   */
  async update(db: TenantDb, slug: string, id: string, dto: UpdateCategoryDto) {
    const category = await this.require(db, id);
    if (!dto.name) return category;

    const name = normalizeCategoryName(dto.name);
    if (name === category.name) return category;

    const clash = await db.category.findUnique({ where: { name } });
    if (clash) {
      throw new ConflictException('Cette catégorie existe déjà.');
    }

    const [updated] = await db.$transaction([
      db.category.update({ where: { id }, data: { name } }),
      db.biblioRecord.updateMany({
        where: { category: category.name },
        data: { category: name },
      }),
    ]);

    // Include complet : Meilisearch remplace les documents en entier — un
    // document partiel effacerait contributeurs/mots-clés de l'index.
    const affected = await db.biblioRecord.findMany({
      where: { category: name },
      include: {
        contributors: { orderBy: { position: 'asc' } },
        keywords: { include: { keyword: true } },
      },
    });
    if (affected.length > 0) {
      await this.search.indexRecords(
        slug,
        affected.map((r) => this.cataloging.toSearchDoc(r)),
      );
    }

    return updated;
  }

  /** Refusé si des notices portent encore cette catégorie (réassignez-les d'abord). */
  async remove(db: TenantDb, id: string) {
    const category = await this.require(db, id);
    const used = await db.biblioRecord.count({ where: { category: category.name } });
    if (used > 0) {
      throw new ConflictException(
        `Cette catégorie est utilisée par ${used} notice(s) : réassignez-les d’abord.`,
      );
    }
    await db.category.delete({ where: { id } });
    return { removed: true };
  }

  /**
   * Domaines ORPHELINS : valeurs portées par des notices sans ligne
   * `categories` correspondante.
   *
   * `biblio_records.category` est comparée par chaîne au nom de la catégorie
   * (choix assumé, voir `schema.prisma`). Une valeur sans ligne correspondante
   * est un domaine fantôme : visible dans la constellation (facette alimentée
   * par la notice), absent de l'écran de gestion, et hors d'atteinte du
   * renommage comme de la suppression — les deux cherchent le nom exact d'une
   * catégorie existante. Depuis `CatalogingService.resolveCategory`, plus
   * aucune écriture n'en produit ; cette commande traite l'existant.
   *
   * ⚠ Par défaut elle LISTE et ne crée rien. Une commande de réparation qui
   * déciderait à la place de la bibliothécaire reproduirait la faute qu'elle
   * corrige : le vocabulaire des domaines lui appartient. La création se
   * demande explicitement (`creer: true`), et rattacher à un domaine existant
   * reste un renommage de notices qu'elle pilote.
   */
  async orphanCategories(db: TenantDb, slug: string, creer = false) {
    const [categories, groupes] = await Promise.all([
      db.category.findMany(),
      db.biblioRecord.groupBy({
        by: ['category'],
        where: { category: { not: null } },
        _count: { _all: true },
      }),
    ]);
    const connues = new Set(categories.map((c) => foldCategoryName(c.name)));

    const orphelines = groupes
      .filter((g) => g.category && !connues.has(foldCategoryName(g.category)))
      .map((g) => ({ valeur: g.category as string, occurrences: g._count._all }))
      .sort((a, b) => b.occurrences - a.occurrences || a.valeur.localeCompare(b.valeur));

    if (!creer) {
      this.logger.log(
        `Domaines orphelins (${slug}) : ${orphelines.length} valeur(s) — rien créé (lecture seule).`,
      );
      return { slug, orphelines, creees: 0, lectureSeule: true };
    }

    // Création DEMANDÉE explicitement. Idempotente : une valeur déjà devenue
    // connue entre-temps n'est pas recréée.
    let creees = 0;
    for (const { valeur } of orphelines) {
      const name = normalizeCategoryName(valeur);
      if (connues.has(foldCategoryName(name))) continue;
      await db.category.create({ data: { name } });
      connues.add(foldCategoryName(name));
      creees++;
    }
    this.logger.log(`Domaines orphelins (${slug}) : ${creees} catégorie(s) créée(s) sur demande.`);
    return { slug, orphelines, creees, lectureSeule: false };
  }

  private async require(db: TenantDb, id: string): Promise<Category> {
    const category = await db.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Catégorie introuvable.');
    return category;
  }
}
