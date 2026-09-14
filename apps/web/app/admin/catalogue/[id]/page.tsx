'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { LIBELLES } from '@/lib/libelles';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/session';
import { Badge, Button, Card, Input, Select, Textarea } from '@/components/ui';
import { formatTitle } from '@/lib/titles';
import { isDefenseType, RECORD_TYPES, yearLabel } from '@/lib/record-types';
import { ITEM_LOCATIONS } from '@/lib/item-locations';
import {
  ContributorRow,
  ContributorsEditor,
  emptyContributors,
  hasPrincipalAuthor,
  splitContributors,
  toApiContributors,
} from '@/components/contributors-editor';
import { KeywordsInput } from '@/components/keywords-input';

interface Item {
  id: string;
  barcode: string;
  callNumber: string | null;
  location: string | null;
  itemType: string | null;
  status: string;
}

interface Contributor {
  name: string;
  role: string;
  position: number;
}

interface RecordDetail {
  id: string;
  title: string;
  titleComplement: string | null;
  author: string | null;
  contributors: Contributor[];
  isbn: string | null;
  publishYear: number | null;
  category: string | null;
  recordType: string;
  publisher: string | null;
  publicationCity: string | null;
  defenseUniversity: string | null;
  defensePlace: string | null;
  summary: string | null;
  keywords: string[];
  items: Item[];
}

interface DigitalCopy {
  fileFormat: 'PDF' | 'EPUB';
  fileSizeBytes: number;
  originalName: string;
  uploadedAt: string;
  /**
   * État de la préparation HORS-LIGNE (chiffrement du blob).
   * L'API l'écrivait déjà en base mais ne l'affichait NULLE PART : un PDF au
   * xref cassé passait l'envoi, se lisait en ligne, et n'était jamais
   * disponible hors ligne — sans que personne l'apprenne.
   */
  encStatus?: 'ready' | 'failed' | 'pending' | null;
  encError?: string | null;
}

interface Category {
  id: string;
  name: string;
}

const ACCEPTED_DIGITAL_TYPES = '.pdf,.epub,application/pdf,application/epub+zip';

function formatFileSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
    : `${Math.round(bytes / 1024)} Ko`;
}

const STATUS_LABELS: Record<string, string> = {
  AVAILABLE: 'Disponible',
  CHECKED_OUT: 'Emprunté',
  ON_HOLD: 'Réservé',
  IN_TRANSIT: 'En transit',
  DAMAGED: 'Abîmé',
  LOST: 'Perdu',
  WITHDRAWN: 'Retiré',
};

const emptyItem = { barcode: '', callNumber: '', location: '', itemType: 'livre' };

export default function AdminRecordPage() {
  const { id } = useParams<{ id: string }>();
  const [record, setRecord] = useState<RecordDetail | null>(null);
  const [item, setItem] = useState(emptyItem);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // undefined = pas encore chargé, null = confirmé absent (404 de l'API)
  const [digitalCopy, setDigitalCopy] = useState<DigitalCopy | null | undefined>(undefined);
  const [uploading, setUploading] = useState(false);
  const [confirmDeleteCopy, setConfirmDeleteCopy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  const [editingRecord, setEditingRecord] = useState(false);
  const [recordForm, setRecordForm] = useState({
    title: '',
    titleComplement: '',
    isbn: '',
    publishYear: '',
    category: '',
    recordType: 'ouvrage',
    publisher: '',
    publicationCity: '',
    defenseUniversity: '',
    defensePlace: '',
    summary: '',
  });
  const [contributors, setContributors] = useState<ContributorRow[]>(emptyContributors());
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordSuggestions, setKeywordSuggestions] = useState<string[]>([]);
  const [savingRecord, setSavingRecord] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRecord(await api<RecordDetail>(`/cataloging/records/${id}`, {}, getToken()));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Notice indisponible.');
    }
  }, [id]);

  const loadDigitalCopy = useCallback(async () => {
    try {
      setDigitalCopy(await api<DigitalCopy>(`/cataloging/records/${id}/digital-copy`, {}, getToken()));
    } catch (err) {
      // 404 = pas (encore) de fichier attaché : état normal, pas une erreur de page.
      if (err instanceof ApiError && err.status === 404) setDigitalCopy(null);
      else setError(err instanceof ApiError ? err.message : 'Document numérique indisponible.');
    }
  }, [id]);

  useEffect(() => {
    void load();
    void loadDigitalCopy();
    api<Category[]>('/categories', {}, getToken())
      .then(setCategories)
      .catch(() => setCategories([]));
    api<{ name: string }[]>('/cataloging/keywords', {}, getToken())
      .then((list) => setKeywordSuggestions(list.map((k) => k.name)))
      .catch(() => setKeywordSuggestions([]));
  }, [load, loadDigitalCopy]);

  function startEditRecord() {
    if (!record) return;
    setRecordForm({
      title: record.title,
      titleComplement: record.titleComplement ?? '',
      isbn: record.isbn ?? '',
      publishYear: record.publishYear?.toString() ?? '',
      category: record.category ?? '',
      recordType: record.recordType,
      publisher: record.publisher ?? '',
      publicationCity: record.publicationCity ?? '',
      defenseUniversity: record.defenseUniversity ?? '',
      defensePlace: record.defensePlace ?? '',
      summary: record.summary ?? '',
    });
    // Notice d'avant la migration auteurs → contributeurs : repartir de
    // l'ancien champ auteur pour ne pas paraître effacer l'auteur existant.
    setContributors(
      record.contributors.length > 0
        ? record.contributors.map((c) => ({ name: c.name, role: c.role }))
        : record.author
          ? [{ name: record.author, role: 'AUTEUR_PRINCIPAL' }]
          : emptyContributors(),
    );
    setKeywords(record.keywords ?? []);
    setEditingRecord(true);
  }

  async function saveRecord(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    setError(null);
    // UX seulement — le serveur applique les mêmes règles de toute façon.
    if (!hasPrincipalAuthor(contributors)) {
      setError('Au moins un auteur principal est requis.');
      return;
    }
    const defense = isDefenseType(recordForm.recordType);
    if (defense && !toApiContributors(contributors).some((c) => c.role === 'DIRECTEUR_MEMOIRE')) {
      setError('Le directeur de mémoire / de thèse est requis pour une thèse ou un mémoire.');
      return;
    }
    // Règle non rétroactive en lecture, mais exigée à la modification (§4.1) :
    // une ancienne fiche sans mots-clés doit être complétée pour être enregistrée.
    if (keywords.length < 3) {
      setError('Ajoutez au moins 3 mots-clés pour enregistrer.');
      return;
    }
    setSavingRecord(true);
    try {
      await api(
        `/cataloging/records/${id}`,
        {
          method: 'PATCH',
          // Chaînes vides envoyées telles quelles : le serveur les interprète
          // comme un effacement volontaire (champs optionnels). Les champs de
          // l'AUTRE type (§3) sont explicitement effacés pour ne pas laisser
          // traîner d'anciennes valeurs après un changement de type.
          body: JSON.stringify({
            title: recordForm.title,
            titleComplement: recordForm.titleComplement,
            contributors: toApiContributors(contributors),
            keywords,
            isbn: recordForm.isbn || undefined,
            publishYear: recordForm.publishYear ? Number(recordForm.publishYear) : undefined,
            category: recordForm.category || undefined,
            recordType: recordForm.recordType,
            summary: recordForm.summary,
            ...(defense
              ? {
                  defenseUniversity: recordForm.defenseUniversity,
                  defensePlace: recordForm.defensePlace,
                  publisher: '',
                  publicationCity: '',
                }
              : {
                  publisher: recordForm.publisher,
                  publicationCity: recordForm.publicationCity,
                  defenseUniversity: '',
                  defensePlace: '',
                }),
          }),
        },
        getToken(),
      );
      setNotice('Notice mise à jour.');
      setEditingRecord(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Modification impossible.');
    } finally {
      setSavingRecord(false);
    }
  }

  async function uploadDigitalCopy(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setNotice(null);
    setError(null);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch(`/api/cataloging/records/${id}/digital-copy`, {
        method: 'POST',
        credentials: 'same-origin', // auth via cookie httpOnly bc_token
        body,
      });
      if (!res.ok) throw new Error((await res.json()).message ?? 'Envoi refusé.');
      const result = (await res.json()) as { digitalCopy: DigitalCopy };
      setDigitalCopy(result.digitalCopy);
      setNotice('Document numérique enregistré. Les champs vides de la notice ont été pré-remplis si des métadonnées ont été trouvées dans le fichier.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Envoi impossible.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function removeDigitalCopy() {
    setNotice(null);
    setError(null);
    try {
      await api(`/cataloging/records/${id}/digital-copy`, { method: 'DELETE' }, getToken());
      setDigitalCopy(null);
      setConfirmDeleteCopy(false);
      setNotice('Document numérique supprimé.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Suppression impossible.');
      setConfirmDeleteCopy(false);
    }
  }

  async function addItem(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      await api(
        `/cataloging/records/${id}/items`,
        {
          method: 'POST',
          body: JSON.stringify({
            barcode: item.barcode,
            callNumber: item.callNumber || undefined,
            location: item.location || undefined,
            itemType: item.itemType || undefined,
          }),
        },
        getToken(),
      );
      setNotice(`Exemplaire ${item.barcode} ajouté.`);
      setItem(emptyItem);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ajout impossible.');
    } finally {
      setSaving(false);
    }
  }

  async function removeItem(itemId: string, barcode: string) {
    setNotice(null);
    setError(null);
    try {
      await api(`/cataloging/items/${itemId}`, { method: 'DELETE' }, getToken());
      setNotice(`Exemplaire ${barcode} supprimé.`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Suppression impossible.');
    }
  }

  if (error && !record) {
    return (
      <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
        {error}
      </p>
    );
  }
  if (!record)
    return (
      <main className="mx-auto max-w-lg px-6 py-16 text-center">
        <p className="text-sm text-muted">{LIBELLES.chargements.notice}</p>
      </main>
    );

  return (
    <div>
      <Link href="/admin/catalogue" className="text-sm text-muted hover:text-ink">
        ← Retour au catalogue
      </Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-bold">
            {formatTitle(record.title, record.titleComplement)}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {(() => {
              const { authors, directors } = splitContributors(record.contributors);
              const names =
                authors.length > 0 ? authors.map((a) => a.name).join(' ; ') : record.author;
              return (
                <>
                  {names ?? 'Auteur inconnu'}
                  {directors.length > 0
                    ? ` · Dir. : ${directors.map((d) => d.name).join(' ; ')}`
                    : ''}
                </>
              );
            })()}
            {record.publishYear ? ` · ${record.publishYear}` : ''}
            {record.category ? ` · ${record.category}` : ''} · {record.recordType}
            {record.isbn ? ` · ISBN ${record.isbn}` : ''}
          </p>
        </div>
        {!editingRecord && (
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={`/api/cataloging/export?format=iso2709&ids=${id}`}
              download
              className="inline-flex items-center rounded-md border border-line px-3 py-2 text-sm font-medium text-ink hover:bg-line/40"
              title="Exporter cette notice en ISO 2709 (.mrc)"
            >
              MARC
            </a>
            <a
              href={`/api/cataloging/export?format=marcxchange&ids=${id}`}
              download
              className="inline-flex items-center rounded-md border border-line px-3 py-2 text-sm font-medium text-ink hover:bg-line/40"
              title="Exporter cette notice en MarcXchange (ISO 25577, UNIMARC)"
            >
              MarcXchange
            </a>
            <a
              href={`/api/cataloging/labels?recordIds=${id}`}
              download
              className="inline-flex items-center rounded-md border border-line px-3 py-2 text-sm font-medium text-ink hover:bg-line/40"
              title="Planche d’étiquettes code-barres de tous les exemplaires de cette notice"
            >
              Étiquettes
            </a>
            <Button variant="ghost" onClick={startEditRecord}>
              Modifier la notice
            </Button>
          </div>
        )}
      </div>

      {notice && (
        <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-900">{notice}</p>
      )}
      {error && (
        <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      {editingRecord && (
        <Card className="mt-4">
          <h2 className="font-serif text-lg font-bold">Modifier la notice</h2>
          <form onSubmit={saveRecord} className="mt-3 grid grid-cols-2 gap-3">
            <label className="col-span-2 flex flex-col gap-1.5 text-sm font-medium">
              Titre
              <Input
                value={recordForm.title}
                onChange={(e) => setRecordForm({ ...recordForm, title: e.target.value })}
                required
              />
            </label>
            <label className="col-span-2 flex flex-col gap-1.5 text-sm font-medium">
              Complément de titre
              <Input
                value={recordForm.titleComplement}
                onChange={(e) =>
                  setRecordForm({ ...recordForm, titleComplement: e.target.value })
                }
                placeholder="Sous-titre (optionnel) — affiché « Titre : complément »"
              />
            </label>
            <ContributorsEditor
              value={contributors}
              onChange={setContributors}
              showDirectorRole={isDefenseType(recordForm.recordType)}
            />
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              ISBN
              <Input
                value={recordForm.isbn}
                onChange={(e) => setRecordForm({ ...recordForm, isbn: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Domaine
              <Select
                value={recordForm.category}
                onChange={(e) => setRecordForm({ ...recordForm, category: e.target.value })}
              >
                <option value="">Sans domaine</option>
                {/* Notice antérieure à la liste fermée de catégories (créée avant
                    /admin/categories) : affichée telle quelle plutôt que de
                    paraître effacée, sans pour autant l'ajouter à la liste. */}
                {recordForm.category &&
                  !categories.some((c) => c.name === recordForm.category) && (
                    <option value={recordForm.category} className="capitalize">
                      {recordForm.category} (à créer dans Domaines si besoin)
                    </option>
                  )}
                {categories.map((c) => (
                  <option key={c.id} value={c.name} className="capitalize">
                    {c.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {yearLabel(recordForm.recordType)}
              <Input
                type="number"
                value={recordForm.publishYear}
                onChange={(e) => setRecordForm({ ...recordForm, publishYear: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Type
              <Select
                value={recordForm.recordType}
                onChange={(e) => setRecordForm({ ...recordForm, recordType: e.target.value })}
              >
                {RECORD_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </label>
            {/* Affichage conditionnel par type (§3) : les valeurs masquées
                restent dans l'état local — rien n'est perdu si on rebascule. */}
            {isDefenseType(recordForm.recordType) ? (
              <>
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  Université de soutenance *
                  <Input
                    value={recordForm.defenseUniversity}
                    onChange={(e) =>
                      setRecordForm({ ...recordForm, defenseUniversity: e.target.value })
                    }
                    placeholder="ex. Université d'Exemple"
                    required
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  Lieu de soutenance
                  <Input
                    value={recordForm.defensePlace}
                    onChange={(e) =>
                      setRecordForm({ ...recordForm, defensePlace: e.target.value })
                    }
                    placeholder="Ville, si distincte de l’université"
                  />
                </label>
              </>
            ) : (
              <>
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  Éditeur
                  <Input
                    value={recordForm.publisher}
                    onChange={(e) => setRecordForm({ ...recordForm, publisher: e.target.value })}
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  Ville d’édition
                  <Input
                    value={recordForm.publicationCity}
                    onChange={(e) =>
                      setRecordForm({ ...recordForm, publicationCity: e.target.value })
                    }
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
                value={recordForm.summary}
                onChange={(e) => setRecordForm({ ...recordForm, summary: e.target.value })}
              />
            </label>
            <div className="col-span-2 flex gap-2">
              <Button type="submit" disabled={savingRecord}>
                {savingRecord ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setEditingRecord(false)}>
                Annuler
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card className="mt-5">
        <h2 className="font-serif text-lg font-bold">Document numérique</h2>
        <p className="mt-1 text-sm text-muted">
          PDF ou EPUB (200 Mo maximum). Une fois attaché, « Lire en ligne » devient
          disponible sur la fiche OPAC pour les membres autorisés.
        </p>

        <input
          ref={fileRef}
          type="file"
          accept={ACCEPTED_DIGITAL_TYPES}
          onChange={uploadDigitalCopy}
          className="hidden"
        />

        {digitalCopy === undefined && (
          <p className="mt-3 text-sm text-muted">Chargement…</p>
        )}

        {digitalCopy === null && (
          <div className="mt-3">
            <Button
              variant="ghost"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? 'Envoi…' : 'Attacher un fichier'}
            </Button>
          </div>
        )}

        {digitalCopy && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-paper px-4 py-3">
            <div className="text-sm">
              <Badge tone="neutral">{digitalCopy.fileFormat}</Badge>
              <span className="ml-2 font-medium">{digitalCopy.originalName}</span>
              <span className="ml-2 text-muted">
                {formatFileSize(digitalCopy.fileSizeBytes)} · envoyé le{' '}
                {new Date(digitalCopy.uploadedAt).toLocaleDateString('fr-FR')}
              </span>
              {/*
                DISPONIBILITÉ HORS-LIGNE. Le document peut très bien se lire en
                ligne tout en étant impossible à préparer pour le hors-ligne
                (PDF au xref irréparable, par exemple). Sans cette mention, le
                bibliothécaire ne l'apprenait jamais — il le découvrait par la
                plainte d'un étudiant, des semaines plus tard.
              */}
              {digitalCopy.encStatus === 'ready' && (
                <span className="ml-2 inline-block">
                  <Badge tone="green">Hors ligne : prêt</Badge>
                </span>
              )}
              {digitalCopy.encStatus === 'failed' && (
                <span className="ml-2 inline-flex items-center gap-1">
                  <Badge tone="ocre">Hors ligne : indisponible</Badge>
                </span>
              )}
              {digitalCopy.encStatus === 'failed' && (
                <p className="mt-1 text-xs text-muted">
                  Ce document se lit en ligne, mais ne pourra pas être téléchargé sur
                  l’application mobile
                  {digitalCopy.encError ? ` (${digitalCopy.encError})` : ''}. Renvoyez un
                  fichier PDF non corrompu pour corriger.
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? 'Envoi…' : 'Remplacer'}
              </Button>
              {confirmDeleteCopy ? (
                <Button onClick={removeDigitalCopy}>Confirmer&nbsp;?</Button>
              ) : (
                <Button variant="ghost" onClick={() => setConfirmDeleteCopy(true)}>
                  Supprimer
                </Button>
              )}
            </div>
          </div>
        )}
      </Card>

      <Card className="mt-5">
        <h2 className="font-serif text-lg font-bold">Ajouter un exemplaire</h2>
        <form onSubmit={addItem} className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Code-barres
            <Input
              value={item.barcode}
              onChange={(e) => setItem({ ...item, barcode: e.target.value })}
              placeholder="ZK-000124"
              required
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Cote
            <Input
              value={item.callNumber}
              onChange={(e) => setItem({ ...item, callNumber: e.target.value })}
              placeholder="342.5 TRA"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Localisation
            <Select
              value={item.location}
              onChange={(e) => setItem({ ...item, location: e.target.value })}
              className="w-44"
            >
              <option value="">— Sans localisation —</option>
              {ITEM_LOCATIONS.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex w-28 flex-col gap-1.5 text-sm font-medium">
            Type
            <Input
              value={item.itemType}
              onChange={(e) => setItem({ ...item, itemType: e.target.value })}
            />
          </label>
          <Button type="submit" disabled={saving}>
            {saving ? 'Ajout…' : 'Ajouter'}
          </Button>
        </form>
      </Card>

      <h2 className="mt-6 font-serif text-xl font-bold">
        Exemplaires ({record.items.length})
      </h2>
      <div className="mt-2 flex flex-col gap-2">
        {record.items.length === 0 && (
          <p className="text-sm text-muted">Aucun exemplaire. Ajoutez-en un ci-dessus.</p>
        )}
        {record.items.map((it) => (
          <Card key={it.id} className="flex items-center justify-between !p-4">
            <div className="text-sm">
              <span className="font-mono font-semibold">{it.barcode}</span>
              {it.callNumber && <span className="ml-3 text-muted">{it.callNumber}</span>}
              {it.location && <span className="ml-3 text-muted">{it.location}</span>}
            </div>
            <div className="flex items-center gap-3">
              <Badge tone={it.status === 'AVAILABLE' ? 'green' : 'neutral'}>
                {STATUS_LABELS[it.status] ?? it.status}
              </Badge>
              {it.status === 'AVAILABLE' && (
                <Button variant="ghost" onClick={() => removeItem(it.id, it.barcode)}>
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
