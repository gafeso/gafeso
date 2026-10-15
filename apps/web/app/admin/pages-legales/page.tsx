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
  /**
   * ⚠ LA VERSION LUE, et elle est le COUPLE de `pages` : les deux viennent du
   * même GET, et enregistrer avec l'une sans l'autre n'a pas de sens.
   * `null` veut dire « pas lu », jamais « version 0 » — la version 0 est un
   * état légitime (aucune écriture encore), et la confondre avec l'absence
   * ferait écrire sur une lecture qui n'a pas eu lieu.
   */
  const [version, setVersion] = useState<number | null>(null);
  /**
   * Le message du serveur sur un 409, GARDÉ TEL QUEL. Distinct de `erreur`
   * parce qu'il appelle un geste — relire — que les autres erreurs n'appellent
   * pas.
   */
  const [conflit, setConflit] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      // ⚠ L'écran lit la charge COMPLÈTE des réglages, pas la vue publique :
      // `GET /tenancy/home` ne rend que ce qui est PUBLIÉ, donc il ne montrerait
      // jamais un brouillon. C'est le même piège que l'accueil, déjà tranché là.
      /*
       * ⚠ `GET /tenancy/settings` EXISTE DEPUIS rc8, et c'est elle qu'il faut :
       * elle rend les pages légales BRUTES, brouillons compris, et elle est
       * gardée par `etablissement.apparence` — la même fonction que l'écriture.
       *
       * ⚠ PAS `GET /tenancy/home` : cette route PUBLIQUE filtre les brouillons
       * (`pourLePublic`). Un éditeur qui s'y fierait enregistrerait un
       * remplacement complet sans avoir vu ce qu'il écrase — et c'est écrit dans
       * la description de la route, par la main qui l'a posée.
       *
       * ⚠ MON ÉCRAN L'A APPELÉE AVANT QU'ELLE EXISTE, et une recette l'a montré
       * (« Cannot GET /tenancy/settings ») : mes quatorze cas doublaient `api()`,
       * donc aucun ne pouvait me démentir. Elle existe maintenant ; le défaut
       * était d'avoir écrit contre un contrat que je n'avais pas vérifié.
       */
      /*
       * ⚠ `version` EST ARRIVÉE EN rc9, et elle n'est pas optionnelle pour nous :
       * `PATCH` l'EXIGE (400 sans elle) et rend 409 si elle est périmée. Mesuré
       * contre l'API : « pagesLegalesVersion est obligatoire pour écrire les
       * pages légales : renvoyez la valeur « version » rendue par
       * GET /tenancy/settings ».
       */
      const r = await api<{
        pagesLegales?: Record<ClePageLegale, PageLegale>;
        version?: number;
      }>('/tenancy/settings');
      setPages({
        mentions: r.pagesLegales?.mentions ?? VIDE,
        confidentialite: r.pagesLegales?.confidentialite ?? VIDE,
      });
      // ⚠ `?? null` et PAS `?? 0` : un serveur qui ne rendrait pas la version
      // nous laisserait écrire avec un zéro INVENTÉ, qui serait accepté tant
      // que personne n'a encore écrit — puis refusé, sans qu'on sache pourquoi.
      setVersion(typeof r.version === 'number' ? r.version : null);
      setConflit(null);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : String(err));
    }
  }, []);

  /*
   * ⚠ ON N'APPELLE QUE SI LE DROIT EST LÀ — mesuré avant correction : l'effet
   * partait quelles que soient les fonctions, donc une personne sans
   * `etablissement.apparence` déclenchait un 403 que NOUS provoquions. Et tant
   * que `functions` est `undefined`, on ne SAIT pas : on attend, plutôt que de
   * demander au hasard.
   */
  const peutEditer = functions?.includes('etablissement.apparence');
  useEffect(() => {
    if (peutEditer) void charger();
  }, [peutEditer, charger]);

  async function envoyer(suivant: Record<ClePageLegale, PageLegale>) {
    /*
     * ⚠⚠ ON N'ENREGISTRE JAMAIS SI ON N'A PAS PU LIRE, et c'est la garantie la
     * plus importante de cet écran.
     *
     * `PATCH /tenancy/settings` fait un REMPLACEMENT COMPLET de `pagesLegales`
     * (« comme l'accueil », dit le service). Un écran qui n'a pas chargé l'état
     * courant et qui enregistre quand même ÉCRASE tout ce qui s'y trouvait —
     * y compris une page publiée que personne ne voulait retirer.
     *
     * ⭐ C'est « une fonction qui ne peut pas accomplir son office ne doit pas
     * sortir comme si elle l'avait accompli », appliqué à une ÉCRITURE : ici
     * l'office est « modifier », et modifier sans avoir lu est écraser.
     */
    /*
     * ⚠ ET LA VERSION EST DANS LE MÊME REFUS, pas dans un second. Sans elle,
     * le serveur rendrait 400 — mais le refus doit se dire ICI, parce que le
     * motif est le même : on n'écrit pas sur une lecture qui n'a pas eu lieu.
     * Deux refus pour une seule garantie finiraient par diverger.
     */
    if (!pages || version === null) {
      setErreur(T.refusEnregistrerSansLecture);
      return;
    }
    setErreur(null);
    setNotice(null);
    setConflit(null);
    setEnCours(true);
    try {
      await api('/tenancy/settings', {
        method: 'PATCH',
        body: JSON.stringify({ pagesLegales: suivant, pagesLegalesVersion: version }),
      });
      setPages(suivant);
      /*
       * ⚠ ON RELIT, ON N'INCRÉMENTE PAS. Mesuré : la réponse du PATCH rend les
       * réglages ENTIERS et ne porte AUCUNE `version` (vingt-cinq clés, pas
       * celle-là). Poser `version + 1` serait supposer le pas du compteur —
       * exact aujourd'hui, et faux le jour où le serveur compte autrement.
       * Sans relecture, le second enregistrement d'une même session partirait
       * avec une version périmée et récolterait un 409 que rien n'explique.
       */
      await charger();
      setNotice(T.enregistrer);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        /*
         * ⚠ LE MESSAGE DU SERVEUR, TEL QUEL. Il nomme la version lue, la
         * version actuelle, et le geste — « RELISEZ la page avant
         * d'enregistrer ». Le réécrire ici donnerait deux formulations d'un
         * même refus, et c'est le lecteur qui paierait leur divergence.
         */
        setConflit(err.message);
        return;
      }
      setErreur(err instanceof ApiError ? err.message : String(err));
    } finally {
      setEnCours(false);
    }
  }

  if (functions && !peutEditer) {
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
      {/*
        ⚠ LA BORNE EST PARTIE AVEC SA CAUSE. Elle disait « un texte enregistré
        sans être publié ne réapparaîtra pas » — vrai jusqu'à rc8, où
        `GET /tenancy/settings` a commencé à rendre les brouillons. La garder
        aurait été exactement le défaut que ce dépôt traque : un avertissement
        EXACT devenu mensonge quand sa condition disparaît.
      */}
      {erreur && <Alert tone="error" className="mt-4">{erreur}</Alert>}
      {notice && <Alert tone="success" className="mt-4">{notice}</Alert>}
      {/*
        ⚠ LE CONFLIT PORTE SA SORTIE. Un refus qui informe sans offrir de geste
        laisse devant un bouton « Enregistrer » qui ne marchera plus jamais :
        la version en mémoire est périmée pour toujours, et chaque nouvel essai
        rendra le même 409. « Relire » est la seule issue, donc elle est là.

        Et elle DIT ce qu'elle coûte — le texte en cours est remplacé. Un
        bouton qui jette du travail sans l'annoncer se clique une fois.
      */}
      {conflit && (
        <Alert tone="error" className="mt-4">
          <strong className="block">{T.conflitTitre}</strong>
          {/* Le message du SERVEUR, tel quel : il nomme les deux versions. */}
          <span className="mt-1 block">{conflit}</span>
          <span className="mt-2 block text-sm">{T.conflitPerte}</span>
          <Button
            variant="ghost"
            className="mt-3 min-h-11"
            disabled={enCours}
            onClick={() => {
              setConflit(null);
              void charger();
            }}
          >
            {T.conflitRelire}
          </Button>
        </Alert>
      )}
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
                  /* ⚠ Deux sections, deux « Enregistrer » : le texte visible
                     suffit sous sa section, le nom ANNONCÉ doit dire laquelle. */
                  aria-label={T.enregistrerPage(T[cle])}
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
                      aria-label={T.depublierPage(T[cle])}
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
                      aria-label={T.publierPage(T[cle])}
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
