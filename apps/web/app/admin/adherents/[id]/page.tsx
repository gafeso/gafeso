'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/session';
import { useMyFunctions } from '@/lib/functions';
import { useModulesActifs } from '@/lib/modules-actifs';
import { Alert, Badge, Button, Card, Input } from '@/components/ui';
import { LIBELLES } from '@/lib/libelles';
import {
  FicheAdherent,
  HISTORIQUE_PAR_PAGE,
  PretsDAdherent,
  SituationAdherent,
  dateFr,
  francs,
  joursDeRetard,
  nomAffichable,
  nomDuCompte,
} from '@/lib/adherents';

const T = LIBELLES.adherents;

type Formulaire = {
  firstName: string;
  lastName: string;
  barcode: string;
  category: string;
  expiryDate: string;
};

/** Date ISO → valeur d'un `<input type="date">`, ou chaîne vide. */
const pourChampDate = (iso: string | null) => (iso ? iso.slice(0, 10) : '');

export default function FicheAdherentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { functions } = useMyFunctions();
  // Module `amendes` — P4-4. `null` = pas encore su : on garde l'affichage d'avant.
  const { modulesActifs } = useModulesActifs();
  const amendesActives = modulesActifs === null ? null : modulesActifs.includes('amendes');
  const peutGerer = functions?.includes('adherents.gerer');

  const [fiche, setFiche] = useState<FicheAdherent | null>(null);
  const [situation, setSituation] = useState<SituationAdherent | null>(null);
  // ⚠ `null` tant qu'on ne sait pas — on ne dit pas « aucun prêt rendu » avant
  // d'avoir demandé. Et l'historique a sa PROPRE pagination, indépendante de
  // celle de la liste : /patrons/:id/loans pagine `history`, pas `current`.
  const [prets, setPrets] = useState<PretsDAdherent | null>(null);
  const [pageHistorique, setPageHistorique] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [formulaire, setFormulaire] = useState<Formulaire | null>(null);
  const [enregistrement, setEnregistrement] = useState(false);
  const [confirmeSuppression, setConfirmeSuppression] = useState(false);

  const charger = useCallback(async () => {
    setError(null);
    try {
      const f = await api<FicheAdherent>(`/patrons/${id}`, {}, getToken());
      setFiche(f);
      // La situation de circulation est une SECONDE source : elle porte les
      // prêts eux-mêmes, là où la fiche n'en porte que le compte. Son échec ne
      // doit pas emporter la fiche — on peut modifier une carte sans savoir ce
      // qu'elle a emprunté.
      try {
        setSituation(
          await api<SituationAdherent>(`/circulation/patrons/${id}`, {}, getToken()),
        );
      } catch {
        setSituation(null);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : T.ficheIntrouvable);
    }
  }, [id]);

  useEffect(() => {
    if (peutGerer) void charger();
  }, [peutGerer, charger]);

  useEffect(() => {
    if (!peutGerer) return;
    const params = new URLSearchParams({
      page: String(pageHistorique),
      limit: String(HISTORIQUE_PAR_PAGE),
    });
    api<PretsDAdherent>(`/patrons/${id}/loans?${params}`, {}, getToken())
      .then(setPrets)
      // ⚠ On ne retombe PAS sur un historique vide : une panne et « rien de
      // rendu » s'écriraient pareil, et la phrase serait fausse dans le
      // premier cas. `null` laisse l'écran dire qu'il charge.
      .catch(() => setPrets(null));
  }, [peutGerer, id, pageHistorique]);

  async function enregistrer(event: FormEvent) {
    event.preventDefault();
    if (!formulaire) return;
    setEnregistrement(true);
    setError(null);
    setNotice(null);
    try {
      await api(
        `/patrons/${id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            firstName: formulaire.firstName.trim() || null,
            lastName: formulaire.lastName.trim() || null,
            barcode: formulaire.barcode.trim(),
            category: formulaire.category.trim(),
            expiryDate: formulaire.expiryDate
              ? new Date(formulaire.expiryDate).toISOString()
              : undefined,
          }),
        },
        getToken(),
      );
      setNotice(T.modifie);
      setFormulaire(null);
      await charger();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : T.chargementImpossible);
    } finally {
      setEnregistrement(false);
    }
  }

  /**
   * ⚠ LE POINT LE PLUS DÉLICAT DE L'ÉCRAN — le seul où une erreur détruit
   * quelque chose.
   *
   * L'API refuse la suppression dès qu'un prêt EXISTE, en cours ou déjà rendu
   * (clé étrangère en RESTRICT : l'historique de prêt d'une bibliothèque ne
   * s'efface jamais par effet de bord). Elle dit les deux cas dans UNE phrase.
   * L'écran les sépare, parce qu'ils n'appellent pas la même chose :
   *   — un prêt EN COURS est une action à mener (enregistrer le retour) ;
   *   — un HISTORIQUE est un état définitif, rien ne le déverrouillera.
   * Les confondre ferait chercher au bibliothécaire un retour qui n'existe pas.
   */
  async function supprimer() {
    setError(null);
    setNotice(null);
    if (fiche && fiche.openCheckouts > 0) {
      // Les titres viennent de la situation de circulation. Si elle n'a pas
      // répondu, on retombe sur le code-barres de la carte plutôt que sur un
      // compte nu : on ne DEVINE pas des titres qu'on n'a pas.
      const titres = situation?.checkouts.map((c) => c.title) ?? [];
      setError(
        titres.length > 0
          ? T.supprimerRefusPrets(titres)
          : T.supprimerRefusPretsSansDetail(fiche.openCheckouts),
      );
      setConfirmeSuppression(false);
      return;
    }
    if (fiche && fiche.activeHolds > 0) {
      setError(T.supprimerRefusReservations(fiche.activeHolds));
      setConfirmeSuppression(false);
      return;
    }
    try {
      await api(`/patrons/${id}`, { method: 'DELETE' }, getToken());
      router.push('/admin/adherents');
    } catch (err) {
      // Reste le cas de l'historique : l'API l'a refusé, et c'est définitif.
      setConfirmeSuppression(false);
      setError(err instanceof ApiError ? T.supprimerRefusHistorique : T.chargementImpossible);
    }
  }

  if (functions && !peutGerer) {
    return <Alert tone="error">{LIBELLES.refusDeDroit.adherents}</Alert>;
  }

  if (error && !fiche) {
    return (
      <div>
        <Alert tone="error">{error}</Alert>
        <Link href="/admin/adherents" className="mt-4 inline-block text-sm text-muted hover:text-ink">
          {T.retourListe}
        </Link>
      </div>
    );
  }

  if (!fiche) return <p className="text-sm text-muted">{LIBELLES.commun.chargement}</p>;

  const nom = nomAffichable(fiche);

  return (
    <div>
      {/* ⚠ Lien de NAVIGATION autonome, pas un lien dans une phrase : il se
          vise au doigt, donc 44 px. Mesuré à 17 px à 375 px le 11 septembre. */}
      <Link
        href="/admin/adherents"
        className="inline-flex min-h-11 items-center text-sm text-muted hover:text-ink"
      >
        {T.retourListe}
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-bold">
            {nom ?? <span className="italic text-muted">{T.sansNom}</span>}
          </h1>
          {/* ⚠ INFORMATION, jamais avertissement. Le désaccord est souvent le
              résultat VOULU d'une correction — nom d'épouse, orthographe
              rectifiée, prénom d'usage. En faire une alerte qualifierait
              d'erreur le travail qu'on vient de rendre possible, et pousserait
              à défaire une correction délibérée. Et seulement quand les deux
              diffèrent : identiques, la ligne n'apprendrait rien. */}
          {fiche.nomsDivergents && nomDuCompte(fiche) && (
            <p className="mt-0.5 text-sm text-muted">{T.compteLie(nomDuCompte(fiche)!)}</p>
          )}
          <p className="mt-1 text-sm text-muted">
            {fiche.barcode} · <span className="capitalize">{fiche.category}</span>
            {fiche.expiryDate ? ` · ${T.validiteJusquau(dateFr(fiche.expiryDate))}` : ''}
          </p>
        </div>
        {!formulaire && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              className="min-h-11"
              onClick={() =>
                setFormulaire({
                  firstName: fiche.firstName ?? '',
                  lastName: fiche.lastName ?? '',
                  barcode: fiche.barcode,
                  category: fiche.category,
                  expiryDate: pourChampDate(fiche.expiryDate),
                })
              }
            >
              {T.modifierTitre}
            </Button>
            <Button
              variant="ghost"
              className="min-h-11"
              onClick={() => setConfirmeSuppression(true)}
            >
              {T.supprimer}
            </Button>
          </div>
        )}
      </div>

      {/* Le nom manque : on le DIT, au lieu de laisser une ligne muette. */}
      {!nom && <Alert tone="warning" className="mt-4">{T.sansNomExplication}</Alert>}

      {notice && <Alert tone="success" className="mt-4">{notice}</Alert>}
      {error && <Alert tone="error" className="mt-4">{error}</Alert>}

      {/* ⚠ La confirmation NOMME la personne. « Êtes-vous sûr ? » ne dit pas
          de qui il s'agit, et c'est précisément ce qu'il faut relire. */}
      {confirmeSuppression && (
        <Card className="mt-4 border-red-200">
          <p className="font-semibold">{T.supprimerConfirmation(nom ?? fiche.barcode)}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button className="min-h-11" onClick={supprimer}>
              {T.supprimerConfirmer}
            </Button>
            <Button
              variant="ghost"
              className="min-h-11"
              onClick={() => setConfirmeSuppression(false)}
            >
              {T.annuler}
            </Button>
          </div>
        </Card>
      )}

      {formulaire && (
        <Card className="mt-4">
          <h2 className="font-serif text-lg font-bold">{T.modifierTitre}</h2>
          <form onSubmit={enregistrer} className="mt-3 flex flex-col gap-3">
            <div className="flex flex-wrap gap-3">
              <label className="flex min-w-[10rem] flex-1 flex-col gap-1.5 text-sm font-medium">
                {T.champPrenom}
                <Input
                  className="min-h-11"
                  value={formulaire.firstName}
                  onChange={(e) => setFormulaire({ ...formulaire, firstName: e.target.value })}
                />
              </label>
              <label className="flex min-w-[10rem] flex-1 flex-col gap-1.5 text-sm font-medium">
                {T.champNom}
                <Input
                  className="min-h-11"
                  value={formulaire.lastName}
                  onChange={(e) => setFormulaire({ ...formulaire, lastName: e.target.value })}
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-3">
              <label className="flex min-w-[12rem] flex-1 flex-col gap-1.5 text-sm font-medium">
                {T.champCodeBarres}
                <Input
                  className="min-h-11"
                  value={formulaire.barcode}
                  onChange={(e) => setFormulaire({ ...formulaire, barcode: e.target.value })}
                  required
                />
              </label>
              <label className="flex min-w-[10rem] flex-1 flex-col gap-1.5 text-sm font-medium">
                {T.champCategorie}
                <Input
                  className="min-h-11"
                  value={formulaire.category}
                  onChange={(e) => setFormulaire({ ...formulaire, category: e.target.value })}
                  required
                />
              </label>
              <label className="flex min-w-[10rem] flex-1 flex-col gap-1.5 text-sm font-medium">
                {T.champValidite}
                <Input
                  className="min-h-11"
                  type="date"
                  value={formulaire.expiryDate}
                  onChange={(e) => setFormulaire({ ...formulaire, expiryDate: e.target.value })}
                />
              </label>
            </div>
            <p className="text-xs text-muted">{T.indiceCategorie}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" className="min-h-11" disabled={enregistrement}>
                {enregistrement ? T.enregistrementEnCours : T.enregistrer}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="min-h-11"
                onClick={() => setFormulaire(null)}
              >
                {T.annuler}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <h2 className="mt-8 font-serif text-xl font-bold">{T.pretsEnCours}</h2>
      {situation === null ? (
        <p className="mt-2 text-sm text-muted">{LIBELLES.commun.chargement}</p>
      ) : situation.checkouts.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{T.aucunPret}</p>
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          {situation.checkouts.map((pret) => {
            const retard = joursDeRetard(pret.dueDate);
            return (
              <Card key={pret.checkoutId} className="!p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  {/* ⚠ Le lien EXISTE depuis le 11 septembre 2026 : l'API rend
                      enfin le `recordId`. C'est le geste suivant d'une
                      bibliothécaire qui regarde un retard — et tant que le
                      champ manquait, aucun lien n'était affiché plutôt qu'un
                      lien deviné sur le titre. */}
                  <div>
                    <p className="font-medium">
                      <Link
                        href={`/admin/catalogue/${pret.recordId}`}
                        aria-label={T.ouvrirLaNotice(pret.title)}
                        className="inline-flex min-h-11 items-center hover:text-ocre hover:underline"
                      >
                        {pret.title}
                      </Link>
                    </p>
                    <p className="mt-0.5 text-sm text-muted">
                      {pret.itemBarcode} · {T.echeanceLe(dateFr(pret.dueDate))}
                    </p>
                  </div>
                  {retard > 0 && <Badge tone="ocre">{T.enRetard(retard)}</Badge>}
                </div>
                {/*
                  ⚠ Pas de garde de module ici, délibérément. Le tarif applicable
                  vaut zéro quand `amendes` est éteint, donc ce montant vaut zéro
                  et la ligne disparaît d'elle-même. Ajouter une garde front
                  masquerait un montant NON NUL le jour où l'API en renverrait un
                  — c'est-à-dire exactement le cas où il faudrait le voir.
                */}
                {pret.accruedFineXof > 0 && (
                  <p className="mt-2 text-sm text-muted">
                    {T.amendeCourue(francs(pret.accruedFineXof))}
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/*
        Module éteint : le bloc disparaît SAUF s'il reste une dette. Le tarif
        applicable tombe à zéro côté API, donc `accruingXof` vaut zéro — écrire
        « en cours sur les retards : 0 FCFA » à côté de seize prêts en retard se
        lirait comme un calcul en panne, pas comme un réglage.
      */}
      {situation &&
        (amendesActives === false
          ? situation.fines.recordedXof > 0
          : situation.fines.totalXof > 0) && (
          <>
            <h2 className="mt-8 font-serif text-xl font-bold">{T.amendes}</h2>
            {amendesActives === false ? (
              <>
                <p className="mt-2 text-sm text-muted">
                  {francs(situation.fines.recordedXof)} {T.amendesConstatees}.
                </p>
                <p className="mt-1 text-sm text-muted">{LIBELLES.amendes.conservees}</p>
              </>
            ) : (
              <p className="mt-2 text-sm text-muted">
                {francs(situation.fines.recordedXof)} {T.amendesConstatees} ·{' '}
                {francs(situation.fines.accruingXof)} {T.amendesCourantes}
              </p>
            )}
          </>
        )}

      <h2 className="mt-8 font-serif text-xl font-bold">{T.historique}</h2>
      {prets === null ? (
        <p className="mt-2 text-sm text-muted">{LIBELLES.commun.chargement}</p>
      ) : prets.history.entries.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{T.aucunHistorique}</p>
      ) : (
        <>
          <p className="mt-2 text-sm text-muted">{T.historiqueCompte(prets.history.total)}</p>
          <div className="mt-2 overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-sm">
              <tbody>
                {prets.history.entries.map((pret) => {
                  const retard = joursDeRetard(pret.dueDate, new Date(pret.returnDate));
                  return (
                    <tr key={pret.checkoutId} className="border-b border-line last:border-0">
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/admin/catalogue/${pret.recordId}`}
                          aria-label={T.ouvrirLaNotice(pret.title)}
                          className="inline-flex min-h-11 items-center font-medium hover:text-ocre hover:underline"
                        >
                          {pret.title}
                        </Link>
                        <p className="mt-0.5 text-xs text-muted">
                          {pret.itemBarcode} · {T.empruntéLe(dateFr(pret.checkoutDate))} ·{' '}
                          {T.renduLe(dateFr(pret.returnDate))}
                        </p>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {retard > 0 && <Badge tone="ocre">{T.renduEnRetard(retard)}</Badge>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {prets.history.totalPages > 1 && (
            <div className="mt-3 flex items-center justify-center gap-3">
              <Button
                variant="ghost"
                className="min-h-11"
                disabled={prets.history.page <= 1}
                onClick={() => setPageHistorique((n) => Math.max(1, n - 1))}
              >
                {T.pagePrecedente}
              </Button>
              <span className="text-sm text-muted">
                {T.pageSur(prets.history.page, prets.history.totalPages)}
              </span>
              <Button
                variant="ghost"
                className="min-h-11"
                disabled={prets.history.page >= prets.history.totalPages}
                onClick={() => setPageHistorique((n) => n + 1)}
              >
                {T.pageSuivante}
              </Button>
            </div>
          )}
        </>
      )}

      {situation && situation.holds.length > 0 && (
        <>
          <h2 className="mt-8 font-serif text-xl font-bold">{T.reservations}</h2>
          <p className="mt-2 text-sm text-muted">{situation.holds.length}</p>
        </>
      )}
    </div>
  );
}
