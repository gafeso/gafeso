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
  // ⚠ LES RÉFÉRENCES NUMÉRIQUES DE CARACTÈRES SONT DÉCODÉES, et il a fallu
  // une traversée réelle pour le voir. `fast-xml-parser` décode `&amp;` par
  // défaut, mais PAS `&#x301;` ni `&#233;` sans `htmlEntities`.
  //
  // Mesuré le 13 septembre 2026 contre la Library of Congress, qui les emploie
  // pour les diacritiques : une recherche rendait le titre
  // « L'E&#x301;tranger a&#x300; la mer » — affiché tel quel à la
  // bibliothécaire, et pré-rempli tel quel dans sa notice.
  //
  // ⚠ Le défaut est SILENCIEUX par construction : il produit un titre, donc
  // rien ne lève et rien ne manque. Seule une lecture par un œil humain — ou
  // une recette qui affiche ce qu'elle reçoit — le montre.
  htmlEntities: true,
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
/**
 * DE QUOI REPRENDRE UN MOISSONNAGE LÀ OÙ IL S'EST ARRÊTÉ.
 *
 * ⚠ ET SA PÉREMPTION EN FAIT PARTIE. Un `resumptionToken` expire — souvent en
 * minutes, et OAI-PMH le dit lui-même par l'attribut `expirationDate`. Garder
 * le jeton sans sa limite serait promettre une reprise qu'on ne peut pas
 * tenir : l'échec, plus tard, ressemblerait à une source cassée.
 *
 * `expire` vaut `null` quand l'entrepôt ne l'annonce pas — et c'est le troisième
 * état, pas « il n'expire jamais ».
 */
export interface Reprise {
  jeton: string;
  expire: string | null;
}

/**
 * CE QUI A ÉTÉ RAMASSÉ, même quand le parcours ne va pas au bout.
 *
 * ⚠ POURQUOI CE TYPE EXISTE : la première version JETAIT tout ce qu'elle avait
 * moissonné dès qu'une page échouait. Huit mille notices reçues, une coupure
 * réseau à la page 41, et rien — alors que le protocole donne exactement de
 * quoi ne pas recommencer. La recette du brief le demande en toutes lettres :
 * « moissonnage interrompu → reprend où il s'est arrêté ».
 */
export interface Ramassage {
  notices: NoticeMoissonnee[];
  suppressions: SuppressionSignalee[];
  pages: number;
  dernierDatestamp: string | null;
  /** De quoi continuer, ou `null` quand l'entrepôt n'a plus rien à donner. */
  reprise: Reprise | null;
}

export type IssueMoissonnage =
  | ({ etat: 'moisson' } & Ramassage)
  | { etat: 'vide'; confirme: true }
  /**
   * ⚠ `partiel` PORTE CE QUI A ÉTÉ RAMASSÉ AVANT LA PANNE, et vaut `null` quand
   * la panne est survenue sur la PREMIÈRE requête. Les deux cas ne se
   * confondent pas : l'un a des notices à écrire et un jeton à garder, l'autre
   * n'a rien du tout.
   */
  | { etat: 'injoignable'; motif: string; partiel: Ramassage | null }
  | { etat: 'erreur_protocole'; code: string; motif: string; partiel: Ramassage | null };

export interface SourceOai {
  /** L'URL de base de l'entrepôt distant. */
  baseUrl: string;
  /** `oai_dc`, `marcxml`, `etdms`… */
  metadataPrefix: string;
  /** Ensemble à moissonner, ou tout l'entrepôt. */
  set?: string;
  /** Moissonnage INCRÉMENTAL : ne demander que ce qui a changé depuis. */
  from?: string;
  /**
   * REPRENDRE un parcours interrompu au lieu d'en recommencer un.
   *
   * ⚠ Quand il est présent, il est envoyé SEUL — `metadataPrefix`, `set` et
   * `from` sont alors interdits par le protocole, et c'est déjà ce que fait
   * `construireUrl`. L'appelant décide s'il est encore valide : le client ne
   * connaît pas l'heure.
   */
  reprise?: string;
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
    let jeton: string | null = source.reprise ?? null;
    let pages = 0;
    // ⚠ LE JETON QUI SERVIRA À REPRENDRE, distinct de `jeton` : celui-ci est
    // celui qu'on vient d'EMPLOYER, celui-là est celui qu'on n'a pas encore
    // employé. Les confondre ferait reprendre une page déjà reçue, ou en
    // sauter une.
    let reprise: Reprise | null = source.reprise ? { jeton: source.reprise, expire: null } : null;

    /** Ce qui a été ramassé jusqu'ici — rendu même quand le parcours échoue. */
    const ramassage = (): Ramassage => ({
      notices,
      suppressions,
      pages,
      dernierDatestamp: plusRecent([...notices, ...suppressions].map((n) => n.datestamp)),
      reprise,
    });
    /** `null` quand rien n'a été ramassé : « rien » et « un peu » ne se valent pas. */
    const partiel = (): Ramassage | null =>
      notices.length || suppressions.length ? ramassage() : null;

    for (;;) {
      const url = this.construireUrl(source, jeton);
      let xml: string;
      try {
        const res = await this.fetchImpl(url, {
          signal: AbortSignal.timeout(DELAI_MS),
          headers: { Accept: 'application/xml,text/xml' },
        });
        if (!res.ok) {
          return {
            etat: 'injoignable',
            motif: `Réponse inattendue (HTTP ${res.status}).`,
            partiel: partiel(),
          };
        }
        xml = await res.text();
      } catch (e) {
        return { etat: 'injoignable', motif: decrireErreur(e), partiel: partiel() };
      }

      const reponse = parser.parse(xml)?.['OAI-PMH'];
      if (!reponse) {
        return {
          etat: 'injoignable',
          motif: 'Réponse illisible : ce n’est pas du OAI-PMH.',
          partiel: partiel(),
        };
      }

      const erreur = premier(reponse.error);
      if (erreur) {
        const code = String(erreur['@_code'] ?? 'inconnu');
        // ⚠ `noRecordsMatch` N'EST PAS UNE ERREUR. Le serveur a répondu
        // correctement qu'il n'avait rien — c'est un vide CONFIRMÉ, et il vaut
        // mieux qu'un vide supposé. Le traiter comme une panne ferait retenter
        // sans fin un entrepôt qui va très bien.
        if (code === 'noRecordsMatch') return { etat: 'vide', confirme: true };
        return { etat: 'erreur_protocole', code, motif: texte(erreur) || code, partiel: partiel() };
      }

      const liste = reponse.ListRecords;
      if (!liste) {
        // Pas d'erreur, pas de liste : l'entrepôt a répondu quelque chose
        // d'inattendu. On ne le compte pas comme vide — on ne sait pas.
        return {
          etat: 'injoignable',
          motif: 'Réponse sans ListRecords ni erreur.',
          partiel: partiel(),
        };
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

      const brut = premier(liste.resumptionToken);
      const suivant = texte(brut);
      if (!suivant) {
        // L'entrepôt a tout donné : il n'y a plus rien à reprendre.
        reprise = null;
        break;
      }
      // ⚠ OAI-PMH ANNONCE LUI-MÊME LA PÉREMPTION, quand il la connaît.
      // L'ignorer nous ferait garder un jeton périmé sans le savoir.
      const expire =
        brut && typeof brut === 'object'
          ? texte((brut as Record<string, unknown>)['@_expirationDate']) || null
          : null;
      // ⚠ LE JETON RÉPÉTÉ EST LE VRAI MODE DE PANNE : un entrepôt qui rend deux
      // fois le même fait tourner le client à l'infini, et `MAX_PAGES` ne
      // l'arrêterait qu'après cinq cents requêtes inutiles.
      if (jetonsVus.has(suivant)) {
        // ⚠ CE QUI A ÉTÉ RAMASSÉ RESTE VALIDE, MAIS LA REPRISE EST ANNULÉE.
        // C'est le seul cas où l'on jette le jeton : il BOUCLE, donc reprendre
        // avec lui rejouerait exactement la panne. Le parcours suivant repartira
        // du `from` incrémental, qui, lui, ne peut pas tourner en rond.
        return {
          etat: 'erreur_protocole',
          code: 'resumptionToken_repete',
          motif: 'L’entrepôt rend deux fois le même jeton de reprise : le moissonnage tournerait sans fin.',
          partiel: partiel() ? { ...ramassage(), reprise: null } : null,
        };
      }
      jetonsVus.add(suivant);
      jeton = suivant;
      reprise = { jeton: suivant, expire };

      if (pages >= this.maxPages) {
        // ⚠ CE N'EST PLUS UNE PERTE. La borne reste — un parcours sans fin
        // doit s'arrêter — mais ce qui a été ramassé part avec le jeton qui
        // permet de continuer, au lieu d'être jeté.
        return {
          etat: 'erreur_protocole',
          code: 'trop_de_pages',
          motif: `Arrêt après ${this.maxPages} pages : l’entrepôt n’a pas fini de rendre ses notices.`,
          partiel: ramassage(),
        };
      }
    }

    if (notices.length === 0 && suppressions.length === 0) {
      // ⚠ Une liste VIDE sans `noRecordsMatch` reste un vide CONFIRMÉ : le
      // serveur a répondu, il a rendu une liste, elle est vide.
      return { etat: 'vide', confirme: true };
    }

    // ⚠ `dernierDatestamp` est calculé sur les notices ET les suppressions :
    // une suppression fait avancer l'horloge de la source autant qu'une
    // création, et l'ignorer ferait redemander à chaque passage tout ce qui a
    // été supprimé depuis.
    return { etat: 'moisson', ...ramassage() };
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
/**
 * ⚠ NORMALISATION UNICODE — NFC, à la frontière où le texte d'un tiers entre.
 *
 * *Trouvé le 13 septembre 2026, en traversant le client SRU contre la Library
 * of Congress.* Elle émet ses diacritiques en forme DÉCOMPOSÉE : « Ouédraogo »
 * y est `O u e ◌́ d r a o g o` — seize caractères affichés, dix-huit en
 * mémoire.
 *
 * ```
 *   brut « Ouédraogo, Aïcha »  longueur 18   === 'Ouédraogo, Aïcha' → FAUX
 *   NFC  « Ouédraogo, Aïcha »  longueur 16   ===                    → vrai
 * ```
 *
 * ⚠ **CE QUE ÇA COÛTE, ET C'EST SILENCIEUX** : les deux chaînes s'affichent à
 * l'identique. Mais le fichier d'autorités déduplique par NOM EXACT — une fiche
 * « Ouédraogo » créée à la main et une autre pré-remplie depuis la LoC
 * deviennent **deux personnes différentes**, et la déduplication à la source,
 * qui est tout l'intérêt du fichier d'autorités, est perdue sans que rien ne le
 * signale.
 *
 * On normalise donc ICI, au bord, une fois — jamais en aval, où il faudrait y
 * penser à chaque comparaison.
 */
function texte(v: unknown): string {
  if (v === undefined || v === null) return '';
  if (typeof v === 'object') {
    const t = (v as Record<string, unknown>)['#text'];
    return t === undefined ? '' : String(t).trim().normalize('NFC');
  }
  return String(v).trim().normalize('NFC');
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
