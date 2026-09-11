import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'child_process';
import { catalogToMarcxchange, recordToMarcxmlElement } from './marc-export';
import {
  ANCIEN_PREFIX_MARCXML,
  MARCXCHANGE_FORMAT,
  MARCXCHANGE_NAMESPACE,
  MARCXCHANGE_PREFIX,
  MARCXCHANGE_SCHEMA_URL,
  messageAncienPrefixe,
  versMarcxchange,
} from './unimarc-xml';

const NOTICE = {
  id: 'r1',
  title: 'Titre',
  titleComplement: null,
  isbn: null,
  publishYear: 2020,
  language: 'fr',
  publisher: null,
  publicationCity: null,
  defenseUniversity: 'Université d’Exemple',
  defensePlace: null,
  category: 'droit',
  recordType: 'Thèse',
  contributors: [{ name: 'A. Auteur', role: 'AUTEUR_PRINCIPAL', position: 0 }],
  keywords: ['droit'],
  items: [],
};

describe('marcxchange — on adopte la norme, on ne la réinvente pas', () => {
  it('l’espace de noms et le schéma sont ceux d’ISO 25577, pas les nôtres', () => {
    // Inventer un espace de noms après avoir corrigé une affirmation fausse
    // aurait été la version douce de la même faute.
    expect(MARCXCHANGE_NAMESPACE).toBe('info:lc/xmlns/marcxchange-v2');
    expect(MARCXCHANGE_SCHEMA_URL).toContain('loc.gov/standards/iso25577');
    expect(MARCXCHANGE_NAMESPACE).not.toContain('gafeso');
  });

  it('le refus de l’ancien préfixe NOMME son remplaçant', () => {
    const message = messageAncienPrefixe();
    expect(message).toContain(ANCIEN_PREFIX_MARCXML);
    expect(message).toContain(MARCXCHANGE_PREFIX);
    // Un refus qui ne dit pas quoi demander laisse le moissonneur sans issue.
    expect(message).toContain(MARCXCHANGE_NAMESPACE);
  });

  it('le leader MARC21 n’est plus émis en XML (facultatif en 2.0)', () => {
    // Gafeso ne calcule aucun label ISO 2709 : il en émettait une constante de
    // forme MARC21. Sous format="UNIMARC", l'écrire serait un mensonge de plus.
    const xml = versMarcxchange(recordToMarcxmlElement(NOTICE), false);
    expect(xml).not.toContain('<leader>');
    expect(xml).not.toContain('4500');
    // …mais il reste dans l'ISO 2709, où la norme l'exige (voir marc-export.spec).
  });
});

describe('marcxchange — la sortie n’affirme plus du MARC21', () => {
  it('la collection exportée porte l’espace de noms MarcXchange', () => {
    const xml = catalogToMarcxchange([NOTICE]);
    expect(xml).toContain(`<collection xmlns="${MARCXCHANGE_NAMESPACE}">`);
    expect(xml).not.toContain('loc.gov/MARC21');
  });

  it('chaque notice DÉCLARE son dialecte au lieu de le laisser deviner', () => {
    const xml = catalogToMarcxchange([NOTICE]);
    expect(xml).toContain(`format="${MARCXCHANGE_FORMAT}"`);
  });

  it('les zones émises sont bien de l’UNIMARC (200 titre, 700 auteur principal)', () => {
    // Le fond du problème : en MARC21, 700 est une entrée SECONDAIRE. C'est
    // parce que ces zones sont UNIMARC que l'annonce MARC21 était fausse.
    const xml = recordToMarcxmlElement(NOTICE);
    expect(xml).toContain('tag="200"');
    expect(xml).toContain('tag="700"');
  });
});

/**
 * CONTRÔLE NÉGATIF au niveau du dépôt.
 *
 * La cause racine n'était pas une ligne fausse : c'était la MÊME affirmation
 * recopiée à trois endroits indépendants (entrepôt OAI, export, écran
 * d'interopérabilité), qu'aucun test ne reliait. Ce garde-fou échoue si
 * quiconque réintroduit une affirmation MARC21 ailleurs que dans le client SRU
 * vers la Library of Congress — le seul endroit où elle est vraie.
 */
describe('marcxchange — aucune affirmation MARC21 résiduelle', () => {
  const AUTORISE = [
    // Gafeso CLIENT de la LoC : du vrai MARC21 entrant. Doit rester.
    'apps/api/src/sru/',
    'docs/interop-recuperation-notices.md',
    // Documents qui DÉCRIVENT le défaut (ou ce garde-fou) : le citer est leur
    // objet même. Tout ajout ici doit être un document, jamais du code servi.
    'docs/architecture-notice.md',
    'docs/DEMARRER-FRONT.md',
    'architecture-cible-gafeso.md',
    'apps/api/src/cataloging/unimarc-xml.ts',
    'apps/api/src/cataloging/unimarc-xml.spec.ts',
    // Copie du schéma de la norme, gardée pour valider notre sortie hors ligne.
    'apps/api/src/cataloging/__fixtures__/',
    // La recette elle-même : son contrôle négatif REJOUE l'ancien espace de noms.
    'scripts/recette-marcxchange.sh',
  ];

  it('« MARC21slim » / « MARC21/slim » n’apparaît plus dans le code servi', () => {
    // ⚠ `__dirname` et non `import.meta.url` : vitest accepte les deux, mais
    // `tsc` refuse `import.meta` sous le `module` de ce projet — et depuis que
    // le script `test` appelle `tsc`, un refus de compilation est un test rouge.
    const racine = join(__dirname, '../../../../');
    const brut = execFileSync(
      'git',
      // `--untracked` : sans lui, un fichier tout juste créé n'est pas vu, et le
      // garde-fou ne se déclencherait qu'au `git add` — trop tard pour prévenir
      // celui qui l'écrit. Constaté sur ce lot même.
      ['grep', '-Il', '--untracked', '-e', 'MARC21slim', '-e', 'MARC21/slim', '--', '.', ':!apps/api/dist'],
      { cwd: racine, encoding: 'utf-8' },
    ).trim();
    // Témoin positif : la recherche DOIT ramener quelque chose (le client SRU),
    // sans quoi elle ne prouverait rien — une sortie vide n'est pas une preuve.
    const fichiers = brut ? brut.split('\n') : [];
    expect(fichiers.length).toBeGreaterThan(0);

    const fautifs = fichiers.filter((f) => !AUTORISE.some((prefixe) => f.startsWith(prefixe)));
    expect(fautifs).toEqual([]);
  });
});
