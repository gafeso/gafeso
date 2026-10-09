'use client';

/**
 * RÉDIGER LES MENTIONS LÉGALES ET LA POLITIQUE DE CONFIDENTIALITÉ.
 *
 * Décision de Jean, 8 octobre 2026 : sur l'instance de l'UO, l'éditeur et le
 * responsable du traitement, c'est **L'UO — pas ResurgiTech**. Ces pages sont
 * donc rédigées par l'établissement, comme sa page d'accueil.
 *
 * ## ⚠ CE QUE CET ÉCRAN REFUSE
 *
 * **Publier une page dont un bloc obligatoire est vide.** Le bouton n'existe
 * pas tant qu'il en manque, et le refus NOMME les blocs — « complétez la page »
 * renverrait chercher quoi. Une page publique portant « Durée de conservation :
 * [à compléter] » sur le site d'une université serait pire que son absence : un
 * faux dispositif, en droit.
 *
 * ⚠ Et ce n'est pas un bouton GRISÉ : un bouton désactivé se lit comme une
 * panne, et un lecteur d'écran n'annonce qu'« bouton, non disponible ». La
 * phrase prend sa place et dit ce qui EST.
 */
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Alert, Badge, Button, Card, Textarea } from '@/components/ui';
import { ID_CONTENU } from '@/components/lien-evitement';
import { LIBELLES } from '@/lib/libelles';
import { useMyFunctions } from '@/lib/functions';
import {
  type ClePageLegale,
  MODELES,
  type PageLegale,
  champsManquants,
  estPubliable,
} from '@/lib/pages-legales';

const T = LIBELLES.pagesLegales;
const VIDE: PageLegale = { blocs: {}, publieeLe: null };

export default function PagesLegalesPage() {
  const { functions } = useMyFunctions();
  const [pages, setPages] = useState<Record<ClePageLegale, PageLegale> | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(async () => {
    try {
      // ⚠ L'écran lit la charge COMPLÈTE des réglages, pas la vue publique :
      // `GET /tenancy/home` ne rend que ce qui est PUBLIÉ, donc il ne montrerait
      // jamais un brouillon. C'est le même piège que l'accueil, déjà tranché là.
      const r = await api<{ pagesLegales?: Record<ClePageLegale, PageLegale> }>(
        '/tenancy/settings',
      );
      setPages({
        mentions: r.pagesLegales?.mentions ?? VIDE,
        confidentialite: r.pagesLegales?.confidentialite ?? VIDE,
      });
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  async function envoyer(suivant: Record<ClePageLegale, PageLegale>) {
    setErreur(null);
    setNotice(null);
    setEnCours(true);
    try {
      await api('/tenancy/settings', {
        method: 'PATCH',
        body: JSON.stringify({ pagesLegales: suivant }),
      });
      setPages(suivant);
      setNotice(T.enregistrer);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : String(err));
    } finally {
      setEnCours(false);
    }
  }

  if (functions && !functions.includes('etablissement.apparence')) {
    return (
      <main id={ID_CONTENU} className="mx-auto max-w-3xl px-4 py-8">
        <Alert tone="error">{LIBELLES.refusDeDroit.pagesLegales}</Alert>
      </main>
    );
  }

  return (
    <main id={ID_CONTENU} className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="font-serif text-2xl font-bold">{T.editeurTitre}</h1>
      <p className="mt-2 text-sm text-muted">{T.editeurAide}</p>
      {erreur && <Alert tone="error" className="mt-4">{erreur}</Alert>}
      {notice && <Alert tone="success" className="mt-4">{notice}</Alert>}
      {!pages && !erreur && <p className="mt-6 text-sm text-muted">{LIBELLES.commun.chargement}</p>}

      {pages &&
        (Object.keys(MODELES) as ClePageLegale[]).map((cle) => {
          const page = pages[cle];
          const manquants = champsManquants(cle, page);
          const publiable = estPubliable(cle, page);
          return (
            <section key={cle} className="mt-8">
              <h2 className="flex items-center gap-3 font-serif text-xl font-bold">
                {T[cle]}
                {page.publieeLe ? (
                  <Badge tone="green">{T.publieeLe(new Date(page.publieeLe))}</Badge>
                ) : (
                  <Badge>{T.nonPubliee}</Badge>
                )}
              </h2>

              {MODELES[cle].map((bloc) => (
                <Card key={bloc.id} className="mt-3">
                  <label className="flex flex-col gap-1.5">
                    <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                      {bloc.titre}
                      <Badge tone={bloc.nature === 'mesure' ? 'green' : undefined}>
                        {bloc.nature === 'mesure' ? T.natureMesure : T.natureARemplir}
                      </Badge>
                    </span>
                    <span className="text-xs text-muted">{bloc.aide}</span>
                    <Textarea
                      rows={bloc.nature === 'mesure' ? 5 : 3}
                      // ⚠ La PROPOSITION est un `placeholder`, jamais une valeur
                      // pré-écrite : une valeur stockée ferait publier un texte
                      // que l'établissement n'a pas relu. Il la voit, il la
                      // reprend s'il la veut — second geste, comme partout.
                      placeholder={bloc.propose}
                      value={page.blocs[bloc.id] ?? ''}
                      onChange={(ev) =>
                        setPages((v) =>
                          v
                            ? {
                                ...v,
                                [cle]: {
                                  ...v[cle],
                                  blocs: { ...v[cle].blocs, [bloc.id]: ev.target.value },
                                },
                              }
                            : v,
                        )
                      }
                    />
                  </label>
                </Card>
              ))}

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  disabled={enCours}
                  onClick={() => void envoyer({ ...pages, [cle]: page })}
                >
                  {T.enregistrer}
                </Button>

                {/* ⚠ PAS DE BOUTON GRISÉ : quand la page n'est pas publiable, le
                    bouton n'EXISTE pas, et la phrase qui nomme ce qui manque
                    prend sa place. */}
                {publiable ? (
                  page.publieeLe ? (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={enCours}
                      onClick={() =>
                        void envoyer({ ...pages, [cle]: { ...page, publieeLe: null } })
                      }
                    >
                      {T.depublier}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      disabled={enCours}
                      onClick={() =>
                        void envoyer({
                          ...pages,
                          [cle]: { ...page, publieeLe: new Date().toISOString() },
                        })
                      }
                    >
                      {T.publier}
                    </Button>
                  )
                ) : (
                  <p className="text-sm text-muted">
                    {T.refusPublication(manquants.map((m) => m.titre))}
                  </p>
                )}
              </div>
              {!publiable && <p className="mt-2 text-xs text-muted">{T.refusMotif}</p>}
            </section>
          );
        })}
    </main>
  );
}
