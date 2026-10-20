'use client';

import { useEffect, useRef, useState } from 'react';
import { ID_CONTENU } from '@/components/lien-evitement';
import { LIBELLES } from '@/lib/libelles';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { getUser } from '@/lib/session';
import { EpubReader } from '@/components/epub-reader';
import { PdfReader } from '@/components/pdf-reader';

const ANONYMOUS = '__anonymous__';

interface ReadResponse {
  url: string;
  fileFormat: 'PDF' | 'EPUB';
  expiresInSeconds: number;
  title: string;
}

export default function LirePage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<ReadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Garde contre le double-appel de React Strict Mode (dev) : sans elle,
  // l'effet tourne deux fois et produit deux URLs signées différentes
  // (signature distincte), ce qui fait réinitialiser epub.js en cours de
  // route et casse le rendu (résolution interne qui part en vrille).
  const fetchedRef = useRef(false);
  /*
   * ⭐⭐ LA REDEMANDE EST BORNÉE À UNE, et c'est ICI qu'elle se compte.
   *
   * L'URL de lecture vaut 300 s. Mesuré le 19 octobre 2026 : refusée, elle
   * n'était pas redemandée — une requête, un 403, et l'écran renvoyait à la
   * fiche. Quelqu'un qui revient sur son onglet dix minutes plus tard devait
   * tout recommencer.
   *
   * ⚠ LE COMPTE VIT DANS LA PAGE, pas dans le lecteur. Un composant qui se
   * rejouerait lui-même boucle sans que personne le voie : sur une panne
   * durable du stockage, il redemanderait indéfiniment, et chaque tour coûte un
   * appel à l'API ET une URL signée de plus. Le lecteur DEMANDE ; c'est la page
   * qui dit non.
   *
   * Si la seconde tentative échoue, le message du lecteur s'affiche — il nomme
   * déjà le geste à faire et porte une sortie vers la fiche.
   */
  const redemandeFaite = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    // Vérifié avant l'appel : un message clair plutôt que le 401 brut de l'API.
    // Le JWT étant httpOnly, on se fie au profil `bc_user` pour l'état connecté.
    if (!getUser()) {
      setError(ANONYMOUS);
      return;
    }
    api<ReadResponse>(`/opac/records/${id}/read`)
      .then(setData)
      .catch((err) =>
        setError(
          err instanceof ApiError
            ? err.message
            : 'Lecture indisponible pour le moment.',
        ),
      );
  }, [id]);

  if (error === ANONYMOUS) {
    return (
      <main id={ID_CONTENU} className="mx-auto max-w-lg px-6 py-16 text-center">
        <p className="text-sm text-muted">
          La lecture en ligne est réservée aux membres.{' '}
          <Link href="/login" className="font-semibold text-ocre underline">
            Connectez-vous
          </Link>{' '}
          ou{' '}
          <Link href="/inscription" className="font-semibold text-ocre underline">
            créez un compte
          </Link>
          .
        </p>
        <Link
          href={`/opac/${id}`}
          className="mt-4 inline-block text-sm font-semibold text-ocre underline"
        >
          Retour à la fiche
        </Link>
      </main>
    );
  }

  if (error) {
    return (
      <main id={ID_CONTENU} className="mx-auto max-w-lg px-6 py-16 text-center">
        <p role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
        <Link
          href={`/opac/${id}`}
          className="mt-4 inline-block text-sm font-semibold text-ocre underline"
        >
          Retour à la fiche
        </Link>
      </main>
    );
  }

  if (!data)
    return (
      <main id={ID_CONTENU} className="mx-auto max-w-lg px-6 py-16 text-center">
        <p className="text-sm text-muted">{LIBELLES.chargements.document}</p>
      </main>
    );

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-line bg-white px-4">
        <Link href={`/opac/${id}`} className="text-sm text-muted hover:text-ink">
          ← Fiche
        </Link>
        <h1 className="truncate font-serif text-base font-bold">{data.title}</h1>
      </header>
      <div className="min-h-0 flex-1">
        {data.fileFormat === 'EPUB' ? (
          /*
           * ⚠ BORNE ÉCRITE : L'EPUB NE REDEMANDE PAS. `react-reader` récupère
           * le fichier lui-même, dans epub.js — ce composant n'a pas de requête
           * propre, donc aucun refus à rattraper sans entrer dans la
           * bibliothèque. Lui passer `redemanderUrl` serait un décor.
           *
           * ⚠ Et le coût est NUL aujourd'hui, mesuré plutôt que supposé :
           * 156 copies numériques dans le fonds, 156 PDF, zéro EPUB. Le jour où
           * un EPUB est téléversé, cette borne devient réelle — c'est pour ça
           * qu'elle est écrite ici plutôt que tue.
           */
          <EpubReader url={data.url} recordId={id} />
        ) : (
          <PdfReader
            url={data.url}
            title={data.title}
            redemanderUrl={async () => {
              if (redemandeFaite.current) return null;
              redemandeFaite.current = true;
              try {
                const frais = await api<ReadResponse>(`/opac/records/${id}/read`);
                return frais.url;
              } catch {
                // ⚠ On ne pose PAS d'erreur ici : le lecteur affichera la
                // sienne, qui nomme déjà le geste à faire. Deux messages pour
                // un même échec en feraient un bruit.
                return null;
              }
            }}
          />
        )}
      </div>
    </div>
  );
}
