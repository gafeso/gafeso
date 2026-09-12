import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { normalizeAuthorName } from './author-name';

export type TenantDb = PrismaClient;

// Ordre d'affichage des rôles sur la fiche auteur (principal, secondaire, dir.).
const ROLE_ORDER = ['AUTEUR_PRINCIPAL', 'AUTEUR_SECONDAIRE', 'DIRECTEUR_MEMOIRE'];

@Injectable()
export class AuthorsService {
  private readonly logger = new Logger(AuthorsService.name);

  /**
   * Index alphabétique des auteurs du tenant, avec le nombre d'œuvres (comme
   * l'index Autorités de PMB). Filtre `q` sur le nom (insensible casse/accents).
   */
  async listAuthors(db: TenantDb, opts: { q?: string; page?: number; limit?: number } = {}) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
    const where =
      opts.q && opts.q.trim()
        ? { normalizedName: { contains: normalizeAuthorName(opts.q) } }
        : {};

    const [total, rows] = await Promise.all([
      db.author.count({ where }),
      db.author.findMany({
        where,
        orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          displayName: true,
          birthYear: true,
          deathYear: true,
          _count: { select: { contributions: true } },
        },
      }),
    ]);

    return {
      authors: rows.map((a) => ({
        id: a.id,
        displayName: a.displayName,
        birthYear: a.birthYear,
        deathYear: a.deathYear,
        workCount: a._count.contributions,
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * Fiche auteur : infos + œuvres GROUPÉES PAR RÔLE avec compteurs (« Auteur
   * de », « Directeur de mémoire de »… — précieux pour les enseignants).
   */
  async getAuthor(db: TenantDb, id: string) {
    const author = await db.author.findUnique({
      where: { id },
      select: { id: true, displayName: true, bio: true, birthYear: true, deathYear: true },
    });
    if (!author) throw new NotFoundException('Auteur introuvable.');

    const contributions = await db.recordContributor.findMany({
      where: { authorId: id },
      select: {
        role: true,
        record: { select: { id: true, title: true, publishYear: true, recordType: true } },
      },
      orderBy: [{ record: { title: 'asc' } }],
    });

    const byRole = new Map<string, { recordId: string; title: string; year: number | null; recordType: string }[]>();
    for (const c of contributions) {
      const list = byRole.get(c.role) ?? [];
      list.push({
        recordId: c.record.id,
        title: c.record.title,
        year: c.record.publishYear,
        recordType: c.record.recordType,
      });
      byRole.set(c.role, list);
    }
    const worksByRole = [...byRole.entries()]
      .sort((a, b) => {
        const ia = ROLE_ORDER.indexOf(a[0]);
        const ib = ROLE_ORDER.indexOf(b[0]);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      })
      .map(([role, works]) => ({ role, count: works.length, works }));

    return { ...author, worksByRole, totalWorks: contributions.length };
  }

  /**
   * Fiche d'autorité correspondant à un nom, créée si absente (dédup par nom
   * normalisé). Utilisée par l'autocomplétion et la saisie (« créer-si-absent »).
   */
  async findOrCreateByName(db: TenantDb, name: string) {
    const displayName = name.trim();
    const normalizedName = normalizeAuthorName(displayName);
    const existing = await db.author.findFirst({ where: { normalizedName } });
    if (existing) return existing;
    return db.author.create({ data: { displayName, normalizedName } });
  }

  /** Suggestions d'auteurs pour l'autocomplétion de saisie (par nom normalisé). */
  async suggest(db: TenantDb, q: string, limit = 8) {
    const normalizedName = normalizeAuthorName(q ?? '');
    if (!normalizedName) return [];
    return db.author.findMany({
      where: { normalizedName: { contains: normalizedName } },
      orderBy: { displayName: 'asc' },
      take: Math.min(20, Math.max(1, limit)),
      select: { id: true, displayName: true },
    });
  }

  /** Remet le champ dénormalisé `biblio_records.author` = nom de l'auteur principal. */
  private async refreshDenormalizedAuthor(db: TenantDb, recordId: string) {
    const principal = await db.recordContributor.findFirst({
      where: { recordId, role: 'AUTEUR_PRINCIPAL' },
      orderBy: { position: 'asc' },
      select: { name: true },
    });
    await db.biblioRecord.update({
      where: { id: recordId },
      data: { author: principal?.name ?? null },
    });
  }

  /**
   * Renomme une fiche d'autorité : PROPAGE partout (nom dénormalisé des
   * contributions + champ auteur des notices). Renvoie les notices à réindexer.
   */
  async rename(
    db: TenantDb,
    id: string,
    displayNameRaw: string,
    fiche: {
      bio?: string | null;
      birthYear?: number | null;
      deathYear?: number | null;
    } = {},
  ) {
    const displayName = displayNameRaw.trim();
    if (!displayName) throw new BadRequestException('Le nom ne peut pas être vide.');
    const author = await db.author.findUnique({ where: { id } });
    if (!author) throw new NotFoundException('Fiche auteur introuvable.');

    // ⚠ LES DATES SE VÉRIFIENT L'UNE PAR L'AUTRE, SUR L'ÉTAT FINAL — pas sur le
    // corps de la requête. Un PATCH qui ne pose que l'année de décès doit être
    // confronté à la naissance DÉJÀ en base, sinon la règle ne s'applique qu'aux
    // fiches saisies d'un coup, et une fiche « morte avant d'être née » entre
    // par le chemin partiel. Un catalogue garde ses fiches des décennies.
    const naissance = fiche.birthYear === undefined ? author.birthYear : fiche.birthYear;
    const deces = fiche.deathYear === undefined ? author.deathYear : fiche.deathYear;
    if (naissance != null && deces != null && deces < naissance) {
      throw new BadRequestException(
        `L’année de décès (${deces}) précède l’année de naissance (${naissance}).`,
      );
    }

    await db.author.update({
      where: { id },
      data: {
        displayName,
        normalizedName: normalizeAuthorName(displayName),
        // ⚠ `undefined` = inchangé, `null` = effacé. Les fondre rendrait
        // impossible la correction d'une date entrée par erreur.
        bio: fiche.bio === undefined ? undefined : fiche.bio?.trim() || null,
        birthYear: fiche.birthYear,
        deathYear: fiche.deathYear,
      },
    });
    const affected = await db.recordContributor.findMany({
      where: { authorId: id },
      select: { recordId: true },
    });
    await db.recordContributor.updateMany({ where: { authorId: id }, data: { name: displayName } });

    const affectedRecordIds = [...new Set(affected.map((a) => a.recordId))];
    for (const recordId of affectedRecordIds) await this.refreshDenormalizedAuthor(db, recordId);
    return { affectedRecordIds, displayName };
  }

  /**
   * RATTACHE une fiche d'autorité à un COMPTE — ou la détache (`userId: null`).
   *
   * ⚠ SANS CETTE ROUTE, `Author.userId` EST UNE COLONNE QUE PERSONNE NE REMPLIT.
   * Elle a été posée en P6-1 sur décision de Jean, en relation facultative, pour
   * que « Mes encadrements » (P6-3) soit calculable. Mesuré le 12 septembre 2026
   * sur les deux écoles de développement : **zéro** fiche rattachée, et aucune
   * écriture de ce champ dans tout `apps/api`. L'écran aurait donc répondu
   * « votre compte n'est relié à aucune fiche » à tout le monde, pour toujours —
   * un écran correct, complet, et incapable de rien montrer.
   *
   * C'est la famille « une méthode câblée à rien » vue le 11 septembre, prise
   * par l'autre bout : ici c'est une COLONNE sans écrivain. Un inventaire de
   * routes ne la voit pas, un inventaire de colonnes non plus — seule la
   * question « qui écrit ceci ? » la trouve.
   *
   * ⚠ C'EST UN GESTE DE BIBLIOTHÉCAIRE, pas de l'intéressé. Rattacher une fiche
   * d'autorité à un compte, c'est affirmer que cette personne est bien celle qui
   * signe ces œuvres : une décision du fichier d'autorités, au même titre qu'une
   * fusion de doublons. Laisser quelqu'un se rattacher lui-même à la fiche qu'il
   * choisit ouvrirait la porte à s'attribuer les encadrements d'un homonyme —
   * et l'écran qui en découle sert un dossier de promotion.
   *
   * ⚠ UN COMPTE, UNE FICHE. `Author.userId` est UNIQUE en base ; le refus le dit
   * en NOMMANT la fiche déjà rattachée, sinon la personne cherche une erreur de
   * saisie là où il y a un rattachement à défaire.
   */
  async rattacherAuCompte(db: TenantDb, id: string, userId: string | null) {
    const author = await db.author.findUnique({ where: { id } });
    if (!author) throw new NotFoundException('Fiche auteur introuvable.');

    if (userId === null) {
      return db.author.update({ where: { id }, data: { userId: null } });
    }

    // ⚠ LE COMPTE EST CHERCHÉ DANS LE CLIENT DE L'ÉCOLE : un identifiant venu
    // d'ailleurs ne se trouve pas, et le refus est le même que pour un
    // identifiant inventé. L'isolation ne repose donc pas sur une vérification
    // qu'on pourrait oublier, mais sur le schéma qu'on interroge.
    const compte = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!compte) {
      throw new BadRequestException('Ce compte n’existe pas dans cet établissement.');
    }

    const dejaRattachee = await db.author.findUnique({
      where: { userId },
      select: { id: true, displayName: true },
    });
    if (dejaRattachee && dejaRattachee.id !== id) {
      throw new BadRequestException(
        `Ce compte est déjà rattaché à la fiche « ${dejaRattachee.displayName} ». ` +
          'Détachez-la d’abord.',
      );
    }

    return db.author.update({ where: { id }, data: { userId } });
  }

  /**
   * Fusionne deux fiches doublons : toutes les contributions de `loserId`
   * basculent sur `winnerId` (nom unifié sur celui du gagnant), puis la fiche
   * perdante — désormais sans œuvre — est supprimée. Renvoie les notices à
   * réindexer.
   */
  async merge(db: TenantDb, loserId: string, winnerId: string) {
    if (loserId === winnerId) {
      throw new BadRequestException('Sélectionnez deux fiches différentes.');
    }
    const [loser, winner] = await Promise.all([
      db.author.findUnique({ where: { id: loserId } }),
      db.author.findUnique({ where: { id: winnerId } }),
    ]);
    if (!loser || !winner) throw new NotFoundException('Fiche auteur introuvable.');

    const affected = await db.recordContributor.findMany({
      where: { authorId: loserId },
      select: { recordId: true },
    });
    await db.recordContributor.updateMany({
      where: { authorId: loserId },
      data: { authorId: winnerId, name: winner.displayName },
    });
    await db.author.delete({ where: { id: loserId } });

    const affectedRecordIds = [...new Set(affected.map((a) => a.recordId))];
    for (const recordId of affectedRecordIds) await this.refreshDenormalizedAuthor(db, recordId);
    return { affectedRecordIds, loserName: loser.displayName, winnerName: winner.displayName };
  }

  /** Supprime une fiche d'autorité — UNIQUEMENT si elle n'a aucune œuvre. */
  async remove(db: TenantDb, id: string) {
    const author = await db.author.findUnique({ where: { id } });
    if (!author) throw new NotFoundException('Fiche auteur introuvable.');
    const works = await db.recordContributor.count({ where: { authorId: id } });
    if (works > 0) {
      throw new ConflictException(
        `Impossible de supprimer « ${author.displayName} » : ${works} œuvre(s) rattachée(s). Fusionnez d'abord.`,
      );
    }
    await db.author.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * Déduplication idempotente : regroupe les contributions existantes par nom
   * normalisé, crée une fiche d'autorité par groupe (si absente) et relie chaque
   * contribution. Une contribution DÉJÀ reliée est ignorée → relance = 0 création,
   * 0 liaison. Renvoie les compteurs.
   */
  async dedupeContributors(db: TenantDb) {
    const [contributions, authors] = await Promise.all([
      db.recordContributor.findMany({ select: { id: true, name: true, authorId: true } }),
      db.author.findMany({ select: { id: true, normalizedName: true } }),
    ]);

    // Index en mémoire des fiches par nom normalisé (mis à jour au fil des créations).
    const byNorm = new Map<string, string>();
    for (const a of authors) byNorm.set(a.normalizedName, a.id);

    let authorsCreated = 0;
    let contributionsLinked = 0;
    for (const c of contributions) {
      if (c.authorId) continue; // déjà reliée : idempotence
      const normalizedName = normalizeAuthorName(c.name);
      if (!normalizedName) continue; // nom vide : rien à relier
      let authorId = byNorm.get(normalizedName);
      if (!authorId) {
        const created = await db.author.create({
          data: { displayName: c.name.trim(), normalizedName },
        });
        authorId = created.id;
        byNorm.set(normalizedName, authorId);
        authorsCreated += 1;
      }
      await db.recordContributor.update({ where: { id: c.id }, data: { authorId } });
      contributionsLinked += 1;
    }

    this.logger.log(
      `Dédup auteurs : ${authorsCreated} fiche(s) créée(s), ${contributionsLinked} contribution(s) reliée(s).`,
    );
    return { authorsCreated, contributionsLinked };
  }
}
