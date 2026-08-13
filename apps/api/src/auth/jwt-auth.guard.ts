import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { JwtPayload } from './jwt.strategy';

/**
 * Garde JWT des routes d'école.
 *
 * Au-delà de la validité cryptographique, vérifie que le jeton a été émis
 * POUR L'ÉCOLE du domaine courant : un JWT valide de l'école A ne donne
 * aucun droit sur l'école B (isolation multi-tenant), et un jeton
 * plateforme (super-admin, sans claim tenant) n'ouvre pas les routes
 * d'école. Toute route protégée par cette garde est donc tenant-scopée —
 * pour une future route JWT hors tenant, créer une garde dédiée.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const valid = (await super.canActivate(context)) as boolean;
    if (!valid) return false;

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as JwtPayload | undefined;
    if (!request.tenant || !user?.tenant || user.tenant !== request.tenant.slug) {
      throw new UnauthorizedException('Jeton émis pour une autre école.');
    }
    return true;
  }
}
