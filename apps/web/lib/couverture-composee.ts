/**
 * LA COUVERTURE COMPOSÉE — reprise À L'IDENTIQUE de
 * `docs/specification-couverture-composee.md`.
 *
 * > « Un même document ne peut pas avoir deux couvertures selon l'écran où on le
 * > regarde. »
 *
 * Référence : l'implémentation mobile (`couverture_generee.dart`,
 * `gafeso_theme.dart`). Ce fichier ne décide RIEN : toute valeur vient de la
 * spécification, et tout écart est un défaut.
 *
 * ## ⚠ POURQUOI ELLE EXISTE — la mesure, pas le goût
 *
 * Relevé du 09/10/2026 sur `tenant_zinda` : **481 notices sur 481** portent une
 * `coverUrl`, pour **6 fichiers distincts** — quatre-vingts notices par image.
 *
 * ⚠ CE NOMBRE A BOUGÉ DANS LA JOURNÉE, et c'est pourquoi une mesure porte
 * sa date : le backend a ajouté une notice « Gafeso — Guide d'utilisation »
 * à chaque école de développement le 9 octobre 2026 (481 sur zinda, 8 001
 * sur horizon). Mes deux relevés du matin et de l'après-midi disaient donc
 * 480 puis 481, tous les deux justes à leur heure.
 * Le fonds ne manque pas de couvertures : il en sert une par notice, et elles ne
 * distinguent rien.
 *
 * ⚠ **Elle ne remplace pas une vraie couverture** : quand une image existe et
 * qu'on sait la rendre, elle passe devant.
 */

/** Les douze teintes. Texte TOUJOURS blanc ; le pire couple vaut 6,26:1. */
export const PALETTE = [
  '#1B5E3F', // 0 vert profond (vert de marque)
  '#14492F', // 1 vert forêt
  '#2F6B55', // 2 vert-de-gris
  '#8A4A14', // 3 terre brûlée
  '#7A3A0C', // 4 brique
  '#6B4A10', // 5 ocre sombre
  '#28433A', // 6 ardoise verte
  '#4A2D3A', // 7 prune sourde
  '#1E3A5F', // 8 bleu encre
  '#3E5222', // 9 vert olive
  '#6E2F1B', // 10 rouille
  '#33305E', // 11 indigo sourd
] as const;

export const ENCRE = '#FFFFFF';
/** Le dos, et c'est la seule touche d'orange : le vert de marque est un FOND. */
export const DOS = '#E07A2B';

/**
 * LES DIX DOMAINES NOMMÉS.
 *
 * ⚠ UNE TABLE, ET PAS SEULEMENT UN HACHAGE — c'est arithmétique, pas un goût.
 * Mesuré dans la spécification sur ces dix domaines : FNV-1a sur 12 teintes n'en
 * rend que **6** distinctes (effet anniversaire), là où la table en rend **10**.
 * Un hachage ne peut pas éviter les collisions sur un ensemble CONNU.
 */
export const TEINTE_PAR_DOMAINE: Record<string, number> = {
  arts: 7,
  droit: 8,
  economie: 3,
  histoire: 6,
  informatique: 2,
  langues: 11,
  litterature: 10,
  medecine: 0,
  philosophie: 4,
  sciences: 9,
};

/**
 * FNV-1a 32 bits sur les unités de code — le repli pour un domaine hors table.
 *
 * ⚠ SURTOUT PAS LE HACHAGE DU LANGAGE : ni Dart ni JavaScript ne garantissent
 * `hashCode` stable entre exécutions ou versions. Une couverture qui change de
 * couleur au rechargement détruirait le seul service qu'elle rend — se
 * reconnaître.
 */
export function fnv1a32(texte: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i);
    // `Math.imul` : la multiplication 32 bits, sans perte de précision en f64.
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Le domaine se lit EN MINUSCULES ET DÉTOURÉ, comme le dit la spécification. */
export function indiceDeTeinte(domaine: string | null | undefined): number {
  const cle = (domaine ?? '').trim().toLowerCase();
  if (cle === '') return 0; // domaine vide ou nul → teinte 0
  const nomme = TEINTE_PAR_DOMAINE[cle];
  if (nomme !== undefined) return nomme;
  return fnv1a32(cle) % PALETTE.length;
}

export function teinte(domaine: string | null | undefined): string {
  return PALETTE[indiceDeTeinte(domaine)];
}

/**
 * LE CONTRASTE, CALCULÉ — jamais estimé.
 *
 * ⚠ Et il se livre avec un CONTRÔLE NÉGATIF : côté mobile,
 * `test/couleurs_test.dart` refuse de passer si blanc sur l'orange de marque
 * (3,01:1) était accepté. *Une formule fausse ne fait pas échouer les tests :
 * elle les fait tous passer.*
 */
function canal(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
export function luminance(hex: string): number {
  const n = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16));
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}
export function contraste(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/**
 * LES PROPORTIONS, toutes relatives à la hauteur `H`.
 *
 * ⚠ UNE SEULE COUVERTURE sert la liste et la fiche : deux jeux de constantes à
 * tenir d'accord divergeraient, et c'est « deux tableaux qui se ressemblent ».
 */
export const SEUIL_INITIALE = 80;

export interface Proportions {
  dos: number;
  margeGauche: number;
  margeDroite: number;
  margeHaut: number;
  margeBas: number;
  titre: number;
  auteur: number;
  type: number;
  annee: number;
  initiale: number;
  lignesDeTitre: number;
}

export function proportions(L: number, H: number): Proportions {
  return {
    dos: Math.min(6, Math.max(2, L * 0.055)),
    margeGauche: L * 0.14,
    margeDroite: L * 0.09,
    margeHaut: H * 0.08,
    margeBas: H * 0.07,
    titre: H * 0.082,
    auteur: H * 0.055,
    type: H * 0.04,
    annee: H * 0.046,
    initiale: H * 0.4,
    // 4 lignes, 5 si la hauteur dépasse 160.
    lignesDeTitre: H > 160 ? 5 : 4,
  };
}

/**
 * LA LARGEUR D'UN GLYPHE, PAR GRAISSE — MESURÉE, pas supposée.
 *
 * SVG ne renvoie pas à la ligne : il faut poser chaque ligne, donc estimer sa
 * largeur. J'avais d'abord écrit `0,52` pour toutes les graisses, en déclarant
 * l'approximation. **Elle était fausse, et une recette à l'écran l'a montrée** :
 * la première ligne d'un titre dépassait la marge droite de 7,4 px.
 *
 * Mesuré dans le navigateur, sur la police réelle (`ui-sans-serif, system-ui`),
 * en largeur moyenne par caractère et par pixel de corps :
 *
 * | graisse | « Mathématiques appliquées » | EN CAPITALES | « Précis de droit… » |
 * |---|---|---|---|
 * | 400 | 0,507 | 0,585 | 0,442 |
 * | 700 | 0,530 | 0,618 | 0,466 |
 *
 * ⚠ ET LE CAS QUI A DÉBORDÉ N'EST DANS AUCUNE DE CES COLONNES : « Mathématiques »
 * SEUL vaut **0,5705**, plus que la phrase entière. Les espaces sont étroits,
 * donc une moyenne calculée sur du texte espacé SOUS-ESTIME un mot isolé — et
 * une ligne de couverture est souvent un mot isolé.
 */
/**
 * ⭐ DEUX COEFFICIENTS, POUR DEUX MÉTIERS — et c'est une mesure qui l'a imposé.
 *
 * Avec un seul coefficient PRUDENT (0,57), le débordement disparaissait et la
 * composition se dégradait : mesuré sur la fiche, le titre passait à CINQ
 * lignes dont une portant le seul mot « et ». Avec un seul coefficient
 * OPTIMISTE (0,52), la composition était juste et la première ligne sortait de
 * 7,4 px.
 *
 * Les deux besoins ne sont pas le même :
 *
 * | | coefficient | pourquoi |
 * |---|---|---|
 * | **couper** en lignes | OPTIMISTE | c'est de l'esthétique : plus de texte par ligne, moins de mots orphelins |
 * | **détecter** un débordement | PRUDENT | c'est un filet : il doit attraper ce qui sortirait VRAIMENT |
 *
 * Un filet trop large ne protège pas ; une coupe trop prudente abîme sans
 * protéger davantage. Ils sont donc séparés — et le filet (`textLength`) rend
 * le débordement impossible quoi que la coupe ait décidé.
 */
const COUPE: Record<number, number> = { 400: 0.46, 500: 0.52, 600: 0.52, 700: 0.52 };
const FILET: Record<number, number> = { 400: 0.5, 500: 0.57, 600: 0.57, 700: 0.57 };

/** La largeur PRUDENTE — celle qui décide s'il faut contraindre la ligne. */
export function largeurEstimee(texte: string, taille: number, graisse: number): number {
  return texte.length * taille * (FILET[graisse] ?? 0.57);
}

/** Une ligne posée, et si sa largeur doit être CONTRAINTE pour tenir. */
export interface Ligne {
  texte: string;
  /**
   * ⭐ LE DÉBORDEMENT RENDU STRUCTURELLEMENT IMPOSSIBLE.
   *
   * ⚠ Aucun coefficient ne peut suffire : **un mot plus large que la zone
   * utile déborde quel que soit le budget**, puisqu'on ne coupe pas les mots.
   * Augmenter le coefficient ne fait que tronquer plus de titre — ça ne
   * supprime pas le cas.
   *
   * Quand l'estimation d'une ligne dépasse la zone utile, le SVG reçoit donc
   * `textLength` + `lengthAdjust="spacingAndGlyphs"` : le rendu est CONTRAINT
   * à la largeur utile, par le navigateur, qui lui connaît les vraies
   * métriques. Le mot est légèrement condensé plutôt que débordant ou coupé.
   *
   * ⚠ Et seulement quand c'est NÉCESSAIRE : poser `textLength` sur chaque
   * ligne ferait dépendre tout le rendu de mon estimation, et la déformerait
   * partout — alors qu'elle n'est fausse que sur les cas extrêmes.
   */
  ajustee: boolean;
}

/**
 * Découpe un texte en lignes pour un SVG, qui ne sait pas renvoyer à la ligne.
 *
 * L'ellipse se pose sur la DERNIÈRE ligne gardée, et seulement si du texte a
 * été écarté : une ellipse sur un texte complet annoncerait une suite qui
 * n'existe pas.
 */
/**
 * Les mots d'un titre — un TIRET SEUL n'en est pas un.
 *
 * ⚠ MESURÉ, pas supposé : sur les 481 notices de zinda (voir la note de date
 * en tête de fichier), **58,2 %** des titres
 * portent un tiret isolé (« Microfinance — perspectives contemporaines »), et
 * **2,9 % (14 notices)** produisaient une ligne réduite au seul tiret. Un
 * tiret cadratin orphelin sur une couverture se voit beaucoup pour ce qu'il
 * apporte.
 *
 * Il est donc RATTACHÉ au mot suivant — ou au précédent s'il termine le titre.
 * Ce n'est pas de la typographie fine : c'est le seul cas que la mesure
 * désigne.
 */
function mots(texte: string): string[] {
  const bruts = texte.split(/\s+/).filter(Boolean);
  const sortie: string[] = [];
  for (const m of bruts) {
    if (/^[—–-]$/.test(m) && sortie.length > 0 && sortie.length === bruts.length - 1) {
      // Tiret en FIN de titre : il n'y a plus de mot suivant.
      sortie[sortie.length - 1] += ` ${m}`;
      continue;
    }
    if (/^[—–-]$/.test(m)) {
      sortie.push(m);
      continue;
    }
    const prec = sortie[sortie.length - 1];
    if (prec !== undefined && /^[—–-]$/.test(prec)) {
      sortie[sortie.length - 1] = `${prec} ${m}`;
      continue;
    }
    sortie.push(m);
  }
  return sortie;
}

export function enLignes(
  texte: string,
  taille: number,
  largeur: number,
  max: number,
  graisse = 700,
): Ligne[] {
  // ⚠ LA COUPE est optimiste : c'est la largeur prudente, plus bas, qui
  // décide de contraindre. Les confondre dégradait la composition sans rien
  // protéger de plus.
  const parCaractere = taille * (COUPE[graisse] ?? 0.52);
  const budget = Math.max(1, Math.floor(largeur / parCaractere));
  const lignes: string[] = [];
  let courante = '';
  for (const mot of mots(texte)) {
    const essai = courante ? `${courante} ${mot}` : mot;
    if (essai.length <= budget) {
      courante = essai;
      continue;
    }
    if (courante) lignes.push(courante);
    courante = mot;
    if (lignes.length === max) break;
  }
  if (courante && lignes.length < max) lignes.push(courante);
  if (lignes.length > max) lignes.length = max;
  const complet = lignes.join(' ');
  const attendu = mots(texte).join(' ');
  if (complet !== attendu && lignes.length > 0) {
    const derniere = lignes[lignes.length - 1];
    lignes[lignes.length - 1] =
      derniere.length + 1 > budget
        ? `${derniere.slice(0, Math.max(0, budget - 1))}…`
        : `${derniere}…`;
  }
  return lignes.map((t) => ({
    texte: t,
    // ⚠ Un mot isolé peut dépasser le budget : la boucle le pose quand même,
    // parce que la seule alternative serait de couper le mot.
    ajustee: largeurEstimee(t, taille, graisse) > largeur,
  }));
}

/**
 * LE PLAN D'UNE COUVERTURE — pur, donc mesurable sans rendu.
 *
 * ⚠ Il est séparé du composant exprès : un garde qui monte un SVG mesure un
 * rendu ; celui-ci mesure la DÉCISION — quels champs apparaissent, combien de
 * lignes, quelle teinte. C'est ce qui permet au contrôle négatif de tomber sur
 * l'assertion visée plutôt que sur un arbre de nœuds.
 */
export interface Notice {
  titre: string;
  /** ⚠ `null` quand la couverture jouxte déjà un bloc titre-auteur. */
  auteur?: string | null;
  /** Le libellé LISIBLE de `recordType`, jamais l'identifiant brut. */
  type?: string | null;
  annee?: number | null;
  /** `category`, tel que l'API le sert — ni retouché, ni normalisé. */
  domaine?: string | null;
}

export interface Plan {
  teinte: string;
  /** En dessous de `H = 80`, seule l'initiale du titre. */
  initialeSeule: boolean;
  initiale: string | null;
  lignesTitre: Ligne[];
  lignesAuteur: Ligne[];
  type: string | null;
  annee: string | null;
  p: Proportions;
}

export function planDeCouverture(n: Notice, L: number, H: number): Plan {
  const p = proportions(L, H);
  const fond = teinte(n.domaine);
  const titre = (n.titre ?? '').trim();

  if (H < SEUIL_INITIALE) {
    // ⚠ Un titre vide ne devient pas une lettre inventée : il n'y a rien.
    const premier = [...titre][0];
    return {
      teinte: fond,
      initialeSeule: true,
      initiale: premier ? premier.toLocaleUpperCase('fr') : null,
      lignesTitre: [],
      lignesAuteur: [],
      type: null,
      annee: null,
      p,
    };
  }

  const utile = L - p.margeGauche - p.margeDroite;
  const auteur = (n.auteur ?? '').trim();
  const type = (n.type ?? '').trim();
  return {
    teinte: fond,
    initialeSeule: false,
    initiale: null,
    lignesTitre: titre ? enLignes(titre, p.titre, utile, p.lignesDeTitre, 700) : [],
    lignesAuteur: auteur ? enLignes(auteur, p.auteur, utile, 2, 400) : [],
    // ⚠ AUCUN CHAMP N'EST INVENTÉ : absent veut dire ABSENT, jamais « — »,
    // jamais « s.d. », jamais « Auteur inconnu ».
    type: type ? type.toLocaleUpperCase('fr') : null,
    annee: typeof n.annee === 'number' ? String(n.annee) : null,
    p,
  };
}
