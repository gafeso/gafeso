import {
  CANEVAS,
  GABARIT_DE_REPLI,
  MOTIFS,
  POSITIONS,
  TEINTE_DU_DOMAINE,
  type IdGabarit,
} from '@/lib/couvertures-v3.generated';

/**
 * ⭐⭐ LA COUVERTURE v3 — fond de domaine, motif de type, texte en HTML.
 *
 * ## ⚠ CE QUE LE SERVEUR DÉCIDE, ET CE QUE JE NE REFAIS PAS
 *
 * `coverTemplate` et `coverDomain` sont **résolus par l'API** : NFC, minuscules,
 * détourage, table et repli déjà appliqués. Jamais `null`, jamais hors liste.
 *
 * > ⚠ « Vous n'avez donc plus à normaliser ni à replier. Si vous le refaites,
 * >   vous le referez autrement — et trois clients composeraient trois
 * >   couvertures pour un même document. » *(session backend, 12 octobre 2026)*
 *
 * Ce composant ne connaît donc ni `category` ni `recordType`. Il reçoit deux
 * clés et les LIT dans une table.
 *
 * ## ⚠ LE POIDS, ET POURQUOI CETTE DÉCOUPE
 *
 * Les huit fichiers du fournisseur portent **le logo complet — 9 670 octets —
 * dans CHACUN**, soit 92 % du plus léger. Donc :
 *
 * | | |
 * |---|---|
 * | le logo | un `<img>` vers un fichier **déjà public**, mis en cache, blanchi en CSS |
 * | le motif | inline, 310 à 2 649 octets, **celui du type affiché seulement** |
 * | le fond, le filet, les textes | du HTML et du CSS — zéro octet d'image |
 *
 * ⚠ **Le logo n'est PAS celui du fournisseur, et c'est une divergence
 * DÉCLARÉE.** `docs/couvertures/source/` est retenu de la publication jusqu'à la
 * cession de droits ; recopier son tracé dans `public/` défaisait la retenue par
 * un autre chemin. On emploie `public/marque/`, public depuis le 11 septembre
 * 2026. Le jour de la cession, c'est une ligne.
 *
 * ⭐ **LES POLICES SONT CELLES DU MOBILE**, auto-hébergées en woff2 sous
 * `/polices/`, dérivées de ses fichiers exacts (sha256 dans
 * `public/polices/POLICES.json`). Aucun appel à Google Fonts.
 *
 * ⚠ ET CHAQUE USAGE POSE SA VARIATION. `SourceSans3-Variable` porte l'axe
 * `wght` 200–900 avec un **défaut à 200** : un bloc qui n'exprime rien sort en
 * maigre extrême, et un bloc qui demande 600 sans toucher l'axe obtient un FAUX
 * GRAS synthétisé. `Poppins-Bold`, elle, n'a **aucun axe** — fonte statique
 * déjà en 700 — donc on ne lui demande que 700, et une variation n'y ferait
 * rien. Mesuré dans leurs tables `fvar`.
 *
 * `couverture-v3-polices.spec.tsx` tombe si l'une des variations disparaît.
 *
 * ## ⚠ ELLE EST DÉCORATIVE — `aria-hidden`, et son appelant DOIT afficher le texte
 *
 * Elle double le titre, l'auteur, le type et l'année affichés à côté d'elle. Un
 * `aria-label` ferait tout annoncer deux fois. ⚠ Le corollaire tient : une
 * couverture posée SEULE serait une information inaccessible.
 */

/**
 * ⭐⭐ LA GRAINE — et son algorithme est PRESCRIT, pas choisi.
 *
 * *Décision du 12 octobre 2026 : « graine FNV-1a (titre NFC, minuscules,
 * espaces réduits, xorshift32) ».*
 *
 * ## ⚠ LA NORMALISATION FAIT PARTIE DE LA GRAINE
 *
 * Trois gestes avant le hachage, et chacun répond à un écart observé entre deux
 * saisies du même document :
 *
 * | Geste | Ce qu'il évite |
 * |---|---|
 * | `NFC` | « Ouédraogo » décomposé et composé ne sont pas la même chaîne — ce dépôt l'a payé sur le fichier d'autorités |
 * | minuscules | une casse de saisie changerait le dessin |
 * | espaces réduits | un double espace invisible le changerait aussi |
 *
 * ⚠ **Sans eux, deux notices identiques à l'œil rendraient deux couvertures.**
 * C'est le seul service qu'une couverture engendrée rend : être la MÊME.
 *
 * ## 🔴 ET LA PARITÉ AVEC LE MOBILE N'EST PAS ENCORE MESURÉE
 *
 * La référence est `docs/couvertures/references-parite.json`, produite par la
 * session mobile — **absente du dépôt au 12 octobre 2026**. Tant qu'elle
 * manque, cette dérivation est l'algorithme prescrit appliqué de bonne foi, et
 * rien ne prouve qu'elle rend les mêmes nombres.
 *
 * ⚠ **En cas d'écart, c'est le WEB qui a tort** (décision). Les quatre valeurs
 * sont donc dérivées d'un flot nommé et borné, pour qu'un écart se corrige en
 * un endroit : `suivant()`.
 */
function normaliser(titre: string): string {
  return titre.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** FNV-1a 32 bits sur les points de code de la chaîne normalisée. */
function fnv1a(texte: string): number {
  let h = 0x811c9dc5;
  for (const c of texte) {
    h ^= c.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * ⭐⭐ LA DÉRIVATION, MESURÉE CONTRE LA RÉFÉRENCE DU MOBILE — et il n'y a AUCUN
 * xorshift.
 *
 * ## ⚠ LA CONSIGNE DISAIT « xorshift32 ». LA RÉFÉRENCE DIT AUTRE CHOSE.
 *
 * `docs/couvertures/references-parite.json` donne, pour cinq titres, la graine
 * ET les six valeurs attendues. Cherchée par la mesure plutôt que devinée,
 * la dérivation est faite de **TRANCHES DE LA GRAINE espacées de cinq bits** :
 *
 * | champ | dérivation | exact sur |
 * |---|---|---|
 * | `dx` | `(g >>> 0) % 21 − 10` | 5/5 |
 * | `dy` | `(g >>> 5) % 21 − 10` | 5/5 |
 * | `echelle` | `0,92 + ((g >>> 10) % 17) / 100` | 5/5 |
 * | `rotation` | `(g >>> 15) % 9 − 4` | 5/5 |
 * | `elements` | `((g >>> 20) % 4) + 5` — **calculé, NON appliqué** | 5/5 |
 * | `opacite` | `(10 + (g >>> 24) % 10) / 100` | 5/5 |
 *
 * ⚠ **Aucun xorshift ne reproduit ces valeurs** : j'ai balayé les 32×32×32
 * triplets de décalages, dans les deux sens, en exigeant `dy` au pas 1 — zéro
 * solution. Et `dx` sort de la graine BRUTE (index 0), ce qu'un générateur
 * avancé d'un pas ne donne pas.
 *
 * ⭐ C'est donc ma PREMIÈRE écriture qui avait la bonne forme — des tranches —
 * et je l'avais « corrigée » en xorshift parce que la consigne nommait ce mot.
 * « Une consigne reçue peut porter une prémisse fausse » : la référence est
 * l'autorité, pas le mot.
 *
 * ⚠ Et la portée de ce que je peux affirmer : 5 titres × 6 champs = 30
 * contraintes satisfaites. C'est fort, ce n'est pas une preuve. Si le mobile
 * ajoute des références, `couverture-v3-parite.spec.ts` tranchera — il LIT le
 * fichier, il ne recopie rien.
 *
 * ## ⚠ `elements` EST CALCULÉ ET JETÉ, et la référence le dit
 *
 * > « Le champ motif.elements est CALCULÉ mais NON APPLIQUÉ : les motifs livrés
 * >   portent de 3 (manuel) à 54 (actes) éléments. "5–8" décrit comment les
 * >   gabarits ont été dessinés, pas un réglage par titre. »
 *
 * Il est donc rendu ici — pour que la parité le vérifie — et le composant ne
 * s'en sert pas. Un champ calculé et jeté se DIT, sinon le prochain passage le
 * supprime en croyant nettoyer.
 */
/**
 * ⭐⭐ LE TITRE EST COUPÉ ICI, et c'est ce qui rend sa POSITION exacte.
 *
 * ## ⚠ POURQUOI UN LAISSER-FAIRE DU NAVIGATEUR NE SUFFIT PAS
 *
 * La source donne un `y` PAR NOMBRE DE LIGNES — 467, 425, 390, 348 — et ce
 * n'est ni un ancrage par le haut ni par le bas : la dernière ligne tombe à 467
 * à 1 et 2 lignes, et à **474** à 3 et 4.
 *
 * Un bloc ancré par le bas en CSS donne donc 467 pour les quatre : exact à 1–2
 * lignes, **7 px trop haut à 3–4**. Et du CSS ne peut pas choisir une position
 * selon un nombre de lignes qu'il ne connaît qu'APRÈS la mise en page.
 *
 * ⭐ D'où la coupe explicite : on estime les lignes, on les REND une par une, et
 * on pose le bloc à `y_by_line_count[n]`. L'écart à la référence tombe alors à
 * **0 px** — et il ne peut pas dériver, puisque le nombre de lignes rendues EST
 * celui qui a décidé de la position.
 *
 * ## ⚠ LE COEFFICIENT VIENT DE LA v2, et il était mesuré là-bas
 *
 * `0,52 × taille` par caractère pour une graisse 700 : c'est la valeur que la
 * couverture dessinée employait, « optimiste » parce que la coupe est de
 * l'esthétique. Elle est reprise telle quelle plutôt que réinventée.
 *
 * ⚠ Et sa borne : c'est une ESTIMATION, pas une mesure de fonte. Une ligne peut
 * donc être un peu courte ou un peu longue à l'œil. Ce qui ne dérive pas, en
 * revanche, c'est la POSITION — parce que les deux viennent du même compte.
 */
export function titreEnLignes(titre: string, max = POSITIONS.title.max_lines): string[] {
  const parCaractere = POSITIONS.title.font_size_px * 0.52;
  const budget = Math.max(1, Math.floor(POSITIONS.title.max_width_px / parCaractere));
  const lignes: string[] = [];
  let courante = '';
  for (const mot of titre.split(/\s+/).filter(Boolean)) {
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
  return lignes.length > 0 ? lignes : [''];
}

/** Le `y` du HAUT du bloc de titre, lu dans la source pour ce nombre de lignes. */
export function hautDuTitre(lignes: number): number {
  const table = POSITIONS.title.y_by_line_count as Record<string, number>;
  const n = Math.min(Math.max(lignes, 1), POSITIONS.title.max_lines);
  return table[String(n)];
}

export function variationDeCouverture(titre: string) {
  const g = fnv1a(normaliser(titre));
  const tranche = (decalage: number, modulo: number) => ((g >>> decalage) % modulo + modulo) % modulo;
  return {
    dx: tranche(0, 21) - 10,
    dy: tranche(5, 21) - 10,
    echelle: Number((0.92 + tranche(10, 17) / 100).toFixed(2)),
    rotation: tranche(15, 9) - 4,
    /** ⚠ CALCULÉ, NON APPLIQUÉ — la géométrie du gabarit est rendue telle quelle. */
    elements: tranche(20, 4) + 5,
    opacite: Number(((10 + tranche(24, 10)) / 100).toFixed(2)),
  };
}

export function CouvertureV3({
  coverTemplate,
  coverDomain,
  type,
  titre,
  auteur,
  annee,
  etablissement,
  largeur,
  className,
}: {
  /**
   * ⚠ LES DEUX CLÉS ACCEPTENT L'ABSENCE, et le repli est PRESCRIT :
   * clé absente → `manuel` / `autre`, **jamais l'ancienne vignette**
   * (décision du 12 octobre 2026).
   *
   * Motif : trois routes ne servent pas encore ces champs. Garder la v2 sur
   * ces écrans ferait deux dessins pour un même document ; retomber sur
   * `manuel`/`autre` en fait un seul, et le fond NEUTRE d'`autre` n'affirme
   * aucun domaine — « un fond de domaine faux est pire qu'un fond neutre : il
   * affirme ».
   */
  coverTemplate?: string | null;
  coverDomain?: string | null;
  /**
   * ⚠ LE LIBELLÉ DE TYPE, et il est OPTIONNEL POUR UNE RAISON. La couverture
   * est `aria-hidden` : elle ne peut porter que ce que la page affiche DÉJÀ en
   * texte. La fiche publique n'affiche `recordType` NULLE PART — le poser ici
   * le rendrait accessible à l'œil SEUL. L'affiche A4, elle, l'imprime en
   * texte : elle le passe.
   *
   * `couverture-branchee.spec.tsx` tient cette propriété dans les deux sens.
   */
  type?: string | null;
  titre: string;
  auteur?: string | null;
  annee?: number | string | null;
  etablissement?: string | null;
  /** Largeur en pixels CSS. La hauteur suit le ratio 5:7 du maître. */
  largeur: number;
  className?: string;
}) {
  const e = largeur / CANEVAS.width;
  const hauteur = largeur * (CANEVAS.height / CANEVAS.width);
  /*
   * ⚠ LE REPLI EST MORT ET GARDÉ, avec sa raison. Le contrat dit « jamais hors
   * liste » ; si l'API changeait, une clé inconnue rendrait `undefined` et le
   * fond serait TRANSPARENT — un texte blanc sur blanc, illisible. Un repli mort
   * et JUSTE vaut mieux qu'un repli absent et faux.
   */
  const fond = TEINTE_DU_DOMAINE[coverDomain ?? ''] ?? TEINTE_DU_DOMAINE.autre;
  const motif =
    MOTIFS[(coverTemplate ?? '') as IdGabarit] ?? MOTIFS[GABARIT_DE_REPLI as IdGabarit];
  const v = variationDeCouverture(titre);
  const lignesDuTitre = titreEnLignes(titre);
  const p = POSITIONS;
  const px = (n: number) => `${n * e}px`;
  /**
   * ⭐⭐ LA VARIANTE MINIATURE — et c'est la réponse v3 au seuil des 80 px.
   *
   * La spécification du fournisseur livre `thumbnail_px: [56, 78]` et un
   * `thumbnail_variant` : le logo SYMBOLE, sans texte.
   *
   * ⚠ Mesuré, et c'est ce qui l'impose : à 56 px de large, le titre tombe à
   * **3,7 px** (33 px × 56/500). La v2 répondait « l'initiale seule » ; la v3
   * répond « aucun texte », ce qui est plus franc — une initiale seule est
   * encore une information que personne ne lit à cette taille, et le titre est
   * affiché en texte juste à côté.
   *
   * ⚠ Le seuil est le MÊME que celui de la v2 (80 px), pour que l'étagère ne
   * change pas d'aspect au-delà du dessin.
   */
  const miniature = largeur < 80;
  /*
   * ⚠ LES DEUX FAMILLES, avec leur repli. `font-display: swap` fait que le
   * repli s'affiche le temps du chargement : il doit donc ressembler, sinon la
   * couverture saute.
   */
  const POPPINS = "'Poppins Gafeso', 'Trebuchet MS', sans-serif";
  const SOURCE = "'Source Sans 3 Gafeso', 'Segoe UI', sans-serif";
  /**
   * ⭐ LA GRAISSE EST POSÉE DEUX FOIS, et ce n'est pas une redondance.
   *
   * `fontWeight` dit au navigateur QUELLE graisse on veut ;
   * `fontVariationSettings` BOUGE l'axe de la fonte variable. Sans le second,
   * le navigateur SYNTHÉTISE — il épaissit les traits lui-même, et le résultat
   * ne ressemble pas à la fonte du mobile.
   *
   * ⚠ Pour Poppins (statique, 700) la variation est inutile : on ne la pose
   * pas, et on ne demande que 700.
   */
  const graisse = (n: number) => ({ fontWeight: n, fontVariationSettings: `'wght' ${n}` });

  return (
    <div
      aria-hidden="true"
      className={className}
      style={{
        position: 'relative',
        width: largeur,
        height: hauteur,
        background: fond,
        borderRadius: px(22),
        overflow: 'hidden',
        color: '#FFFFFF',
      }}
    >
      {/* Le motif : géométrie nue, variation appliquée ICI. */}
      <svg
        viewBox={`0 0 ${CANEVAS.width} ${CANEVAS.height}`}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        focusable="false"
      >
        <g
          transform={`translate(${v.dx},${v.dy}) rotate(${v.rotation} 250 170) scale(${v.echelle})`}
          opacity={v.opacite}
          dangerouslySetInnerHTML={{ __html: motif }}
        />
      </svg>

      {/*
        ⚠ `alt=""` : la couverture entière est `aria-hidden`, et un logo annoncé
        répéterait le nom de l'établissement déjà affiché à côté.
        ⚠ `filter` : le fichier public est en couleurs de marque ; la couverture
        le veut BLANC. `brightness(0) invert(1)` le rend blanc pur quel que soit
        son tracé — aucun octet neuf, aucune variante à maintenir.
      */}
      <img
        src={miniature ? '/marque/gafeso_icone_simplifiee.svg' : '/marque/gafeso_horizontal.svg'}
        alt=""
        style={{
          position: 'absolute',
          left: px(p.logo.x),
          top: px(p.logo.y),
          width: px(miniature ? p.logo.height : p.logo.width),
          height: px(p.logo.height),
          objectFit: 'contain',
          objectPosition: 'left top',
          filter: 'brightness(0) invert(1)',
        }}
      />

      {!miniature && type ? (
      <div
        style={{
          position: 'absolute',
          left: px(p.type.x),
          top: px(p.type.y),
          width: px(p.type.max_width_px),
          fontSize: px(p.type.font_size_px),
          lineHeight: px(p.type.line_height_px),
          letterSpacing: px(p.type.letter_spacing_px),
          // ⚠ Poppins est STATIQUE en 700 : pas de variation, et rien d'autre
          // que 700 ne doit lui être demandé.
          fontFamily: POPPINS,
          fontWeight: p.type.font_weight,
          textTransform: 'uppercase',
        }}
      >
        {type}
      </div>
      ) : null}

      {/*
        ⚠ NI TITRE NI FILET EN MINIATURE : à 56 px le titre ferait 3,7 px, et le
        filet 0,6 px — deux traits que personne ne lit.
      */}
      {!miniature ? (
      <>
      {/*
        ⭐ LE TITRE, POSÉ À LA COTE DE SON NOMBRE DE LIGNES.

        La source donne 467 / 425 / 390 / 348 selon le nombre de lignes — et ce
        n'est NI un ancrage par le haut NI par le bas : la dernière ligne tombe
        à 467 à 1 et 2 lignes, à 474 à 3 et 4. Un ancrage par le bas serait donc
        7 px trop haut à 3 et 4 lignes.

        ⭐ On coupe donc le titre nous-mêmes, on rend les lignes une par une, et
        on pose le bloc à `y_by_line_count[n]` : l'écart à la référence est NUL,
        et il ne peut pas dériver puisque le compte qui décide de la position
        est celui qui est rendu.
      */}
      <div
        style={{
          position: 'absolute',
          left: px(p.type.x),
          top: px(hautDuTitre(lignesDuTitre.length)),
          width: px(p.title.max_width_px),
          fontSize: px(p.title.font_size_px),
          lineHeight: px(p.title.line_height_px),
          fontFamily: POPPINS,
          fontWeight: p.title.font_weight,
        }}
      >
        {lignesDuTitre.map((l, i) => (
          // ⚠ Une ligne par `<span>` BLOC : c'est ce qui garantit que le DOM
          // porte exactement le nombre de lignes qui a décidé de la position.
          <span key={`${i}-${l}`} style={{ display: 'block' }}>
            {l}
          </span>
        ))}
      </div>

      <div
        style={{
          position: 'absolute',
          left: px(p.accentRule.x),
          top: px(p.accentRule.y),
          width: px(p.accentRule.width),
          height: px(p.accentRule.height),
          borderRadius: px(p.accentRule.radius),
          background: p.accentRule.color,
        }}
      />
      </>
      ) : null}

      {!miniature && auteur ? (
        <div
          style={{
            position: 'absolute',
            left: px(p.author.x),
            top: px(p.author.y),
            width: px(p.author.max_width_px),
            fontSize: px(p.author.font_size_px),
            lineHeight: px(p.author.line_height_px),
            fontFamily: SOURCE,
            ...graisse(p.author.font_weight),
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {auteur}
        </div>
      ) : null}

      {!miniature && annee ? (
        <div
          style={{
            position: 'absolute',
            left: px(p.year.x),
            top: px(p.year.y),
            fontSize: px(p.year.font_size_px),
            lineHeight: px(p.year.line_height_px),
            fontFamily: SOURCE,
            ...graisse(p.year.font_weight),
          }}
        >
          {annee}
        </div>
      ) : null}

      {!miniature && etablissement ? (
        <div
          style={{
            position: 'absolute',
            left: px(p.establishment.x),
            top: px(p.establishment.y),
            width: px(p.establishment.max_width_px),
            fontSize: px(p.establishment.font_size_px),
            lineHeight: px(p.establishment.line_height_px),
            letterSpacing: px(p.establishment.letter_spacing_px),
            fontFamily: SOURCE,
            ...graisse(p.establishment.font_weight),
            textTransform: 'uppercase',
            overflow: 'hidden',
          }}
        >
          {etablissement}
        </div>
      ) : null}
    </div>
  );
}
