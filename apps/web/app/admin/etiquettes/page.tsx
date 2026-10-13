'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { EtatVide } from '@/components/etat-vide';
import { Etiquette } from '@/components/etiquette';
import { Alert, Button } from '@/components/ui';
import { ID_CONTENU } from '@/components/lien-evitement';
import { api, ApiError } from '@/lib/api';
import { LIBELLES } from '@/lib/libelles';
import { useMyFunctions } from '@/lib/functions';
import { adresseCourteDuQr, adresseCourteEstServie } from '@/lib/url-publique';

const T = LIBELLES.etiquettes;

/**
 * L'APERÇU AVANT IMPRESSION DES ÉTIQUETTES DE RAYON.
 *
 * ## ⭐ L'APERÇU EST LA SORTIE — il ne MONTRE pas une autre sortie
 *
 * Deux façons d'écrire cet écran, et une seule tient :
 *
 * | | |
 * |---|---|
 * | un aperçu du PDF du serveur | il DIVERGERA — deux rendus, deux mises en page, et c'est l'aperçu qu'on croira |
 * | **l'aperçu EST ce qui s'imprime** | aucune divergence possible : le même DOM |
 *
 * ⚠ Le PDF du serveur subsiste, et il ne porte PAS de QR code. Les deux sorties
 * ne sont donc pas interchangeables, et l'écran le DIT — taire l'écart ferait
 * croire à un aperçu du PDF.
 *
 * ## ⚠ POURQUOI SEULEMENT LA SÉLECTION COCHÉE
 *
 * Mesuré le 11 octobre 2026 : `GET /labels` ne rend que du
 * **`application/pdf`**, et aucune route JSON ne sert les données d'étiquettes.
 * Les exemplaires s'obtiennent donc notice par notice, par
 * `GET /cataloging/records/:id` — qui sert bien `items` avec `barcode` et
 * `callNumber` (vérifié).
 *
 * ⭐ Cela suffit pour la SÉLECTION, qui est le geste d'une bibliothécaire
 * étiquetant des exemplaires précis. « Par localisation » et « Nouveautés »
 * désignent un ensemble que seul le catalogue connaît : l'écran ne les
 * prévisualise pas, et il le dit plutôt que de montrer une planche partielle.
 * Route JSON demandée en passation.
 */
interface Exemplaire {
  id: string;
  barcode: string;
  callNumber: string | null;
}
interface NoticeAvecExemplaires {
  id: string;
  title: string;
  items: Exemplaire[];
  /**
   * ⚠⚠ L'ADRESSE COURTE — `shortUrl`, PAS `publicUrl`. Décision du 11 octobre
   * 2026 : l'étiquette porte la forme COURTE (`/opac/<id>`), l'affiche et le
   * bloc « Partager » portent la forme PÉRENNE. Motif mesuré dans
   * `adresseCourteDuQr` : le QR d'étiquette est un carré FIXE de 13 mm, et
   * chaque caractère d'adresse rétrécit ses modules.
   *
   * 🔴 ET CE CHAMP N'EST PAS ENCORE SERVI. Mesuré par le chemin normal :
   * `GET /cataloging/records/:id` ne porte AUCUN des trois champs d'adressage.
   * Le champ précédent — `publicUrl?: string | null` — était déclaré ici sans
   * que la réponse l'ait jamais porté : le repli s'appliquait donc TOUJOURS, en
   * silence, sur des QR qu'on colle dans des livres.
   *
   * ⚠ C'est pourquoi l'écran DIT l'adresse qu'il encode, et avertit quand elle
   * vient du navigateur. Demandé au backend pour rc12 (`docs/passation.md`).
   */
  shortUrl?: string | null;
}

export default function AperçuEtiquettesPage() {
  const { functions } = useMyFunctions();
  const params = useSearchParams();
  const ids = (params.get('recordIds') ?? '').split(',').filter(Boolean);
  /*
   * ⚠ LES COLONNES VIENNENT DE L'URL, comme pour le PDF — et elles DÉCIDENT du
   * QR : au-delà de trois, le module du code-barres passe sous 0,25 mm et le QR
   * est abandonné. Mon premier aperçu les ignorait : on choisissait quatre
   * colonnes, le PDF sortait sans QR, et l'aperçu en montrait trois AVEC.
   */
  const colonnes = Math.min(8, Math.max(1, Number(params.get('columns') ?? '3') || 3));

  const [notices, setNotices] = useState<NoticeAvecExemplaires[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [etablissement, setEtablissement] = useState('');

  const charger = useCallback(async () => {
    if (ids.length === 0) {
      setNotices([]);
      return;
    }
    try {
      /*
       * ⚠ UNE REQUÊTE PAR NOTICE, et c'est la seule voie : l'API ne sert les
       * étiquettes qu'en PDF. `Promise.all` plutôt qu'une boucle séquentielle —
       * une planche de vingt-quatre étiquettes ferait vingt-quatre
       * aller-retours en file, et c'est l'attente qui ferait abandonner.
       */
      const [recs, tenant] = await Promise.all([
        Promise.all(ids.map((id) => api<NoticeAvecExemplaires>(`/cataloging/records/${id}`))),
        api<{ name: string }>('/tenancy/current'),
      ]);
      setNotices(recs);
      setEtablissement(tenant.name);
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : String(e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `ids` est dérivé de l'URL
  }, [params]);

  useEffect(() => {
    void charger();
  }, [charger]);

  if (functions && !functions.includes('catalogue.gerer')) {
    return (
      <main id={ID_CONTENU} className="mx-auto max-w-3xl px-4 py-8">
        <Alert tone="error">{LIBELLES.refusDeDroit.etiquettes}</Alert>
      </main>
    );
  }

  /* ⚠ Une notice SANS exemplaire n'a pas de code-barres : on la nomme plutôt
     que de la taire, sinon la planche compte moins d'étiquettes que de notices
     cochées et personne ne sait lesquelles manquent. */
  const sansExemplaire = (notices ?? []).filter((n) => n.items.length === 0);
  const etiquettes = (notices ?? []).flatMap((n) =>
    n.items.map((it) => ({ notice: n, item: it })),
  );

  return (
    <main id={ID_CONTENU} className="mx-auto max-w-5xl px-4 py-8">
      <style
        dangerouslySetInnerHTML={{
          __html:
            '@page{size:A4;margin:10mm}' +
            /* ⚠ Une étiquette ne se coupe PAS en deux pages : `break-inside`
               est la seule chose qui l'empêche, et une étiquette coupée est
               une étiquette perdue. */
            '@media print{.planche{gap:0}.etq{break-inside:avoid;page-break-inside:avoid}}',
        }}
      />
      <h1 className="font-serif text-2xl font-bold print:hidden">{T.titre}</h1>
      <p className="mt-2 text-sm text-muted print:hidden">{T.intro}</p>
      <p className="mt-1 text-xs text-muted print:hidden">{T.seulementSelection}</p>

      {erreur && <Alert tone="error" className="mt-4 print:hidden">{erreur}</Alert>}
      {!notices && !erreur && (
        <p className="mt-6 text-sm text-muted print:hidden">{T.chargement}</p>
      )}

      {/*
        ⭐ ÉTAT VIDE NEUTRE, et de la même nature que ceux de l'espace lecteur :
        rien n'est coché, ce n'est pas une faute. Le ton `warning` rendait
        `bg-ocre/10` — un rose qui accuse.
      */}
      {notices && ids.length === 0 && (
        <EtatVide
          phrase={T.aucuneSelection}
          actions={[{ libelle: T.aucuneSelectionAction, href: '/admin/catalogue' }]}
        />
      )}

      {sansExemplaire.length > 0 && (
        <Alert tone="warning" className="mt-4 print:hidden">
          {sansExemplaire.map((n) => (
            <span key={n.id} className="block">
              {T.sansExemplaire(n.title)}
            </span>
          ))}
        </Alert>
      )}

      {etiquettes.length > 0 && (
        <>
          <div className="mt-4 print:hidden">
            <Button type="button" onClick={() => window.print()}>
              {T.imprimer}
            </Button>
          </div>
          {/* La planche : trois colonnes, comme le défaut du PDF. */}
          <p className="mt-1 text-xs text-muted print:hidden">
            {T.colonnesEtQr(colonnes)}
          </p>
          {/*
            ⭐ L'ADRESSE QUE LES QR ENCODENT, DITE EN CLAIR — et l'avertissement
            quand elle ne vient pas du catalogue.

            ⚠ `print:hidden` : ce bloc ne doit pas manger une étiquette sur la
            planche. Il s'adresse à la personne qui décide d'imprimer, pas au
            livre.
          */}
          <p className="mt-3 break-all font-mono text-xs text-muted print:hidden">
            {T.adresseDuQr}{' '}
            {adresseCourteDuQr(etiquettes[0].notice.id, etiquettes[0].notice.shortUrl ?? null)}
          </p>
          {!etiquettes.every(({ notice }) => adresseCourteEstServie(notice.shortUrl)) && (
            <p
              role="status"
              className="mt-1 max-w-prose rounded border border-ocre/40 bg-ocre/5 p-2 text-xs text-ocre print:hidden"
            >
              {T.adresseNonCanonique}
            </p>
          )}
          {/* ⚠ La planche est en MILLIMÈTRES, pas en colonnes CSS : une grille
              dont la largeur dépend de la fenêtre ferait varier la largeur de
              module, donc la décision d'abandon du QR, avec la taille du
              navigateur. Les cotes sont celles du PDF. */}
          <div
            className="planche mt-5 flex flex-wrap"
            style={{ width: '210mm', paddingLeft: '7mm', gap: '2.5mm' }}
          >
            {etiquettes.map(({ notice, item }) => (
              <div key={item.id} className="etq h-[26mm]">
                <Etiquette
                  barcode={item.barcode}
                  cote={item.callNumber}
                  titre={notice.title}
                  etablissement={etablissement}
                  urlNotice={adresseCourteDuQr(notice.id, notice.shortUrl ?? null)}
                  colonnes={colonnes}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
