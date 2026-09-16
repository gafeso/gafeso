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
import { sousEmbargo } from '../access-control/access-control.matching';
import { denialMessage } from '../access-control/access-control.service';
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
/**
 * Droit d'emport hors ligne : accordé, ou refusé AVEC SON MOTIF.
 *
 * ⚠ UNION DISCRIMINÉE, PAS UN BOOLÉEN, et c'est délibéré : un booléen laisse
 * l'appelant inventer la raison, et c'est exactement ce qui s'est produit.
 * Le type oblige désormais chaque site à traiter les deux cas.
 */
type AccesHorsLigne =
  | { accorde: true }
  | { accorde: false; motif: 'droit'; message: string }
  | { accorde: false; motif: 'embargo'; jusquAu: Date; personnel: boolean };

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

  /**
   * Droit d'emporter ce document HORS LIGNE — et le MOTIF quand il est refusé.
   *
   * ⚠ ELLE RENDAIT UN BOOLÉEN, et c'était le défaut : un embargo et un droit
   * manquant sortaient tous deux `false`, l'appelant levait « Vous n'avez pas
   * accès à ce document », et **aucun client ne pouvait les séparer puisque le
   * serveur les confondait lui-même**.
   *
   * Ce que ça coûtait au lecteur — et c'est la formule de Jean :
   * **un lecteur sous embargo n'a rien à demander, seulement à attendre, et on
   * lui disait le contraire.** Il allait réclamer un droit qu'il avait déjà.
   *
   * ⚠ L'EMBARGO S'APPLIQUE À TOUT LE MONDE ICI, PERSONNEL COMPRIS — et c'est
   * la seule surface où le contournement `document.lire` est écarté.
   *
   * Lire une thèse sous embargo EN LIGNE est le métier d'un bibliothécaire :
   * il la catalogue, il vérifie que le fichier est le bon. L'emporter HORS
   * LIGNE est autre chose — le téléphone garde le blob ET la clé pour toute
   * la durée du bail, et une licence émise ne se rappelle pas. C'est
   * exactement le cas irrattrapable que l'embargo existe pour empêcher.
   *
   * ⚠ L'ORDRE A CHANGÉ, ET MA PREMIÈRE JUSTIFICATION ÉTAIT FAUSSE. J'avais
   * écrit que le droit passe devant « pour qu'un étudiant sans droit ne
   * s'entende pas dire d'attendre ». Cet effet ne se produit pas :
   * `getRecordAccessStatus` évalue l'embargo AVANT les règles, DÉLIBÉRÉMENT —
   * son commentaire le dit, « évaluer la classe d'abord produirait "réservé
   * aux M2" pour une thèse que même un M2 ne peut pas lire, un refus exact et
   * trompeur ». Un étudiant sous embargo reçoit donc toujours le message
   * d'embargo, et c'est le bon.
   *
   * La VRAIE raison de l'ordre est plus étroite : le personnel ne passe pas
   * par `getRecordAccessStatus` du tout. Sans ce passage en premier, on ne
   * saurait pas, au moment de composer le refus, si l'on parle à quelqu'un qui
   * peut lire en ligne ou non. L'issue est inchangée dans tous les cas : les
   * deux conditions refusent.
   */
  private async droitHorsLigne(
    db: TenantDb,
    tenant: ResolvedTenant,
    userId: string,
    recordId: string,
  ): Promise<AccesHorsLigne> {
    const personnel = await this.authz.hasFunction(db, userId, FONCTIONS.DOCUMENT_LIRE);
    if (!personnel) {
      const ctx = await this.access.buildStudentContext(tenant, db, userId);
      const statut = await this.access.getRecordAccessStatus(db, ctx, recordId);
      // ⚠ LE MESSAGE VIENT DE LA LECTURE EN LIGNE, il n'est pas recomposé ici :
      // `getRecordAccessStatus` le rend déjà, embargo compris.
      if (!statut.granted) return { accorde: false, motif: 'droit', message: statut.message };
    }

    const notice = await db.biblioRecord.findUnique({
      where: { id: recordId },
      select: { embargoUntil: true },
    });
    const jusquAu = notice?.embargoUntil ?? null;
    if (sousEmbargo(jusquAu, new Date())) {
      return { accorde: false, motif: 'embargo', jusquAu: jusquAu as Date, personnel };
    }
    return { accorde: true };
  }

  /**
   * Le refus, dit à celui qui le reçoit.
   *
   * ⚠ DEUX PHRASES POUR L'EMBARGO, ET CE N'EST PAS UN ORNEMENT. Un ÉTUDIANT
   * sous embargo n'a pas accès en ligne non plus : le message de la lecture en
   * ligne s'applique tel quel, et il est RÉUTILISÉ. Un BIBLIOTHÉCAIRE, lui,
   * peut lire en ligne — lui dire « la description reste consultable » serait
   * un nouveau faux, plus petit mais de même nature que celui qu'on corrige.
   */
  private messageDuRefus(refus: Exclude<AccesHorsLigne, { accorde: true }>): string {
    if (refus.motif === 'droit') return refus.message;
    // ⚠ AUJOURD'HUI, `motif: 'embargo'` NE CONCERNE QUE LE PERSONNEL, et c'est
    // mesuré : un étudiant est arrêté plus haut par `getRecordAccessStatus`,
    // qui décide l'embargo avant les règles et rend déjà le bon message. La
    // branche ci-dessous est donc la seule empruntée.
    //
    // ⚠ LE REPLI ÉTUDIANT EST GARDÉ EXPRÈS, et il est nommé plutôt que tu.
    // Si quelqu'un déplaçait un jour le contrôle d'embargo hors de
    // `getRecordAccessStatus`, cette branche deviendrait atteignable — et sans
    // elle, un étudiant recevrait le message du PERSONNEL, qui lui promet une
    // lecture en ligne qu'il n'a pas. Un repli mort et juste vaut mieux qu'un
    // repli absent et faux.
    if (refus.personnel) {
      return (
        `Ce document est sous embargo jusqu'au ` +
        `${refus.jusquAu.toLocaleDateString('fr-FR')}. ` +
        `La lecture EN LIGNE reste possible ; l'emport hors ligne ne l'est pas, ` +
        `parce qu'une licence déjà sur un téléphone ne se rappelle pas.`
      );
    }
    return denialMessage({ code: 'EMBARGO', embargoUntil: refus.jusquAu });
  }

  /**
   * Pourquoi ce document n'est pas emportable — état de la PRÉPARATION.
   *
   * ⚠ UNE SEULE PHRASE COUVRAIT QUATRE ÉTATS : « Document pas encore préparé
   * pour la lecture hors-ligne. » Pour `failed`, « pas encore » est FAUX —
   * l'ingestion a échoué, `encError` porte le motif, et **aucune attente n'y
   * changera rien**. Le lecteur était invité à revenir demain sur un document
   * qui ne serait jamais prêt sans intervention.
   *
   * ⚠ Même famille que le refus d'accès qu'on vient de dédoubler : un message
   * qui fait AGIR DANS LA MAUVAISE DIRECTION. Ici il fait patienter au lieu de
   * faire signaler.
   *
   * ⚠ QUATRE ÉTATS, PAS DEUX — et le quatrième est le plus fréquent
   * aujourd'hui. Le vocabulaire déclaré est `pending | ready | failed`, mais
   * la colonne est NULLABLE et vaut `null` quand l'ingestion n'a jamais été
   * TENTÉE : c'est le cas de 154 des 155 copies de l'école de démonstration au
   * 16 septembre 2026, et de tout EPUB par construction. Dire « en cours de
   * préparation » y serait exactement le même faux, un état plus loin.
   *
   * ⚠ `encError` n'est JAMAIS montré au lecteur : « xref irréparable » ne lui
   * apprend rien et nomme notre tuyauterie. Il reste au serveur, où la
   * bibliothécaire le trouvera.
   */
  private messagePreparation(etat: string | null, format: string): string {
    if (etat === 'failed') {
      return (
        'La préparation de ce document pour la lecture hors connexion a échoué. ' +
        'Signalez-le à votre bibliothèque : une nouvelle tentative est nécessaire.'
      );
    }
    if (etat === 'pending') {
      return 'Ce document est en cours de préparation pour la lecture hors connexion. Réessayez dans un moment.';
    }
    // ⚠ `null` — jamais tenté. Deux causes, et elles ne se disent pas pareil.
    if (format !== 'PDF') {
      return (
        `Ce document est au format ${format} : il se lit EN LIGNE, ` +
        'et la lecture hors connexion ne couvre que le PDF.'
      );
    }
    return (
      'Ce document n’a pas été préparé pour la lecture hors connexion. ' +
      'Signalez-le à votre bibliothèque : attendre n’y changera rien.'
    );
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
    const droit = await this.droitHorsLigne(db, tenant, user.sub, dto.docId);
    if (!droit.accorde) {
      // ⚠ LE REFUS NOMME SA CAUSE. « Vous n'avez pas accès à ce document »
      // était vrai et inutilisable : le lecteur ne savait pas s'il devait
      // demander un droit ou attendre une date.
      throw new ForbiddenException(this.messageDuRefus(droit));
    }

    // 3) Exemplaire numérique prêt pour le hors-ligne.
    const copy = await db.digitalCopy.findUnique({ where: { recordId: dto.docId } });
    if (!copy) throw new NotFoundException('Aucun exemplaire numérique pour ce document.');
    if (copy.encStatus !== 'ready' || !copy.encWrappedCek || !copy.encObjectKey) {
      throw new BadRequestException(this.messagePreparation(copy.encStatus, copy.fileFormat));
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
    // ⚠ LE REJEU RÉVOQUE POUR LES DEUX MOTIFS, ET C'EST INCHANGÉ. Un embargo
    // posé APRÈS l'émission révoque le bail : le blob et la clé sont déjà sur
    // le téléphone, et la révocation est le seul levier qui reste. C'est
    // cohérent avec la décision « l'emport hors ligne est écarté sous
    // embargo ».
    //
    // ⚠ Et ce n'est pas un cul-de-sac, vérifié : `issue` ne refuse pas sur une
    // licence révoquée. La levée de l'embargo rend le droit, et une nouvelle
    // licence s'émet. Le lecteur doit re-télécharger, il ne perd pas l'accès.
    const rejeu = await this.droitHorsLigne(db, tenant, lic.userId, lic.recordId);
    if (!rejeu.accorde) {
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

  /**
   * Documents que l'utilisateur peut emporter hors ligne.
   *
   * ⚠ ELLE RÉIMPLÉMENTAIT LA DÉCISION au lieu de l'appeler — `readsAll ||
   * getRecordAccessStatus(...)`, la même chose que `droitHorsLigne` à un
   * contrôle près : **l'embargo**. Conséquence : une notice sous embargo
   * apparaissait dans l'étagère, avec son bouton, et le téléchargement était
   * refusé un écran plus loin.
   *
   * ⚠ C'est la promesse non tenue que le mobile vient de retirer de la fiche,
   * REPRODUITE ICI — et côté serveur, donc aucun client ne pouvait la
   * corriger. Le remède n'est pas d'ajouter le contrôle qui manque : c'est
   * d'appeler la seule décision qui existe, pour qu'un troisième chemin ne
   * puisse pas diverger à son tour.
   *
   * ⚠ CE QUE ÇA COÛTE, dit plutôt que tu : `droitHorsLigne` lit l'embargo par
   * notice, donc une requête de plus par document listé. La méthode en faisait
   * déjà une par document (`getRecordAccessStatus`) ; l'étagère ne liste que
   * les copies PRÊTES d'un seul lecteur, et il y en avait UNE sur l'école de
   * démonstration au 16 septembre. Le jour où ce compte grandit, c'est le
   * chargement groupé de l'embargo qu'il faudra écrire — pas un second chemin
   * de décision.
   */
  async myDocuments(db: TenantDb, tenant: ResolvedTenant, user: JwtPayload) {
    const copies = await db.digitalCopy.findMany({
      where: { encStatus: 'ready', fileFormat: 'PDF' },
      include: { record: { select: { id: true, title: true } } },
    });

    const out: Array<{ docId: string; title: string; fileFormat: string }> = [];
    for (const copy of copies) {
      const droit = await this.droitHorsLigne(db, tenant, user.sub, copy.recordId);
      if (droit.accorde) {
        out.push({ docId: copy.recordId, title: copy.record.title, fileFormat: copy.fileFormat });
      }
    }
    return out;
  }
}
