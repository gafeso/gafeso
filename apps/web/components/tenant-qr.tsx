'use client';

import { useState } from 'react';
import { Card } from '@/components/ui';

/**
 * QR d'établissement — aperçu et téléchargement (PNG, affiche PDF A4).
 *
 * Aucun état, aucun appel JavaScript : les deux formats sont de simples liens
 * vers l'API, proxifiée en same-origin sous `/api`, donc le cookie de session
 * part tout seul. Un téléchargement de fichier n'a aucune raison de passer par
 * du code que l'on devra déboguer.
 *
 * Le QR encode `https://<domaine de l'établissement>/e/<slug>` — l'origine et
 * l'identifiant, jamais l'adresse de l'API : une affiche imprimée survit à la
 * configuration du serveur, et doit continuer de fonctionner après une
 * migration.
 */
export function TenantQrSection({ slug, url }: { slug: string; url?: string | null }) {
  const [erreurImage, setErreurImage] = useState(false);

  return (
    <Card className="mt-5">
      <h2 className="font-serif text-lg font-bold">QR d’inscription</h2>
      <p className="mt-2 text-sm text-muted">
        À afficher à l’entrée, sur les tables et en amphi. Les lecteurs le scannent
        avec l’appareil photo de leur téléphone pour connecter l’application, ou
        tombent sur une page qui leur explique quoi installer s’ils ne l’ont pas.
      </p>

      <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className="shrink-0">
          {erreurImage ? (
            <div className="flex h-44 w-44 items-center justify-center rounded border border-line p-4 text-center text-xs text-muted">
              Aperçu indisponible. Le téléchargement reste possible.
            </div>
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src="/api/tenancy/qr.png"
              alt={`QR d’inscription de l’établissement ${slug}`}
              className="h-44 w-44 rounded border border-line"
              onError={() => setErreurImage(true)}
            />
          )}
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <a
              href="/api/tenancy/qr.pdf"
              className="rounded border border-line px-3 py-2 text-sm font-semibold hover:bg-gray-50"
            >
              Affiche A4 (PDF)
            </a>
            <a
              href="/api/tenancy/qr.png?download=1"
              className="rounded border border-line px-3 py-2 text-sm font-semibold hover:bg-gray-50"
            >
              Image seule (PNG)
            </a>
          </div>

          <p className="text-sm text-muted">
            L’affiche porte le nom de l’établissement et l’adresse en toutes lettres
            sous le code : un lecteur dont le téléphone ne lit pas les QR doit
            pouvoir la recopier.
          </p>

          <dl className="text-sm">
            <dt className="text-muted">Code d’école</dt>
            <dd className="font-mono font-semibold">{slug}</dd>
            {url && (
              <>
                <dt className="mt-2 text-muted">Adresse encodée</dt>
                <dd className="break-all font-mono text-xs">{url}</dd>
              </>
            )}
          </dl>
        </div>
      </div>
    </Card>
  );
}
