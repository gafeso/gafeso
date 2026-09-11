'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/session';
import { useMyFunctions } from '@/lib/functions';
import { Alert, Button, Card, Input } from '@/components/ui';
import { LIBELLES } from '@/lib/libelles';
import { Adherent, PAR_PAGE, PageAdherents, dateFr, nomAffichable } from '@/lib/adherents';

const T = LIBELLES.adherents;

type Formulaire = {
  firstName: string;
  lastName: string;
  barcode: string;
  category: string;
  expiryDate: string;
};
const FORMULAIRE_VIDE: Formulaire = {
  firstName: '',
  lastName: '',
  barcode: '',
  category: 'etudiant',
  expiryDate: '',
};

export default function AdherentsPage() {
  const { functions } = useMyFunctions();
  const peutGerer = functions?.includes('adherents.gerer');

  // ⚠ `null` TANT QU'ON NE SAIT PAS, jamais une page vide fabriquée. Sans cette
  // distinction l'écran écrirait « Aucun adhérent. » à l'instant du rendu, avant
  // même d'avoir demandé — la faute documentée dans CLAUDE.md, et celle que la
  // recette de ce lot vérifie explicitement.
  const [page, setPage] = useState<PageAdherents | null>(null);
  const [numeroPage, setNumeroPage] = useState(1);
  const [recherche, setRecherche] = useState('');
  const [rechercheActive, setRechercheActive] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [formulaire, setFormulaire] = useState<Formulaire | null>(null);
  const [enregistrement, setEnregistrement] = useState(false);

  const charger = useCallback(async (n: number, q: string) => {
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(n), limit: String(PAR_PAGE) });
      if (q.trim()) params.set('q', q.trim());
      setPage(await api<PageAdherents>(`/patrons?${params}`, {}, getToken()));
    } catch (err) {
      // ⚠ On ne retombe PAS sur une page vide : une panne et un fichier vide
      // s'écriraient pareil, et la phrase serait fausse dans le premier cas.
      setPage(null);
      setError(err instanceof ApiError ? err.message : T.chargementImpossible);
    }
  }, []);

  useEffect(() => {
    if (peutGerer) void charger(numeroPage, rechercheActive);
  }, [peutGerer, numeroPage, rechercheActive, charger]);

  function chercher(event: FormEvent) {
    event.preventDefault();
    setNumeroPage(1);
    setRechercheActive(recherche);
  }

  async function inscrire(event: FormEvent) {
    event.preventDefault();
    if (!formulaire) return;
    setEnregistrement(true);
    setError(null);
    setNotice(null);
    try {
      await api(
        '/patrons',
        {
          method: 'POST',
          body: JSON.stringify({
            // ⚠ Champs OMIS quand ils sont vides, jamais envoyés en chaîne vide :
            // l'API valide « un nom OU un compte », et une chaîne vide est un
            // nom présent pour class-validator.
            ...(formulaire.firstName.trim() ? { firstName: formulaire.firstName.trim() } : {}),
            ...(formulaire.lastName.trim() ? { lastName: formulaire.lastName.trim() } : {}),
            barcode: formulaire.barcode.trim(),
            category: formulaire.category.trim(),
            ...(formulaire.expiryDate
              ? { expiryDate: new Date(formulaire.expiryDate).toISOString() }
              : {}),
          }),
        },
        getToken(),
      );
      setNotice(T.inscrit(formulaire.barcode.trim()));
      setFormulaire(null);
      // Recette n° 5 : l'adhérent apparaît sans rechargement manuel. On revient
      // en première page, où le tri par inscription décroissante le place.
      setNumeroPage(1);
      setRechercheActive('');
      setRecherche('');
      await charger(1, '');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : T.chargementImpossible);
    } finally {
      setEnregistrement(false);
    }
  }

  if (functions && !peutGerer) {
    return <Alert tone="error">{LIBELLES.refusDeDroit.adherents}</Alert>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-3xl font-bold">{T.titre}</h1>
        {/* ⚠ Bouton PERMANENT, jamais accroché à l'état vide de la liste : une
            invitation à agir fondée sur un vide non vérifié est le défaut le
            plus grave de sa famille (leçon du 10 septembre 2026). */}
        {!formulaire && (
          <Button className="min-h-11" onClick={() => setFormulaire({ ...FORMULAIRE_VIDE })}>
            {T.inscrire}
          </Button>
        )}
      </div>
      <p className="mt-1 text-sm text-muted">{T.introduction}</p>

      {notice && <Alert tone="success" className="mt-4">{notice}</Alert>}
      {error && <Alert tone="error" className="mt-4">{error}</Alert>}

      {formulaire && (
        <Card className="mt-4">
          <h2 className="font-serif text-lg font-bold">{T.inscrireTitre}</h2>
          <form onSubmit={inscrire} className="mt-3 flex flex-col gap-3">
            <div className="flex flex-wrap gap-3">
              <label className="flex min-w-[10rem] flex-1 flex-col gap-1.5 text-sm font-medium">
                {T.champPrenom}
                <Input
                  className="min-h-11"
                  value={formulaire.firstName}
                  onChange={(e) => setFormulaire({ ...formulaire, firstName: e.target.value })}
                  placeholder="Awa"
                />
              </label>
              <label className="flex min-w-[10rem] flex-1 flex-col gap-1.5 text-sm font-medium">
                {T.champNom}
                <Input
                  className="min-h-11"
                  value={formulaire.lastName}
                  onChange={(e) => setFormulaire({ ...formulaire, lastName: e.target.value })}
                  placeholder="Traoré"
                />
              </label>
            </div>
            {/* ⚠ La règle conditionnelle SE LIT ici. La laisser découvrir par la
                400 de l'API, c'est envoyer la bibliothécaire chercher ce qu'elle
                a mal fait alors que la règle n'était écrite nulle part. */}
            <p className="text-xs text-muted">{T.nomOuCompte}</p>
            <div className="flex flex-wrap gap-3">
              <label className="flex min-w-[12rem] flex-1 flex-col gap-1.5 text-sm font-medium">
                {T.champCodeBarres}
                <Input
                  className="min-h-11"
                  value={formulaire.barcode}
                  onChange={(e) => setFormulaire({ ...formulaire, barcode: e.target.value })}
                  placeholder="P-2026-0021"
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

      <form onSubmit={chercher} className="mt-5 flex flex-wrap items-end gap-2">
        <div className="min-w-[12rem] flex-1">
          <Input
            className="min-h-11"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder={T.rechercher}
            aria-label={T.rechercheAccessible}
          />
        </div>
        <Button type="submit" className="min-h-11">
          {T.rechercher}
        </Button>
        {rechercheActive && (
          <Button
            type="button"
            variant="ghost"
            className="min-h-11"
            onClick={() => {
              setRecherche('');
              setRechercheActive('');
              setNumeroPage(1);
            }}
          >
            {T.effacerRecherche}
          </Button>
        )}
      </form>
      <p className="mt-1 text-xs text-muted">{T.indiceRecherche}</p>

      {/* Tant qu'on ne sait pas, on ne dit pas un nombre. */}
      <p className="mt-4 text-sm text-muted">
        {error ? T.chargementImpossible : page ? T.compte(page.total) : LIBELLES.commun.chargement}
      </p>

      {page && page.patrons.length === 0 && (
        <p className="mt-2 text-sm text-muted">
          {rechercheActive ? T.aucunPourCetteRecherche : T.aucun}
        </p>
      )}

      {page && page.patrons.length > 0 && (
        <div className="mt-2 overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-paper text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-2.5 font-semibold">{T.colonneNom}</th>
                <th className="px-4 py-2.5 font-semibold">{T.colonneCodeBarres}</th>
                <th className="px-4 py-2.5 font-semibold">{T.colonneCategorie}</th>
                <th className="px-4 py-2.5 font-semibold">{T.colonneValidite}</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {page.patrons.map((adherent: Adherent) => {
                const nom = nomAffichable(adherent);
                return (
                  <tr key={adherent.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-2.5 font-medium">
                      {nom ?? <span className="italic text-muted">{T.sansNom}</span>}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">{adherent.barcode}</td>
                    <td className="px-4 py-2.5 capitalize">{adherent.category}</td>
                    <td className="px-4 py-2.5 text-muted">
                      {adherent.expiryDate ? dateFr(adherent.expiryDate) : T.sansValidite}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Link
                        href={`/admin/adherents/${adherent.id}`}
                        className="inline-flex min-h-11 items-center font-semibold text-ocre hover:underline"
                      >
                        {T.ouvrir}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Paginée DÈS LE DÉPART : le catalogue professionnel s'arrête à 100 sans
          le dire (backlog n° 9), on ne rejoue pas ce défaut sur un écran neuf. */}
      {page && page.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3">
          <Button
            variant="ghost"
            className="min-h-11"
            disabled={page.page <= 1}
            onClick={() => setNumeroPage((n) => Math.max(1, n - 1))}
          >
            {T.pagePrecedente}
          </Button>
          <span className="text-sm text-muted">{T.pageSur(page.page, page.totalPages)}</span>
          <Button
            variant="ghost"
            className="min-h-11"
            disabled={page.page >= page.totalPages}
            onClick={() => setNumeroPage((n) => n + 1)}
          >
            {T.pageSuivante}
          </Button>
        </div>
      )}
    </div>
  );
}
