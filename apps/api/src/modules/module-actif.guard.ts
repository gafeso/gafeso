import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { MODULE_REQUIS_KEY } from './module-requis.decorator';
import { MODULES_PAR_ID } from './registre-modules';
import { ModulesService } from './modules.service';

/**
 * Refuse une route dont le module est INACTIF pour l'établissement, en le
 * NOMMANT.
 *
 * ⚠ LES DEUX EFFETS SONT EXIGÉS ENSEMBLE (règle d'activation, §5). L'interface
 * cache ce qui mène à un module éteint ; l'API refuse. Cacher sans refuser
 * laisse une porte ouverte, refuser sans cacher laisse une interface qui ment.
 * Ce garde tient la seconde moitié, et il la tient SEUL : aucun écran, aucun
 * verrouillage d'interface ne le remplace.
 *
 * ⚠ ET JAMAIS UNE LISTE VIDE EN GUISE DE REFUS. « Il n'y a rien » et « c'est
 * éteint » sont deux réponses différentes : un moissonneur extérieur qui reçoit
 * un jeu vide conclut que le fonds est vide et l'enregistre ainsi. Un refus
 * explicite, lui, se lit et se signale. D'où une 403 qui nomme le module, et
 * non un 200 appauvri ni un 404 qui ferait disparaître la route.
 */
@Injectable()
export class ModuleActifGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly modules: ModulesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const moduleId = this.reflector.getAllAndOverride<string>(MODULE_REQUIS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!moduleId) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const tenant = request.tenant;
    // ⚠ FAIL-CLOSED. Sans établissement résolu, on ne peut pas savoir si le
    // module est actif : on refuse. Laisser passer ferait d'un domaine inconnu
    // un contournement du registre.
    if (!tenant) {
      throw new ForbiddenException(
        `Établissement non résolu : impossible de vérifier l’état du module « ${moduleId} ».`,
      );
    }

    if (await this.modules.estActif(tenant.id, moduleId)) return true;

    const libelle = MODULES_PAR_ID.get(moduleId)?.libelle ?? moduleId;
    throw new ForbiddenException({
      statusCode: 403,
      message:
        `Le module « ${libelle} » est désactivé pour cet établissement : ` +
        'cette fonctionnalité n’est pas disponible. Aucune donnée n’a été ' +
        'supprimée — une réactivation la rend de nouveau accessible.',
      // Nommé dans le CORPS, et pas seulement dans la phrase : un appelant
      // automatique (moissonneur, client SRU) doit pouvoir le lire sans
      // analyser du français.
      module: moduleId,
      moduleActif: false,
    });
  }
}
