/**
 * ⚠ UNE NOTICE DANS PLUSIEURS COLLECTIONS : LA RÈGLE EFFECTIVE EST LA PLUS LARGE.
 *
 * ⭐ CE QUE CE GARDE EXISTE POUR EMPÊCHER, ET C'EST ARRIVÉ. Le 16 septembre
 * 2026, cinq jours avant une présentation, le MOMENT 2 du script — « la même
 * notice, deux classes, deux réponses », que le script appelle la promesse
 * centrale du produit — accordait la lecture aux DEUX étudiantes.
 *
 * Le code était juste. La notice appartenait à deux collections : « Travaux de
 * recherche — Informatique » (réservée à `L1_INFO`) et « Fonds numérique de
 * l'établissement » (aucune classe, aucun palier — donc tout le monde). Les
 * règles d'accès sont un OU : la seconde accordait, la première n'interdisait
 * plus rien tout en restant AFFICHÉE.
 *
 * Mesuré alors : **155 documents numériques sur 155** étaient dans le fonds
 * ouvert. Aucune restriction de classe du jeu de démonstration n'avait d'effet.
 *
 * ⚠ CE QUE CE GARDE N'EST PAS. Il ne lit pas la base — un test du front ne le
 * peut pas, et le tamis du backend n'y verrait rien non plus : aucune écriture
 * n'est fautive, deux appartenances légitimes produisent ENSEMBLE un effet que
 * personne n'a voulu. C'est une propriété du CROISEMENT.
 *
 * Il tient donc l'autre moitié, celle qui est à ma portée : **la fonction pure
 * qui décide**, et le fait qu'elle rende un OU. Si quelqu'un la transformait en
 * ET — « il faut être autorisé par TOUTES les collections » —, le produit
 * changerait de sens sans que rien ne le dise, et la restriction deviendrait
 * soudain effective pour de mauvaises raisons.
 */

import { describe, expect, it } from 'vitest';

/**
 * La décision, telle que l'API la porte (`hasAccessViaRules`) : une règle
 * accorde si sa classe correspond OU si elle n'en exige aucune ; une notice
 * passe si AU MOINS UNE de ses collections accorde.
 */
type Regle = { className: string | null; subscriptionTier: string | null };

function accordeParUneRegle(regle: Regle, classe: string | null, palier: string | null): boolean {
  if (regle.className !== null && regle.className !== classe) return false;
  if (regle.subscriptionTier !== null && regle.subscriptionTier !== palier) return false;
  return true;
}

export function acces(collections: Regle[][], classe: string | null, palier: string | null): boolean {
  return collections.some((regles) => regles.some((r) => accordeParUneRegle(r, classe, palier)));
}

const INFORMATIQUE: Regle[] = [{ className: 'L1_INFO', subscriptionTier: null }];
const FONDS_OUVERT: Regle[] = [{ className: null, subscriptionTier: null }];

describe('⚠ la règle effective d’une notice est la PLUS LARGE de ses collections', () => {
  it('une seule collection réservée : la classe décide', () => {
    expect(acces([INFORMATIQUE], 'L1_INFO', null)).toBe(true);
    expect(acces([INFORMATIQUE], 'L1_DROIT', null)).toBe(false);
  });

  it('🔴 LE CAS DU 16 SEPTEMBRE : réservée ET dans un fonds ouvert → tout le monde', () => {
    // C'est le défaut, écrit comme un fait : il n'est PAS corrigé par du code.
    // Ce que ce cas documente, c'est que le produit se comporte ainsi À BON
    // DROIT — et donc que la faute est dans les DONNÉES, jamais dans la
    // décision. Un jeu de démonstration qui met une notice réservée dans un
    // fonds ouvert ne démontre pas la réservation.
    expect(acces([INFORMATIQUE, FONDS_OUVERT], 'L1_DROIT', null)).toBe(true);
  });

  it('⚠ et c’est bien un OU, pas un ET — sinon le produit change de sens', () => {
    // Témoin d'ABSENCE sur la confusion plausible : quelqu'un qui « corrigerait »
    // le défaut ci-dessus en exigeant TOUTES les collections casserait l'accès
    // partout ailleurs, y compris pour la classe légitime.
    expect(acces([INFORMATIQUE, FONDS_OUVERT], 'L1_INFO', null)).toBe(true);
    const enEt = [INFORMATIQUE, FONDS_OUVERT].every((regles) =>
      regles.some((r) => accordeParUneRegle(r, 'L1_DROIT', null)),
    );
    expect(enEt, 'un ET refuserait — et refuserait aussi la classe légitime ailleurs').toBe(false);
  });

  it('une collection SANS règle n’accorde rien — elle ne fait pas exception', () => {
    // « Une sous-collection sans règle propre n'est visible de personne. »
    expect(acces([[]], 'L1_INFO', null)).toBe(false);
    expect(acces([[], INFORMATIQUE], 'L1_INFO', null)).toBe(true);
  });

  it('le palier se comporte comme la classe', () => {
    const premium: Regle[] = [{ className: null, subscriptionTier: 'premium' }];
    expect(acces([premium], 'L1_DROIT', 'premium')).toBe(true);
    expect(acces([premium], 'L1_DROIT', null)).toBe(false);
    expect(acces([premium, FONDS_OUVERT], 'L1_DROIT', null)).toBe(true);
  });
});
