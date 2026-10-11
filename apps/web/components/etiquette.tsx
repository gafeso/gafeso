import { QrCode } from '@/components/qr-code';
import { SILENCE_BARRES, barresCode128, traceDesBarres } from '@/lib/code128';
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
}: {
  barcode: string;
  cote: string | null;
  titre: string;
  etablissement: string;
  /** L'adresse publique de la notice — ce que le QR encode. */
  urlNotice: string;
}) {
  const barres = barresCode128(barcode);

  return (
    <div className="flex h-full w-full items-stretch gap-2 border border-black bg-white p-1.5 text-black">
      <QrCode valeur={urlNotice} taille={46} className="shrink-0 self-start" />
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
          </div>
        )}
      </div>
    </div>
  );
}
