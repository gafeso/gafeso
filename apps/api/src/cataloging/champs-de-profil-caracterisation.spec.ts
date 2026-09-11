import { describe, expect, it } from 'vitest';
import {
  buildUnimarcFields,
  recordToMarcxmlElement,
  type MarcExportRecord,
} from './marc-export';
import { buildRecordSearchDoc } from '../search/search.service';
import { CHAMPS_PAR_PROFIL } from './profil-de-notice';

/**
 * CARACTÉRISATION AVANT P3-3 — ce que les consommateurs font AUJOURD'HUI des
 * trois champs de profil que P3-3 doit extraire.
 *
 * ⚠ CE TEST EST ÉCRIT AVANT LA MODIFICATION, ET C'EST TOUT SON INTÉRÊT. P3-3
 * promet de déplacer `publicationCity`, `defensePlace` et `defenseUniversity`
 * SANS changer ce que quiconque obtient. Une telle promesse ne se prouve pas
 * par relecture : elle se prouve par un enregistrement pris avant, qui passe
 * encore après.
 *
 * Il vit au niveau où le code est APPELABLE — les constructeurs de documents —
 * et non au niveau HTTP, qui exigerait une session pour la moitié des surfaces.
 * C'est la leçon du gel de `/opac/records/:id` : chercher le bon niveau, pas le
 * bon outil.
 */

/**
 * Une notice académique portant les trois champs, et rien d'aléatoire.
 *
 * ⚠ TYPÉE, SANS `as unknown as`. Une première version passait par ce cast : le
 * compilateur se taisait, et `items` manquait — le test échouait au chargement
 * avec « record.items is not iterable », donc sans rien éprouver. Un cast qui
 * force un type est un test en moins, pas une commodité.
 */
const NOTICE: MarcExportRecord = {
  id: 'rec-caracterisation',
  title: 'Architecture des ordinateurs en Afrique de l’Ouest',
  titleComplement: 'édition revue',
  isbn: 'EXEMPLE-1301',
  publishYear: 2018,
  language: 'fr',
  publisher: 'Presses universitaires d’Exemple',
  publicationCity: 'Ouagadougou',
  defenseUniversity: 'Université d’Exemple — Ouagadougou',
  defensePlace: 'Amphithéâtre B — Exemple',
  recordType: 'these',
  category: 'informatique',
  contributors: [
    { name: 'Ouédraogo, Awa', role: 'AUTEUR_PRINCIPAL', position: 0 },
    { name: 'Kaboré, Salif', role: 'DIRECTEUR_MEMOIRE', position: 1 },
  ],
  keywords: ['informatique'],
  items: [],
};

/** Ce que le document de recherche attend en plus de l'export. */
const POUR_LA_RECHERCHE = {
  ...NOTICE,
  author: 'Ouédraogo, Awa',
  summary: 'Résumé d’exemple.',
  coverUrl: null,
};

describe('caractérisation — les trois champs dans l’export UNIMARC', () => {
  const zones = buildUnimarcFields(NOTICE);

  it('la ville d’édition est en 210$a', () => {
    const z210 = zones.find((z) => z[0] === '210');
    expect(z210).toBeDefined(); // témoin : la zone existe
    expect(z210!.join('|')).toContain('Ouagadougou');
  });

  it('l’université ET le lieu de soutenance sont en 328, sous-champs c et e', () => {
    const z328 = zones.find((z) => z[0] === '328');
    expect(z328).toBeDefined(); // témoin
    const contenu = z328!.join('|');
    expect(contenu).toContain('Université d’Exemple — Ouagadougou');
    expect(contenu).toContain('Amphithéâtre B — Exemple');
  });

  it('⚠ EMPREINTE DU MARCXML : figée à l’octet', () => {
    // Le seul contrôle qui prouve « rien n'a changé ». Si P3-3 fait bouger un
    // seul caractère de cet export, ce test le dit — et si c'est voulu, il faut
    // l'annoncer et le réécrire sciemment.
    expect(recordToMarcxmlElement(NOTICE)).toMatchSnapshot();
  });
});

describe('caractérisation — les trois champs dans le document de recherche', () => {
  const doc = buildRecordSearchDoc(POUR_LA_RECHERCHE);

  it('⚠ `defenseUniversity` est présent, AU PREMIER NIVEAU du document', () => {
    // C'est l'invariant qui décide du coût de P3-3. Tant que le document garde
    // ce champ au même endroit avec la même valeur, l'index ne change pas —
    // donc AUCUNE réindexation n'est due. Le jour où l'extraction imbrique ce
    // champ, c'est une réindexation de chaque établissement, sur les deux
    // moteurs.
    expect(doc).toHaveProperty('defenseUniversity', 'Université d’Exemple — Ouagadougou');
  });

  it('les deux autres champs de profil ne sont PAS dans l’index', () => {
    // Établi par le relevé §3 : ils sont nommés par l'export, l'OAI et le SRU,
    // jamais par la recherche. Ce test fixe ce fait, pour que P3-3 ne croie pas
    // devoir les préserver côté moteur.
    expect(doc).not.toHaveProperty('publicationCity');
    expect(doc).not.toHaveProperty('defensePlace');
  });

  it('⚠ EMPREINTE DU DOCUMENT DE RECHERCHE : figée à l’octet', () => {
    expect(doc).toMatchSnapshot();
  });
});

describe('caractérisation — les trois champs sont bien ceux que P3-3 vise', () => {
  it('les trois figurent dans les profils déclarés, et nulle part ailleurs', () => {
    const declares = Object.values(CHAMPS_PAR_PROFIL).flat();
    for (const champ of ['publicationCity', 'defenseUniversity', 'defensePlace']) {
      expect(declares, champ).toContain(champ);
    }
  });
});
