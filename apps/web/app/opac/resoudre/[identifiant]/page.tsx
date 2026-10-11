import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';

import { ID_CONTENU } from '@/components/lien-evitement';
import { LIBELLES } from '@/lib/libelles';
import { resoudreIdentifiant } from '@/lib/server-api';
import { identifiantDuSegment } from '@/lib/url-publique';

const T = LIBELLES.resolution;

/**
 * ⭐⭐ `/opac/resoudre/<identifiant>` — ET ELLE EST VALIDE POUR TOUJOURS.
 *
 * ## ⚠ LA RÈGLE, ET ELLE N'EST PAS NÉGOCIABLE
 *
 * **Cette adresse et `/opac/<id>` restent valides POUR TOUJOURS.** Des QR codes
 * IMPRIMÉS y pointent — collés dans des livres, affichés dans des couloirs. Ils
 * ne se reprennent pas : on ne décolle pas huit mille étiquettes.
 *
 * `routes-perennes.spec.ts` verrouille les deux, et son message dit pourquoi.
 *
 * ## ⚠ POURQUOI ELLE EXISTE — une dette que le backend a RAPPORTÉE
 *
 * `apps/api/src/opac/identifiant-perenne.ts` portait, le 11 octobre 2026 :
 *
 * > « **le WEB NE SERT AUCUNE PAGE `/opac/resoudre/…`** […] Un QR pointant là
 * >   mènerait à un 404. […] Dette RAPPORTÉE au front plutôt que corrigée ici :
 * >   si `/opac/resoudre/[identifiant]` devient une page web (une simple
 * >   redirection vers `/opac/<id>` suffit), cette fonction bascule dessus en
 * >   une ligne. »
 *
 * ⭐ C'est exactement ce que fait cette page. Et le gain est celui que leur
 * fichier décrit : l'identifiant pérenne ne porte AUCUN domaine, donc il
 * survit à un déménagement de serveur — là où `/opac/<id>` est une
 * LOCALISATION. Un QR qui porte l'identifiant reste bon après une migration.
 *
 * ## ⭐ UNE REDIRECTION PERMANENTE (308), et c'est mesurable
 *
 * Deux invariants la rendent exacte, et ils sont écrits ailleurs :
 *
 * · `BiblioRecord.id` **ne change JAMAIS** — il est inscrit dans les licences
 *   hors-ligne signées déjà déployées (CLAUDE.md) ;
 * · `/opac/<id>` est valide pour toujours (la règle ci-dessus).
 *
 * La correspondance identifiant → notice est donc permanente, et un 307
 * demanderait à chaque visiteur de la redemander pour rien. ⚠ Et le risque
 * d'un 308 — un cache qui garde une redirection devenue fausse — est écarté par
 * ces deux invariants, pas par optimisme.
 *
 * ## ⚠ RENDUE AU SERVEUR, DONC SANS JAVASCRIPT
 *
 * Un appareil photo ouvre l'adresse dans un navigateur quelconque, parfois sans
 * JS, parfois sur un réseau qui coupe. La redirection part dans l'en-tête HTTP,
 * avant le premier octet de contenu.
 */
export function generateMetadata(): Metadata {
  /*
   * ⚠ Aucun titre propre : la page ne s'AFFICHE qu'en cas de refus, et elle
   * retombe alors sur le nom de l'école — vrai quoi qu'il arrive. Lui donner un
   * titre affirmerait qu'elle est une destination, alors qu'elle est un
   * aiguillage.
   */
  return {};
}

export default async function ResoudrePage({
  params,
}: {
  params: Promise<{ identifiant: string }>;
}) {
  const { identifiant: segment } = await params;
  /*
   * ⚠⚠ LE SEGMENT ARRIVE PERCENT-ENCODÉ — mesuré, après que le contraire a été
   * écrit ici comme un fait. Sans ce décodage, l'appel à l'API double
   * l'encodage et TOUT identifiant valide rend 404. Le motif complet, et ce
   * qui l'a laissé passer, sont dans `identifiantDuSegment`.
   */
  const identifiant = identifiantDuSegment(segment);
  const r = await resoudreIdentifiant(identifiant);

  if (r.etat === 'trouve') {
    // ⚠ `permanentRedirect` LÈVE : rien ne s'exécute après.
    permanentRedirect(`/opac/${encodeURIComponent(r.recordId)}`);
  }

  if (r.etat === 'introuvable') notFound();

  /*
   * ⚠⚠ `indisponible` NE REND PAS 404, et c'est la décision qui compte le plus
   * sur cette page. Un 404 servi parce que le catalogue a cligné serait archivé
   * par les moteurs comme « cet identifiant n'existe pas » — et l'étiquette
   * reste collée dans le livre. On dit qu'on ne sait pas.
   */
  return (
    <main id={ID_CONTENU} className="mx-auto max-w-3xl px-6 py-12 text-center">
      <h1 className="font-serif text-2xl font-bold">{T.indisponibleTitre}</h1>
      <p className="mt-2 text-sm text-muted">{T.indisponibleTexte}</p>
      <Link
        href="/opac"
        className="mt-6 inline-flex min-h-11 items-center font-semibold text-ocre hover:underline"
      >
        {LIBELLES.opac.retourCatalogue}
      </Link>
    </main>
  );
}
