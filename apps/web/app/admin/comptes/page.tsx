'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/session';
import { LIBELLES } from '@/lib/libelles';
import { useMyFunctions } from '@/lib/functions';
import { Alert, Badge, Button, Card, Input, Select } from '@/components/ui';

const STAFF_ROLES = [
  { value: 'LIBRARIAN', label: 'Bibliothécaire' },
  { value: 'MANAGER', label: 'Gestionnaire' },
  { value: 'ACQUISITIONS', label: 'Acquisitions' },
  { value: 'ADMIN', label: 'Administrateur' },
];

/** Ce qui est réellement arrivé à l'email (renvoyé par l'API). */
type MailOutcome =
  | { sent: true }
  | { sent: false; reason: 'smtp_absent' | 'smtp_error'; detail?: string };

/** Phrase honnête sur le sort de l'email — jamais « envoyé » par défaut. */
function mailPhrase(mail?: MailOutcome): string {
  if (!mail) return 'un email de définition de mot de passe a été envoyé.';
  if (mail.sent) return 'un email de définition de mot de passe a été envoyé.';
  if (mail.reason === 'smtp_absent') {
    return 'AUCUN email n’a été envoyé (messagerie non configurée) — transmettez le lien ci-dessous.';
  }
  return `l’envoi de l’email a ÉCHOUÉ${mail.detail ? ` (${mail.detail})` : ''} — transmettez le lien ci-dessous.`;
}

interface AssignableRole {
  id: string;
  name: string;
  isSystem: boolean;
}

interface Account {
  id: string;
  email: string;
  matricule: string | null;
  firstName: string;
  lastName: string;
  role: string;
  roleId: string | null;
  status: string;
  className: string | null;
  /**
   * La classe affichée correspond-elle à une classe réelle ?
   * `null` = aucune classe. `false` = valeur héritée de l'ancienne saisie
   * libre, qu'aucune règle d'accès ne peut reconnaître (migration douce :
   * on la conserve et on la signale, sans jamais deviner de rattachement).
   */
  classResolved: boolean | null;
  createdAt: string;
}

interface AccountsResponse {
  total: number;
  counts: Record<string, number>;
  users: Account[];
}

/** Lignes par page — la valeur que l'écran demandait déjà, désormais assumée. */
const PAR_PAGE = 100;

const STATUS_TABS = [
  { key: 'PENDING', label: 'En attente' },
  { key: 'ACTIVE', label: 'Actifs' },
  { key: '', label: 'Tous' },
];

const STATUS_BADGE: Record<string, { tone: 'ocre' | 'green' | 'neutral'; label: string }> = {
  PENDING: { tone: 'ocre', label: 'En attente' },
  ACTIVE: { tone: 'green', label: 'Actif' },
  SUSPENDED: { tone: 'neutral', label: 'Suspendu' },
  EXPIRED: { tone: 'neutral', label: 'Expiré' },
};

const ROLE_LABELS: Record<string, string> = {
  STUDENT: 'Étudiant',
  LIBRARIAN: 'Bibliothécaire',
  MANAGER: 'Gestionnaire',
  ACQUISITIONS: 'Acquisitions',
  ADMIN: 'Administrateur',
};

const dateFr = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' });

export default function ComptesPage() {
  const [status, setStatus] = useState('PENDING');
  const [q, setQ] = useState('');
  const [data, setData] = useState<AccountsResponse | null>(null);
  const [numeroPage, setNumeroPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /**
   * Lien de définition de mot de passe affiché À LA DEMANDE, jamais dans la
   * liste : il permet de PRENDRE LA MAIN sur le compte. Sa consultation est
   * tracée au journal d'audit côté API (account.password_link.view).
   */
  const [linkFor, setLinkFor] = useState<{ id: string; email: string; url: string } | null>(null);
  const [loadingLink, setLoadingLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [activating, setActivating] = useState<string | null>(null);
  const [showStaffForm, setShowStaffForm] = useState(false);
  const [staff, setStaff] = useState({
    email: '',
    firstName: '',
    lastName: '',
    role: 'LIBRARIAN',
  });
  const [savingStaff, setSavingStaff] = useState(false);
  const [assignableRoles, setAssignableRoles] = useState<AssignableRole[]>([]);
  const [roleChoice, setRoleChoice] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  // `className` ne fait plus partie du formulaire : il est affiché en lecture
  // seule depuis le compte chargé, jamais soumis (voir le champ « Classe »).
  const [editForm, setEditForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    roleId: '',
  });
  const [savingEdit, setSavingEdit] = useState(false);
  // Compte en cours d'édition, pour afficher la classe (lecture seule) telle
  // que l'API la renvoie, avec son état de résolution.
  const editingAccount = editingId ? data?.users.find((a) => a.id === editingId) : undefined;
  const { functions } = useMyFunctions();
  // comptes.gerer : peut créer du personnel, suspendre/réactiver, ET choisir
  // un rôle à l'activation (anti-escalade — un gestionnaire avec seulement
  // comptes.activer ne voit pas le sélecteur, l'API refuserait de toute façon).
  const canManageAccounts = functions?.includes('comptes.gerer') ?? false;

  useEffect(() => {
    if (!canManageAccounts) return;
    api<AssignableRole[]>('/accounts/assignable-roles', {}, getToken())
      .then(setAssignableRoles)
      .catch(() => setAssignableRoles([]));
  }, [canManageAccounts]);

  const load = useCallback(async (statusFilter: string, term: string, page: number) => {
    setError(null);
    try {
      const qs = new URLSearchParams({ limit: String(PAR_PAGE) });
      qs.set('page', String(page));
      if (statusFilter) qs.set('status', statusFilter);
      if (term) qs.set('q', term);
      setData(await api<AccountsResponse>(`/accounts?${qs}`, {}, getToken()));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Chargement impossible.');
    }
  }, []);

  useEffect(() => {
    void load(status, q, numeroPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, numeroPage]);

  /**
   * ⚠ CHANGER D'ONGLET OU CHERCHER REVIENT À LA PREMIÈRE PAGE. Sans ça, passer
   * de « Tous » page 4 à « En attente » demande la page 4 d'un résultat qui n'en
   * a qu'une, et l'écran affiche une liste vide sur un onglet qui compte
   * soixante-huit comptes. Le même défaut que sur le catalogue et l'index des
   * auteurs : il se reproduit partout où un filtre et une pagination coexistent.
   */
  useEffect(() => {
    setNumeroPage(1);
  }, [status]);

  function onSearch(event: FormEvent) {
    event.preventDefault();
    setNumeroPage(1);
    void load(status, q, 1);
  }

  /**
   * Récupère et affiche le lien de définition de mot de passe.
   * À LA DEMANDE uniquement : ce lien permet de prendre la main sur le compte,
   * et chaque consultation est tracée au journal d'audit côté API.
   */
  async function showLink(account: Account) {
    setLoadingLink(account.id);
    setCopied(false);
    try {
      const res = await api<{ email: string; url: string }>(
        `/accounts/${account.id}/password-link`,
        {},
        getToken(),
      );
      setLinkFor({ id: account.id, email: res.email, url: res.url });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Lien indisponible (il expire au bout de 24 h).',
      );
    } finally {
      setLoadingLink(null);
    }
  }

  async function activate(account: Account) {
    setActivating(account.id);
    setNotice(null);
    setError(null);
    const roleId = roleChoice[account.id];
    try {
      const res = await api<{ mail?: MailOutcome }>(
        `/accounts/${account.id}/activate`,
        { method: 'POST', body: JSON.stringify(roleId ? { roleId } : {}) },
        getToken(),
      );
      const roleLabel = assignableRoles.find((r) => r.id === roleId)?.name;
      // On dit ce qui s'est RÉELLEMENT passé. L'écran annonçait « un email a
      // été envoyé » même quand aucun n'était parti : l'administrateur
      // attendait une activation qui n'arriverait jamais.
      setNotice(
        `Compte de ${account.firstName} ${account.lastName} activé` +
          (roleLabel ? ` avec le rôle « ${roleLabel} »` : '') +
          ' — ' +
          mailPhrase(res?.mail),
      );
      if (res?.mail && res.mail.sent === false) await showLink(account);
      await load(status, q, numeroPage);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Activation impossible.');
    } finally {
      setActivating(null);
    }
  }

  async function createStaff(event: FormEvent) {
    event.preventDefault();
    setSavingStaff(true);
    setNotice(null);
    setError(null);
    try {
      const res = await api<{ id: string; mail?: MailOutcome }>(
        '/accounts/staff',
        { method: 'POST', body: JSON.stringify(staff) },
        getToken(),
      );
      setNotice(
        `Compte du personnel créé pour ${staff.firstName} ${staff.lastName} — ` +
          mailPhrase(res?.mail),
      );
      if (res?.mail && res.mail.sent === false && res.id) {
        await showLink({ id: res.id, email: staff.email, firstName: staff.firstName, lastName: staff.lastName } as Account);
      }
      setStaff({ email: '', firstName: '', lastName: '', role: 'LIBRARIAN' });
      setShowStaffForm(false);
      await load(status, q, numeroPage);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Création impossible.');
    } finally {
      setSavingStaff(false);
    }
  }

  async function setAccountStatus(account: Account, newStatus: string) {
    setNotice(null);
    setError(null);
    try {
      await api(
        `/accounts/${account.id}/status`,
        { method: 'PATCH', body: JSON.stringify({ status: newStatus }) },
        getToken(),
      );
      setNotice(
        `Compte de ${account.firstName} ${account.lastName} ${
          newStatus === 'SUSPENDED' ? 'suspendu' : 'réactivé'
        }.`,
      );
      await load(status, q, numeroPage);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Opération impossible.');
    }
  }

  function startEdit(account: Account) {
    setConfirmDelete(null);
    setEditingId(account.id);
    setEditForm({
      firstName: account.firstName,
      lastName: account.lastName,
      email: account.email,
      roleId: account.roleId ?? '',
    });
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editingId) return;
    setSavingEdit(true);
    setNotice(null);
    setError(null);
    try {
      await api(
        `/accounts/${editingId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            firstName: editForm.firstName,
            lastName: editForm.lastName,
            email: editForm.email,
            // Pas de `className` : l'API le refuse désormais (400), la classe
            // se change en inscrivant l'étudiant depuis « Classes ».
            roleId: editForm.roleId || null,
          }),
        },
        getToken(),
      );
      setNotice(`Compte de ${editForm.firstName} ${editForm.lastName} mis à jour.`);
      setEditingId(null);
      await load(status, q, numeroPage);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Modification impossible.');
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteAccount(account: Account) {
    setDeleting(account.id);
    setNotice(null);
    setError(null);
    try {
      await api(`/accounts/${account.id}`, { method: 'DELETE' }, getToken());
      setNotice(`Compte de ${account.firstName} ${account.lastName} supprimé définitivement.`);
      setConfirmDelete(null);
      await load(status, q, numeroPage);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Suppression impossible.');
      setConfirmDelete(null);
    } finally {
      setDeleting(null);
    }
  }

  const counts = data?.counts ?? {};

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-3xl font-bold">Comptes</h1>
        <div className="flex flex-wrap gap-2">
          {functions?.includes('outils.lecteurs') && (
            <Link href="/admin/import-etudiants">
              <Button variant="ghost">Importer une liste d’étudiants (CSV)</Button>
            </Link>
          )}
          {canManageAccounts && (
            <Button onClick={() => setShowStaffForm((v) => !v)}>
              {showStaffForm ? 'Fermer' : 'Créer un compte personnel'}
            </Button>
          )}
        </div>
      </div>

      {canManageAccounts && showStaffForm && (
        <Card className="mt-4">
          <h2 className="font-serif text-lg font-bold">Nouveau compte du personnel</h2>
          <form onSubmit={createStaff} className="mt-3 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Prénom
              <Input
                value={staff.firstName}
                onChange={(e) => setStaff({ ...staff, firstName: e.target.value })}
                required
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Nom
              <Input
                value={staff.lastName}
                onChange={(e) => setStaff({ ...staff, lastName: e.target.value })}
                required
              />
            </label>
            <label className="flex flex-1 flex-col gap-1.5 text-sm font-medium">
              Email
              <Input
                type="email"
                value={staff.email}
                onChange={(e) => setStaff({ ...staff, email: e.target.value })}
                placeholder="prenom.nom@exemple.bf"
                required
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Rôle
              <Select
                value={staff.role}
                onChange={(e) => setStaff({ ...staff, role: e.target.value })}
              >
                {STAFF_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </label>
            <Button type="submit" disabled={savingStaff}>
              {savingStaff ? 'Création…' : 'Créer le compte'}
            </Button>
          </form>
        </Card>
      )}

      {canManageAccounts && editingId && (
        <Card className="mt-4">
          <h2 className="font-serif text-lg font-bold">Modifier le compte</h2>
          <form onSubmit={saveEdit} className="mt-3 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Prénom
              <Input
                value={editForm.firstName}
                onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                required
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Nom
              <Input
                value={editForm.lastName}
                onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                required
              />
            </label>
            <label className="flex flex-1 flex-col gap-1.5 text-sm font-medium">
              Email
              <Input
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                required
              />
            </label>
            {/*
              Classe en LECTURE SEULE : elle dérive de l'inscription de l'année
              courante, seule source de vérité (voir enrollment.service côté API).
              C'était une saisie libre qui écrivait `class_name` SANS toucher aux
              inscriptions — un compte pouvait afficher « L1_DROIT » pour une
              inscription réelle « M2_MEDECINE », et l'accès était refusé sans
              explication puisque les règles d'accès comparent `class_name`.
            */}
            <div className="flex flex-col gap-1.5 text-sm font-medium">
              Classe
              <div className="flex min-h-[2.5rem] items-center gap-2 rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-sm font-normal">
                {editingAccount?.className ? (
                  <>
                    <span className="font-mono">{editingAccount.className}</span>
                    {editingAccount.classResolved === false && (
                      <span
                        className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800"
                        title="Cette valeur ne correspond à aucune classe existante : aucune règle d’accès ne pourra la reconnaître. Inscrivez l’étudiant depuis « Classes » pour la corriger."
                      >
                        non résolue
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-slate-500">Aucune inscription</span>
                )}
              </div>
              <a
                href="/admin/classes"
                className="text-xs font-normal text-slate-600 underline hover:text-slate-900"
              >
                Modifier depuis « Classes » → Inscrire un étudiant
              </a>
            </div>
            {assignableRoles.length > 0 && (
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Rôle
                <Select
                  value={editForm.roleId}
                  onChange={(e) => setEditForm({ ...editForm, roleId: e.target.value })}
                >
                  <option value="">Rôle par défaut (selon le type de compte)</option>
                  {assignableRoles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </Select>
              </label>
            )}
            <Button type="submit" disabled={savingEdit}>
              {savingEdit ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEditingId(null)}>
              Annuler
            </Button>
          </form>
        </Card>
      )}

      {notice && <Alert tone="success" className="mt-4">{notice}</Alert>}
      {error && <Alert tone="error" className="mt-4">{error}</Alert>}

      {/*
        REPLI VISIBLE (bloc 5). Quand l'email ne part pas — messagerie non
        configurée ou en panne — l'administrateur n'avait AUCUN moyen d'activer
        un lecteur : le lien n'existait que dans les logs du serveur.
        Affiché à la demande, jamais dans la liste : ce lien permet de prendre
        la main sur le compte, et sa consultation est tracée au journal d'audit.
      */}
      {linkFor && (
        <Alert tone="warning" className="mt-4">
          <div className="flex flex-col gap-2">
            <div>
              <strong>Lien de définition de mot de passe</strong> pour{' '}
              <span className="font-mono">{linkFor.email}</span> — valable 24 h, à usage unique.
              Transmettez-le par un canal sûr ; il permet de définir le mot de passe du compte.
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <code className="max-w-full flex-1 overflow-x-auto rounded bg-white/70 px-2 py-1 text-xs">
                {linkFor.url}
              </code>
              <Button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(linkFor.url);
                  setCopied(true);
                }}
              >
                {copied ? 'Copié ✔' : 'Copier'}
              </Button>
              <Button type="button" onClick={() => setLinkFor(null)}>
                Masquer
              </Button>
            </div>
          </div>
        </Alert>
      )}

      <div className="mt-5 flex gap-1 border-b border-line" role="tablist">
        {STATUS_TABS.map((tab) => {
          // ⚠ « Tous » NE LIT PAS `data.total` : ce total est celui de la requête
          // COURANTE, donc filtrée. Il affichait « Tous(68) » quand on regardait
          // les comptes en attente — le nombre de l'onglet d'à côté. `counts`
          // porte la ventilation complète et ne bouge pas avec le filtre ;
          // somme de ses valeurs plutôt que de deux clés nommées, pour qu'un
          // statut ajouté demain entre dans le total sans qu'on y pense.
          const total = Object.values(counts).reduce((a, b) => a + b, 0);
          const count = tab.key ? counts[tab.key] : (data ? total : undefined);
          return (
            <button
              key={tab.key || 'all'}
              role="tab"
              aria-selected={status === tab.key}
              onClick={() => setStatus(tab.key)}
              className={`rounded-t-md px-4 py-2.5 text-sm font-semibold transition-colors ${
                status === tab.key
                  ? 'border border-b-0 border-line bg-white text-ink'
                  : 'text-muted hover:text-ink'
              }`}
            >
              {tab.label}
              {count !== undefined && (
                <span className="ml-1.5 text-xs text-muted">({count})</span>
              )}
            </button>
          );
        })}
      </div>

      <form onSubmit={onSearch} className="mt-4 flex max-w-md gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Nom, email, matricule…"
          aria-label="Rechercher un compte"
        />
        <Button type="submit">Rechercher</Button>
      </form>

      <div className="mt-4 overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-paper text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-2.5 font-semibold">Nom</th>
              <th className="px-4 py-2.5 font-semibold">Email · Matricule</th>
              <th className="px-4 py-2.5 font-semibold">Classe</th>
              <th className="px-4 py-2.5 font-semibold">Rôle</th>
              <th className="px-4 py-2.5 font-semibold">Statut</th>
              <th className="px-4 py-2.5 font-semibold">Inscrit le</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {data?.users.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-muted">
                  Aucun compte dans cette vue.
                </td>
              </tr>
            )}
            {data?.users.map((account) => {
              const badge = STATUS_BADGE[account.status] ?? {
                tone: 'neutral' as const,
                label: account.status,
              };
              return (
                <tr key={account.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-2.5 font-medium">
                    {account.firstName} {account.lastName}
                  </td>
                  <td className="px-4 py-2.5 text-muted">
                    <div>{account.email}</div>
                    {account.matricule && (
                      <div className="font-mono text-xs">{account.matricule}</div>
                    )}
                  </td>
                  <td className="px-4 py-2.5">{account.className ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    {ROLE_LABELS[account.role] ?? account.role}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={badge.tone}>{badge.label}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-muted">
                    {dateFr.format(new Date(account.createdAt))}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {account.status === 'PENDING' && (
                      <div className="flex items-center justify-end gap-2">
                        {canManageAccounts && assignableRoles.length > 0 && (
                          <Select
                            value={roleChoice[account.id] ?? ''}
                            onChange={(e) =>
                              setRoleChoice({ ...roleChoice, [account.id]: e.target.value })
                            }
                            aria-label={`Rôle à assigner à ${account.firstName} ${account.lastName}`}
                            className="!w-auto"
                          >
                            <option value="">Rôle par défaut (Étudiant)</option>
                            {assignableRoles.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name}
                              </option>
                            ))}
                          </Select>
                        )}
                        <Button
                          onClick={() => activate(account)}
                          disabled={activating === account.id}
                        >
                          {activating === account.id ? 'Activation…' : 'Activer'}
                        </Button>
                      </div>
                    )}
                    {canManageAccounts && account.status === 'ACTIVE' && (
                      <Button
                        variant="ghost"
                        onClick={() => setAccountStatus(account, 'SUSPENDED')}
                      >
                        Suspendre
                      </Button>
                    )}
                    {canManageAccounts && account.status === 'SUSPENDED' && (
                      <Button onClick={() => setAccountStatus(account, 'ACTIVE')}>
                        Réactiver
                      </Button>
                    )}
                    {canManageAccounts && (
                      <Button variant="ghost" onClick={() => startEdit(account)}>
                        Modifier
                      </Button>
                    )}
                    {/*
                      Repli permanent : récupérer le lien même longtemps après
                      l'activation, si l'email n'est jamais arrivé. Le lien
                      n'est PAS pré-chargé dans la liste — il n'est demandé que
                      sur clic, et chaque consultation est tracée à l'audit.
                    */}
                    {canManageAccounts && (
                      <Button
                        variant="ghost"
                        disabled={loadingLink === account.id}
                        onClick={() => showLink(account)}
                        title="Afficher le lien de définition de mot de passe (tracé au journal d’audit)"
                      >
                        {loadingLink === account.id ? 'Chargement…' : 'Lien d’activation'}
                      </Button>
                    )}
                    {canManageAccounts && (
                      <span className="ml-2 inline-block">
                        {confirmDelete === account.id ? (
                          <Button
                            onClick={() => deleteAccount(account)}
                            disabled={deleting === account.id}
                          >
                            {deleting === account.id ? 'Suppression…' : 'Confirmer ?'}
                          </Button>
                        ) : (
                          <Button variant="ghost" onClick={() => setConfirmDelete(account.id)}>
                            Supprimer
                          </Button>
                        )}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/*
        ⚠ CENT LIGNES SUR 481, SANS UN MOT : c'est ce que cet écran faisait, et
        c'est la même liste tronquée que l'index des auteurs à la même semaine.
        Le compteur dit le total, le parcours mène au reste — et il ne s'affiche
        que s'il y a plus d'une page, sinon ce serait un bouton sans effet.
      */}
      {data && (
        <p className="mt-3 text-sm text-muted">
          {LIBELLES.comptes.compte(data.total)}
        </p>
      )}
      {data && data.total > PAR_PAGE && (
        <div className="mt-2 flex items-center justify-center gap-3">
          <Button
            variant="ghost"
            className="min-h-11"
            disabled={numeroPage <= 1}
            onClick={() => setNumeroPage((n) => Math.max(1, n - 1))}
          >
            {LIBELLES.comptes.pagePrecedente}
          </Button>
          <span className="text-sm text-muted">
            {LIBELLES.comptes.pageSur(numeroPage, Math.ceil(data.total / PAR_PAGE))}
          </span>
          <Button
            variant="ghost"
            className="min-h-11"
            disabled={numeroPage >= Math.ceil(data.total / PAR_PAGE)}
            onClick={() => setNumeroPage((n) => n + 1)}
          >
            {LIBELLES.comptes.pageSuivante}
          </Button>
        </div>
      )}
    </div>
  );
}
