import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { CSV_BOM, toCsv } from '../stats/csv';

type TenantDb = PrismaClient;

/** Le rôle qui FAIT un encadrement. Il n'y en a pas d'autre définition ici. */
export const ROLE_DIRECTEUR = 'DIRECTEUR_MEMOIRE';

export interface Encadrement {
  recordId: string;
  titre: string;
  /** `ouvrage` | `these` | `memoire` … — le vocabulaire fermé de `recordType`. */
  type: string;
  /** Année de publication de la notice. Voir la note sur l'année ci-dessous. */
  annee: number | null;
  /** L'étudiant : l'auteur principal de la notice, s'il y en a un. */
  etudiant: string | null;
  universiteDeSoutenance: string | null;
}

/**
 * ⚠ TROIS ÉTATS, PAS DEUX — et c'est la décision qui compte dans ce contrat.
 *
 * « Aucun encadrement » et « votre compte n'est relié à aucune fiche d'auteur »
 * sont DEUX choses, et les confondre est le défaut qu'on corrige partout
 * ailleurs. Un enseignant qui a dirigé quinze thèses mais dont le compte n'est
 * pas rattaché à sa fiche verrait « vous n'avez encadré aucun mémoire » — un
 * faux, sur l'écran qui sert à monter un dossier de promotion.
 *
 * Le pire est qu'il n'y a RIEN qu'il puisse faire : le rattachement se pose au
 * catalogage, pas par lui. Un faux qui retire le recours, encore — d'où
 * `ficheLiee`, que l'écran doit lire AVANT de conclure quoi que ce soit.
 */
export interface MesEncadrements {
  /** La fiche d'autorité de l'appelant est-elle rattachée à son compte ? */
  ficheLiee: boolean;
  /** Le nom sous lequel ses encadrements sont enregistrés — utile à l'écran. */
  nomDeLaFiche: string | null;
  total: number;
  page: number;
  totalPages: number;
  encadrements: Encadrement[];
}

/**
 * « MES ENCADREMENTS » — P6-3, versant données.
 *
 * Les mémoires et thèses qu'une personne a dirigés, pour la pièce justificative
 * d'encadrement du dossier CCI. Aucun SIGB ni aucun DSpace ne le fait, parce
 * qu'aucun n'a été pensé pour cette obligation — et les données existent déjà :
 * c'est le rôle `DIRECTEUR_MEMOIRE` de P3, plus le lien `Author.userId` de P6-1.
 *
 * ⚠ STRICTEMENT AUTO-PORTÉE, ET C'EST CE QUI DÉCIDE DE SA PERMISSION. Le service
 * ne prend pas d'identifiant de personne à consulter : il prend celui de
 * l'APPELANT, et il n'existe aucun chemin pour lui en passer un autre. Voir
 * l'en-tête du contrôleur pour la conséquence — cette route ne réclame aucune
 * fonction nouvelle.
 *
 * ⚠ L'ANNÉE EST CELLE DE LA NOTICE (`publishYear`), pas une date de soutenance :
 * le profil académique n'en porte pas encore. Pour une thèse cataloguée l'année
 * de sa soutenance — le cas normal — les deux coïncident. Le jour où une date
 * de soutenance existe, c'est elle qu'il faudra servir, et ce commentaire est
 * là pour qu'on sache que le choix a été fait plutôt que subi.
 */
@Injectable()
export class EncadrementsService {
  async mesEncadrements(
    db: TenantDb,
    userId: string,
    options: { page?: number; limit?: number } = {},
  ): Promise<MesEncadrements> {
    const page = options.page ?? 1;
    const limit = options.limit ?? 50;

    const fiche = await this.ficheDe(db, userId);
    if (!fiche) {
      return {
        ficheLiee: false,
        nomDeLaFiche: null,
        total: 0,
        page,
        totalPages: 1,
        encadrements: [],
      };
    }

    // ⚠ LE MÊME `where` SERT AU COMPTAGE ET À LA PAGE : deux `where` divergents
    // donnent un `total` qui ne correspond pas aux lignes rendues, et l'écran
    // affiche un nombre de pages qu'il ne peut pas atteindre.
    const where = { authorId: fiche.id, role: ROLE_DIRECTEUR };
    const [total, lignes] = await Promise.all([
      db.recordContributor.count({ where }),
      db.recordContributor.findMany({
        where,
        select: {
          record: {
            select: {
              id: true,
              title: true,
              recordType: true,
              publishYear: true,
              defenseUniversity: true,
              contributors: {
                where: { role: 'AUTEUR_PRINCIPAL' },
                select: { name: true },
                orderBy: [{ position: 'asc' }, { id: 'asc' }],
                take: 1,
              },
            },
          },
        },
        // ⚠ LE DÉPARTAGE EST OBLIGATOIRE sous `skip` : l'année seule laisse des
        // ex æquo, et deux pages voisines se recouvriraient en en sautant
        // d'autres. C'est l'invariant de `pagination-departagee.spec.ts`.
        orderBy: [{ record: { publishYear: 'desc' } }, { record: { title: 'asc' } }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      ficheLiee: true,
      nomDeLaFiche: fiche.displayName,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
      encadrements: lignes.map((l) => versEncadrement(l.record)),
    };
  }

  /**
   * L'export — la pièce qui part dans le dossier.
   *
   * ⚠ IL N'EST PAS PAGINÉ, et c'est délibéré : une pièce justificative
   * tronquée à cinquante lignes sans le dire serait un faux dans un dossier de
   * promotion. Le volume est borné par la réalité — une carrière d'encadrement
   * se compte en dizaines.
   */
  async mesEncadrementsCsv(db: TenantDb, userId: string): Promise<string> {
    const fiche = await this.ficheDe(db, userId);
    if (!fiche) {
      // ⚠ ON N'EXPORTE PAS UN FICHIER VIDE QUI RESSEMBLE À UN RELEVÉ EXACT. Un
      // CSV à en-têtes seules se lit « cette personne n'a rien encadré », ce
      // qui est précisément ce qu'on ne sait pas. Le fichier dit pourquoi.
      return (
        CSV_BOM +
        toCsv(
          ['Encadrements'],
          [['Votre compte n’est relié à aucune fiche d’auteur : la liste ne peut pas être établie.']],
        )
      );
    }

    const lignes = await db.recordContributor.findMany({
      where: { authorId: fiche.id, role: ROLE_DIRECTEUR },
      select: {
        record: {
          select: {
            id: true,
            title: true,
            recordType: true,
            publishYear: true,
            defenseUniversity: true,
            contributors: {
              where: { role: 'AUTEUR_PRINCIPAL' },
              select: { name: true },
              orderBy: [{ position: 'asc' }, { id: 'asc' }],
              take: 1,
            },
          },
        },
      },
      orderBy: [{ record: { publishYear: 'desc' } }, { record: { title: 'asc' } }, { id: 'asc' }],
    });

    return (
      CSV_BOM +
      toCsv(
        ['Année', 'Étudiant', 'Titre', 'Type', 'Établissement de soutenance', 'Identifiant'],
        lignes.map((l) => {
          const e = versEncadrement(l.record);
          // ⚠ L'IDENTIFIANT, PAS UNE ADRESSE. L'API ne connaît pas le domaine
          // public de l'école — le composer ici produirait un lien faux dans
          // un document officiel. C'est à l'écran, qui le sait, de l'écrire.
          return [e.annee, e.etudiant, e.titre, e.type, e.universiteDeSoutenance, e.recordId];
        }),
      )
    );
  }

  /**
   * La fiche d'autorité rattachée à ce compte, s'il y en a une.
   *
   * ⚠ `Author.userId` est UNIQUE (P6-1) : une personne, une fiche. C'est ce qui
   * rend cette recherche exacte plutôt qu'approchante — chercher par nom
   * rattacherait les homonymes, et un homonyme dans un dossier de promotion est
   * une faute qu'on ne rattrape pas.
   */
  private ficheDe(db: TenantDb, userId: string) {
    return db.author.findUnique({
      where: { userId },
      select: { id: true, displayName: true },
    });
  }
}

function versEncadrement(record: {
  id: string;
  title: string;
  recordType: string;
  publishYear: number | null;
  defenseUniversity: string | null;
  contributors: { name: string }[];
}): Encadrement {
  return {
    recordId: record.id,
    titre: record.title,
    type: record.recordType,
    annee: record.publishYear,
    etudiant: record.contributors[0]?.name ?? null,
    universiteDeSoutenance: record.defenseUniversity,
  };
}
