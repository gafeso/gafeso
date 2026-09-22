/**
 * LA FRONTIÈRE UNICODE DU MOISSONNAGE.
 *
 * Deux frontières normalisent en NFC — `client-oai.ts` et `mapper-oai-dc.ts` —
 * et RIEN NE LE PROUVAIT. Un dispositif se vérifie par son EFFET, jamais par sa
 * présence : les deux `.normalize('NFC')` pouvaient disparaître au prochain
 * refactor sans qu'aucun test ne tombe.
 *
 * ## Ce qui est en jeu, et ce n'est pas théorique
 *
 * Un entrepôt tiers émet ce qu'il veut. La Library of Congress émet ses
 * diacritiques en forme DÉCOMPOSÉE — « Ouédraogo » y est `O u e ◌́ d r a o g o`.
 * Les deux chaînes s'affichent au pixel près et ne sont PAS égales.
 *
 * Le fichier d'autorités déduplique sur `normalizedName`, qui plie les accents,
 * donc il résiste. Mais `displayName` est stocké tel quel, et tout ce qui
 * compare du texte à l'identique — un titre, un mot-clé, une collision de
 * moissonnage — voit deux valeurs différentes là où il y en a une.
 *
 * ⚠ Et pour exactement la population qui compte : dans un pays où les noms
 * portent des accents, ça ne touche pas les cas rares, ça touche les Ouédraogo,
 * les Traoré, les Aïcha.
 *
 * ## La forme des littéraux
 *
 * ⚠ LES FORMES S'ÉCRIVENT EN ÉCHAPPEMENTS, jamais au clavier. Un `'é'` tapé
 * dans un fichier source est composé ou décomposé selon la façon dont le
 * fichier a été enregistré — et un éditeur qui le réenregistre ferait passer
 * ce test au vert sans que rien ne le signale. Le témoin de LONGUEUR est la
 * seule chose qui distingue les deux formes sans les afficher.
 */
import { describe, expect, it } from 'vitest';
import { mapperOaiDc } from './mapper-oai-dc';

const NFD = 'Oue\u0301draogo, Ai\u0308cha';
const NFC = 'Ou\u00e9draogo, A\u00efcha';

describe('les littéraux de ce fichier portent bien les deux formes', () => {
  it('⚠ le témoin qui rend la différence visible : la LONGUEUR', () => {
    // Sans ce cas, une réécriture du fichier pourrait rendre les deux
    // identiques, et tout ce qui suit passerait en ne mesurant plus rien.
    expect(NFD.length, 'le littéral NFD n’est plus décomposé').toBe(18);
    expect(NFC.length, 'le littéral NFC n’est plus composé').toBe(16);
    expect(NFD).not.toBe(NFC);
    expect(NFD.normalize('NFC')).toBe(NFC);
  });
});

describe('mapperOaiDc — le texte d’un entrepôt tiers entre en NFC', () => {
  const enveloppe = (dc: Record<string, unknown>) => ({ 'oai_dc:dc': dc });

  it('⚠ un créateur décomposé ressort COMPOSÉ', () => {
    const n = mapperOaiDc(enveloppe({ title: 'Titre', creator: NFD }));
    expect(n).not.toBeNull();
    expect(n!.contributors[0].name).toBe(NFC);
    // Et l'assertion qui compte vraiment : il se confond avec le même nom
    // saisi à la main. C'est tout l'objet de la normalisation.
    expect(n!.contributors[0].name === NFC).toBe(true);
  });

  it('⚠ un TITRE décomposé aussi — la recherche manquerait la notice', () => {
    const n = mapperOaiDc(enveloppe({ title: NFD }));
    expect(n!.title).toBe(NFC);
  });

  it('la forme `{ "#text": … }` du parseur XML est normalisée elle aussi', () => {
    // ⚠ Le parseur rend tantôt une chaîne, tantôt un objet porteur de `#text`
    // selon qu'il y a des attributs. Les deux chemins doivent normaliser —
    // n'en couvrir qu'un laisse une porte d'entrée ouverte selon l'entrepôt.
    const n = mapperOaiDc(
      enveloppe({ title: 'T', creator: { '#text': NFD, '@_lang': 'fr' } }),
    );
    expect(n!.contributors[0].name).toBe(NFC);
  });

  it('⚠ une valeur DÉJÀ composée n’est pas abîmée', () => {
    // Témoin d'absence : un « normalisateur » qui décomposerait passerait les
    // cas ci-dessus si on ne testait que le sens NFD → NFC.
    const n = mapperOaiDc(enveloppe({ title: NFC, creator: NFC }));
    expect(n!.title).toBe(NFC);
    expect(n!.contributors[0].name).toBe(NFC);
  });
});
