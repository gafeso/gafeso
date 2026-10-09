'use client';

/**
 * L'ASSISTANT D'INSTALLATION — la première ouverture d'une instance.
 *
 * Contrat : `apps/api/src/installation/` (routes livrées en rc5). ⚠ Les formes
 * viennent du CODE de l'API, pas du document de conception : c'est l'API qui dit
 * ce qu'elle rend, et ce dépôt a déjà payé une doublure écrite d'après le code
 * d'un service plutôt que d'après sa réponse.
 *
 * ## ⚠ CE QUI GOUVERNE CET ÉCRAN
 *
 * · **Un seul envoi.** `POST /installation/terminer` applique TOUT en une
 *   transaction. Un assistant par étapes qui écrirait au fil de l'eau
 *   laisserait, sur une fenêtre fermée au milieu, une école sans administrateur
 *   ou un administrateur sans école. Le front COLLECTE ; l'API applique.
 *
 * · **« Accepté » n'est pas « arrivé ».** Le test de courriel dit que le serveur
 *   a accepté le message, et demande de vérifier la boîte. Dire « envoyé »
 *   ferait croire une vérification qui n'a pas eu lieu.
 *
 * · **Le lien de mot de passe est rendu DANS TOUS LES CAS**, et affiché une
 *   seule fois. Sans SMTP c'est le SEUL chemin vers le seul compte de
 *   l'instance : une page rechargée sans l'avoir copié laisse l'installateur
 *   dehors. C'est le faux qui RETIRE LE SEUL RECOURS.
 *
 * · **Le jeton ne voyage qu'une fois.** On l'échange contre une session courte
 *   (`x-installation-session`), pour qu'il ne se retrouve ni dans un historique
 *   de navigation ni dans chaque appel.
 */
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Alert, Badge, Button, Card, Input, Spinner } from '@/components/ui';
import { LIBELLES } from '@/lib/libelles';
// ⚠ LES QUATRE BRANCHES portent la cible du lien d'évitement, pas seulement la
// nominale. Le garde l'exige dans les deux sens, et pour un motif mesuré : les
// chemins dégradés d'un écran ont déjà été MIEUX accessibles que son chemin
// normal, parce que personne n'avait relevé lequel manquait.
import { ID_CONTENU } from '@/components/lien-evitement';

const T = LIBELLES.installation;

interface Constat {
  appUrl: string | null;
  smtp: { configure: boolean; hote: string | null };
  version: string;
  commit: string;
  horsPortee: string[];
}
interface ModuleOffert {
  id: string;
  libelle: string;
  description: string;
  noyau: boolean;
  dependances: string[];
}
interface Termine {
  termine: true;
  etablissement: { nom: string; slug: string };
  administrateur: { email: string };
  lienMotDePasse: string;
  courrielEnvoye: boolean;
  motifCourriel: string | null;
}
type IssueCourriel =
  | { envoye: true; message: string }
  | { envoye: false; motif: string; message: string; geste: string };

export default function InstallationPage() {
  /**
   * ⚠ TROIS ÉTATS, PAS DEUX. `null` = on ne sait pas encore : on n'affiche alors
   * ni l'assistant ni « déjà installée ». Afficher l'un des deux sur une
   * information qu'on n'a pas est exactement le faux que ce dépôt traque — et
   * ici il enverrait un installateur croire son instance déjà prise.
   */
  const [requise, setRequise] = useState<boolean | null>(null);
  const [session, setSession] = useState<string | null>(null);
  const [jeton, setJeton] = useState('');
  const [constat, setConstat] = useState<Constat | null>(null);
  const [modules, setModules] = useState<ModuleOffert[] | null>(null);
  const [eteints, setEteints] = useState<string[]>([]);
  const [courriel, setCourriel] = useState('');
  const [issueCourriel, setIssueCourriel] = useState<IssueCourriel | null>(null);
  const [form, setForm] = useState({ nom: '', slug: '', domaine: '', email: '', prenom: '', nom2: '' });
  const [confirme, setConfirme] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [fini, setFini] = useState<Termine | null>(null);

  useEffect(() => {
    api<{ requise: boolean }>('/installation/etat')
      .then((r) => setRequise(r.requise))
      // ⚠ Une panne ne vaut pas « déjà installée » : on reste à `null`, donc muet.
      .catch(() => setRequise(null));
  }, []);

  /** Les appels sous session portent l'en-tête — jamais le jeton lui-même. */
  const avecSession = useCallback(
    <R,>(chemin: string, options: RequestInit = {}) =>
      api<R>(chemin, { ...options, headers: { 'x-installation-session': session ?? '' } }),
    [session],
  );

  async function ouvrir(e: FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnCours(true);
    try {
      const r = await api<{ sessionAssistant: string }>('/installation/jeton', {
        method: 'POST',
        body: JSON.stringify({ jeton: jeton.trim() }),
      });
      setSession(r.sessionAssistant);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : String(err));
    } finally {
      setEnCours(false);
    }
  }

  useEffect(() => {
    if (!session) return;
    void avecSession<Constat>('/installation/constat').then(setConstat).catch(() => setConstat(null));
    void avecSession<ModuleOffert[]>('/installation/modules').then(setModules).catch(() => setModules(null));
  }, [session, avecSession]);

  async function tester() {
    setIssueCourriel(null);
    try {
      setIssueCourriel(
        await avecSession<IssueCourriel>('/installation/test-courriel', {
          method: 'POST',
          body: JSON.stringify({ destinataire: courriel.trim() }),
        }),
      );
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : String(err));
    }
  }

  async function terminer(e: FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnCours(true);
    try {
      setFini(
        await avecSession<Termine>('/installation/terminer', {
          method: 'POST',
          body: JSON.stringify({
            etablissement: { nom: form.nom.trim(), slug: form.slug.trim() },
            domaine: form.domaine.trim(),
            administrateur: { email: form.email.trim(), prenom: form.prenom.trim(), nom: form.nom2.trim() },
            modulesDesactives: eteints,
            confirme: true,
          }),
        }),
      );
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : String(err));
    } finally {
      setEnCours(false);
    }
  }

  // ── Terminé : le lien, et l'avertissement dans le même souffle ────────────
  if (fini) {
    return (
      <main id={ID_CONTENU} className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="font-serif text-2xl font-bold">{T.finiTitre}</h1>
        <p className="mt-2 text-sm text-muted">
          {fini.etablissement.nom} — {fini.administrateur.email}
        </p>
        <Card className="mt-5">
          <h2 className="font-serif text-lg font-bold">{T.lienTitre}</h2>
          <Alert tone="error" className="mt-2">{T.lienAvertissement}</Alert>
          {/* ⚠ Sélectionnable et non tronqué : un lien qu'on ne peut pas copier
              entier est un lien perdu. */}
          <p className="mt-3 break-all rounded-md border border-line bg-paper px-3 py-2 font-mono text-xs">
            {fini.lienMotDePasse}
          </p>
          <p className="mt-3 text-sm text-muted">
            {fini.courrielEnvoye ? T.courrielParti : T.courrielPasParti}
          </p>
        </Card>
      </main>
    );
  }

  if (requise === false) {
    return (
      <main id={ID_CONTENU} className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="font-serif text-2xl font-bold">{T.titre}</h1>
        <Alert tone="warning" className="mt-4">{T.dejaInstallee}</Alert>
        <p className="mt-2 text-sm text-muted">{T.dejaInstalleeSortie}</p>
      </main>
    );
  }

  // ⚠ `null` : on ne sait pas encore. Rien d'affirmé.
  if (requise === null) {
    return (
      <main id={ID_CONTENU} className="mx-auto max-w-2xl px-4 py-10">
        <p className="text-sm text-muted">{LIBELLES.commun.chargement}</p>
      </main>
    );
  }

  return (
    <main id={ID_CONTENU} className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="font-serif text-2xl font-bold">{T.titre}</h1>
      {erreur && <Alert tone="error" className="mt-4">{erreur}</Alert>}

      {!session ? (
        <Card className="mt-5">
          <h2 className="font-serif text-lg font-bold">{T.jetonTitre}</h2>
          <p className="mt-2 text-sm text-muted">{T.jetonAide}</p>
          <p className="mt-2 text-sm text-muted">{T.jetonMotif}</p>
          <form onSubmit={ouvrir} className="mt-4 flex flex-wrap items-end gap-3">
            <label className="flex flex-1 flex-col gap-1.5 text-sm font-medium">
              {T.jetonChamp}
              <Input
                value={jeton}
                onChange={(ev) => setJeton(ev.target.value)}
                autoComplete="off"
                required
              />
            </label>
            <Button type="submit" disabled={enCours}>
              {enCours ? <Spinner /> : T.jetonValider}
            </Button>
          </form>
        </Card>
      ) : (
        <>
          {constat && (
            <Card className="mt-5">
              <h2 className="font-serif text-lg font-bold">{T.constatTitre}</h2>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted">APP_URL</dt>
                  <dd className="font-medium">{constat.appUrl ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted">Version</dt>
                  <dd className="font-medium">
                    {constat.version} · {constat.commit}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-muted">SMTP</dt>
                  <dd className="font-medium">
                    {constat.smtp.configure ? (
                      <Badge tone="green">{T.smtpConfigure}</Badge>
                    ) : (
                      <Badge>{T.smtpAbsent}</Badge>
                    )}
                    {constat.smtp.hote && <span className="ml-2 text-muted">{constat.smtp.hote}</span>}
                  </dd>
                </div>
              </dl>
              <h3 className="mt-5 font-semibold">{T.horsPorteeTitre}</h3>
              <p className="mt-1 text-sm text-muted">{T.horsPorteeAide}</p>
              <ul className="mt-2 list-disc pl-5 text-sm text-muted">
                {constat.horsPortee.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </Card>
          )}

          <Card className="mt-5">
            <h2 className="font-serif text-lg font-bold">{T.courrielTitre}</h2>
            <p className="mt-2 text-sm text-muted">{T.courrielAide}</p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="flex flex-1 flex-col gap-1.5 text-sm font-medium">
                {T.courrielChamp}
                <Input type="email" value={courriel} onChange={(ev) => setCourriel(ev.target.value)} />
              </label>
              <Button type="button" onClick={tester} disabled={!courriel.trim()}>
                {T.courrielEnvoyer}
              </Button>
            </div>
            {issueCourriel && (
              <Alert tone={issueCourriel.envoye ? 'success' : 'error'} className="mt-3">
                {issueCourriel.message}
                {!issueCourriel.envoye && (
                  <>
                    {' '}
                    <strong>{issueCourriel.geste}</strong>
                  </>
                )}
              </Alert>
            )}
          </Card>

          {modules && (
            <Card className="mt-5">
              <h2 className="font-serif text-lg font-bold">{T.modulesTitre}</h2>
              <p className="mt-2 text-sm text-muted">{T.modulesAide}</p>
              <ul className="mt-3 flex flex-col gap-2">
                {modules.map((m) => (
                  <li key={m.id} className="flex items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={!eteints.includes(m.id)}
                      disabled={m.noyau}
                      aria-label={m.libelle}
                      onChange={(ev) =>
                        setEteints((v) =>
                          ev.target.checked ? v.filter((x) => x !== m.id) : [...v, m.id],
                        )
                      }
                    />
                    <span>
                      <span className="font-medium">{m.libelle}</span>
                      {m.noyau && <span className="ml-2 text-xs text-muted">{T.moduleNoyau}</span>}
                      <span className="block text-muted">{m.description}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <form onSubmit={terminer}>
            <Card className="mt-5">
              <h2 className="font-serif text-lg font-bold">{T.etablissementTitre}</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {(
                  [
                    ['nom', T.champNom],
                    ['slug', T.champSlug],
                    ['domaine', T.champDomaine],
                    ['email', T.champEmail],
                    ['prenom', T.champPrenom],
                    ['nom2', T.champNom2],
                  ] as const
                ).map(([cle, libelle]) => (
                  <label key={cle} className="flex flex-col gap-1.5 text-sm font-medium">
                    {libelle}
                    <Input
                      value={form[cle]}
                      type={cle === 'email' ? 'email' : 'text'}
                      onChange={(ev) => setForm((f) => ({ ...f, [cle]: ev.target.value }))}
                      required
                    />
                  </label>
                ))}
              </div>
            </Card>

            <Card className="mt-5">
              {/* ⚠ SECOND GESTE EXPLICITE — ce qui suit n'est pas défaisable. */}
              <label className="flex items-start gap-3 text-sm font-medium">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={confirme}
                  onChange={(ev) => setConfirme(ev.target.checked)}
                />
                <span>
                  {T.confirmer}
                  <span className="block font-normal text-muted">{T.confirmerAide}</span>
                </span>
              </label>
              <Button type="submit" className="mt-4" disabled={!confirme || enCours}>
                {enCours ? T.enCours : T.terminer}
              </Button>
            </Card>
          </form>
        </>
      )}
    </main>
  );
}
