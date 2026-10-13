/**
 * ⭐⭐ LA PARITÉ AVEC LE MOBILE — la référence est l'autorité, et on la LIT.
 *
 * `docs/couvertures/references-parite.json` est produit par la session mobile.
 * Ce fichier ne recopie AUCUNE de ses valeurs : il le lit et reproduit les
 * cinq titres. « En cas d'écart, c'est le web qui a tort » (décision du
 * 12 octobre 2026).
 *
 * ## ⚠ CE QUE LA MESURE A CORRIGÉ : il n'y a AUCUN xorshift
 *
 * La consigne disait « graine FNV-1a […] xorshift32 ». La référence dit autre
 * chose, et c'est elle qui fait foi : la dérivation est faite de **tranches de
 * la graine espacées de cinq bits** — `dx` à 0, `dy` à 5, `echelle` à 10,
 * `rotation` à 15, `elements` à 20, `opacite` à 24.
 *
 * ⚠ **Zéro xorshift ne reproduit ces valeurs** : les 32×32×32 triplets de
 * décalages ont été balayés dans les deux sens, en exigeant `dy` au pas 1.
 * Aucune solution. Et `dx` sort de la graine BRUTE, ce qu'un générateur avancé
 * d'un pas ne donne jamais.
 *
 * ⭐ « Une consigne reçue peut porter une prémisse fausse » — ici la prémisse
 * était un MOT, et la référence l'a démenti.
 *
 * ## ⚠ ET LA RÉFÉRENCE PORTE UNE INCOHÉRENCE DE TEINTE, rapportée au mobile
 *
 * Elle donne `domaine: "Arts"` → `teinte: "#8A1F55"`, qui est la teinte de
 * `litterature` dans §9 ; `arts` y vaut `#2E3A8C`. Et `"Lettres"` → `#8A1F55`
 * aussi : deux domaines, une teinte.
 *
 * ⭐ Ces colonnes ne sont donc PAS reproduites ici, et c'est conforme à la
 * décision : « clé `coverDomain` → teinte, rien d'autre ; **aucune table
 * d'alias côté web** ». La référence nomme les LIBELLÉS du fournisseur
 * (« Droit », « Lettres »), pas les clés du produit. Reproduire sa colonne
 * `teinte` exigerait précisément l'alias qui est interdit.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { variationDeCouverture } from '@/components/couverture-v3';
import { GABARITS, TEINTE_DU_DOMAINE } from '@/lib/couvertures-v3.generated';

interface Reference {
  readonly graine: string;
  readonly titres: ReadonlyArray<{
    readonly titre: string;
    readonly titreNormalise: string;
    readonly graine: number;
    readonly gabarit: string;
    readonly domaine: string;
    readonly teinte: string;
    readonly motif: {
      readonly dx: number;
      readonly dy: number;
      readonly echelle: number;
      readonly rotation: number;
      readonly elements: number;
      readonly opacite: number;
    };
  }>;
}

const CHEMIN = resolve(process.cwd(), '../../docs/couvertures/references-parite.json');

/**
 * ⭐⭐ LA RÉFÉRENCE EST EXIGÉE — plus aucun cas sauté (décision du 13 octobre 2026).
 *
 * Elle dégradait, le temps que sa publication soit tranchée : `docs/couvertures/`
 * est retenu EN BLOC pour les gabarits du fournisseur, et ce fichier y vivait.
 *
 * ⭐ Jean a tranché qu'il devient PUBLIC — il ne porte aucun tracé, rien que dix
 * titres, leurs graines et des nombres. Le garde l'EXIGE donc : un cas sauté est
 * un cas qui ne mesure pas, et la parité est ce qui empêche deux clients de
 * dessiner deux couvertures pour un même document.
 *
 * ⚠ **Et cela rend la publication NÉCESSAIRE avant l'étiquette** : sans elle, ce
 * fichier échoue dans le clone public, donc la CI publique est rouge — et la
 * liste de rc13 exige la CI verte sur le commit étiqueté. Demandé au backend,
 * dont c'est le script. C'est voulu dans cet ordre : la contrainte se voit au
 * lieu de dormir.
 */
const REF = JSON.parse(readFileSync(CHEMIN, 'utf-8')) as Reference;

describe('⭐⭐ les dix titres de la référence, reproduits', () => {
  /**
   * ⚠ TÉMOIN SUR LE JEU D'ESSAI LUI-MÊME. La référence vient d'une autre
   * session : si elle maigrissait ou changeait de forme, ce fichier passerait
   * au vert en ne mesurant plus rien. « Quand la valeur de référence d'un test
   * vient d'une source EXTÉRIEURE, le test doit affirmer que cette source porte
   * encore la propriété qu'on éprouve. »
   */
  it('⚠ la référence porte encore DIX titres et leurs six valeurs', () => {
    /*
     * ⭐ 5 → 10 LE 13 OCTOBRE 2026, et ce témoin l'a DIT : « la référence a
     * changé de taille — relisez-la ». C'est exactement son office, et c'est
     * ainsi que les cinq titres neufs ont été mesurés au lieu d'être ignorés.
     *
     * ⚠ Les nouveaux portent des cas que les cinq premiers n'avaient pas :
     * espaces multiples (`HISTOIRE   DU   SAHEL`), espaces de tête,
     * ponctuation, parenthèses. La normalisation est donc éprouvée pour de bon.
     */
    expect(REF.titres, 'la référence a changé de taille — relisez-la').toHaveLength(10);
    for (const t of REF.titres) {
      for (const champ of ['dx', 'dy', 'echelle', 'rotation', 'elements', 'opacite'] as const) {
        expect(
          typeof t.motif[champ],
          `${t.titre} : la référence ne porte plus « ${champ} »`,
        ).toBe('number');
      }
      expect(typeof t.graine).toBe('number');
    }
    // ⚠ Et elle dit encore FNV-1a : le jour où elle dirait autre chose, tout change.
    expect(REF.graine).toMatch(/FNV-1a/);
  });

  /**
   * ⭐⭐ LES NOMBRES SE COMPARENT NUMÉRIQUEMENT, et le JSON impose ce soin.
   *
   * JSON écrit `0.10` sous la forme `0.1` — un seul des dix titres porte
   * `opacite: 0.1`, et c'est précisément celui qui attraperait une comparaison
   * de CHAÎNES. `toEqual` sur des nombres compare bien numériquement ; le
   * témoin ci-dessous l'affirme plutôt que de s'y fier.
   */
  it('⚠ un titre porte `opacite: 0.1` — le cas que `0.10` casserait', () => {
    const avecUnDixieme = REF.titres.filter((t) => t.motif.opacite === 0.1);
    expect(
      avecUnDixieme.length,
      'plus aucun titre à 0.1 : le cas de l’écriture JSON n’est plus couvert',
    ).toBeGreaterThan(0);
    for (const t of avecUnDixieme) {
      // ⚠ Comparaison NUMÉRIQUE, et la forme écrite ne doit pas y entrer.
      expect(typeof t.motif.opacite).toBe('number');
      expect(variationDeCouverture(t.titre).opacite).toBe(0.1);
      expect(String(t.motif.opacite)).toBe('0.1');
    }
  });

  /**
   * ⭐⭐ LA GRAINE EST NON SIGNÉE — quatre des dix titres ont une graine ≥ 2³¹.
   *
   * JavaScript convertit en `int32` avant un décalage : avec `>>`, ces graines
   * deviennent NÉGATIVES et le bit de signe se propage. ⚠ Mesuré : `>>`
   * fausserait **20 des 60 valeurs**, sur cinq champs.
   *
   * ⭐ Ce cas ne se contente pas de compter : il NOMME les titres concernés et
   * vérifie leurs six valeurs, pour qu'un décalage arithmétique tombe ici et
   * non dans une moyenne.
   */
  it('⭐ les titres dont la graine dépasse 2³¹ sont reproduits', () => {
    const grandes = REF.titres.filter((t) => t.graine >= 2 ** 31);
    expect(
      grandes.length,
      'aucune graine ≥ 2³¹ : le cas du décalage SIGNÉ n’est plus couvert',
    ).toBeGreaterThan(0);
    for (const t of grandes) {
      const v = variationDeCouverture(t.titre);
      expect(v, `${t.titre} (graine ${t.graine}) — un \`>>\` la fausserait`).toEqual({
        dx: t.motif.dx,
        dy: t.motif.dy,
        echelle: t.motif.echelle,
        rotation: t.motif.rotation,
        elements: t.motif.elements,
        opacite: t.motif.opacite,
      });
    }
  });

  /**
   * ⚠ ET LE CODE N'EMPLOIE AUCUN DÉCALAGE ARITHMÉTIQUE. C'est la moitié
   * « forme » de la propriété : le cas ci-dessus la mesure par l'EFFET, celui-ci
   * barre le geste.
   *
   * ⚠ Mon premier audit était faux — `>>[^>]` matche les deux derniers chevrons
   * de `>>>`. Le motif exige donc qu'aucun chevron ne précède NI ne suive.
   */
  it('⚠ `couverture-v3.tsx` ne contient aucun `>>` arithmétique', () => {
    const src = readFileSync(resolve(process.cwd(), 'components/couverture-v3.tsx'), 'utf-8')
      .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, '')
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n');
    expect(src.length, 'le retrait des commentaires a mangé le fichier').toBeGreaterThan(1000);
    const arithmetiques = [...src.matchAll(/(?<!>)>>(?!>)/g)];
    expect(
      arithmetiques.length,
      'un décalage ARITHMÉTIQUE : la graine est non signée, et 4 titres sur 10 dépassent 2³¹',
    ).toBe(0);
    // ⚠ Témoin de PRÉSENCE : le fichier emploie bien des décalages non signés.
    expect([...src.matchAll(/>>>/g)].length).toBeGreaterThan(2);
  });

  for (const t of REF.titres) {
    it(`« ${t.titre} » — les six valeurs`, () => {
      const v = variationDeCouverture(t.titre);
      /*
       * ⚠ UN SEUL `toEqual` SUR L'OBJET ENTIER, pas six assertions séparées :
       * six assertions laissent passer un champ qu'on aurait oublié de
       * comparer, et c'est exactement le champ que personne ne regarde.
       */
      expect(v).toEqual({
        dx: t.motif.dx,
        dy: t.motif.dy,
        echelle: t.motif.echelle,
        rotation: t.motif.rotation,
        elements: t.motif.elements,
        opacite: t.motif.opacite,
      });
    });
  }

  /**
   * ⭐ LA NORMALISATION EST CELLE DE LA RÉFÉRENCE, et elle le dit elle-même :
   * « trim, minuscules, espaces multiples réduits à un seul ». Le témoin le
   * vérifie sur son propre champ `titreNormalise` plutôt que sur ma lecture de
   * la phrase.
   */
  it('⭐ la normalisation reproduit `titreNormalise` de la référence', () => {
    for (const t of REF.titres) {
      const attendu = t.titreNormalise;
      // ⚠ On n'expose pas `normaliser` : on l'éprouve par son EFFET, en
      // vérifiant que le titre et sa forme normalisée donnent la MÊME variation.
      expect(
        variationDeCouverture(t.titre),
        `${t.titre} : la normalisation diverge de « ${attendu} »`,
      ).toEqual(variationDeCouverture(attendu));
    }
  });

  /** ⭐ Le gabarit nommé par la référence existe bien parmi les huit livrés. */
  it('les cinq gabarits nommés sont livrés', () => {
    const livres = GABARITS.map((g) => g.id as string);
    for (const t of REF.titres) expect(livres, `${t.gabarit} n’est pas livré`).toContain(t.gabarit);
  });

  /**
   * ⚠ L'INCOHÉRENCE DE TEINTE DE LA RÉFÉRENCE, mesurée et NOMMÉE plutôt que
   * contournée. Ce cas ne « corrige » rien : il affirme que deux libellés
   * différents y partagent une teinte, pour que le constat ne se perde pas.
   *
   * ⭐ Et il explique pourquoi la colonne `teinte` n'est pas reproduite : elle
   * est indexée par les LIBELLÉS du fournisseur, et la décision interdit toute
   * table d'alias côté web.
   */
  /**
   * ⭐⭐ LA COLONNE `teinte` SE VÉRIFIE MAINTENANT, et c'est un changement du
   * mobile — pas du web.
   *
   * ⚠ Sa version à cinq titres indexait par LIBELLÉ fournisseur (« Droit »,
   * « Lettres ») et portait un écart : « Arts » y valait `#8A1F55`, la teinte
   * de `litterature`, alors que §9 donne `arts #2E3A8C`. Je ne reproduisais
   * donc pas cette colonne, et c'était la seule issue sans écrire l'alias que
   * la décision interdit.
   *
   * ⭐ La version à dix titres emploie les CLÉS DU PRODUIT, et ses dix teintes
   * correspondent à §9 — écart compris, corrigé. La colonne devient donc une
   * mesure, et elle est confrontée clé par clé.
   */
  it('⭐ les dix teintes de la référence sont celles de §9, clé par clé', () => {
    for (const t of REF.titres) {
      expect(
        Object.keys(TEINTE_DU_DOMAINE),
        `« ${t.domaine} » n’est pas une clé du produit — la référence a changé de vocabulaire`,
      ).toContain(t.domaine);
      expect(
        TEINTE_DU_DOMAINE[t.domaine],
        `${t.titre} : la référence donne ${t.teinte}, §9 donne ${TEINTE_DU_DOMAINE[t.domaine]}`,
      ).toBe(t.teinte);
    }
    /*
     * ⚠ TÉMOIN D'ABSENCE sur la confusion PLAUSIBLE : `arts` et `litterature`
     * ne partagent PAS leur teinte. C'est l'écart exact que la version à cinq
     * titres portait, et il ne doit pas revenir.
     */
    expect(TEINTE_DU_DOMAINE.arts).not.toBe(TEINTE_DU_DOMAINE.litterature);
  });
});

/**
 * ⭐⭐ AUCUNE TABLE D'ALIAS CÔTÉ WEB — « clé `coverDomain` → teinte, rien
 * d'autre » (décision du 12 octobre 2026).
 *
 * ## ⚠ POURQUOI C'EST UNE PROPRIÉTÉ ET PAS UN GOÛT
 *
 * La référence du mobile nomme les LIBELLÉS du fournisseur — « Droit »,
 * « Lettres », « Arts ». Le produit, lui, a des CLÉS — `droit`, `litterature`,
 * `arts`. La tentation est immédiate : écrire la correspondance pour pouvoir
 * reproduire la colonne `teinte` de la référence.
 *
 * > ⚠ **C'est exactement la forme fautive.** Une table d'alias côté web
 * > deviendrait une SECONDE autorité sur le vocabulaire : le serveur résout
 * > déjà `coverDomain`, et deux résolutions divergent le jour où l'une change.
 * > « Si vous le refaites, vous le referez autrement — et trois clients
 * > composeraient trois couvertures pour un même document. »
 *
 * ⭐ Et la référence en donne la preuve par l'absurde : elle attribue `#8A1F55`
 * à « Arts » ET à « Lettres », alors que §9 donne `arts #2E3A8C` et
 * `litterature #8A1F55`. Un alias écrit d'après elle aurait importé son erreur.
 */
describe('⭐⭐ aucune table d’alias de domaine dans le front', () => {
  const FRONT = resolve(process.cwd());
  /**
   * ⚠ CE QUE CETTE LISTE EST DEVENUE, et il faut le dire : la version à cinq
   * titres portait les LIBELLÉS du fournisseur (« Droit », « Lettres ») ; celle
   * à dix porte les CLÉS du produit (`droit`, `langues`). Ce cas mesure donc
   * autre chose qu'hier.
   *
   * ⭐ Et la propriété qu'il tient reste la bonne, formulée sur ce qu'il
   * EXERCE : **aucun domaine n'est écrit en dur dans le front.** Qu'il s'agisse
   * d'un libellé ou d'une clé, un domaine littéral dans un écran est le début
   * d'une table — et la décision veut une seule autorité, le serveur.
   */
  const DOMAINES_DE_LA_REFERENCE = [...new Set(REF.titres.map((t) => t.domaine))];

  it('⚠ aucun domaine n’est écrit EN DUR dans le front', () => {
    const fichiers = [
      'components/couverture-v3.tsx',
      'lib/couvertures-v3.generated.ts',
      'app/opac/[id]/fiche-notice.tsx',
      'app/mes-documents-hors-ligne/page.tsx',
      'app/mes-consultations/page.tsx',
      'app/mes-prets/page.tsx',
    ];
    for (const f of fichiers) {
      const src = readFileSync(resolve(FRONT, f), 'utf-8')
        // ⚠ Hors commentaires : ce dépôt CITE ces libellés pour expliquer
        // pourquoi il ne les emploie pas. Un relevé qui lit les commentaires
        // signalerait le texte qui raconte la décision.
        .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, '')
        .split('\n')
        .filter((l) => !l.trim().startsWith('//'))
        .join('\n');
      // ⚠ Témoin sur l'instrument : un nettoyage trop gourmand rendrait ce cas
      // vert sur rien.
      expect(src.length, `${f} : le retrait des commentaires a mangé le fichier`).toBeGreaterThan(200);
      for (const libelle of DOMAINES_DE_LA_REFERENCE) {
        expect(
          src,
          `${f} emploie « ${libelle} », un libellé FOURNISSEUR : c’est le début ` +
            'd’une table d’alias, et la décision l’interdit',
        ).not.toContain(`'${libelle}'`);
      }
    }
  });

  /**
   * ⭐ ET LA TABLE DU PRODUIT EST INDEXÉE PAR CLÉ, exclusivement — onze clés en
   * minuscules sans accent, telles que le serveur les résout.
   */
  it('les onze clés sont des clés de produit, jamais des libellés', () => {
    for (const cle of Object.keys(TEINTE_DU_DOMAINE)) {
      expect(cle, `« ${cle} » n’est pas une clé de produit`).toMatch(/^[a-z]+$/);
    }
    expect(Object.keys(TEINTE_DU_DOMAINE)).toHaveLength(11);
  });
});
