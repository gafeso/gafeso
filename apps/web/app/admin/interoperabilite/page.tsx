'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMyFunctions } from '@/lib/functions';
import { Alert, Card } from '@/components/ui';

export default function InteroperabilitePage() {
  const { functions } = useMyFunctions();
  const canView = functions?.includes('diffusion.gerer');

  const [oaiUrl, setOaiUrl] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Le point d'accès OAI est servi par l'API, joignable via le proxy same-origin
    // (/api) sur le domaine de l'école : le Host résout l'établissement.
    setOaiUrl(`${window.location.origin}/api/oai`);
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(oaiUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* presse-papiers indisponible : l'URL reste sélectionnable à la main */
    }
  }

  if (functions && !canView) {
    return (
      <Alert tone="error">
        Vous n’avez pas la permission de gérer la diffusion (fonction
        «&nbsp;diffusion.gerer&nbsp;»).
      </Alert>
    );
  }

  return (
    <div>
      <h1 className="font-serif text-3xl font-bold">Interopérabilité</h1>
      <p className="mt-1 text-sm text-muted">
        Rendez votre catalogue visible dans les portails documentaires et
        moissonneurs.
      </p>

      <Card className="mt-5 max-w-2xl">
        <h2 className="font-serif text-lg font-bold">Serveur OAI-PMH</h2>
        <p className="mt-2 text-sm text-muted">
          Le protocole <strong>OAI-PMH</strong> permet à des portails et catalogues
          collectifs (par exemple <strong>BASE</strong>, les catalogues de
          l’<strong>AUF</strong>, ou un catalogue collectif régional) de
          <em> moissonner</em> automatiquement les métadonnées de votre catalogue,
          et donc de faire apparaître vos documents dans leurs résultats de
          recherche. Communiquez l’adresse ci-dessous au moissonneur : il s’occupe
          du reste, et se resynchronise tout seul quand vos notices changent.
        </p>

        <label className="mt-4 block text-sm font-medium">Adresse du point d’accès OAI-PMH</label>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <code className="flex-1 break-all rounded-md border border-line bg-paper px-3 py-2 font-mono text-sm">
            {oaiUrl || '…'}
          </code>
          <button
            onClick={copy}
            className="rounded-md border border-line px-3 py-2 text-sm font-medium text-ink hover:bg-line/40"
          >
            {copied ? 'Copié ✓' : 'Copier'}
          </button>
          {oaiUrl && (
            <a
              href={`${oaiUrl}?verb=Identify`}
              target="_blank"
              rel="noreferrer"
              className="rounded-md bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-ink/90"
            >
              Tester (Identify)
            </a>
          )}
        </div>

        <p className="mt-3 text-xs text-muted">
          Formats exposés : <strong>oai_dc</strong> (Dublin Core) et{' '}
          <strong>marcxchange</strong> (norme <strong>ISO 25577</strong>), où chaque
          notice déclare son dialecte : <strong>UNIMARC</strong>, et non MARC21.
          Seules les métadonnées bibliographiques sont
          diffusées — jamais les fichiers numériques. Le moissonnage se fait par
          domaine (<em>sets</em>) et de façon incrémentale (dates de
          modification).
        </p>
      </Card>

      <Card className="mt-4 max-w-2xl">
        <h2 className="font-serif text-lg font-bold">Export MARC</h2>
        <p className="mt-2 text-sm text-muted">
          Pour un échange ponctuel (migration, dépôt légal, partage avec une autre
          bibliothèque), exportez une notice ou tout le catalogue en{' '}
          <strong>ISO&nbsp;2709</strong> ou <strong>MarcXchange</strong> depuis le{' '}
          <Link href="/admin/catalogue" className="text-ocre underline">
            catalogue
          </Link>
          . Le format est réimportable sans perte.
        </p>
      </Card>
    </div>
  );
}
