import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccountStatus, Prisma, PrismaClient, UserRole } from '@prisma/client';
import { parse } from 'csv-parse/sync';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { foldAccents, sqlFoldExpression } from '../common/accent-folding';
import { currentAcademicYear } from '../enrollment/academic-year';
import { RolesService } from '../roles/roles.service';
import { PatronsService } from '../patrons/patrons.service';
import { MailService } from './mail/mail.service';
import { RegisterDto } from './dto/register.dto';
import { ListAccountsDto } from './dto/list-accounts.dto';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

/** Client Prisma lié au schéma d'un tenant (obtenu via PrismaService.forTenant). */
export type TenantDb = PrismaClient;

const TOKEN_TTL_HOURS = 24;
const TOKEN_BYTES = 32;
const BCRYPT_ROUNDS = 10;

/** Ce qui est RÉELLEMENT arrivé à un envoi d'email. */
export type MailOutcome =
  | { sent: true }
  | { sent: false; reason: 'smtp_absent' | 'smtp_error'; detail?: string };

export interface RegistrationResult {
  userId: string;
  status: AccountStatus;
  /** true si le compte a été activé automatiquement (matricule + email connus). */
  autoActivated: boolean;
  /** Sort de l'email de définition de mot de passe (jamais l'URL elle-même). */
  mail: MailOutcome;
}

/** Ligne rejetée à l'import, avec sa position dans le fichier et le motif (FR). */
export interface ImportRowError {
  line: number; // numéro de ligne dans le fichier (en-tête = ligne 1)
  matricule: string | null;
  reason: string;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: ImportRowError[];
}

/** Validation d'email pragmatique (suffisante pour une liste d'école). */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Plafond de correspondances pré-résolues par la recherche insensible aux
 * accents. Large pour un établissement (le fonds de comptes se compte en
 * milliers), et jamais dépassé en silence : au-delà, un avertissement est
 * journalisé et l'utilisateur est invité à affiner.
 */
const SEARCH_MATCH_CAP = 5000;

@Injectable()
export class AccountsService {
  private readonly logger = new Logger(AccountsService.name);

  constructor(
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly roles: RolesService,
    private readonly patrons: PatronsService,
  ) {}

  // ───────────────────────────────────────────────────────────
  // Import de la liste pré-chargée (CSV → expected_students)
  // ───────────────────────────────────────────────────────────
  /**
   * Importe la liste des étudiants attendus depuis un CSV.
   * Colonnes acceptées (FR ou EN) : matricule, email, firstName|prenom,
   * lastName|nom, className|classe. Upsert par matricule (idempotent).
   *
   * Tolérant aux fichiers réels : chaque ligne fautive est rejetée
   * individuellement avec son numéro et un motif clair (jamais d'échec
   * global). Cas gérés : champs requis manquants, colonnes mal formées
   * (relax_column_count), email invalide, doublon de matricule DANS le
   * fichier (le second ne doit pas écraser silencieusement le premier).
   * Le BOM d'Excel est retiré (bom: true) ; le fichier est attendu en UTF-8.
   */
  async importExpectedStudents(db: TenantDb, csv: string): Promise<ImportResult> {
    let rows: { record: Record<string, string>; info: { lines: number } }[];
    try {
      rows = parse(csv, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true,
        relax_column_count: true,
        info: true,
      }) as { record: Record<string, string>; info: { lines: number } }[];
    } catch (error) {
      // CSV globalement illisible (ex. binaire, guillemets déséquilibrés).
      throw new BadRequestException(
        `Fichier CSV illisible : ${(error as Error).message}. Vérifiez le format et l'encodage (UTF-8).`,
      );
    }

    let imported = 0;
    const errors: ImportRowError[] = [];
    const seenMatricules = new Set<string>();

    for (const { record: row, info } of rows) {
      const line = info.lines;
      const matricule = (row.matricule ?? '').trim();
      const email = (row.email ?? '').trim().toLowerCase();
      const firstName = (row.firstName ?? row.prenom ?? '').trim();
      const lastName = (row.lastName ?? row.nom ?? '').trim();
      const className = (row.className ?? row.classe ?? '').trim();

      const missing: string[] = [];
      if (!matricule) missing.push('matricule');
      if (!email) missing.push('email');
      if (!firstName) missing.push('prénom');
      if (!lastName) missing.push('nom');
      if (!className) missing.push('classe');
      if (missing.length > 0) {
        errors.push({
          line,
          matricule: matricule || null,
          reason: `champ(s) requis manquant(s) : ${missing.join(', ')}`,
        });
        continue;
      }
      if (!EMAIL_RE.test(email)) {
        errors.push({ line, matricule, reason: `email invalide : « ${email} »` });
        continue;
      }
      if (seenMatricules.has(matricule)) {
        errors.push({
          line,
          matricule,
          reason: 'matricule en double dans le fichier (première occurrence conservée)',
        });
        continue;
      }
      seenMatricules.add(matricule);

      await db.expectedStudent.upsert({
        where: { matricule },
        create: { matricule, email, firstName, lastName, className },
        update: { email, firstName, lastName, className },
      });
      imported++;
    }

    this.logger.log(
      `Import expected_students : ${imported} importés, ${errors.length} en erreur.`,
    );
    return { imported, skipped: errors.length, errors };
  }

  // ───────────────────────────────────────────────────────────
  // Liste des comptes (gestion)
  // ───────────────────────────────────────────────────────────
  /**
   * Liste paginée des comptes de l'école, filtrable par statut et recherche.
   * Fournit aussi le compteur par statut (utile pour la file d'attente).
   */
  async listAccounts(db: TenantDb, query: ListAccountsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const term = query.q?.trim();

    // RECHERCHE INSENSIBLE AUX ACCENTS. `contains` + `mode: 'insensitive'`
    // ignore la casse mais pas les diacritiques : « ouedraogo » ne trouvait
    // pas « Ouédraogo », ni « traore » → « Traoré ». Sur un fonds sahélien,
    // c'est la majorité des patronymes — la recherche était donc inutilisable
    // sans reproduire les accents au clavier.
    //
    // Prisma ne sait pas appeler translate() dans un `where`. On pré-résout
    // donc les identifiants en SQL, puis on les réinjecte dans la requête
    // Prisma — la pagination et le comptage par statut restent inchangés.
    //
    // `users` n'est PAS qualifié par un schéma : le client tenant porte
    // `?schema=tenant_<slug>` dans son URL, donc son `search_path` vise déjà
    // la bonne école (voir PrismaService.forTenant). Le SQL brut emprunte la
    // même connexion. Un test vérifie ce point : s'il cessait d'être vrai, la
    // requête taperait dans `public` et ferait fuiter des comptes entre écoles.
    let matchedIds: string[] | null = null;
    if (term) {
      const haystack = sqlFoldExpression(
        `coalesce("email",'') || ' ' || coalesce("first_name",'') || ' ' || ` +
          `coalesce("last_name",'') || ' ' || coalesce("matricule",'')`,
      );
      const rows = await db.$queryRawUnsafe<{ id: string }[]>(
        `SELECT "id" FROM "users" WHERE ${haystack} LIKE $1 LIMIT ${SEARCH_MATCH_CAP + 1}`,
        `%${foldAccents(term)}%`,
      );
      if (rows.length > SEARCH_MATCH_CAP) {
        // Jamais de troncature silencieuse : on le dit, plutôt que de laisser
        // croire que le fonds ne contient que ces comptes-là.
        this.logger.warn(
          `Recherche de comptes « ${term} » : plus de ${SEARCH_MATCH_CAP} correspondances, ` +
            `résultats tronqués — affinez le terme.`,
        );
      }
      matchedIds = rows.slice(0, SEARCH_MATCH_CAP).map((r) => r.id);
    }

    const where: Prisma.UserWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(matchedIds ? { id: { in: matchedIds } } : {}),
    };

    const [total, users, grouped] = await Promise.all([
      db.user.count({ where }),
      db.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          matricule: true,
          firstName: true,
          lastName: true,
          role: true,
          roleId: true,
          status: true,
          className: true,
          createdAt: true,
          activatedAt: true,
        },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.user.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);

    const counts = Object.fromEntries(
      grouped.map((g) => [g.status, g._count._all]),
    ) as Record<AccountStatus, number>;

    // MIGRATION DOUCE : des comptes portent encore une classe saisie en texte
    // libre du temps où /admin/comptes l'écrivait directement. On ne touche
    // à RIEN (aucune perte, aucun rattachement deviné) mais on signale celles
    // qui ne correspondent à aucune classe : ce sont exactement celles dont
    // les règles d'accès ne pourront jamais correspondre. L'interface les
    // affiche « non résolue » avec un renvoi vers l'inscription.
    const names = [...new Set(users.map((u) => u.className).filter((n): n is string => !!n))];
    const known = new Set(
      names.length === 0
        ? []
        : (
            await db.schoolClass.findMany({
              where: { name: { in: names } },
              select: { name: true },
            })
          ).map((c) => c.name),
    );
    const withResolution = users.map((u) => ({
      ...u,
      classResolved: u.className === null ? null : known.has(u.className),
    }));

    return {
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
      counts,
      users: withResolution,
    };
  }

  // ───────────────────────────────────────────────────────────
  // Création de compte — LES 2 CHEMINS
  // ───────────────────────────────────────────────────────────
  /**
   * Inscription publique — deux profils :
   * - ÉTUDIANT (matricule fourni) : matricule + email présents dans
   *   expected_students → statut ACTIVE (activation automatique) + envoi du
   *   lien de définition de mot de passe ; sinon PENDING + notification des
   *   gestionnaires.
   * - PERSONNEL / AUTRE (sans matricule) : TOUJOURS PENDING — jamais
   *   d'auto-activation, le rôle est choisi par l'activateur au moment de
   *   l'activation (l'inscrit ne choisit jamais son rôle). En attendant, le
   *   compte porte l'enum STUDENT (aucune fonction).
   *
   * Les emails partent APRÈS la transaction : un serveur mail lent ou en panne
   * ne bloque ni n'annule jamais la création du compte.
   */
  async register(db: TenantDb, dto: RegisterDto): Promise<RegistrationResult> {
    const email = dto.email.trim().toLowerCase();
    const matricule = dto.matricule?.trim() || null;
    const className = dto.className?.trim() || null;
    if (matricule && !className) {
      throw new BadRequestException(
        'Classe requise pour une inscription étudiante (matricule fourni).',
      );
    }

    // Unicité : pas deux comptes pour le même email (ni le même matricule).
    const existing = await db.user.findFirst({
      where: {
        OR: [{ email }, ...(matricule ? [{ matricule }] : [])],
      },
    });
    if (existing) {
      throw new ConflictException(
        'Un compte existe déjà pour cet email ou ce matricule.',
      );
    }

    // Auto-activation possible UNIQUEMENT via le chemin matricule étudiant.
    const expected = matricule
      ? await db.expectedStudent.findUnique({ where: { matricule } })
      : null;
    const matched =
      expected !== null && expected.email.trim().toLowerCase() === email;

    // La classe déclarée à l'inscription doit correspondre à une classe RÉELLE :
    // elle va produire une inscription, pas une étiquette libre. Un nom inconnu
    // est refusé ici plutôt que d'être recopié tel quel dans `users.class_name`,
    // où il aurait fait échouer les règles d'accès sans explication.
    const schoolClass = className
      ? await db.schoolClass.findUnique({ where: { name: className } })
      : null;
    if (className && !schoolClass) {
      throw new BadRequestException(
        `Classe « ${className} » inconnue. Choisissez une classe existante.`,
      );
    }

    const academicYear = currentAcademicYear();

    const { user, setPasswordUrl } = await db.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          matricule,
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          // Reflet de l'inscription créée juste après, dans la MÊME transaction :
          // les deux ne peuvent pas diverger.
          className: schoolClass ? schoolClass.name : null,
          role: UserRole.STUDENT,
          status: matched ? AccountStatus.ACTIVE : AccountStatus.PENDING,
          activatedAt: matched ? new Date() : null,
        },
      });

      if (schoolClass) {
        await tx.enrollment.create({
          data: {
            userId: created.id,
            classId: schoolClass.id,
            academicYear,
          },
        });
      }

      let url: string | null = null;
      if (matched && expected) {
        await tx.expectedStudent.update({
          where: { id: expected.id },
          data: { claimed: true },
        });
        url = await this.createPasswordToken(tx, created.id);
      }
      return { user: created, setPasswordUrl: url };
    });

    // Envois post-transaction (tolérants aux pannes SMTP).
    let mail: MailOutcome = { sent: true };
    if (matched && setPasswordUrl) {
      mail = await this.sendSetPasswordSafely(user.email, setPasswordUrl);
    } else {
      await this.notifyManagersSafely(db, user.email, matricule);
    }

    return {
      userId: user.id,
      status: user.status,
      autoActivated: matched,
      // Ce qui est RÉELLEMENT arrivé à l'email : l'interface doit pouvoir dire
      // la vérité, et proposer le lien quand l'envoi n'a pas abouti.
      mail,
    };
  }

  // ───────────────────────────────────────────────────────────
  // Comptes du personnel (admin)
  // ───────────────────────────────────────────────────────────
  /**
   * Crée un compte du personnel (bibliothécaire, gestionnaire, admin…) déjà
   * ACTIVE et lui envoie le lien de définition de mot de passe. Comme pour les
   * étudiants, aucun mot de passe n'est jamais transmis : seulement un lien.
   */
  async createStaff(db: TenantDb, dto: CreateStaffDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('Un compte existe déjà pour cet email.');
    }

    const { user, setPasswordUrl } = await db.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          role: dto.role,
          status: AccountStatus.ACTIVE,
          activatedAt: new Date(),
        },
      });
      const url = await this.createPasswordToken(tx, created.id);
      return { user: created, setPasswordUrl: url };
    });

    const mail = await this.sendSetPasswordSafely(user.email, setPasswordUrl);
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      status: user.status,
      mail,
    };
  }

  /**
   * Modifie les informations d'un compte existant (prénom, nom, email,
   * classe, rôle). Le mot de passe n'est JAMAIS modifiable ici — toujours
   * via le lien sécurisé (voir setPassword) ; changer son propre mot de
   * passe avec l'ancien est une brique séparée (« Mon compte »). Le rôle
   * suit exactement la même logique que l'assignation dédiée
   * (RolesService.buildAssignmentPatch) — endpoint gardé par comptes.gerer
   * dans son ensemble, pas de garde supplémentaire nécessaire ici (à
   * l'inverse de l'activation, il n'existe aucun chemin plus faiblement
   * privilégié vers cet endpoint qu'il faudrait empêcher de poser un rôle).
   */
  async update(db: TenantDb, userId: string, dto: UpdateAccountDto) {
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Compte introuvable.');

    const data: Prisma.UserUpdateInput = {};
    if (dto.firstName !== undefined) data.firstName = dto.firstName.trim();
    if (dto.lastName !== undefined) data.lastName = dto.lastName.trim();
    if (dto.email !== undefined) data.email = dto.email.trim().toLowerCase();
    // Pas de `className` ici : la classe se change en inscrivant l'étudiant
    // (POST /enrollment/enroll), seul chemin qui met à jour inscription ET
    // reflet dans la même transaction. Voir update-account.dto.ts.
    if (dto.roleId !== undefined) {
      Object.assign(data, await this.roles.buildAssignmentPatch(db, dto.roleId));
    }

    try {
      const updated = await db.user.update({
        where: { id: userId },
        data,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          className: true,
          role: true,
          roleId: true,
          status: true,
        },
      });
      return updated;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Cet email est déjà utilisé par un autre compte.');
      }
      throw error;
    }
  }

  /** Suspend ou réactive un compte (statut posé manuellement, hors PENDING). */
  async setStatus(db: TenantDb, userId: string, status: AccountStatus) {
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Compte introuvable.');
    const updated = await db.user.update({
      where: { id: userId },
      data: { status },
    });
    return { id: updated.id, status: updated.status };
  }

  /**
   * Supprime définitivement un compte (utile notamment pour les comptes de
   * test — email/matricule libérés pour une recréation). L'historique
   * d'inscriptions et le jeton de mot de passe éventuel sont supprimés avec
   * le compte (aucune valeur propre une fois le compte parti). Si un
   * adhérent est lié, réutilise LA MÊME garde que la suppression directe
   * d'un adhérent (PatronsService.deletePatron) : refuse proprement, sans
   * rien supprimer, s'il a des prêts en cours ou des réservations actives —
   * un compte de test sans historique de prêt se supprime sans problème.
   */
  async remove(db: TenantDb, userId: string) {
    const user = await db.user.findUnique({
      where: { id: userId },
      include: { patron: true },
    });
    if (!user) throw new NotFoundException('Compte introuvable.');

    if (user.patron) {
      // Lève ConflictException (prêts/réservations actifs) avant que quoi
      // que ce soit d'autre ne soit touché — abandon net, rien de partiel.
      await this.patrons.deletePatron(db, user.patron.id);
    }

    await db.$transaction(async (tx) => {
      await tx.passwordToken.deleteMany({ where: { userId } });
      await tx.enrollment.deleteMany({ where: { userId } });
      await tx.user.delete({ where: { id: userId } });
    });

    return { deleted: true };
  }

  // ───────────────────────────────────────────────────────────
  // Activation manuelle (gestionnaire)
  // ───────────────────────────────────────────────────────────
  /**
   * Active un compte PENDING. Une fois ACTIVE, envoie le lien de définition
   * de mot de passe (comme pour l'activation automatique). `roleId` optionnel :
   * l'activateur choisit le rôle À CE MOMENT (jamais l'inscrit) — le contrôle
   * d'escalade (fonction comptes.gerer requise pour poser un rôle) est fait
   * par le contrôleur avant l'appel.
   */
  async activateAccount(
    db: TenantDb,
    userId: string,
    roleId?: string,
  ): Promise<{ userId: string; status: AccountStatus; mail: MailOutcome }> {
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Compte introuvable.');
    }
    if (user.status === AccountStatus.ACTIVE) {
      throw new BadRequestException('Ce compte est déjà actif.');
    }

    // Valide le rôle (404 si inconnu) AVANT d'activer quoi que ce soit.
    const rolePatch = roleId
      ? await this.roles.buildAssignmentPatch(db, roleId)
      : {};

    const { updated, setPasswordUrl } = await db.$transaction(async (tx) => {
      const activated = await tx.user.update({
        where: { id: userId },
        data: {
          status: AccountStatus.ACTIVE,
          activatedAt: new Date(),
          ...rolePatch,
        },
      });
      const url = await this.createPasswordToken(tx, activated.id);
      return { updated: activated, setPasswordUrl: url };
    });

    const mail = await this.sendSetPasswordSafely(updated.email, setPasswordUrl);
    return { userId: updated.id, status: updated.status, mail };
  }

  // ───────────────────────────────────────────────────────────
  // Définition du mot de passe via le lien sécurisé
  // ───────────────────────────────────────────────────────────
  /**
   * Définit le mot de passe de l'utilisateur à partir d'un token valide
   * (existant, non utilisé, non expiré). Le mot de passe est haché (bcrypt) ;
   * le token est ensuite invalidé (usage unique).
   */
  async setPassword(
    db: TenantDb,
    token: string,
    plainPassword: string,
  ): Promise<{ userId: string }> {
    const record = await db.passwordToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!record || record.used || record.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Lien invalide ou expiré.');
    }

    const hash = await bcrypt.hash(plainPassword, BCRYPT_ROUNDS);

    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: record.userId },
        data: { password: hash },
      });
      await tx.passwordToken.update({
        where: { id: record.id },
        data: { used: true },
      });
    });

    return { userId: record.userId };
  }

  // ───────────────────────────────────────────────────────────
  // Helpers — jeton dans la transaction, emails après
  // ───────────────────────────────────────────────────────────
  /** Crée le jeton 24 h (usage unique) et retourne l'URL de définition. */
  private async createPasswordToken(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<string> {
    const token = randomBytes(TOKEN_BYTES).toString('hex');
    const expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 3600 * 1000);
    await tx.passwordToken.create({ data: { userId, token, expiresAt } });

    const baseUrl = this.config.get<string>('APP_URL') ?? 'http://localhost:3000';
    return `${baseUrl}/definir-mot-de-passe?token=${token}`;
  }

  /**
   * Envoie le lien de définition de mot de passe et RETOURNE ce qui s'est
   * réellement passé.
   *
   * Auparavant cette méthode retournait `void` : l'échec était journalisé puis
   * perdu. L'appelant — donc l'API, donc l'interface — ne pouvait PAS savoir si
   * le mail était parti, et affichait « un email a été envoyé » dans tous les
   * cas. Un administrateur dont le SMTP échoue ne pouvait activer personne, et
   * ne comprenait pas pourquoi. L'information n'existait tout simplement pas au
   * niveau où l'écran décide quoi dire.
   *
   * L'échec ne fait TOUJOURS pas échouer l'opération métier : le compte est
   * créé, le lien existe en base, il reste récupérable (voir passwordLink()).
   */
  private async sendSetPasswordSafely(email: string, url: string): Promise<MailOutcome> {
    if (!this.mail.available) {
      return { sent: false, reason: 'smtp_absent' };
    }
    try {
      await this.mail.sendSetPasswordLink(email, url);
      return { sent: true };
    } catch (error) {
      const message = (error as Error).message;
      // Le message d'erreur SMTP est conservé (diagnostic), JAMAIS l'URL.
      this.logger.warn(`Envoi du lien de mot de passe à ${email} échoué : ${message}`);
      return { sent: false, reason: 'smtp_error', detail: message };
    }
  }

  /**
   * Lien de définition de mot de passe encore VALIDE d'un compte, à la demande.
   *
   * C'est le repli lorsque l'email ne part pas (SMTP absent ou en panne) :
   * sans lui, l'administrateur n'a aucun moyen d'activer un lecteur — le lien
   * n'existait que dans les logs du serveur, hors de sa portée.
   *
   * SURFACE DE SÉCURITÉ ASSUMÉE : ce lien permet de prendre la main sur le
   * compte. Il est donc réservé à qui peut déjà gérer les comptes (le garde
   * `comptes.gerer` est posé par le contrôleur), servi À LA DEMANDE (jamais
   * dans une liste), et sa consultation est TRACÉE nominativement dans le
   * journal d'audit. Le jeton n'est ni journalisé ni recopié ailleurs : il ne
   * vit qu'en base et dans cette réponse.
   */
  async passwordLink(db: TenantDb, userId: string) {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });
    if (!user) throw new NotFoundException('Compte introuvable.');

    const token = await db.passwordToken.findFirst({
      where: { userId, used: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: { token: true, expiresAt: true },
    });
    if (!token) {
      throw new NotFoundException(
        'Aucun lien valide pour ce compte. Un lien est créé à l’activation ' +
          'ou à la création du compte, et expire au bout de 24 h.',
      );
    }

    const baseUrl = this.config.get<string>('APP_URL') ?? 'http://localhost:3000';
    return {
      email: user.email,
      url: `${baseUrl}/definir-mot-de-passe?token=${token.token}`,
      expiresAt: token.expiresAt,
    };
  }

  /** Notifie les gestionnaires actifs de l'école (rôle MANAGER). */
  private async notifyManagersSafely(
    db: TenantDb,
    accountEmail: string,
    matricule: string | null,
  ): Promise<void> {
    try {
      const managers = await db.user.findMany({
        where: { role: UserRole.MANAGER, status: AccountStatus.ACTIVE },
        select: { email: true },
      });
      await this.mail.notifyManagerPendingAccount(
        managers.map((manager) => manager.email),
        accountEmail,
        matricule,
      );
    } catch (error) {
      this.logger.warn(
        `Notification des gestionnaires échouée (${matricule ?? accountEmail}) : ${(error as Error).message}`,
      );
    }
  }
}
