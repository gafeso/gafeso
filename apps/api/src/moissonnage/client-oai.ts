import { XMLParser } from 'fast-xml-parser';

/**
 * LE CLIENT OAI-PMH — Gafeso sait être moissonné ; il apprend à moissonner.
 *
 * ⚠ CE FICHIER NE PERSISTE RIEN ET N'ÉCRIT RIEN. Il interroge, il suit les
 * jetons de reprise, et il rend ce qu'il a vu. La décision de créer, d'ignorer
 * ou de signaler une collision appartient au lot suivant — et c'est ce qui
 * permet de l'éprouver contre un serveur fabriqué, sans base.
 *
 * ## Ce qu'il reprend de `SruService`, et pourquoi
 *
 * La forme du résultat et la gestion d'erreur : une source injoignable est
 * RAPPORTÉE, jamais avalée, et n'empêche rien d'autre. C'est déjà le cas 2 de
 * la recette — « dit, jamais zéro notice ».
 *
 * ## Ce qu'il ajoute, et que SRU n'avait pas
 *
 * La PAGINATION. SRU rend tout d'un coup ; OAI rend un `resumptionToken`, et un
 * moissonnage de 8 000 notices ne tient pas en une réponse.
 */

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  // Les réponses OAI sont namespacées de façons variables selon
  // l'implémentation (oai:, oai_dc:, dc:) — on navigue par nom local.
  removeNSPrefix: true,
  // ⚠ PAS DE COERCITION. Un identifiant « 007 » ou une année « 2026 » doivent
  // rester des chaînes : un `datestamp` converti en nombre serait illisible, et
  // un identifiant numérique perdrait ses zéros de tête.
  parseTagValue: false,
  trimValues: true,
});

/** Une notice telle que la source la rend — brute, non interprétée. */
export interface NoticeMoissonnee {
  /** L'identifiant OAI de la source. C'est SA clé, jamais la nôtre. */
  identifiant: string;
  /** L'horodatage de la source — sert au moissonnage incrémental suivant. */
  datestamp: string;
  /** Les ensembles déclarés par la source pour cette notice. */
  ensembles: string[];
  /** Les métadonnées, telles quelles. Le mapping appartient au lot suivant. */
  metadonnees: Record<string, unknown> | null;
}

/**
 * ⚠ UNE NOTICE SUPPRIMÉE À LA SOURCE EST RAPPORTÉE, JAMAIS APPLIQUÉE.
 *
 * Décision 6 du brief : aucune suppression automatique. Le client la SIGNALE
 * — c'est une information réelle, et la taire serait un silence de plus — mais
 * il ne touche à rien. Un moissonneur qui supprime sur absence transforme une
 * panne de la source en perte de données.
 */
export interface SuppressionSignalee {
  identifiant: string;
  datestamp: string;
}

/**
 * LES QUATRE ISSUES D'UN MOISSONNAGE, et elles ne se confondent pas.
 *
 * ⚠ « Injoignable » et « vide » sont DEUX choses, et c'est le cas 2 de la
 * recette. Mais il y en a une troisième que le brief ne nomme pas et qui est
 * réelle : le serveur a répondu CORRECTEMENT qu'il n'avait rien
 * (`noRecordsMatch`). Ce n'est pas une erreur — c'est un vide CONFIRMÉ, et il
 * vaut mieux qu'un vide supposé.
 *
 * Et une quatrième : le serveur répond une erreur de PROTOCOLE (`badArgument`,
 * `cannotDisseminateFormat`). Celle-là est de NOTRE côté — mauvaise requête,
 * format non supporté — et la traiter comme une panne réseau ferait retenter
 * indéfiniment une requête qui ne marchera jamais.
 */
export type IssueMoissonnage =
  | { etat: 'moisson'; notices: NoticeMoissonnee[]; suppressions: SuppressionSignalee[]; pages: number; dernierDatestamp: string | null }
  | { etat: 'vide'; confirme: true }
  | { etat: 'injoignable'; motif: string }
  | { etat: 'erreur_protocole'; code: string; motif: string };

export interface SourceOai {
  /** L'URL de base de l'entrepôt distant. */
  baseUrl: string;
  /** `oai_dc`, `marcxml`, `etdms`… */
  metadataPrefix: string;
  /** Ensemble à moissonner, ou tout l'entrepôt. */
  set?: string;
  /** Moissonnage INCRÉMENTAL : ne demander que ce qui a changé depuis. */
  from?: string;
}

/** Bornes du parcours, déclarées plutôt que subies. */
export const MAX_PAGES = 500;
export const DELAI_MS = 30_000;

/**
 * ⚠ POURQUOI DES BORNES, ET POURQUOI CELLES-LÀ.
 *
 * `MAX_PAGES` n'est pas une limite de volume : à 100 notices par page — le
 * défaut usuel — elle laisse passer 50 000 notices, six fois le plus gros fonds
 * qu'on ait mesuré. Elle existe contre un serveur qui BOUCLE, pas contre un
 * serveur qui a beaucoup de notices.
 *
 * ⚠ Et le jeton RÉPÉTÉ est détecté à part : un entrepôt qui rend deux fois le
 * même `resumptionToken` fait tourner le client à l'infini sans jamais
 * atteindre `MAX_PAGES` plus vite qu'en épuisant le réseau. C'est le vrai mode
 * de panne, et il est silencieux.
 */
export class ClientOai {
  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly maxPages: number = MAX_PAGES,
  ) {}

  async moissonner(source: SourceOai): Promise<IssueMoissonnage> {
    const notices: NoticeMoissonnee[] = [];
    const suppressions: SuppressionSignalee[] = [];
    const jetonsVus = new Set<string>();
    let jeton: string | null = null;
    let pages = 0;

    for (;;) {
      const url = this.construireUrl(source, jeton);
      let xml: string;
      try {
        const res = await this.fetchImpl(url, {
          signal: AbortSignal.timeout(DELAI_MS),
          headers: { Accept: 'application/xml,text/xml' },
        });
        if (!res.ok) {
          return { etat: 'injoignable', motif: `Réponse inattendue (HTTP ${res.status}).` };
        }
        xml = await res.text();
      } catch (e) {
        return { etat: 'injoignable', motif: decrireErreur(e) };
      }

      const reponse = parser.parse(xml)?.['OAI-PMH'];
      if (!reponse) {
        return { etat: 'injoignable', motif: 'Réponse illisible : ce n’est pas du OAI-PMH.' };
      }

      const erreur = premier(reponse.error);
      if (erreur) {
        const code = String(erreur['@_code'] ?? 'inconnu');
        // ⚠ `noRecordsMatch` N'EST PAS UNE ERREUR. Le serveur a répondu
        // correctement qu'il n'avait rien — c'est un vide CONFIRMÉ, et il vaut
        // mieux qu'un vide supposé. Le traiter comme une panne ferait retenter
        // sans fin un entrepôt qui va très bien.
        if (code === 'noRecordsMatch') return { etat: 'vide', confirme: true };
        return { etat: 'erreur_protocole', code, motif: texte(erreur) || code };
      }

      const liste = reponse.ListRecords;
      if (!liste) {
        // Pas d'erreur, pas de liste : l'entrepôt a répondu quelque chose
        // d'inattendu. On ne le compte pas comme vide — on ne sait pas.
        return { etat: 'injoignable', motif: 'Réponse sans ListRecords ni erreur.' };
      }

      pages += 1;
      for (const record of tableau(liste.record)) {
        const header = record?.header ?? {};
        const identifiant = texte(header.identifier);
        if (!identifiant) continue;
        const datestamp = texte(header.datestamp);
        // ⚠ SIGNALÉE, JAMAIS APPLIQUÉE — décision 6.
        if (String(header['@_status'] ?? '') === 'deleted') {
          suppressions.push({ identifiant, datestamp });
          continue;
        }
        notices.push({
          identifiant,
          datestamp,
          ensembles: tableau(header.setSpec).map((s) => texte(s)).filter(Boolean),
          metadonnees: (record?.metadata as Record<string, unknown>) ?? null,
        });
      }

      const suivant = texte(premier(liste.resumptionToken));
      if (!suivant) break;
      // ⚠ LE JETON RÉPÉTÉ EST LE VRAI MODE DE PANNE : un entrepôt qui rend deux
      // fois le même fait tourner le client à l'infini, et `MAX_PAGES` ne
      // l'arrêterait qu'après cinq cents requêtes inutiles.
      if (jetonsVus.has(suivant)) {
        return {
          etat: 'erreur_protocole',
          code: 'resumptionToken_repete',
          motif: 'L’entrepôt rend deux fois le même jeton de reprise : le moissonnage tournerait sans fin.',
        };
      }
      jetonsVus.add(suivant);
      jeton = suivant;

      if (pages >= this.maxPages) {
        return {
          etat: 'erreur_protocole',
          code: 'trop_de_pages',
          motif: `Arrêt après ${this.maxPages} pages : l’entrepôt n’a pas fini de rendre ses notices.`,
        };
      }
    }

    if (notices.length === 0 && suppressions.length === 0) {
      // ⚠ Une liste VIDE sans `noRecordsMatch` reste un vide CONFIRMÉ : le
      // serveur a répondu, il a rendu une liste, elle est vide.
      return { etat: 'vide', confirme: true };
    }

    return {
      etat: 'moisson',
      notices,
      suppressions,
      pages,
      // ⚠ LE PLUS RÉCENT, pour le moissonnage incrémental suivant. Calculé sur
      // les notices ET les suppressions : une suppression fait avancer
      // l'horloge de la source autant qu'une création.
      dernierDatestamp: plusRecent([...notices, ...suppressions].map((n) => n.datestamp)),
    };
  }

  /**
   * ⚠ UN JETON DE REPRISE SE TRANSMET SEUL.
   *
   * Le protocole l'exige : `verb` + `resumptionToken`, et RIEN d'autre.
   * Renvoyer `metadataPrefix` avec le jeton est l'erreur la plus commune des
   * clients OAI — beaucoup d'entrepôts répondent alors `badArgument`, et le
   * moissonnage s'arrête à la deuxième page sans qu'on comprenne pourquoi.
   */
  private construireUrl(source: SourceOai, jeton: string | null): string {
    const url = new URL(source.baseUrl);
    url.searchParams.set('verb', 'ListRecords');
    if (jeton) {
      url.searchParams.set('resumptionToken', jeton);
      return url.toString();
    }
    url.searchParams.set('metadataPrefix', source.metadataPrefix);
    if (source.set) url.searchParams.set('set', source.set);
    if (source.from) url.searchParams.set('from', source.from);
    return url.toString();
  }
}

function tableau<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function premier<T>(v: T | T[] | undefined | null): T | undefined {
  return tableau(v)[0];
}

/** Le texte d'un nœud, qu'il soit nu ou porteur d'attributs. */
function texte(v: unknown): string {
  if (v === undefined || v === null) return '';
  if (typeof v === 'object') {
    const t = (v as Record<string, unknown>)['#text'];
    return t === undefined ? '' : String(t).trim();
  }
  return String(v).trim();
}

/** Le plus récent des horodatages, en comparaison lexicale ISO 8601. */
function plusRecent(datestamps: string[]): string | null {
  const valides = datestamps.filter(Boolean).sort();
  return valides.length > 0 ? valides[valides.length - 1] : null;
}

function decrireErreur(e: unknown): string {
  const nom = (e as Error)?.name;
  if (nom === 'TimeoutError' || nom === 'AbortError') {
    return `Pas de réponse en ${DELAI_MS / 1000} s.`;
  }
  return (e as Error)?.message || 'Erreur réseau.';
}
