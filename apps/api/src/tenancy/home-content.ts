/**
 * Modèle de contenu de la page d'accueil vitrine (spec docs/spec-accueil-tenant.md §2).
 *
 * Stocké en JSON dans TenantSettings.homepageContent (schéma public, par
 * tenant). Chaque section est OPTIONNELLE : une liste vide n'est pas rendue
 * (décidé côté gabarit à l'étape 3). Les libellés de section (« Nos espaces »,
 * « Services aux usagers »…) sont dans le gabarit, pas ici — le contenu
 * éditable correspond exactement aux blocs de la spec §2.
 *
 * Deux fonctions encadrent les I/O :
 *  - normalizeHomeContent : LECTURE — garantit une forme complète (tous les
 *    champs présents, listes = tableaux) quel que soit l'état en base.
 *  - sanitizeHomeContentInput : ÉCRITURE — liste blanche des champs, coupe les
 *    longueurs et les cardinalités, valide les énumérations. Empêche d'écrire
 *    des clés/valeurs arbitraires ou démesurées dans le JSON.
 */

export interface HomeIdentity {
  fullName: string; // nom complet ("Bibliothèque Universitaire Centrale")
  acronym: string; // sigle ("BUC")
  brandMark: string; // texte de la pastille ronde ("BU")
  subtitle: string; // nom de l'université
  tagline: string; // eyebrow du hero
  heroTitle: string; // accroche, début ("Un lieu,")
  heroTitleAccent: string; // fin mise en valeur par --accent ("mille savoirs.")
  lead: string; // paragraphe de présentation
  searchHint: string; // ligne sous la barre de recherche
  logoUrl: string | null; // image logo (MinIO) — remplace la pastille si présent
  heroImageUrl: string | null; // photo du hero (MinIO) — remplace le dégradé
  heroImageKicker: string; // sur-titre mono de la photo
  heroImageCaption: string; // légende de la photo
}

export interface HomeStat {
  value: string;
  label: string;
}
export interface HomeEspace {
  icon: string;
  title: string;
  tag: string;
  description: string;
}
export interface HomeHoursLine {
  label: string;
  value: string;
}
export interface HomeHours {
  note: string;
  lines: HomeHoursLine[];
}
export type ResourceStatus = 'live' | 'maint' | 'off';
export interface HomeResource {
  name: string;
  description: string;
  status: ResourceStatus;
  statusLabel: string;
  url: string;
}
export interface HomeSocial {
  label: string;
  url: string;
}
export interface HomeContact {
  description: string;
  partnerNote: string;
  address: string;
  phones: string;
  email: string;
  socials: HomeSocial[];
  copyright: string;
}

export interface HomeContent {
  identity: HomeIdentity;
  stats: HomeStat[];
  espaces: HomeEspace[];
  services: string[];
  hours: HomeHours;
  resources: HomeResource[];
  contact: HomeContact;
}

// Cardinalités maximales (spec §2 : stats 0–4 ; le reste borné pour éviter un
// JSON démesuré).
const MAX = {
  stats: 4,
  espaces: 12,
  services: 12,
  hoursLines: 12,
  resources: 12,
  socials: 8,
};
const MAX_LEN = 600; // longueur max d'un champ texte
const MAX_LEAD = 2000; // longueur max des paragraphes longs
const RESOURCE_STATUSES: ResourceStatus[] = ['live', 'maint', 'off'];

const EMPTY_IDENTITY: HomeIdentity = {
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
};

export const EMPTY_HOME_CONTENT: HomeContent = {
  identity: { ...EMPTY_IDENTITY },
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

// ── Helpers ──────────────────────────────────────────────────────────────
function str(value: unknown, max = MAX_LEN): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/**
 * URL de contenu (liens de ressources/réseaux sociaux, logo, image du hero).
 * SÉCURITÉ (audit 2026-07-14) : la page d'accueil est PUBLIQUE et rendue en SSR,
 * ces valeurs finissent dans des attributs href/src. On n'accepte donc que :
 *  - les URL absolues http/https ;
 *  - les URL RELATIVES same-origin (logo/hero téléversés → `/covers/...` ou
 *    `/api/...`), c.-à-d. commençant par UN seul « / », mais ni « // »
 *    (protocol-relative → autre hôte) ni « /\ » (contournement navigateur).
 * Tout le reste — `javascript:`, `data:`, `vbscript:`, `//evil.com`… — est
 * rejeté (chaîne vide) : ce serait un XSS stocké exécuté chez tout visiteur, ou
 * une fuite vers un hôte tiers. Appliqué à l'écriture ET à la lecture
 * (normalizeHomeContent).
 *
 * Régression 2026-07-16 : la version précédente n'acceptait QUE l'absolu → elle
 * vidait les URL relatives des images téléversées (logo/photo hero disparus).
 */
function safeUrl(value: unknown, max = 1000): string {
  const s = str(value, max);
  if (s === '') return '';
  // Relative same-origin : un seul « / » initial, ni « // » ni « /\ ».
  if (s.startsWith('/') && s[1] !== '/' && s[1] !== '\\') return s;
  try {
    const parsed = new URL(s);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return s;
  } catch {
    // Ni relative same-origin, ni URL absolue valide → rejetée.
  }
  return '';
}
function nullableUrl(value: unknown): string | null {
  const s = safeUrl(value, 1000);
  return s.length > 0 ? s : null;
}
function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

// ── LECTURE : forme complète garantie ─────────────────────────────────────
export function normalizeHomeContent(stored: unknown): HomeContent {
  const src = asObject(stored);
  const id = asObject(src.identity);
  const hours = asObject(src.hours);
  const contact = asObject(src.contact);

  return {
    identity: {
      fullName: str(id.fullName),
      acronym: str(id.acronym, 40),
      brandMark: str(id.brandMark, 8),
      subtitle: str(id.subtitle),
      tagline: str(id.tagline),
      heroTitle: str(id.heroTitle),
      heroTitleAccent: str(id.heroTitleAccent),
      lead: str(id.lead, MAX_LEAD),
      searchHint: str(id.searchHint),
      logoUrl: nullableUrl(id.logoUrl),
      heroImageUrl: nullableUrl(id.heroImageUrl),
      heroImageKicker: str(id.heroImageKicker),
      heroImageCaption: str(id.heroImageCaption),
    },
    stats: asArray(src.stats)
      .slice(0, MAX.stats)
      .map((s) => {
        const o = asObject(s);
        return { value: str(o.value, 40), label: str(o.label) };
      }),
    espaces: asArray(src.espaces)
      .slice(0, MAX.espaces)
      .map((e) => {
        const o = asObject(e);
        return {
          icon: str(o.icon, 16),
          title: str(o.title),
          tag: str(o.tag),
          description: str(o.description, MAX_LEAD),
        };
      }),
    services: asArray(src.services)
      .slice(0, MAX.services)
      .map((s) => str(s))
      .filter((s) => s.length > 0),
    hours: {
      note: str(hours.note, MAX_LEAD),
      lines: asArray(hours.lines)
        .slice(0, MAX.hoursLines)
        .map((l) => {
          const o = asObject(l);
          return { label: str(o.label), value: str(o.value) };
        }),
    },
    resources: asArray(src.resources)
      .slice(0, MAX.resources)
      .map((r) => {
        const o = asObject(r);
        const status = str(o.status, 8) as ResourceStatus;
        return {
          name: str(o.name),
          description: str(o.description),
          status: RESOURCE_STATUSES.includes(status) ? status : 'live',
          statusLabel: str(o.statusLabel, 40),
          url: safeUrl(o.url),
        };
      }),
    contact: {
      description: str(contact.description, MAX_LEAD),
      partnerNote: str(contact.partnerNote),
      address: str(contact.address),
      phones: str(contact.phones),
      email: str(contact.email),
      socials: asArray(contact.socials)
        .slice(0, MAX.socials)
        .map((s) => {
          const o = asObject(s);
          return { label: str(o.label), url: safeUrl(o.url) };
        }),
      copyright: str(contact.copyright),
    },
  };
}

/**
 * ÉCRITURE : on repasse par normalizeHomeContent — la valeur stockée est donc
 * toujours propre, bornée et sans clé parasite (la normalisation ne recopie
 * que les champs connus).
 */
export function sanitizeHomeContentInput(input: unknown): HomeContent {
  return normalizeHomeContent(input);
}
