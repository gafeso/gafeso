'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/session';
import { Button, Card, Input, Select, Textarea } from '@/components/ui';
import { formatTitle } from '@/lib/titles';
import { isDefenseType, RECORD_TYPES, yearLabel } from '@/lib/record-types';
import {
  ContributorRow,
  ContributorsEditor,
  emptyContributors,
  hasPrincipalAuthor,
  toApiContributors,
} from '@/components/contributors-editor';
import { KeywordsInput } from '@/components/keywords-input';
import { ContributorsSummary } from '@/components/contributors-summary';
import { RecordLookup, LookupCandidate } from '@/components/record-lookup';
import { LabelsPanel } from '@/components/labels-panel';

interface Record {
  id: string;
  title: string;
  titleComplement: string | null;
  author: string | null;
  contributors?: { name: string; role: string }[];
  category: string | null;
  recordType: string;
  publishYear: number | null;
  _count: { items: number };
}

interface Category {
  id: string;
  name: string;
}

interface RecordsResponse {
  total: number;
  page: number;
  totalPages: number;
  records: Record[];
}

const emptyForm = {
  title: '',
  titleComplement: '',
  isbn: '',
  language: 'fr',
  publishYear: '',
  category: '',
  recordType: 'ouvrage',
  publisher: '',
  publicationCity: '',
  defenseUniversity: '',
  defensePlace: '',
  summary: '',
};

export default function CataloguePage() {
  const [data, setData] = useState<RecordsResponse | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [category, setCategory] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [contributors, setContributors] = useState<ContributorRow[]>(emptyContributors());
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordSuggestions, setKeywordSuggestions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [marcType, setMarcType] = useState('UNIMARC');
  // Sélection de notices pour l'impression d'étiquettes (portée « Sélection »).
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showLabels, setShowLabels] = useState(false);

  function toggleSelected(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  const load = useCallback(async (cat: string) => {
    setError(null);
    try {
      const qs = new URLSearchParams({ limit: '100' });
      if (cat) qs.set('category', cat);
      setData(await api<RecordsResponse>(`/cataloging/records?${qs}`, {}, getToken()));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Chargement impossible.');
    }
  }, []);

  useEffect(() => {
    void load('');
    api<Category[]>('/categories', {}, getToken())
      .then(setCategories)
      .catch(() => setCategories([]));
    api<{ name: string }[]>('/cataloging/keywords', {}, getToken())
      .then((list) => setKeywordSuggestions(list.map((k) => k.name)))
      .catch(() => setKeywordSuggestions([]));
  }, [load]);

  async function createRecord(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    setError(null);
    // UX seulement — le serveur applique les mêmes règles de toute façon.
    if (!hasPrincipalAuthor(contributors)) {
      setError('Au moins un auteur principal est requis.');
      return;
    }
    const defense = isDefenseType(form.recordType);
    if (defense && !toApiContributors(contributors).some((c) => c.role === 'DIRECTEUR_MEMOIRE')) {
      setError('Le directeur de mémoire / de thèse est requis pour une thèse ou un mémoire.');
      return;
    }
    if (keywords.length < 3) {
      setError('Ajoutez au moins 3 mots-clés pour enregistrer.');
      return;
    }
    setSaving(true);
    try {
      const created = await api<{ id: string; title: string }>(
        '/cataloging/records',
        {
          method: 'POST',
          // Les champs masqués par le type (§3) restent dans l'état local
          // (rien n'est perdu si on rebascule) mais ne sont PAS envoyés.
          body: JSON.stringify({
            title: form.title,
            titleComplement: form.titleComplement || undefined,
            contributors: toApiContributors(contributors),
            keywords,
            isbn: form.isbn || undefined,
            language: form.language.trim() || undefined,
            publishYear: form.publishYear ? Number(form.publishYear) : undefined,
            category: form.category || undefined,
            recordType: form.recordType,
            summary: form.summary || undefined,
            ...(defense
              ? {
                  defenseUniversity: form.defenseUniversity,
                  defensePlace: form.defensePlace || undefined,
                }
              : {
                  publisher: form.publisher || undefined,
                  publicationCity: form.publicationCity || undefined,
                }),
          }),
        },
        getToken(),
      );
      setNotice(`Notice « ${created.title} » créée.`);
      setForm(emptyForm);
      setContributors(emptyContributors());
      // Les mots-clés tout juste créés enrichissent l'autocomplétion.
      setKeywordSuggestions((prev) => Array.from(new Set([...prev, ...keywords])).sort());
      setKeywords([]);
      setShowForm(false);
      await load(category);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Création impossible.');
    } finally {
      setSaving(false);
    }
  }

  // Pré-remplissage depuis une notice SRU récupérée : on ne pose QUE des
  // champs bruts. Les auteurs restent de simples noms — leur rattachement aux
  // fiches d'autorité se fait à l'enregistrement, par le chemin habituel.
  function applyCandidate(c: LookupCandidate) {
    setError(null);
    setForm((prev) => ({
      ...prev,
      title: c.title,
      titleComplement: c.titleComplement ?? '',
      isbn: c.isbn ?? '',
      language: c.language ?? prev.language,
      publishYear: c.publishYear != null ? String(c.publishYear) : '',
      publisher: c.publisher ?? prev.publisher,
      publicationCity: c.publicationCity ?? prev.publicationCity,
    }));
    if (c.contributors.length) {
      setContributors(c.contributors.map((k) => ({ name: k.name, role: k.role })));
    }
    setNotice(
      `Notice « ${c.title} » importée depuis ${c.source}. Relisez, ajoutez la catégorie et les mots-clés, puis enregistrez.`,
    );
  }

  async function onImportMarc(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setNotice(null);
    setError(null);
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('marcFormat', marcType);
      const res = await fetch('/api/cataloging/records/import-marc', {
        method: 'POST',
        credentials: 'same-origin', // auth via cookie httpOnly bc_token
        body,
      });
      if (!res.ok) throw new Error((await res.json()).message ?? 'Import refusé.');
      const result = (await res.json()) as { imported: number; skipped: number };
      setNotice(
        `Import MARC : ${result.imported} notice(s) importée(s), ${result.skipped} ignorée(s).`,
      );
      await load(category);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import impossible.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-3xl font-bold">Catalogue</h1>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={marcType}
            onChange={(e) => setMarcType(e.target.value)}
            className="rounded-md border border-line bg-white px-2 py-2 text-sm"
            aria-label="Format MARC"
          >
            <option value="UNIMARC">UNIMARC</option>
            <option value="MARC21">MARC21</option>
          </select>
          <input
            ref={fileRef}
            type="file"
            accept=".mrc,.marc,.iso,application/marc,application/octet-stream"
            onChange={onImportMarc}
            className="hidden"
          />
          <Button variant="ghost" onClick={() => fileRef.current?.click()}>
            Importer un fichier MARC
          </Button>
          <a
            href="/api/cataloging/export?format=iso2709"
            download
            className="inline-flex items-center rounded-md border border-line px-3 py-2 text-sm font-medium text-ink hover:bg-line/40"
            title="Exporter tout le catalogue en ISO 2709 (.mrc)"
          >
            Export MARC
          </a>
          <a
            href="/api/cataloging/export?format=marcxml"
            download
            className="inline-flex items-center rounded-md border border-line px-3 py-2 text-sm font-medium text-ink hover:bg-line/40"
            title="Exporter tout le catalogue en MARCXML"
          >
            Export MARCXML
          </a>
          <Button variant="ghost" onClick={() => setShowLabels((v) => !v)}>
            {showLabels ? 'Masquer les étiquettes' : 'Étiquettes'}
          </Button>
          <Button onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Fermer' : 'Nouvelle notice'}
          </Button>
        </div>
      </div>

      {notice && (
        <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-900">{notice}</p>
      )}
      {error && (
        <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      {showLabels && (
        <div className="mt-4">
          <LabelsPanel selectedRecordIds={selectedIds} />
        </div>
      )}

      {showForm && (
        <Card className="mt-4">
          <h2 className="font-serif text-lg font-bold">Nouvelle notice</h2>
          <form onSubmit={createRecord} className="mt-3 grid grid-cols-2 gap-3">
            <RecordLookup onApply={applyCandidate} />
            <label className="col-span-2 flex flex-col gap-1.5 text-sm font-medium">
              Titre
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </label>
            <label className="col-span-2 flex flex-col gap-1.5 text-sm font-medium">
              Complément de titre
              <Input
                value={form.titleComplement}
                onChange={(e) => setForm({ ...form, titleComplement: e.target.value })}
                placeholder="Sous-titre (optionnel) — affiché « Titre : complément »"
              />
            </label>
            <ContributorsEditor
              value={contributors}
              onChange={setContributors}
              showDirectorRole={isDefenseType(form.recordType)}
            />
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              ISBN
              <Input
                value={form.isbn}
                onChange={(e) => setForm({ ...form, isbn: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Langue
              <Input
                value={form.language}
                onChange={(e) => setForm({ ...form, language: e.target.value })}
                placeholder="fre, eng… (code ou libellé)"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Catégorie (domaine)
              <Select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                <option value="">Sans catégorie</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.name} className="capitalize">
                    {c.name}
                  </option>
                ))}
              </Select>
              {categories.length === 0 && (
                <span className="text-xs text-muted">
                  Aucune catégorie créée —{' '}
                  <Link href="/admin/categories" className="underline hover:text-ocre">
                    en créer une
                  </Link>
                  .
                </span>
              )}
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {yearLabel(form.recordType)}
              <Input
                type="number"
                value={form.publishYear}
                onChange={(e) => setForm({ ...form, publishYear: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Type
              <select
                value={form.recordType}
                onChange={(e) => setForm({ ...form, recordType: e.target.value })}
                className="rounded-md border border-line bg-white px-3 py-2 text-sm"
              >
                {RECORD_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            {/* Affichage conditionnel par type (§3) : les valeurs masquées
                restent dans l'état local, elles ne sont juste pas envoyées. */}
            {isDefenseType(form.recordType) ? (
              <>
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  Université de soutenance *
                  <Input
                    value={form.defenseUniversity}
                    onChange={(e) => setForm({ ...form, defenseUniversity: e.target.value })}
                    placeholder="ex. Université d'Exemple"
                    required
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  Lieu de soutenance
                  <Input
                    value={form.defensePlace}
                    onChange={(e) => setForm({ ...form, defensePlace: e.target.value })}
                    placeholder="Ville, si distincte de l’université"
                  />
                </label>
              </>
            ) : (
              <>
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  Éditeur
                  <Input
                    value={form.publisher}
                    onChange={(e) => setForm({ ...form, publisher: e.target.value })}
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  Ville d’édition
                  <Input
                    value={form.publicationCity}
                    onChange={(e) => setForm({ ...form, publicationCity: e.target.value })}
                  />
                </label>
              </>
            )}
            <KeywordsInput
              value={keywords}
              onChange={setKeywords}
              suggestions={keywordSuggestions}
            />
            <label className="col-span-2 flex flex-col gap-1.5 text-sm font-medium">
              Résumé / description
              <Textarea
                rows={3}
                value={form.summary}
                onChange={(e) => setForm({ ...form, summary: e.target.value })}
              />
            </label>
            <div className="col-span-2">
              <Button type="submit" disabled={saving}>
                {saving ? 'Création…' : 'Créer la notice'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void load(category);
        }}
        className="mt-5 flex max-w-xs gap-2"
      >
        <Select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="Filtrer par catégorie"
        >
          <option value="">Toutes les catégories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.name} className="capitalize">
              {c.name}
            </option>
          ))}
        </Select>
        <Button type="submit">Filtrer</Button>
      </form>

      <p className="mt-4 text-sm text-muted">{data?.total ?? 0} notice(s)</p>
      <div className="mt-2 overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-paper text-left text-xs uppercase tracking-wide text-muted">
              {showLabels && <th className="w-8 px-3 py-2.5" aria-label="Sélection" />}
              <th className="px-4 py-2.5 font-semibold">Titre</th>
              <th className="px-4 py-2.5 font-semibold">Auteur</th>
              <th className="px-4 py-2.5 font-semibold">Catégorie</th>
              <th className="px-4 py-2.5 font-semibold">Type</th>
              <th className="px-4 py-2.5 font-semibold">Exemplaires</th>
            </tr>
          </thead>
          <tbody>
            {data?.records.length === 0 && (
              <tr>
                <td colSpan={showLabels ? 6 : 5} className="px-4 py-6 text-center text-muted">
                  Aucune notice.
                </td>
              </tr>
            )}
            {data?.records.map((record) => (
              <tr key={record.id} className="border-b border-line last:border-0 hover:bg-paper">
                {showLabels && (
                  <td className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(record.id)}
                      onChange={() => toggleSelected(record.id)}
                      aria-label={`Sélectionner ${record.title} pour les étiquettes`}
                    />
                  </td>
                )}
                <td className="px-4 py-2.5 font-medium">
                  <Link href={`/admin/catalogue/${record.id}`} className="hover:text-ocre">
                    {formatTitle(record.title, record.titleComplement)}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-muted">
                  <ContributorsSummary
                    contributors={record.contributors}
                    fallbackAuthor={record.author}
                  />
                </td>
                <td className="px-4 py-2.5">{record.category ?? '—'}</td>
                <td className="px-4 py-2.5 capitalize">{record.recordType}</td>
                <td className="px-4 py-2.5">{record._count.items}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
