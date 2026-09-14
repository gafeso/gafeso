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
import type { Diapositive } from '@/lib/hero-slides';

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
    /**
     * ⚠ Les trois champs historiques du bandeau à image UNIQUE. Ils ne
     * s'appliquent plus dès que `heroSlides` contient une diapositive : l'API
     * fait alors foi de la liste (`heroSlidesEffectives`). Ne pas les lire
     * pour AFFICHER un bandeau — c'est `heroSlides` à la racine de la charge
     * utile qui sert cela.
     */
    heroImageUrl: string | null;
    heroImageKicker: string;
    heroImageCaption: string;
    /**
     * Liste STOCKÉE des diapositives — celle qu'on édite. À ne pas confondre
     * avec `TenantHome.heroSlides`, la liste EFFECTIVE servie à la racine :
     * celle-ci peut être reconstruite à la volée depuis les champs
     * historiques, et l'écrire dans `content` la ferait persister.
     */
    heroSlides: Diapositive[];
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
  /**
   * Diapositives EFFECTIVES du bandeau, servies à la racine — à côté de
   * `content`, jamais dedans. `content.identity.heroSlides` existe aussi dans
   * la charge utile et porte ce qui est STOCKÉ ; les confondre ferait persister
   * une liste reconstruite au premier PATCH de l'écran /admin/accueil.
   */
  heroSlides: Diapositive[];
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
/**
 * La notice existe-t-elle ? TROIS réponses, et la distinction est tout l'objet.
 *
 * ⚠ `fetchTenant` rend `null` aussi bien pour un 404 que pour une panne : c'est
 * suffisant quand l'appelant affiche un repli, ce n'est PAS suffisant ici.
 * Rendre 404 parce que l'API est tombée dirait au visiteur — et aux moteurs qui
 * indexent — que la notice n'existe pas, alors qu'elle existe et qu'on ne peut
 * simplement pas la joindre. Une panne se dit « réessayez », une absence se dit
 * « introuvable », et les deux ne s'écrivent pas pareil.
 *
 * Appelée par le rendu serveur de /opac/[id] pour décider du CODE DE RÉPONSE,
 * rien d'autre : la fiche elle-même reste chargée par le composant client, avec
 * la session du lecteur quand il en a une.
 */
export type ExistencePublique = 'existe' | 'introuvable' | 'indisponible';

/**
 * ⚠ ANCIEN NOM, CONSERVÉ. Le type ne décrit pas une notice mais l'EXISTENCE
 * d'une ressource publique — la même question se pose pour un auteur, et la
 * réponse a les mêmes trois états. Fondre les deux est ici JUSTE : ils
 * décrivent bien le même objet, contrairement aux vocabulaires de dépôt qui se
 * ressemblaient sans décrire la même chose.
 */
export type ExistenceNotice = ExistencePublique;

/**
 * Existence ET contenu public d'une notice, en UN seul appel.
 *
 * ⚠ MESURÉ LE 11 SEPTEMBRE 2026 : la fiche publique ne servait QUE l'en-tête.
 * Texte visible du HTML d'une notice, scripts retirés :
 *
 *     « Gafeso Accueil Catalogue Se connecter Créer un compte ☰ »
 *
 * Ni titre, ni auteur, ni `<h1>`, ni `<main>` — le contenu n'arrivait qu'après
 * l'exécution du JavaScript. Un moteur d'indexation n'y voit rien, et c'est la
 * page la plus importante d'un catalogue : celle qu'on cherche à faire trouver.
 *
 * ⚠ Et l'ironie de l'enveloppe : on avait soigné son 404 POUR LES MACHINES —
 * « une notice supprimée doit cesser d'être annoncée vivante » — pendant que sa
 * réponse 200 ne portait rien pour elles. Le « introuvable » était honnête, le
 * « trouvé » était vide.
 *
 * ⚠ L'APPEL EST ANONYME, DÉLIBÉRÉMENT. Le serveur ne porte pas la session du
 * lecteur : ce qu'il rend est la vue PUBLIQUE, celle qu'un moteur doit voir.
 * Le composant client rappelle ensuite l'API avec le jeton quand il y en a un,
 * et complète. L'inverse — rendre côté serveur avec la session — publierait
 * dans le HTML ce que le contrôle d'accès réserve aux membres.
 */
/**
 * Existence ET contenu public d'un auteur, en UN seul appel.
 *
 * ⚠ MESURÉ LE 14 SEPTEMBRE 2026, et la fiche auteur portait les DEUX défauts que
 * la fiche notice avait déjà corrigés :
 *
 *   · `/opac/auteurs/<inexistant>` répondait **200** quand l'API répond 404 ;
 *   · le HTML servi ne portait que la coque — 65 octets de texte, aucun `<h1>`.
 *
 * C'était la seule page de DÉTAIL publique dans ce cas. Et ces adresses
 * circulent : chaque notice renvoie vers ses auteurs.
 *
 * ⚠ CE QUE J'AI ÉVITÉ EN CHERCHANT D'ABORD : écrire un second mécanisme. Le
 * patron existait, éprouvé, commenté — il a suffi de le suivre. Un commentaire
 * qui explique un choix ne sert qu'à qui le croise.
 *
 * ⚠ L'APPEL EST ANONYME, comme pour la notice : le serveur rend la vue PUBLIQUE,
 * celle qu'un moteur doit voir. Le composant client rappelle ensuite l'API avec
 * le jeton du lecteur quand il y en a un.
 */
export async function auteurPublic(
  id: string,
): Promise<{ etat: ExistencePublique; auteur: unknown | null }> {
  const host = await currentHost();
  const url = `${apiUrl()}/opac/authors/${encodeURIComponent(id)}?__host=${encodeURIComponent(host)}`;
  try {
    const res = await fetch(url, {
      headers: { 'x-forwarded-host': host },
      next: { revalidate: 60 },
    });
    if (res.status === 404) return { etat: 'introuvable', auteur: null };
    if (!res.ok) {
      console.error(`[server-api] ${url} → HTTP ${res.status} (existence d'auteur)`);
      return { etat: 'indisponible', auteur: null };
    }
    return { etat: 'existe', auteur: await res.json() };
  } catch (err) {
    // ⚠ Une panne n'est PAS une absence. Rendre 404 ici dirait aux moteurs que
    // l'auteur n'existe pas, alors qu'on n'a simplement pas pu le joindre — et
    // un désindexage se répare en demandant une réindexation, pas tout seul.
    console.error(
      `[server-api] échec du fetch ${url} : ${(err as Error).message}. ` +
        `L'auteur n'est PAS déclaré introuvable pour autant.`,
    );
    return { etat: 'indisponible', auteur: null };
  }
}

export async function noticePublique(
  id: string,
): Promise<{ etat: ExistenceNotice; notice: unknown | null }> {
  const host = await currentHost();
  const url = `${apiUrl()}/opac/records/${encodeURIComponent(id)}?__host=${encodeURIComponent(host)}`;
  try {
    const res = await fetch(url, {
      headers: { 'x-forwarded-host': host },
      // Court : une notice supprimée doit cesser d'être annoncée vivante assez
      // vite, et le coût d'une vérification est faible.
      next: { revalidate: 60 },
    });
    if (res.status === 404) return { etat: 'introuvable', notice: null };
    if (!res.ok) {
      console.error(`[server-api] ${url} → HTTP ${res.status} (existence de notice)`);
      return { etat: 'indisponible', notice: null };
    }
    return { etat: 'existe', notice: await res.json() };
  } catch (err) {
    console.error(
      `[server-api] échec du fetch ${url} : ${(err as Error).message}. ` +
        `La notice n'est PAS déclarée introuvable pour autant.`,
    );
    return { etat: 'indisponible', notice: null };
  }
}


export async function fetchTenantHome(): Promise<TenantHome | null> {
  return fetchTenant<TenantHome>('/tenancy/home', await currentHost());
}

export interface Constellation {
  totalRecords: number;
  domains: ConstellationDomain[];
}

/**
 * Répartition du catalogue (constellation dynamique) du tenant courant.
 *
 * ⚠ Renvoie `null` quand l'API n'a pas répondu — et surtout PAS une
 * constellation vide. La version précédente retombait sur
 * `{ totalRecords: 0, domains: [] }`, ce qui rendait une PANNE SERVEUR
 * indiscernable d'un catalogue réellement vide : la page d'accueil publique
 * masquait alors sa section « Constellation des savoirs » et son entrée de
 * navigation, et se présentait comme complète. C'est le pire endroit du
 * produit pour ce défaut — c'est l'écran que voient un étudiant, une DSI, un
 * bailleur.
 *
 * L'appelant DOIT distinguer les trois cas : `null` (on ne sait pas),
 * `domains` vide (catalogue réellement vide), `domains` peuplé.
 */
export async function fetchConstellation(): Promise<Constellation | null> {
  const data = await fetchTenant<Constellation>('/opac/constellation', await currentHost());
  if (!data) return null;
  return { totalRecords: data.totalRecords, domains: data.domains };
}

/**
 * Chiffres du fonds — section « Chiffres » de la vitrine.
 *
 * ⚠ CONTRAT ATTENDU, endpoint PAS ENCORE LIVRÉ (lot backend en cours au
 * 10 septembre 2026). Trois des quatre mesures n'existent aujourd'hui que
 * derrière `statistiques.voir` (/stats/dashboard → 401 sans session), et la
 * quatrième — les licences hors connexion — n'est comptée nulle part.
 *
 * Tant que la route répond 404, `fetchTenant` rend `null`, et la section ne se
 * rend pas. C'est le comportement voulu, pas un contournement : « aucun
 * chiffre, aucune section » est la règle du brief, et elle sert exactement à
 * traverser cet intervalle sans rien afficher de faux.
 *
 * ⚠ LE CHEMIN EST À CONFIRMER avec le lot backend. Il est isolé ici, en une
 * constante : le jour où l'endpoint arrive sous un autre nom, c'est une ligne.
 */
export const ROUTE_CHIFFRES = '/opac/chiffres';

export interface ChiffresDuFonds {
  documents: number;
  lecteurs: number;
  documentsNumeriques: number;
  lecturesHorsLigne: number;
}

export async function fetchChiffres(): Promise<ChiffresDuFonds | null> {
  return fetchTenant<ChiffresDuFonds>(ROUTE_CHIFFRES, await currentHost());
}

/**
 * Nouveautés du catalogue — six notices, dans l'ordre servi par l'API.
 *
 * ⚠ CE N'EST PAS UNE DATE D'ACQUISITION. Le tri reflète l'ORDRE D'ÉCRITURE EN
 * BASE : une notice saisie aujourd'hui pour un ouvrage acquis en 2019 remonte
 * en tête. D'où le titre affiché « À découvrir dans le catalogue » et non
 * « Dernières acquisitions », qui serait un fait faux. Ne pas « corriger » le
 * libellé en croyant réparer un oubli.
 *
 * ⚠ Et ne pas se rabattre sur `/opac/search?limit=6` si cette route venait à
 * disparaître : son ordre est arbitraire, ce serait la même affirmation fausse
 * en pire. Mieux vaut pas de section.
 */
export const ROUTE_NOUVEAUTES = '/opac/nouveautes?limit=6';

export interface NoticeANouveaute {
  id: string;
  title: string;
  author: string | null;
  publishYear: number | null;
  recordType: string;
  coverUrl: string | null;
}

export async function fetchNouveautes(): Promise<NoticeANouveaute[] | null> {
  const data = await fetchTenant<{ hits: NoticeANouveaute[] }>(
    ROUTE_NOUVEAUTES,
    await currentHost(),
  );
  // `null` (pas de réponse) et liste vide sont deux faits différents, mais ici
  // ils produisent le même rendu : aucune section. On ne les confond pas pour
  // autant — l'appelant reçoit `null` quand on ne sait pas.
  if (!data) return null;
  return Array.isArray(data.hits) ? data.hits : [];
}

/** Adapte la charge utile au contrat du util de thème (lib/home-theme). */
export function toHomeTheme(home: TenantHome): HomeTheme {
  return { primary: home.primaryColor, tokens: home.themeTokens };
}
