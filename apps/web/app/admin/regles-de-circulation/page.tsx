'use client';

/**
 * RÈGLES DE CIRCULATION — la collection que l'API portait et que rien n'ouvrait.
 *
 * 🔴 CE QUE ÇA CORRIGE (dette front n° 15). `CirculationRule` porte
 * `loanPeriodDays`, `maxCheckouts`, `maxRenewals` et `finePerDay`, par
 * catégorie d'adhérent ET par type d'exemplaire. L'API expose les quatre
 * verbes et applique ces valeurs au guichet — un prêt est refusé au plafond, un
 * renouvellement au maximum. **Le front n'appelait aucune des quatre** : les
 * valeurs venaient des défauts semés, et aucune école ne pouvait en changer
 * autrement qu'en base.
 *
 * ⚠ POURQUOI UN ÉCRAN, ET PAS QUATRE CHAMPS SUR `/admin/regles-de-pret`.
 * C'est une COLLECTION clé par (catégorie, type). Quatre champs dans la carte
 * existante auraient créé UNE règle globale et masqué la dimension par
 * catégorie : l'écran afficherait « plafond : 5 » pendant que la base en porte
 * cinq différents, et le premier enregistrement écraserait la nuance qu'une
 * bibliothécaire avait posée. Un singleton n'est pas une collection à un
 * élément.
 *
 * ⚠ ET POURQUOI SOUS GUICHET, PAS SOUS ADMINISTRATION. Le précédent est écrit
 * dans `/admin/regles-de-pret` : « le paramétrage des rappels vivait sur le
 * même écran, mais son API exige une TROISIÈME permission ; le laisser ici
 * aurait donné un bloc qui refuse à la personne même qui voit l'écran ». Les
 * quatre routes exigent `circulation.faire`. L'Administrateur a les deux
 * fonctions, donc l'écart ne se verrait pas aujourd'hui — c'est un accord PAR
 * COÏNCIDENCE, et il tombe au premier rôle personnalisé.
 */

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/session';
import { useMyFunctions } from '@/lib/functions';
import { LIBELLES } from '@/lib/libelles';
import { Alert, Button, Card, Input } from '@/components/ui';

const T = LIBELLES.reglesDeCirculation;

interface Regle {
  id: string;
  patronCategory: string;
  itemType: string;
  loanPeriodDays: number;
  maxRenewals: number;
  maxCheckouts: number;
  finePerDay: number;
}

const VIDE = {
  patronCategory: '',
  itemType: '',
  loanPeriodDays: '14',
  maxRenewals: '1',
  maxCheckouts: '5',
  finePerDay: '0',
};

/** `*` est le joker de l'API. On l'affiche en toutes lettres, jamais brut. */
function lisible(valeur: string, tous: string): string {
  return valeur === T.joker ? tous : valeur;
}

export default function ReglesDeCirculationPage() {
  const { functions } = useMyFunctions();
  const [regles, setRegles] = useState<Regle[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ ...VIDE });
  const [editionId, setEditionId] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [aSupprimer, setASupprimer] = useState<Regle | null>(null);

  const charger = useCallback(async () => {
    setError(null);
    try {
      setRegles(await api<Regle[]>('/circulation/rules', {}, getToken()));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : T.listeNonChargee);
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  function editer(r: Regle) {
    setEditionId(r.id);
    setForm({
      patronCategory: r.patronCategory,
      itemType: r.itemType,
      loanPeriodDays: String(r.loanPeriodDays),
      maxRenewals: String(r.maxRenewals),
      maxCheckouts: String(r.maxCheckouts),
      finePerDay: String(r.finePerDay),
    });
  }

  async function enregistrer(event: FormEvent) {
    event.preventDefault();
    if (enCours) return;
    setError(null);
    setEnCours(true);
    const charge = {
      patronCategory: form.patronCategory.trim(),
      itemType: form.itemType.trim(),
      loanPeriodDays: Number(form.loanPeriodDays),
      maxRenewals: Number(form.maxRenewals),
      maxCheckouts: Number(form.maxCheckouts),
      finePerDay: Number(form.finePerDay),
    };
    try {
      if (editionId) {
        await api(
          `/circulation/rules/${editionId}`,
          { method: 'PATCH', body: JSON.stringify(charge) },
          getToken(),
        );
      } else {
        await api(
          '/circulation/rules',
          { method: 'POST', body: JSON.stringify(charge) },
          getToken(),
        );
      }
      setForm({ ...VIDE });
      setEditionId(null);
      await charger();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : T.enregistrementImpossible);
    } finally {
      setEnCours(false);
    }
  }

  async function supprimer(r: Regle) {
    setError(null);
    setEnCours(true);
    try {
      await api(`/circulation/rules/${r.id}`, { method: 'DELETE' }, getToken());
      setASupprimer(null);
      await charger();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : T.suppressionImpossible);
    } finally {
      setEnCours(false);
    }
  }

  // ⚠ Un refus n'est pas une attente : sans ce garde, l'adresse tapée sans la
  // fonction laisserait la table sur « Chargement… » indéfiniment.
  if (functions && !functions.includes('circulation.faire')) {
    return <Alert tone="error">{LIBELLES.refusDeDroit.reglesDeCirculation}</Alert>;
  }

  return (
    <div>
      <h1 className="font-serif text-3xl font-bold">{T.titre}</h1>
      <p className="mt-1 text-sm text-muted">{T.introduction}</p>

      {error && (
        <Alert tone="error" className="mt-4">
          {error}
        </Alert>
      )}

      <Card className="mt-5 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-paper text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-3 py-2.5 font-semibold">{T.colCategorie}</th>
              <th className="px-3 py-2.5 font-semibold">{T.colType}</th>
              <th className="px-3 py-2.5 font-semibold">{T.colDuree}</th>
              <th className="px-3 py-2.5 font-semibold">{T.colRenouvellements}</th>
              <th className="px-3 py-2.5 font-semibold">{T.colPlafond}</th>
              <th className="px-3 py-2.5 font-semibold">{T.colAmende}</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {regles === null && !error && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-muted">
                  {LIBELLES.commun.chargement}
                </td>
              </tr>
            )}
            {regles === null && error !== null && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-muted">
                  {LIBELLES.commun.listeNonChargee}
                </td>
              </tr>
            )}
            {regles !== null && regles.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-muted">
                  {T.aucune}
                </td>
              </tr>
            )}
            {(regles ?? []).map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0">
                <td className="px-3 py-2.5">{lisible(r.patronCategory, T.toutesCategories)}</td>
                <td className="px-3 py-2.5">{lisible(r.itemType, T.tousTypes)}</td>
                <td className="px-3 py-2.5 tabular-nums">{T.jours(r.loanPeriodDays)}</td>
                <td className="px-3 py-2.5 tabular-nums">{r.maxRenewals}</td>
                <td className="px-3 py-2.5 tabular-nums">{r.maxCheckouts}</td>
                <td className="px-3 py-2.5 tabular-nums">{T.fcfa(r.finePerDay)}</td>
                <td className="px-3 py-2.5 text-right">
                  {/* ⚠ Des noms accessibles DISTINCTS : « Modifier » seul se
                      répéterait autant de fois qu'il y a de lignes, et un
                      lecteur d'écran ne pourrait pas les séparer. */}
                  <Button
                    variant="ghost"
                    onClick={() => editer(r)}
                    aria-label={`${T.modifier} ${lisible(r.patronCategory, T.toutesCategories)} / ${lisible(r.itemType, T.tousTypes)}`}
                  >
                    {T.modifier}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => setASupprimer(r)}
                    aria-label={`${T.supprimer} ${lisible(r.patronCategory, T.toutesCategories)} / ${lisible(r.itemType, T.tousTypes)}`}
                  >
                    {T.supprimer}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {aSupprimer && (
        <Alert tone="warning" className="mt-4">
          <p>
            {T.supprimerConfirmer(
              lisible(aSupprimer.patronCategory, T.toutesCategories),
              lisible(aSupprimer.itemType, T.tousTypes),
            )}
          </p>
          <div className="mt-3 flex gap-2">
            <Button onClick={() => void supprimer(aSupprimer)} disabled={enCours}>
              {T.supprimer}
            </Button>
            <Button variant="ghost" onClick={() => setASupprimer(null)}>
              {T.annuler}
            </Button>
          </div>
        </Alert>
      )}

      <Card className="mt-4">
        <h2 className="font-serif text-lg font-bold">
          {editionId ? T.modifier : T.ajouter}
        </h2>
        <form onSubmit={enregistrer} className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {T.colCategorie}
            <Input
              required
              value={form.patronCategory}
              onChange={(e) => setForm({ ...form, patronCategory: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {T.colType}
            <Input
              required
              value={form.itemType}
              onChange={(e) => setForm({ ...form, itemType: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {T.colDuree}
            <Input
              type="number"
              min={1}
              required
              value={form.loanPeriodDays}
              onChange={(e) => setForm({ ...form, loanPeriodDays: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {T.colRenouvellements}
            <Input
              type="number"
              min={0}
              value={form.maxRenewals}
              onChange={(e) => setForm({ ...form, maxRenewals: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {T.colPlafond}
            <Input
              type="number"
              min={1}
              value={form.maxCheckouts}
              onChange={(e) => setForm({ ...form, maxCheckouts: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {T.colAmende}
            <Input
              type="number"
              min={0}
              value={form.finePerDay}
              onChange={(e) => setForm({ ...form, finePerDay: e.target.value })}
            />
          </label>
          <div className="col-span-2 flex gap-2 md:col-span-3">
            <Button type="submit" disabled={enCours}>
              {T.enregistrer}
            </Button>
            {editionId && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setEditionId(null);
                  setForm({ ...VIDE });
                }}
              >
                {T.annuler}
              </Button>
            )}
          </div>
        </form>
      </Card>
    </div>
  );
}
