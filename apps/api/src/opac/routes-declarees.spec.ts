import { describe, expect, it } from 'vitest';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { OpacController } from './opac.controller';

/**
 * ⚠ LES ROUTES SONT DÉCLARÉES ET ORDONNÉES — et ce fichier existe à cause d'une
 * mesure qui a échoué.
 *
 * P7-3 a livré `GET /opac/provenances` avec dix tests verts, et l'appel réel
 * rendait `404 Cannot GET`. La cause n'était pas le code : l'API servait un
 * `dist/` antérieur à la route, parce que la recompilation était EN COURS —
 * j'ai d'abord cru à un watcher en panne, et c'était faux.
 *
 * ⚠ Mais le besoin, lui, était réel : je ne pouvais pas SAVOIR si le décorateur
 * était posé. Dix tests verts sur le service ne disent rien de la route.
 *
 * ⚠ CE QUE CE GARDE COUVRE, ET CE QU'IL NE COUVRE PAS. Il affirme que le
 * décorateur EXISTE avec le bon chemin et le bon verbe — ce qu'aucun test
 * montant le service ne dit. Il ne remplace PAS la recette : une route
 * déclarée peut encore être masquée par l'ordre de déclaration, et c'est
 * pourquoi l'ordre est vérifié ici aussi.
 *
 * L'ORDRE COMPTE, et c'est la seule raison de le figer : Nest apparie dans
 * l'ordre de déclaration. Une route littérale déclarée APRÈS une route à
 * paramètre de même profondeur devient inatteignable — un défaut qui ne se voit
 * qu'à l'appel, jamais à la lecture.
 */

function route(nom: keyof OpacController): { chemin: string; verbe: number } {
  const methode = OpacController.prototype[nom] as unknown as object;
  return {
    chemin: Reflect.getMetadata(PATH_METADATA, methode) as string,
    verbe: Reflect.getMetadata(METHOD_METADATA, methode) as number,
  };
}

describe('⚠ Les routes de P7-2 et P7-3 sont réellement décorées', () => {
  it('`GET provenances` porte son chemin et son verbe', () => {
    expect(route('provenances')).toEqual({
      chemin: 'provenances',
      verbe: RequestMethod.GET,
    });
  });

  it('`GET resoudre/:identifiant` aussi', () => {
    expect(route('resoudre')).toEqual({
      chemin: 'resoudre/:identifiant',
      verbe: RequestMethod.GET,
    });
  });
});

describe('⚠ L’ORDRE : une route littérale ne se déclare jamais après un paramètre de même profondeur', () => {
  /**
   * Les chemins dans l'ordre de déclaration, lus sur le prototype — donc sur ce
   * que Nest lira, pas sur le fichier.
   *
   * ⚠ `Object.getOwnPropertyNames` conserve l'ordre de définition des méthodes
   * de classe, qui est celui du fichier. C'est ce qui rend ce relevé fidèle.
   */
  const chemins = Object.getOwnPropertyNames(OpacController.prototype)
    .filter((n) => n !== 'constructor')
    .map((n) => Reflect.getMetadata(PATH_METADATA, OpacController.prototype[n as keyof OpacController] as unknown as object))
    .filter((c): c is string => typeof c === 'string');

  it('le relevé voit bien les routes (témoin)', () => {
    // Sans témoin, un relevé vide rendrait la vérification ci-dessous verte sur
    // rien — et « aucune route masquée » se lirait comme une garantie.
    expect(chemins.length, 'aucune route relevée : ce garde ne mesure rien').toBeGreaterThan(8);
    expect(chemins).toContain('provenances');
    expect(chemins).toContain('records/:id');
  });

  it('⚠ aucune route littérale n’est masquée par un paramètre déclaré avant elle', () => {
    const profondeur = (c: string) => c.split('/').length;
    const masquees: string[] = [];

    chemins.forEach((chemin, i) => {
      // Une route littérale : aucun segment paramétré.
      if (chemin.includes(':')) return;
      const avant = chemins.slice(0, i).filter((c) => {
        if (profondeur(c) !== profondeur(chemin)) return false;
        // Un paramètre au PREMIER segment avale tout ce qui suit à cette
        // profondeur : c'est le seul cas qui masque une littérale.
        return c.split('/')[0].startsWith(':');
      });
      if (avant.length) masquees.push(`${chemin} — masquée par ${avant.join(', ')}`);
    });

    expect(
      masquees,
      'Nest apparie dans l’ordre : déplacez la route littérale AVANT la route à paramètre.',
    ).toEqual([]);
  });
});
