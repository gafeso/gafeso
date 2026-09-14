import { XMLParser } from 'fast-xml-parser';
import { MarcFields } from '../cataloging/marc-mapper';

/**
 * Extraction des notices MARCXML d'une réponse SRU vers le format `MarcFields`
 * attendu par le mapper existant (marc-mapper). On RÉUTILISE ainsi tout le
 * mapping UNIMARC/MARC21 : le SRU n'est qu'un transport de plus.
 *
 * Les réponses SRU sont fortement namespacées (srw:, mxc:, marc:…) et les
 * préfixes varient d'une cible à l'autre → on retire tous les préfixes
 * (`removeNSPrefix`) et on navigue par nom local. On ne coerce pas les valeurs
 * (`parseTagValue: false`) pour préserver les zéros de tête des tags et du
 * leader (« 001 », « 00000nam… »).
 */
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
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
  parseTagValue: false,
  trimValues: true,
});

/** Renvoie toujours un tableau (fast-xml-parser donne un objet si un seul nœud). */
function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

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
function textOf(node: unknown): string {
  if (node == null) return '';
  if (typeof node === 'string') return node.normalize('NFC');
  if (typeof node === 'object' && '#text' in (node as Record<string, unknown>)) {
    return String((node as Record<string, unknown>)['#text'] ?? '').normalize('NFC');
  }
  return '';
}

/** Convertit un nœud MARCXML <record> (déjà déballé) en MarcFields. */
function recordNodeToFields(record: Record<string, unknown>): MarcFields {
  const fields: MarcFields = [];

  for (const cf of toArray<Record<string, unknown>>(record.controlfield as never)) {
    const tag = String(cf['@_tag'] ?? '');
    if (tag) fields.push([tag, textOf(cf)]);
  }

  for (const df of toArray<Record<string, unknown>>(record.datafield as never)) {
    const tag = String(df['@_tag'] ?? '');
    if (!tag) continue;
    const ind1 = String(df['@_ind1'] ?? ' ').padEnd(1, ' ').slice(0, 1);
    const ind2 = String(df['@_ind2'] ?? ' ').padEnd(1, ' ').slice(0, 1);
    const entry: string[] = [tag, `${ind1}${ind2}`];
    for (const sf of toArray<Record<string, unknown>>(df.subfield as never)) {
      const code = String(sf['@_code'] ?? '');
      if (!code) continue;
      entry.push(code, textOf(sf));
    }
    // Champ de données sans sous-champ exploitable → ignoré (rien à mapper).
    if (entry.length > 2) fields.push(entry);
  }

  return fields;
}

/**
 * Parse une réponse SRU complète et renvoie les notices sous forme de
 * MarcFields (une entrée par notice). Robuste à l'absence de résultats et aux
 * réponses de diagnostic : renvoie un tableau vide plutôt que de jeter.
 */
export function parseSruMarcxml(xml: string): MarcFields[] {
  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(xml) as Record<string, unknown>;
  } catch {
    return [];
  }

  // On collecte TOUS les nœuds <record> porteurs de datafield/controlfield,
  // où qu'ils soient (searchRetrieveResponse > records > record > recordData >
  // record). Un balayage récursif évite de coder en dur la profondeur, qui
  // diffère entre BnF et LoC.
  const out: MarcFields[] = [];
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    if (obj.datafield || obj.controlfield || obj.leader !== undefined) {
      const fields = recordNodeToFields(obj);
      if (fields.length) out.push(fields);
      // On ne descend pas SOUS une notice MARC (ses sous-nœuds sont ses zones).
      return;
    }
    for (const value of Object.values(obj)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  };
  visit(doc);
  return out;
}
