import { MarcFormatName } from '../cataloging/marc-mapper';

/**
 * Un serveur SRU externe interrogeable pour récupérer des notices.
 *
 * SRU (Search/Retrieve via URL) est le pendant HTTP de Z39.50 : une simple
 * requête GET, une réponse XML contenant des notices MARCXML. Chaque cible
 * expose ses propres index CQL (le vocabulaire de recherche) et son propre
 * dialecte MARC — on stocke donc, par serveur, le schéma demandé et le format
 * MARC attendu pour router vers le bon extracteur (marc-mapper).
 */
export interface SruServer {
  /** Identifiant court stable (clé technique). */
  id: string;
  /** Nom affiché à l'utilisateur (source de la notice). */
  name: string;
  /** URL de base du point d'accès SRU (sans paramètres). */
  baseUrl: string;
  /** Version du protocole SRU annoncée par la cible (1.1 ou 1.2). */
  version: string;
  /** Schéma de notice demandé (unimarcxml, marcxml…). */
  recordSchema: string;
  /** Dialecte MARC de la réponse → choisit l'extracteur (UNIMARC/MARC21). */
  format: MarcFormatName;
  /**
   * Relation CQL acceptée par la cible. La BnF veut `index all "valeur"`, la LoC
   * veut `index="valeur"` (elle refuse `all` : diagnostic 1/19). On construit la
   * requête en conséquence (voir SruService.buildCql).
   */
  relation: 'all' | '=';
  /** Index CQL de la cible pour chaque critère de recherche. */
  index: { isbn: string; title: string; author: string };
  /** Serveur actif (permet de désactiver sans supprimer la config). */
  enabled: boolean;
}

/**
 * Liste des serveurs SRU par défaut. VOLONTAIREMENT une constante commentée :
 * c'est la configuration, éditable ici. Elle est extensible sans code via la
 * variable d'environnement SRU_EXTRA_SERVERS (JSON d'objets SruServer), utile
 * pour ajouter un catalogue collectif régional (ex. AUF) au déploiement.
 *
 * BnF et Library of Congress couvrent l'essentiel : la BnF pour l'édition
 * française (UNIMARC), la LoC pour l'édition anglophone (MARC21). Les deux
 * répondent en SRU sans authentification.
 */
export const DEFAULT_SRU_SERVERS: SruServer[] = [
  {
    id: 'bnf',
    name: 'BnF — Catalogue général',
    baseUrl: 'https://catalogue.bnf.fr/api/SRU',
    version: '1.2',
    // Schéma UNIMARC de la BnF (unimarcxml est REFUSÉ : diagnostic 1/66).
    recordSchema: 'unimarcxchange',
    format: 'UNIMARC',
    relation: 'all',
    // Index BnF : bib.isbn / bib.title / bib.author (cf. api.bnf.fr/fr/api-sru).
    index: { isbn: 'bib.isbn', title: 'bib.title', author: 'bib.author' },
    enabled: true,
  },
  {
    id: 'loc',
    name: 'Library of Congress',
    baseUrl: 'http://lx2.loc.gov:210/lcdb',
    version: '1.1',
    recordSchema: 'marcxml',
    format: 'MARC21',
    relation: '=',
    // Index Bath profile de la LoC : bath.isbn / bath.title / bath.author.
    index: { isbn: 'bath.isbn', title: 'bath.title', author: 'bath.author' },
    enabled: true,
  },
];

/**
 * Serveurs effectivement utilisés : les défauts ci-dessus + d'éventuels
 * serveurs supplémentaires fournis en configuration (SRU_EXTRA_SERVERS). Un
 * JSON invalide est ignoré silencieusement (la récupération reste optionnelle).
 */
export function getSruServers(): SruServer[] {
  const extra = process.env.SRU_EXTRA_SERVERS;
  if (!extra) return DEFAULT_SRU_SERVERS;
  try {
    const parsed = JSON.parse(extra) as SruServer[];
    if (Array.isArray(parsed)) return [...DEFAULT_SRU_SERVERS, ...parsed];
  } catch {
    /* configuration malformée : on s'en tient aux serveurs par défaut */
  }
  return DEFAULT_SRU_SERVERS;
}
