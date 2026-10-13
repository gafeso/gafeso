'use client';

/**
 * « MES CONSULTATIONS » — ce que j'ai consulté en ligne, et ce que j'ai
 * téléchargé.
 *
 * Contrat : `GET /reader/consultations` (rc7). L'identité vient du JETON —
 * aucun paramètre, et aucune route d'administration ne restitue l'historique
 * d'un lecteur nommé.
 *
 * ## ⚠ TROIS PRÉCAUTIONS, ET AUCUNE N'EST COSMÉTIQUE
 *
 * · **`retentionMois` s'AFFICHE.** Les consultations plus anciennes ont perdu
 *   leur nom (purge) : elles ne sont plus ici. Sans cette phrase, un étudiant
 *   dont l'historique s'arrête croira que le produit a PERDU ses données.
 *
 * · **`titre` peut être `null`** — une notice supprimée depuis. Un `null` SE
 *   DIT ; affiché en blanc, il donnerait une liste d'identifiants et se lirait
 *   comme un défaut.
 *
 * · **`nature` a deux valeurs, et JAMAIS « lue ».** On observe la délivrance
 *   d'une URL, pas une lecture — et la lecture hors connexion n'est pas tracée.
 *   Dire « lu » affirmerait un fait que le produit ne peut pas connaître, à la
 *   personne même qui saurait qu'il est faux.
 */
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Alert, Card } from '@/components/ui';
import { CouvertureV3 } from '@/components/couverture-v3';
import { EtatVide } from '@/components/etat-vide';
import { CoqueLecteur } from '@/components/coque-lecteur';
import { LIBELLES } from '@/lib/libelles';

const T = LIBELLES.espaceLecteur.consultations;

interface Consultation {
  recordId: string;
  titre: string | null;
  nature: 'CONSULTATION' | 'TELECHARGEMENT';
  quand: string;
  /**
   * ⭐⭐ LES DEUX CLÉS DE LA COUVERTURE v3, REQUISES — la route les sert
   * (mesuré le 12 octobre 2026 : `coverTemplate: "memoire"`,
   * `coverDomain: "arts"`).
   *
   * ⚠ REQUISES et non `?` : un `?` laisserait la vignette retomber sur
   * `manuel`/`autre` en silence le jour où le champ disparaîtrait. Elles sont
   * résolues par le serveur — NFC, minuscules, table et repli déjà appliqués —
   * et le front ne les normalise pas.
   */
  coverTemplate: string;
  coverDomain: string;
}
interface Charge {
  consultations: Consultation[];
  retentionMois: number;
}

/** ⚠ Un `nature` inconnu ne s'invente pas : on rend la valeur brute plutôt que
 *  de la ranger de force dans l'une des deux phrases. */
function direLaNature(n: string): string {
  if (n === 'CONSULTATION') return T.natureConsultation;
  if (n === 'TELECHARGEMENT') return T.natureTelechargement;
  return n;
}

export default function MesConsultationsPage() {
  // ⚠ `null` = pas encore su. Distinct d'une liste VIDE, qui veut dire « on
  // sait, et il n'y a rien ». Les confondre afficherait « aucune consultation »
  // pendant le chargement — une non-réponse écrite comme un fait.
  const [charge, setCharge] = useState<Charge | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    api<Charge>('/reader/consultations')
      .then(setCharge)
      .catch((e) => setErreur(e instanceof ApiError ? e.message : String(e)));
  }, []);

  return (
    <CoqueLecteur>
      <h1 className="font-serif text-2xl font-bold">{T.titre}</h1>
      {erreur && <Alert tone="error" className="mt-4">{erreur}</Alert>}
      {!charge && !erreur && <p className="mt-6 text-sm text-muted">{LIBELLES.commun.chargement}</p>}

      {charge && (
        <>
          {/* ⚠ LA RÉTENTION AVANT LA LISTE : elle explique pourquoi la liste
              s'arrête, et une explication qui vient après la question ne sert
              plus. */}
          <p className="mt-2 text-sm text-muted">{T.retention(charge.retentionMois)}</p>

          {charge.consultations.length === 0 ? (
            /*
             * ⭐ ÉTAT VIDE NEUTRE, avec une sortie. Il portait `tone="warning"`
             * — `bg-ocre/10`, un rose qui accuse. Personne n'a fauté : rien
             * n'a encore été lu.
             */
            <EtatVide
              className="mt-5"
              phrase={T.aucune}
              actions={[{ libelle: LIBELLES.etatsVides.parcourirCatalogue, href: '/opac' }]}
            />
          ) : (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase text-muted">
                    {/*
                      ⚠ COLONNE SANS EN-TÊTE VISIBLE, et c'est voulu : la
                      vignette DOUBLE le titre de la ligne suivante. Un en-tête
                      « Couverture » serait annoncé par un lecteur d'écran pour
                      une colonne qui n'apporte aucune information — et la
                      vignette elle-même est `aria-hidden`.

                      ⚠ Mais la colonne EXISTE pour la structure du tableau :
                      sans `<th>`, les lecteurs d'écran décalent les en-têtes
                      d'une colonne. Il est donc vide et masqué.
                    */}
                    <th className="w-14 py-2 pr-3" aria-hidden="true" />
                    <th className="py-2 pr-3 font-medium">{T.colonneQuand}</th>
                    <th className="py-2 pr-3 font-medium">{T.colonneQuoi}</th>
                    <th className="py-2 font-medium">{T.colonneNature}</th>
                  </tr>
                </thead>
                <tbody>
                  {charge.consultations.map((c, i) => (
                    <tr key={`${c.recordId}-${c.quand}-${i}`} className="border-b border-line/60">
                      {/*
                        ⭐ VIGNETTE v3, 56×78 — `GET /reader/consultations` sert
                        `coverTemplate` et `coverDomain` (mesuré le 12 octobre
                        2026). Sous 80 px la v3 passe en MINIATURE : aucun
                        texte, logo simplifié — à cette taille un titre ferait
                        3,7 px.

                        ⚠ Et elle double le titre de la ligne, donc elle reste
                        décorative. Une notice RETIRÉE garde sa vignette : c'est
                        la trace de ce qui a été lu, et le texte dit à côté
                        qu'elle n'existe plus.
                      */}
                      <td className="py-2 pr-3 align-top">
                        <CouvertureV3
                          coverTemplate={c.coverTemplate}
                          coverDomain={c.coverDomain}
                          titre={c.titre ?? ''}
                          largeur={56}
                          className="rounded"
                        />
                      </td>
                      <td className="whitespace-nowrap py-2 pr-3 align-top tabular-nums">
                        {new Date(c.quand).toLocaleDateString('fr-FR', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="py-2 pr-3 align-top">
                        {/* ⚠ Le titre devient un LIEN vers la notice — mais
                            seulement s'il en reste une à montrer. Un lien vers
                            une notice retirée mènerait à un 404. */}
                        {c.titre ? (
                          <a className="text-ocre underline" href={`/opac/${c.recordId}`}>
                            {c.titre}
                          </a>
                        ) : (
                          <span className="italic text-muted">{T.noticeRetiree}</span>
                        )}
                      </td>
                      <td className="py-2 align-top">{direLaNature(c.nature)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </CoqueLecteur>
  );
}
