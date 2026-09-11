'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/session';
import { useMyFunctions } from '@/lib/functions';
import { Alert, Button, Card, Input } from '@/components/ui';

interface Category {
  id: string;
  name: string;
  createdAt: string;
}

type FormState = { id: string | null; name: string }; // id null = création

const EMPTY_FORM: FormState = { id: null, name: '' };

export default function CategoriesPage() {
  const { functions: myFunctions } = useMyFunctions();
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const canManage = myFunctions?.includes('catalogue.gerer');

  const load = useCallback(async () => {
    setError(null);
    try {
      setCategories(await api<Category[]>('/categories', {}, getToken()));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Chargement impossible.');
    }
  }, []);

  useEffect(() => {
    if (canManage) void load();
  }, [canManage, load]);

  function startCreate() {
    setConfirmDelete(null);
    setForm({ ...EMPTY_FORM });
  }

  function startEdit(category: Category) {
    setConfirmDelete(null);
    setForm({ id: category.id, name: category.name });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      const body = JSON.stringify({ name: form.name });
      if (form.id) {
        await api(`/categories/${form.id}`, { method: 'PATCH', body }, getToken());
        setNotice(`Domaine « ${form.name} » mis à jour.`);
      } else {
        await api('/categories', { method: 'POST', body }, getToken());
        setNotice(`Domaine « ${form.name} » créé.`);
      }
      setForm(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(category: Category) {
    setNotice(null);
    setError(null);
    try {
      await api(`/categories/${category.id}`, { method: 'DELETE' }, getToken());
      setNotice(`Domaine « ${category.name} » supprimé.`);
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
        Vous n’avez pas la permission de gérer les domaines (fonction
        «&nbsp;catalogue.gerer&nbsp;»).
      </Alert>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-3xl font-bold">Domaines</h1>
        {!form && <Button onClick={startCreate}>Créer un domaine</Button>}
      </div>
      <p className="mt-1 text-sm text-muted">
        Les domaines proposés à la création d’une notice et regroupés sur la page
        constellation. Une liste fermée évite les doublons de saisie (« medecine »,
        « Medecine », « médecine »…).
      </p>

      {notice && <Alert tone="success" className="mt-4">{notice}</Alert>}
      {error && <Alert tone="error" className="mt-4">{error}</Alert>}

      {form && (
        <Card className="mt-4">
          <h2 className="font-serif text-lg font-bold">
            {form.id ? 'Modifier le domaine' : 'Nouveau domaine'}
          </h2>
          <form onSubmit={save} className="mt-3 flex flex-wrap items-end gap-3">
            <label className="flex flex-1 flex-col gap-1.5 text-sm font-medium">
              Nom
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Droit"
                required
              />
            </label>
            <Button type="submit" disabled={saving}>
              {saving ? 'Enregistrement…' : form.id ? 'Enregistrer' : 'Créer'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setForm(null)}>
              Annuler
            </Button>
          </form>
        </Card>
      )}

      <div className="mt-5 flex flex-col gap-2">
        {categories === null && <p className="text-sm text-muted">Chargement…</p>}
        {categories?.length === 0 && (
          <p className="text-sm text-muted">
            Aucun domaine. Créez-en un pour commencer à classer le catalogue.
          </p>
        )}
        {categories?.map((category) => (
          <Card key={category.id} className="flex items-center justify-between !p-4">
            <span className="font-medium capitalize">{category.name}</span>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => startEdit(category)}>
                Éditer
              </Button>
              {confirmDelete === category.id ? (
                <Button onClick={() => remove(category)}>Confirmer&nbsp;?</Button>
              ) : (
                <Button variant="ghost" onClick={() => setConfirmDelete(category.id)}>
                  Supprimer
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
