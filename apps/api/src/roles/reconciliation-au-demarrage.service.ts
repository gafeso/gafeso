import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RolesService } from './roles.service';

/**
 * RÉCONCILIE LES RÔLES SYSTÈME DE TOUTES LES ÉCOLES AU DÉMARRAGE DE L'API.
 *
 * ⚠ LE DÉFAUT QUE CECI FERME, ET IL ÉTAIT SILENCIEUX PAR CONSTRUCTION.
 * `ensureSystemRoles` n'était appelée qu'au provisioning d'une école et à
 * l'ouverture de l'écran des rôles. Une école restait donc figée à la dernière
 * visite de cet écran — donc **les écoles les moins visitées étaient les plus
 * périmées**, l'inverse de ce qu'on veut.
 *
 * Mesuré le 12 septembre 2026 : `Étudiant` portait `{}` en base sur les deux
 * écoles là où le code lui donnait `depot.deposer`. Un rôle qui a MOINS de
 * fonctions qu'en code ne lève rien : il refuse, poliment, à des gens qui
 * devraient passer. Le circuit de dépôt était livré, testé, déployé — et inerte,
 * sans une ligne dans les journaux.
 *
 * Et il se reproduirait à chaque fonction nouvelle : quatre en deux jours.
 *
 * ## Trois exigences, et chacune a sa raison
 *
 * 1. **Elle DIT ce qu'elle a changé.** Une écriture silencieuse au démarrage est
 *    un état partagé modifié sans trace.
 * 2. ⚠ **Elle n'empêche JAMAIS l'API de démarrer.** Une école injoignable ou un
 *    schéma absent se signale et laisse passer. C'est la distinction des trois
 *    états : réconciliée, déjà conforme, injoignable — jamais « zéro » pour
 *    « je n'ai pas pu savoir ».
 * 3. **Elle est idempotente**, et l'idempotence vit dans
 *    `RolesService.reconcilierRolesSysteme` : rien n'est écrit si rien ne
 *    diverge. Sans cela, chaque redémarrage produirait une écriture qui ne
 *    change rien, et un journal rempli de faux événements ne se lit plus.
 *
 * ## Pourquoi rien n'entre dans le journal d'AUDIT
 *
 * L'audit nomme un ACTEUR : qui a fait quoi. Un démarrage n'en a pas, et
 * inventer un acteur système dans une table qui sert à répondre « qui a changé
 * ce droit ? » abîmerait la seule question qu'elle sait traiter. La trace est
 * ici, dans le journal de démarrage, et elle ne paraît que lorsqu'il y a
 * quelque chose à dire.
 */
@Injectable()
export class ReconciliationAuDemarrageService implements OnApplicationBootstrap {
  private readonly logger = new Logger('RôlesSystème');

  constructor(
    private readonly prisma: PrismaService,
    private readonly roles: RolesService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // ⚠ LE FILET LE PLUS EXTÉRIEUR. Tout ce qui suit peut échouer — base
    // indisponible au boot, schéma `public` pas encore migré, une école
    // supprimée entre la lecture et l'écriture. Rien de tout cela ne doit
    // empêcher l'API de servir : elle sait déjà vivre avec des rôles périmés,
    // elle ne sait pas vivre sans démarrer.
    try {
      await this.reconcilierToutesLesEcoles();
    } catch (error) {
      this.logger.error(
        `Réconciliation impossible au démarrage : ${(error as Error).message}. ` +
          'L’API démarre quand même — les rôles restent tels qu’ils sont en base.',
      );
    }
  }

  private async reconcilierToutesLesEcoles(): Promise<void> {
    const ecoles = await this.prisma.tenant.findMany({ select: { slug: true } });
    if (ecoles.length === 0) {
      this.logger.log('Aucune école : rien à réconcilier.');
      return;
    }

    let conformes = 0;
    const reconciliees: string[] = [];
    const injoignables: string[] = [];
    let ajoutees = 0;
    let retirees = 0;

    for (const { slug } of ecoles) {
      try {
        const rapport = await this.roles.reconcilierRolesSysteme(this.prisma.forTenant(slug));
        if (rapport.roles.length === 0) {
          conformes += 1;
          continue;
        }
        reconciliees.push(slug);
        ajoutees += rapport.ajoutees;
        retirees += rapport.retirees;
        for (const r of rapport.roles) {
          const quoi = [
            r.cree ? 'créé' : null,
            r.ajoutees.length ? `+ ${r.ajoutees.join(', ')}` : null,
            r.retirees.length ? `− ${r.retirees.join(', ')}` : null,
            r.descriptionMaj ? 'libellé' : null,
          ]
            .filter(Boolean)
            .join(' · ');
          this.logger.warn(`${slug} · ${r.name} : ${quoi}`);
        }
      } catch (error) {
        // ⚠ UNE ÉCOLE INJOIGNABLE N'EST PAS UNE ÉCOLE CONFORME. Le compte les
        // sépare, sinon « 3 écoles déjà conformes » se lirait comme une
        // garantie sur une école dont on ne sait rien.
        injoignables.push(slug);
        this.logger.error(`${slug} : injoignable — ${(error as Error).message}`);
      }
    }

    this.logger.log(this.resume(ecoles.length, reconciliees, conformes, injoignables, ajoutees, retirees));
  }

  /**
   * Une ligne, et elle ne mentionne que ce qui existe : « 0 injoignable » à
   * chaque démarrage est du bruit, et le bruit use ce qui doit être lu le jour
   * où il compte.
   */
  private resume(
    total: number,
    reconciliees: string[],
    conformes: number,
    injoignables: string[],
    ajoutees: number,
    retirees: number,
  ): string {
    const morceaux: string[] = [];
    if (reconciliees.length) {
      const fonctions = [
        ajoutees ? `${ajoutees} fonction(s) ajoutée(s)` : null,
        retirees ? `${retirees} retirée(s)` : null,
      ]
        .filter(Boolean)
        .join(', ');
      morceaux.push(
        `${reconciliees.length} école(s) réconciliée(s) (${reconciliees.join(', ')})` +
          (fonctions ? ` — ${fonctions}` : ''),
      );
    }
    if (conformes) morceaux.push(`${conformes} déjà conforme(s)`);
    if (injoignables.length)
      morceaux.push(`⚠ ${injoignables.length} injoignable(s) : ${injoignables.join(', ')}`);
    return `${total} école(s) — ${morceaux.join(' · ')}`;
  }
}
