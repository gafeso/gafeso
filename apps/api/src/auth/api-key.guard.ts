import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, timingSafeEqual } from 'crypto';
import { Request } from 'express';

/** Comparaison à temps constant (les hachés égalisent les longueurs). */
function safeEquals(a: string, b: string): boolean {
  const hashA = createHash('sha256').update(a).digest();
  const hashB = createHash('sha256').update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

/**
 * Garde des endpoints plateforme (provisioning des écoles). Deux voies :
 *  - un JWT super-admin valide (payload.superAdmin === true), voie normale ;
 *  - la clé ADMIN_API_KEY (en-tête x-admin-api-key), repli pour l'amorçage et
 *    l'automatisation (seed, CI).
 * Fail-closed : ni JWT valide ni clé → refus.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    // Voie 1 : JWT super-admin
    const auth = request.headers.authorization;
    if (auth?.startsWith('Bearer ')) {
      try {
        const payload = this.jwt.verify(auth.slice(7));
        if (payload?.superAdmin === true) return true;
      } catch {
        /* jeton invalide : on tente la clé API */
      }
    }

    // Voie 2 : clé API d'amorçage (comparaison à temps constant)
    const configured = this.config.get<string>('ADMIN_API_KEY');
    const provided = request.headers['x-admin-api-key'];
    if (configured && typeof provided === 'string' && safeEquals(provided, configured)) {
      return true;
    }

    throw new UnauthorizedException(
      'Accès plateforme refusé : connectez-vous en super-admin ou fournissez la clé API.',
    );
  }
}
