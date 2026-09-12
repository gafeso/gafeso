'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { LIBELLES } from '@/lib/libelles';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/session';
import { useMyFunctions } from '@/lib/functions';
import { Alert, Badge, Button, Card, Input, Textarea } from '@/components/ui';

interface Role {
  id: string;
  name: string;
  description: string | null;
  functions: string[];
  isSystem: boolean;
  _count: { users: number };
}

interface FonctionCatalogue {
  code: string;
  libelle: string;
}

type FormState = {
  id: string | null; // null = création
  name: string;
  description: string;
  functions: string[];
};

const EMPTY_FORM: FormState = { id: null, name: '', description: '', functions: [] };

export default function RolesPage() {
  const { functions: myFunctions } = useMyFunctions();
  const [roles, setRoles] = useState<Role[] | null>(null);
  const [catalogue, setCatalogue] = useState<FonctionCatalogue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const canManage = myFunctions?.includes('securite.roles');
  const libelle = (code: string) =>
    catalogue.find((f) => f.code === code)?.libelle ?? code;

  const load = useCallback(async () => {
    setError(null);
    try {
      const [r, cat] = await Promise.all([
        api<Role[]>('/roles', {}, getToken()),
        api<FonctionCatalogue[]>('/roles/fonctions', {}, getToken()),
      ]);
      setRoles(r);
      setCatalogue(cat);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Chargement impossible.');
    }
  }, []);

  useEffect(() => {
    if (canManage) void load();
  }, [canManage, load]);

  /**
   * ⚠ LA PORTE MANQUANTE DU CIRCUIT DE DÉPÔT.
   *
   * `null` tant que les rôles ne sont pas chargés : afficher « personne ne peut
   * valider » pendant le chargement serait un vide qui INVITE À AGIR, et le
   * geste — créer un rôle — est une écriture. C'est la règle posée le
   * 10 septembre sur « Aucun domaine créé ».
   */
  const porteDuDepotManque =
    roles === null ? null : !roles.some((r) => r.functions.includes('depot.valider'));

  /**
   * PROPOSE, ne crée pas : le formulaire s'ouvre pré-rempli et l'administrateur
   * enregistre lui-même. Exigence de Jean, et elle est juste — un bouton qui
   * pose des droits sans les montrer est un élargissement en aveugle.
   */
  function proposerRoleDeValidation() {
    setConfirmDelete(null);
    setNotice(LIBELLES.porteDuDepot.apresProposition);
    setForm({
      id: null,
      name: LIBELLES.porteDuDepot.nomPropose,
      description: LIBELLES.porteDuDepot.descriptionProposee,
      functions: ['depot.valider'],
    });
  }

  function startCreate() {
    setConfirmDelete(null);
    setForm({ ...EMPTY_FORM });
  }

  function startEdit(role: Role) {
    setConfirmDelete(null);
    setForm({
      id: role.id,
      name: role.name,
      description: role.description ?? '',
      functions: [...role.functions],
    });
  }

  function toggleFunction(code: string) {
    if (!form) return;
    setForm({
      ...form,
      functions: form.functions.includes(code)
        ? form.functions.filter((c) => c !== code)
        : [...form.functions, code],
    });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      const body = JSON.stringify({
        name: form.name,
        description: form.description || undefined,
        functions: form.functions,
      });
      if (form.id) {
        await api(`/roles/${form.id}`, { method: 'PATCH', body }, getToken());
        setNotice(`Rôle « ${form.name} » mis à jour.`);
      } else {
        await api('/roles', { method: 'POST', body }, getToken());
        setNotice(`Rôle « ${form.name} » créé.`);
      }
      setForm(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(role: Role) {
    setNotice(null);
    setError(null);
    try {
      await api(`/roles/${role.id}`, { method: 'DELETE' }, getToken());
      setNotice(`Rôle « ${role.name} » supprimé.`);
      setConfirmDelete(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Suppression impossible.');
      setConfirmDelete(null);
    }
  }

  if (myFunctions && !canManage) {
    return (
      <Alert tone="error">
        Vous n’avez pas la permission de gérer les rôles (fonction
        «&nbsp;securite.roles&nbsp;»).
      </Alert>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-3xl font-bold">Rôles &amp; fonctions</h1>
        {!form && <Button onClick={startCreate}>Créer un rôle</Button>}
      </div>
      <p className="mt-1 text-sm text-muted">
        Un rôle regroupe des fonctions (capacités par module). Les rôles système
        sont fournis et non modifiables ; créez des rôles personnalisés pour
        ajuster finement les droits. L’effet est immédiat (résolu à chaque requête).
      </p>

      {/*
        ⚠ NI PENDANT LE CHARGEMENT, NI QUAND LA FONCTION EST PORTÉE. Et pas de
        ton d'alerte : ce n'est pas une faute de l'école, c'est un défaut de
        notre découpage — `depot.deposer` est donnée par défaut, `depot.valider`
        ne l'est pas. L'école hérite d'une asymétrie qu'elle n'a pas choisie.
      */}
      {porteDuDepotManque === true && !form && (
        <Card className="mt-4">
          <h2 className="font-serif text-lg font-bold">{LIBELLES.porteDuDepot.titre}</h2>
          <p className="mt-2 text-sm text-muted">{LIBELLES.porteDuDepot.constat}</p>
          <p className="mt-2 text-sm text-muted">
            {LIBELLES.porteDuDepot.ceQueLeRolePortera('depot.valider')}
          </p>
          <Button className="mt-3 min-h-11" onClick={proposerRoleDeValidation}>
            {LIBELLES.porteDuDepot.proposer}
          </Button>
        </Card>
      )}

      {notice && <Alert tone="success" className="mt-4">{notice}</Alert>}
      {error && <Alert tone="error" className="mt-4">{error}</Alert>}

      {form && (
        <Card className="mt-4">
          <h2 className="font-serif text-lg font-bold">
            {form.id ? 'Modifier le rôle' : 'Nouveau rôle'}
          </h2>
          <form onSubmit={save} className="mt-3 flex flex-col gap-4">
            <div className="flex flex-wrap gap-3">
              <label className="flex flex-1 flex-col gap-1.5 text-sm font-medium">
                Nom
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Documentaliste"
                  required
                />
              </label>
              <label className="flex flex-[2] flex-col gap-1.5 text-sm font-medium">
                Description (optionnel)
                <Input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </label>
            </div>

            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium">Fonctions accordées</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {catalogue.map((f) => (
                  <label
                    key={f.code}
                    className="flex cursor-pointer items-start gap-2 rounded-md border border-line px-3 py-2 text-sm hover:border-ocre/50"
                  >
                    <input
                      type="checkbox"
                      checked={form.functions.includes(f.code)}
                      onChange={() => toggleFunction(f.code)}
                      className="mt-0.5 h-4 w-4 accent-ocre"
                    />
                    <span>
                      <span className="font-medium">{f.libelle}</span>
                      <span className="block font-mono text-xs text-muted">{f.code}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="flex gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? 'Enregistrement…' : form.id ? 'Enregistrer' : 'Créer le rôle'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setForm(null)}>
                Annuler
              </Button>
            </div>
          </form>
        </Card>
      )}

      <div className="mt-5 flex flex-col gap-3">
        {roles === null && <p className="text-sm text-muted">Chargement…</p>}
        {roles?.map((role) => (
          <Card key={role.id} className="!p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-serif text-lg font-bold">{role.name}</span>
                  <Badge tone={role.isSystem ? 'neutral' : 'ocre'}>
                    {role.isSystem ? 'Système' : 'Personnalisé'}
                  </Badge>
                  <span className="text-xs text-muted">
                    {role._count.users} compte(s)
                  </span>
                </div>
                {role.description && (
                  <p className="mt-1 text-sm text-muted">{role.description}</p>
                )}
              </div>
              {role.isSystem ? (
                <span className="text-xs text-muted">Non modifiable</span>
              ) : (
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => startEdit(role)}>
                    Éditer
                  </Button>
                  {confirmDelete === role.id ? (
                    <Button onClick={() => remove(role)}>Confirmer&nbsp;?</Button>
                  ) : (
                    <Button variant="ghost" onClick={() => setConfirmDelete(role.id)}>
                      Supprimer
                    </Button>
                  )}
                </div>
              )}
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {role.functions.length === 0 && (
                <span className="text-sm text-muted">
                  Aucune fonction (accès via access-control uniquement).
                </span>
              )}
              {role.functions.map((code) => (
                <span
                  key={code}
                  title={code}
                  className="rounded-full bg-line/60 px-2.5 py-0.5 text-xs font-medium text-ink"
                >
                  {libelle(code)}
                </span>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
