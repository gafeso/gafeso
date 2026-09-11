'use client';

// Administration → Page d'accueil (spec docs/spec-accueil-tenant.md §5).
// Édite le contenu, le thème (couleurs + motif) et les images de la vitrine.
// Réservé à etablissement.apparence (l'API revérifie). À la sauvegarde : PATCH
// /tenancy/settings puis purge du cache SSR de l'accueil (POST /revalidate).

import { FormEvent, useCallback, useEffect, useState } from 'react';
import type { HomeContent } from '@/lib/server-api';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/session';
import { useMyFunctions } from '@/lib/functions';
import { Alert, Button, Card, Input, Textarea } from '@/components/ui';
import { LIBELLES } from '@/lib/libelles';
import { MAX_DIAPOSITIVES } from '@/lib/hero-slides';

// Défauts des tokens vitrine (miroir de home-theme.ts côté API) — pour le
// bouton « réinitialiser ».
const T = LIBELLES.adminBandeau;

const DEFAULT_TOKENS: Record<string, string> = {
  accent: '#C1592C',
  accentSoft: '#E8B98C',
  primaryDark: '#083F24',
  highlight: '#D9A441',
  bg: '#F1E7D2',
  bgDeep: '#E7D9BB',
  surface: '#FBF6EA',
  text: '#221C13',
  textSoft: '#4A4030',
  danger: '#9E2B2B',
};

// Libellés des color pickers. --primary est en tête : c'est la couleur
// principale PARTAGÉE avec l'application (primaryColor de l'établissement).
const TOKEN_FIELDS: { key: string; label: string; shared?: boolean }[] = [
  { key: 'primary', label: 'Couleur principale (partagée avec l’application)', shared: true },
  { key: 'accent', label: 'Accent chaud' },
  { key: 'accentSoft', label: 'Accent clair (dégradés)' },
  { key: 'primaryDark', label: 'Principale foncée (footer)' },
  { key: 'highlight', label: 'Touches (numéros, titres footer)' },
  { key: 'bg', label: 'Fond de page' },
  { key: 'bgDeep', label: 'Fond des sections alternées' },
  { key: 'surface', label: 'Surface (cartes, header)' },
  { key: 'text', label: 'Texte principal' },
  { key: 'textSoft', label: 'Texte secondaire' },
  { key: 'danger', label: 'Statut négatif' },
];

const EMPTY_CONTENT: HomeContent = {
  identity: {
    fullName: '',
    acronym: '',
    brandMark: '',
    subtitle: '',
    tagline: '',
    heroTitle: '',
    heroTitleAccent: '',
    lead: '',
    searchHint: '',
    logoUrl: null,
    heroImageUrl: null,
    heroImageKicker: '',
    heroImageCaption: '',
    heroSlides: [],
  },
  stats: [],
  espaces: [],
  services: [],
  hours: { note: '', lines: [] },
  resources: [],
  contact: {
    description: '',
    partnerNote: '',
    address: '',
    phones: '',
    email: '',
    socials: [],
    copyright: '',
  },
};

// ── Helpers de liste (réordonnancement / ajout / suppression) ──
function move<T>(arr: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const copy = [...arr];
  [copy[i], copy[j]] = [copy[j], copy[i]];
  return copy;
}
function removeAt<T>(arr: T[], i: number): T[] {
  return arr.filter((_, k) => k !== i);
}

/** Boutons ↑ ↓ ✕ d'une ligne de liste. */
function RowControls({
  onUp,
  onDown,
  onRemove,
}: {
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex shrink-0 gap-1">
      <Button type="button" variant="ghost" className="px-2 py-1" onClick={onUp} aria-label="Monter">
        ↑
      </Button>
      <Button type="button" variant="ghost" className="px-2 py-1" onClick={onDown} aria-label="Descendre">
        ↓
      </Button>
      <Button type="button" variant="ghost" className="px-2 py-1" onClick={onRemove} aria-label="Retirer">
        ✕
      </Button>
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-3 text-sm">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-12 shrink-0 rounded border border-line"
        aria-label={label}
      />
      <span className="flex-1">{label}</span>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-28 font-mono"
      />
    </label>
  );
}

export default function AdminAccueilPage() {
  const { functions } = useMyFunctions();
  const allowed = functions?.includes('etablissement.apparence');

  const [content, setContent] = useState<HomeContent>(EMPTY_CONTENT);
  const [primary, setPrimary] = useState('#0F2B46');
  const [tokens, setTokens] = useState<Record<string, string>>(DEFAULT_TOKENS);
  const [lattice, setLattice] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // `number` = index de la diapositive en cours d'envoi.
  const [uploading, setUploading] = useState<'logo' | 'hero' | number | null>(null);

  useEffect(() => {
    api<{
      primaryColor: string;
      themeTokens: Record<string, string>;
      latticeEnabled: boolean;
      content: HomeContent;
    }>('/tenancy/home', {}, getToken())
      .then((data) => {
        setContent(data.content);
        setPrimary(data.primaryColor);
        setTokens({ ...DEFAULT_TOKENS, ...data.themeTokens });
        setLattice(data.latticeEnabled);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Chargement impossible.'));
  }, []);

  const setId = useCallback(
    <K extends keyof HomeContent['identity']>(key: K, value: HomeContent['identity'][K]) => {
      setContent((c) => ({ ...c, identity: { ...c.identity, [key]: value } }));
    },
    [],
  );

  /** Envoie un fichier et REND son URL — l'appelant décide où la poser. */
  async function uploadImage(
    kind: 'logo' | 'hero',
    file: File,
    marqueur: 'logo' | 'hero' | number = kind,
  ): Promise<string | null> {
    setUploading(marqueur);
    setError(null);
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('kind', kind);
      const res = await fetch('/api/tenancy/settings/image', {
        method: 'POST',
        credentials: 'same-origin', // auth via cookie httpOnly bc_token
        body,
      });
      if (!res.ok) {
        const msg = await res.json().catch(() => null);
        throw new Error(msg?.message ?? 'Envoi impossible.');
      }
      const { url } = (await res.json()) as { url: string };
      return url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Envoi impossible.');
      // `null` explicite : l'appelant ne doit pas poser d'URL sur un échec.
      return null;
    } finally {
      setUploading(null);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      await api(
        '/tenancy/settings',
        {
          method: 'PATCH',
          body: JSON.stringify({
            primaryColor: primary,
            themeTokens: tokens,
            latticeEnabled: lattice,
            homepageContent: content,
          }),
        },
        getToken(),
      );
      // Purge le cache SSR de l'accueil pour que la modif soit visible au refresh.
      await fetch('/revalidate', { method: 'POST' }).catch(() => null);
      setNotice('Page d’accueil enregistrée.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  }

  if (functions && !allowed) {
    return (
      <Alert tone="error">
        Vous n’avez pas la permission de modifier l’apparence de l’établissement
            (fonction «&nbsp;etablissement.apparence&nbsp;»).
      </Alert>
    );
  }

  const id = content.identity;

  return (
    <form onSubmit={save} className="flex flex-col gap-6 pb-16">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-2xl font-bold">Page d’accueil</h1>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={() => window.open('/', '_blank')}>
            Prévisualiser
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </div>

      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      {/* ── Identité ── */}
      <Card>
        <h2 className="mb-3 font-serif text-lg font-bold">Identité</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nom complet" value={id.fullName} onChange={(v) => setId('fullName', v)} />
          <Field label="Sigle" value={id.acronym} onChange={(v) => setId('acronym', v)} />
          <Field label="Pastille (2 lettres)" value={id.brandMark} onChange={(v) => setId('brandMark', v)} />
          <Field label="Sous-titre (université)" value={id.subtitle} onChange={(v) => setId('subtitle', v)} />
          <Field label="Eyebrow du hero" value={id.tagline} onChange={(v) => setId('tagline', v)} />
          <div />
          <Field label="Accroche — début" value={id.heroTitle} onChange={(v) => setId('heroTitle', v)} placeholder={LIBELLES.defauts.accroche} />
          <Field label="Accroche — mise en valeur" value={id.heroTitleAccent} onChange={(v) => setId('heroTitleAccent', v)} />
          <div className="col-span-2">
            <TextArea label="Paragraphe de présentation" value={id.lead} onChange={(v) => setId('lead', v)} placeholder={LIBELLES.defauts.presentation} />
          </div>
          <div className="col-span-2">
            <Field label="Indice sous la recherche" value={id.searchHint} onChange={(v) => setId('searchHint', v)}  placeholder={LIBELLES.defauts.indiceRecherche} />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4">
          <ImageField
            label="Logo"
            url={id.logoUrl}
            uploading={uploading === 'logo'}
            onUpload={async (f) => {
              const url = await uploadImage('logo', f);
              if (url) setId('logoUrl', url);
            }}
            onClear={() => setId('logoUrl', null)}
          />
        </div>
      </Card>

      {/* ── Bandeau : diapositives ── */}
      <Card className="mt-4">
        <h2 className="font-serif text-lg font-bold">{T.titre}</h2>
        <p className="mt-1 text-sm text-muted">{T.ordreCompte}</p>
        <p className="mt-1 text-xs text-muted">{T.limite(MAX_DIAPOSITIVES)}</p>

        <div className="mt-4 flex flex-col gap-4">
          {id.heroSlides.map((slide, i) => (
            <div key={i} className="rounded-lg border border-line p-3">
              <div className="flex items-center justify-between gap-3">
                <b className="text-sm">
                  {T.diapositive(i + 1)}
                  {/* ⚠ Écrit à l'écran, pas deviné : c'est l'information qui
                      décide de ce que voit un téléphone. */}
                  {i === 0 && (
                    <span className="ml-2 rounded bg-ocre/15 px-2 py-0.5 text-[11px] font-semibold text-ocre">
                      {T.premiereMobile}
                    </span>
                  )}
                </b>
                <RowControls
                  onUp={() => setId('heroSlides', move(id.heroSlides, i, -1))}
                  onDown={() => setId('heroSlides', move(id.heroSlides, i, 1))}
                  onRemove={() => setId('heroSlides', removeAt(id.heroSlides, i))}
                />
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <ImageField
                  label={T.image}
                  url={slide.imageUrl || null}
                  uploading={uploading === i}
                  onUpload={async (f) => {
                    const url = await uploadImage('hero', f, i);
                    if (url) {
                      setId(
                        'heroSlides',
                        id.heroSlides.map((d, k) => (k === i ? { ...d, imageUrl: url } : d)),
                      );
                    }
                  }}
                  onClear={() =>
                    setId(
                      'heroSlides',
                      id.heroSlides.map((d, k) => (k === i ? { ...d, imageUrl: '' } : d)),
                    )
                  }
                />
                <div className="flex flex-col gap-3">
                  <Field
                    label={T.titreChamp}
                    value={slide.titre}
                    onChange={(v) =>
                      setId(
                        'heroSlides',
                        id.heroSlides.map((d, k) => (k === i ? { ...d, titre: v } : d)),
                      )
                    }
                  />
                  <Field
                    label={T.surtitreChamp}
                    value={slide.surtitre}
                    onChange={(v) =>
                      setId(
                        'heroSlides',
                        id.heroSlides.map((d, k) => (k === i ? { ...d, surtitre: v } : d)),
                      )
                    }
                  />
                </div>
              </div>

              {/* L'image est OBLIGATOIRE : on le dit tout de suite, plutôt que
                  de laisser la diapositive disparaître en silence à l'écran. */}
              {!slide.imageUrl && (
                <p role="alert" className="mt-2 text-xs text-red-800">
                  {T.imageObligatoire}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* La limite se DIT, elle ne se découvre pas au refus. */}
        {id.heroSlides.length < MAX_DIAPOSITIVES ? (
          <Button
            type="button"
            variant="ghost"
            className="mt-3"
            onClick={() =>
              setId('heroSlides', [...id.heroSlides, { imageUrl: '', titre: '', surtitre: '' }])
            }
          >
            {T.ajouter}
          </Button>
        ) : (
          <p className="mt-3 text-xs text-muted">{T.limiteAtteinte(MAX_DIAPOSITIVES)}</p>
        )}

        {/* ⚠ REPRISE d'une configuration à image unique — visible et NON
            destructive. On ne migre jamais tout seul : l'API reconstruit déjà
            une diapositive à la volée, sans rien écrire. Une migration
            implicite s'inscrirait dans les données du client au premier
            enregistrement d'un champ sans rapport. */}
        {id.heroImageUrl && id.heroSlides.length === 0 && (
          <div className="mt-4 rounded-lg border border-ocre/50 bg-ocre/5 p-3">
            <b className="text-sm">{T.ancienneTitre}</b>
            <p className="mt-1 text-sm text-muted">{T.ancienneExplication}</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={id.heroImageUrl}
              alt=""
              className="mt-2 max-h-24 w-auto rounded border border-line object-contain"
            />
            <Button
              type="button"
              variant="ghost"
              className="mt-2"
              onClick={() =>
                setId('heroSlides', [
                  {
                    imageUrl: id.heroImageUrl ?? '',
                    titre: id.heroImageCaption,
                    surtitre: id.heroImageKicker,
                  },
                ])
              }
            >
              {T.ancienneReprendre}
            </Button>
          </div>
        )}

        {/* Une fois la liste peuplée, les trois champs historiques n'ont plus
            AUCUN effet : on ne les affiche donc plus comme des champs. On dit
            qu'ils existent encore, et on laisse leur suppression au seul
            geste explicite — effacer les données d'un client ne se fait pas
            en passant. */}
        {id.heroImageUrl && id.heroSlides.length > 0 && (
          <div className="mt-4 rounded-lg border border-line bg-paper/60 p-3">
            <b className="text-sm">{T.ancienneInactiveTitre}</b>
            <p className="mt-1 text-sm text-muted">{T.ancienneInactive}</p>
            <Button
              type="button"
              variant="ghost"
              className="mt-2"
              onClick={() => {
                setId('heroImageUrl', null);
                setId('heroImageKicker', '');
                setId('heroImageCaption', '');
              }}
            >
              {T.ancienneSupprimer}
            </Button>
          </div>
        )}
      </Card>

      {/* ── Statistiques ── */}
      <Card>
        <SectionHead title="Statistiques (0–4)" onAdd={() =>
          setContent((c) => (c.stats.length >= 4 ? c : { ...c, stats: [...c.stats, { value: '', label: '' }] }))
        } />
        <div className="flex flex-col gap-2">
          {content.stats.map((stat, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input className="w-32" placeholder="400" value={stat.value}
                onChange={(e) => setContent((c) => ({ ...c, stats: c.stats.map((s, k) => (k === i ? { ...s, value: e.target.value } : s)) }))} />
              <Input className="flex-1" placeholder="Places · grande salle" value={stat.label}
                onChange={(e) => setContent((c) => ({ ...c, stats: c.stats.map((s, k) => (k === i ? { ...s, label: e.target.value } : s)) }))} />
              <RowControls
                onUp={() => setContent((c) => ({ ...c, stats: move(c.stats, i, -1) }))}
                onDown={() => setContent((c) => ({ ...c, stats: move(c.stats, i, 1) }))}
                onRemove={() => setContent((c) => ({ ...c, stats: removeAt(c.stats, i) }))}
              />
            </div>
          ))}
        </div>
      </Card>

      {/* ── Espaces ── */}
      <Card>
        <SectionHead title="Espaces" onAdd={() =>
          setContent((c) => ({ ...c, espaces: [...c.espaces, { icon: '', title: '', tag: '', description: '' }] }))
        } />
        <div className="flex flex-col gap-3">
          {content.espaces.map((espace, i) => (
            <div key={i} className="flex items-start gap-2 border-b border-line pb-3 last:border-0">
              <Input className="w-16" placeholder="📖" value={espace.icon}
                onChange={(e) => setContent((c) => ({ ...c, espaces: c.espaces.map((x, k) => (k === i ? { ...x, icon: e.target.value } : x)) }))} />
              <div className="flex flex-1 flex-col gap-2">
                <div className="flex gap-2">
                  <Input className="flex-1" placeholder="Titre" value={espace.title}
                    onChange={(e) => setContent((c) => ({ ...c, espaces: c.espaces.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)) }))} />
                  <Input className="w-56" placeholder="Capacité / tag" value={espace.tag}
                    onChange={(e) => setContent((c) => ({ ...c, espaces: c.espaces.map((x, k) => (k === i ? { ...x, tag: e.target.value } : x)) }))} />
                </div>
                <Input placeholder="Description" value={espace.description}
                  onChange={(e) => setContent((c) => ({ ...c, espaces: c.espaces.map((x, k) => (k === i ? { ...x, description: e.target.value } : x)) }))} />
              </div>
              <RowControls
                onUp={() => setContent((c) => ({ ...c, espaces: move(c.espaces, i, -1) }))}
                onDown={() => setContent((c) => ({ ...c, espaces: move(c.espaces, i, 1) }))}
                onRemove={() => setContent((c) => ({ ...c, espaces: removeAt(c.espaces, i) }))}
              />
            </div>
          ))}
        </div>
      </Card>

      {/* ── Services ── */}
      <Card>
        <SectionHead title="Services" onAdd={() => setContent((c) => ({ ...c, services: [...c.services, ''] }))} />
        <div className="flex flex-col gap-2">
          {content.services.map((service, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-6 font-mono text-xs text-muted">{String(i + 1).padStart(2, '0')}</span>
              <Input className="flex-1" placeholder="Intitulé du service" value={service}
                onChange={(e) => setContent((c) => ({ ...c, services: c.services.map((s, k) => (k === i ? e.target.value : s)) }))} />
              <RowControls
                onUp={() => setContent((c) => ({ ...c, services: move(c.services, i, -1) }))}
                onDown={() => setContent((c) => ({ ...c, services: move(c.services, i, 1) }))}
                onRemove={() => setContent((c) => ({ ...c, services: removeAt(c.services, i) }))}
              />
            </div>
          ))}
        </div>
      </Card>

      {/* ── Horaires ── */}
      <Card>
        <SectionHead title="Horaires" onAdd={() =>
          setContent((c) => ({ ...c, hours: { ...c.hours, lines: [...c.hours.lines, { label: '', value: '' }] } }))
        } />
        <div className="flex flex-col gap-2">
          {content.hours.lines.map((line, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input className="flex-1" placeholder="Lundi – Vendredi" value={line.label}
                onChange={(e) => setContent((c) => ({ ...c, hours: { ...c.hours, lines: c.hours.lines.map((l, k) => (k === i ? { ...l, label: e.target.value } : l)) } }))} />
              <Input className="w-40" placeholder="7h30 – 19h30" value={line.value}
                onChange={(e) => setContent((c) => ({ ...c, hours: { ...c.hours, lines: c.hours.lines.map((l, k) => (k === i ? { ...l, value: e.target.value } : l)) } }))} />
              <RowControls
                onUp={() => setContent((c) => ({ ...c, hours: { ...c.hours, lines: move(c.hours.lines, i, -1) } }))}
                onDown={() => setContent((c) => ({ ...c, hours: { ...c.hours, lines: move(c.hours.lines, i, 1) } }))}
                onRemove={() => setContent((c) => ({ ...c, hours: { ...c.hours, lines: removeAt(c.hours.lines, i) } }))}
              />
            </div>
          ))}
        </div>
        <div className="mt-3">
          <TextArea label="Note (optionnelle)" value={content.hours.note}
            onChange={(v) => setContent((c) => ({ ...c, hours: { ...c.hours, note: v } }))} />
        </div>
      </Card>

      {/* ── Ressources ── */}
      <Card>
        <SectionHead title="Accès aux ressources" onAdd={() =>
          setContent((c) => ({ ...c, resources: [...c.resources, { name: '', description: '', status: 'live', statusLabel: '', url: '' }] }))
        } />
        <div className="flex flex-col gap-3">
          {content.resources.map((resource, i) => (
            <div key={i} className="flex items-start gap-2 border-b border-line pb-3 last:border-0">
              <div className="flex flex-1 flex-col gap-2">
                <div className="flex gap-2">
                  <Input className="flex-1" placeholder="Nom" value={resource.name}
                    onChange={(e) => setContent((c) => ({ ...c, resources: c.resources.map((r, k) => (k === i ? { ...r, name: e.target.value } : r)) }))} />
                  <select className="w-32 rounded-md border border-line bg-white px-2 text-sm" value={resource.status}
                    onChange={(e) => setContent((c) => ({ ...c, resources: c.resources.map((r, k) => (k === i ? { ...r, status: e.target.value as 'live' | 'maint' | 'off' } : r)) }))}>
                    <option value="live">Disponible</option>
                    <option value="maint">Remplacé</option>
                    <option value="off">Hors ligne</option>
                  </select>
                  <Input className="w-40" placeholder="Libellé statut" value={resource.statusLabel}
                    onChange={(e) => setContent((c) => ({ ...c, resources: c.resources.map((r, k) => (k === i ? { ...r, statusLabel: e.target.value } : r)) }))} />
                </div>
                <Input placeholder="Description" value={resource.description}
                  onChange={(e) => setContent((c) => ({ ...c, resources: c.resources.map((r, k) => (k === i ? { ...r, description: e.target.value } : r)) }))} />
                <Input placeholder="URL (optionnelle)" value={resource.url}
                  onChange={(e) => setContent((c) => ({ ...c, resources: c.resources.map((r, k) => (k === i ? { ...r, url: e.target.value } : r)) }))} />
              </div>
              <RowControls
                onUp={() => setContent((c) => ({ ...c, resources: move(c.resources, i, -1) }))}
                onDown={() => setContent((c) => ({ ...c, resources: move(c.resources, i, 1) }))}
                onRemove={() => setContent((c) => ({ ...c, resources: removeAt(c.resources, i) }))}
              />
            </div>
          ))}
        </div>
      </Card>

      {/* ── Contact & footer ── */}
      <Card>
        <h2 className="mb-3 font-serif text-lg font-bold">Contact & footer</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <TextArea label="Présentation (footer)" value={content.contact.description}
              onChange={(v) => setContent((c) => ({ ...c, contact: { ...c.contact, description: v } }))} />
          </div>
          <Field label="Mention partenaire" value={content.contact.partnerNote}
            onChange={(v) => setContent((c) => ({ ...c, contact: { ...c.contact, partnerNote: v } }))} />
          <Field label="Email" value={content.contact.email}
            onChange={(v) => setContent((c) => ({ ...c, contact: { ...c.contact, email: v } }))} />
          <Field label="Téléphone(s)" value={content.contact.phones}
            onChange={(v) => setContent((c) => ({ ...c, contact: { ...c.contact, phones: v } }))} />
          <Field label="Copyright (bas de page)" value={content.contact.copyright}
            onChange={(v) => setContent((c) => ({ ...c, contact: { ...c.contact, copyright: v } }))} />
          <div className="col-span-2">
            <TextArea label="Adresse postale" value={content.contact.address}
              onChange={(v) => setContent((c) => ({ ...c, contact: { ...c.contact, address: v } }))} />
          </div>
        </div>
        <div className="mt-3">
          <SectionHead title="Réseaux sociaux" onAdd={() =>
            setContent((c) => ({ ...c, contact: { ...c.contact, socials: [...c.contact.socials, { label: '', url: '' }] } }))
          } />
          <div className="flex flex-col gap-2">
            {content.contact.socials.map((social, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input className="flex-1" placeholder="Libellé" value={social.label}
                  onChange={(e) => setContent((c) => ({ ...c, contact: { ...c.contact, socials: c.contact.socials.map((s, k) => (k === i ? { ...s, label: e.target.value } : s)) } }))} />
                <Input className="flex-1" placeholder="https://…" value={social.url}
                  onChange={(e) => setContent((c) => ({ ...c, contact: { ...c.contact, socials: c.contact.socials.map((s, k) => (k === i ? { ...s, url: e.target.value } : s)) } }))} />
                <RowControls
                  onUp={() => setContent((c) => ({ ...c, contact: { ...c.contact, socials: move(c.contact.socials, i, -1) } }))}
                  onDown={() => setContent((c) => ({ ...c, contact: { ...c.contact, socials: move(c.contact.socials, i, 1) } }))}
                  onRemove={() => setContent((c) => ({ ...c, contact: { ...c.contact, socials: removeAt(c.contact.socials, i) } }))}
                />
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* ── Thème & motif ── */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-serif text-lg font-bold">Couleurs & motif</h2>
          <Button type="button" variant="ghost" onClick={() => setTokens(DEFAULT_TOKENS)}>
            Réinitialiser aux défauts
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-3">
          {TOKEN_FIELDS.map((field) =>
            field.shared ? (
              <ColorField key={field.key} label={field.label} value={primary} onChange={setPrimary} />
            ) : (
              <ColorField
                key={field.key}
                label={field.label}
                value={tokens[field.key] ?? DEFAULT_TOKENS[field.key]}
                onChange={(v) => setTokens((t) => ({ ...t, [field.key]: v }))}
              />
            ),
          )}
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={lattice} onChange={(e) => setLattice(e.target.checked)} />
          Afficher le motif décoratif (croisillons)
        </label>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={saving}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </div>
    </form>
  );
}

// ── Petits champs réutilisables ──
function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  /**
   * Défaut du PRODUIT, montré en indication de saisie — jamais en valeur.
   * En valeur, il serait enregistré au premier « Enregistrer » et deviendrait
   * le texte de l'établissement sans qu'il l'ait écrit.
   */
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium">
      {label}
      <Input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
function TextArea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  /** Défaut du produit, en indication de saisie — jamais en valeur. */
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium">
      {label}
      <Textarea rows={3} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
function SectionHead({ title, onAdd }: { title: string; onAdd: () => void }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="font-serif text-lg font-bold">{title}</h2>
      <Button type="button" variant="ghost" onClick={onAdd}>
        + Ajouter
      </Button>
    </div>
  );
}
function ImageField({
  label,
  url,
  uploading,
  onUpload,
  onClear,
}: {
  label: string;
  url: string | null;
  uploading: boolean;
  onUpload: (f: File) => void;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 text-sm font-medium">
      {label}
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={label} className="max-h-24 w-auto rounded border border-line object-contain" />
      )}
      <div className="flex items-center gap-2">
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={uploading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onUpload(file);
            e.target.value = '';
          }}
          className="text-xs"
        />
        {uploading && <span className="text-xs text-muted">Envoi…</span>}
        {url && (
          <Button type="button" variant="ghost" className="px-2 py-1 text-xs" onClick={onClear}>
            Retirer
          </Button>
        )}
      </div>
    </div>
  );
}
