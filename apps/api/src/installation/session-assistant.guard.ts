import {
  CanActivate,
  ExecutionContext,
  GoneException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { InstallationService } from './installation.service';
import { SessionAssistantService } from './session-assistant.service';

/**
 * Garde des routes de l'assistant : l'installation doit être EN COURS, et
 * l'appelant doit porter une session d'assistant valide.
 *
 * ⚠ L'ORDRE DES DEUX REFUS COMPTE. On vérifie d'abord que l'installation est
 * requise — un `410 Gone` sur une instance installée ne dit rien d'un jeton, et
 * ne donne donc aucune prise à qui sonde. Si l'on vérifiait la session d'abord,
 * un `401` sur une instance déjà installée apprendrait qu'il existe quelque
 * chose à déverrouiller.
 */
@Injectable()
export class SessionAssistantGuard implements CanActivate {
  constructor(
    private readonly installation: InstallationService,
    private readonly sessions: SessionAssistantService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!(await this.installation.estRequise())) {
      throw new GoneException(
        'L’installation de cette instance est terminée : cette route n’existe plus.',
      );
    }
    const req = context.switchToHttp().getRequest<Request>();
    const session = req.header('x-installation-session') ?? undefined;
    if (!this.sessions.valide(session)) {
      throw new UnauthorizedException(
        'Session d’assistant absente ou expirée. Présentez à nouveau le jeton ' +
          'd’amorçage (POST /installation/jeton). ⚠ Un redémarrage de l’API ferme ' +
          'les sessions en cours : c’est normal, le jeton reste valable.',
      );
    }
    return true;
  }
}
