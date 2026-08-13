import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Category, PrismaClient } from '@prisma/client';
import { CatalogingService } from '../cataloging/cataloging.service';
import { SearchService } from '../search/search.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { DEFAULT_CATEGORIES } from './default-categories';

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
    const existingFolded = new Set(existing.map((c) => fold(c.name)));

    let created = 0;
    for (const label of DEFAULT_CATEGORIES) {
      if (existingFolded.has(fold(label))) continue;
      await db.category.create({ data: { name: normalize(label) } });
      existingFolded.add(fold(label)); // protège aussi des doublons internes à la liste
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
    const name = normalize(dto.name);
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

    const name = normalize(dto.name);
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

  private async require(db: TenantDb, id: string): Promise<Category> {
    const category = await db.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Catégorie introuvable.');
    return category;
  }
}

/** Espaces superflus réduits, casse ignorée — la même valeur, peu importe qui la saisit. */
function normalize(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Clé de comparaison du seed : normalisée PUIS débarrassée des accents. */
function fold(name: string): string {
  return normalize(name)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}
