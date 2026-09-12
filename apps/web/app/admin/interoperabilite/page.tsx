'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useMyFunctions } from '@/lib/functions';
import { api } from '@/lib/api';
import { getToken } from '@/lib/session';
import { LIBELLES } from '@/lib/libelles';
import { Alert, Button, Card } from '@/components/ui';

/**
 * Réponse de `GET /cataloging/index-sante`.
 *
 * ⚠ `dansIndex` et `ecart` sont NULLABLES, et c'est tout le contrat : quand le
 * moteur ne répond pas, on ne sait pas ce qu'il contient. Les typer `number`
 * obligerait à inventer un zéro quelque part.
 */
interface SanteIndex {
  etat: 'aligne' | 'derive' | 'indisponible';
  enBase: number;
  dansIndex: number | null;
  ecart: number | null;
}

export default function InteroperabilitePage() {
  const { functions } = useMyFunctions();
  const canView = functions?.includes('diffusion.gerer');
  /**
   * ⚠ L'ÉCRAN ET LA ROUTE N'EXIGENT PAS LA MÊME FONCTION. Cet écran s'ouvre sur
   * `diffusion.gerer` ; `/cataloging/index-sante` est gardée par
   * `catalogue.gerer`. Quelqu'un peut donc légitimement voir la page sans avoir
   * droit à ce bloc — on ne l'appelle pas, et on n'affiche pas un échec qui
   * n'en est pas un. Afficher « vérification impossible » à qui n'a simplement
   * pas ce droit, ce serait signaler une panne là où il y a une permission.
   */
  const peutVoirIndex = functions?.includes('catalogue.gerer');

  /** `null` = pas encore su ; `'echec'` = la vérification elle-même a échoué. */
  const [sante, setSante] = useState<SanteIndex | 'echec' | null>(null);
  const [confirmeReindex, setConfirmeReindex] = useState(false);
  const [reindexation, setReindexation] = useState<'en-cours' | 'echec' | null>(null);
  const [reindexee, setReindexee] = useState<number | null>(null);
  const boiteConfirmation = useRef<HTMLDivElement>(null);

  function relireSante() {
    return api<SanteIndex>('/cataloging/index-sante', {}, getToken())
      .then(setSante)
      .catch(() => setSante('echec'));
  }

  const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms));

  /**
   * Relecture APRÈS une réindexation — et elle ne ressemble pas à l'autre.
   *
   * ⚠ TROUVÉ EN RECETTE, ET C'ÉTAIT MON PROPRE BOUTON QUI LE PRODUISAIT.
   * `reindexAll` VIDE l'index puis le remplit, et Meilisearch indexe de façon
   * ASYNCHRONE : relire la santé dans la foulée tombe au milieu de la
   * propagation. L'écran a affiché « 8001 notice(s) absentes de l'index sur
   * 8001 » une seconde après une réindexation RÉUSSIE — mesuré, puis mesuré à
   * nouveau : aligné à 8001/8001 dès la lecture suivante.
   *
   * C'est exactement l'invitation à réindexer que toute cette route existe pour
   * éviter, et je venais de la fabriquer moi-même.
   *
   * Donc : l'état passe à INCONNU pendant l'attente — l'écran dit « vérification
   * de l'index », il n'affirme pas une dérive —, et si la première relecture
   * voit l'index entièrement vide juste après un succès, on lui laisse une
   * seconde chance avant de la croire. Deux tentatives, jamais plus : au-delà,
   * un index réellement vide doit pouvoir se dire.
   */
  async function relireApresPropagation() {
    setSante(null);
    await attendre(1200);
    const premier = await api<SanteIndex>('/cataloging/index-sante', {}, getToken()).catch(
      () => null,
    );
    if (premier && premier.enBase > 0 && premier.ecart === premier.enBase) {
      await attendre(2000);
      return relireSante();
    }
    setSante(premier ?? 'echec');
  }

  useEffect(() => {
    if (!peutVoirIndex) return;
    void relireSante();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peutVoirIndex]);

  /**
   * ⚠ LE FOCUS VA À LA CONFIRMATION. Même défaut que sur l'écran des modules :
   * elle apparaît sous un bouton, et au clavier rien ne signalait son arrivée.
   */
  useEffect(() => {
    if (confirmeReindex) boiteConfirmation.current?.focus();
  }, [confirmeReindex]);

  async function reindexer() {
    setConfirmeReindex(false);
    setReindexation('en-cours');
    setReindexee(null);
    try {
      const res = await api<{ indexed: number }>(
        '/cataloging/reindex',
        { method: 'POST' },
        getToken(),
      );
      setReindexee(res.indexed);
      setReindexation(null);
      await relireApresPropagation();
    } catch {
      setReindexation('echec');
      // ⚠ ON RELIT QUAND MÊME : un échec laisse l'index dans un état inconnu, et
      // c'est justement le moment où son compte est l'information utile.
      await relireApresPropagation();
    }
  }

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

      {/*
        ⚠ L'ÉTAT DE L'INDEX EST UN SUJET DE DIFFUSION, pas de catalogage : une
        dérive rend des notices invisibles à la recherche publique et aux
        moissonneurs. D'où sa place ici, en tête — avant l'entrepôt qu'il
        conditionne.
      */}
      {peutVoirIndex && (
        <Card className="mt-5 max-w-2xl">
          <h2 className="font-serif text-lg font-bold">{LIBELLES.indexSante.titre}</h2>
          {sante === null && (
            <p className="mt-2 text-sm text-muted">{LIBELLES.indexSante.chargement}</p>
          )}
          {sante === 'echec' && (
            <p className="mt-2 text-sm text-muted">{LIBELLES.indexSante.echec}</p>
          )}
          {sante !== null && sante !== 'echec' && (
            <p
              className={`mt-2 text-sm ${
                sante.etat === 'aligne' ? 'text-muted' : 'text-heading'
              }`}
              // ⚠ `role="alert"` seulement quand quelque chose CLOCHE. Un état
              // aligné annoncé comme une alerte apprend à ignorer les alertes.
              role={sante.etat === 'aligne' ? undefined : 'status'}
            >
              {sante.etat === 'indisponible'
                ? LIBELLES.indexSante.indisponible(sante.enBase)
                : sante.etat === 'aligne'
                  ? LIBELLES.indexSante.aligne(sante.enBase)
                  : (sante.ecart ?? 0) > 0
                    ? LIBELLES.indexSante.manquantes(sante.ecart ?? 0, sante.enBase)
                    : LIBELLES.indexSante.fantomes(Math.abs(sante.ecart ?? 0))}
            </p>
          )}

          {/*
            ⚠ LE BOUTON N'EXISTE QU'EN ÉTAT « DERIVE ». Jamais sur
            « indisponible » — proposer de reconstruire un index dont on ignore
            le contenu, c'est l'invitation que toute cette route existe pour
            éviter. Et jamais sur « aligne » : il n'y aurait rien à réparer,
            donc un bouton sans objet.
          */}
          {sante !== null && sante !== 'echec' && sante.etat === 'derive' &&
            !confirmeReindex && reindexation !== 'en-cours' && (
              <Button
                variant="ghost"
                className="mt-3 min-h-11"
                onClick={() => setConfirmeReindex(true)}
              >
                {LIBELLES.indexSante.reindexer}
              </Button>
            )}

          {confirmeReindex && sante !== null && sante !== 'echec' && (
            <div
              ref={boiteConfirmation}
              role="group"
              aria-labelledby="titre-reindex"
              tabIndex={-1}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setConfirmeReindex(false);
              }}
              className="mt-3 rounded-md border border-red-200 p-3"
            >
              <p id="titre-reindex" className="font-semibold">
                {LIBELLES.indexSante.reindexerTitre}
              </p>
              {/* ⚠ Le coût AVANT le geste, et c'est le VIDAGE qui coûte, pas la
                  durée : mesuré à moins d'une seconde pour 8 000 notices. */}
              <p className="mt-2 text-sm text-muted">
                {LIBELLES.indexSante.reindexerCout(sante.enBase)}
              </p>
              <p className="mt-2 text-sm font-medium">
                {LIBELLES.indexSante.reindexerDonnees}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button className="min-h-11" onClick={() => void reindexer()}>
                  {LIBELLES.indexSante.reindexerConfirmer}
                </Button>
                <Button
                  variant="ghost"
                  className="min-h-11"
                  onClick={() => setConfirmeReindex(false)}
                >
                  {LIBELLES.indexSante.reindexerAnnuler}
                </Button>
              </div>
            </div>
          )}

          {reindexation === 'en-cours' && (
            <p className="mt-3 text-sm text-muted" role="status">
              {LIBELLES.indexSante.reindexEnCours}
            </p>
          )}
          {reindexation === 'echec' && (
            <p className="mt-3 text-sm text-red-800" role="alert">
              {LIBELLES.indexSante.reindexEchec}
            </p>
          )}
          {reindexee !== null && reindexation === null && (
            <p className="mt-3 text-sm text-muted" role="status">
              {LIBELLES.indexSante.reindexFait(reindexee)}
            </p>
          )}
        </Card>
      )}

      <Card className="mt-4 max-w-2xl">
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
