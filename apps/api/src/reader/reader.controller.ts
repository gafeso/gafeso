import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentTenant } from '../tenancy/current-tenant.decorator';
import { ResolvedTenant } from '../tenancy/tenancy.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/jwt.strategy';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit.actions';
import { ClientIp } from '../audit/client-ip.decorator';
import { HoldsService } from '../circulation/holds.service';
import { ReaderService, TenantDb } from './reader.service';
import { ReaderLoansQueryDto } from './dto/reader-loans-query.dto';
import { PlaceReaderHoldDto } from './dto/place-reader-hold.dto';
import { PatronsService } from '../patrons/patrons.service';
import { ModuleRequis } from '../modules/module-requis.decorator';
import { ModuleActifGuard } from '../modules/module-actif.guard';
import { RETENTION_NOMINATIVE_MOIS, UsageService } from '../stats/usage.service';

/**
 * Espace lecteur (self-service). Garde : uniquement `JwtAuthGuard` — AUCUNE
 * fonction requise, tout compte connecté y accède. La sécurité repose sur le
 * fait que l'identité du lecteur = le JWT (`user.sub`) et n'est JAMAIS un
 * paramètre : impossible de consulter les prêts d'autrui.
 */
@ApiTags('reader')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ModuleActifGuard)
@Controller('reader')
export class ReaderController {
  constructor(
    private readonly reader: ReaderService,
    private readonly holds: HoldsService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly patrons: PatronsService,
    // ⚠ Le NOMINATIF, et il n'est lu que d'ici : `usage-nominatif-reserve.spec.ts`
    // compte les appelants de `miennes` et exige qu'il n'y en ait qu'un.
    private readonly usage: UsageService,
  ) {}

  private requireTenant(tenant: ResolvedTenant | null): ResolvedTenant {
    if (!tenant) {
      throw new BadRequestException(
        'Tenant non résolu : domaine inconnu ou école non provisionnée.',
      );
    }
    return tenant;
  }

  private db(tenant: ResolvedTenant | null): TenantDb {
    return this.prisma.forTenant(this.requireTenant(tenant).slug);
  }

  /**
   * Ma carte de bibliothèque : le code-barres que la douchette du comptoir lit.
   *
   * CRÉE la carte si le compte n'en a pas encore — c'est le même point de
   * création que la réservation (PatronsService.cardForUser), pas un second
   * chemin. Sans cela, un étudiant qui n'a jamais réservé n'aurait aucun
   * code-barres, et l'écran « ma carte » n'aurait rien à afficher.
   *
   * Le code-barres est celui de l'ADHÉRENT, pas le matricule : c'est lui que
   * `circulation/checkout` attend (`patronBarcode`). Afficher le matricule
   * produirait une carte que le comptoir ne peut pas scanner — et l'échec
   * serait muet : la douchette bipe, rien ne correspond.
   */
  // ═══════════════════════════════════════════════════════════════════════════
  // 🔴 LES SIX ROUTES DE PRÊT ET DE RÉSERVATION SUIVENT LE MODULE `circulation`.
  //
  // ⚠ ROUTE PAR ROUTE, ET NON SUR LA CLASSE — c'est tout le partage de cet
  // espace : « Mes consultations » et « Mes documents hors ligne » doivent
  // RESTER quand il n'y a pas de rayon. Une garde de classe les emporterait, et
  // un étudiant d'université virtuelle se retrouverait avec un espace personnel
  // VIDE — ce qui est précisément ce que le profil numérique corrige.
  //
  // ⚠ Et `card` en fait partie : une carte de lecteur est un code-barres
  // présenté AU COMPTOIR. Sans rayon, il n'y a pas de comptoir.
  // ═══════════════════════════════════════════════════════════════════════════
  @Get('card')
  @ModuleRequis('circulation')
  @ApiOperation({ summary: 'Ma carte de lecteur (code-barres d’adhérent)' })
  async myCard(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
  ) {
    const db = this.db(tenant);
    const patron = await this.patrons.cardForUser(db, user.sub);
    // Le nom vient de la BASE : le JWT ne porte que sub/email/role/tenant.
    const compte = await db.user.findUnique({
      where: { id: user.sub },
      select: { firstName: true, lastName: true, email: true },
    });
    const nom = [compte?.firstName, compte?.lastName]
      .filter((v) => v != null && v.trim() !== '')
      .join(' ');
    return {
      barcode: patron.barcode,
      category: patron.category,
      // Symbologie attendue par la douchette — la MÊME que les étiquettes
      // d'exemplaires (Code 128). Envoyée par le serveur pour que l'appareil
      // n'ait pas à la deviner : une carte rendue dans une autre symbologie
      // serait illisible au comptoir sans que rien ne l'explique.
      symbology: 'code128',
      displayName: nom === '' ? (compte?.email ?? '') : nom,
      expiryDate: patron.expiryDate,
    };
  }

  @Get('loans')
  @ModuleRequis('circulation')
  @ApiOperation({
    summary: 'Mes prêts (en cours + historique paginé) — borné à l’utilisateur connecté',
  })
  async myLoans(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
    @Query() query: ReaderLoansQueryDto,
  ) {
    return this.reader.myLoans(this.db(tenant), user.sub, {
      historyPage: query.historyPage,
      historyLimit: query.historyLimit,
    });
  }

  @Post('loans/:id/renew')
  @ModuleRequis('circulation')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Renouveler MON prêt (self-scopé, politique tenant)',
    description:
      'Le prêt doit appartenir au compte connecté (sinon 404). Refus motivé si ' +
      'désactivé, plafond atteint, en retard, ou document réservé par autrui.',
  })
  async renew(
    @CurrentTenant() tenantOrNull: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @ClientIp() ip?: string,
  ) {
    const tenant = this.requireTenant(tenantOrNull);
    const result = await this.reader.renewLoan(this.db(tenant), tenant.id, user.sub, id);
    void this.audit.log({
      tenantId: tenant.id,
      actorId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      action: AUDIT_ACTIONS.LOAN_RENEW_ONLINE,
      targetType: 'checkout',
      targetId: result.checkoutId,
      targetLabel: result.title,
      ip,
      metadata: { renewals: result.renewals, dueDate: result.dueDate },
    });
    return result;
  }

  // ── Réservations (self-scopées) ─────────────────────────────────────────

  @Get('holds')
  @ModuleRequis('circulation')
  @ApiOperation({ summary: 'Mes réservations (avec position dans la file)' })
  async myHolds(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.holds.myHolds(this.db(tenant), user.sub);
  }

  @Post('holds')
  @ModuleRequis('circulation')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Réserver un document (au nom du compte connecté)',
    description:
      'Si un exemplaire est libre il est mis de côté pour moi, sinon j’entre dans ' +
      'la file d’attente. L’adhérent est le compte connecté, jamais un paramètre.',
  })
  async placeHold(
    @CurrentTenant() tenantOrNull: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
    @Body() dto: PlaceReaderHoldDto,
  ) {
    const tenant = this.requireTenant(tenantOrNull);
    return this.holds.placeHold(this.db(tenant), tenant.id, user.sub, dto.recordId);
  }

  @Post('holds/:id/cancel')
  @ModuleRequis('circulation')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Annuler MA réservation (404 si elle ne m’appartient pas)',
  })
  async cancelHold(
    @CurrentTenant() tenantOrNull: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const tenant = this.requireTenant(tenantOrNull);
    return this.holds.cancelHold(this.db(tenant), tenant.id, user.sub, id);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MON USAGE NUMÉRIQUE — visible par MOI, et par personne d'autre.
  //
  // ⚠ CES DEUX ROUTES NE PRENNENT AUCUN IDENTIFIANT D'UTILISATEUR. L'identité
  // vient du JETON (`user.sub`). C'est la propriété que
  // `usage-nominatif-reserve.spec.ts` garde, et elle se garde par la FORME de
  // l'appel, pas par une permission : une permission s'élargit, un paramètre
  // absent ne s'invente pas.
  // ═══════════════════════════════════════════════════════════════════════════

  @Get('consultations')
  @ApiOperation({
    summary: 'MES consultations en ligne et MES téléchargements',
    description:
      'Réservé à leur propriétaire : l’identité vient du jeton, et aucune route ' +
      'd’administration ne restitue l’historique d’un lecteur nommé. ' +
      '⚠ Les consultations de plus de 12 mois ont perdu leur nom (purge) et ' +
      'n’apparaissent donc plus ici — elles restent comptées dans les agrégats.',
  })
  async mesConsultations(
    @CurrentTenant() tenantOrNull: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
  ) {
    const tenant = this.requireTenant(tenantOrNull);
    const db = this.db(tenant);
    const lignes = await this.usage.miennes(db, user.sub);
    // Le TITRE vient du catalogue : une liste d'identifiants n'est pas une liste.
    const titres = await db.biblioRecord.findMany({
      where: { id: { in: [...new Set(lignes.map((l) => l.recordId))] } },
      select: { id: true, title: true },
    });
    const parId = new Map(titres.map((t) => [t.id, t.title]));
    return {
      consultations: lignes.map((l) => ({
        recordId: l.recordId,
        titre: parId.get(l.recordId) ?? null,
        nature: l.kind,
        quand: l.occurredAt,
      })),
      // ⚠ DIT PLUTÔT QUE DEVINÉ : sans cette ligne, un étudiant dont l'historique
      // s'arrête à 12 mois croirait que le produit a perdu ses données.
      retentionMois: RETENTION_NOMINATIVE_MOIS,
    };
  }

  @Get('hors-ligne')
  @ApiOperation({
    summary: 'MES documents emportés hors ligne (licences en cours)',
    description:
      '⚠ Ce sont les documents DÉLIVRÉS à un appareil, pas des lectures : ce qui ' +
      'se passe hors connexion n’est pas tracé, et ne le sera pas.',
  })
  async mesDocumentsHorsLigne(
    @CurrentTenant() tenantOrNull: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
  ) {
    const tenant = this.requireTenant(tenantOrNull);
    const db = this.db(tenant);
    const baux = await db.offlineLicense.findMany({
      where: { userId: user.sub, expiresAt: { gt: new Date() } },
      orderBy: { expiresAt: 'asc' },
      select: { id: true, recordId: true, deviceId: true, expiresAt: true },
    });
    const titres = await db.biblioRecord.findMany({
      where: { id: { in: [...new Set(baux.map((b) => b.recordId))] } },
      select: { id: true, title: true },
    });
    const parId = new Map(titres.map((t) => [t.id, t.title]));
    return {
      documents: baux.map((b) => ({
        recordId: b.recordId,
        titre: parId.get(b.recordId) ?? null,
        appareilId: b.deviceId,
        expireLe: b.expiresAt,
      })),
    };
  }
}
