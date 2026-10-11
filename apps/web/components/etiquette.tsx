import { QrCode } from '@/components/qr-code';
import {
  PLANCHE,
  QR_COTE_MM,
  SILENCE_BARRES,
  barresCode128,
  largeurEtiquetteMm,
  qrTient,
  traceDesBarres,
} from '@/lib/code128';
import { LIBELLES } from '@/lib/libelles';

const T = LIBELLES.etiquettes;

/**
 * UNE ÉTIQUETTE DE RAYON — QR code, code-barres Code 128, cote, titre.
 *
 * ⚠ TOUT EST NOIR SUR BLANC, en dur. Un code-barres et un QR se lisent par
 * CONTRASTE de luminance : un lecteur de guichet n'a rien d'autre, et une
 * planche s'imprime en monochrome. C'est le même cas que `qr-code.tsx`, et le
 * seul endroit du front où une couleur est écrite en dur.
 */
export function Etiquette({
  barcode,
  cote,
  titre,
  etablissement,
  urlNotice,
  colonnes = PLANCHE.colonnes,
}: {
  barcode: string;
  cote: string | null;
  titre: string;
  etablissement: string;
  /** L'adresse publique de la notice — ce que le QR encode. */
  urlNotice: string;
  /** Les colonnes de la planche : elles décident de la largeur, donc du QR. */
  colonnes?: number;
}) {
  const barres = barresCode128(barcode);
  /*
   * ⭐ LA PLACE DU QR EST DEMANDÉE, PAS PRISE — invariant du backend, repris
   * ici parce que mon aperçu posait le QR quoi qu'il arrive et montrait donc
   * une étiquette que le PDF n'imprime pas.
   *
   * Les douchettes en service lisent le CODE-BARRES : un QR qui le rétrécirait
   * sous 0,25 mm par module casserait le circuit de prêt pour un gain
   * d'affichage.
   */
  const p = { ...PLANCHE, colonnes };
  /*
   * ⚠ ET SANS CODE-BARRES, LE QR TIENT FORCÉMENT : rien ne lui dispute la
   * largeur. Ma première écriture couplait les deux (`barres !== null && …`),
   * et une valeur non encodable faisait disparaître le QR AUSSI — alors que le
   * QR encode l'adresse de la notice, qui n'a rien à voir avec le code-barres.
   * Un test l'a dit : zéro SVG là où il en fallait un.
   */
  const avecQr = barres === null || qrTient(barres.motif.length, p);
  const largeurMm = largeurEtiquetteMm(p);

  return (
    <div
      className="flex h-full items-stretch gap-2 border border-black bg-white p-[1.5mm] text-black"
      style={{ width: `${largeurMm}mm` }}
    >
      {avecQr ? (
        /* La cote du QR est en MILLIMÈTRES, comme dans le PDF : c'est la seule
           façon que la décision d'abandon ait le même sens aux deux endroits. */
        <QrCode
          valeur={urlNotice}
          taille={QR_COTE_MM * 3.78}
          className="shrink-0 self-start"
        />
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col justify-between">
        <div className="min-w-0">
          <p className="truncate text-[7px] font-semibold uppercase tracking-wide">
            {etablissement}
          </p>
          {/* ⚠ La COTE d'abord et en gros : c'est elle qui sert à RANGER, et
              c'est le seul usage d'une étiquette de rayon. Le titre vient
              après, tronqué — il n'est là que pour reconnaître l'ouvrage. */}
          {cote && <p className="mt-0.5 font-mono text-[11px] font-bold leading-none">{cote}</p>}
          <p className="mt-0.5 line-clamp-2 text-[7px] leading-tight">{titre}</p>
        </div>

        {barres === null ? (
          /* ⚠ ON NE DESSINE PAS UN CODE QU'ON N'A PAS PU ENCODER. Code 128
             n'accepte que l'ASCII imprimable : un tracé vide se lirait comme
             une étiquette imprimée de travers, alors que c'est la VALEUR qui
             est en cause. On le dit, et on garde le code en clair. */
          <p className="mt-1 text-[7px] font-semibold">{T.codeNonEncodable(barcode)}</p>
        ) : (
          <div className="mt-1">
            <svg
              viewBox={`${-SILENCE_BARRES} 0 ${barres.motif.length + SILENCE_BARRES * 2} 12`}
              className="h-5 w-full"
              aria-hidden="true"
              focusable="false"
              shapeRendering="crispEdges"
              preserveAspectRatio="none"
            >
              <rect
                x={-SILENCE_BARRES}
                y={0}
                width={barres.motif.length + SILENCE_BARRES * 2}
                height={12}
                fill="#FFFFFF"
              />
              <path d={traceDesBarres(barres.motif, 10)} fill="#000000" />
            </svg>
            {/* ⚠ LE CODE EN CLAIR SOUS LES BARRES, et c'est la même règle que
                l'adresse sous le QR : le SVG est `aria-hidden`, et un code
                qu'un lecteur optique rate doit pouvoir être tapé à la main. */}
            <p className="text-center font-mono text-[7px] leading-none">{barres.texte}</p>
            {/* ⚠ L'ABANDON SE DIT. Un QR qui disparaît sans un mot est une
                dégradation silencieuse : la bibliothécaire ne peut pas savoir
                si c'est un défaut ou une décision. Le backend pose un en-tête
                `X-Gafeso-Qr-Abandonnes` pour la même raison. */}
            {!avecQr && (
              <p className="mt-0.5 text-center text-[6px] leading-none">
                {T.qrAbandonne}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
