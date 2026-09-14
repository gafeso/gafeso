/**
 * UN LECTEUR ISO 2709 ÉCRIT DEPUIS LA NORME — et pas depuis `marcjs`.
 *
 * ⚠ POURQUOI IL EXISTE. Notre export MARC est produit par `marcjs`. Le relire
 * avec `marcjs` ne prouverait rien : une hypothèse fausse partagée par
 * l'écrivain et le lecteur fait un aller-retour parfait et un fichier que
 * personne d'autre ne sait ouvrir. C'est la boucle fermée.
 *
 * Aucun validateur tiers n'est installé sur la machine (`yaz-marcdump`,
 * `xmllint`, `pymarc` : absents), et ajouter une dépendance se demande. Ce
 * fichier est donc la réponse honnête : **une seconde implémentation, écrite
 * d'après la spécification**, exactement comme la migration SQL d'un lot a été
 * confrontée au calcul TypeScript du même lot.
 *
 * ⚠ CE QU'IL EST, ET CE QU'IL N'EST PAS. Ce n'est pas un validateur tiers :
 * c'est un second avis. Il ne dit pas « une bibliothèque du monde entier lira
 * ce fichier » ; il dit « ce fichier respecte la structure que la norme décrit,
 * mesurée par un code qui ne partage rien avec celui qui l'a produit ».
 *
 * ## La structure, telle que la norme la fixe
 *
 * ```
 *   [0..4]   longueur totale de l'enregistrement, en OCTETS, sur 5 chiffres
 *   [5..23]  reste du label (24 octets en tout)
 *   [24..]   répertoire : entrées de 12 octets — tag(3) longueur(4) début(5)
 *            terminé par 0x1E
 *            puis les champs, chacun terminé par 0x1E
 *            l'enregistrement se termine par 0x1D
 * ```
 *
 * ⚠ **LES LONGUEURS SONT EN OCTETS, PAS EN CARACTÈRES**, et c'est tout l'objet.
 * « Ouédraogo » fait dix caractères et onze octets en UTF-8. Un producteur qui
 * compte en caractères écrit un répertoire dont les décalages glissent à la
 * première lettre accentuée — c'est-à-dire sur presque toutes nos notices. Le
 * fichier reste lisible par un lecteur qui fait la même erreur, et par personne
 * d'autre.
 */

export const SEPARATEUR_CHAMP = 0x1e;
export const SEPARATEUR_ENREGISTREMENT = 0x1d;
export const SEPARATEUR_SOUS_CHAMP = 0x1f;
const TAILLE_LABEL = 24;
const TAILLE_ENTREE = 12;

export interface ChampLu {
  tag: string;
  /** Contenu brut du champ, séparateurs de sous-champ compris. */
  valeur: string;
}

export interface NoticeLue {
  label: string;
  champs: ChampLu[];
}

export interface AnomalieIso2709 {
  notice: number;
  quoi: string;
}

/**
 * Lit un flux ISO 2709 et rend les notices AVEC les anomalies rencontrées.
 *
 * ⚠ IL NE LÈVE PAS : une lecture qui s'arrête à la première anomalie ne dit
 * qu'une chose, alors qu'on veut savoir combien de notices sont atteintes et
 * comment. Les anomalies sont des CONSTATS, et c'est l'appelant qui décide.
 */
export function lireIso2709(flux: Buffer): { notices: NoticeLue[]; anomalies: AnomalieIso2709[] } {
  const notices: NoticeLue[] = [];
  const anomalies: AnomalieIso2709[] = [];
  let position = 0;
  let numero = 0;

  while (position < flux.length) {
    numero += 1;
    if (flux.length - position < TAILLE_LABEL) {
      anomalies.push({ notice: numero, quoi: `reste ${flux.length - position} octets : label tronqué` });
      break;
    }

    const label = flux.subarray(position, position + TAILLE_LABEL).toString('latin1');
    const longueurAnnoncee = Number(label.slice(0, 5));
    if (!Number.isInteger(longueurAnnoncee) || longueurAnnoncee <= 0) {
      anomalies.push({ notice: numero, quoi: `longueur illisible : « ${label.slice(0, 5)} »` });
      break;
    }
    if (position + longueurAnnoncee > flux.length) {
      anomalies.push({
        notice: numero,
        quoi: `longueur annoncée ${longueurAnnoncee} dépasse le flux (${flux.length - position} restants)`,
      });
      break;
    }

    const brut = flux.subarray(position, position + longueurAnnoncee);
    if (brut[brut.length - 1] !== SEPARATEUR_ENREGISTREMENT) {
      anomalies.push({
        notice: numero,
        quoi: `l'octet final n'est pas 0x1D (0x${brut[brut.length - 1]?.toString(16)}) — le décompte est FAUX`,
      });
    }

    // ── Le répertoire, jusqu'au premier 0x1E.
    const finRepertoire = brut.indexOf(SEPARATEUR_CHAMP, TAILLE_LABEL);
    if (finRepertoire < 0) {
      anomalies.push({ notice: numero, quoi: 'aucun séparateur de fin de répertoire' });
      position += longueurAnnoncee;
      continue;
    }
    const octetsRepertoire = finRepertoire - TAILLE_LABEL;
    if (octetsRepertoire % TAILLE_ENTREE !== 0) {
      anomalies.push({
        notice: numero,
        quoi: `répertoire de ${octetsRepertoire} octets : non multiple de ${TAILLE_ENTREE}`,
      });
    }

    // `baseAddress` : où commencent les données, annoncé dans le label [12..16].
    const baseAnnoncee = Number(label.slice(12, 17));
    if (baseAnnoncee !== finRepertoire + 1) {
      anomalies.push({
        notice: numero,
        quoi: `adresse de base annoncée ${baseAnnoncee}, répertoire terminé à ${finRepertoire + 1}`,
      });
    }

    const champs: ChampLu[] = [];
    for (let i = TAILLE_LABEL; i + TAILLE_ENTREE <= finRepertoire; i += TAILLE_ENTREE) {
      const entree = brut.subarray(i, i + TAILLE_ENTREE).toString('latin1');
      const tag = entree.slice(0, 3);
      const longueur = Number(entree.slice(3, 7));
      const debut = Number(entree.slice(7, 12));
      if (!Number.isInteger(longueur) || !Number.isInteger(debut)) {
        anomalies.push({ notice: numero, quoi: `entrée de répertoire illisible : « ${entree} »` });
        continue;
      }

      // ⚠ LA VÉRIFICATION QUI COMPTE : le champ désigné par (début, longueur)
      // doit se terminer EXACTEMENT sur un séparateur de champ. Un décalage
      // d'un octet — une lettre accentuée comptée pour un — se voit ici et
      // nulle part ailleurs.
      const debutAbsolu = baseAnnoncee + debut;
      const finAbsolue = debutAbsolu + longueur - 1;
      if (finAbsolue >= brut.length) {
        anomalies.push({
          notice: numero,
          quoi: `champ ${tag} : déborde de l'enregistrement (fin ${finAbsolue} / ${brut.length})`,
        });
        continue;
      }
      if (brut[finAbsolue] !== SEPARATEUR_CHAMP) {
        anomalies.push({
          notice: numero,
          quoi:
            `champ ${tag} : ne se termine pas sur 0x1E mais sur 0x${brut[finAbsolue].toString(16)} ` +
            `— décalage du répertoire (longueurs comptées en CARACTÈRES et non en octets ?)`,
        });
      }
      champs.push({
        tag,
        valeur: brut.subarray(debutAbsolu, finAbsolue).toString('utf8'),
      });
    }

    notices.push({ label, champs });
    position += longueurAnnoncee;
  }

  return { notices, anomalies };
}
