'use client';

// « Moissonnage » — P7, versant front. 13 septembre 2026.
//
// ⚠ LA DISTINCTION QUI PORTE TOUT L'ÉCRAN : « injoignable » n'est PAS « vide ».
// L'API l'écrit dans son propre schéma — « les confondre ferait lire ‘zéro
// notice’ là où il faut lire ‘je n'ai pas pu savoir’ » — et c'est la famille que
// ce dépôt connaît le mieux : une non-réponse écrite comme un fait.
//
// Le coût n'est pas théorique. Un entrepôt momentanément injoignable affiché
// « 0 notice » pousse à supprimer la source, ou à conclure que le partenaire n'a
// rien publié. Deux gestes qu'on ne reprend pas facilement.
//
// ⚠ ET LE MOISSONNAGE SIGNALE, IL NE TRANCHE PAS — décision 2 du brief. Les
// collisions sont AFFICHÉES comme en attente d'arbitrage, jamais comme un
// défaut : rien n'a été écrasé.

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/session';
import { useMyFunctions } from '@/lib/functions';
import { LIBELLES } from '@/lib/libelles';
import { Alert, Badge, Button, Card, Input, Select } from '@/components/ui';

const T = LIBELLES.moissonnage;

/** Le vocabulaire fermé de l'API — `PERIODICITES`. */
const PERIODICITES = [
  { valeur: 'manuelle', libelle: 'Manuelle' },
  { valeur: 'quotidienne', libelle: 'Quotidienne' },
  { valeur: 'hebdomadaire', libelle: 'Hebdomadaire' },
];

interface Execution {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  /** `en_cours` | `moisson` | `vide` | `injoignable` | `erreur_protocole`. */
  outcome: string;
  reason: string | null;
  received: number;
  created: number;
  ignored: number;
  collided: number;
  deletions: number;
}

interface Source {
  id: string;
  name: string;
  baseUrl: string;
  metadataPrefix: string;
  setSpec: string;
  periodicity: string;
  active: boolean;
  /** Jointe, jamais recopiée sur la source — une seconde vérité serait à tenir. */
  derniereExecution: Execution | null;
}

/** ⚠ Seules ces deux issues autorisent à lire des chiffres de récolte. */
const A_RECOLTE = new Set(['moisson', 'vide']);

const dateFr = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(iso));

export default function MoissonnagePage() {
  const { functions } = useMyFunctions();
  const peutMoissonner = functions?.includes('outils.catalogue');

  /** ⚠ `null` TANT QU'ON NE SAIT PAS : un « aucun entrepôt » prématuré fait déclarer un doublon. */
  const [sources, setSources] = useState<Source[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [avis, setAvis] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);

  const [formOuvert, setFormOuvert] = useState(false);
  const [form, setForm] = useState({
    name: '',
    baseUrl: '',
    metadataPrefix: 'oai_dc',
    setSpec: '',
    periodicity: 'manuelle',
  });
  const [creation, setCreation] = useState(false);
  /** L'entrepôt en cours de modification — `null` = aucun. */
  const [edition, setEdition] = useState<string | null>(null);
  /** L'entrepôt dont on confirme le retrait. */
  const [retrait, setRetrait] = useState<Source | null>(null);

  const charger = useCallback(async () => {
    setErreur(null);
    try {
      setSources(await api<Source[]>('/moissonnage/sources', {}, getToken()));
    } catch {
      // ⚠ On ne retombe PAS sur une liste vide : « aucun entrepôt déclaré »
      // pendant une panne pousse à en déclarer un qui existe déjà, et la
      // contrainte d'unicité refuserait — après coup.
      setSources(null);
      setErreur(T.echec);
    }
  }, []);

  useEffect(() => {
    if (peutMoissonner) void charger();
  }, [peutMoissonner, charger]);

  async function declarer(event: FormEvent) {
    event.preventDefault();
    setErreur(null);
    setCreation(true);
    try {
      await api(
        '/moissonnage/sources',
        {
          method: 'POST',
          body: JSON.stringify({
            name: form.name.trim(),
            baseUrl: form.baseUrl.trim(),
            metadataPrefix: form.metadataPrefix.trim(),
            ...(form.setSpec.trim() ? { setSpec: form.setSpec.trim() } : {}),
            periodicity: form.periodicity,
          }),
        },
        getToken(),
      );
      const nom = form.name.trim();
      setFormOuvert(false);
      setForm({ name: '', baseUrl: '', metadataPrefix: 'oai_dc', setSpec: '', periodicity: 'manuelle' });
      await charger();
      setAvis(T.creee(nom));
    } catch (err) {
      // ⚠ Le message de l'API est CONSERVÉ : c'est lui qui dit quelle adresse
      // a été refusée et pourquoi. Le remplacer par un texte générique
      // renverrait chercher ce qu'on a mal fait.
      setErreur(err instanceof ApiError ? err.message : T.echecCreation);
    } finally {
      setCreation(false);
    }
  }

  async function enregistrer(event: FormEvent, id: string) {
    event.preventDefault();
    setErreur(null);
    setCreation(true);
    try {
      await api(
        `/moissonnage/sources/${id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            name: form.name.trim(),
            baseUrl: form.baseUrl.trim(),
            metadataPrefix: form.metadataPrefix.trim(),
            setSpec: form.setSpec.trim(),
            periodicity: form.periodicity,
          }),
        },
        getToken(),
      );
      setEdition(null);
      await charger();
      setAvis(T.modifiee);
    } catch (err) {
      // Le message de l'API est conservé : c'est lui qui dit quelle adresse a
      // été refusée et pourquoi.
      setErreur(err instanceof ApiError ? err.message : T.echecModification);
    } finally {
      setCreation(false);
    }
  }

  async function retirerSource(s: Source) {
    setErreur(null);
    setEnCours(s.id);
    try {
      // ⚠ LE COMPTE VIENT DE L'API. « Retiré » sans dire combien de notices
      // restent laisserait croire qu'elles sont parties avec — et personne ne
      // prendrait le risque une seconde fois.
      const res = await api<{ noticesConservees: number }>(
        `/moissonnage/sources/${s.id}`,
        { method: 'DELETE' },
        getToken(),
      );
      setRetrait(null);
      await charger();
      setAvis(T.retiree(s.name, res.noticesConservees));
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : T.echecRetrait);
    } finally {
      setEnCours(null);
    }
  }

  function ouvrirEdition(s: Source) {
    setRetrait(null);
    setFormOuvert(false);
    setEdition(s.id);
    setForm({
      name: s.name,
      baseUrl: s.baseUrl,
      metadataPrefix: s.metadataPrefix,
      setSpec: s.setSpec,
      periodicity: s.periodicity,
    });
  }

  async function moissonner(id: string) {
    setErreur(null);
    setAvis(null);
    setEnCours(id);
    try {
      await api(`/moissonnage/sources/${id}/executer`, { method: 'POST' }, getToken());
      // ⚠ On RELIT : c'est la dernière exécution JOINTE qui fait foi, pas ce
      // que la réponse nous a rendu.
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : T.echecMoisson);
    } finally {
      setEnCours(null);
    }
  }

  if (functions && !peutMoissonner) {
    return <Alert tone="error">{LIBELLES.refusDeDroit.moissonnage}</Alert>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-3xl font-bold">{T.titre}</h1>
        {!formOuvert && <Button onClick={() => setFormOuvert(true)}>{T.declarer}</Button>}
      </div>
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

      {formOuvert && (
        <Card className="mt-4">
          <form onSubmit={declarer} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {T.champNom}
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              <span className="text-xs font-normal text-muted">{T.champNomAide}</span>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {T.champAdresse}
              <Input
                value={form.baseUrl}
                onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                placeholder="https://depot.exemple.bf/oai"
                required
              />
              {/*
                ⚠ LA RÈGLE SE LIT AVANT LE REFUS. Le serveur appellera cette
                adresse, donc les adresses internes sont rejetées. Laisser l'API
                le découvrir enverrait chercher ce qu'on a mal fait alors que la
                règle n'était écrite nulle part.
              */}
              <span className="text-xs font-normal text-muted">{T.champAdresseAide}</span>
            </label>
            <div className="flex flex-wrap gap-3">
              <label className="flex flex-1 flex-col gap-1.5 text-sm font-medium">
                {T.champFormat}
                <Input
                  value={form.metadataPrefix}
                  onChange={(e) => setForm({ ...form, metadataPrefix: e.target.value })}
                  required
                />
                <span className="text-xs font-normal text-muted">{T.champFormatAide}</span>
              </label>
              <label className="flex flex-1 flex-col gap-1.5 text-sm font-medium">
                {T.champEnsemble}
                <Input value={form.setSpec} onChange={(e) => setForm({ ...form, setSpec: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                {T.champPeriodicite}
                <Select
                  value={form.periodicity}
                  onChange={(e) => setForm({ ...form, periodicity: e.target.value })}
                >
                  {PERIODICITES.map((p) => (
                    <option key={p.valeur} value={p.valeur}>
                      {p.libelle}
                    </option>
                  ))}
                </Select>
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" className="min-h-11" disabled={creation}>
                {T.creer}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="min-h-11"
                disabled={creation}
                onClick={() => setFormOuvert(false)}
              >
                {T.annuler}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* ⚠ Ni « aucun entrepôt » ni la liste tant que la réponse n'est pas là. */}
      {!sources && !erreur && <p className="mt-6 text-sm text-muted">{T.chargement}</p>}
      {sources?.length === 0 && <p className="mt-6 text-sm text-muted">{T.aucun}</p>}

      <div className="mt-5 flex flex-col gap-3">
        {sources?.map((s) => {
          const ex = s.derniereExecution;
          return (
            <Card key={s.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-ink">
                    {s.name}
                    {!s.active && <span className="ml-2 text-xs text-muted">{T.inactive}</span>}
                  </p>
                  <p className="mt-0.5 break-all text-sm text-muted">{s.baseUrl}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {s.metadataPrefix}
                    {s.setSpec ? ` · ${s.setSpec}` : ''}
                  </p>
                </div>
                {/*
                  ⚠ L'ISSUE, JAMAIS UN CHIFFRE SEUL. « Injoignable » et « vide »
                  sont deux états que rien ne doit confondre : l'un dit que la
                  source n'a rien, l'autre qu'on n'a pas pu savoir.
                */}
                <Badge
                  tone={
                    !ex
                      ? 'neutral'
                      : ex.outcome === 'moisson'
                        ? 'green'
                        : ex.outcome === 'en_cours'
                          ? 'neutral'
                          : 'ocre'
                  }
                >
                  {ex ? (T.issues[ex.outcome] ?? ex.outcome) : T.jamaisMoissonnee}
                </Badge>
              </div>

              {ex && (
                <div className="mt-2 text-sm text-muted">
                  <p>{dateFr(ex.startedAt)}</p>
                  {/*
                    ⚠ LE BILAN NE SE LIT QUE POUR UNE RÉCOLTE RÉELLE. Afficher
                    « 0 reçue, 0 créée » sous une source injoignable rendrait le
                    chiffre exact et la lecture fausse.
                  */}
                  {A_RECOLTE.has(ex.outcome) && (
                    <p className="mt-0.5">{T.bilan(ex.received, ex.created, ex.ignored)}</p>
                  )}
                  {/* ⚠ « Injoignable » sans raison n'aide personne. */}
                  {ex.reason && <p className="mt-0.5">{T.motif(ex.reason)}</p>}
                  {ex.collided > 0 && (
                    <p className="mt-1">
                      {T.collisions(ex.collided)} — {T.collisionsAide}
                    </p>
                  )}
                  {ex.deletions > 0 && (
                    <p className="mt-0.5">{T.suppressionsSignalees(ex.deletions)}</p>
                  )}
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  variant="ghost"
                  className="min-h-11"
                  disabled={enCours === s.id}
                  onClick={() => void moissonner(s.id)}
                >
                  {enCours === s.id ? T.moissonEnCours : T.moissonnerMaintenant}
                </Button>
                {/*
                  ⚠ La porte du détail. Sans elle l'écran des comptes rendus et
                  des notices signalées serait inatteignable — trois routes
                  servies derrière rien, exactement ce qu'on a passé la journée
                  à corriger ailleurs.
                */}
                <Link
                  href={`/admin/moissonnage/${s.id}`}
                  className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-ocre hover:underline"
                >
                  {T.detail.comptesRendus}
                </Link>
                <Button variant="ghost" className="min-h-11" onClick={() => ouvrirEdition(s)}>
                  {T.modifier}
                </Button>
                <Button
                  variant="ghost"
                  className="min-h-11"
                  disabled={enCours === s.id}
                  onClick={() => {
                    setEdition(null);
                    setRetrait(s);
                  }}
                >
                  {T.retirer}
                </Button>
              </div>

              {/*
                ⚠ LA CONFIRMATION DIT CE QUI PART ET CE QUI RESTE. L'API l'écrit
                elle-même : « supprimée » sans le dire laisserait croire que les
                notices sont parties avec. Personne ne retirerait une source s'il
                croyait emporter des centaines de notices du catalogue.
              */}
              {retrait?.id === s.id && (
                <Card className="mt-3 border-red-200 !p-3">
                  <p className="text-sm font-semibold">{T.retirerConfirmation(s.name)}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      className="min-h-11"
                      disabled={enCours === s.id}
                      onClick={() => void retirerSource(s)}
                    >
                      {T.retirerConfirmer}
                    </Button>
                    <Button
                      variant="ghost"
                      className="min-h-11"
                      disabled={enCours === s.id}
                      onClick={() => setRetrait(null)}
                    >
                      {T.annuler}
                    </Button>
                  </div>
                </Card>
              )}

              {edition === s.id && (
                <Card className="mt-3 !p-3">
                  <form onSubmit={(e) => void enregistrer(e, s.id)} className="flex flex-col gap-3">
                    <label className="flex flex-col gap-1.5 text-sm font-medium">
                      {T.champNom}
                      <Input
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        required
                      />
                    </label>
                    <label className="flex flex-col gap-1.5 text-sm font-medium">
                      {T.champAdresse}
                      <Input
                        value={form.baseUrl}
                        onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                        required
                      />
                      <span className="text-xs font-normal text-muted">{T.champAdresseAide}</span>
                    </label>
                    <div className="flex flex-wrap gap-3">
                      <label className="flex flex-1 flex-col gap-1.5 text-sm font-medium">
                        {T.champFormat}
                        <Input
                          value={form.metadataPrefix}
                          onChange={(e) => setForm({ ...form, metadataPrefix: e.target.value })}
                          required
                        />
                      </label>
                      <label className="flex flex-1 flex-col gap-1.5 text-sm font-medium">
                        {T.champEnsemble}
                        <Input
                          value={form.setSpec}
                          onChange={(e) => setForm({ ...form, setSpec: e.target.value })}
                        />
                      </label>
                      <label className="flex flex-col gap-1.5 text-sm font-medium">
                        {T.champPeriodicite}
                        <Select
                          value={form.periodicity}
                          onChange={(e) => setForm({ ...form, periodicity: e.target.value })}
                        >
                          {PERIODICITES.map((p) => (
                            <option key={p.valeur} value={p.valeur}>
                              {p.libelle}
                            </option>
                          ))}
                        </Select>
                      </label>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="submit" className="min-h-11" disabled={creation}>
                        {T.enregistrer}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="min-h-11"
                        disabled={creation}
                        onClick={() => setEdition(null)}
                      >
                        {T.annuler}
                      </Button>
                    </div>
                  </form>
                </Card>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
