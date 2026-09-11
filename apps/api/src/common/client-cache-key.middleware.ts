import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

/**
 * Paramètres d'URL qui ne sont PAS des paramètres d'API : le client les ajoute
 * pour son propre cache, le serveur ne les lit jamais.
 *
 * `__host` — `GET /tenancy/home` et les routes publiques de l'OPAC ont la MÊME
 * URL pour tous les établissements, différenciés par en-tête. Le cache de
 * données de Next indexant sur l'URL, deux écoles se partageraient la même
 * entrée : une fuite inter-tenant. Le front ajoute donc l'hôte dans l'URL pour
 * en faire une clé distincte (apps/web/lib/server-api.ts).
 */
export const PARAMETRES_DE_TRANSPORT = ['__host'] as const;

/**
 * Retire les paramètres de transport de la requête, AVANT toute validation.
 *
 * ⚠ POURQUOI UN MIDDLEWARE ET NON UNE LIGNE DANS CHAQUE DTO. Le
 * `ValidationPipe` global tourne en `forbidNonWhitelisted`, donc TOUTE route
 * portant un `@Query()` typé refuse un paramètre inconnu par une 400 — il y en
 * a seize, sur douze DTOs. Les corriger un par un aurait laissé le défaut se
 * reproduire à la prochaine route écrite : personne ne pense à déclarer un
 * champ dont il ignore l'existence. Ici, la question est réglée pour les routes
 * présentes ET futures.
 *
 * ⚠ CE N'EST PAS UN ASSOUPLISSEMENT DE LA VALIDATION. Seuls les noms
 * explicitement listés ci-dessus sont retirés ; tout autre paramètre inconnu
 * continue d'être refusé, et un test le vérifie. Retirer un non-paramètre n'est
 * pas la même chose que cesser de contrôler les paramètres.
 */
@Injectable()
export class ClientCacheKeyMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    const query = req.query as Record<string, unknown>;
    for (const nom of PARAMETRES_DE_TRANSPORT) {
      // Suppression EN PLACE, sans réaffecter req.query : Express 4 mémoïse
      // l'objet au premier accès, et le remplacer masquerait le getter.
      if (nom in query) delete query[nom];
    }
    next();
  }
}
