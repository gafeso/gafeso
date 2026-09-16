import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CollectionType, PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { refusDeDeplacement } from '../collections/hierarchie';
import { planifierPropagation } from '../collections/propagation';
import { AUDIT_ACTIONS } from '../audit/audit.actions';
import {
  AccessDenialReason,
  explainAccessDenial,
  hasAccessViaRules,
  StudentAccessContext,
  sousEmbargo,
} from './access-control.matching';
import { CreateCollectionDto } from './dto/create-collection.dto';
import { UpdateCollectionDto } from './dto/update-collection.dto';
import { AddAccessRuleDto } from './dto/add-access-rule.dto';

/** Réponse d'accès à un document numérique local, avec message prêt à afficher. */
export type RecordAccessStatus =
  | { granted: true }
  | ({ granted: false; message: string } & AccessDenialReason);

/**
 * Message d'un refus d'accès, prêt à afficher.
 *
 * ⚠ EXPORTÉ DEPUIS LE 16 SEPTEMBRE 2026 pour que l'émission de licence
 * hors-ligne le RÉUTILISE au lieu de le recopier. Deux formulations d'un même
 * refus divergent le jour où l'une change, et c'est le lecteur qui paie la
 * différence.
 */
export function denialMessage(reason: AccessDenialReason): string {
  switch (reason.code) {
    case 'CLASS_MISMATCH':
      return `Réservé aux étudiants de ${reason.requiredClassName}.`;
    case 'SUBSCRIPTION_REQUIRED':
      return `Abonnement requis (palier "${reason.requiredSubscriptionTier}").`;
    case 'EMBARGO':
      return (
        `Ce document est sous embargo jusqu'au ` +
        `${reason.embargoUntil.toLocaleDateString('fr-FR')}. ` +
        `Sa description reste consultable ; le fichier ne l'est pas encore.`
      );
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

    // ⚠ LE DÉPLACEMENT EST VÉRIFIÉ AVANT L'ÉCRITURE, et ce n'est pas une
    // duplication inutile du trigger PostgreSQL.
    //
    // Le trigger est le garde de DERNIER RECOURS, commun à tous les écrivains
    // (API, seed, reprise, import futur). Ce contrôle-ci existe pour deux
    // raisons que le trigger ne couvre pas : rendre un 400 EXPLICABLE plutôt
    // que laisser remonter une erreur PostgreSQL à l'écran, et voir la HAUTEUR
    // DU SOUS-ARBRE déplacé — que le trigger ignore, puisqu'il ne valide que la
    // ligne écrite. Déplacer une collection qui a déjà des enfants peut porter
    // un sous-arbre au-delà de trois niveaux sans qu'aucune ligne ne viole la
    // règle à son propre niveau.
    if (dto.parentId !== undefined) {
      const noeuds = await this.prisma.collection.findMany({
        // ⚠ `tenantId` EST NÉCESSAIRE : `refusDeDeplacement` refuse un parent
        // d'un autre établissement. Sans cette colonne, le refus ne pourrait
        // jamais se déclencher — et il serait silencieux, donc invisible.
        select: { id: true, parentId: true, tenantId: true },
      });
      const refus = refusDeDeplacement(noeuds, id, dto.parentId);
      if (refus) throw new BadRequestException(refus);
    }

    return this.prisma.collection.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description.trim() || null }
          : {}),
        // `null` détache la collection ; `undefined` ne touche à rien.
        ...(dto.parentId !== undefined ? { parentId: dto.parentId } : {}),
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

  /**
   * SUPPRIME UNE COLLECTION — et refuse si elle n'est pas VIDE.
   *
   * ⚠ ELLE NE POUVAIT PAS ÊTRE SUPPRIMÉE DU TOUT. Trois suppressions
   * existaient — ses notices, ses titres, ses règles d'accès — et pas la
   * collection elle-même. Une collection créée sur une faute de frappe restait
   * pour toujours dans l'écran d'administration, et P6-1 a augmenté le coût :
   * avec la hiérarchie, une sous-collection mal créée est permanente et l'arbre
   * la montre à chaque visite.
   *
   * ⚠ REFUS PLUTÔT QUE CASCADE, et le motif décide : une cascade emporterait
   * des RÈGLES D'ACCÈS, c'est-à-dire des décisions que quelqu'un a prises. Même
   * raisonnement que `DELETE /authors/:id`, qui refuse une fiche portant des
   * œuvres. Le refus oblige à voir ce qu'on détruit avant de le détruire.
   *
   * ⚠ ET « VIDE » INCLUT LES RÈGLES D'ACCÈS. Une collection sans aucune notice
   * mais portant des règles porte quand même des décisions — c'est précisément
   * la forme qu'on ne voit pas : l'écran la montre vide, et elle ne l'est pas.
   *
   * ⚠ LE REFUS COMPTE CE QUI BLOQUE. « Cette collection n'est pas vide » envoie
   * chercher à l'aveugle ; « 12 notices, 3 règles d'accès, 2 sous-collections »
   * dit quoi faire, et dans quel ordre.
   */
  async removeCollection(collectionId: string, tenantId: string) {
    const collection = await this.requireManageableCollection(collectionId, tenantId);

    // ⚠ LA COLLECTION SOCLE NE SE SUPPRIME PAS, et la déclaration du schéma
    // disait le contraire (« Modifiable et supprimable comme n'importe quelle
    // collection ») — elle n'a jamais été vraie, puisque RIEN ne supprimait.
    //
    // Le motif est un faux silencieux en attente : `DigitalCopyService` y
    // rattache automatiquement chaque document numérisé, et sort en silence
    // (`if (!collection) return`) quand il n'y en a pas. Sans socle, un
    // document téléversé n'entre dans aucune collection et n'est visible de
    // personne — sans erreur, sans trace, sans que l'on sache pourquoi.
    if (collection.isDefault) {
      throw new BadRequestException(
        'Cette collection est le socle de l’établissement : les documents ' +
          'numérisés y sont rattachés automatiquement. La supprimer les rendrait ' +
          'invisibles sans que rien ne le signale.',
      );
    }

    const [notices, regles, enfants] = await Promise.all([
      this.prisma.collectionTitle.count({ where: { collectionId } }),
      this.prisma.accessRule.count({ where: { collectionId } }),
      this.prisma.collection.count({ where: { parentId: collectionId } }),
    ]);

    const blocages = [
      notices > 0 && `${notices} document(s)`,
      regles > 0 && `${regles} règle(s) d’accès`,
      enfants > 0 && `${enfants} sous-collection(s)`,
    ].filter(Boolean) as string[];

    if (blocages.length > 0) {
      throw new BadRequestException(
        `Cette collection n’est pas vide : ${blocages.join(', ')}. ` +
          'Retirez-les d’abord — une suppression en cascade emporterait des ' +
          'règles d’accès, c’est-à-dire des décisions.',
      );
    }

    await this.prisma.collection.delete({ where: { id: collectionId } });
    return { deleted: true, name: collection.name };
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
   * Ce que la propagation FERAIT — sans rien écrire.
   *
   * ⚠ MOITIÉ EXIGÉE DU LOT : l'action liste ce qu'elle va toucher AVANT
   * d'écrire. Un élargissement de droits qui s'applique sans être montré est
   * ce que ce dépôt passe son temps à corriger.
   */
  async previsualiserPropagation(collectionId: string, tenantId: string) {
    await this.requireManageableCollection(collectionId, tenantId);
    return planifierPropagation({
      ...(await this.donneesDePropagation()),
      sourceId: collectionId,
      tenantId,
    });
  }

  /** Les deux lectures dont la planification a besoin. */
  private async donneesDePropagation() {
    const [collections, regles] = await Promise.all([
      this.prisma.collection.findMany({
        select: { id: true, parentId: true, name: true, tenantId: true },
      }),
      this.prisma.accessRule.findMany({
        select: { collectionId: true, tenantId: true, className: true, subscriptionTier: true },
      }),
    ]);
    return {
      noeuds: collections.map((c) => ({
        id: c.id,
        parentId: c.parentId,
        nom: c.name,
        tenantId: c.tenantId,
      })),
      regles,
    };
  }

  /**
   * Applique les règles de la collection à TOUTES ses descendantes.
   *
   * ⚠ L'ÉCRITURE ET SA TRACE SONT ATOMIQUES, et ce n'est pas du zèle.
   *
   * Le motif ailleurs dans ce dépôt est `void this.audit.log(...)` —
   * fire-and-forget —, et `AuditService.log` AVALE de surcroît son propre
   * échec (try/catch + warn). Pour une action ordinaire c'est le bon
   * compromis : un journal indisponible ne doit pas empêcher une connexion.
   *
   * Ici non. Cette action ÉLARGIT des droits, et « laisse une trace » ne peut
   * pas vouloir dire « probablement ». L'entrée d'audit est donc écrite dans la
   * MÊME transaction que les règles : si elle échoue, rien n'est élargi. On ne
   * passe pas par `AuditService.log`, précisément parce qu'il rattrape l'erreur
   * qu'on veut voir remonter.
   *
   * ⚠ Idempotente : une descendante qui porte déjà une règle identique ne
   * reçoit rien. Relancer la propagation deux fois n'empile pas de doublons.
   */
  async propagerRegles(
    collectionId: string,
    tenantId: string,
    acteur: { id?: string; email?: string; role?: string; ip?: string },
  ) {
    await this.requireManageableCollection(collectionId, tenantId);
    const plan = planifierPropagation({
      ...(await this.donneesDePropagation()),
      sourceId: collectionId,
      tenantId,
    });

    if (plan.reglesAEcrire === 0) {
      // ⚠ RIEN À ÉCRIRE N'EST PAS UN ÉCHEC, et ce n'est pas un succès muet
      // non plus : le plan dit pourquoi (aucune descendante, ou toutes déjà
      // pourvues). Aucune entrée d'audit — il n'y a pas eu d'élargissement.
      return { ...plan, ecrites: 0 };
    }

    const aEcrire = plan.destinations.flatMap((d) =>
      d.aAjouter.map((r) => ({
        collectionId: d.collectionId,
        tenantId: r.tenantId,
        className: r.className,
        subscriptionTier: r.subscriptionTier,
      })),
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.accessRule.createMany({ data: aEcrire });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: acteur.id ?? null,
          actorEmail: acteur.email ?? null,
          actorRole: acteur.role ?? null,
          action: AUDIT_ACTIONS.COLLECTION_RULES_PROPAGATE,
          targetType: 'collection',
          targetId: collectionId,
          ip: acteur.ip ?? null,
          // ⚠ Les collections touchées sont NOMMÉES dans la trace. Un audit qui
          // dit « propagation » sans dire vers quoi ne permet pas de défaire.
          metadata: {
            reglesEcrites: aEcrire.length,
            destinations: plan.destinations
              .filter((d) => d.aAjouter.length > 0)
              .map((d) => ({ id: d.collectionId, nom: d.nom, regles: d.aAjouter.length })),
            // ⚠ LES ÉPARGNÉES SONT DANS LA TRACE, pas seulement dans la
            // réponse. Une propagation qui a sauté trois sous-collections
            // parce qu'elles portaient leurs propres règles n'a pas fait ce
            // que son nom dit : le journal doit le raconter, sinon relire
            // l'audit dans six mois donnera une propagation « complète » qui
            // ne l'était pas.
            //
            // Aplati en objets simples : `Prisma.InputJsonValue` n'accepte pas
            // un tableau d'interfaces nommées, seulement des objets d'index.
            epargnees: plan.epargnees.map((e) => ({
              id: e.collectionId,
              nom: e.nom,
              reglesPropres: e.reglesPropres,
            })),
            ecartees: plan.ecartees.map((e) => ({
              id: e.collectionId,
              nom: e.nom,
              motif: e.motif,
            })),
          },
        },
      });
    });

    return { ...plan, ecrites: aEcrire.length };
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
    /**
     * ⚠ LE CLIENT TENANT EST OBLIGATOIRE, ET CE N'EST PAS UNE COMMODITÉ.
     *
     * L'embargo vit sur la notice, donc dans le schéma de l'école ; le reste de
     * cette décision lit le schéma public. Le rendre OPTIONNEL aurait sauté
     * l'embargo par simple omission — l'affirmation fausse rétablie par
     * distraction, exactement ce qu'on a corrigé ce matin sur `MailOutcome`.
     * Obligatoire, le compilateur est allé chercher les quatre appelants.
     */
    db: Pick<PrismaClient, 'biblioRecord'>,
    ctx: StudentAccessContext,
    recordId: string,
    /** Injectable pour éprouver les bornes de l'embargo — voir `sousEmbargo`. */
    maintenant?: Date,
  ): Promise<RecordAccessStatus> {
    // ⚠ L'EMBARGO SE DÉCIDE ICI, ET AVANT LES RÈGLES — P6-4.
    //
    // Ici, et non dans une liste de surfaces à tenir à jour : ce point garde
    // l'URL de lecture en ligne ET l'émission de licence hors-ligne. Une liste
    // aurait eu à être complétée à chaque surface nouvelle, et la manquante
    // aurait été la dernière écrite — celle que personne ne relit.
    //
    // AVANT les règles, parce que l'embargo ne dépend pas de qui demande.
    // Évaluer la classe d'abord produirait « réservé aux M2 » pour une thèse
    // que même un M2 ne peut pas lire — un refus exact et trompeur.
    const notice = await db.biblioRecord.findUnique({
      where: { id: recordId },
      select: { embargoUntil: true },
    });
    if (notice && sousEmbargo(notice.embargoUntil, maintenant ?? new Date())) {
      const reason = { code: 'EMBARGO' as const, embargoUntil: notice.embargoUntil! };
      return { granted: false, message: denialMessage(reason), ...reason };
    }

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
      // ⚠ `isDefault` et `name` sont chargés ICI, et non par un second `select`
      // chez l'appelant : cette méthode est le point de passage de toute
      // manipulation de collection, et un appelant qui recharge la même ligne
      // est un appelant qui peut la recharger AUTREMENT.
      select: { id: true, name: true, type: true, tenantId: true, isDefault: true },
    });
    if (!collection || this.isForeignInternal(collection, tenantId)) {
      throw new NotFoundException('Collection introuvable.');
    }
    return collection;
  }
}
