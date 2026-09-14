'use client';

// Le DÉTAIL d'un entrepôt moissonné — comptes rendus et notices signalées.
//
// ⚠ AUCUNE ROUTE NE RÉSOUT UNE COLLISION. L'API l'écrit dans son propre code :
// « on SIGNALE, on ne tranche pas — c'est un humain qui décidera ». Cet écran
// MONTRE donc, et n'offre aucun geste d'arbitrage : un bouton qui ne peut pas
// aboutir est pire que son absence.
//
// ⚠ Ce qu'il offre à la place est le seul geste qui existe : ouvrir NOTRE
// notice, pour que la personne décide en la regardant.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { getToken } from '@/lib/session';
import { useMyFunctions } from '@/lib/functions';
import { LIBELLES } from '@/lib/libelles';
import { Alert, Badge, Button, Card } from '@/components/ui';

const T = LIBELLES.moissonnage;
const D = LIBELLES.moissonnage.detail;

interface Execution {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  outcome: string;
  reason: string | null;
  received: number;
  created: number;
  ignored: number;
  collided: number;
  deletions: number;
}

interface Collision {
  id: string;
  oaiIdentifier: string;
  datestamp: string;
  /** ⚠ Peut manquer : une notice ignorée faute de titre, puis redonnée. */
  recordId: string | null;
  status: string;
  lastSeenAt: string;
}

interface Page<T> {
  total: number;
  page: number;
  totalPages: number;
}

/** ⚠ Seules ces deux issues autorisent à lire des chiffres de récolte. */
const A_RECOLTE = new Set(['moisson', 'vide']);

const dateFr = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(iso));

export default function DetailMoissonnagePage() {
  const { id } = useParams<{ id: string }>();
  const { functions } = useMyFunctions();
  const peutMoissonner = functions?.includes('outils.catalogue');

  /** ⚠ `null` TANT QU'ON NE SAIT PAS, des deux côtés. */
  const [executions, setExecutions] = useState<(Page<Execution> & { runs: Execution[] }) | null>(null);
  const [collisions, setCollisions] = useState<
    (Page<Collision> & { collisions: Collision[] }) | null
  >(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [pageExec, setPageExec] = useState(1);
  const [pageColl, setPageColl] = useState(1);

  const charger = useCallback(async () => {
    setErreur(null);
    try {
      const [ex, co] = await Promise.all([
        api<Page<Execution> & { runs: Execution[] }>(
          `/moissonnage/sources/${id}/executions?page=${pageExec}`,
          {},
          getToken(),
        ),
        api<Page<Collision> & { collisions: Collision[] }>(
          `/moissonnage/sources/${id}/collisions?page=${pageColl}`,
          {},
          getToken(),
        ),
      ]);
      setExecutions(ex);
      setCollisions(co);
    } catch {
      // ⚠ On ne retombe sur AUCUNE liste vide : « aucune collision » pendant une
      // panne dirait que rien n'attend d'arbitrage, ce qui est exactement le
      // contraire du service rendu.
      setExecutions(null);
      setCollisions(null);
      setErreur(D.echec);
    }
  }, [id, pageExec, pageColl]);

  useEffect(() => {
    if (peutMoissonner) void charger();
  }, [peutMoissonner, charger]);

  if (functions && !peutMoissonner) {
    return <Alert tone="error">{LIBELLES.refusDeDroit.moissonnage}</Alert>;
  }

  return (
    <div>
      <Link href="/admin/moissonnage" className="text-sm text-ocre hover:underline">
        ← {D.retour}
      </Link>

      {erreur && (
        <Alert tone="error" className="mt-4">
          {erreur}
        </Alert>
      )}

      <h1 className="mt-3 font-serif text-3xl font-bold">{D.comptesRendus}</h1>

      {/* ⚠ Ni liste ni « jamais moissonnée » tant que la réponse n'est pas là. */}
      {!executions && !erreur && <p className="mt-4 text-sm text-muted">{D.chargement}</p>}
      {executions?.runs.length === 0 && (
        <p className="mt-4 text-sm text-muted">{D.aucunCompteRendu}</p>
      )}

      <div className="mt-4 flex flex-col gap-3">
        {executions?.runs.map((ex) => (
          <Card key={ex.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-sm text-muted">{dateFr(ex.startedAt)}</p>
              <Badge
                tone={
                  ex.outcome === 'moisson' ? 'green' : ex.outcome === 'en_cours' ? 'neutral' : 'ocre'
                }
              >
                {T.issues[ex.outcome] ?? ex.outcome}
              </Badge>
            </div>
            {/*
              ⚠ LE BILAN NE SE LIT QUE POUR UNE RÉCOLTE RÉELLE — même règle que
              sur la liste. Sous une source injoignable, « 0 reçue » serait exact
              et la lecture fausse.
            */}
            {A_RECOLTE.has(ex.outcome) && (
              <p className="mt-1 text-sm text-muted">{T.bilan(ex.received, ex.created, ex.ignored)}</p>
            )}
            {ex.reason && <p className="mt-1 text-sm text-muted">{T.motif(ex.reason)}</p>}
            {ex.deletions > 0 && (
              <p className="mt-1 text-sm text-muted">{T.suppressionsSignalees(ex.deletions)}</p>
            )}
          </Card>
        ))}
      </div>

      {executions && executions.totalPages > 1 && (
        <div className="mt-3 flex items-center gap-3">
          <Button variant="ghost" disabled={executions.page <= 1} onClick={() => setPageExec((p) => p - 1)}>
            {D.pagePrecedente}
          </Button>
          <span className="text-sm text-muted">{D.pageSur(executions.page, executions.totalPages)}</span>
          <Button
            variant="ghost"
            disabled={executions.page >= executions.totalPages}
            onClick={() => setPageExec((p) => p + 1)}
          >
            {D.pageSuivante}
          </Button>
        </div>
      )}

      <h2 className="mt-8 font-serif text-xl font-bold">{D.collisionsTitre}</h2>
      {/*
        ⚠ DIT L'ÉTAT, PAS UNE ALERTE. Ces lignes ne sont pas un défaut : rien n'a
        été écrasé, et c'est une décision humaine qui les attend. Le ton de
        l'anomalie qualifierait de faute le fonctionnement même du moissonnage.
      */}
      <p className="mt-1 text-sm text-muted">{D.collisionsIntro}</p>

      {!collisions && !erreur && <p className="mt-4 text-sm text-muted">{D.chargement}</p>}
      {collisions?.collisions.length === 0 && (
        <p className="mt-4 text-sm text-muted">{D.aucuneCollision}</p>
      )}

      <div className="mt-4 flex flex-col gap-3">
        {collisions?.collisions.map((c) => (
          <Card key={c.id}>
            <p className="break-all text-sm">
              <span className="text-muted">{D.identifiantSource} : </span>
              <span className="font-mono text-xs">{c.oaiIdentifier}</span>
            </p>
            <p className="mt-1 text-sm text-muted">
              {D.dateSource} : {c.datestamp}
            </p>
            <p className="mt-1 text-sm text-muted">{D.vueLe(dateFr(c.lastSeenAt))}</p>
            {/*
              ⚠ LE SEUL GESTE QUI EXISTE : ouvrir NOTRE notice, pour décider en
              la regardant. Aucune route ne résout une collision — on n'offre
              donc pas de bouton d'arbitrage.
              Et `recordId` peut manquer : on le DIT au lieu d'un lien mort.
            */}
            <p className="mt-2 text-sm">
              {c.recordId ? (
                <Link href={`/admin/catalogue/${c.recordId}`} className="text-ocre hover:underline">
                  {D.ouvrirLaNotice}
                </Link>
              ) : (
                <span className="text-muted">{D.sansNoticeLocale}</span>
              )}
            </p>
          </Card>
        ))}
      </div>

      {collisions && collisions.totalPages > 1 && (
        <div className="mt-3 flex items-center gap-3">
          <Button variant="ghost" disabled={collisions.page <= 1} onClick={() => setPageColl((p) => p - 1)}>
            {D.pagePrecedente}
          </Button>
          <span className="text-sm text-muted">{D.pageSur(collisions.page, collisions.totalPages)}</span>
          <Button
            variant="ghost"
            disabled={collisions.page >= collisions.totalPages}
            onClick={() => setPageColl((p) => p + 1)}
          >
            {D.pageSuivante}
          </Button>
        </div>
      )}
    </div>
  );
}
