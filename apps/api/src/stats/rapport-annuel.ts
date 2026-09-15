/**
 * LE RAPPORT ANNUEL — ses bornes, ses types, et son seuil.
 *
 * *P8-2, 15 septembre 2026.*
 *
 * ⚠ CE N'EST PAS UN TABLEAU DE BORD. Le tableau de bord sert au quotidien et
 * répond « comment ça va » ; celui-ci est le document qu'une directrice remet
 * à son université une fois par an, et qu'elle fait à la main aujourd'hui. Il
 * est lu par des gens qui n'ont pas construit le produit, et il sert à décider
 * d'un budget — un zéro faux y coûte plus que partout ailleurs.
 */

/** Le seuil au-dessous duquel un groupe n'est pas publié. */
export const SEUIL_PETITE_POPULATION = 5;

/**
 * ⚠ UN BLOC EST CALCULÉ OU IL EST ABSENT AVEC SON MOTIF — jamais rempli de
 * zéros.
 *
 * Union DISCRIMINÉE, et pas un objet à champs optionnels : le compilateur
 * oblige alors chaque lecteur à traiter les deux cas. Un `valeurs?: T` se lit
 * sans y penser, et « absent » se confondrait avec « vide ».
 */
export type Bloc<T> =
  | { etat: 'calcule'; valeurs: T }
  | { etat: 'non_calculable'; motif: string };

export const calcule = <T>(valeurs: T): Bloc<T> => ({ etat: 'calcule', valeurs });
export const nonCalculable = <T>(motif: string): Bloc<T> => ({ etat: 'non_calculable', motif });

/**
 * Une ligne de répartition. `masque` remplace l'effectif quand le groupe est
 * trop petit — voir `appliquerSeuil`.
 */
export interface LigneRepartition {
  libelle: string;
  nombre: number | null;
  /** Renseigné UNIQUEMENT quand `nombre` est `null`. Dit pourquoi. */
  masque?: string;
}

/**
 * ⚠ UN AGRÉGAT SUR UNE PETITE POPULATION EST UNE DONNÉE PERSONNELLE DÉGUISÉE.
 *
 * « Classe L1 Droit : 3 emprunteurs, 47 prêts » ne porte aucun nom — et c'est
 * le dossier de lecture de trois personnes qu'un collègue peut nommer. Dans
 * une université, tout le monde sait qui est en M2 Droit privé quand ils sont
 * quatre.
 *
 * ⚠ LA LIGNE RESTE, ET ELLE DIT POURQUOI. La supprimer ferait disparaître le
 * groupe du rapport : un lecteur en conclurait qu'il n'existe pas, ou que son
 * effectif est nul. C'est exactement le faux que ce rapport existe pour
 * éviter — une absence muette se lit comme un zéro.
 */
export function appliquerSeuil(lignes: LigneRepartition[]): LigneRepartition[] {
  return lignes.map((l) =>
    l.nombre !== null && l.nombre > 0 && l.nombre < SEUIL_PETITE_POPULATION
      ? {
          libelle: l.libelle,
          nombre: null,
          masque: `effectif inférieur à ${SEUIL_PETITE_POPULATION} — non publié`,
        }
      : l,
  );
}

/** Les bornes d'une année civile, et ce qu'on en AFFICHE. */
export interface PeriodeAnnuelle {
  /** Inclus. */
  debut: Date;
  /** ⚠ EXCLU — comme partout dans `stats` : les requêtes font `gte/lt`. */
  fin: Date;
  annee: number;
}

/**
 * ⚠ LA BORNE HAUTE EST EXCLUE DANS LE CALCUL ET INCLUSE DANS L'AFFICHAGE, et
 * c'est le défaut que ce fichier corrige.
 *
 * `reportCsv` imprimait `period.to` telle quelle : un rapport 2026 s'intitulait
 * « 2026-01-01 → 2027-01-01 ». Le calcul était juste — toutes les requêtes font
 * `gte: from, lt: to` —, l'étiquette était fausse d'un jour. Un prêt du
 * 31 décembre compte dans l'année, celui du 1er janvier suivant non ; le titre
 * doit dire la même chose que le chiffre.
 */
export function annee(n: number): PeriodeAnnuelle {
  return {
    debut: new Date(Date.UTC(n, 0, 1)),
    fin: new Date(Date.UTC(n + 1, 0, 1)),
    annee: n,
  };
}

/** Le dernier jour RÉELLEMENT compté — `fin` moins un jour. */
export function dernierJour(p: PeriodeAnnuelle): Date {
  return new Date(p.fin.getTime() - 24 * 60 * 60 * 1000);
}

/** « du 1er janvier au 31 décembre 2026 » — ce que le document porte en tête. */
export function libellePeriode(p: PeriodeAnnuelle): string {
  const jour = (d: Date) => {
    const mois = [
      'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
      'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
    ];
    const n = d.getUTCDate();
    return `${n === 1 ? '1er' : n} ${mois[d.getUTCMonth()]}`;
  };
  return `du ${jour(p.debut)} au ${jour(dernierJour(p))} ${p.annee}`;
}
