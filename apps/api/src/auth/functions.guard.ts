import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AuthzService } from './authz.service';
import { FUNCTIONS_KEY } from './functions.decorator';
import { JwtPayload } from './jwt.strategy';

/**
 * Vérifie que l'utilisateur authentifié possède TOUTES les fonctions exigées
 * par @RequiresFunctions(). Remplace l'ancien RolesGuard : les droits ne
 * dépendent plus d'un enum figé mais du rôle (dynamique) de l'utilisateur,
 * résolu en base à chaque requête (AuthzService) — un compte suspendu ou un
 * rôle amputé d'une fonction perd l'accès immédiatement, sans attendre
 * l'expiration du JWT. À utiliser APRÈS JwtAuthGuard.
 */
@Injectable()
export class FunctionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly authz: AuthzService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(FUNCTIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as JwtPayload | undefined;
    if (!user) {
      throw new ForbiddenException('Authentification requise.');
    }
    const tenant = request.tenant;
    if (!tenant) {
      throw new BadRequestException(
        'Tenant non résolu : domaine inconnu ou école non provisionnée.',
      );
    }

    const functions = await this.authz.getFunctions(
      this.prisma.forTenant(tenant.slug),
      user.sub,
    );
    const missing = required.filter((f) => !functions.includes(f));
    if (missing.length > 0) {
      throw new ForbiddenException(
        `Fonction requise pour cette action : ${missing.join(', ')}.`,
      );
    }
    return true;
  }
}
