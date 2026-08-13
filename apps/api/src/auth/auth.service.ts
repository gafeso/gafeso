import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AccountStatus, PrismaClient, User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { JwtPayload } from './jwt.strategy';
import { LoginDto } from './dto/login.dto';

export type TenantDb = PrismaClient;

const BCRYPT_ROUNDS = 10; // aligné sur AccountsService

export interface LoginResult {
  accessToken: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    className: string | null;
  };
}

@Injectable()
export class AuthService {
  constructor(private readonly jwt: JwtService) {}

  /** Émet un JWT signé pour un utilisateur déjà authentifié. */
  async issueToken(payload: JwtPayload): Promise<{ accessToken: string }> {
    return { accessToken: await this.jwt.signAsync(payload) };
  }

  /**
   * Valide email + mot de passe + statut et renvoie l'utilisateur COMPLET
   * (colonnes 2FA comprises) — la décision d'émettre une session ou d'exiger un
   * second facteur est prise par le contrôleur. Message d'erreur volontairement
   * identique pour email inconnu et mot de passe erroné (anti-énumération).
   */
  async validateCredentials(db: TenantDb, dto: LoginDto): Promise<User> {
    const email = dto.email.trim().toLowerCase();
    const user = await db.user.findUnique({ where: { email } });

    if (!user || !user.password) {
      throw new UnauthorizedException('Identifiants invalides.');
    }
    if (user.status !== AccountStatus.ACTIVE) {
      throw new ForbiddenException(
        'Compte non actif : en attente d’activation ou suspendu.',
      );
    }
    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) {
      throw new UnauthorizedException('Identifiants invalides.');
    }
    return user;
  }

  /**
   * Change le mot de passe de l'utilisateur lui-même : re-authentifie avec le
   * mot de passe ACTUEL, puis pose le nouveau (haché). Ne touche à AUCUNE autre
   * colonne — en particulier la 2FA reste active si elle l'était. Refuse un
   * nouveau mot de passe identique à l'ancien.
   */
  async changePassword(
    db: TenantDb,
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user?.password) {
      throw new UnauthorizedException('Mot de passe actuel invalide.');
    }
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) {
      throw new UnauthorizedException('Mot de passe actuel invalide.');
    }
    if (await bcrypt.compare(newPassword, user.password)) {
      throw new BadRequestException(
        'Le nouveau mot de passe doit être différent de l’actuel.',
      );
    }
    const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await db.user.update({ where: { id: userId }, data: { password: hash } });
  }

  /** Émet la session (JWT + projection user) pour un utilisateur authentifié. */
  async issueSession(user: User, tenantSlug: string): Promise<LoginResult> {
    const { accessToken } = await this.issueToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      tenant: tenantSlug,
    });
    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        className: user.className,
      },
    };
  }
}
