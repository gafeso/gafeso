'use client';

/**
 * « MES DOCUMENTS HORS LIGNE » — ce qui est emporté sur mes appareils.
 *
 * Contrat : `GET /reader/hors-ligne` (rc7).
 *
 * ## ⚠ DEUX PRÉCAUTIONS, ET LA SECONDE EST LA PLUS IMPORTANTE
 *
 * · **« EMPORTÉS », jamais « LUS ».** Ce sont les documents DÉLIVRÉS à un
 *   appareil : le produit ne sait pas s'ils ont été ouverts, et il ne le saura
 *   pas. La lecture hors connexion n'est pas tracée.
 *
 * · ⚠⚠ **L'ÉTAT VIDE NE DIT PAS « VOUS N'AVEZ JAMAIS RIEN EMPORTÉ ».** La route
 *   ne sert que les baux NON EXPIRÉS : le produit ne PEUT donc pas distinguer
 *   « jamais rien emporté » de « plus rien en cours ». Affirmer le premier
 *   serait un faux sur l'histoire de quelqu'un. On dit ce qu'on sait — « rien en
 *   ce moment » — et on donne la RÈGLE qui l'explique, pour que l'absence ne se
 *   lise pas comme une perte.
 */
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Alert, Card } from '@/components/ui';
import { ID_CONTENU } from '@/components/lien-evitement';
import { LIBELLES } from '@/lib/libelles';

const T = LIBELLES.espaceLecteur.horsLigne;

interface DocumentHorsLigne {
  recordId: string;
  titre: string | null;
  appareilId: string;
  expireLe: string;
}

export default function MesDocumentsHorsLignePage() {
  // ⚠ `null` = pas encore su, distinct d'une liste vide.
  const [docs, setDocs] = useState<DocumentHorsLigne[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    api<{ documents: DocumentHorsLigne[] }>('/reader/hors-ligne')
      .then((r) => setDocs(r.documents))
      .catch((e) => setErreur(e instanceof ApiError ? e.message : String(e)));
  }, []);

  return (
    <main id={ID_CONTENU} className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="font-serif text-2xl font-bold">{T.titre}</h1>
      <p className="mt-2 text-sm text-muted">{T.intro}</p>
      {erreur && <Alert tone="error" className="mt-4">{erreur}</Alert>}
      {!docs && !erreur && <p className="mt-6 text-sm text-muted">{LIBELLES.commun.chargement}</p>}

      {docs && docs.length === 0 && (
        <Alert tone="warning" className="mt-5">
          {T.aucunEnCours}
          {/* ⚠ LA RÈGLE DANS LE MÊME SOUFFLE : sans elle, « aucun document » se
              lit comme « j'ai perdu ce que j'avais emporté ». */}
          <span className="mt-1 block text-xs">{T.aucunEnCoursMotif}</span>
        </Alert>
      )}

      {docs && docs.length > 0 && (
        <div className="mt-5 flex flex-col gap-2">
          {docs.map((d, i) => (
            <Card key={`${d.recordId}-${d.appareilId}-${i}`} className="!p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">
                  {d.titre ? (
                    <a className="text-ocre underline" href={`/opac/${d.recordId}`}>
                      {d.titre}
                    </a>
                  ) : (
                    <span className="italic text-muted">{T.noticeRetiree}</span>
                  )}
                </span>
                <span className="text-sm text-muted">{T.expireLe(new Date(d.expireLe))}</span>
              </div>
              {/* ⚠ L'identifiant d'appareil est MONTRÉ, pas masqué : c'est la
                  seule chose qui dise au lecteur SUR QUEL appareil le document
                  est posé, quand il en a plusieurs. */}
              <p className="mt-1 text-xs text-muted">
                {T.appareil} · <span className="font-mono">{d.appareilId.slice(0, 12)}</span>
              </p>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
