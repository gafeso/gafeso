'use client';

/**
 * LE VOLET USAGE NUMÉRIQUE — `GET /stats/usage`.
 *
 * ## ⭐⭐ CE QUE CE COMPOSANT DÉFEND, et c'est une propriété de VIE PRIVÉE
 *
 * L'API masque les comptes d'une classe à **-1** quand elle compte moins de cinq
 * lecteurs distincts, et elle le dit (`publiable: false`). Trois règles tiennent
 * cette ligne, et chacune corrige un faux différent :
 *
 * · ⚠ **jamais le NOMBRE.** Ni les comptes — `-1` n'est pas une mesure, et
 *   l'afficher donnerait « −1 consultation » —, ni **l'effectif**, que l'API
 *   sert pourtant en clair. « 3 lecteurs » EST la divulgation que le seuil
 *   existe pour empêcher : dans une classe de trois, un collègue sait qui.
 * · ⚠ **jamais une ligne ABSENTE.** Une absence muette se lit comme un zéro,
 *   donc « cette classe ne lit rien » — un faux pire que le silence cherché.
 * · ⚠ **et la phrase dit POURQUOI**, sans quoi un gestionnaire croit à une panne
 *   de calcul et la cherche.
 */
import { Card } from '@/components/ui';
import { LIBELLES } from '@/lib/libelles';

const T = LIBELLES.usage;

export interface LigneFiliere {
  cle: string;
  consultations: number;
  telechargements: number;
  effectif: number;
  publiable: boolean;
}
export interface ChargeUsage {
  periode: { du: string; au: string };
  parDocument: { recordId: string; titre?: string | null; consultations: number; telechargements: number }[];
  parJour: { jour: string; consultations: number; telechargements: number }[];
  parFiliere: LigneFiliere[];
  seuilDePublication: number;
}

export function VoletUsage({ usage }: { usage: ChargeUsage }) {
  const rien =
    usage.parDocument.length === 0 &&
    usage.parJour.length === 0 &&
    usage.parFiliere.length === 0;

  return (
    <section className="mt-6">
      <h2 className="font-serif text-xl font-bold">{T.titre}</h2>
      <p className="mt-1 text-sm text-muted">{T.intro}</p>

      {rien ? (
        <Card className="mt-3">
          <p className="text-sm text-muted">{T.aucunUsage}</p>
        </Card>
      ) : (
        <>
          {usage.parDocument.length > 0 && (
            <Card className="mt-3">
              <h3 className="font-semibold">{T.parDocument}</h3>
              {/*
                ⚠⚠ L'API NE SERT PAS DE TITRE dans `parDocument` — mesuré par une
                recette le 9 octobre 2026 : l'écran affichait SIX UUID à une
                bibliothécaire. « Une liste d'identifiants n'est pas une liste. »
                La demande est en passation ; `/reader/consultations` fait déjà
                cette jointure, donc elle est à portée.

                ⚠ En attendant, chaque ligne est un LIEN vers la notice : un
                identifiant qu'on peut ouvrir vaut mieux qu'un identifiant mort,
                et c'est le seul recours que l'écran puisse offrir sans inventer
                un titre.
              */}
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {usage.parDocument.map((d) => (
                  <li key={d.recordId} className="flex items-baseline justify-between gap-3">
                    <a className="truncate text-ocre underline" href={`/opac/${d.recordId}`}>
                      {d.titre ?? d.recordId}
                    </a>
                    <span className="whitespace-nowrap tabular-nums text-muted">
                      {d.consultations + d.telechargements} {T.acces}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card className="mt-3">
            <h3 className="font-semibold">{T.parFiliere}</h3>
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase text-muted">
                  <th className="py-2 pr-3 font-medium">{T.parFiliere}</th>
                  <th className="py-2 pr-3 text-right font-medium">{T.colConsultations}</th>
                  <th className="py-2 text-right font-medium">{T.colTelechargements}</th>
                </tr>
              </thead>
              <tbody>
                {usage.parFiliere.map((l) => (
                  <tr key={l.cle} className="border-b border-line/60">
                    <td className="py-2 pr-3">{l.cle}</td>
                    {l.publiable ? (
                      <>
                        <td className="py-2 pr-3 text-right tabular-nums">{l.consultations}</td>
                        <td className="py-2 text-right tabular-nums">{l.telechargements}</td>
                      </>
                    ) : (
                      /*
                        ⚠ UNE SEULE CELLULE SUR LES DEUX COLONNES, et la phrase
                        dedans. Deux cellules portant chacune la phrase la
                        répéteraient ; deux cellules vides se liraient comme un
                        zéro. Et la LIGNE RESTE : son absence se lirait comme
                        « cette classe ne lit rien ».
                      */
                      <td colSpan={2} className="py-2 text-right text-xs italic text-muted">
                        {T.nonPubliable(usage.seuilDePublication)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </section>
  );
}
