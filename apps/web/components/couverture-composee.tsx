import { useId } from 'react';

import {
  DOS,
  ENCRE,
  type Notice,
  planDeCouverture,
} from '@/lib/couverture-composee';

/**
 * LA COUVERTURE COMPOSÉE, en SVG INLINE — zéro requête.
 *
 * Reprise de `docs/specification-couverture-composee.md` (rc8). Toute valeur
 * vient de `lib/couverture-composee.ts`, qui la tient de la spécification :
 * ce fichier ne décide que des POSITIONS.
 *
 * ⚠ POURQUOI INLINE, et pas une image ni un `background-image` :
 * la quatrième obligation de la spécification est « zéro requête ». Un
 * `<img src="data:…">` en émettrait zéro aussi, mais il ferait entrer les
 * octets de la couverture dans le HTML **deux fois** (encodés en base64, donc
 * +33 %) et il interdirait l'héritage de la police. Le SVG inline pèse ce
 * qu'il dit, et il est sous le garde de budget
 * (`tests/budget-des-pages-publiques.spec.ts`).
 *
 * ⚠ ET ELLE EST DÉCORATIVE — `aria-hidden`, pas de libellé.
 * Elle DOUBLE le titre, l'auteur, le type et l'année affichés en texte à côté
 * d'elle, sur la liste comme sur la fiche. CLAUDE.md tranche ce cas : « un
 * `aria-label` qui double un texte déjà visible reste dans le code » — ici il
 * ne reste même pas, parce qu'il ferait tout annoncer deux fois.
 * ⚠ Le corollaire pour l'appelant : il doit afficher ces champs en texte.
 * Une couverture posée SEULE, sans son texte, serait une information
 * inaccessible — et ce n'est pas l'usage prévu.
 */
export function CouvertureComposee({
  notice,
  largeur,
  hauteur,
  className,
}: {
  notice: Notice;
  largeur: number;
  hauteur: number;
  className?: string;
}) {
  const plan = planDeCouverture(notice, largeur, hauteur);
  const { p } = plan;
  // ⚠ `useId` plutôt qu'un compteur ou un aléa : l'identifiant du détourage
  // doit être LE MÊME au rendu serveur et à l'hydratation, sinon React refuse
  // l'arbre. Et `Math.random()` donnerait deux couvertures différentes pour le
  // même document — exactement ce que la spécification interdit.
  const detourage = `cc-${useId()}`;
  const rayon = hauteur > 160 ? 5 : 4;
  const utile = largeur - p.margeGauche - p.margeDroite;

  /* Le bloc du bas : le type dans son filet, l'année en vis-à-vis. */
  const hauteurFilet = p.type * 1.9;
  const yFilet = hauteur - p.margeBas - hauteurFilet;
  // Largeur du filet estimée comme les lignes de texte — voir `enLignes`, qui
  // déclare pourquoi on estime au lieu de mesurer.
  const largeurFilet = plan.type
    ? Math.min(utile, plan.type.length * (p.type * 0.52 + 0.5) + p.type * 1.2)
    : 0;

  return (
    <svg
      className={className}
      width={largeur}
      height={hauteur}
      viewBox={`0 0 ${largeur} ${hauteur}`}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <clipPath id={detourage}>
          <rect x={0} y={0} width={largeur} height={hauteur} rx={rayon} ry={rayon} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${detourage})`}>
        <rect x={0} y={0} width={largeur} height={hauteur} fill={plan.teinte} />
        {/* Le dos : la seule touche d'orange. Le vert de marque est un FOND. */}
        <rect x={0} y={0} width={p.dos} height={hauteur} fill={DOS} />
      </g>

      {plan.initialeSeule ? (
        plan.initiale && (
          /* ⚠ Sous 80 px de haut, le titre ne se lit pas : on n'affiche que
             son initiale. Mesuré dans la spécification — à 72×100, la
             couverture composée ne tenait déjà que celle-là. */
          <text
            x={largeur / 2}
            y={hauteur / 2 + p.initiale * 0.35}
            fill={ENCRE}
            fontFamily="inherit"
            fontSize={p.initiale}
            fontWeight={700}
            textAnchor="middle"
          >
            {plan.initiale}
          </text>
        )
      ) : (
        <>
          {plan.lignesTitre.length > 0 && (
            <text
              fill={ENCRE}
              fontFamily="inherit"
              fontSize={p.titre}
              fontWeight={700}
            >
              {plan.lignesTitre.map((ligne, i) => (
                <tspan
                  key={i}
                  x={p.margeGauche}
                  y={p.margeHaut + p.titre * 0.8 + i * p.titre * 1.22}
                  /*
                   * ⚠ LA CONTRAINTE DE LARGEUR, et elle n'est posée QUE sur les
                   * lignes qui en ont besoin. Un mot plus large que la zone
                   * utile déborderait sinon la marge droite — mesuré sur la
                   * fiche, 7,4 px dehors — et aucun coefficient ne peut
                   * l'éviter, puisqu'on ne coupe pas les mots. `textLength`
                   * laisse le NAVIGATEUR, qui connaît les vraies métriques,
                   * condenser la ligne jusqu'à la largeur utile.
                   */
                  {...(ligne.ajustee
                    ? { textLength: utile, lengthAdjust: 'spacingAndGlyphs' as const }
                    : {})}
                >
                  {ligne.texte}
                </tspan>
              ))}
            </text>
          )}

          {plan.lignesAuteur.length > 0 && (
            /* ⚠ L'auteur se distingue par la GRAISSE (400 contre 700) et la
               TAILLE, jamais par le contraste : sur ces douze fonds, un blanc
               atténué retombe sous le seuil AA. */
            <text
              fill={ENCRE}
              fontFamily="inherit"
              fontSize={p.auteur}
              fontWeight={400}
            >
              {plan.lignesAuteur.map((ligne, i) => (
                <tspan
                  key={i}
                  x={p.margeGauche}
                  {...(ligne.ajustee
                    ? { textLength: utile, lengthAdjust: 'spacingAndGlyphs' as const }
                    : {})}
                  y={
                    p.margeHaut +
                    p.titre * 0.8 +
                    plan.lignesTitre.length * p.titre * 1.22 +
                    /* ⚠ L'ÉCART ENTRE LES DEUX BLOCS N'EST PAS DANS LA
                       SPÉCIFICATION — elle donne les interlignes, pas
                       l'inter-bloc. Posé à `auteur × 0,5`, et c'est le SEUL
                       nombre de ce fichier qui ne vienne pas d'elle. */
                    p.auteur * 0.5 +
                    i * p.auteur * 1.2
                  }
                >
                  {ligne.texte}
                </tspan>
              ))}
            </text>
          )}

          {plan.type && (
            <>
              <rect
                x={p.margeGauche}
                y={yFilet}
                width={largeurFilet}
                height={hauteurFilet}
                rx={3}
                ry={3}
                fill="none"
                stroke={ENCRE}
                strokeWidth={1}
              />
              <text
                x={p.margeGauche + p.type * 0.6}
                y={yFilet + hauteurFilet / 2 + p.type * 0.36}
                fill={ENCRE}
                fontFamily="inherit"
                fontSize={p.type}
                fontWeight={600}
                letterSpacing={0.5}
              >
                {plan.type}
              </text>
            </>
          )}

          {plan.annee && (
            <text
              x={largeur - p.margeDroite}
              y={yFilet + hauteurFilet / 2 + p.annee * 0.36}
              fill={ENCRE}
              fontFamily="inherit"
              fontSize={p.annee}
              fontWeight={500}
              textAnchor="end"
            >
              {plan.annee}
            </text>
          )}
        </>
      )}
    </svg>
  );
}
