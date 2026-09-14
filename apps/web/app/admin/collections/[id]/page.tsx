'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { LIBELLES } from '@/lib/libelles';
import { getToken } from '@/lib/session';
import { Alert, Badge, Button, Card, Input, Textarea } from '@/components/ui';
import { Combobox } from '@/components/ui/combobox';

interface CollectionTitleItem {
  id: string;
  titleId: string | null;
  recordId: string | null;
  title: { title: string; author: string } | null;
}

interface CollectionDetail {
  id: string;
  name: string;
  description: string | null;
  type: 'INTERNAL' | 'COMMERCIAL' | 'EXTERNAL';
  titles: CollectionTitleItem[];
}

interface AccessRule {
  id: string;
  className: string | null;
  subscriptionTier: string | null;
}

interface SearchHit {
  id: string;
  title: string;
  author: string | null;
}

/**
 * Titre d'un document local dont on n'a que l'identifiant.
 *
 * ⚠ `GET /collections/documents/:recordId`, DERRIÈRE `collections.gerer` — la
 * permission de cet écran. Elle rend l'identifiant et le titre, rien d'autre.
 *
 * L'histoire vaut d'être gardée, parce qu'elle s'est jouée en un jour :
 * l'écran appelait `/cataloging/records/:id`, ouverte à tout compte
 * authentifié ; le backend l'a fermée derrière `catalogue.gerer`, et un rôle
 * portant `collections.gerer` sans `catalogue.gerer` — ce que la maquette
 * prévoit pour le Bibliothécaire — s'est retrouvé avec un 403 ici. La réponse
 * n'a pas été d'élargir un droit, mais d'exposer le strict nécessaire derrière
 * celui qu'on a déjà.
 *
 * ⚠ ELLE NE PORTE PAS L'AUTEUR, et l'écran n'affiche donc plus
 * « Titre — Auteur ». Mesuré avant de l'accepter : sur les 352 notices du fonds,
 * ZÉRO titre est porté par plus d'une notice — le titre seul désigne le
 * document. Ce qui ferait revenir sur cette décision est une mesure, pas une
 * intuition : un catalogue réel où deux notices partagent un titre (deux
 * éditions, un volume de série).
 *
 * TROIS ÉTATS, ET NON DEUX. L'écriture précédente rendait `null` aussi bien
 * pendant le chargement qu'en cas d'échec, et l'appelant affichait « … » pour
 * les deux : une panne s'écrivait donc comme un chargement, et les points de
 * suspension restaient là pour toujours. Un échec se DIT.
 *
 * Une route dédiée au titre, couverte par `collections.gerer`, est attendue
 * côté API ; elle remplacera cet appel.
 */
type EtatTitre = { etat: 'chargement' } | { etat: 'connu'; label: string } | { etat: 'echec' };

function useRecordTitle(recordId: string | null): EtatTitre {
  const [etat, setEtat] = useState<EtatTitre>({ etat: 'chargement' });
  useEffect(() => {
    if (!recordId) return;
    setEtat({ etat: 'chargement' });
    api<{ id: string; title: string }>(
      `/collections/documents/${encodeURIComponent(recordId)}`,
      {},
      getToken(),
    )
      .then((r) => setEtat({ etat: 'connu', label: r.title }))
      .catch(() => setEtat({ etat: 'echec' }));
  }, [recordId]);
  return etat;
}

function RecordRow({ item, onRemove }: { item: CollectionTitleItem; onRemove: () => void }) {
  const titreLocal = useRecordTitle(item.recordId);
  const label = item.title
    ? `${item.title.title} — ${item.title.author}`
    : titreLocal.etat === 'connu'
      ? titreLocal.label
      : titreLocal.etat === 'chargement'
        ? LIBELLES.commun.chargement
        : LIBELLES.collections.titreIndisponible;
  return (
    <Card className="flex items-center justify-between !p-3 text-sm">
      <div>
        <span>{label}</span>
        <Badge tone={item.recordId ? 'ocre' : 'neutral'}>
          {item.recordId ? 'document local' : 'catalogue commercial'}
        </Badge>
      </div>
      <Button variant="ghost" onClick={onRemove}>
        Retirer
      </Button>
    </Card>
  );
}

export default function CollectionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [collection, setCollection] = useState<CollectionDetail | null>(null);
  const [rules, setRules] = useState<AccessRule[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);

  const [ruleForm, setRuleForm] = useState({ className: '', subscriptionTier: '' });
  // Référentiels des règles : classes RÉELLES et paliers effectivement portés
  // par des comptes. Sans eux, le formulaire laissait taper n'importe quoi et
  // la règle ne correspondait alors à personne, en silence.
  const [ruleOptions, setRuleOptions] = useState<{
    classes: { name: string; label: string | null }[];
    tiers: string[];
  }>({ classes: [], tiers: [] });
  const [savingRule, setSavingRule] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', description: '' });
  const [savingEdit, setSavingEdit] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [c, r] = await Promise.all([
        api<CollectionDetail>(`/collections/${id}`, {}, getToken()),
        api<AccessRule[]>(`/collections/${id}/access-rules`, {}, getToken()),
      ]);
      setCollection(c);
      setRules(r);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Chargement impossible.');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Référentiels des règles, chargés une fois : listes courtes, filtrées
  // localement (tolérance aux accents incluse) — pas d'aller-retour par frappe.
  useEffect(() => {
    api<{ classes: { name: string; label: string | null }[]; tiers: string[] }>(
      '/collections/rule-options',
      {},
      getToken(),
    )
      .then(setRuleOptions)
      .catch(() => setRuleOptions({ classes: [], tiers: [] }));
  }, []);

  // Recherche débouncée dans le catalogue (index public Meilisearch, réutilisé
  // tel quel — aucun nouvel endpoint de recherche).
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      api<{ hits: SearchHit[] }>(`/opac/search?q=${encodeURIComponent(query)}&limit=8`)
        .then((r) => setResults(r.hits))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  function startEdit() {
    if (!collection) return;
    setEditForm({ name: collection.name, description: collection.description ?? '' });
    setEditing(true);
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    setSavingEdit(true);
    setNotice(null);
    setError(null);
    try {
      await api(
        `/collections/${id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            name: editForm.name,
            description: editForm.description,
          }),
        },
        getToken(),
      );
      setNotice('Collection mise à jour.');
      setEditing(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Modification impossible.');
    } finally {
      setSavingEdit(false);
    }
  }

  async function addRecord(recordId: string, title: string) {
    setNotice(null);
    setError(null);
    try {
      await api(
        `/collections/${id}/records`,
        { method: 'POST', body: JSON.stringify({ recordId }) },
        getToken(),
      );
      setNotice(`« ${title} » ajouté à la collection.`);
      setQuery('');
      setResults([]);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ajout impossible.');
    }
  }

  async function removeRecord(recordId: string) {
    setNotice(null);
    setError(null);
    try {
      await api(`/collections/${id}/records/${recordId}`, { method: 'DELETE' }, getToken());
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Retrait impossible.');
    }
  }

  async function removeTitle(titleId: string) {
    setNotice(null);
    setError(null);
    try {
      await api(`/collections/${id}/titles/${titleId}`, { method: 'DELETE' }, getToken());
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Retrait impossible.');
    }
  }

  async function addRule(event: FormEvent) {
    event.preventDefault();
    setSavingRule(true);
    setNotice(null);
    setError(null);
    try {
      await api(
        `/collections/${id}/access-rules`,
        {
          method: 'POST',
          body: JSON.stringify({
            className: ruleForm.className.trim() || undefined,
            subscriptionTier: ruleForm.subscriptionTier.trim() || undefined,
          }),
        },
        getToken(),
      );
      setNotice('Règle d’accès ajoutée.');
      setRuleForm({ className: '', subscriptionTier: '' });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ajout impossible.');
    } finally {
      setSavingRule(false);
    }
  }

  async function removeRule(ruleId: string) {
    setNotice(null);
    setError(null);
    try {
      await api(`/collections/access-rules/${ruleId}`, { method: 'DELETE' }, getToken());
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Retrait impossible.');
    }
  }

  if (error && !collection) {
    return <Alert tone="error">{error}</Alert>;
  }
  if (!collection)
    return (
      <main className="mx-auto max-w-lg px-6 py-16 text-center">
        <p className="text-sm text-muted">{LIBELLES.chargements.collection}</p>
      </main>
    );

  return (
    <div>
      <Link href="/admin/collections" className="text-sm text-muted hover:text-ink">
        ← Retour aux collections
      </Link>

      {editing ? (
        <Card className="mt-2">
          <h2 className="font-serif text-lg font-bold">Modifier la collection</h2>
          <form onSubmit={saveEdit} className="mt-3 flex flex-col gap-3">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Nom
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                required
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Description
              <Textarea
                rows={2}
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              />
            </label>
            <div className="flex gap-2">
              <Button type="submit" disabled={savingEdit}>
                {savingEdit ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                Annuler
              </Button>
            </div>
          </form>
        </Card>
      ) : (
        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl font-bold">{collection.name}</h1>
            {collection.description && (
              <p className="mt-1 text-sm text-muted">{collection.description}</p>
            )}
          </div>
          <Button variant="ghost" onClick={startEdit}>
            Éditer
          </Button>
        </div>
      )}

      {notice && <Alert tone="success" className="mt-4">{notice}</Alert>}
      {error && <Alert tone="error" className="mt-4">{error}</Alert>}

      <h2 className="mt-8 font-serif text-xl font-bold">
        Documents ({collection.titles.length})
      </h2>
      <p className="mt-1 text-sm text-muted">
        Recherchez un document numérisé du catalogue pour l’ajouter à cette collection.
      </p>
      <div className="relative mt-3 max-w-md">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Titre, auteur, ISBN…"
          aria-label="Rechercher un document à ajouter"
        />
        {query.trim() && (
          <div className="absolute z-10 mt-1 w-full rounded-md border border-line bg-white shadow-lg">
            {searching && <p className="px-3 py-2 text-sm text-muted">Recherche…</p>}
            {!searching && results.length === 0 && (
              <p className="px-3 py-2 text-sm text-muted">Aucun résultat.</p>
            )}
            {results.map((hit) => (
              <button
                key={hit.id}
                type="button"
                onClick={() => addRecord(hit.id, hit.title)}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-paper"
              >
                <span className="font-medium">{hit.title}</span>
                {hit.author && <span className="text-muted"> — {hit.author}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {collection.titles.length === 0 && (
          <p className="text-sm text-muted">Aucun document dans cette collection.</p>
        )}
        {collection.titles.map((item) => (
          <RecordRow
            key={item.id}
            item={item}
            onRemove={() =>
              item.recordId ? removeRecord(item.recordId) : removeTitle(item.titleId as string)
            }
          />
        ))}
      </div>

      {/* `{rules?.length ?? 0}` annonçait « Règles d'accès (0) » tant que le
          chargement n'avait pas abouti. Zéro règle n'est pas anodin ici : ça se
          lit « aucune restriction ». On ne met un nombre entre parenthèses que
          lorsqu'on le connaît. */}
      <h2 className="mt-8 font-serif text-xl font-bold">
        Règles d’accès{rules ? ` (${rules.length})` : ''}
      </h2>
      <p className="mt-1 text-sm text-muted">
        Un étudiant a accès dès qu’UNE règle correspond à sa classe ET son abonnement.
        Champ vide = joker (toutes les classes, ou tous les abonnements).
      </p>

      <form onSubmit={addRule} className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Classe (optionnel)
          <Combobox
            id="rule-class"
            value={ruleForm.className}
            onChange={(v) => setRuleForm({ ...ruleForm, className: v })}
            options={ruleOptions.classes.map((c) => ({ value: c.name, label: c.label }))}
            emptyLabel="Toutes les classes (joker)"
            placeholder="Toutes les classes"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Palier d’abonnement (optionnel)
          <Combobox
            id="rule-tier"
            value={ruleForm.subscriptionTier}
            onChange={(v) => setRuleForm({ ...ruleForm, subscriptionTier: v })}
            options={ruleOptions.tiers.map((t) => ({ value: t }))}
            emptyLabel="Tous les abonnements (joker)"
            placeholder="Tous les abonnements"
          />
        </label>
        <Button type="submit" disabled={savingRule}>
          {savingRule ? 'Ajout…' : 'Ajouter la règle'}
        </Button>
      </form>

      <div className="mt-4 flex flex-col gap-2">
        {rules?.length === 0 && (
          <p className="text-sm text-muted">
            Aucune règle : ce document n’est accessible à personne pour l’instant.
          </p>
        )}
        {rules?.map((rule) => (
          <Card key={rule.id} className="flex items-center justify-between !p-3 text-sm">
            <div className="flex gap-2">
              <Badge tone="ocre">{rule.className ?? 'Toutes classes'}</Badge>
              <Badge tone="neutral">{rule.subscriptionTier ?? 'Tous abonnements'}</Badge>
            </div>
            <Button variant="ghost" onClick={() => removeRule(rule.id)}>
              Supprimer
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
