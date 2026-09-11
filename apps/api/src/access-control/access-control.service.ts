import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CollectionType, PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AccessDenialReason,
  explainAccessDenial,
  hasAccessViaRules,
  StudentAccessContext,
} from './access-control.matching';
import { CreateCollectionDto } from './dto/create-collection.dto';
import { UpdateCollectionDto } from './dto/update-collection.dto';
import { AddAccessRuleDto } from './dto/add-access-rule.dto';

/** Réponse d'accès à un document numérique local, avec message prêt à afficher. */
export type RecordAccessStatus =
  | { granted: true }
  | ({ granted: false; message: string } & AccessDenialReason);

function denialMessage(reason: AccessDenialReason): string {
  switch (reason.code) {
    case 'CLASS_MISMATCH':
      return `Réservé aux étudiants de ${reason.requiredClassName}.`;
    case 'SUBSCRIPTION_REQUIRED':
      return `Abonnement requis (palier "${reason.requiredSubscriptionTier}").`;
    case 'NOT_CONFIGURED':
    default:
      return 'Ce document n’est pas accessible pour votre école.';
  }
}

@Injectable()
export class AccessControlService {
  constructor(private readonly prisma: PrismaService) {}

  // ───────────────────────────────────────────────────────────
  // Collections (gestion — schéma PUBLIC partagé, d'où l'isolation MANUELLE)
  //
  // Le schéma public héberge les collections de TOUTES les écoles ; le
  // client Prisma n'est donc PAS cloisonné ici (contrairement aux autres
  // modules qui passent par forTenant). Chaque requête doit filtrer par
  // tenant à la main :
  //  - une collection INTERNAL appartient à une seule école (tenantId) et
  //    n'est ni visible ni gérable par les autres — traitée comme
  //    « introuvable » (404, jamais 403 : on ne confirme pas son existence) ;
  //  - une collection COMMERCIAL/EXTERNAL est partagée (tenantId null), mais
  //    ses règles d'accès restent propres à chaque école.
  // ───────────────────────────────────────────────────────────
  async createCollection(dto: CreateCollectionDto, tenantId: string) {
    return this.prisma.collection.create({
      data: {
        name: dto.name,
        description: dto.description ?? null,
        type: dto.type,
        sourceId: dto.sourceId ?? null,
        // Une collection interne est possédée dès sa création (plus de fenêtre
        // où, tenantId null, elle serait visible par toutes les écoles).
        tenantId: dto.type === CollectionType.INTERNAL ? tenantId : null,
      },
    });
  }

  async listCollections(tenantId: string) {
    const collections = await this.prisma.collection.findMany({
      where: {
        OR: [
          // Ses propres collections internes…
          { type: CollectionType.INTERNAL, tenantId },
          // …et les collections partagées (commerciales / externes).
          { type: { in: [CollectionType.COMMERCIAL, CollectionType.EXTERNAL] } },
        ],
      },
      include: {
        _count: { select: { titles: true } },
        // Ne compter QUE les règles de cette école (les règles des autres
        // écoles sur une collection partagée ne doivent pas fuiter, même en
        // nombre).
        accessRules: { where: { tenantId }, select: { id: true } },
      },
      orderBy: { name: 'asc' },
    });
    return collections.map(({ accessRules, _count, ...collection }) => ({
      ...collection,
      _count: { titles: _count.titles, accessRules: accessRules.length },
    }));
  }

  async updateCollection(
    id: string,
    tenantId: string,
    dto: UpdateCollectionDto,
  ) {
    // Rejette une collection interne d'une autre école (404) avant modification.
    await this.requireManageableCollection(id, tenantId);
    return this.prisma.collection.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description.trim() || null }
          : {}),
      },
    });
  }

  async getCollection(id: string, tenantId: string) {
    const collection = await this.prisma.collection.findUnique({
      where: { id },
      include: {
        titles: { include: { title: true } },
        // Seulement les règles de l'école courante (pas celles des autres
        // écoles pour une collection partagée).
        accessRules: { where: { tenantId } },
      },
    });
    if (!collection || this.isForeignInternal(collection, tenantId)) {
      throw new NotFoundException('Collection introuvable.');
    }
    return collection;
  }

  async addTitle(collectionId: string, tenantId: string, titleId: string) {
    await this.requireManageableCollection(collectionId, tenantId);
    return this.prisma.collectionTitle.upsert({
      where: { collectionId_titleId: { collectionId, titleId } },
      create: { collectionId, titleId },
      update: {},
    });
  }

  async removeTitle(collectionId: string, tenantId: string, titleId: string) {
    await this.requireManageableCollection(collectionId, tenantId);
    await this.prisma.collectionTitle.deleteMany({
      where: { collectionId, titleId },
    });
    return { removed: true };
  }

  /**
   * Rattache un document numérisé localement (BiblioRecord, schéma tenant) à
   * une collection INTERNAL. La collection est liée à l'école au premier
   * document ajouté ; un rattachement ultérieur par une autre école est
   * refusé (une collection interne appartient à une seule école).
   */
  async addRecord(collectionId: string, tenantId: string, recordId: string) {
    // Rejette d'emblée une collection interne d'une autre école (404).
    const collection = await this.requireManageableCollection(collectionId, tenantId);
    // Seules les collections INTERNAL reçoivent des documents numérisés locaux :
    // sans ce garde-fou, un admin « réclamerait » (tenantId) une collection
    // COMMERCIAL/EXTERNAL partagée entre toutes les écoles.
    if (collection.type !== CollectionType.INTERNAL) {
      throw new BadRequestException(
        'Seule une collection interne peut contenir des documents numérisés de l’école.',
      );
    }
    if (!collection.tenantId) {
      // Filet de sécurité pour une éventuelle collection interne héritée
      // (tenantId null) : prise de possession atomique. Une course perdue
      // signifie qu'une autre école l'a réclamée → traitée comme introuvable.
      const claimed = await this.prisma.collection.updateMany({
        where: { id: collectionId, tenantId: null },
        data: { tenantId },
      });
      if (claimed.count === 0) {
        throw new NotFoundException('Collection introuvable.');
      }
    }
    return this.prisma.collectionTitle.upsert({
      where: { collectionId_recordId: { collectionId, recordId } },
      create: { collectionId, recordId },
      update: {},
    });
  }

  async removeRecord(collectionId: string, tenantId: string, recordId: string) {
    await this.requireManageableCollection(collectionId, tenantId);
    await this.prisma.collectionTitle.deleteMany({
      where: { collectionId, recordId },
    });
    return { removed: true };
  }

  // ───────────────────────────────────────────────────────────
  // Règles d'accès (isolées par école via tenantId)
  // ───────────────────────────────────────────────────────────
  async addAccessRule(
    collectionId: string,
    tenantId: string,
    dto: AddAccessRuleDto,
    slug?: string,
  ) {
    // Une collection interne d'une autre école est « introuvable » : sinon
    // l'école B rendrait visible à ses étudiants le contenu (noms, documents)
    // de la collection interne de l'école A.
    await this.requireManageableCollection(collectionId, tenantId);

    // La classe d'une règle est COMPARÉE telle quelle à `users.class_name`
    // (access-control.matching). Une valeur ne correspondant à aucune classe
    // réelle produit donc une règle qui ne matchera JAMAIS personne — sans le
    // moindre signal. C'est le pendant, côté règle, du défaut corrigé sur le
    // champ « Classe » du compte : les DEUX côtés de la comparaison étaient en
    // saisie libre, et aucun n'était validé.
    const className = dto.className?.trim() || null;
    if (className && slug) {
      const db = this.prisma.forTenant(slug);
      const known = await db.schoolClass.findUnique({ where: { name: className } });
      if (!known) {
        const available = await db.schoolClass.findMany({
          select: { name: true },
          orderBy: { name: 'asc' },
          take: 20,
        });
        throw new BadRequestException(
          `Classe « ${className} » inconnue : cette règle ne correspondrait à aucun étudiant. ` +
            (available.length > 0
              ? `Classes existantes : ${available.map((c) => c.name).join(', ')}.`
              : `Aucune classe n'est encore créée dans cet établissement.`),
        );
      }
    }

    return this.prisma.accessRule.create({
      data: {
        collectionId,
        tenantId,
        className,
        subscriptionTier: dto.subscriptionTier?.trim() || null,
      },
    });
  }

  /**
   * LIBELLÉ d'un document local rattaché à une collection — identifiant et
   * titre, rien d'autre.
   *
   * ⚠ POURQUOI CETTE ROUTE EXISTE. L'écran des collections affichait le titre
   * de ses documents en appelant `GET /cataloging/records/:id`, qui n'exigeait
   * AUCUNE fonction : le registre professionnel entier — `marcData`,
   * exemplaires, contributeurs — était donc lisible par tout compte
   * authentifié, étudiants compris, et le commentaire du front reposait
   * là-dessus en toutes lettres. La faille est fermée (`catalogue.gerer` sur
   * les trois routes de lecture), et ce besoin-là, légitime, a désormais sa
   * propre porte, couverte par `collections.gerer`.
   *
   * ⚠ ET LE `select` EST LA SÉCURITÉ, pas une optimisation. Rendre la ligne
   * entière ici recréerait la fuite sous un autre nom : un écran qui a besoin
   * d'un libellé n'a pas besoin du registre. Toute colonne ajoutée à
   * `BiblioRecord` resterait ainsi hors de cette réponse, par construction —
   * c'est ce qu'un `include` ne garantit jamais.
   */
  async recordLabel(slug: string, recordId: string) {
    const db = this.prisma.forTenant(slug);
    const record = await db.biblioRecord.findUnique({
      where: { id: recordId },
      select: { id: true, title: true },
    });
    if (!record) throw new NotFoundException('Notice introuvable.');
    return record;
  }

  /**
   * Référentiels pour composer une règle : classes réelles (avec leur libellé)
   * et paliers d'abonnement RÉELLEMENT portés par des comptes.
   *
   * Les paliers n'ont pas de table dédiée (`users.subscription_tier` est une
   * chaîne libre) : on renvoie donc les valeurs distinctes observées. C'est
   * précisément ce qu'un administrateur doit voir pour ne pas inventer un
   * palier auquel personne n'appartient.
   */
  async ruleOptions(slug: string) {
    const db = this.prisma.forTenant(slug);
    const [classes, tiers] = await Promise.all([
      db.schoolClass.findMany({
        select: { name: true, label: true },
        orderBy: { name: 'asc' },
      }),
      db.user.findMany({
        where: { subscriptionTier: { not: '' } },
        select: { subscriptionTier: true },
        distinct: ['subscriptionTier'],
        orderBy: { subscriptionTier: 'asc' },
      }),
    ]);
    return {
      classes,
      tiers: tiers.map((t) => t.subscriptionTier).filter(Boolean),
    };
  }

  async listAccessRules(collectionId: string, tenantId: string) {
    // Rejette une collection interne d'une autre école avant tout.
    await this.requireManageableCollection(collectionId, tenantId);
    // Un admin ne voit que les règles de sa propre école.
    return this.prisma.accessRule.findMany({
      where: { collectionId, tenantId },
    });
  }

  async removeAccessRule(ruleId: string, tenantId: string) {
    const rule = await this.prisma.accessRule.findUnique({
      where: { id: ruleId },
    });
    // Rule d'une autre école = introuvable (on ne confirme pas son existence).
    if (!rule || rule.tenantId !== tenantId) {
      throw new NotFoundException('Règle d’accès introuvable.');
    }
    await this.prisma.accessRule.delete({ where: { id: ruleId } });
    return { removed: true };
  }

  // ───────────────────────────────────────────────────────────
  // Filtrage étudiant (cœur du module)
  // ───────────────────────────────────────────────────────────
  /**
   * Collections visibles par l'étudiant : celles ayant au moins une règle
   * d'accès de son école qui correspond à sa classe et son abonnement.
   * Les règles d'accès (qui exposeraient d'autres classes) sont retirées de
   * la réponse.
   */
  async getVisibleCollections(ctx: StudentAccessContext) {
    const collections = await this.prisma.collection.findMany({
      // Pré-filtrage en base par école (peu coûteux)…
      where: { accessRules: { some: { tenantId: ctx.tenantId } } },
      include: {
        accessRules: true,
        titles: { include: { title: true } },
      },
      orderBy: { name: 'asc' },
    });

    // …puis évaluation fine (classe + palier) via la logique pure testée.
    return collections
      .filter((collection) => hasAccessViaRules(collection.accessRules, ctx))
      .map(({ accessRules, ...visible }) => visible);
  }

  /**
   * Vrai si l'étudiant peut accéder à un titre donné : le titre appartient à
   * au moins une collection à laquelle il a droit.
   */
  async canAccessTitle(
    ctx: StudentAccessContext,
    titleId: string,
  ): Promise<boolean> {
    const links = await this.prisma.collectionTitle.findMany({
      where: {
        titleId,
        collection: { accessRules: { some: { tenantId: ctx.tenantId } } },
      },
      include: { collection: { include: { accessRules: true } } },
    });
    return links.some((link) =>
      hasAccessViaRules(link.collection.accessRules, ctx),
    );
  }

  /**
   * Statut d'accès de l'étudiant à un document numérisé localement
   * (BiblioRecord), avec message français prêt à afficher en cas de refus.
   * C'est la porte d'entrée utilisée par l'endpoint de lecture en ligne —
   * AUCUNE URL signée n'est délivrée sans un `granted: true` ici.
   */
  async getRecordAccessStatus(
    ctx: StudentAccessContext,
    recordId: string,
  ): Promise<RecordAccessStatus> {
    const links = await this.prisma.collectionTitle.findMany({
      where: {
        recordId,
        collection: { accessRules: { some: { tenantId: ctx.tenantId } } },
      },
      include: { collection: { include: { accessRules: true } } },
    });

    if (links.some((link) => hasAccessViaRules(link.collection.accessRules, ctx))) {
      return { granted: true };
    }

    const rules = links.flatMap((link) =>
      link.collection.accessRules.filter((rule) => rule.tenantId === ctx.tenantId),
    );
    const reason = explainAccessDenial(rules, ctx);
    return { granted: false, message: denialMessage(reason), ...reason };
  }

  /** Construit le contexte d'accès (classe + palier) d'un étudiant depuis le schéma tenant. */
  async buildStudentContext(
    tenant: { id: string },
    db: Pick<PrismaClient, 'user'>,
    userId: string,
  ): Promise<StudentAccessContext> {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { className: true, subscriptionTier: true },
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable.');
    return {
      tenantId: tenant.id,
      className: user.className,
      subscriptionTier: user.subscriptionTier,
    };
  }

  // ───────────────────────────────────────────────────────────
  /**
   * Vrai si la collection est une collection INTERNAL possédée par UNE AUTRE
   * école — donc invisible/ingérable pour `tenantId`. Une collection partagée
   * (COMMERCIAL/EXTERNAL, tenantId null) n'est jamais « étrangère ».
   */
  private isForeignInternal(
    collection: { type: CollectionType; tenantId: string | null },
    tenantId: string,
  ): boolean {
    return (
      collection.type === CollectionType.INTERNAL &&
      collection.tenantId !== null &&
      collection.tenantId !== tenantId
    );
  }

  /**
   * Charge une collection gérable par l'école courante, ou lève 404. « Gérable »
   * = ses propres collections internes + les collections partagées. Une
   * collection interne d'une autre école (ou inexistante) est indistinctement
   * « introuvable » — jamais 403, pour ne pas confirmer son existence.
   */
  private async requireManageableCollection(id: string, tenantId: string) {
    const collection = await this.prisma.collection.findUnique({
      where: { id },
      select: { id: true, type: true, tenantId: true },
    });
    if (!collection || this.isForeignInternal(collection, tenantId)) {
      throw new NotFoundException('Collection introuvable.');
    }
    return collection;
  }
}
