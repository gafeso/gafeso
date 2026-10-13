import { describe, expect, it } from 'vitest';

import { DEFENSE_RECORD_TYPES, RECORD_TYPES } from '../cataloging/description-profiles';
import {
  COVER_DOMAINS,
  COVER_DOMAIN_DEFAUT,
  COVER_TEMPLATES,
  COVER_TEMPLATE_DEFAUT,
  _TABLES_POUR_GARDES,
  domaineDeCouverture,
  gabaritDeCouverture,
} from './couverture';

/**
 * ⭐⭐ LES DEUX TABLES DE COUVERTURE — exhaustives, et mesurées.
 *
 * ## ⚠ CE QUE CE GARDE EXISTE POUR EMPÊCHER
 *
 * Un `recordType` ou une `category` ajoutés au produit tomberaient dans le
 * REPLI sans un mot. Pour le type, ça veut dire « MANUEL / COURS » sur une
 * soutenance ; pour le domaine, une teinte neutre là où une teinte propre
 * existe. Les deux sont des dégradations SILENCIEUSES — rien ne casse, la
 * couverture s'affiche, et elle désigne autre chose.
 *
 * ⭐ Le garde part donc du VOCABULAIRE DU PRODUIT (`RECORD_TYPES`, et les dix
 * catégories de la spécification) et exige une entrée pour chacun. Un
 * vocabulaire qui s'étend convoque quelqu'un ici.
 *
 * ## ⚠ ET LA TEINTE N'EST PAS DANS L'API, elle est VÉRIFIÉE depuis la spécification
 *
 * Les hexadécimaux vivent dans `docs/specification-couverture-composee.md` §9.
 * Ce garde les LIT là-bas pour mesurer leur contraste — il ne les recopie pas :
 * « un garde qui compare une copie à une copie ne garde rien ».
 */

describe('les deux tables de couverture', () => {
  // ═════════════════════════════════════════════════════════════════════
  // ① LE GABARIT — exhaustif sur RECORD_TYPES
  // ═════════════════════════════════════════════════════════════════════

  it('🔴 CHAQUE type du produit a son gabarit — aucun ne tombe dans le repli', () => {
    // ⚠ TÉMOIN DE COMPTE : sept types au vocabulaire. La décision de Jean en
    // nommait QUATRE ; les trois autres sont des soutenances déclarées, pas des
    // inconnues, et les verser au repli mettrait « MANUEL / COURS » sur un
    // mémoire de master.
    expect(RECORD_TYPES.length, 'le vocabulaire du produit porte sept types').toBe(7);

    const manquants = RECORD_TYPES.filter(
      (t) => !(t in _TABLES_POUR_GARDES.GABARIT_PAR_TYPE),
    );
    expect(
      manquants,
      'un type du produit sans gabarit déclaré : il tomberait dans le repli ' +
        '`manuel`, c’est-à-dire « MANUEL / COURS » sur un document qui n’en est ' +
        'pas un. Déclarez-le dans GABARIT_PAR_TYPE.',
    ).toEqual([]);
  });

  it('⭐ et les trois soutenances non nommées suivent la classification DU PRODUIT', () => {
    // On ne les a pas rangées au jugé : `DEFENSE_RECORD_TYPES` les déclare
    // soutenances, et le produit porte déjà `these` et `memoire` parmi elles.
    const nonNommes = ['licence', 'master', 'these_unique'] as const;
    for (const t of nonNommes) {
      expect(
        (DEFENSE_RECORD_TYPES as readonly string[]).includes(t),
        `\`${t}\` doit être une soutenance déclarée — sinon le motif de son ` +
          'gabarit ne tient plus, et il faut le reprendre.',
      ).toBe(true);
      expect(
        ['these', 'memoire'],
        `une soutenance ne reçoit que \`these\` ou \`memoire\``,
      ).toContain(gabaritDeCouverture(t));
    }
    // Les quatre tranchés, tels quels.
    expect(gabaritDeCouverture('these')).toBe('these');
    expect(gabaritDeCouverture('memoire')).toBe('memoire');
    expect(gabaritDeCouverture('publication')).toBe('article');
    expect(gabaritDeCouverture('ouvrage')).toBe('manuel');
  });

  it('⚠ TÉMOIN D’ABSENCE : un type HORS vocabulaire tombe bien sur le repli', () => {
    // Sans ce cas, une table qui rendrait toujours `manuel` serait
    // indiscernable d'une table juste — et plus rassurante, puisqu'elle ne
    // manque jamais.
    for (const inconnu of ['', '   ', 'brochure', 'DVD', 'these-de-doctorat']) {
      expect(gabaritDeCouverture(inconnu), `\`${inconnu}\``).toBe(COVER_TEMPLATE_DEFAUT);
    }
    expect(gabaritDeCouverture(null)).toBe(COVER_TEMPLATE_DEFAUT);
    expect(gabaritDeCouverture(undefined)).toBe(COVER_TEMPLATE_DEFAUT);
    // Et le repli est bien DANS la liste fermée.
    expect(COVER_TEMPLATES).toContain(COVER_TEMPLATE_DEFAUT);
  });

  it('⚠ quatre gabarits du fournisseur sont INATTEIGNABLES, et c’est un FAIT, pas un défaut', () => {
    // Le fournisseur livre huit gabarits ; le vocabulaire du produit n'en
    // atteint que quatre. Les quatre autres attendent un vocabulaire qui ne
    // les demande pas encore — `rapport_stage`, `rapport`, `actes`, `guide`.
    //
    // ⭐ Ce cas est un COMPTE, pas une interdiction : le jour où `recordType`
    // gagne « rapport de stage », il convoque quelqu'un ici plutôt que de
    // laisser le gabarit dormir.
    const atteints = new Set(RECORD_TYPES.map((t) => gabaritDeCouverture(t)));
    const inatteignables = COVER_TEMPLATES.filter((g) => !atteints.has(g)).sort();
    expect(inatteignables).toEqual(['actes', 'guide', 'rapport', 'rapport_stage']);
    expect(atteints.size, 'quatre gabarits servis').toBe(4);
  });

  // ═════════════════════════════════════════════════════════════════════
  // ② LE DOMAINE — exhaustif sur les catégories de la spécification
  // ═════════════════════════════════════════════════════════════════════

  it('🔴 CHAQUE catégorie de la spécification a son domaine', () => {
    const categories = Object.keys(_TABLES_POUR_GARDES.DOMAINE_PAR_CATEGORIE);
    // ⚠ TÉMOIN DE COMPTE : dix catégories, celles de §3.2.
    expect(categories.length, 'dix catégories nommées').toBe(10);
    for (const c of categories) {
      expect(
        domaineDeCouverture(c),
        `\`${c}\` ne doit PAS tomber sur le repli`,
      ).not.toBe(COVER_DOMAIN_DEFAUT);
      expect(COVER_DOMAINS, `\`${c}\` rend un domaine hors liste`).toContain(
        domaineDeCouverture(c),
      );
    }
  });

  it('⭐ le repli est `autre`, DISTINCT d’`economie` — même si leur teinte est la même', () => {
    // 🔴 LA FAUTE QUE CETTE DISTINCTION ÉVITE. Jean a tranché « inconnue →
    // #3D4A54 », qui est aussi la teinte d'`economie`. Partager une COULEUR est
    // sans conséquence — c'est un repère. Partager la CLÉ ferait AFFIRMER à une
    // notice hors vocabulaire qu'elle relève de l'économie, et « un fond de
    // domaine faux est pire qu'un fond neutre : il affirme un classement ».
    expect(COVER_DOMAIN_DEFAUT).toBe('autre');
    expect(COVER_DOMAIN_DEFAUT).not.toBe('economie');
    expect(COVER_DOMAINS).toContain('autre');
    for (const inconnue of ['', '  ', 'agronomie', 'THÉOLOGIE', 'sciences-po']) {
      expect(domaineDeCouverture(inconnue), `\`${inconnue}\``).toBe('autre');
    }
    expect(domaineDeCouverture(null)).toBe('autre');
  });

  it('🔴 NFC à la frontière : la même catégorie, deux formes Unicode, UN domaine', () => {
    // ⚠ Les deux formes s'écrivent en ÉCHAPPEMENTS — « la forme d'un caractère
    // dans un fichier source ne se lit pas, elle s'écrit ».
    const NFD = 'Médecine'; // e + U+0301
    const NFC = 'Médecine';
    expect(NFD.length, 'la décomposée porte un caractère de plus').toBe(NFC.length + 1);
    expect(NFD).not.toBe(NFC);
    // ⚠ `medecine` est SANS accent au vocabulaire : les deux doivent donc
    // tomber sur le repli, et surtout tomber sur LE MÊME.
    expect(domaineDeCouverture(NFD)).toBe(domaineDeCouverture(NFC));
    // Et la forme du vocabulaire, elle, est reconnue quelle que soit la casse.
    expect(domaineDeCouverture('MEDECINE')).toBe('medecine');
    expect(domaineDeCouverture('  medecine  ')).toBe('medecine');
  });

  // ═════════════════════════════════════════════════════════════════════
  // ③ LES TEINTES — lues dans la SPÉCIFICATION, et mesurées
  // ═════════════════════════════════════════════════════════════════════

  it('🔴 chaque domaine a une teinte dans la spécification, et elle passe AA sur blanc', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const SPEC = readFileSync(
      join(__dirname, '..', '..', '..', '..', 'docs', 'specification-couverture-composee.md'),
      'utf-8',
    );
    const s9 = SPEC.slice(SPEC.indexOf('## 9.'));
    expect(s9.length, 'la section 9 doit exister').toBeGreaterThan(500);

    // La table de §9 : `| \`cle\` | \`#HEX\` | … |`
    const teintes = new Map(
      [...s9.matchAll(/^\|\s*`([a-z]+)`\s*\|\s*`(#[0-9A-Fa-f]{6})`/gm)].map((m) => [
        m[1],
        m[2].toUpperCase(),
      ]),
    );
    // ⚠ TÉMOIN DE COMPTE : onze domaines, `autre` compris.
    expect(
      teintes.size,
      'la table de teintes de §9 doit couvrir les onze domaines',
    ).toBe(COVER_DOMAINS.length);

    const luminance = (hex: string) =>
      [1, 3, 5]
        .map((i) => parseInt(hex.substr(i, 2), 16) / 255)
        .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
        .reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);

    for (const domaine of COVER_DOMAINS) {
      const hex = teintes.get(domaine);
      expect(hex, `\`${domaine}\` n’a pas de teinte déclarée en §9`).toBeDefined();
      const contraste = 1.05 / (luminance(hex as string) + 0.05);
      expect(
        contraste,
        `blanc sur \`${domaine}\` (${hex}) vaut ${contraste.toFixed(2)}:1 — sous ` +
          '4,5:1, le titre cesse d’être lisible, et le texte de cette couverture ' +
          'est TOUJOURS blanc.',
      ).toBeGreaterThanOrEqual(4.5);
    }

    // ⭐ ET LE TÉMOIN QUI PROUVE QUE LA FORMULE DISCRIMINE : l'orange de marque
    // ne passe PAS. Sans lui, une formule fausse ferait passer tout le monde.
    const orange = 1.05 / (luminance('#E07A2B') + 0.05);
    expect(
      orange,
      'si l’orange de marque passait AA sur blanc, la formule serait fausse',
    ).toBeLessThan(4.5);
  });

  it('🔴 `litterature`, `langues` et `arts` ont TROIS clés et TROIS teintes distinctes', async () => {
    // ⚠ SIGNALÉ PAR LE MOBILE le 12/10/2026 : « une fusion Lettres ». Mesuré,
    // elle ne vient PAS de l'API — « Lettres » est un libellé du FOURNISSEUR,
    // dont la palette décrit dix DOMAINES ÉDITORIAUX où nos trois catégories
    // n'ont aucun équivalent un-pour-un.
    //
    // ⭐ Ce cas EXISTE pour que la fusion ne puisse pas s'introduire plus tard :
    // trois catégories qui tomberaient sur une même clé perdraient le seul
    // service d'un repère — se distinguer.
    const trois = ['litterature', 'langues', 'arts'] as const;
    const cles = trois.map((c) => domaineDeCouverture(c));
    expect(new Set(cles).size, 'trois clés distinctes').toBe(3);
    expect(cles, 'et chacune porte son propre nom').toEqual([...trois]);

    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const SPEC = readFileSync(
      join(__dirname, '..', '..', '..', '..', 'docs', 'specification-couverture-composee.md'),
      'utf-8',
    );
    const s9 = SPEC.slice(SPEC.indexOf('## 9.'));
    const teintes = new Map(
      [...s9.matchAll(/^\|\s*`([a-z]+)`\s*\|\s*`(#[0-9A-Fa-f]{6})`/gm)].map((m) => [
        m[1],
        m[2].toUpperCase(),
      ]),
    );
    const hex = trois.map((c) => teintes.get(c));
    expect(hex.every(Boolean), 'les trois ont une teinte déclarée').toBe(true);
    expect(new Set(hex).size, 'et trois teintes distinctes').toBe(3);

    // ⚠ TÉMOIN D'ABSENCE : « Lettres » n'est nulle part dans la résolution.
    const source = readFileSync(join(__dirname, 'couverture.ts'), 'utf-8');
    expect(source.length, 'témoin : le module a bien été lu').toBeGreaterThan(2000);
    expect(
      source,
      'un libellé éditorial du fournisseur ne doit pas entrer dans la résolution : ' +
        'l’API sert des CLÉS, et la palette est une intention de design.',
    ).not.toContain('Lettres');
  });

  it('⚠ et `autre` partage bien la teinte d’`economie` — c’est la décision, pas un accident', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const SPEC = readFileSync(
      join(__dirname, '..', '..', '..', '..', 'docs', 'specification-couverture-composee.md'),
      'utf-8',
    );
    const s9 = SPEC.slice(SPEC.indexOf('## 9.'));
    const teintes = new Map(
      [...s9.matchAll(/^\|\s*`([a-z]+)`\s*\|\s*`(#[0-9A-Fa-f]{6})`/gm)].map((m) => [
        m[1],
        m[2].toUpperCase(),
      ]),
    );
    expect(
      teintes.get('autre'),
      'la teinte du repli est celle d’`economie` — si ça change, c’est une ' +
        'décision à écrire, pas une correction à faire.',
    ).toBe(teintes.get('economie'));
    // Les dix AUTRES sont distinctes : une teinte partagée de plus rendrait le
    // repère moins utile, et ce compte le dirait.
    const nommees = COVER_DOMAINS.filter((d) => d !== 'autre').map((d) => teintes.get(d));
    expect(new Set(nommees).size, 'les dix domaines nommés ont dix teintes').toBe(10);
  });
});
