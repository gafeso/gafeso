'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
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
import { LIBELLES } from '@/lib/libelles';

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

/**
 * Vingt notices par page. L'écran en demandait CENT et n'affichait rien au-delà :
 * 252 des 352 étaient inatteignables, en silence. Vingt tient à l'écran et rend
 * la pagination réellement utilisable.
 */
const PAR_PAGE = 20;

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
  // ⚠ `null` tant qu'on ne sait pas. Avec `[]`, l'indication sous le menu des
  // domaines affichait « Aucun domaine créé — en créer une » AVANT que la liste
  // n'arrive : non seulement une affirmation fausse, mais une INVITATION À AGIR
  // fondée dessus. Les 28 domaines existaient déjà.
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [category, setCategory] = useState('');
  const [recherche, setRecherche] = useState('');
  const [rechercheActive, setRechercheActive] = useState('');
  const [numeroPage, setNumeroPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [contributors, setContributors] = useState<ContributorRow[]>(emptyContributors());
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordSuggestions, setKeywordSuggestions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  // Sélection de notices pour l'impression d'étiquettes (portée « Sélection »).
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showLabels, setShowLabels] = useState(false);

  function toggleSelected(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  // ⚠ PAGINÉ À VINGT, et non plus tronqué à cent en silence. La pagination a
  // attendu le départage du tri : `createdAt` seul, sans `id`, réordonnait d'un
  // appel à l'autre — 340 notices du fonds partagent la même seconde, et
  // parcourir les 18 pages ramenait 20 doublons en masquant 20 notices.
  // Départage livré et vérifié sur la requête réelle : 352 ramenées, 352
  // distinctes, 0 doublon, 0 manquante.
  const load = useCallback(async (cat: string, q: string, page: number) => {
    setError(null);
    try {
      const qs = new URLSearchParams({ limit: String(PAR_PAGE), page: String(page) });
      if (cat) qs.set('category', cat);
      if (q.trim()) qs.set('q', q.trim());
      setData(await api<RecordsResponse>(`/cataloging/records?${qs}`, {}, getToken()));
    } catch (err) {
      // On ne retombe pas sur une page vide : une panne et un catalogue vide
      // s'écriraient pareil, et la phrase serait fausse dans le premier cas.
      setData(null);
      setError(err instanceof ApiError ? err.message : 'Chargement impossible.');
    }
  }, []);

  useEffect(() => {
    void load(category, rechercheActive, numeroPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, rechercheActive, numeroPage]);

  useEffect(() => {
    api<Category[]>('/categories', {}, getToken())
      .then(setCategories)
      .catch(() => setCategories([]));
    api<{ name: string }[]>('/cataloging/keywords', {}, getToken())
      .then((list) => setKeywordSuggestions(list.map((k) => k.name)))
      .catch(() => setKeywordSuggestions([]));
    // Les listes de référence ne se rechargent pas à chaque page.
  }, []);

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
      await load(category, rechercheActive, numeroPage);
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
      `Notice « ${c.title} » importée depuis ${c.source}. Relisez, ajoutez le domaine et les mots-clés, puis enregistrez.`,
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-3xl font-bold">Catalogue</h1>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href="/api/cataloging/export?format=iso2709"
            download
            className="inline-flex items-center rounded-md border border-line px-3 py-2 text-sm font-medium text-ink hover:bg-line/40"
            title="Exporter tout le catalogue en ISO 2709 (.mrc)"
          >
            Export MARC
          </a>
          <a
            href="/api/cataloging/export?format=marcxchange"
            download
            className="inline-flex items-center rounded-md border border-line px-3 py-2 text-sm font-medium text-ink hover:bg-line/40"
            title="Exporter tout le catalogue en MarcXchange (ISO 25577, UNIMARC)"
          >
            Export MarcXchange
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
              Domaine
              <Select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                <option value="">Sans domaine</option>
                {(categories ?? []).map((c) => (
                  <option key={c.id} value={c.name} className="capitalize">
                    {c.name}
                  </option>
                ))}
              </Select>
              {categories !== null && categories.length === 0 && (
                <span className="text-xs text-muted">
                  Aucun domaine créé —{' '}
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
          // ⚠ Retour à la PAGE 1 : rester en page 7 d'un résultat qui en
          // compte deux afficherait une liste vide sur une recherche qui trouve.
          setNumeroPage(1);
          setRechercheActive(recherche);
        }}
        className="mt-5 flex flex-wrap items-end gap-2"
      >
        <div className="min-w-[14rem] flex-1">
          <Input
            className="min-h-11"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder={LIBELLES.catalogue.rechercher}
            aria-label={LIBELLES.catalogue.rechercheAccessible}
          />
        </div>
        <Select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="Filtrer par domaine"
        >
          <option value="">Tous les domaines</option>
          {(categories ?? []).map((c) => (
            <option key={c.id} value={c.name} className="capitalize">
              {c.name}
            </option>
          ))}
        </Select>
        <Button type="submit" className="min-h-11">
          {LIBELLES.catalogue.rechercher}
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
            {LIBELLES.catalogue.effacerRecherche}
          </Button>
        )}
      </form>
      {/* ⚠ La limite des accents SE DIT. `ILIKE` ne les franchit pas, et 268 des
          352 titres du fonds en portent un : une recherche qui ne trouve pas ce
          qu'on sait présent fait douter du catalogue, pas de la requête — à
          moins qu'on ne l'ait prévenu. Correctif backend prévu après P3. */}
      <p className="mt-1 text-xs text-muted">{LIBELLES.catalogue.rechercheIndice}</p>

      {/* `{data?.total ?? 0}` écrivait « 0 notice(s) » AVANT que le chargement
          n'aboutisse, et aussi quand il ÉCHOUAIT : un catalogue vide et un
          catalogue cassé rendaient exactement la même phrase, et cette phrase
          était fausse dans le second cas. Tant qu'on ne sait pas, on ne dit pas
          un nombre ; en échec, on dit l'échec. Un zéro affiché est désormais
          une information, pas un défaut de chargement déguisé. */}
      <p className="mt-4 text-sm text-muted">
        {error
          ? LIBELLES.catalogue.compteIndisponible
          : data
            ? LIBELLES.catalogue.compteNotices(data.total)
            : LIBELLES.catalogue.chargementEnCours}
      </p>
        
      <div className="mt-2 overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-paper text-left text-xs uppercase tracking-wide text-muted">
              {showLabels && <th className="w-8 px-3 py-2.5" aria-label="Sélection" />}
              <th className="px-4 py-2.5 font-semibold">Titre</th>
              <th className="px-4 py-2.5 font-semibold">Auteur</th>
              <th className="px-4 py-2.5 font-semibold">Domaine</th>
              <th className="px-4 py-2.5 font-semibold">Type</th>
              <th className="px-4 py-2.5 font-semibold">Exemplaires</th>
            </tr>
          </thead>
          <tbody>
            {data?.records.length === 0 && (
              <tr>
                <td colSpan={showLabels ? 6 : 5} className="px-4 py-6 text-center text-muted">
                  {/* ⚠ Une recherche qui ne trouve rien N'EST PAS un catalogue
                      vide. Les confondre ferait croire au fonds disparu — et
                      sur un écran où les accents ne sont pas franchis, ce cas
                      arrivera souvent. */}
                  {rechercheActive
                    ? LIBELLES.catalogue.aucunPourCetteRecherche
                    : 'Aucune notice.'}
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

      {/* Paginée, enfin — et seulement quand il y a plus d'une page. */}
      {data && data.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3">
          <Button
            variant="ghost"
            className="min-h-11"
            disabled={data.page <= 1}
            onClick={() => setNumeroPage((n) => Math.max(1, n - 1))}
          >
            {LIBELLES.catalogue.pagePrecedente}
          </Button>
          <span className="text-sm text-muted">
            {LIBELLES.catalogue.pageSur(data.page, data.totalPages)}
          </span>
          <Button
            variant="ghost"
            className="min-h-11"
            disabled={data.page >= data.totalPages}
            onClick={() => setNumeroPage((n) => n + 1)}
          >
            {LIBELLES.catalogue.pageSuivante}
          </Button>
        </div>
      )}
    </div>
  );
}
