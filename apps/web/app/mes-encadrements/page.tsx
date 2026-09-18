'use client';

// « Mes encadrements » — P6-3, moitié front. La porte de `encadrements.voir`,
// qui existait au catalogue de fonctions sans qu'aucun écran ne l'ouvre.
//
// ⚠ CET ÉCRAN SERT À MONTER UN DOSSIER. L'API le dit dans la description de sa
// route CSV : la liste est « la pièce du dossier CCI ». C'est ce qui décide de
// deux choix qui n'auraient sinon rien d'évident :
//
//   1. TROIS ÉTATS, JAMAIS DEUX. « Aucun encadrement » et « votre compte n'est
//      pas rattaché à votre fiche d'auteur » sont deux choses. Confondre les
//      deux affirme à un enseignant qu'il n'a rien dirigé — et il ne peut RIEN
//      y faire, le rattachement se pose au catalogage. D'où `ficheLiee`, lu
//      AVANT de conclure quoi que ce soit.
//   2. L'EXPORT N'EST PAS PAGINÉ, et l'écran le dit. Une pièce justificative
//      tronquée sans le dire serait un faux dans un dossier de promotion.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { getToken } from '@/lib/session';
import { useMyFunctions } from '@/lib/functions';
import { LIBELLES } from '@/lib/libelles';
import { Alert, Badge, Button, Card } from '@/components/ui';
import { Header } from '@/components/header';
import { ID_CONTENU, LienDEvitement } from '@/components/lien-evitement';

const T = LIBELLES.mesEncadrements;

/**
 * Le vocabulaire fermé de `recordType`, dans les mots du lecteur.
 *
 * ⚠ IL NE SE CONFOND PAS AVEC `LIBELLES.typesDeDepot`, et cet écran est le seul
 * à porter la différence. `Deposit.documentType` porte cinq valeurs — le
 * vocabulaire académique du dépôt. `BiblioRecord.recordType` en porte d'autres,
 * dont `ouvrage`, parce qu'il décrit TOUT le catalogue. Les fondre ferait
 * apparaître « Ouvrage » dans un menu de dépôt de thèse.
 */
const TYPES: Record<string, string> = {
  memoire: 'Mémoire',
  these: 'Thèse',
  licence: 'Mémoire de licence',
  master: 'Mémoire de master',
  these_unique: 'Thèse unique',
  ouvrage: 'Ouvrage',
};

interface Encadrement {
  recordId: string;
  titre: string;
  type: string;
  annee: number | null;
  etudiant: string | null;
  universiteDeSoutenance: string | null;
}

interface MesEncadrements {
  /** ⚠ À LIRE AVANT DE CONCLURE. Voir la note en tête de fichier. */
  ficheLiee: boolean;
  nomDeLaFiche: string | null;
  total: number;
  page: number;
  totalPages: number;
  encadrements: Encadrement[];
}

export default function MesEncadrementsPage() {
  const { functions } = useMyFunctions();
  const peutVoir = functions?.includes('encadrements.voir');

  /** ⚠ `null` TANT QU'ON NE SAIT PAS — ni « aucun », ni « non rattaché ». */
  const [donnees, setDonnees] = useState<MesEncadrements | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [numeroPage, setNumeroPage] = useState(1);

  const charger = useCallback(async () => {
    setErreur(null);
    try {
      // `page` est acceptée : le DTO de l'API la déclare, et la réponse rend
      // `totalPages`. Lu dans `mes-encadrements.dto.ts` avant d'être envoyé —
      // `/authors` a coûté une correction pire que le défaut pour avoir
      // supposé l'inverse.
      setDonnees(
        await api<MesEncadrements>(
          `/encadrements/miens?page=${numeroPage}`,
          {},
          getToken(),
        ),
      );
    } catch {
      // ⚠ On ne retombe PAS sur un objet vide : une panne s'écrirait alors
      // « vous n'avez encadré aucune thèse ».
      setDonnees(null);
      setErreur(T.erreur);
    }
  }, [numeroPage]);

  useEffect(() => {
    if (peutVoir) void charger();
  }, [peutVoir, charger]);

  if (functions && !peutVoir) {
    return (
      <>
        <LienDEvitement />
        <Header />
        <main id={ID_CONTENU} className="mx-auto max-w-4xl px-6 py-8">
          <p className="rounded-md border border-line bg-paper px-3 py-2 text-sm text-muted">
            {LIBELLES.refusDeDroit.encadrements}
          </p>
        </main>
      </>
    );
  }

  return (
    <>
      <LienDEvitement />
      <Header />
      <main id={ID_CONTENU} className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="text-2xl font-semibold text-ink">{T.titre}</h1>
        <p className="mt-1 text-sm text-muted">{T.introduction}</p>

        {erreur && (
          <Alert tone="error" className="mt-4">
            {erreur}
          </Alert>
        )}

        {/* ⚠ Ni « aucun » ni « non rattaché » tant que la réponse n'est pas là. */}
        {!donnees && !erreur && <p className="mt-6 text-sm text-muted">{T.chargement}</p>}

        {donnees && !donnees.ficheLiee && (
          <Card className="mt-6">
            <h2 className="text-base font-semibold text-ink">{T.ficheNonLieeTitre}</h2>
            <p className="mt-2 text-sm text-muted">{T.ficheNonLiee}</p>
          </Card>
        )}

        {donnees?.ficheLiee && (
          <>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Badge>{T.total(donnees.total)}</Badge>
              {donnees.nomDeLaFiche && (
                <span className="text-sm text-muted">{T.enregistreSous(donnees.nomDeLaFiche)}</span>
              )}
              {donnees.total > 0 && (
                <a
                  // Le cookie de session est same-origin et httpOnly : un lien
                  // suffit, aucun jeton dans l'URL.
                  href="/api/encadrements/miens.csv"
                  download
                  className="ml-auto rounded-md border border-ink bg-ink px-3 py-1.5 text-sm font-medium text-white hover:bg-ink/90"
                >
                  {T.exportCsv}
                </a>
              )}
            </div>
            {donnees.total > 0 && <p className="mt-2 text-xs text-muted">{T.exportAide}</p>}

            {donnees.total === 0 ? (
              <p className="mt-6 text-sm text-muted">{T.aucun}</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[44rem] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs uppercase text-muted">
                      <th scope="col" className="py-2 pr-3">{T.colonneAnnee}</th>
                      <th scope="col" className="py-2 pr-3">{T.colonneEtudiant}</th>
                      <th scope="col" className="py-2 pr-3">{T.colonneTitre}</th>
                      <th scope="col" className="py-2 pr-3">{T.colonneType}</th>
                      <th scope="col" className="py-2">{T.colonneUniversite}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {donnees.encadrements.map((e) => (
                      <tr key={e.recordId} className="border-b border-line/60 align-top">
                        <td className="py-2 pr-3 tabular-nums">{e.annee ?? T.nonRenseigne}</td>
                        <td className="py-2 pr-3">{e.etudiant ?? T.nonRenseigne}</td>
                        <td className="py-2 pr-3 font-medium text-ink">
                          {/*
                            ⚠ `/opac/:id`, PAS `/catalogue/:id`. Cette adresse-là
                            n'existe pas — `app/catalogue/` n'a jamais existé, et
                            les quatre titres de cet écran rendaient un 404.
                            Trouvé le 16 septembre 2026 en RECETTANT le moment 2
                            bis de la démonstration : un enseignant qui clique le
                            mémoire qu'il a dirigé tombait sur « page could not be
                            found ». Aucun test ne pouvait le voir — un href est
                            rendu, il n'est pas suivi.
                          */}
                          <Link className="hover:underline" href={`/opac/${e.recordId}`}>
                            {e.titre}
                          </Link>
                        </td>
                        <td className="py-2 pr-3">{TYPES[e.type] ?? e.type}</td>
                        <td className="py-2">{e.universiteDeSoutenance ?? T.nonRenseigne}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {donnees.totalPages > 1 && (
              <div className="mt-4 flex items-center gap-3">
                <Button
                  variant="ghost"
                  disabled={donnees.page <= 1}
                  onClick={() => setNumeroPage((p) => Math.max(1, p - 1))}
                >
                  {T.pagePrecedente}
                </Button>
                <span className="text-sm text-muted">
                  {T.pageSur(donnees.page, donnees.totalPages)}
                </span>
                <Button
                  variant="ghost"
                  disabled={donnees.page >= donnees.totalPages}
                  onClick={() => setNumeroPage((p) => p + 1)}
                >
                  {T.pageSuivante}
                </Button>
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
