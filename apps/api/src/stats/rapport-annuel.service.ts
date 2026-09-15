import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EtatDepot } from '../depots/etats';
import { USAGE_LECTURE, USAGE_TELECHARGEMENT } from './usage.service';
import {
  Bloc,
  LigneRepartition,
  PeriodeAnnuelle,
  appliquerSeuil,
  calcule,
  dernierJour,
  libellePeriode,
  nonCalculable,
} from './rapport-annuel';

type TenantDb = PrismaClient;

/**
 * ⚠ TYPÉS SUR LE VOCABULAIRE PARTAGÉ, jamais POSITIONNÉS. `ETATS_DEPOT[2]`
 * aurait compilé et changé de sens au premier réordonnancement du tableau —
 * plus fragile que la chaîne écrite en clair, qu'il prétendait remplacer.
 *
 * Sous cette forme, renommer un état dans `etats.ts` fait ÉCHOUER LA
 * COMPILATION ici, au lieu de rendre un compte à zéro dans un document remis à
 * une université.
 */
const VALIDE: EtatDepot = 'valide';
const REFUSE: EtatDepot = 'refuse';

export interface BlocFonds {
  documents: number;
  exemplaires: number;
  documentsNumeriques: number;
  cataloguesDansLAnnee: number;
  parCategorie: LigneRepartition[];
}
export interface BlocLecteurs {
  inscrits: number;
  actifsDansLAnnee: number;
  parCategorie: LigneRepartition[];
}
export interface BlocCirculation {
  prets: number;
  retours: number;
  pretsEnRetardAuTerme: number;
  tauxDeRotation: number | null;
}
export interface BlocNumerique {
  lecturesEnLigne: number;
  telechargements: number;
  lecturesHorsLigne: number;
}
export interface BlocDepot {
  deposes: number;
  soumis: number;
  valides: number;
  refuses: number;
  catalogues: number;
}

export interface RapportAnnuel {
  etablissement: string;
  annee: number;
  periode: { debut: string; fin: string; libelle: string };
  /** ⚠ Ce que le rapport NE PEUT PAS dire, en tête plutôt qu'en note de bas. */
  reserves: string[];
  fonds: Bloc<BlocFonds>;
  lecteurs: Bloc<BlocLecteurs>;
  circulation: Bloc<BlocCirculation>;
  numerique: Bloc<BlocNumerique>;
  depot: Bloc<BlocDepot>;
  diffusion: Bloc<never>;
}

/**
 * LE RAPPORT ANNUEL D'UNE BIBLIOTHÈQUE — ce qu'une directrice remet à son
 * université.
 *
 * *P8-2, 15 septembre 2026.*
 *
 * ⚠ TOUTES LES BORNES SONT SEMI-OUVERTES : `gte: debut, lt: fin`. Un prêt du
 * 31 décembre compte dans l'année, celui du 1er janvier suivant non. C'est le
 * cas qu'on rate toujours — une borne inclusive d'un côté et exclusive de
 * l'autre produit un chiffre faux d'un jour, invisible et permanent.
 *
 * ⚠ AUCUNE DONNÉE PERSONNELLE, ET AUCUN AGRÉGAT SOUS LE SEUIL. Voir
 * `appliquerSeuil` : un groupe de moins de cinq n'est pas publié, et la ligne
 * DIT pourquoi plutôt que de disparaître.
 */
@Injectable()
export class RapportAnnuelService {
  constructor(private readonly prisma: PrismaService) {}

  async produire(slug: string, nom: string, p: PeriodeAnnuelle): Promise<RapportAnnuel> {
    const db = this.prisma.forTenant(slug) as unknown as TenantDb;
    const dans = { gte: p.debut, lt: p.fin };

    const [fonds, lecteurs, circulation, numerique, depot] = await Promise.all([
      this.fonds(db, dans),
      this.lecteurs(db, dans),
      this.circulation(db, p),
      this.numerique(db, dans),
      this.depot(db, dans),
    ]);

    return {
      etablissement: nom,
      annee: p.annee,
      periode: {
        debut: p.debut.toISOString().slice(0, 10),
        // ⚠ LE DERNIER JOUR RÉELLEMENT COMPTÉ, pas la borne exclue. Le titre
        // doit dire la même chose que le chiffre.
        fin: dernierJour(p).toISOString().slice(0, 10),
        libelle: libellePeriode(p),
      },
      reserves: [
        'La date d’ACQUISITION d’un exemplaire n’est pas enregistrée : le bloc ' +
          '« fonds » compte les documents CATALOGUÉS dans l’année, ce qui peut ' +
          'différer de plusieurs mois des acquisitions réelles.',
        'Les consultations sont des ÉVÉNEMENTS, pas des personnes : deux ' +
          'ouvertures par le même lecteur comptent pour deux. Aucun ' +
          'identifiant d’utilisateur n’est enregistré.',
        `Un groupe de moins de 5 n’est pas publié : un effectif trop faible ` +
          `permettrait d’identifier des personnes, même sans les nommer.`,
      ],
      fonds,
      lecteurs,
      circulation,
      numerique,
      depot,
      // ⚠ ABSENT, ET NOMMÉ. Le serveur OAI ne journalise pas ses requêtes : le
      // chiffre n'existe pas. Un zéro se lirait « personne ne nous moissonne »,
      // ce qui est une AFFIRMATION que nous ne pouvons pas faire — et c'est
      // précisément celle qui prouverait la valeur DICAMES de l'école.
      diffusion: nonCalculable(
        'Les requêtes du serveur OAI-PMH ne sont pas journalisées : le nombre ' +
          'de notices moissonnées par des tiers n’est pas mesurable. Ce n’est ' +
          'pas zéro — c’est inconnu.',
      ),
    };
  }

  private async fonds(db: TenantDb, dans: { gte: Date; lt: Date }): Promise<Bloc<BlocFonds>> {
    const [documents, exemplaires, documentsNumeriques, cataloguesDansLAnnee, categories] =
      await Promise.all([
        db.biblioRecord.count(),
        db.item.count(),
        db.digitalCopy.count(),
        db.biblioRecord.count({ where: { createdAt: dans } }),
        db.biblioRecord.groupBy({ by: ['category'], _count: { _all: true } }),
      ]);

    return calcule({
      documents,
      exemplaires,
      documentsNumeriques,
      cataloguesDansLAnnee,
      // ⚠ Le seuil s'applique AUSSI au fonds : une catégorie à deux documents
      // sur un fonds pointu dit qui s'y intéresse.
      parCategorie: appliquerSeuil(
        categories
          .map((c) => ({ libelle: c.category ?? 'Sans catégorie', nombre: c._count._all }))
          .sort((a, b) => b.nombre - a.nombre),
      ),
    });
  }

  private async lecteurs(db: TenantDb, dans: { gte: Date; lt: Date }): Promise<Bloc<BlocLecteurs>> {
    const [inscrits, categories, actifs] = await Promise.all([
      db.patron.count(),
      db.patron.groupBy({ by: ['category'], _count: { _all: true } }),
      // ⚠ « ACTIF » = a emprunté dans l'année, et le `distinct` compte des
      // PERSONNES, pas des prêts. Sans lui, un lecteur assidu vaudrait dix.
      db.checkout.findMany({
        where: { checkoutDate: dans },
        select: { patronId: true },
        distinct: ['patronId'],
      }),
    ]);

    return calcule({
      inscrits,
      actifsDansLAnnee: actifs.length,
      parCategorie: appliquerSeuil(
        categories
          .map((c) => ({ libelle: c.category ?? 'Sans catégorie', nombre: c._count._all }))
          .sort((a, b) => b.nombre - a.nombre),
      ),
    });
  }

  private async circulation(db: TenantDb, p: PeriodeAnnuelle): Promise<Bloc<BlocCirculation>> {
    const dans = { gte: p.debut, lt: p.fin };
    const [prets, retours, retardAuTerme, exemplaires] = await Promise.all([
      db.checkout.count({ where: { checkoutDate: dans } }),
      db.checkout.count({ where: { returnDate: dans } }),
      // ⚠ « EN RETARD AU TERME DE LA PÉRIODE », pas « en retard aujourd'hui ».
      // Un rapport annuel décrit un ÉTAT DATÉ : relu en 2028, il doit rendre le
      // même chiffre qu'en 2027. `dueDate < fin` et pas encore rendu à cette
      // date-là.
      db.checkout.count({
        where: {
          dueDate: { lt: p.fin },
          OR: [{ returnDate: null }, { returnDate: { gte: p.fin } }],
        },
      }),
      db.item.count(),
    ]);

    return calcule({
      prets,
      retours,
      pretsEnRetardAuTerme: retardAuTerme,
      // ⚠ ABSENT plutôt que zéro quand il n'y a aucun exemplaire : une division
      // par zéro n'est pas « un taux de 0 », c'est un taux qui n'existe pas.
      tauxDeRotation: exemplaires > 0 ? Number((prets / exemplaires).toFixed(2)) : null,
    });
  }

  private async numerique(db: TenantDb, dans: { gte: Date; lt: Date }): Promise<Bloc<BlocNumerique>> {
    const [lectures, telechargements, horsLigne] = await Promise.all([
      db.usageEvent.count({ where: { kind: USAGE_LECTURE, occurredAt: dans } }),
      db.usageEvent.count({ where: { kind: USAGE_TELECHARGEMENT, occurredAt: dans } }),
      // Une licence émise = un document emporté hors ligne.
      db.offlineLicense.count({ where: { issuedAt: dans } }),
    ]);
    return calcule({ lecturesEnLigne: lectures, telechargements, lecturesHorsLigne: horsLigne });
  }

  private async depot(db: TenantDb, dans: { gte: Date; lt: Date }): Promise<Bloc<BlocDepot>> {
    // ⚠ CHAQUE COMPTE PORTE SA PROPRE DATE, et c'est ce qui rend le bloc juste.
    // Un dépôt créé en 2025 et validé en 2026 compte dans les DÉPOSÉS de 2025
    // et dans les VALIDÉS de 2026. Compter les cinq sur `createdAt` aurait
    // rendu un tableau cohérent et faux.
    const [deposes, soumis, valides, refuses, catalogues] = await Promise.all([
      db.deposit.count({ where: { createdAt: dans } }),
      db.deposit.count({ where: { submittedAt: dans } }),
      // ⚠ LE VOCABULAIRE VIENT DE `etats.ts`, jamais recopié : deux tableaux
      // qui se ressemblent finissent par diverger, et celui-ci décide de
      // chiffres remis à une université.
      db.deposit.count({ where: { decidedAt: dans, status: VALIDE } }),
      db.deposit.count({ where: { decidedAt: dans, status: REFUSE } }),
      db.deposit.count({ where: { decidedAt: dans, recordId: { not: null } } }),
    ]);
    return calcule({ deposes, soumis, valides, refuses, catalogues });
  }
}
