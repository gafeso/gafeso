import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { tokenFromCookieHeader } from './session-cookie';

export interface JwtPayload {
  sub: string; // user id
  email: string;
  role: string;
  tenant?: string; // slug du tenant
}

/**
 * Extrait le JWT du cookie de session `bc_token` (posé en httpOnly par le
 * serveur — voir session-cookie.ts). Prioritaire sur l'en-tête Authorization :
 * pour le navigateur, c'est le seul canal ; pour un client Bearer, l'en-tête
 * prend le relais (extracteur suivant).
 */
function sessionCookieExtractor(req: Request): string | null {
  return tokenFromCookieHeader(req?.headers?.cookie);
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    const secret = config.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET manquant dans la configuration');
    }
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        sessionCookieExtractor,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  // La valeur retournée est attachée à request.user
  async validate(payload: JwtPayload): Promise<JwtPayload> {
    return payload;
  }
}
