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
import { CouvertureComposee } from '@/components/couverture-composee';
import { LIBELLES } from '@/lib/libelles';

const T = LIBELLES.espaceLecteur.horsLigne;

interface DocumentHorsLigne {
  recordId: string;
  titre: string | null;
  appareilId: string;
  expireLe: string;
  /**
   * ⚠ REQUIS, et nullable — comme `category` sur la fiche, et pour la même
   * raison : la TEINTE de la couverture en dépend. Un `domaine?:` optionnel
   * voudrait dire « parfois absent du contrat », donc une teinte de repli sur
   * un écran qui compose, et le même document changerait de couleur selon
   * l'écran où on le regarde — ce que l'obligation ① de la spécification
   * interdit.
   *
   * Mesuré le 11 octobre 2026 : `/reader/hors-ligne` le sert, et c'est LA MÊME
   * CHAÎNE que `category` — 5 baux comparés contre `GET /opac/records/:id`,
   * zéro écart, casse et accents compris.
   */
  domaine: string | null;
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
              {/*
                ⚠ LA COUVERTURE COMPOSÉE, EN 56×76 — DONC L'INITIALE SEULE, et
                c'est la spécification qui le décide, pas une économie : « en
                dessous de H = 80, on n'affiche que l'INITIALE du titre ». Une
                étagère est une liste de lignes compactes ; y poser quatre
                lignes de titre en 8 px serait illisible, et la spécification a
                déjà tranché ce cas pour la liste du mobile (62 dp).

                ⚠ ET ON NE MET PAS À L'ÉCHELLE EN CSS : le seuil des 80 px, le
                dos borné et le rayon des angles ne sont pas proportionnels.
                Une couverture calculée pour 164 puis réduite à 76 afficherait
                son texte complet à 76 px.

                ⚠ `aria-hidden` reste vrai ici : l'INITIALE est un fragment du
                titre affiché juste à côté, et la teinte n'est pas un texte.
                `couverture-branchee.spec.tsx` le vérifie par l'EFFET, sur cet
                écran comme sur la fiche.
              */}
              <div className="flex items-start gap-3">
                <CouvertureComposee
                  notice={{ titre: d.titre ?? '', domaine: d.domaine }}
                  largeur={56}
                  hauteur={76}
                  className="shrink-0 rounded"
                />
                <div className="min-w-0 flex-1">
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
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
