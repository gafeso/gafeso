/**
 * Une tuile ne s'affiche que si son chiffre est significatif.
 *
 * La règle n'est pas cosmétique : une bibliothèque qui démarre et affiche
 * « 12 documents » devant un comité met en scène sa propre faiblesse, et
 * obtient l'inverse de l'effet recherché. En dessous du seuil la tuile
 * disparaît ; si AUCUNE ne l'atteint, la section entière disparaît — la règle
 * du bandeau vide, appliquée ici.
 */

import { describe, expect, it } from 'vitest';
import { formaterNombre, SEUIL_TUILE, tuilesSignificatives } from '@/lib/chiffres';

const COMPLET = {
  documents: 12430,
  lecteurs: 8420,
  documentsNumeriques: 318,
  lecturesHorsLigne: 1240,
};

describe('tuiles des chiffres du fonds', () => {
  it('un établissement fourni les montre toutes, dans l’ordre de la maquette', () => {
    expect(tuilesSignificatives(COMPLET).map((t) => t.cle)).toEqual([
      'documents',
      'lecteurs',
      'documentsNumeriques',
      'lecturesHorsLigne',
    ]);
  });

  it('une bibliothèque qui démarre en montre DEUX, pas quatre', () => {
    // Le cas qui motive la règle.
    const jeune = { documents: 120, lecteurs: 64, documentsNumeriques: 3, lecturesHorsLigne: 0 };
    expect(tuilesSignificatives(jeune).map((t) => t.cle)).toEqual(['documents', 'lecteurs']);
  });

  it('le seuil est INCLUSIF, et il n’y en a qu’un', () => {
    const pile = {
      documents: SEUIL_TUILE,
      lecteurs: SEUIL_TUILE - 1,
      documentsNumeriques: 0,
      lecturesHorsLigne: 0,
    };
    expect(tuilesSignificatives(pile).map((t) => t.cle)).toEqual(['documents']);
  });

  it('aucun chiffre au-dessus du seuil : AUCUNE tuile — donc aucune section', () => {
    // Recette n° 4. L'appelant ne rend rien quand la liste est vide.
    const minuscule = { documents: 12, lecteurs: 3, documentsNumeriques: 0, lecturesHorsLigne: 0 };
    expect(tuilesSignificatives(minuscule)).toEqual([]);
  });

  it('pas de réponse de l’API : aucune tuile, et surtout aucun zéro inventé', () => {
    // `null` = on ne sait pas. Le pire serait d'afficher « 0 document » : une
    // non-réponse présentée comme un fait, la faute que cet écran corrige
    // ailleurs depuis deux lots.
    expect(tuilesSignificatives(null)).toEqual([]);
  });

  it('une valeur absurde ne passe pas pour un chiffre', () => {
    const casse = {
      documents: Number.NaN,
      lecteurs: Number.POSITIVE_INFINITY,
      documentsNumeriques: 900,
      lecturesHorsLigne: 0,
    };
    expect(tuilesSignificatives(casse).map((t) => t.cle)).toEqual(['documentsNumeriques']);
  });

  it('les milliers sont séparés à la française', () => {
    // 12430 doit se lire « 12 430 », jamais « 12,430 » — qui se lit comme un
    // décimal anglais et divise le fonds par mille aux yeux d'un lecteur.
    const rendu = formaterNombre(12430);
    expect(rendu).not.toContain(',');
    expect(rendu.replace(/\s| | /g, '')).toBe('12430');
  });
});
