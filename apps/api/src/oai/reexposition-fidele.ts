import { Record as MarcRecord } from 'marcjs';
import { porteDuNatif } from '../cataloging/metadonnees-natives';
import { GABARIT_LEADER, ouvertureRecord } from '../cataloging/unimarc-xml';

/**
 * RÉEXPOSITION FIDÈLE D'UNE NOTICE IMPORTÉE — la promesse d'I3, tenue.
 *
 * ⚠ CE QU'ON RÉEXPOSAIT JUSQU'ICI ÉTAIT UNE RECONSTRUCTION. P2 l'avait établi
 * en une phrase : « une notice importée d'un système tiers perd son format
 * natif à l'entrée ; ce qu'on réexporte est une reconstruction ». L'export
 * marcxchange repartait de la notice PLATE — titre, auteur, ISBN… — et
 * rebâtissait des zones MARC à partir d'elle. Tout ce que la source portait et
 * que le modèle plat n'accueille pas (zones locales, notes, liens, indicateurs
 * particuliers) disparaissait en silence.
 *
 * I3 dit « ce qui arrive dans un format y reste ». P3-1 a posé la couche qui le
 * conserve (`marcData` + `marcFormat`, protégés contre l'écrasement). Ce module
 * la LIT : quand une notice porte sa description d'origine, c'est ELLE qu'on
 * réexpose, à l'identique.
 *
 * ⚠ ET LE DIALECTE DÉCLARÉ EST CELUI DE LA NOTICE. Une notice importée en
 * MARC21 sort avec `format="MARC21"`. Annoncer `UNIMARC` sur du MARC21 natif
 * serait indétectable par le moissonneur — les deux ont la même forme XML — et
 * c'est précisément ce qu'I4 interdit.
 */

/** Forme de la description d'origine telle que l'import l'écrit. */
export interface DescriptionNative {
  leader?: unknown;
  fields?: unknown;
}

/**
 * Réexpose la description d'ORIGINE en marcxchange, ou rend `null` si la notice
 * n'en porte pas.
 *
 * ⚠ REND `null` PLUTÔT QU'UN DOCUMENT VIDE. L'appelant doit pouvoir choisir la
 * reconstruction : une notice saisie dans Gafeso n'a jamais eu de MARC, et lui
 * servir un `<record/>` vide serait affirmer qu'elle n'a pas de description.
 */
export function versMarcxchangeDepuisNatif(
  natif: unknown,
  formatDeclare: string,
): string | null {
  if (!porteDuNatif(natif)) return null;

  const source = natif as DescriptionNative;
  const champs = Array.isArray(source.fields) ? source.fields : [];

  const r = new MarcRecord();
  for (const champ of champs) r.append(champ as never);
  // marcjs écrit TOUJOURS un `<leader>` : vide si on ne lui en a pas donné.
  if (typeof source.leader === 'string') r.leader = source.leader;
  const xml = r.as('marcxml') as string;

  // ⚠ CE CHEMIN NE PASSE PAS PAR `versMarcxchange`, ET LA DIFFÉRENCE EST LE
  // CŒUR DU LOT : cette fonction RETIRE le leader, à raison — celui des
  // reconstructions est une constante `00000nam a2200000 a 4500`, donc une
  // affirmation fausse sous `format="UNIMARC"`.
  //
  // Ici le leader est RÉEL : il vient de la source. Il porte le type de notice,
  // le niveau bibliographique et le statut, qu'un moissonneur lit pour classer.
  // Le retirer perdrait de l'information reçue ; le remplacer changerait le
  // sens de la notice sans toucher à une seule zone.
  //
  // Le motif est donc le même dans les deux cas — n'affirmer que ce qu'on
  // sait — et il conduit à deux gestes opposés. C'est pourquoi les deux
  // chemins restent séparés plutôt que réglés par un drapeau.
  const garderLeader =
    typeof source.leader === 'string' && GABARIT_LEADER.test(source.leader);
  const corps = garderLeader
    ? xml
    : xml.replace(/^[ \t]*<leader>[^<]*<\/leader>\r?\n?/m, '');

  return corps.replace('<record>', ouvertureRecord(true, formatDeclare));
}
