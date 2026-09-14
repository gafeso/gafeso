'use client';

// « Dépôts en attente » — la vue du personnel sur ce qui n'a pas été décidé.
// `GET /depots/soumis`, 12 septembre 2026.
//
// ⚠ CE QU'ELLE REND VISIBLE. Un dépôt soumis ne sort de cet état que par son
// directeur désigné. Si celui-ci ne peut plus agir — rôle changé, compte
// désactivé, départ — le dépôt attend indéfiniment, et PERSONNE ne le voyait :
// `a-valider` est auto-portée au directeur, `a-cataloguer` ne rend que les
// validés, `mes-depots` est celle du déposant.
//
// ⚠ ELLE N'OFFRE AUCUN GESTE DE DÉCISION, et c'est une propriété de l'API :
// valider et refuser restent au directeur désigné. Un bouton qui refuserait
// serait pire que son absence.
//
// ⚠ ET LA RÉATTRIBUTION N'EST PAS ICI, faute d'une porte. `POST :id/reattribuer`
// exige `catalogue.gerer` — que le bibliothécaire a — mais le menu des
// directeurs (`GET /depots/directeurs`) exige `depot.deposer`, qu'il n'a pas.
// Signalé en passation le 12 septembre au soir ; le geste viendra quand la
// liste des directeurs lui sera accessible. On ne montre pas un bouton qui ne
// peut pas aboutir.

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/session';
import { useMyFunctions } from '@/lib/functions';
import { LIBELLES } from '@/lib/libelles';
import { Alert, Badge, Button, Card, Select } from '@/components/ui';

const T = LIBELLES.depotsSoumis;

/** Un directeur désignable — `{ id, nom }`, rien d'autre. */
interface Directeur {
  id: string;
  nom: string;
}

/**
 * ⚠ LE CONTRAT A CHANGÉ LE 13 SEPTEMBRE 2026. `GET /depots/soumis` rendait un
 * TABLEAU ; il rend désormais `{ depots, directeurs }` — la liste des directeurs
 * désignables voyage avec les dépôts qu'elle sert, parce que le menu dédié exige
 * `depot.deposer` que le bibliothécaire n'a pas.
 *
 * ⚠ Ma suite est restée VERTE pendant que l'écran cassait : la doublure rendait
 * l'ancienne forme, c'est-à-dire mon hypothèse. C'est la lecture de l'API qui
 * l'a dit, jamais le harnais.
 */
interface ReponseSoumis {
  depots: DepotSoumis[];
  directeurs: Directeur[];
}

interface DepotSoumis {
  id: string;
  title: string;
  authorName: string;
  documentType: string;
  submittedAt: string | null;
  directorId: string | null;
  /** Le NOM du directeur — un identifiant ne se lit pas. */
  directeur: string | null;
  /** ⚠ `null` quand la date manque : zéro dirait « aujourd'hui », et ce serait faux. */
  joursDepuisSoumission: number | null;
}

export default function DepotsSoumisPage() {
  const { functions } = useMyFunctions();
  const peutVoir = functions?.includes('catalogue.gerer');

  /** ⚠ `null` TANT QU'ON NE SAIT PAS : un « aucun dépôt » prématuré fait partir. */
  const [reponse, setReponse] = useState<ReponseSoumis | null>(null);
  const depots = reponse?.depots ?? null;
  const directeurs = reponse?.directeurs ?? null;
  const [avis, setAvis] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  /** Le dépôt dont on choisit le nouveau directeur. */
  const [reattribution, setReattribution] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setErreur(null);
    try {
      setReponse(await api<ReponseSoumis>('/depots/soumis', {}, getToken()));
    } catch {
      // ⚠ On ne retombe PAS sur une liste vide : une panne s'écrirait
      // « aucun dépôt n'attend », et c'est exactement le contraire du service
      // que cet écran rend.
      setReponse(null);
      setErreur(LIBELLES.aCataloguer.echec);
    }
  }, []);

  async function confier(depotId: string, directeur: Directeur) {
    setErreur(null);
    setEnCours(depotId);
    try {
      // ⚠ L'API NOMME L'ANCIEN DIRECTEUR : une fois la liste relue, l'écran ne
      // l'a plus. « Réattribué » sans dire de qui à qui ne raconte rien.
      const res = await api<{
        ancienDirecteur: { nom: string } | null;
        notification?: { sent: boolean };
      }>(
        `/depots/${depotId}/reattribuer`,
        { method: 'POST', body: JSON.stringify({ directorId: directeur.id }) },
        getToken(),
      );
      setReattribution(null);
      // On RELIT : la liste fait foi, pas ce qu'on croit avoir fait.
      await charger();
      // ⚠ L'échec de l'envoi n'efface pas la réattribution : elle a abouti.
      setAvis(
        res.notification?.sent === false
          ? T.reattribueNonPrevenu
          : T.reattribue(res.ancienDirecteur?.nom ?? null, directeur.nom),
      );
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : T.echecReattribution);
    } finally {
      setEnCours(null);
    }
  }

  useEffect(() => {
    if (peutVoir) void charger();
  }, [peutVoir, charger]);

  if (functions && !peutVoir) {
    return <Alert tone="error">{LIBELLES.refusDeDroit.depotsSoumis}</Alert>;
  }

  return (
    <div>
      <h1 className="font-serif text-3xl font-bold">{T.titre}</h1>
      <p className="mt-1 text-sm text-muted">{T.introduction}</p>

      {erreur && (
        <Alert tone="error" className="mt-4">
          {erreur}
        </Alert>
      )}
      {avis && (
        <Alert tone="success" className="mt-4">
          {avis}
        </Alert>
      )}

      {/* ⚠ Ni « aucun dépôt » ni la liste tant que la réponse n'est pas là. */}
      {!depots && !erreur && <p className="mt-6 text-sm text-muted">{T.chargement}</p>}
      {depots?.length === 0 && <p className="mt-6 text-sm text-muted">{T.aucun}</p>}

      <div className="mt-5 flex flex-col gap-3">
        {depots?.map((d) => (
          <Card key={d.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium text-ink">{d.title}</p>
                <p className="mt-0.5 text-sm text-muted">
                  {d.authorName} · {LIBELLES.typesDeDepot[d.documentType] ?? d.documentType}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {/*
                    ⚠ LE NOM, PAS L'IDENTIFIANT — et « aucun directeur désigné »
                    quand il n'y en a pas, plutôt qu'une ligne vide : un dépôt
                    soumis sans directeur est le cas le plus bloqué de tous.
                  */}
                  {d.directeur ? T.directeur(d.directeur) : T.sansDirecteur}
                </p>
              </div>
              {/*
                ⚠ L'ANCIENNETÉ, et jamais un zéro deviné. `null` veut dire qu'on
                ne connaît pas la date : l'écrire « aujourd'hui » serait faux au
                moment précis où l'ancienneté est ce qu'on vient chercher.
              */}
              <Badge tone={d.joursDepuisSoumission !== null && d.joursDepuisSoumission > 30 ? 'ocre' : 'neutral'}>
                {d.joursDepuisSoumission === null
                  ? T.ancienneteInconnue
                  : T.depuis(d.joursDepuisSoumission)}
              </Badge>
            </div>

            {/*
              ⚠ LA SORTIE D'UN DÉPÔT BLOQUÉ. « Soumis » est le seul état dont la
              sortie dépend de QUELQU'UN D'AUTRE : si le directeur désigné ne
              peut plus agir, personne ne pouvait rien. La réattribution est la
              seconde porte, et la liste des directeurs voyage avec les dépôts
              qu'elle sert — le menu dédié exige `depot.deposer`, que le
              bibliothécaire n'a pas.

              ⚠ Trois états, comme partout : liste INCONNUE → on n'affirme rien ;
              liste VIDE → personne à qui confier, et on le DIT ; liste pleine →
              le menu.
            */}
            {directeurs !== null && (
              <div className="mt-3">
                {directeurs.length === 0 ? (
                  <p className="text-sm text-heading">{T.aucunDirecteurDisponible}</p>
                ) : reattribution === d.id ? (
                  <div>
                    <label className="block text-sm font-medium">
                      {T.choisirNouveau}
                      <Select
                        className="mt-1"
                        defaultValue=""
                        disabled={enCours === d.id}
                        onChange={(e) => {
                          const choisi = directeurs.find((x) => x.id === e.target.value);
                          if (choisi) void confier(d.id, choisi);
                        }}
                      >
                        <option value="">{T.aucunChoix}</option>
                        {directeurs
                          // ⚠ On ne propose pas celui qui l'a DÉJÀ : l'API refuse
                          // ce cas, et un menu qui mène à un refus fait chercher
                          // ce qu'on a mal fait.
                          .filter((x) => x.id !== d.directorId)
                          .map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.nom}
                            </option>
                          ))}
                      </Select>
                    </label>
                    <p className="mt-1 text-xs text-muted">{T.reattribuerAide}</p>
                    <Button
                      variant="ghost"
                      className="mt-2 min-h-11"
                      disabled={enCours === d.id}
                      onClick={() => setReattribution(null)}
                    >
                      {LIBELLES.monDepot.annuler}
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    className="min-h-11"
                    onClick={() => setReattribution(d.id)}
                  >
                    {T.reattribuer}
                  </Button>
                )}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
