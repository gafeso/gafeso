import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CatalogingService } from '../cataloging/cataloging.service';
import { AuthorsService } from '../authors/authors.service';
import { CategoriesService } from '../categories/categories.service';
import { RolesService } from '../roles/roles.service';
import { MODELES_A_SUPPRIMER, proprietePrisma } from './lignes-partagees-d-une-ecole';
import { EXEMPLE_HOME_CONTENT, EXEMPLE_HOME_THEME } from '../tenancy/home-seed-exemple';

/**
 * Tours de bcrypt — la MÊME valeur que `AuthService` et `AccountsService`.
 *
 * ⚠ C'est une troisième copie, et elle est recopiée faute de mieux : les trois
 * services n'ont pas de module commun. Un test la garde
 * (`tours-de-bcrypt.spec.ts`) — sinon le jour où l'on durcit la politique, deux
 * services la durciraient et le troisième continuerait de hacher plus faible,
 * sans que rien ne le dise.
 */
const BCRYPT_ROUNDS_ADMIN = 10;
import {
  buildAddMissingColumnsStatements,
  buildColumnConstraintStatements,
  buildColumnIntrospectionQuery,
  buildDeprovisionStatement,
  buildEnumValueIntrospectionQuery,
  buildIndexIntrospectionQuery,
  buildMissingEnumValueStatements,
  buildMissingIndexStatements,
  buildUniqueIndexStatements,
  buildProvisionStatements,
  IntrospectedColumn,
  IntrospectedEnumValue,
  IntrospectedIndex,
  isValidSlug,
  tenantSchemaName,
  buildCollationIntrospectionQuery,
  buildCollationStatements,
  IntrospectedCollation,
} from '../tenancy/tenant-schema';
import { ProvisionTenantDto } from './dto/provision-tenant.dto';

/** Charge utile d'un JWT super-admin plateforme (hors tenant). */
export interface SuperAdminPayload {
  sub: string;
  email: string;
  superAdmin: true;
}

/**
 * Socle par défaut d'une école neuve — voir provisionTenant.
 * Tout est MODIFIABLE et SUPPRIMABLE : ce sont des points de départ, pas des
 * objets système.
 */
export const DEFAULT_COLLECTION_NAME = 'Fonds numérique de l’établissement';

/**
 * Classes d'exemple. Le suffixe « (exemple) » du libellé les signale sans
 * exiger de colonne dédiée : l'administrateur voit immédiatement ce qui vient
 * du socle et peut supprimer ce qu'il n'utilise pas.
 */
/**
 * Règle de circulation d'ouverture — joker global (`*` / `*`).
 *
 * Elle reprend EXACTEMENT `DEFAULT_RULE` : aucun comportement ne change. Son
 * seul rôle est de rendre le réglage VISIBLE. Jusqu'ici l'écran des règles
 * était vide à l'ouverture, un défaut caché s'appliquait, et le bibliothécaire
 * n'avait rien à regarder ni à modifier — il ne pouvait pas soupçonner que ses
 * amendes valaient 0 FCFA par jour. Un réglage invisible ne se corrige pas.
 *
 * On ne fixe volontairement AUCUN tarif : inventer un montant reviendrait à
 * figer une politique qu'aucun établissement n'a choisie, et redeviendrait faux
 * chez le suivant — exactement le travers de l'année académique calculée sur
 * l'année civile. Zéro est honnête, à condition d'être visible.
 */
export const DEFAULT_CIRCULATION_RULE = {
  patronCategory: '*',
  itemType: '*',
  loanPeriodDays: 14,
  maxRenewals: 1,
  maxCheckouts: 5,
  finePerDay: 0,
} as const;

export const EXAMPLE_CLASSES = [
  { name: 'L1', label: 'Licence 1 (exemple)', level: 'L1' },
  { name: 'L2', label: 'Licence 2 (exemple)', level: 'L2' },
  { name: 'L3', label: 'Licence 3 (exemple)', level: 'L3' },
  { name: 'M1', label: 'Master 1 (exemple)', level: 'M1' },
  { name: 'M2', label: 'Master 2 (exemple)', level: 'M2' },
] as const;

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly cataloging: CatalogingService,
    private readonly categories: CategoriesService,
    private readonly authors: AuthorsService,
    private readonly roles: RolesService,
  ) {}

  /**
   * Déduplication des contributeurs en fiches d'autorité chez UNE école
   * (regroupement par nom normalisé, liaison des contributions). Idempotent :
   * relancer ne crée ni ne relie rien de plus. Tenant-scopé.
   */
  async dedupeAuthors(slug: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) throw new NotFoundException('École introuvable.');
    const result = await this.authors.dedupeContributors(this.prisma.forTenant(slug));
    return { slug, ...result };
  }

  /**
   * Migration auteurs → contributeurs chez UNE école (cahier fiche de saisie
   * §2.2, phase 1/2 — voir CatalogingService.migrateAuthorsToContributors).
   * Idempotent, ne supprime rien. Tenant-scopé.
   */
  async migrateAuthors(slug: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) throw new NotFoundException('École introuvable.');
    const result = await this.cataloging.migrateAuthorsToContributors(
      this.prisma.forTenant(slug),
    );
    return { slug, ...result };
  }

  /**
   * Seed des catégories standard chez UNE école (voir
   * CategoriesService.seedDefaults — idempotent, ajout seul, comparaison sans
   * casse ni accents). Tenant-scopé : n'affecte jamais les autres écoles.
   */
  /**
   * Domaines orphelins d'une école : valeurs portées par des notices sans
   * catégorie correspondante (voir CategoriesService.orphanCategories).
   *
   * ⚠ LECTURE SEULE par défaut. `creer` doit être demandé explicitement — une
   * réparation qui crée le vocabulaire à la place de la bibliothécaire
   * reproduirait la faute qu'elle corrige.
   */
  async orphanCategories(slug: string, creer = false) {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) throw new NotFoundException('École introuvable.');
    return this.categories.orphanCategories(this.prisma.forTenant(slug), slug, creer);
  }

  async seedCategories(slug: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) throw new NotFoundException('École introuvable.');
    const result = await this.categories.seedDefaults(this.prisma.forTenant(slug));
    return { slug, ...result };
  }

  /**
   * Seed d'une page d'accueil d'EXEMPLE (voir home-seed-exemple.ts) chez
   * l'établissement `slug` : de quoi partir d'une vitrine complète et cohérente,
   * à réécrire ensuite avec ses propres informations. Écrase le contenu, les
   * tokens vitrine et active le motif ; NE touche PAS à primaryColor (la couleur
   * choisie par l'établissement reste --primary). Écrit dans
   * public.tenant_settings (upsert).
   */
  async seedHomepage(slug: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) throw new NotFoundException('École introuvable.');

    const data = {
      homepageContent: EXEMPLE_HOME_CONTENT as unknown as Prisma.InputJsonValue,
      themeTokens: EXEMPLE_HOME_THEME.themeTokens as unknown as Prisma.InputJsonValue,
      latticeEnabled: EXEMPLE_HOME_THEME.latticeEnabled,
    };
    await this.prisma.tenantSettings.upsert({
      where: { tenantId: tenant.id },
      update: data,
      create: { tenantId: tenant.id, ...data },
    });
    this.logger.log(`Seed page d'accueil (contenu d'exemple) appliqué à "${slug}".`);
    return { slug, seeded: true };
  }

  /**
   * Connexion super-admin plateforme (table public.super_admins).
   * Émet un JWT marqué superAdmin. Message d'erreur unique (pas de fuite).
   */
  async superAdminLogin(email: string, password: string) {
    const admin = await this.prisma.superAdmin.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (!admin || !(await bcrypt.compare(password, admin.password))) {
      throw new UnauthorizedException('Identifiants invalides.');
    }
    const payload: SuperAdminPayload = {
      sub: admin.id,
      email: admin.email,
      superAdmin: true,
    };
    return {
      accessToken: await this.jwt.signAsync(payload),
      superAdmin: { id: admin.id, email: admin.email, name: admin.name },
    };
  }

  /**
   * REPRENDRE L'ACCÈS À UN SUPER-ADMIN PLATEFORME dont le mot de passe est perdu.
   *
   * ## Pourquoi cette route existe
   *
   * Le super-admin vit dans le schéma `public` et se connecte par
   * `POST /admin/login`. Il n'a AUCUN chemin de reprise : `PasswordToken` est
   * par-tenant, donc le lien de définition — la mécanique que le produit
   * emploie partout ailleurs — ne lui est pas applicable.
   *
   * ⚠ LA FORME FAUTIVE QUE CE PROBLÈME APPELLE, et elle PASSERAIT : créer un
   * `PasswordToken` dans `public`. La table y existe (le gabarit la porte), donc
   * l'écriture réussit. Mais l'écran `/definir-mot-de-passe` résout son tenant
   * par le DOMAINE : un jeton de `public` n'y serait jamais trouvé, et la
   * personne lirait « Lien invalide ou expiré » sur un lien qu'on vient de lui
   * donner. Un faux dispositif complet — il s'exécute, il écrit, il ne sert
   * à rien.
   *
   * ## Pourquoi ce n'est PAS un élargissement de droit
   *
   * Mesuré : `payload.superAdmin` n'est honoré que par `ApiKeyGuard`, qui
   * accepte indifféremment ce JWT ou `ADMIN_API_KEY`. Le porteur de la clé a
   * donc DÉJÀ tout ce qu'un super-admin peut faire. Cette route ne lui ouvre
   * rien de neuf — elle lui rend une porte qu'il possédait.
   *
   * ## Le mot de passe est ENGENDRÉ, jamais reçu
   *
   * Rendu UNE FOIS dans la réponse. L'accepter en entrée ferait voyager une
   * valeur choisie par l'opérateur — donc réutilisée ailleurs — dans un corps
   * de requête.
   */
  async reinitialiserSuperAdmin(email: string) {
    const normalise = email.trim().toLowerCase();
    const admin = await this.prisma.superAdmin.findUnique({ where: { email: normalise } });
    // ⚠ On DIT que le compte n'existe pas. C'est l'inverse de `superAdminLogin`,
    // qui rend un message unique pour ne rien divulguer — et c'est juste dans
    // les deux cas : là, l'appelant est un inconnu ; ici, il porte la clé de
    // plateforme et il a besoin de savoir s'il s'est trompé d'adresse.
    if (!admin) {
      throw new NotFoundException(
        `Aucun super-admin plateforme à l'adresse « ${normalise} ».`,
      );
    }
    // 18 octets en base64url ≈ 24 caractères — même force que le mot de passe
    // posé par `provision-production.mjs` sur ce même compte.
    const motDePasse = randomBytes(18).toString('base64url');
    await this.prisma.superAdmin.update({
      where: { id: admin.id },
      data: { password: await bcrypt.hash(motDePasse, BCRYPT_ROUNDS_ADMIN) },
    });
    return {
      email: admin.email,
      motDePasse,
      avertissement:
        "Ce mot de passe n'est affiché qu'une fois et n'est stocké en clair " +
        'nulle part. Notez-le maintenant. Le précédent ne fonctionne plus.',
    };
  }

  /**
   * Provisionne une école : crée la ligne Tenant (+ settings + domaine) dans
   * `public`, puis le schéma `tenant_<slug>` et ses tables. Le tout est
   * atomique : si la création du schéma échoue, la ligne Tenant est annulée.
   */
  async provisionTenant(dto: ProvisionTenantDto) {
    if (!isValidSlug(dto.slug)) {
      throw new BadRequestException('Slug invalide.');
    }
    const existing = await this.prisma.tenant.findUnique({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new ConflictException('Une école existe déjà avec ce slug.');
    }

    const statements = buildProvisionStatements(dto.slug);

    const tenant = await this.prisma.$transaction(async (tx) => {
      const created = await tx.tenant.create({
        data: {
          name: dto.name,
          slug: dto.slug,
          plan: dto.plan ?? undefined,
          settings: { create: {} },
          domains: dto.domain
            ? { create: { domain: dto.domain.toLowerCase(), isPrimary: true } }
            : undefined,
        },
        include: { settings: true, domains: true },
      });

      for (const statement of statements) {
        await tx.$executeRawUnsafe(statement);
      }

      // SOCLE D'ACCÈS PAR DÉFAUT. Sans lui, une école neuve démarrait avec
      // « aucun accès à rien » : il fallait créer une classe, une collection,
      // y ajouter les documents un par un, puis une règle, avant qu'un
      // étudiant puisse ouvrir quoi que ce soit. Un client abandonne avant.
      //
      // La règle est joker/joker (aucune classe ni palier exigés). C'est la
      // formulation la plus SÛRE qui marche immédiatement : se connecter exige
      // déjà un compte ACTIF de cette école (auth.service refuse tout autre
      // statut) et les collections sont filtrées par tenantId. La portée réelle
      // est donc « tout membre inscrit et actif de CET établissement », jamais
      // au-delà — et non « tout le monde ».
      await tx.collection.create({
        data: {
          name: DEFAULT_COLLECTION_NAME,
          description:
            'Collection créée automatiquement à l’ouverture de l’établissement. ' +
            'Les documents numérisés y sont ajoutés au fur et à mesure, et sa ' +
            'règle d’accès les rend lisibles par tout membre inscrit. ' +
            'Modifiable et supprimable.',
          tenantId: created.id,
          isDefault: true,
          accessRules: {
            create: [{ tenantId: created.id, className: null, subscriptionTier: null }],
          },
        },
      });

      return created;
    });

    // SOCLE INTRA-SCHÉMA, hors transaction : le schéma vient d'être créé et
    // n'est adressable qu'avec un client lié à ce schéma.
    //
    // Chaque élément est posé SÉPARÉMENT et son échec est journalisé seul. Un
    // `try` global masquerait lequel a manqué : l'établissement démarrerait
    // amputé d'une pièce précise, avec un message qui ne dit pas laquelle. Ce
    // sont ces manques-là qui se découvrent des semaines plus tard, quand
    // quelqu'un essaie de s'en servir.
    const db = this.prisma.forTenant(dto.slug);
    const socle: string[] = [];

    await this.seedPiece('classes d’exemple', dto.slug, socle, async () => {
      await db.schoolClass.createMany({ data: [...EXAMPLE_CLASSES], skipDuplicates: true });
      return `${EXAMPLE_CLASSES.length} classes`;
    });

    // Rôles système : l'écran des rôles les crée à la première visite, donc
    // leur absence finit par se résorber. On les pose quand même à l'ouverture,
    // pour qu'assigner un rôle à un compte soit possible AVANT d'avoir ouvert
    // cet écran — l'ordre dans lequel un administrateur découvre le logiciel ne
    // doit pas décider de ce qu'il peut faire.
    await this.seedPiece('rôles système', dto.slug, socle, async () => {
      await this.roles.ensureSystemRoles(db);
      return 'rôles système';
    });

    // Catégories standard : sans elles, le premier catalogage se fait avec une
    // liste déroulante vide.
    await this.seedPiece('catégories', dto.slug, socle, async () => {
      const r = await this.categories.seedDefaults(db);
      return `${r.created ?? 0} catégories`;
    });

    // Règle de circulation d'ouverture — voir DEFAULT_CIRCULATION_RULE.
    await this.seedPiece('règle de circulation', dto.slug, socle, async () => {
      await db.circulationRule.upsert({
        where: {
          patronCategory_itemType: {
            patronCategory: DEFAULT_CIRCULATION_RULE.patronCategory,
            itemType: DEFAULT_CIRCULATION_RULE.itemType,
          },
        },
        create: { ...DEFAULT_CIRCULATION_RULE },
        update: {},
      });
      return 'règle */* (14 j, 0 FCFA — à ajuster)';
    });

    this.logger.log(
      `École provisionnée : ${dto.slug} → schéma ${tenantSchemaName(dto.slug)} ` +
        `(socle : collection « ${DEFAULT_COLLECTION_NAME} » ouverte aux inscrits, ${socle.join(', ')})`,
    );
    return tenant;
  }

  /**
   * Pose une pièce du socle en isolant son échec. Le nom de la pièce manquante
   * apparaît dans le journal — sans quoi « socle incomplet » n'aide personne.
   */
  private async seedPiece(
    nom: string,
    slug: string,
    acc: string[],
    fn: () => Promise<string>,
  ): Promise<void> {
    try {
      acc.push(await fn());
    } catch (error) {
      this.logger.warn(
        `Socle incomplet pour ${slug} — « ${nom} » non créé : ${(error as Error).message}. ` +
          `L'établissement reste utilisable, mais cette pièce est à poser à la main.`,
      );
    }
  }

  /**
   * État du SOCLE d'un établissement : ce qui doit exister pour qu'il soit
   * utilisable dès la première connexion.
   *
   * Sert à la recette de sortie, qui provisionne un établissement jetable et
   * vérifie chaque pièce. Sans ce point d'entrée, la recette devrait interroger
   * la base directement — et cesserait de vérifier ce que l'APPLICATION voit.
   */
  async tenantSocle(slug: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) throw new NotFoundException('École introuvable.');
    const db = this.prisma.forTenant(slug);
    const [roles, categories, circulationRules, classes, collections, accessRules] =
      await Promise.all([
        db.role.count(),
        db.category.count(),
        db.circulationRule.count(),
        db.schoolClass.count(),
        this.prisma.collection.count({ where: { tenantId: tenant.id } }),
        this.prisma.accessRule.count({ where: { tenantId: tenant.id } }),
      ]);
    return { slug, roles, categories, circulationRules, classes, collections, accessRules };
  }

  async listTenants() {
    return this.prisma.tenant.findMany({
      include: { domains: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getTenant(slug: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      include: { settings: true, domains: true },
    });
    if (!tenant) throw new NotFoundException('École introuvable.');
    return tenant;
  }

  /**
   * Synchronise le schéma d'une école existante après un ajout de tables au
   * modèle (nouveau module) : rejoue la DDL de provisioning en ignorant les
   * objets déjà présents. Idempotent, sans transaction (chaque instruction
   * est indépendante) — les données existantes ne sont pas touchées.
   */
  async syncTenantSchema(slug: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) throw new NotFoundException('École introuvable.');

    let applied = 0;
    let skipped = 0;

    // 1) Nouveaux schémas/types/tables/contraintes — pas d'effet sur l'existant.
    for (const statement of buildProvisionStatements(slug)) {
      try {
        await this.prisma.$executeRawUnsafe(statement);
        applied++;
      } catch (error) {
        // Objet déjà existant (schéma/type/table/contrainte) : normal en resynchro.
        skipped++;
        this.logger.debug(
          `sync-schema ${slug} — ignoré : ${(error as Error).message.split('\n')[0]}`,
        );
      }
    }

    // 2) Colonnes ajoutées entre-temps sur des tables DÉJÀ existantes chez
    // cette école — le CREATE TABLE ci-dessus ne les rattrape jamais. Le même
    // passage relâche les contraintes assouplies depuis (voir plus bas).
    const { applied: columnsApplied, skippedEnumColumns } =
      await this.addMissingColumns(slug);
    applied += columnsApplied;
    if (skippedEnumColumns.length > 0) {
      this.logger.warn(
        `sync-schema ${slug} — colonnes enum non synchronisées automatiquement ` +
          `(nécessitent un traitement manuel, comme au provisioning) : ${skippedEnumColumns.join(', ')}`,
      );
    }

    // 3) Rejoue les contraintes FK : une FK posée sur une colonne créée à
    // l'étape 2 a forcément échoué à l'étape 1 (la colonne n'existait pas
    // encore) — un seul passage suffit ainsi au lieu de deux.
    for (const statement of buildProvisionStatements(slug)) {
      if (!statement.includes('ADD CONSTRAINT')) continue;
      try {
        await this.prisma.$executeRawUnsafe(statement);
        applied++;
      } catch {
        // Contrainte déjà présente : normal en resynchro.
      }
    }

    // 4) Index ajoutés au modèle sur des tables DÉJÀ existantes chez cette
    // école (LIKE ... INCLUDING ALL ne les rattrape pas) — audit perf 2026-07-14.
    applied += await this.addMissingIndexes(slug);

    // 5) Valeurs d'enum ajoutées au modèle après provisioning (ex.
    // ItemStatus.MISSING pour le récolement, MarcFormat.GAFESO pour la notice
    // Gafeso) — CREATE TYPE (déjà existant) ne les rattrape jamais.
    applied += await this.addMissingEnumValues(slug);

    // 6) COLLATION FRANÇAISE des colonnes texte (backlog n° 14).
    //
    // 🔴 CE GARDE INTERROGE LA BASE, PAS LE SCHÉMA, et c'est sa raison d'être :
    // Prisma ne modélise pas la collation, donc un `ALTER COLUMN … SET DATA
    // TYPE` futur — écrit pour une autre raison — la PERD en silence. Mesuré
    // sur une base jetable : la migration réussit, l'ordre redevient faux, et
    // rien ne le signale. Un test de source ne verrait que l'intention.
    const { applied: collationsApplied, ecarts } = await this.rattraperCollations(slug);
    applied += collationsApplied;
    if (ecarts.length > 0) {
      this.logger.warn(
        `sync-schema ${slug} — collation rattrapée sur ${ecarts.length} colonne(s) : ` +
          `${ecarts.slice(0, 6).join(', ')}${ecarts.length > 6 ? '…' : ''}`,
      );
    }

    this.logger.log(`sync-schema ${slug} : ${applied} appliqués, ${skipped} déjà présents.`);
    return { slug, applied, skipped, collationsRattrapees: ecarts };
  }

  /**
   * Pose la collation française sur les colonnes déclarées qui ne l'ont pas.
   *
   * ⚠ IL RATTRAPE, IL NE SE CONTENTE PAS DE SIGNALER. Un garde qui signale sans
   * corriger laisse l'écart en place jusqu'à ce que quelqu'un lise le journal —
   * et un ordre alphabétique faux ne se remarque que le jour où un lecteur
   * cherche un titre accentué. `sync-schema` existe précisément pour rattraper
   * ce que les écoles déjà provisionnées n'ont pas reçu.
   */
  private async rattraperCollations(
    slug: string,
  ): Promise<{ applied: number; ecarts: string[] }> {
    const presentes = await this.prisma.$queryRawUnsafe<IntrospectedCollation[]>(
      buildCollationIntrospectionQuery(tenantSchemaName(slug)),
    );
    const { statements, ecarts } = buildCollationStatements(slug, presentes);
    for (const statement of statements) {
      await this.prisma.$executeRawUnsafe(statement);
    }
    return { applied: statements.length, ecarts };
  }

  /** Crée les index attendus (TENANT_INDEXES) absents chez l'école. */
  private async addMissingIndexes(slug: string): Promise<number> {
    const schema = tenantSchemaName(slug);
    const existing = await this.prisma.$queryRawUnsafe<IntrospectedIndex[]>(
      buildIndexIntrospectionQuery(schema),
    );
    const statements = [
      ...buildMissingIndexStatements(slug, existing),
      // Index UNIQUES : dédoublonnage puis création. Séparés des index
      // ordinaires car un index unique échoue si des doublons subsistent —
      // cas des licences hors-ligne, où chaque émission créait une ligne.
      ...buildUniqueIndexStatements(slug),
    ];

    let applied = 0;
    for (const statement of statements) {
      await this.prisma.$executeRawUnsafe(statement);
      applied++;
    }
    return applied;
  }

  /** Ajoute les valeurs d'enum attendues (TENANT_ENUMS) absentes chez l'école. */
  private async addMissingEnumValues(slug: string): Promise<number> {
    const schema = tenantSchemaName(slug);
    const existing = await this.prisma.$queryRawUnsafe<IntrospectedEnumValue[]>(
      buildEnumValueIntrospectionQuery(schema),
    );
    const statements = buildMissingEnumValueStatements(slug, existing);
    let applied = 0;
    for (const statement of statements) {
      await this.prisma.$executeRawUnsafe(statement);
      applied++;
    }
    return applied;
  }

  /** Ajoute les colonnes présentes dans le gabarit `public` mais absentes chez l'école. */
  private async addMissingColumns(
    slug: string,
  ): Promise<{ applied: number; skippedEnumColumns: string[] }> {
    const schema = tenantSchemaName(slug);
    const publicColumns = await this.prisma.$queryRawUnsafe<IntrospectedColumn[]>(
      buildColumnIntrospectionQuery('public'),
    );
    const tenantColumns = await this.prisma.$queryRawUnsafe<IntrospectedColumn[]>(
      buildColumnIntrospectionQuery(schema),
    );

    const { statements, skippedEnumColumns } = buildAddMissingColumnsStatements(
      slug,
      publicColumns,
      tenantColumns,
    );
    // Contraintes RELÂCHÉES depuis le provisioning de l'école (NOT NULL levé,
    // défaut ajouté). `LIKE ... INCLUDING ALL` ne les copie qu'à la création :
    // sans ce rattrapage, une migration qui rend une colonne facultative dans
    // `public` laisse les écoles existantes en NOT NULL. Réutilise les deux
    // introspections ci-dessus — aucune requête supplémentaire.
    statements.push(...buildColumnConstraintStatements(slug, publicColumns, tenantColumns));

    let applied = 0;
    for (const statement of statements) {
      await this.prisma.$executeRawUnsafe(statement);
      applied++;
    }
    return { applied, skippedEnumColumns };
  }

  /**
   * Réindexe le catalogue d'une école dans Meilisearch (reconstruit l'index
   * depuis PostgreSQL — source de vérité). Nécessaire après un provisioning
   * (les notices insérées en base ne sont PAS indexées automatiquement) ou
   * après une perte de l'index (rollback Docker, volume `meili_data` vidé).
   * Protégé par clé API (pas de JWT bibliothécaire requis) — utilisable dès
   * le provisioning, avant qu'aucun compte n'ait de mot de passe défini.
   */
  async reindexTenant(slug: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) throw new NotFoundException('École introuvable.');
    return this.cataloging.reindexAll(this.prisma.forTenant(slug), slug);
  }

  /**
   * Déprovisionne une école : supprime son schéma (CASCADE) et ses lignes dans
   * `public`. Destructif — supprime toutes les données de l'école.
   *
   * ⚠ LA LISTE DES TABLES NETTOYÉES N'EST PAS ÉCRITE ICI : elle est parcourue
   * depuis `LIGNES_PARTAGEES`, que `deprovision-complet.spec.ts` confronte au
   * schéma. Jusqu'au 14 septembre 2026 elle l'était, et elle ne couvrait QUE
   * les trois tables portant une clé étrangère RESTRICT — celles que
   * PostgreSQL refusait de laisser passer. Les cinq autres, que rien ne
   * défendait, restaient en base : collections, règles d'accès, rappels
   * (`recipientEmail`), journal d'audit (`actorEmail`, `ip`).
   *
   * Le compte rendu dit ce qui a été RETIRÉ, table par table : une suppression
   * qui annonce « fait » sans dire quoi ne se vérifie pas.
   */
  async deprovisionTenant(slug: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) throw new NotFoundException('École introuvable.');

    const retire: Record<string, number> = {};
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(buildDeprovisionStatement(slug));
      for (const modele of MODELES_A_SUPPRIMER) {
        const delegue = (
          tx as unknown as Record<string, { deleteMany(a: unknown): Promise<{ count: number }> }>
        )[proprietePrisma(modele)];
        const { count } = await delegue.deleteMany({ where: { tenantId: tenant.id } });
        if (count > 0) retire[modele] = count;
      }
      await tx.tenant.delete({ where: { id: tenant.id } });
    });

    const detail = Object.entries(retire)
      .map(([m, n]) => `${m}=${n}`)
      .join(', ');
    this.logger.log(`École déprovisionnée : ${slug}${detail ? ` — ${detail}` : ''}`);
    return { deprovisioned: true, slug, retire };
  }
}
