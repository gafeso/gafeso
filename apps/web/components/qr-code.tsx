import {
  SILENCE,
  coteAvecSilence,
  matriceQr,
  traceDesModules,
} from '@/lib/qr';

/**
 * UN QR CODE EN SVG INLINE — zéro requête, et lisible en NOIR ET BLANC.
 *
 * ⚠ NOIR SUR BLANC, EN DUR, et ce n'est pas un oubli de thème : un QR se lit
 * par CONTRASTE de luminance, et un appareil photo sur une impression
 * monochrome n'a que ça. Les jetons de couleur du produit ne s'appliquent donc
 * pas ici — c'est le seul endroit du front où une couleur est écrite en dur, et
 * `qr-code.spec.tsx` l'exige.
 *
 * ⚠ `aria-hidden`, COMME LA COUVERTURE, et à la même condition : l'adresse que
 * le QR encode doit être affichée EN TEXTE à côté de lui. Un QR est inutilisable
 * pour qui ne voit pas, et un lecteur d'écran qui annoncerait « image » sans
 * l'adresse ne donnerait rien. L'appelant est tenu d'afficher l'adresse —
 * `qr-code.spec.tsx` le vérifie sur chaque surface.
 *
 * ⚠ ET C'EST AUSSI LA PROTECTION CONTRE UNE ADRESSE FAUSSE. L'URL publique est
 * dérivée de l'origine du navigateur (voir `lib/url-publique.ts`) : une affiche
 * imprimée depuis une adresse interne encoderait cette adresse-là. L'adresse en
 * clair sous le QR est ce qui permet à un humain de le voir.
 */
export function QrCode({
  valeur,
  taille,
  className,
}: {
  /** Ce que le QR encode. Affiché en texte par l'appelant, jamais ici. */
  valeur: string;
  /** Côté du rendu, en pixels CSS. Le tracé, lui, est en MODULES. */
  taille: number;
  className?: string;
}) {
  const m = matriceQr(valeur);
  const cote = coteAvecSilence(m);
  return (
    <svg
      className={className}
      width={taille}
      height={taille}
      viewBox={`0 0 ${cote} ${cote}`}
      aria-hidden="true"
      focusable="false"
      /* ⚠ `shapeRendering="crispEdges"` : sans lui, l'anti-aliasage du
         navigateur floute les bords des modules à certaines échelles, et c'est
         exactement ce qui fait échouer une lecture. */
      shapeRendering="crispEdges"
    >
      {/* Le fond BLANC fait partie du code : la zone de silence doit être
          blanche, pas transparente — sur un fond sombre, un QR ne se lit pas. */}
      <rect x={0} y={0} width={cote} height={cote} fill="#FFFFFF" />
      <path d={traceDesModules(m, SILENCE)} fill="#000000" />
    </svg>
  );
}
