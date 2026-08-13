import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { OfflineLicense, Prisma, PrismaClient } from '@prisma/client';
import { AUDIT_ACTIONS } from '../audit/audit.actions';
import { AuditService } from '../audit/audit.service';
import { AuthzService } from '../auth/authz.service';
import { FONCTIONS } from '../auth/functions';
import { JwtPayload } from '../auth/jwt.strategy';
import { AccessControlService } from '../access-control/access-control.service';
import { PrismaService } from '../prisma/prisma.service';
import { ResolvedTenant } from '../tenancy/tenancy.service';
import { unwrapCekWithKek } from './content-crypto';
import { IssueLicenseDto } from './dto/offline.dto';
import { LICENSE_VERSION, LicenseBody, signLicense, wrapCekForDevice } from './license-crypto';
import { OfflineKeysService } from './offline-keys.service';
import { StorageService } from '../storage/storage.service';

export type TenantDb = PrismaClient;
/**
 * `unknown` est DISTINCT de `revoked` — c'est la différence entre « le droit a
 * été retiré » et « je ne sais pas ».
 *
 * Le serveur répondait `revoked` pour une licence qu'il ne connaissait pas.
 * L'appareil, qui purge tout ce qui n'est pas `active`, DÉTRUISAIT alors le
 * document téléchargé. Une restauration de sauvegarde antérieure à l'émission
 * suffisait donc à faire disparaître l'ouvrage d'un étudiant, avec le message
 * « n'est plus accessible » — qui était faux : personne n'avait rien révoqué.
 *
 * Seule une révocation ou une expiration RÉELLE justifie de détruire des
 * données sur l'appareil.
 */
export type LicenseStatus = 'active' | 'revoked' | 'expired' | 'unknown';

/**
 * Émission et cycle de vie des licences hors-ligne. Points durs :
 *  - le DROIT est vérifié (getRecordAccessStatus, réutilisé) AVANT toute
 *    manipulation de CEK — aucune clé ne sort si l'accès est refusé ;
 *  - la CEK est déballée de la KEK serveur puis RÉ-ENVELOPPÉE pour l'appareil
 *    (EC-KEM : ECDH P-256 + HKDF-SHA256 + AES-GCM), et effacée de la mémoire aussitôt ;
 *  - la licence est LIÉE à {user, device, tenant, expires} et signée Ed25519 ;
 *  - `status` rejoue le droit en ligne : un étudiant qui a perdu l'accès (classe
 *    changée, abonnement expiré) voit sa licence passer à `revoked`.
 */
@Injectable()
export class OfflineLicensesService {
  private readonly logger = new Logger(OfflineLicensesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthzService,
    private readonly access: AccessControlService,
    private readonly keys: OfflineKeysService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  /** Droit de lire ce document : personnel (document.lire) ou étudiant ayant droit. */
  private async hasAccess(
    db: TenantDb,
    tenant: ResolvedTenant,
    userId: string,
    recordId: string,
  ): Promise<boolean> {
    const readsAll = await this.authz.hasFunction(db, userId, FONCTIONS.DOCUMENT_LIRE);
    if (readsAll) return true;
    const ctx = await this.access.buildStudentContext(tenant, db, userId);
    return (await this.access.getRecordAccessStatus(ctx, recordId)).granted;
  }

  async issue(
    db: TenantDb,
    tenant: ResolvedTenant,
    user: JwtPayload,
    ip: string | undefined,
    dto: IssueLicenseDto,
  ) {
    // 1) Appareil de l'utilisateur, non révoqué.
    const device = await db.device.findUnique({ where: { id: dto.deviceId } });
    if (!device || device.userId !== user.sub || device.revokedAt) {
      throw new ForbiddenException('Appareil inconnu ou révoqué.');
    }

    // 2) DROIT vérifié AVANT toute CEK.
    if (!(await this.hasAccess(db, tenant, user.sub, dto.docId))) {
      throw new ForbiddenException('Vous n’avez pas accès à ce document.');
    }

    // 3) Exemplaire numérique prêt pour le hors-ligne.
    const copy = await db.digitalCopy.findUnique({ where: { recordId: dto.docId } });
    if (!copy) throw new NotFoundException('Aucun exemplaire numérique pour ce document.');
    if (copy.encStatus !== 'ready' || !copy.encWrappedCek || !copy.encObjectKey) {
      throw new BadRequestException('Document pas encore préparé pour la lecture hors-ligne.');
    }

    // 4) TTL du bail (configurable par tenant, défaut 14 j).
    const settings = await this.prisma.tenantSettings.findUnique({
      where: { tenantId: tenant.id },
      select: { offlineLicenseTtlDays: true },
    });
    const ttlDays = settings?.offlineLicenseTtlDays ?? 14;
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + ttlDays * 86_400_000);

    // 5) CEK : déballée de la KEK serveur, ré-enveloppée pour l'appareil, effacée.
    const cek = unwrapCekWithKek(copy.encWrappedCek, this.keys.contentKek);
    let wrappedForDevice: string;
    let signature: string;
    let body: LicenseBody;
    try {
      // EC-KEM : ECDH éphémère P-256 + HKDF-SHA256 + AES-256-GCM, AAD = deviceId.
      wrappedForDevice = wrapCekForDevice(cek, device.publicKey, device.id);
      body = {
        v: LICENSE_VERSION,
        docId: dto.docId,
        tenant: tenant.slug,
        userId: user.sub,
        deviceId: device.id,
        issuedAt: issuedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        rights: { watermark: true, noPrint: true },
      };
      signature = signLicense(body, this.keys.licensePrivateKey);
    } finally {
      cek.fill(0);
    }

    // 6) Persistance (schéma tenant). UPSERT sur le triplet : réémettre pour le
    // même (utilisateur, appareil, document) PROLONGE la licence existante au
    // lieu d'en créer une seconde.
    //
    // Un `create` simple accumulait une ligne par appui sur « télécharger » —
    // constaté en réel avec 7 licences pour un même document. Révoquer « la »
    // licence n'en révoquait alors qu'une : les doublons restaient actifs et le
    // blob restait téléchargeable, alors que l'administrateur croyait l'accès
    // coupé.
    const license = await db.offlineLicense.upsert({
      where: {
        userId_deviceId_recordId: {
          userId: user.sub,
          deviceId: device.id,
          recordId: dto.docId,
        },
      },
      create: {
        recordId: dto.docId,
        userId: user.sub,
        deviceId: device.id,
        status: 'active',
        issuedAt,
        expiresAt,
        wrappedCek: wrappedForDevice,
        rights: body.rights as Prisma.InputJsonValue,
        signature,
      },
      // Réémission : nouveau bail, nouvelle enveloppe de CEK, nouvelle
      // signature. `revokedAt` est remis à null — le droit vient d'être
      // revérifié en ligne à l'étape 2, une révocation antérieure n'a plus
      // lieu d'être si l'utilisateur y a de nouveau accès.
      update: {
        status: 'active',
        revokedAt: null,
        issuedAt,
        expiresAt,
        wrappedCek: wrappedForDevice,
        rights: body.rights as Prisma.InputJsonValue,
        signature,
      },
    });

    // 7) Audit.
    void this.audit.log({
      tenantId: tenant.id,
      actorId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      action: AUDIT_ACTIONS.OFFLINE_LICENSE_ISSUE,
      targetType: 'offline_license',
      targetId: license.id,
      targetLabel: dto.docId,
      metadata: { deviceId: device.id, expiresAt: expiresAt.toISOString() },
      ip: ip ?? null,
    });

    // 8) Réponse : la licence signée + tout ce qu'il faut pour lire hors-ligne.
    return {
      licenseId: license.id,
      body,
      signature,
      wrappedCek: wrappedForDevice, // pour la clé privée de l'appareil (Keystore)
      encObjectKey: copy.encObjectKey,
      encSegSize: copy.encSegSize,
      encAlgo: copy.encAlgo,
      licensePublicKey: this.keys.licensePublicKeyPem, // pour vérifier la signature
    };
  }

  /**
   * URL signée (temporaire) du BLOB CHIFFRÉ d'une licence, pour téléchargement par l'app.
   * Contrôles : la licence appartient bien à l'appelant, et son statut effectif est `active`
   * (droit rejoué en ligne). Le blob servi est chiffré — sans la CEK enveloppée pour le
   * keystore de l'appareil, il est inexploitable.
   */
  async blobUrl(db: TenantDb, tenant: ResolvedTenant, user: JwtPayload, licenseId: string) {
    const lic = await db.offlineLicense.findUnique({ where: { id: licenseId } });
    if (!lic) throw new NotFoundException('Licence introuvable.');
    if (lic.userId !== user.sub) throw new ForbiddenException('Licence d’un autre utilisateur.');

    const status = await this.effectiveStatus(db, tenant, lic);
    if (status !== 'active') {
      throw new ForbiddenException(`Licence ${status} : téléchargement refusé.`);
    }

    const copy = await db.digitalCopy.findUnique({ where: { recordId: lic.recordId } });
    if (!copy?.encObjectKey) {
      throw new NotFoundException('Blob chiffré introuvable pour ce document.');
    }
    const url = await this.storage.getSignedDownloadUrl(copy.encObjectKey, `${lic.recordId}.gafs`);
    return { url, encSegSize: copy.encSegSize, encAlgo: copy.encAlgo };
  }

  /** Statut effectif : révoqué > expiré > (droit rejoué) > actif. */
  private async effectiveStatus(
    db: TenantDb,
    tenant: ResolvedTenant,
    lic: OfflineLicense,
  ): Promise<LicenseStatus> {
    if (lic.revokedAt || lic.status === 'revoked') return 'revoked';
    if (lic.expiresAt.getTime() < Date.now()) return 'expired';
    // Rejoue le droit EN LIGNE : accès perdu → révocation (étape 6 du brief).
    if (!(await this.hasAccess(db, tenant, lic.userId, lic.recordId))) {
      await db.offlineLicense
        .update({ where: { id: lic.id }, data: { status: 'revoked', revokedAt: new Date() } })
        .catch(() => undefined);
      return 'revoked';
    }
    return 'active';
  }

  /**
   * Statut d'UNE licence de l'appelant.
   *
   * Le contrôle de propriété manquait ici alors que blobUrl() le faisait. Deux
   * conséquences : la fuite du statut de la licence d'autrui, et — plus gênant
   * — un effet de BORD, car effectiveStatus() ÉCRIT (il révoque quand le droit
   * n'est plus là). Une simple lecture non autorisée pouvait donc révoquer la
   * licence d'un autre utilisateur.
   */
  async status(db: TenantDb, tenant: ResolvedTenant, user: JwtPayload, licenseId: string) {
    const lic = await db.offlineLicense.findUnique({ where: { id: licenseId } });
    if (!lic) throw new NotFoundException('Licence introuvable.');
    if (lic.userId !== user.sub) {
      throw new ForbiddenException('Licence d’un autre utilisateur.');
    }
    return { id: lic.id, status: await this.effectiveStatus(db, tenant, lic), expiresAt: lic.expiresAt };
  }

  /**
   * Statuts en lot, pour la synchronisation de l'appareil.
   *
   * La requête est bornée aux licences de L'APPELANT : elle ne peut donc ni
   * révéler l'état de celles d'autrui, ni déclencher leur révocation par effet
   * de bord (effectiveStatus écrit).
   *
   * Une licence appartenant à quelqu'un d'autre ressort en `unknown`, jamais en
   * 403 : cela évite de confirmer son existence, et l'appareil traite `unknown`
   * comme « conserver, redemander plus tard » — donc aucune destruction.
   */
  async entitlements(
    db: TenantDb,
    tenant: ResolvedTenant,
    user: JwtPayload,
    licenseIds: string[],
  ) {
    const licenses = await db.offlineLicense.findMany({
      where: { id: { in: licenseIds }, userId: user.sub },
    });
    const byId = new Map(licenses.map((l) => [l.id, l]));
    return Promise.all(
      licenseIds.map(async (id) => {
        const lic = byId.get(id);
        return lic
          ? { id, status: await this.effectiveStatus(db, tenant, lic), expiresAt: lic.expiresAt }
          : // Inconnue du serveur ≠ révoquée. L'appareil doit CONSERVER et
            // redemander plus tard, jamais purger.
            { id, status: 'unknown' as const, expiresAt: null };
      }),
    );
  }

  /** Révocation explicite (personnel : catalogue.gerer). */
  async revoke(
    db: TenantDb,
    tenant: ResolvedTenant,
    user: JwtPayload,
    ip: string | undefined,
    licenseId: string,
  ) {
    const lic = await db.offlineLicense.findUnique({ where: { id: licenseId } });
    if (!lic) throw new NotFoundException('Licence introuvable.');

    // Révocation par TRIPLET, pas par identifiant de ligne. La contrainte
    // d'unicité garantit désormais une seule licence par triplet, mais des
    // doublons peuvent subsister sur une école pas encore resynchronisée
    // (sync-schema les dédoublonne). Révoquer par triplet est donc la seule
    // formulation qui coupe réellement l'accès dans tous les cas — c'est
    // l'intention de l'administrateur, pas « cette ligne-là ».
    const { count } = await db.offlineLicense.updateMany({
      where: { userId: lic.userId, deviceId: lic.deviceId, recordId: lic.recordId },
      data: { status: 'revoked', revokedAt: new Date() },
    });
    if (count > 1) {
      this.logger.warn(
        `Révocation de ${count} licences en double pour (utilisateur ${lic.userId}, ` +
          `appareil ${lic.deviceId}, document ${lic.recordId}) — ` +
          `resynchronisez le schéma de cette école pour les dédoublonner.`,
      );
    }
    void this.audit.log({
      tenantId: tenant.id,
      actorId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      action: AUDIT_ACTIONS.OFFLINE_LICENSE_REVOKE,
      targetType: 'offline_license',
      targetId: licenseId,
      targetLabel: lic.recordId,
      ip: ip ?? null,
    });
    return { id: licenseId, status: 'revoked' as const };
  }

  /** Documents que l'utilisateur peut lire hors-ligne (prêts + ayant droit). */
  async myDocuments(db: TenantDb, tenant: ResolvedTenant, user: JwtPayload) {
    const copies = await db.digitalCopy.findMany({
      where: { encStatus: 'ready', fileFormat: 'PDF' },
      include: { record: { select: { id: true, title: true } } },
    });
    const readsAll = await this.authz.hasFunction(db, user.sub, FONCTIONS.DOCUMENT_LIRE);
    const ctx = readsAll ? null : await this.access.buildStudentContext(tenant, db, user.sub);

    const out: Array<{ docId: string; title: string; fileFormat: string }> = [];
    for (const copy of copies) {
      const granted =
        readsAll || (await this.access.getRecordAccessStatus(ctx!, copy.recordId)).granted;
      if (granted) {
        out.push({ docId: copy.recordId, title: copy.record.title, fileFormat: copy.fileFormat });
      }
    }
    return out;
  }
}
