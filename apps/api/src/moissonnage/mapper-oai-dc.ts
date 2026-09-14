import { DEFAULT_RECORD_TYPE, estUnTypeDeNotice } from '../cataloging/description-profiles';

/**
 * DUBLIN CORE (`oai_dc`) → LES CHAMPS D'UNE NOTICE GAFESO.
 *
 * ⚠ PUR, ET SANS BASE : il ne connaît ni l'école, ni les fiches d'autorité, ni
 * l'index. Il traduit, il n'écrit pas — c'est ce qui permet de l'éprouver sur
 * des XML réels sans serveur.
 *
 * ⚠ CE QU'IL NE FAIT PAS, ET C'EST DÉLIBÉRÉ. Il ne REFUSE rien d'autre qu'une
 * notice sans titre. L'exigence « au moins un auteur principal », celle des
 * mots-clés, celle de l'université de soutenance sont des règles de SAISIE : un
 * import ne les applique pas, sinon la moitié d'un entrepôt distant serait
 * rejetée pour n'avoir pas rempli des cases que nous avons inventées. C'est
 * déjà le choix de `importMarc`, et le suivre évite d'avoir deux doctrines
 * d'import dans le même produit.
 *
 * ⚠ ET LA DONNÉE D'ORIGINE N'EST JAMAIS PERDUE (I3) : l'appelant conserve le
 * Dublin Core brut dans `marcData`. Ce qui arrive dans un format y reste, même
 * ce que ce mapper n'a pas su traduire.
 */

/** Ce qu'une notice Dublin Core donne à la notice Gafeso. */
export interface NoticeExtraite {
  title: string;
  titleComplement: string | null;
  author: string | null;
  contributors: { name: string; role: 'AUTEUR_PRINCIPAL' | 'AUTEUR_SECONDAIRE' }[];
  isbn: string | null;
  publishYear: number | null;
  language: string;
  publisher: string | null;
  summary: string | null;
  keywords: string[];
  recordType: string;
  /** La valeur `dc:type` d'origine quand elle n'est pas un de nos types. */
  typeNonReconnu: string | null;
}

/** Le Dublin Core d'un enregistrement OAI, tel que le parseur XML le rend. */
type DcBrut = Record<string, unknown>;

function liste(v: unknown): string[] {
  if (v === null || v === undefined) return [];
  const brut = Array.isArray(v) ? v : [v];
  return brut
    .map((x) => (typeof x === 'object' && x !== null ? String((x as { '#text'?: unknown })['#text'] ?? '') : String(x)))
    // ⚠ NFC ici aussi : le Dublin Core d'un entrepôt tiers peut être décomposé,
    // et un auteur moissonné doit se confondre avec le même auteur saisi à la
    // main — c'est le fichier d'autorités qui en dépend.
    .map((x) => x.trim().normalize('NFC'))
    .filter(Boolean);
}

const premier = (v: unknown): string | null => liste(v)[0] ?? null;

/**
 * Extrait le `dc` d'une enveloppe `metadata`, quel que soit le préfixe employé.
 *
 * ⚠ LES ENTREPÔTS N'ÉCRIVENT PAS TOUS PAREIL : `oai_dc:dc`, `dc`, parfois la
 * racine directement. Chercher UNE forme ferait rendre zéro champ à un entrepôt
 * parfaitement conforme — et un mapper qui rend des notices vides sans erreur
 * est pire qu'un mapper qui refuse.
 */
export function extraireDc(metadonnees: Record<string, unknown> | null): DcBrut | null {
  if (!metadonnees) return null;
  const cle = Object.keys(metadonnees).find((k) => k === 'dc' || k.endsWith(':dc'));
  const dc = cle ? metadonnees[cle] : metadonnees;
  return dc && typeof dc === 'object' ? (dc as DcBrut) : null;
}

/**
 * ⚠ L'ANNÉE : QUATRE CHIFFRES, OU RIEN. `dc:date` est libre — « 2019 »,
 * « 2019-04-12 », « circa 2019 », « s.d. ». Un `parseInt` optimiste ferait
 * d'une date inconnue l'an 0 ou l'an 20, et un catalogue trié par année
 * deviendrait faux sans que personne le voie.
 */
export function anneeDepuisDate(valeur: string | null): number | null {
  if (!valeur) return null;
  const m = /(\d{4})/.exec(valeur);
  if (!m) return null;
  const annee = Number(m[1]);
  // Une borne large, mais une borne : un identifiant pris pour une date
  // donnerait « 9999 » et personne ne le relirait.
  return annee >= 1000 && annee <= 2999 ? annee : null;
}

/** Traduit une notice moissonnée. `null` quand elle n'a pas de titre. */
export function mapperOaiDc(metadonnees: Record<string, unknown> | null): NoticeExtraite | null {
  const dc = extraireDc(metadonnees);
  if (!dc) return null;

  const titres = liste(dc.title);
  const title = titres[0];
  if (!title) return null;

  const createurs = liste(dc.creator);
  const contributeurs = liste(dc.contributor);

  const typeBrut = premier(dc.type)?.toLowerCase() ?? '';
  const reconnu = typeBrut && estUnTypeDeNotice(typeBrut);

  return {
    title,
    // ⚠ Un second `dc:title` est un complément, pas un doublon à jeter.
    titleComplement: titres[1] ?? null,
    author: createurs[0] ?? null,
    contributors: [
      ...createurs.map((name) => ({ name, role: 'AUTEUR_PRINCIPAL' as const })),
      ...contributeurs.map((name) => ({ name, role: 'AUTEUR_SECONDAIRE' as const })),
    ],
    // `dc:identifier` porte de tout — URL, DOI, ISBN. On ne retient que ce qui
    // a la FORME d'un ISBN, plutôt que de ranger une URL dans une colonne ISBN.
    isbn: liste(dc.identifier).find((v) => /^(97[89])?[\d-]{9,17}[\dxX]$/.test(v.replace(/\s/g, ''))) ?? null,
    publishYear: anneeDepuisDate(premier(dc.date)),
    language: premier(dc.language) ?? 'fr',
    publisher: premier(dc.publisher),
    summary: premier(dc.description),
    keywords: liste(dc.subject),
    recordType: reconnu ? typeBrut : DEFAULT_RECORD_TYPE,
    // ⚠ COMPTÉ, PAS AVALÉ : un repli silencieux ferait d'une thèse un ouvrage,
    // donc une notice absente d'ETD-MS que personne n'irait chercher.
    typeNonReconnu: typeBrut && !reconnu ? typeBrut : null,
  };
}
