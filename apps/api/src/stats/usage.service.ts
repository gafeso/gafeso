import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/** Client Prisma lié au schéma d'une école. */
type TenantDb = PrismaClient;

/** Les deux gestes collectés. En TEXTE, comme la colonne. */
export const USAGE_LECTURE = 'LECTURE';
export const USAGE_TELECHARGEMENT = 'TELECHARGEMENT';
export type UsageKind = typeof USAGE_LECTURE | typeof USAGE_TELECHARGEMENT;

/**
 * L'USAGE DES DOCUMENTS — une ligne par lecture en ligne et par téléchargement.
 *
 * *P8-1, 15 septembre 2026.*
 *
 * ⚠ ELLE COMPTE DES ÉVÉNEMENTS, PAS DES PERSONNES. Aucun identifiant
 * d'utilisateur n'est écrit : le rapport annuel n'a besoin que d'agrégats, et
 * une donnée qu'on ne collecte pas ne fuit pas. Deux ouvertures par la même
 * personne font DEUX, et le rapport doit le dire.
 *
 * ⚠ ELLE NE FAIT JAMAIS ÉCHOUER LE GESTE QU'ELLE COMPTE. Perdre une ligne de
 * comptage ne doit pas empêcher quelqu'un de lire sa thèse. C'est la même
 * discipline que `AuditService.log` — et la même prudence : l'appelant fait
 * `void`, et cette méthode ne rejette pas.
 *
 * ⚠ ELLE N'EST PAS GARDÉE PAR LE MODULE `statistiques`, ET C'EST VOULU. La
 * règle d'activation porte sur les ÉCRANS et les ROUTES d'un module ; compter
 * n'est ni l'un ni l'autre, et n'émet rien vers l'extérieur. Suspendre la
 * collecte quand le module est éteint creuserait un TROU dans l'historique :
 * le jour où une école rallume les statistiques, son année serait fausse sans
 * que rien ne le dise. On collecte toujours, on n'EXPOSE que si le module est
 * actif.
 */
@Injectable()
export class UsageService {
  private readonly logger = new Logger(UsageService.name);

  /**
   * Enregistre un usage. NE REJETTE JAMAIS.
   *
   * Rend `true` si la ligne est écrite, `false` sinon — un booléen suffit ici
   * parce qu'AUCUN appelant n'a de décision à prendre sur cet échec : il rend
   * la mesure possible en test, il ne sert pas à brancher.
   */
  async enregistrer(db: TenantDb, recordId: string, kind: UsageKind): Promise<boolean> {
    try {
      await db.usageEvent.create({ data: { recordId, kind } });
      return true;
    } catch (error) {
      this.logger.warn(
        `Usage non enregistré (${kind} sur ${recordId}) : ${(error as Error).message}`,
      );
      return false;
    }
  }
}
