import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomInt } from 'crypto';
import { MailService } from '../accounts/mail/mail.service';
import { MailOutcome } from '../accounts/mail/mail-outcome';

export type TenantDb = PrismaClient;

// Tolérance ±1 pas de temps (±30 s) sur le TOTP : couvre le décalage d'horloge
// et la saisie à cheval sur deux fenêtres.
authenticator.options = { window: 1 };

const TOTP_STEP_SECONDS = 30;
const BACKUP_CODE_COUNT = 8;
const EMAIL_OTP_TTL_MS = 10 * 60 * 1000;
const EMAIL_OTP_MAX_ATTEMPTS = 5;
// Émetteur affiché dans l'app d'authentification (Google Authenticator…).
// N'entre PAS dans le calcul TOTP : le changer n'invalide aucun 2FA existant
// (seul le secret compte) ; seules les nouvelles inscriptions afficheront « Gafeso ».
const ISSUER = 'Gafeso';

/** Pas de temps TOTP courant (nombre de fenêtres de 30 s depuis l'époque). */
function currentStep(): number {
  return Math.floor(Date.now() / 1000 / TOTP_STEP_SECONDS);
}

/** Hachage rapide pour un secret à haute entropie (code de secours / OTP email). */
function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Codes de secours lisibles : XXXXX-XXXXX (base32 sans caractères ambigus). */
function generateBackupCodes(count: number): string[] {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans I,O,0,1
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const bytes = randomBytes(10);
    let raw = '';
    for (const b of bytes) raw += alphabet[b % alphabet.length];
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5, 10)}`);
  }
  return codes;
}

export interface TwoFactorStatus {
  enabled: boolean;
  pendingSetup: boolean; // secret posé mais pas encore confirmé
  backupCodesRemaining: number;
}

@Injectable()
export class TwoFactorService {
  private readonly logger = new Logger(TwoFactorService.name);

  constructor(private readonly mail: MailService) {}

  /** L'utilisateur a-t-il la 2FA active ? */
  isEnabled(user: { totpEnabledAt: Date | null }): boolean {
    return user.totpEnabledAt != null;
  }

  status(user: {
    totpSecret: string | null;
    totpEnabledAt: Date | null;
    backupCodes: unknown;
  }): TwoFactorStatus {
    return {
      enabled: user.totpEnabledAt != null,
      pendingSetup: user.totpSecret != null && user.totpEnabledAt == null,
      backupCodesRemaining: Array.isArray(user.backupCodes) ? user.backupCodes.length : 0,
    };
  }

  /**
   * Démarre l'activation : génère un secret TOTP (stocké, PAS encore actif) et
   * renvoie le QR code (data URL) + le secret en clair (saisie manuelle). Tant
   * que `enable` n'est pas confirmé, la 2FA reste inactive → le login n'exige
   * pas de second facteur.
   */
  async startSetup(
    db: TenantDb,
    userId: string,
    accountLabel: string,
  ): Promise<{ secret: string; otpauthUrl: string; qrDataUrl: string }> {
    const secret = authenticator.generateSecret();
    await db.user.update({ where: { id: userId }, data: { totpSecret: secret } });
    const otpauthUrl = authenticator.keyuri(accountLabel, ISSUER, secret);
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl);
    return { secret, otpauthUrl, qrDataUrl };
  }

  /**
   * Confirme l'activation avec un premier code TOTP valide → active la 2FA,
   * génère les codes de secours (renvoyés EN CLAIR une seule fois, stockés
   * hachés). Enregistre le pas de temps consommé (anti-rejeu).
   */
  async enable(db: TenantDb, userId: string, code: string): Promise<{ backupCodes: string[] }> {
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user?.totpSecret) {
      throw new BadRequestException('Aucune configuration 2FA en cours. Recommencez.');
    }
    if (user.totpEnabledAt) {
      throw new BadRequestException('La double authentification est déjà active.');
    }
    const delta = authenticator.checkDelta(code.replace(/\s/g, ''), user.totpSecret);
    if (delta === null) {
      throw new UnauthorizedException('Code invalide. Vérifiez l’heure de votre téléphone.');
    }
    const backupCodes = generateBackupCodes(BACKUP_CODE_COUNT);
    await db.user.update({
      where: { id: userId },
      data: {
        totpEnabledAt: new Date(),
        totpLastStep: currentStep() + delta,
        backupCodes: backupCodes.map((c) => sha256(c)),
      },
    });
    return { backupCodes };
  }

  /** Désactive la 2FA — protégé par mot de passe. Purge secret, codes, OTP email. */
  async disable(db: TenantDb, userId: string, password: string): Promise<void> {
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user?.password || !(await bcrypt.compare(password, user.password))) {
      throw new UnauthorizedException('Mot de passe invalide.');
    }
    await db.user.update({
      where: { id: userId },
      data: {
        totpSecret: null,
        totpEnabledAt: null,
        totpLastStep: null,
        backupCodes: undefined,
        emailOtpHash: null,
        emailOtpExpiresAt: null,
        emailOtpAttempts: null,
      },
    });
  }

  /**
   * (Re)génère des codes de secours (invalide les précédents). Renvoyés une
   * seule fois. Protégé par mot de passe : régénérer invalide silencieusement
   * les anciens codes, c'est donc une action sensible qui exige une
   * re-authentification.
   */
  async regenerateBackupCodes(db: TenantDb, userId: string, password: string): Promise<string[]> {
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user?.totpEnabledAt) {
      throw new BadRequestException('Activez d’abord la double authentification.');
    }
    if (!user.password || !(await bcrypt.compare(password, user.password))) {
      throw new UnauthorizedException('Mot de passe invalide.');
    }
    const backupCodes = generateBackupCodes(BACKUP_CODE_COUNT);
    await db.user.update({
      where: { id: userId },
      data: { backupCodes: backupCodes.map((c) => sha256(c)) },
    });
    return backupCodes;
  }

  /**
   * Vérifie un second facteur à la connexion : TOTP, code de secours (usage
   * unique), ou OTP email (repli). Anti-rejeu TOTP par pas de temps ; codes de
   * secours retirés à la consommation ; OTP email à tentatives limitées.
   * Renvoie true si accepté.
   */
  async verify(db: TenantDb, userId: string, code: string): Promise<boolean> {
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user?.totpEnabledAt || !user.totpSecret) return false;
    const normalized = code.replace(/\s/g, '').toUpperCase();

    // 1) TOTP (avec anti-rejeu sur le pas de temps)
    const delta = authenticator.checkDelta(
      normalized.replace(/[^0-9]/g, ''),
      user.totpSecret,
    );
    if (delta !== null) {
      const step = currentStep() + delta;
      if (user.totpLastStep != null && step <= user.totpLastStep) {
        return false; // code déjà utilisé (rejeu)
      }
      await db.user.update({ where: { id: userId }, data: { totpLastStep: step } });
      return true;
    }

    // 2) Code de secours (usage unique)
    const hashes = Array.isArray(user.backupCodes) ? (user.backupCodes as string[]) : [];
    const target = sha256(normalized);
    const idx = hashes.indexOf(target);
    if (idx >= 0) {
      const remaining = hashes.filter((_, i) => i !== idx);
      await db.user.update({ where: { id: userId }, data: { backupCodes: remaining } });
      return true;
    }

    // 3) OTP email (repli, expirant, tentatives limitées)
    if (
      user.emailOtpHash &&
      user.emailOtpExpiresAt &&
      user.emailOtpExpiresAt.getTime() > Date.now()
    ) {
      const attempts = user.emailOtpAttempts ?? 0;
      if (attempts >= EMAIL_OTP_MAX_ATTEMPTS) return false;
      if (user.emailOtpHash === sha256(normalized.replace(/[^0-9]/g, ''))) {
        await db.user.update({
          where: { id: userId },
          data: { emailOtpHash: null, emailOtpExpiresAt: null, emailOtpAttempts: null },
        });
        return true;
      }
      await db.user.update({ where: { id: userId }, data: { emailOtpAttempts: attempts + 1 } });
    }

    return false;
  }

  /** Génère et envoie un OTP email (repli) — 6 chiffres, TTL 10 min, compteur remis à zéro. */
  /**
   * Envoie le code de repli par email — et REND CE QUI EST ARRIVÉ.
   *
   * ⚠ ELLE RENDAIT `void`, ET LA ROUTE ÉCRIVAIT `{ sent: true }` SANS LE
   * MESURER. C'est le chemin le plus grave du produit pour ce défaut : c'est le
   * REPLI de double authentification. Quelqu'un qui a perdu son appareil TOTP
   * n'a plus que lui — un faux « Code envoyé par email ✓ » devant une boîte qui
   * restera vide l'enferme dehors, et il n'a aucun moyen de savoir pourquoi.
   *
   * Relevé par la session frontend le 12 septembre 2026.
   */
  async sendEmailOtp(db: TenantDb, userId: string): Promise<MailOutcome> {
    const user = await db.user.findUnique({ where: { id: userId } });
    // ⚠ CE GARDE RENDAIT SILENCIEUSEMENT, donc un succès pour la route. Un
    // compte sans TOTP n'a pas de repli à recevoir : le jeton d'étape est
    // périmé (il n'est émis que lorsque la double authentification est
    // requise), et redémarrer la connexion est la seule réponse vraie.
    if (!user?.totpEnabledAt) {
      throw new UnauthorizedException(
        'Session de vérification expirée — recommencez la connexion.',
      );
    }
    const otp = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await db.user.update({
      where: { id: userId },
      data: {
        emailOtpHash: sha256(otp),
        emailOtpExpiresAt: new Date(Date.now() + EMAIL_OTP_TTL_MS),
        emailOtpAttempts: 0,
      },
    });
    const resultat = await this.mail.sendTwoFactorCode(user.email, otp);
    if (!resultat.sent) {
      this.logger.warn(
        `Code de repli 2FA non envoyé à ${user.email} : ${resultat.reason}` +
          `${resultat.detail ? ` — ${resultat.detail}` : ''}`,
      );
    }
    return resultat;
  }

  /** L'OTP email est-il proposable (SMTP configuré) ? */
  get emailFallbackAvailable(): boolean {
    return this.mail.available;
  }
}
