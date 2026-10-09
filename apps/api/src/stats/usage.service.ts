import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';

/** Client Prisma lié au schéma d'une école. */
type TenantDb = PrismaClient;

/**
 * Les deux gestes collectés. En TEXTE, comme la colonne.
 *
 * ⚠ `CONSULTATION` ET NON `LECTURE`, et le mot a été changé DANS LA DONNÉE le
 * 6 octobre 2026 (migration `20261006180000_usage_nominatif`).
 *
 * Deux raisons, et la seconde est la vraie :
 *   ① consigne de Jean — « libellés : consultations en ligne, téléchargements.
 *     Jamais lectures » ;
 *   ② ⭐ et le mot était FAUX AU FOND, pas seulement en surface : ce qu'on
 *     observe est la délivrance d'une URL de lecture, **pas une lecture**. On
 *     ne sait pas si quelqu'un a lu. Laisser `LECTURE` dans la donnée aurait
 *     fait dire au premier écran qui l'affiche brute ce que la mesure ne dit
 *     pas — c'est « le nom du dispositif est une affirmation ».
 *
 * ⚠ ET LA LECTURE HORS CONNEXION N'EST PAS TRACÉE, par construction : elle se
 * passe sur un téléphone, sans réseau. `TELECHARGEMENT` compte la DÉLIVRANCE du
 * fichier ou de la licence, jamais son usage. Un écran qui parlerait de
 * « lectures hors ligne » affirmerait une chose que rien ne mesure.
 */
export const USAGE_CONSULTATION = 'CONSULTATION';
export const USAGE_TELECHARGEMENT = 'TELECHARGEMENT';
export type UsageKind = typeof USAGE_CONSULTATION | typeof USAGE_TELECHARGEMENT;

/** Ce qu'on sait de l'auteur du geste, au moment du geste. */
export interface AuteurDUsage {
  /** `null` quand l'acte vient du personnel : il n'y a pas d'étudiant à nommer. */
  readonly userId: string | null;
  /**
   * La filière AU MOMENT DE L'ACTE. Dénormalisée exprès : lue par jointure, elle
   * donnerait la classe d'AUJOURD'HUI, et un rapport de l'an dernier changerait
   * au passage d'un étudiant en année supérieure.
   */
  readonly className: string | null;
}

/** Aucun auteur à nommer — personnel, ou contexte sans membre. */
export const SANS_AUTEUR: AuteurDUsage = { userId: null, className: null };

/**
 * ⭐ LE SEUIL DE PUBLICATION D'UN AGRÉGAT.
 *
 * « Un agrégat sur une petite population est une donnée personnelle déguisée » —
 * leçon du 15 septembre 2026, et c'est exactement cette situation : « L2
 * Informatique : 3 consultations » dans une filière de trois est le dossier de
 * lecture de trois personnes qu'un collègue peut nommer.
 *
 * ⚠ Le seuil porte sur le nombre de PERSONNES DISTINCTES, pas sur le nombre
 * d'événements : une seule personne qui ouvre vingt fois reste une personne.
 */
export const SEUIL_PUBLICATION = 5;

/** Une ligne d'agrégat. `effectif` est le nombre de personnes DISTINCTES. */
export interface LigneUsage {
  readonly cle: string;
  readonly consultations: number;
  readonly telechargements: number;
  readonly effectif: number;
  /** `false` quand l'effectif est sous le seuil : les comptes sont alors masqués. */
  readonly publiable: boolean;
}

/** Rétention du NOM. Les agrégats, eux, sont conservés. */
export const RETENTION_NOMINATIVE_MOIS = 12;

/**
 * L'USAGE DES DOCUMENTS — une ligne par consultation en ligne et par
 * téléchargement.
 *
 * *P8-1 (15 septembre 2026), rendue NOMINATIVE pour 12 mois le 6 octobre 2026.*
 *
 * ⚠ CE QUI A CHANGÉ, ET POURQUOI. Elle ne portait AUCUN identifiant, et son
 * commentaire le défendait : « une donnée qu'on ne collecte pas ne fuit pas ».
 * L'argument reste bon et il a une limite : sans auteur, l'étudiant ne peut pas
 * voir SES consultations, et l'établissement ne peut pas répartir par filière.
 * Le profil « bibliothèque numérique » — une université virtuelle, aucun rayon —
 * n'a que cette mesure pour savoir si sa bibliothèque sert.
 *
 * ⭐ LE COMPROMIS EST DONC DANS LA RÉTENTION, PAS DANS LA COLLECTE : le nom vit
 * DOUZE MOIS, puis la purge le retire et garde la ligne. L'agrégat survit, le
 * dossier de lecture non.
 *
 * ⚠ ELLE NE FAIT JAMAIS ÉCHOUER LE GESTE QU'ELLE COMPTE. Perdre une ligne de
 * comptage ne doit pas empêcher quelqu'un de lire sa thèse.
 *
 * ⚠ ELLE N'EST PAS GARDÉE PAR LE MODULE `statistiques`, ET C'EST VOULU.
 * Suspendre la collecte quand le module est éteint creuserait un TROU dans
 * l'historique : le jour où une école rallume les statistiques, son année serait
 * fausse sans que rien ne le dise. On collecte toujours, on n'EXPOSE que si le
 * module est actif.
 */
@Injectable()
export class UsageService {
  private readonly logger = new Logger(UsageService.name);

  /**
   * Enregistre un usage. NE REJETTE JAMAIS.
   *
   * Rend `true` si la ligne est écrite — un booléen suffit : aucun appelant n'a
   * de décision à prendre sur cet échec, il rend la mesure possible en test.
   */
  async enregistrer(
    db: TenantDb,
    recordId: string,
    kind: UsageKind,
    auteur: AuteurDUsage = SANS_AUTEUR,
  ): Promise<boolean> {
    try {
      await db.usageEvent.create({
        data: {
          recordId,
          kind,
          userId: auteur.userId,
          className: auteur.className,
        },
      });
      return true;
    } catch (error) {
      this.logger.warn(
        `Usage non enregistré (${kind} sur ${recordId}) : ${(error as Error).message}`,
      );
      return false;
    }
  }

  /**
   * LES CONSULTATIONS D'UNE PERSONNE — les SIENNES, et elles seules.
   *
   * 🔴 `userId` N'EST PAS UN PARAMÈTRE DE FILTRE, c'est l'identité de l'appelant.
   * Aucune route du personnel n'appelle cette méthode : `usage-nominatif-reserve.spec.ts`
   * compte ses appelants et exige qu'ils soient tous dans l'espace lecteur. Un
   * bibliothécaire ne doit pas pouvoir obtenir l'historique d'un lecteur nommé —
   * c'est la consigne du 6 octobre, et elle se garde par la POPULATION des
   * appelants, pas par une permission qu'on pourrait élargir.
   */
  async miennes(db: TenantDb, userId: string, limite = 50) {
    return db.usageEvent.findMany({
      where: { userId },
      orderBy: { occurredAt: 'desc' },
      take: Math.min(limite, 200),
      select: { id: true, recordId: true, kind: true, occurredAt: true },
    });
  }

  /**
   * AGRÉGAT PAR DOCUMENT — pour le personnel. Aucun nom n'en sort.
   *
   * ⚠ Le seuil ne s'applique PAS ici : un document n'est pas une personne, et
   * « cette thèse a été consultée trois fois » ne désigne personne. C'est la
   * frontière du 15 septembre — « un nom d'auteur décrit une ŒUVRE ; un agrégat
   * de classe décrit des PERSONNES ».
   */
  async parDocument(db: TenantDb, debut: Date, fin: Date, limite = 20) {
    const lignes = await db.$queryRaw<
      { record_id: string; consultations: bigint; telechargements: bigint }[]
    >(Prisma.sql`
      SELECT record_id,
             count(*) FILTER (WHERE kind = ${USAGE_CONSULTATION})   AS consultations,
             count(*) FILTER (WHERE kind = ${USAGE_TELECHARGEMENT}) AS telechargements
      FROM usage_events
      WHERE occurred_at >= ${debut} AND occurred_at < ${fin}
      GROUP BY record_id
      ORDER BY count(*) DESC
      LIMIT ${limite}
    `);
    return lignes.map((l) => ({
      recordId: l.record_id,
      consultations: Number(l.consultations),
      telechargements: Number(l.telechargements),
    }));
  }

  /** AGRÉGAT PAR JOUR — pour le personnel. Aucun nom, aucune filière. */
  async parJour(db: TenantDb, debut: Date, fin: Date) {
    const lignes = await db.$queryRaw<
      { jour: Date; consultations: bigint; telechargements: bigint }[]
    >(Prisma.sql`
      SELECT date_trunc('day', occurred_at) AS jour,
             count(*) FILTER (WHERE kind = ${USAGE_CONSULTATION})   AS consultations,
             count(*) FILTER (WHERE kind = ${USAGE_TELECHARGEMENT}) AS telechargements
      FROM usage_events
      WHERE occurred_at >= ${debut} AND occurred_at < ${fin}
      GROUP BY 1
      ORDER BY 1
    `);
    return lignes.map((l) => ({
      jour: l.jour.toISOString().slice(0, 10),
      consultations: Number(l.consultations),
      telechargements: Number(l.telechargements),
    }));
  }

  /**
   * 🔴 AGRÉGAT PAR FILIÈRE — et c'est le seul qui porte un SEUIL.
   *
   * Une filière EST une population de personnes. « L2 Droit : 3 consultations »
   * dans une filière de trois est le dossier de lecture de trois personnes qu'un
   * collègue peut nommer.
   *
   * ⚠ LA LIGNE SOUS LE SEUIL N'EST PAS SUPPRIMÉE, elle est MASQUÉE et le DIT
   * (`publiable: false`, comptes à `null`). Une absence muette se lit comme un
   * zéro, et c'est le faux que ce seuil existe pour éviter — leçon du
   * 15 septembre, mot pour mot.
   */
  async parFiliere(db: TenantDb, debut: Date, fin: Date): Promise<LigneUsage[]> {
    const lignes = await db.$queryRaw<
      {
        class_name: string | null;
        consultations: bigint;
        telechargements: bigint;
        effectif: bigint;
      }[]
    >(Prisma.sql`
      SELECT class_name,
             count(*) FILTER (WHERE kind = ${USAGE_CONSULTATION})   AS consultations,
             count(*) FILTER (WHERE kind = ${USAGE_TELECHARGEMENT}) AS telechargements,
             count(DISTINCT user_id)                                AS effectif
      FROM usage_events
      WHERE occurred_at >= ${debut} AND occurred_at < ${fin}
        AND class_name IS NOT NULL
      GROUP BY class_name
      ORDER BY class_name
    `);
    return lignes.map((l) => {
      const effectif = Number(l.effectif);
      const publiable = effectif >= SEUIL_PUBLICATION;
      return {
        cle: l.class_name as string,
        // ⚠ Masqués à -1 plutôt qu'à 0 : un zéro se lit comme une mesure.
        consultations: publiable ? Number(l.consultations) : -1,
        telechargements: publiable ? Number(l.telechargements) : -1,
        effectif,
        publiable,
      };
    });
  }

  /**
   * LA PURGE NOMINATIVE — retire le NOM au-delà de 12 mois, garde la ligne.
   *
   * ⚠ ELLE N'EFFACE PAS LA LIGNE : `class_name` et `occurred_at` restent, donc
   * les agrégats d'une année close ne changent pas. Supprimer réécrirait
   * l'histoire — un rapport annuel produit deux fois donnerait deux résultats.
   *
   * Rend le nombre de lignes anonymisées : un compte, pas un booléen, parce que
   * c'est ce compte qui prouve que la purge a TOURNÉ.
   */
  async purgerLeNominatif(db: TenantDb, maintenant: Date = new Date()): Promise<number> {
    const limite = new Date(maintenant);
    limite.setMonth(limite.getMonth() - RETENTION_NOMINATIVE_MOIS);
    const { count } = await db.usageEvent.updateMany({
      where: { userId: { not: null }, occurredAt: { lt: limite } },
      data: { userId: null, anonymiseLe: maintenant },
    });
    return count;
  }
}
