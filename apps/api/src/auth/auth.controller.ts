import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentTenant } from '../tenancy/current-tenant.decorator';
import { ResolvedTenant } from '../tenancy/tenancy.service';
import { FONCTIONS } from './functions';
import { AuthService, TenantDb } from './auth.service';
import { AuthzService } from './authz.service';
import { TwoFactorService } from './two-factor.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';
import { JwtPayload } from './jwt.strategy';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import {
  TwoFactorBackupCodesDto,
  TwoFactorDisableDto,
  TwoFactorEnableDto,
  TwoFactorLoginDto,
  TwoFactorSetupDto,
  TwoFactorTokenDto,
} from './dto/two-factor.dto';
import { clearSessionCookie, setSessionCookie, tokenFromCookieHeader } from './session-cookie';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit.actions';
import { ClientIp } from '../audit/client-ip.decorator';

/** Charge utile d'un jeton d'étape 2FA (défi de login ou enrôlement forcé). */
interface StagePayload extends JwtPayload {
  stage: 'twofactor' | 'enroll';
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly authz: AuthzService,
    private readonly twoFactor: TwoFactorService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly jwt: JwtService,
  ) {}

  private get cookieSecure(): boolean {
    return this.config.get<string>('NODE_ENV') === 'production';
  }

  private requireTenant(tenant: ResolvedTenant | null): ResolvedTenant {
    if (!tenant) {
      throw new BadRequestException(
        'Tenant non résolu : domaine inconnu ou école non provisionnée.',
      );
    }
    return tenant;
  }

  /** Jeton d'étape court (défi 2FA / enrôlement) — n'est PAS une session. */
  private signStageToken(sub: string, tenantSlug: string, stage: StagePayload['stage']) {
    return this.jwt.signAsync(
      { sub, tenant: tenantSlug, stage } as StagePayload,
      { expiresIn: '10m' },
    );
  }

  /** Vérifie un jeton d'étape (stage + tenant) et renvoie l'id utilisateur. */
  private verifyStageToken(token: string, expected: StagePayload['stage'], tenantSlug: string): string {
    let payload: StagePayload;
    try {
      payload = this.jwt.verify<StagePayload>(token);
    } catch {
      throw new UnauthorizedException('Session de connexion expirée. Recommencez.');
    }
    if (payload.stage !== expected || payload.tenant !== tenantSlug || !payload.sub) {
      throw new UnauthorizedException('Jeton invalide.');
    }
    return payload.sub;
  }

  /** La 2FA est-elle OBLIGATOIRE pour cet utilisateur (réglage tenant + fonctions) ? */
  private async enrollmentRequired(db: TenantDb, tenantId: string, userId: string): Promise<boolean> {
    const settings = await this.prisma.tenantSettings.findUnique({
      where: { tenantId },
      select: { require2fa: true },
    });
    if (!settings?.require2fa) return false;
    const [manageAccounts, manageEstablishment] = await Promise.all([
      this.authz.hasFunction(db, userId, FONCTIONS.COMPTES_GERER),
      this.authz.hasFunction(db, userId, FONCTIONS.ETABLISSEMENT_GERER),
    ]);
    return manageAccounts || manageEstablishment;
  }

  /** Termine la connexion : pose le cookie de session + journalise le succès. */
  private async completeLogin(
    user: User,
    tenant: ResolvedTenant,
    res: Response,
    ip: string | undefined,
    method: string,
  ) {
    const result = await this.auth.issueSession(user, tenant.slug);
    setSessionCookie(res, result.accessToken, this.cookieSecure);
    void this.audit.log({
      tenantId: tenant.id,
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: AUDIT_ACTIONS.LOGIN_SUCCESS,
      ip,
      metadata: { method },
    });
    return result;
  }

  /** Méthodes de second facteur proposées à cet utilisateur. */
  private methodsFor(): string[] {
    const methods = ['totp', 'backup'];
    if (this.twoFactor.emailFallbackAvailable) methods.push('email');
    return methods;
  }

  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60_000 } }) // anti force brute
  @ApiOperation({
    summary: 'Connexion (email + mot de passe, dans l’école du domaine)',
    description:
      'Pose le JWT dans un cookie httpOnly `bc_token` (le navigateur ne peut ' +
      'pas le lire) ET le renvoie dans le corps pour les clients Bearer ' +
      '(appli mobile, intégrations).',
  })
  async login(
    @CurrentTenant() tenantOrNull: ResolvedTenant | null,
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
    @ClientIp() ip?: string,
  ) {
    const tenant = this.requireTenant(tenantOrNull);
    const db = this.prisma.forTenant(tenant.slug);

    let user: User;
    try {
      user = await this.auth.validateCredentials(db, dto);
    } catch (error) {
      void this.audit.log({
        tenantId: tenant.id,
        actorEmail: dto.email?.trim().toLowerCase(),
        action: AUDIT_ACTIONS.LOGIN_FAILURE,
        ip,
        metadata: { reason: (error as Error).message },
      });
      throw error;
    }

    // Mot de passe OK. Second facteur requis ?
    if (this.twoFactor.isEnabled(user)) {
      return {
        twoFactorRequired: true,
        twoFactorToken: await this.signStageToken(user.id, tenant.slug, 'twofactor'),
        methods: this.methodsFor(),
      };
    }

    // 2FA obligatoire (réglage tenant) mais pas encore configurée → enrôlement
    // forcé : PAS de session tant que la 2FA n'est pas activée.
    if (await this.enrollmentRequired(db, tenant.id, user.id)) {
      return {
        mustEnroll2fa: true,
        enrollToken: await this.signStageToken(user.id, tenant.slug, 'enroll'),
      };
    }

    return this.completeLogin(user, tenant, res, ip, 'password');
  }

  @Post('login/2fa')
  @Throttle({ default: { limit: 10, ttl: 60_000 } }) // même protection que /login
  @ApiOperation({ summary: 'Connexion — étape 2 : vérifie le second facteur' })
  async loginTwoFactor(
    @CurrentTenant() tenantOrNull: ResolvedTenant | null,
    @Body() dto: TwoFactorLoginDto,
    @Res({ passthrough: true }) res: Response,
    @ClientIp() ip?: string,
  ) {
    const tenant = this.requireTenant(tenantOrNull);
    const db = this.prisma.forTenant(tenant.slug);
    const userId = this.verifyStageToken(dto.twoFactorToken, 'twofactor', tenant.slug);

    const ok = await this.twoFactor.verify(db, userId, dto.code);
    if (!ok) {
      void this.audit.log({
        tenantId: tenant.id,
        actorId: userId,
        action: AUDIT_ACTIONS.TWO_FACTOR_FAILURE,
        ip,
      });
      throw new UnauthorizedException('Code de vérification invalide.');
    }
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    return this.completeLogin(user, tenant, res, ip, '2fa');
  }

  @Post('login/2fa/email')
  @Throttle({ default: { limit: 5, ttl: 60_000 } }) // envoi d'OTP : plus strict
  @ApiOperation({ summary: 'Connexion — envoie un code par email (repli)' })
  async loginTwoFactorEmail(
    @CurrentTenant() tenantOrNull: ResolvedTenant | null,
    @Body() dto: TwoFactorTokenDto,
  ) {
    const tenant = this.requireTenant(tenantOrNull);
    const db = this.prisma.forTenant(tenant.slug);
    const userId = this.verifyStageToken(dto.twoFactorToken, 'twofactor', tenant.slug);
    await this.twoFactor.sendEmailOtp(db, userId);
    return { sent: true };
  }

  @Post('logout')
  @ApiOperation({ summary: 'Déconnexion : efface le cookie de session' })
  logout(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Headers('cookie') cookie: string | undefined,
    @Res({ passthrough: true }) res: Response,
    @ClientIp() ip?: string,
  ) {
    clearSessionCookie(res, this.cookieSecure);
    // Non gardé (idempotent, doit pouvoir effacer un cookie périmé) : on décode
    // le jeton du cookie en best-effort pour tracer l'acteur.
    const actor = this.decodeSessionUser(cookie);
    void this.audit.log({
      tenantId: tenant?.id ?? null,
      actorId: actor?.sub,
      actorEmail: actor?.email,
      actorRole: actor?.role,
      action: AUDIT_ACTIONS.LOGOUT,
      ip,
    });
    return { ok: true };
  }

  /** Décode (sans exiger la validité) le JWT du cookie de session, pour l'audit. */
  private decodeSessionUser(cookie?: string): JwtPayload | null {
    const token = tokenFromCookieHeader(cookie);
    if (!token) return null;
    try {
      return this.jwt.verify<JwtPayload>(token);
    } catch {
      return null;
    }
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Identité portée par le JWT courant' })
  me(@CurrentUser() user: JwtPayload) {
    return user;
  }

  @Get('me/functions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Fonctions effectives de l’utilisateur courant',
    description:
      'Résolues en base (rôle dynamique ou repli sur l’enum) — sert à piloter ' +
      'l’affichage des actions côté front. L’API reste seule autorité : ceci ' +
      'n’est qu’une commodité d’UI, jamais un contrôle de sécurité en soi.',
  })
  async myFunctions(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!tenant) {
      throw new BadRequestException(
        'Tenant non résolu : domaine inconnu ou école non provisionnée.',
      );
    }
    const functions = await this.authz.getFunctions(
      this.prisma.forTenant(tenant.slug),
      user.sub,
    );
    return { functions };
  }

  @Post('password')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } }) // re-auth : anti-force brute sur l'ancien
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Changer son mot de passe (exige le mot de passe actuel)',
    description:
      'Re-authentifie avec le mot de passe actuel puis pose le nouveau. ' +
      'N’altère jamais la 2FA. Tracé au journal d’audit (password.change).',
  })
  async changePassword(
    @CurrentTenant() tenantOrNull: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
    @Body() dto: ChangePasswordDto,
    @ClientIp() ip?: string,
  ) {
    const tenant = this.requireTenant(tenantOrNull);
    const db = this.prisma.forTenant(tenant.slug);
    await this.auth.changePassword(db, user.sub, dto.currentPassword, dto.newPassword);
    void this.audit.log({
      tenantId: tenant.id,
      actorId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      action: AUDIT_ACTIONS.PASSWORD_CHANGE,
      ip,
    });
    return { changed: true };
  }

  // ── Double authentification (2FA) ───────────────────────────────────────

  /**
   * Résout l'utilisateur agissant sur les endpoints de configuration 2FA :
   * soit une session (cookie httpOnly — activation volontaire depuis le profil),
   * soit un jeton d'enrôlement (login avec 2FA obligatoire non configurée).
   * Renvoie l'id + si l'accès vient d'un enrôlement (→ émettre la session à la fin).
   */
  private resolveTwoFactorActor(
    tenantSlug: string,
    cookie?: string,
    enrollToken?: string,
  ): { userId: string; viaEnroll: boolean } {
    const sessionToken = tokenFromCookieHeader(cookie);
    if (sessionToken) {
      try {
        const payload = this.jwt.verify<JwtPayload & { stage?: string }>(sessionToken);
        if (!payload.stage && payload.tenant === tenantSlug && payload.sub) {
          return { userId: payload.sub, viaEnroll: false };
        }
      } catch {
        /* jeton de session invalide : on tente l'enrôlement ci-dessous */
      }
    }
    if (enrollToken) {
      return { userId: this.verifyStageToken(enrollToken, 'enroll', tenantSlug), viaEnroll: true };
    }
    throw new UnauthorizedException('Authentification requise.');
  }

  @Get('2fa/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'État de la 2FA du compte courant' })
  async twoFactorStatus(
    @CurrentTenant() tenantOrNull: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
  ) {
    const tenant = this.requireTenant(tenantOrNull);
    const db = this.prisma.forTenant(tenant.slug);
    const record = await db.user.findUniqueOrThrow({ where: { id: user.sub } });
    return {
      ...this.twoFactor.status(record),
      required: await this.enrollmentRequired(db, tenant.id, user.sub),
    };
  }

  @Post('2fa/setup')
  @ApiOperation({ summary: 'Démarrer l’activation 2FA : renvoie le QR code + secret' })
  async twoFactorSetup(
    @CurrentTenant() tenantOrNull: ResolvedTenant | null,
    @Body() dto: TwoFactorSetupDto,
    @Headers('cookie') cookie?: string,
  ) {
    const tenant = this.requireTenant(tenantOrNull);
    const db = this.prisma.forTenant(tenant.slug);
    const { userId } = this.resolveTwoFactorActor(tenant.slug, cookie, dto.enrollToken);
    const record = await db.user.findUniqueOrThrow({ where: { id: userId } });
    if (record.totpEnabledAt) {
      throw new BadRequestException('La double authentification est déjà active.');
    }
    return this.twoFactor.startSetup(db, userId, `${record.email} (${tenant.slug})`);
  }

  @Post('2fa/enable')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Confirmer l’activation 2FA — renvoie les codes de secours (une seule fois)',
  })
  async twoFactorEnable(
    @CurrentTenant() tenantOrNull: ResolvedTenant | null,
    @Body() dto: TwoFactorEnableDto,
    @Res({ passthrough: true }) res: Response,
    @Headers('cookie') cookie?: string,
    @ClientIp() ip?: string,
  ) {
    const tenant = this.requireTenant(tenantOrNull);
    const db = this.prisma.forTenant(tenant.slug);
    const { userId, viaEnroll } = this.resolveTwoFactorActor(tenant.slug, cookie, dto.enrollToken);

    const { backupCodes } = await this.twoFactor.enable(db, userId, dto.code);
    const record = await db.user.findUniqueOrThrow({ where: { id: userId } });
    void this.audit.log({
      tenantId: tenant.id,
      actorId: userId,
      actorEmail: record.email,
      actorRole: record.role,
      action: AUDIT_ACTIONS.TWO_FACTOR_ENABLE,
      ip,
    });
    // Enrôlement forcé au login : la 2FA est désormais active ET le premier code
    // a été vérifié → on ouvre la session dans la foulée.
    if (viaEnroll) {
      const session = await this.completeLogin(record, tenant, res, ip, 'enroll');
      return { backupCodes, ...session };
    }
    return { backupCodes };
  }

  @Post('2fa/backup-codes')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Régénérer les codes de secours — protégé par mot de passe (invalide les précédents)',
  })
  async twoFactorBackupCodes(
    @CurrentTenant() tenantOrNull: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
    @Body() dto: TwoFactorBackupCodesDto,
    @ClientIp() ip?: string,
  ) {
    const tenant = this.requireTenant(tenantOrNull);
    const db = this.prisma.forTenant(tenant.slug);
    const backupCodes = await this.twoFactor.regenerateBackupCodes(db, user.sub, dto.password);
    void this.audit.log({
      tenantId: tenant.id,
      actorId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      action: AUDIT_ACTIONS.TWO_FACTOR_BACKUP_REGEN,
      ip,
    });
    return { backupCodes };
  }

  @Get('me/activity')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Mon activité récente (self-scopé, sans permission admin)',
    description:
      'Les 10 dernières entrées du journal d’audit concernant l’utilisateur ' +
      'courant uniquement (connexions, échecs, changements). Chacun voit SA ' +
      'propre activité, jamais celle des autres.',
  })
  async myActivity(
    @CurrentTenant() tenantOrNull: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
  ) {
    const tenant = this.requireTenant(tenantOrNull);
    const entries = await this.audit.listForActor(tenant.id, user.sub, 10);
    return { entries };
  }

  @Post('2fa/disable')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Désactiver la 2FA — protégé par mot de passe' })
  async twoFactorDisable(
    @CurrentTenant() tenantOrNull: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
    @Body() dto: TwoFactorDisableDto,
    @ClientIp() ip?: string,
  ) {
    const tenant = this.requireTenant(tenantOrNull);
    const db = this.prisma.forTenant(tenant.slug);
    await this.twoFactor.disable(db, user.sub, dto.password);
    void this.audit.log({
      tenantId: tenant.id,
      actorId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      action: AUDIT_ACTIONS.TWO_FACTOR_DISABLE,
      ip,
    });
    return { disabled: true };
  }
}
