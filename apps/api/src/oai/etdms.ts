import { lireChampsDeProfil } from '../cataloging/champs-de-profil';
import { tag, xmlEscape } from './oai-xml';

/**
 * ETD-MS v1.1 — la norme de métadonnées des THÈSES ÉLECTRONIQUES.
 *
 * ⭐ C'est le différenciant de Gafeso : un fonds académique décrit en ETD-MS est
 * moissonnable par les portails de thèses, qui ne savent pas quoi faire d'un
 * Dublin Core simple — il n'y a nulle part, dans `oai_dc`, où mettre le
 * directeur, le diplôme ni l'université de soutenance.
 *
 * ⚠ IL N'EST PROPOSÉ QUE POUR LE PROFIL `academique` (I4). Exposer une notice
 * bibliographique en ETD-MS serait annoncer une thèse là où il y a un ouvrage :
 * un moissonneur de thèses l'enregistrerait comme telle, et la faute voyagerait
 * hors de chez nous. « Ne jamais annoncer un format qu'on ne produit pas
 * fidèlement » vaut aussi pour le CONTENU qu'on y verse.
 *
 * ⚠ ET UNE NOTICE ACADÉMIQUE INCOMPLÈTE SORT QUAND MÊME, champs absents. 45 des
 * 162 notices académiques du fonds n'ont pas d'université de soutenance :
 * OMETTRE l'élément est honnête, l'inventer ne le serait pas. C'est la même
 * règle que le vide qui n'affirme rien.
 */

export const ETDMS_PREFIX = 'etdms';
export const ETDMS_NAMESPACE = 'http://www.ndltd.org/standards/metadata/etdms/1.0/';
export const ETDMS_SCHEMA_URL =
  'http://www.ndltd.org/standards/metadata/etdms/1.0/etdms.xsd';

/** Le profil dont les notices sont exposables en ETD-MS. */
export const PROFIL_ETDMS = 'academique';

/**
 * Correspondance `recordType` → `thesis.degree.level`.
 *
 * ⚠ INCOMPLÈTE DÉLIBÉRÉMENT. `memoire` n'y figure pas : un mémoire peut être de
 * licence comme de master selon l'établissement, et ETD-MS attend un niveau
 * précis. Deviner remplirait la case d'une valeur fausse dans la moitié des cas,
 * et un portail de thèses la croirait. L'absence, elle, se lit comme une
 * absence.
 */
export const NIVEAUX_DIPLOME: Record<string, string> = {
  licence: 'Bachelors',
  master: 'Masters',
  these: 'Doctoral',
  these_unique: 'Doctoral',
};

export interface NoticeEtdms {
  id: string;
  title: string;
  titleComplement: string | null;
  publisher: string | null;
  summary: string | null;
  publishYear: number | null;
  language: string;
  recordType: string;
  category: string | null;
  profile: string;
  profileData: unknown;
  contributors: { name: string; role: string; position: number }[];
  keywords: { keyword: { name: string } }[];
}

/** Une notice est-elle exposable en ETD-MS ? */
export function exposableEnEtdms(notice: { profile: string }): boolean {
  return notice.profile === PROFIL_ETDMS;
}

/**
 * Construit le corps `<thesis>` d'ETD-MS pour une notice ACADÉMIQUE.
 *
 * ⚠ L'appelant doit avoir vérifié `exposableEnEtdms` : cette fonction ne juge
 * pas du profil, elle décrit. Séparer les deux permet au test de vérifier le
 * REFUS là où il est pris — dans le service — au lieu de le dissoudre ici.
 */
export function versEtdms(r: NoticeEtdms, identifiantOai: string, indent: string): string {
  const profil = lireChampsDeProfil(r.profileData);
  const lignes: string[] = [];

  lignes.push(tag('title', r.titleComplement ? `${r.title} : ${r.titleComplement}` : r.title));

  // Auteurs et directeurs sont DISTINGUÉS — c'est tout l'intérêt d'ETD-MS. En
  // Dublin Core, le directeur tombait dans `dc:contributor`, indistinct d'un
  // préfacier ou d'un traducteur.
  const ordonnes = [...r.contributors].sort((a, b) => a.position - b.position);
  for (const c of ordonnes) {
    if (c.role === 'DIRECTEUR_MEMOIRE') {
      lignes.push(`<contributor role="advisor">${xmlEscape(c.name)}</contributor>`);
    } else {
      lignes.push(tag('creator', c.name));
    }
  }

  for (const k of r.keywords) lignes.push(tag('subject', k.keyword.name));
  lignes.push(tag('description', r.summary));
  lignes.push(tag('publisher', r.publisher));
  lignes.push(tag('date', r.publishYear != null ? String(r.publishYear) : null));
  lignes.push(tag('type', r.recordType));
  lignes.push(tag('identifier', identifiantOai));
  lignes.push(tag('language', r.language));

  // ── <degree> : le bloc qui n'a AUCUN équivalent en Dublin Core.
  //
  // ⚠ IL N'EST ÉMIS QUE S'IL PORTE QUELQUE CHOSE. Un `<degree/>` vide
  // annoncerait un diplôme dont on ne sait rien — pire qu'une absence, parce
  // qu'un portail le compterait comme renseigné.
  const degre: string[] = [];
  degre.push(tag('level', NIVEAUX_DIPLOME[r.recordType] ?? null));
  degre.push(tag('discipline', r.category));
  degre.push(tag('grantor', profil.defenseUniversity));
  const degreRempli = degre.filter(Boolean);
  if (degreRempli.length > 0) {
    lignes.push(
      `<degree>\n${degreRempli.map((l) => `${indent}  ${l}`).join('\n')}\n${indent}</degree>`,
    );
  }

  // ⚠ `defensePlace` N'A PAS DE PLACE DANS ETD-MS, et on ne l'y force pas. La
  // norme n'a pas d'élément pour le lieu de soutenance ; le glisser dans
  // `description` ou dans un `degree.grantor` composite le rendrait
  // inexploitable et mensonger. Il reste disponible en marcxchange (328$e).

  const corps = lignes
    .filter(Boolean)
    .map((l) => `${indent}${l}`)
    .join('\n');

  return (
    `${indent}<thesis xmlns="${ETDMS_NAMESPACE}" ` +
    'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
    `xsi:schemaLocation="${ETDMS_NAMESPACE} ${ETDMS_SCHEMA_URL}">\n` +
    corps +
    `\n${indent}</thesis>`
  );
}
