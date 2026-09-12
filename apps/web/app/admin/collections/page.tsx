'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { LIBELLES } from '@/lib/libelles';
import { enArbre, invisibleDeTous } from '@/lib/arbre-collections';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/session';
import { Badge, Button, Card, Input } from '@/components/ui';

interface Collection {
  id: string;
  name: string;
  description: string | null;
  type: 'INTERNAL' | 'COMMERCIAL' | 'EXTERNAL';
  tenantId: string | null;
  /** Collection parente, ou `null` pour une racine — P6-1. */
  parentId: string | null;
  _count: { titles: number; accessRules: number };
}

const TYPE_LABELS: Record<Collection['type'], string> = {
  INTERNAL: 'Interne (documents numérisés)',
  COMMERCIAL: 'Catalogue commercial',
  EXTERNAL: 'Bibliothèque externe',
};

const emptyForm = { name: '', description: '', type: 'INTERNAL' as Collection['type'] };

export default function CollectionsPage() {
  const [collections, setCollections] = useState<Collection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setCollections(await api<Collection[]>('/collections', {}, getToken()));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Chargement impossible.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      await api(
        '/collections',
        {
          method: 'POST',
          body: JSON.stringify({
            name: form.name,
            description: form.description || undefined,
            type: form.type,
          }),
        },
        getToken(),
      );
      setNotice(`Collection « ${form.name} » créée.`);
      setForm(emptyForm);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Création impossible.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-3xl font-bold">Collections</h1>
        <Button onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Fermer' : 'Créer une collection'}
        </Button>
      </div>
      <p className="mt-1 text-sm text-muted">
        Regroupez des documents et définissez qui peut les lire (classe / abonnement).
        Une collection interne n’appartient qu’à votre école.
      </p>

      {showForm && (
        <Card className="mt-4">
          <h2 className="font-serif text-lg font-bold">Nouvelle collection</h2>
          <form onSubmit={onSubmit} className="mt-3 flex flex-wrap items-end gap-3">
            <label className="flex flex-1 min-w-[200px] flex-col gap-1.5 text-sm font-medium">
              Nom
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ressources Droit L1"
                required
              />
            </label>
            <label className="flex flex-1 min-w-[200px] flex-col gap-1.5 text-sm font-medium">
              Description (optionnel)
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Type
              <select
                value={form.type}
                onChange={(e) =>
                  setForm({ ...form, type: e.target.value as Collection['type'] })
                }
                className="rounded-md border border-line bg-white px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ocre"
              >
                {Object.entries(TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" disabled={saving}>
              {saving ? 'Création…' : 'Créer'}
            </Button>
          </form>
        </Card>
      )}

      {notice && (
        <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-900">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      {/*
        ⚠ LE RAPPEL EN TÊTE NE REMPLACE PAS LA PHRASE SUR CHAQUE COLLECTION. Il
        s'adresse à qui découvre la hiérarchie ; la phrase, elle, s'adresse à qui
        vient de se tromper. Un bandeau général se lit une fois et s'oublie.
      */}
      {collections !== null && collections.some((c) => c.parentId !== null) && (
        <p className="mt-4 text-sm text-muted">
          {LIBELLES.collectionsArbre.pasDHeritage}{' '}
          {LIBELLES.collectionsArbre.profondeurMax}
        </p>
      )}

      <div className="mt-5 flex flex-col gap-2">
        {collections?.length === 0 && (
          <Card className="text-center text-sm text-muted">Aucune collection.</Card>
        )}
      {collections !== null &&
        enArbre(collections).map(({ noeud: c, profondeur }) => (
          <Link
            key={c.id}
            href={`/admin/collections/${c.id}`}
            // ⚠ L'indentation est VISUELLE. Ce qui porte la hiérarchie pour une
            // lecture non visuelle, c'est `aria-level` — sans lui, un arbre
            // indenté n'est qu'une liste plate décalée.
            style={{ marginLeft: `${profondeur * 24}px` }}
            aria-level={profondeur + 1}
          >
            <Card className="flex items-center justify-between !p-4 transition-colors hover:border-ocre/50">
              <div>
                <div className="font-semibold">{c.name}</div>
                {c.description && (
                  <div className="text-sm text-muted">{c.description}</div>
                )}
                {/*
                  ⚠ LA PHRASE QUI DÉTROMPE, et elle change selon qu'on a pu croire
                  hériter ou non. Zéro règle = invisible de tous, que la collection
                  soit racine ou fille ; mais seule la fille laissait croire le
                  contraire.
                */}
                {invisibleDeTous(c) && (
                  <div className="mt-1 text-sm text-heading">
                    {c.parentId
                      ? LIBELLES.collectionsArbre.sansRegleSousCollection
                      : LIBELLES.collectionsArbre.sansRegle}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3 text-sm text-muted">
                <span>{c._count.titles} document(s)</span>
                <span>{c._count.accessRules} règle(s)</span>
                <Badge tone={c.type === 'INTERNAL' ? 'ocre' : 'neutral'}>
                  {TYPE_LABELS[c.type]}
                </Badge>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
