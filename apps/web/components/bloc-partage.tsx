'use client';

import { useEffect, useState } from 'react';

import { QrCode } from '@/components/qr-code';
import { LIBELLES } from '@/lib/libelles';
import { adresseDuQr, lienApplication } from '@/lib/url-publique';

const T = LIBELLES.partage;

/**
 * LE BLOC « PARTAGER » D'UNE NOTICE — QR code, adresse en clair, affiche.
 *
 * ## ⚠ L'ADRESSE S'AFFICHE EN TEXTE, ET CE N'EST PAS DÉCORATIF
 *
 * Deux raisons qui se cumulent, et chacune suffirait :
 *
 * · **Un QR est inutilisable pour qui ne voit pas.** Il est donc `aria-hidden`,
 *   et la règle qui l'autorise — la même que pour la couverture composée — est
 *   que son contenu soit affiché en TEXTE à côté. Sans l'adresse, un lecteur
 *   d'écran n'obtiendrait rien du tout.
 * · **L'adresse publique est dérivée de l'origine du navigateur** (voir
 *   `lib/url-publique.ts` : `publicUrl` n'est pas servi par l'API, mesuré). Une
 *   affiche imprimée depuis une adresse interne encoderait celle-là, et le
 *   texte en clair est ce qui permet à un humain de le voir AVANT de coller
 *   l'affiche dans un couloir.
 *
 * ## ⚠ L'ADRESSE SE CALCULE APRÈS LE MONTAGE
 *
 * `window.location.origin` n'existe pas au rendu serveur. Le bloc rend donc
 * d'abord son squelette, puis l'adresse — et surtout il ne rend **aucun QR**
 * tant qu'il n'a pas d'adresse : un QR d'une chaîne vide serait un code
 * parfaitement valide menant nulle part, c'est-à-dire le pire des faux.
 */
export function BlocPartage({
  recordId,
  publicUrl,
}: {
  recordId: string;
  /**
   * ⚠ L'ADRESSE CANONIQUE SERVIE PAR L'API, ou `null` quand l'instance n'a pas
   * configuré `APP_URL`. On la PRÉFÈRE à l'origine : elle survit à une
   * impression faite depuis une adresse interne.
   */
  publicUrl: string | null;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [android, setAndroid] = useState(false);

  useEffect(() => {
    setUrl(adresseDuQr(recordId, publicUrl));
    /*
     * ⚠ On ne peut PAS savoir si l'application est installée — aucune
     * interrogation n'existe depuis une page web. On sait seulement qu'on est
     * sur Android, donc qu'un lien `gafeso://` a une chance d'aboutir. La
     * CONDITION est dite dans le libellé, parce qu'un lien qui ne fait rien
     * est un bouton sans effet.
     */
    setAndroid(/Android/i.test(navigator.userAgent));
  }, [recordId, publicUrl]);

  return (
    <section className="mt-8 rounded-lg border border-line bg-paper/60 p-4">
      <h2 className="font-serif text-lg font-bold">{T.titre}</h2>

      {url === null ? (
        /* ⚠ Pas de QR tant qu'on ne sait pas : un code valide vers une adresse
           vide serait pire que son absence. */
        <p className="mt-2 text-sm text-muted">{LIBELLES.commun.chargement}</p>
      ) : (
        <div className="mt-3 flex flex-wrap items-start gap-5">
          <QrCode valeur={url} taille={148} className="shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm">{T.aide}</p>
            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">
              {T.adresse}
            </p>
            {/* ⚠ `break-all` : une adresse de notice porte un UUID, donc 36
                caractères sans espace. Sans elle, elle déborde sur mobile. */}
            <p className="mt-0.5 break-all font-mono text-xs">{url}</p>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <a
                href={`/affiche/${recordId}`}
                target="_blank"
                rel="noopener"
                className="inline-flex min-h-11 items-center rounded-md bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-ink/90"
              >
                {T.imprimer}
              </a>
              {android && (
                <a
                  href={lienApplication(url)}
                  className="inline-flex min-h-11 items-center rounded-md border border-line bg-white px-3 py-2 text-sm font-medium hover:border-ocre/50"
                >
                  {T.ouvrirDansApp}
                </a>
              )}
            </div>
            <p className="mt-1.5 text-xs text-muted">{T.imprimerAide}</p>
            {android && <p className="mt-1 text-xs text-muted">{T.ouvrirDansAppAide}</p>}
          </div>
        </div>
      )}
    </section>
  );
}
