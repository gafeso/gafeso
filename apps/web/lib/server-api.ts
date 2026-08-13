// Appels API CÔTÉ SERVEUR (Server Components) pour le rendu SSR de la page
// d'accueil. Contrairement à lib/api.ts (client, via le rewrite /api/*), on
// appelle ici l'API directement (process.env.API_URL) en propageant le
// domaine du tenant dans x-forwarded-host — c'est ainsi que le middleware de
// l'API résout l'école (comme pour le trafic proxifié par Next).
//
// ⚠ Multi-tenant : GET /tenancy/home a la MÊME URL pour toutes les écoles
// (différenciées par le header d'hôte, pas par l'URL). Le cache de données de
// Next étant keyé par URL, deux écoles partageraient une seule entrée — fuite
// inter-tenant. On ajoute donc l'hôte dans l'URL (`__host`, ignoré par l'API)
// UNIQUEMENT pour distinguer la clé de cache, et un tag par hôte pour
// l'invalidation à la demande (déclenchée par l'admin — étape 4).

import { headers } from 'next/headers';
import type { HomeTheme } from '@/lib/home-theme';

const HOME_TTL = 300; // secondes — cache raisonnable, invalidé à la sauvegarde admin

/**
 * URL interne de l'API pour le rendu serveur — lue au RUNTIME (pas au
 * chargement du module, ni inlinée au build) : en production, elle est fournie
 * par la variable d'environnement API_URL du conteneur web (voir
 * docker/docker-compose.prod.yml, service `web`, http://api:4000). Défaut dev.
 */
export function apiUrl(): string {
  return process.env.API_URL ?? 'http://localhost:4000';
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
export interface HomeResource {
  name: string;
  description: string;
  status: 'live' | 'maint' | 'off';
  statusLabel: string;
  url: string;
}
export interface HomeContent {
  identity: {
    fullName: string;
    acronym: string;
    brandMark: string;
    subtitle: string;
    tagline: string;
    heroTitle: string;
    heroTitleAccent: string;
    lead: string;
    searchHint: string;
    logoUrl: string | null;
    heroImageUrl: string | null;
    heroImageKicker: string;
    heroImageCaption: string;
  };
  stats: HomeStat[];
  espaces: HomeEspace[];
  services: string[];
  hours: { note: string; lines: { label: string; value: string }[] };
  resources: HomeResource[];
  contact: {
    description: string;
    partnerNote: string;
    address: string;
    phones: string;
    email: string;
    socials: { label: string; url: string }[];
    copyright: string;
  };
}

export interface TenantHome {
  name: string;
  slug: string;
  primaryColor: string;
  secondaryColor: string;
  themeTokens: Record<string, string>;
  latticeEnabled: boolean;
  content: HomeContent;
}

export interface ConstellationDomain {
  category: string;
  count: number;
}

/** Nom de tag de cache par hôte — l'admin le revalide après une sauvegarde. */
export function homeCacheTag(host: string): string {
  return `tenant-home:${host}`;
}

// Next 15 : headers() est asynchrone, donc currentHost() l'est aussi.
async function currentHost(): Promise<string> {
  const h = await headers();
  return h.get('x-forwarded-host') ?? h.get('host') ?? '';
}

async function fetchTenant<T>(path: string, host: string): Promise<T | null> {
  const sep = path.includes('?') ? '&' : '?';
  const url = `${apiUrl()}${path}${sep}__host=${encodeURIComponent(host)}`;
  try {
    const res = await fetch(url, {
      headers: { 'x-forwarded-host': host },
      next: { tags: [homeCacheTag(host)], revalidate: HOME_TTL },
    });
    if (!res.ok) {
      // NON silencieux : trace l'URL et le code pour diagnostiquer côté serveur
      // (ex. mauvaise API_URL, tenant non résolu). L'appelant affiche un repli.
      console.error(`[server-api] ${url} (host="${host}") → HTTP ${res.status}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    // Échec réseau (API réellement injoignable / URL erronée) : on ne casse
    // pas le rendu de la page publique, mais on LOGGE la cause exacte — sans
    // ce log, une API_URL absente retombe silencieusement sur le repli minimal.
    console.error(
      `[server-api] échec du fetch ${url} (host="${host}") : ${(err as Error).message}. ` +
        `Vérifier API_URL du conteneur web (attendu http://api:4000 en prod).`,
    );
    return null;
  }
}

/** Charge utile complète de la page d'accueil du tenant courant (SSR). */
export async function fetchTenantHome(): Promise<TenantHome | null> {
  return fetchTenant<TenantHome>('/tenancy/home', await currentHost());
}

export interface Constellation {
  totalRecords: number;
  domains: ConstellationDomain[];
}

/** Répartition du catalogue (constellation dynamique) du tenant courant. */
export async function fetchConstellation(): Promise<Constellation> {
  const data = await fetchTenant<Constellation>('/opac/constellation', await currentHost());
  return { totalRecords: data?.totalRecords ?? 0, domains: data?.domains ?? [] };
}

/** Adapte la charge utile au contrat du util de thème (lib/home-theme). */
export function toHomeTheme(home: TenantHome): HomeTheme {
  return { primary: home.primaryColor, tokens: home.themeTokens };
}
