import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { MoissonnageService } from './moissonnage.service';
import { ModulesService } from '../modules/modules.service';

/**
 * LA PÉRIODICITÉ DES SOURCES — un passage par jour, à 04:00 Ouagadougou.
 *
 * ⚠ POURQUOI QUATRE HEURES : la purge des dépôts tourne à 03:00. Deux travaux
 * longs à la même minute se disputeraient la base d'une école le jour où les
 * deux ont du travail.
 *
 * ⚠ IL N'ÉMET RIEN TANT QUE PERSONNE N'A DÉCLARÉ DE SOURCE, et il respecte
 * l'extinction du module (voir le garde dans `parcourirLesEcoles`). Les deux
 * conditions sont nécessaires : la première rend l'installation sans danger,
 * la seconde rend l'extinction obéie. Ce texte n'affirmait que la première, et
 * il a servi de justification à l'absence de la seconde pendant deux jours. La règle « un défaut
 * d'activation ne se pose jamais sur un comportement qui ÉMET vers
 * l'extérieur » vise une migration qui ALLUME quelque chose pour tout le
 * monde ; ici les tables naissent vides, et la première requête sortante suit
 * une adresse que quelqu'un vient de taper.
 *
 * ⚠ UN MOISSONNAGE MANUEL RESTE POSSIBLE à tout moment : la périodicité décide
 * seulement de ce qui part TOUT SEUL.
 */
const QUOTIDIEN_A_4H = '0 4 * * *';

/** Combien de jours séparent deux passages, par rythme déclaré. */
const JOURS_ENTRE_DEUX: Record<string, number> = {
  quotidienne: 1,
  hebdomadaire: 7,
};

@Injectable()
export class MoissonnageScheduler {
  private readonly logger = new Logger('Moissonnage');
  private enCours = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly moissonnage: MoissonnageService,
    private readonly modules: ModulesService,
  ) {}

  @Cron(QUOTIDIEN_A_4H, { name: 'moissonnage-periodique', timeZone: 'Africa/Ouagadougou' })
  async quotidien(maintenant: Date = new Date()): Promise<void> {
    // ⚠ UN PASSAGE À LA FOIS. Un moissonnage de huit mille notices peut durer
    // plus de vingt-quatre heures sur une liaison lente ; sans ce verrou, le
    // passage du lendemain repartirait en parallèle sur les mêmes sources et
    // les deux écriraient la même identité.
    if (this.enCours) {
      this.logger.warn('Moissonnage périodique déjà en cours — saut de ce déclenchement.');
      return;
    }
    this.enCours = true;
    try {
      await this.parcourirLesEcoles(maintenant);
    } catch (error) {
      // ⚠ Comme la réconciliation au démarrage : un échec global se dit et ne
      // remonte pas. Une école injoignable ne doit pas priver les autres de
      // leur moissonnage.
      this.logger.error(`Moissonnage périodique échoué : ${(error as Error).message}`);
    } finally {
      this.enCours = false;
    }
  }

  private async parcourirLesEcoles(maintenant: Date): Promise<void> {
    const ecoles = await this.prisma.tenant.findMany({ select: { id: true, slug: true } });
    let lancees = 0;
    let ignorees = 0;
    let eteintes = 0;
    const echecs: string[] = [];

    for (const { id, slug } of ecoles) {
      // ⚠ LE GARDE DE MODULE VIT ICI, ET PAS SEULEMENT SUR LA ROUTE.
      //
      // Le contrôleur porte `@ModuleRequis('moissonnage')`, ce qui suffisait
      // tant que la route était le seul chemin. Ce planificateur est un SECOND
      // appelant, et il n'en savait rien : une école ayant éteint Moissonnage
      // voyait quand même, chaque jour à 4 h, des requêtes partir en son nom
      // vers des serveurs OAI tiers et des notices entrer dans son catalogue.
      //
      // ⚠ C'est la famille de `rappels`, à l'identique et deux jours plus tard :
      // « une propriété défendue au SEUL niveau HTTP gagne une porte dès qu'un
      // appelant apparaît ». Le critère qui tranche est déjà écrit dans
      // CLAUDE.md — si ce geste est faux, est-ce que quelqu'un d'EXTÉRIEUR
      // l'apprend ? Ici oui : le serveur tiers voit les requêtes.
      //
      // ⚠ Le défaut était LATENT quand il a été trouvé (aucune source déclarée
      // nulle part), et c'est exactement pourquoi il fallait le fermer
      // maintenant : il attendait qu'une école déclare une source puis éteigne
      // le module, c'est-à-dire le jour où personne ne le chercherait.
      if (!(await this.modules.estActif(id, 'moissonnage'))) {
        eteintes += 1;
        continue;
      }
      // ⚠ `forTenant` EST DANS LE `try`, ET CE N'ÉTAIT PAS LE CAS — un test l'a
      // trouvé. Il construit un client Prisma et peut lever ; hors du filet, la
      // première école en panne faisait remonter l'exception jusqu'au filet
      // extérieur, qui abandonnait TOUTES les écoles suivantes. Le compte rendu
      // aurait dit « échoué », sans dire que les autres n'avaient pas été
      // tentées.
      let db: ReturnType<PrismaService['forTenant']>;
      let sources: { id: string; name: string; periodicity: string }[];
      try {
        db = this.prisma.forTenant(slug);
        sources = await db.harvestSource.findMany({
          where: { active: true, periodicity: { in: Object.keys(JOURS_ENTRE_DEUX) } },
          select: { id: true, name: true, periodicity: true },
        });
      } catch (error) {
        // ⚠ Une école dont le schéma n'a pas encore la table n'est pas une
        // école sans source : les deux se distinguent dans le journal.
        echecs.push(`${slug} (${(error as Error).message})`);
        continue;
      }

      for (const source of sources) {
        if (!(await this.cestLHeure(db, source, maintenant))) {
          ignorees += 1;
          continue;
        }
        try {
          const run = await this.moissonnage.executer(db, slug, source.id, maintenant);
          lancees += 1;
          // ⚠ LE RÉSULTAT EST DIT, pas seulement le déclenchement. « Moissonné »
          // sans son issue laisserait croire à une moisson là où l'entrepôt
          // était injoignable.
          this.logger.log(
            `${slug} · ${source.name} : ${run.outcome}` +
              (run.outcome === 'moisson'
                ? ` — ${run.created} créée(s), ${run.collided} collision(s), ${run.deletions} suppression(s) signalée(s)`
                : run.reason
                  ? ` — ${run.reason}`
                  : ''),
          );
        } catch (error) {
          echecs.push(`${slug} · ${source.name} (${(error as Error).message})`);
        }
      }
    }

    const morceaux = [`${lancees} moissonnage(s) lancé(s)`];
    if (ignorees) morceaux.push(`${ignorees} pas encore dû(s)`);
    if (eteintes) morceaux.push(`${eteintes} école(s) module éteint`);
    // ⚠ Ne mentionner que ce qui existe : « 0 échec » à chaque nuit est du
    // bruit, et le bruit use ce qui doit être lu le jour où il compte.
    if (echecs.length) morceaux.push(`⚠ ${echecs.length} échec(s) : ${echecs.join(' ; ')}`);
    this.logger.log(morceaux.join(' · '));
  }

  /**
   * ⚠ L'ÉCHÉANCE SE CALCULE SUR LA DERNIÈRE EXÉCUTION, PAS SUR UN COMPTEUR.
   *
   * Un planificateur qui se contente de « c'est lundi, donc hebdomadaire »
   * saute une semaine entière dès qu'un passage tombe — redémarrage, panne,
   * conteneur recréé. En comparant à la dernière exécution RÉELLE, un passage
   * manqué est rattrapé à la nuit suivante.
   */
  private async cestLHeure(
    db: ReturnType<PrismaService['forTenant']>,
    source: { id: string; periodicity: string },
    maintenant: Date,
  ): Promise<boolean> {
    const jours = JOURS_ENTRE_DEUX[source.periodicity];
    if (!jours) return false;

    const derniere = await db.harvestRun.findFirst({
      where: { sourceId: source.id, finishedAt: { not: null } },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      select: { startedAt: true },
    });
    // Jamais moissonnée : c'est l'heure.
    if (!derniere) return true;

    const ecoule = maintenant.getTime() - derniere.startedAt.getTime();
    // ⚠ LA MARGE DE DOUZE HEURES N'EST PAS UNE COQUETTERIE. Le passage a lieu à
    // heure fixe : sans elle, une exécution de la veille à 04:00:05 rendrait
    // « 23 h 59 écoulées » ce soir, et la source sauterait un jour sur deux.
    return ecoule >= jours * 24 * 3600_000 - 12 * 3600_000;
  }
}
