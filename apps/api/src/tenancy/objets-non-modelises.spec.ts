import { describe, expect, it, vi } from 'vitest';
import {
  comparerAuxObjetsPresents,
  messageDeRefus,
  OBJETS_NON_MODELISES,
  requeteDExistence,
} from './objets-non-modelises';
import { ObjetsNonModelisesService } from './objets-non-modelises.service';

/**
 * LE REFUS DE DÉMARRER SUR UN OBJET DE BASE ABSENT — backlog n° 23.
 *
 * Trois propriétés, et la troisième est celle qu'on oublie :
 *  · un objet déclaré mais absent REFUSE le démarrage ;
 *  · tous présents → l'API démarre ;
 *  · ⚠ une base INJOIGNABLE ne refuse PAS — « je n'ai pas pu vérifier » n'est
 *    pas « ça manque », et les confondre transformerait une coupure d'une
 *    minute en boucle de redémarrage.
 */

const TOUS = OBJETS_NON_MODELISES.map((o) => ({ nom: o.nom, type: o.type }));

function service(reponse: { lignes?: unknown[]; erreur?: Error }) {
  const $queryRawUnsafe = vi.fn(async () => {
    if (reponse.erreur) throw reponse.erreur;
    return reponse.lignes;
  });
  return {
    svc: new ObjetsNonModelisesService({ $queryRawUnsafe } as never),
    $queryRawUnsafe,
  };
}

describe('La liste déclarée', () => {
  it('⚠ elle n’est pas VIDE — une liste vide rendrait ce garde décoratif', () => {
    // Le témoin le plus bête et le plus nécessaire : un contrôle qui ne
    // contrôle rien passe toujours, et son vert se lit comme une garantie.
    expect(OBJETS_NON_MODELISES.length).toBeGreaterThan(0);
  });

  it('chaque objet dit ce qu’il GARANTIT et où il est créé', () => {
    // Sans quoi le message de refus dirait « il manque un trigger » à quelqu'un
    // qui ne saurait ni pourquoi c'est grave ni quoi rejouer.
    for (const o of OBJETS_NON_MODELISES) {
      expect(o.garantit.length, o.nom).toBeGreaterThan(20);
      expect(o.migration, o.nom).toMatch(/^\d{14}_/);
    }
  });

  it('⚠ le trigger de hiérarchie en fait partie — c’est le cas qui a ouvert le point', () => {
    // Témoin NOMMÉ : une liste qui ne contiendrait pas l'objet pour lequel elle
    // a été écrite serait un garde qui regarde ailleurs.
    expect(OBJETS_NON_MODELISES.map((o) => o.nom)).toContain(
      'collections_hierarchie_valide_trigger',
    );
  });
});

describe('La comparaison à ce que la base contient', () => {
  it('tous présents → aucun manquant', () => {
    expect(comparerAuxObjetsPresents(TOUS).manquants).toEqual([]);
  });

  it('⚠ un objet absent est DÉSIGNÉ, pas simplement compté', () => {
    const sansTrigger = TOUS.filter((o) => o.type !== 'trigger');
    const { manquants } = comparerAuxObjetsPresents(sansTrigger);

    expect(manquants.map((m) => m.nom)).toEqual(['collections_hierarchie_valide_trigger']);
  });

  it('⚠ le TYPE compte autant que le nom', () => {
    // Une fonction et un trigger peuvent porter le même nom en PostgreSQL —
    // c'est même le cas ici, à un suffixe près. Comparer sur le seul nom
    // laisserait un trigger absent passer pour présent parce que sa fonction
    // existe.
    const typesFaux = TOUS.map((o) => ({ nom: o.nom, type: 'autre-chose' }));
    expect(comparerAuxObjetsPresents(typesFaux).manquants.length).toBe(TOUS.length);
  });

  it('la requête interroge les DEUX catalogues, et écarte les triggers internes', () => {
    const sql = requeteDExistence();
    expect(sql).toContain('pg_trigger');
    expect(sql).toContain('pg_proc');
    // Les contraintes de clé étrangère créent des triggers internes : sans ce
    // filtre, le catalogue en rendrait des dizaines sans rapport.
    expect(sql).toContain('NOT tgisinternal');
  });

  it('le message de refus NOMME l’objet, sa garantie et quoi rejouer', () => {
    const message = messageDeRefus([OBJETS_NON_MODELISES[0]]);

    expect(message).toContain(OBJETS_NON_MODELISES[0].nom);
    expect(message).toContain(OBJETS_NON_MODELISES[0].migration);
    expect(message).toMatch(/db push.*NE LES CRÉE PAS/s);
  });
});

describe('⚠ Le démarrage — trois issues, pas deux', () => {
  it('tous les objets présents : l’API démarre', async () => {
    const { svc } = service({ lignes: TOUS });
    await expect(svc.onApplicationBootstrap()).resolves.toBeUndefined();
  });

  it('⚠ un objet absent : l’API REFUSE de démarrer', async () => {
    // C'est tout l'objet du lot. Un test verrait l'absence en développement, où
    // l'objet existe peut-être ; un démarrage la voit là où elle compte.
    const { svc } = service({ lignes: TOUS.filter((o) => o.type !== 'trigger') });

    await expect(svc.onApplicationBootstrap()).rejects.toThrow(
      /collections_hierarchie_valide_trigger/,
    );
  });

  it('⚠ base INJOIGNABLE : l’API démarre quand même, en criant', async () => {
    // « Je n'ai pas pu vérifier » n'est pas « ça manque ». Refuser ici
    // transformerait une base lente à répondre en boucle de redémarrage : une
    // coupure d'une minute deviendrait une panne. L'API ne servira rien sans
    // base de toute façon, et elle se rétablira seule.
    const { svc } = service({ erreur: new Error('ECONNREFUSED') });

    await expect(svc.onApplicationBootstrap()).resolves.toBeUndefined();
  });

  it('et elle interroge bien la base — le contrôle n’est pas une intention', async () => {
    const { svc, $queryRawUnsafe } = service({ lignes: TOUS });
    await svc.onApplicationBootstrap();
    expect($queryRawUnsafe).toHaveBeenCalledTimes(1);
  });
});
