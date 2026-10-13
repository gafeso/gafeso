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
 * ## ⭐⭐ L'ACCESSIBILITÉ SUIT CE QUE L'APPELANT AFFICHE — les deux cas, et
 * aucun n'est un défaut
 *
 * | L'adresse est… | Ce QR est… | Pourquoi |
 * |---|---|---|
 * | affichée EN TEXTE à côté | `aria-hidden` | un `aria-label` doublerait un texte déjà visible — CLAUDE.md tranche ce cas |
 * | **absente de l'écran** | `role="img"` + `aria-label` qui la NOMME | sinon elle devient inaccessible : un lecteur d'écran annoncerait « image » et rien d'autre |
 *
 * ⚠ **Et c'est la seconde qui s'applique depuis le 12 octobre 2026**, sur
 * décision de Jean : l'adresse en clair est retirée de l'affiche et du bloc
 * « Partager » — le QR suffit à l'œil. Retirer le texte SANS donner l'étiquette
 * aurait rendu l'adresse inatteignable pour qui ne voit pas : le changement a
 * deux côtés, et c'est le second qu'on oublie.
 *
 * ⚠ CE QUE LE RETRAIT COÛTE, ET IL FAUT LE DIRE. L'adresse en clair était aussi
 * la PROTECTION CONTRE UNE ADRESSE FAUSSE : l'URL se dérive parfois de l'origine
 * du navigateur, et une affiche imprimée depuis une adresse interne encode cette
 * adresse-là. Un humain le voyait d'un coup d'œil ; il ne le verra plus. Sur
 * l'aperçu des ÉTIQUETTES, l'adresse reste donc affichée — c'est l'écran depuis
 * lequel on imprime un fonds entier.
 */
export function QrCode({
  valeur,
  taille,
  className,
  etiquette,
}: {
  /** Ce que le QR encode. */
  valeur: string;
  /** Côté du rendu, en pixels CSS. Le tracé, lui, est en MODULES. */
  taille: number;
  className?: string;
  /**
   * ⚠ L'étiquette accessible, à donner EXACTEMENT quand l'adresse n'est pas
   * affichée en texte à côté. Omise, le QR reste `aria-hidden` — et il DOIT le
   * rester quand l'adresse est visible, sinon elle est annoncée deux fois.
   */
  etiquette?: string;
}) {
  const m = matriceQr(valeur);
  const cote = coteAvecSilence(m);
  return (
    <svg
      className={className}
      width={taille}
      height={taille}
      viewBox={`0 0 ${cote} ${cote}`}
      {...(etiquette ? { role: 'img', 'aria-label': etiquette } : { 'aria-hidden': 'true' as const })}
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
