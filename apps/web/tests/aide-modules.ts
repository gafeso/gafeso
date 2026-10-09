// Les modules, LUS DANS LE REGISTRE DE L'API — jamais recopiés.
//
// ⚠ POURQUOI CE FICHIER EXISTE. Le 14 septembre 2026, le circuit de dépôt a reçu
// ses entrées de menu et sa garde d'adresse. Trois tests sont tombés — non pas
// parce que le produit était faux, mais parce que le HARNAIS codait la liste des
// modules en dur : `amendes`, `interoperabilite`, `rappels`. La doublure
// décrivait donc un monde où `depot` n'existe pas, et l'écran montait sur son
// message « module éteint ». Le test accusait le produit.
//
// C'est la troisième copie du même référentiel trouvée dans la soirée, après
// celle des permissions et celle de la composition des rôles. Une copie est
// cohérente avec elle-même : elle devient fausse sans que rien ne tombe.
//
// La frontière des espaces de travail est franchie en LECTURE SEULE,
// délibérément : le couplage existe dans les faits, autant qu'il soit vérifié.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REGISTRE = resolve(process.cwd(), '..', 'api', 'src', 'modules', 'registre-modules.ts');
const source = readFileSync(REGISTRE, 'utf-8');

export interface ModuleDuRegistre {
  id: string;
  libelle: string;
  noyau: boolean;
  dependances: string[];
}

/** Tous les modules déclarés, dans l'ordre du registre. */
export function modulesDuRegistre(): ModuleDuRegistre[] {
  const bloc = source.slice(source.indexOf('export const MODULES'));
  const modules = [...bloc.matchAll(/\bid:\s*'([^']+)',[\s\S]*?\bnoyau:\s*(true|false)/g)].map(
    (m) => {
      const entre = bloc.slice(m.index!, m.index! + m[0].length);
      const libelle = /libelle:\s*'([^']+)'/.exec(entre)?.[1] ?? m[1];
      const dep = /dependances:\s*\[([^\]]*)\]/.exec(entre)?.[1] ?? '';
      return {
        id: m[1],
        libelle,
        noyau: m[2] === 'true',
        dependances: [...dep.matchAll(/'([^']+)'/g)].map((d) => d[1]),
      };
    },
  );
  if (modules.length === 0) {
    throw new Error(
      `Aucun module lu dans ${REGISTRE}. La lecture a échoué — un test qui ` +
        `monterait sur une liste vide croirait TOUS les modules éteints.`,
    );
  }
  return modules;
}

/** Les modules ACTIVABLES, c'est-à-dire tout ce qui n'est pas noyau. */
export function modulesActivables(): string[] {
  return modulesDuRegistre().filter((m) => !m.noyau).map((m) => m.id);
}

/**
 * CE QUE `GET /modules` REND QUAND RIEN N'EST ÉTEINT — noyau COMPRIS.
 *
 * ⚠ MESURÉ, PAS SUPPOSÉ, le 8 octobre 2026 : `ModulesService.etat()` parcourt
 * TOUS les modules déclarés et calcule `actif = noyau || !eteints.has(id)`. Les
 * modules du noyau sortent donc dans la réponse, avec `actif: true`.
 *
 * ⚠ POURQUOI CETTE AIDE EXISTE. Les tests employaient `modulesActivables()`
 * comme « tous les modules actifs » — ce qui OMET le noyau. L'écart est resté
 * invisible tant qu'aucune entrée de menu ne dépendait d'un module noyau ; le
 * 8 octobre, quatre entrées ont reçu `module: 'circulation'` (encore noyau), et
 * la doublure a masqué quatre entrées que le vrai produit affiche.
 *
 * C'est « une doublure est une hypothèse, et un test vert ne confirme que moi » :
 * la doublure décrivait un monde où le noyau n'existe pas.
 */
export function modulesActifsCommeLApi(): string[] {
  return modulesDuRegistre().map((m) => m.id);
}

/**
 * LA RÉPONSE DE `GET /modules`, telle que l'API la rend — pour une doublure.
 *
 * ⚠ POURQUOI UNE AIDE PLUTÔT QU'UN LITTÉRAL DANS CHAQUE TEST. Deux doublures
 * rendaient `[{ id: 'depot', actif: true }]` — un seul module, celui qui
 * intéressait le test. Tant qu'aucune entrée ne dépendait d'un autre module,
 * l'écart ne se voyait pas ; le 8 octobre 2026, « Mes prêts » a reçu
 * `circulation`, et les deux tests ont masqué une entrée que le vrai produit
 * affiche — en accusant le produit.
 *
 * ⭐ « Une doublure est une hypothèse, et un test vert ne confirme que moi. »
 * Celle-ci décrivait un établissement qui n'a qu'un module. L'aide, elle, part
 * du REGISTRE RÉEL : un module ajouté côté API arrive ici sans qu'on y touche.
 *
 * @param eteints les identifiants à rendre inactifs. ⚠ Un module NOYAU reste
 *   actif même s'il est nommé — c'est ce que fait `ModulesService.etat()`
 *   (`actif = noyau || !eteints.has(id)`), et une doublure qui le laisserait
 *   s'éteindre décrirait un monde impossible.
 */
export function reponseModules(eteints: string[] = []): { id: string; actif: boolean }[] {
  const aEteindre = new Set(eteints);
  return modulesDuRegistre().map((m) => ({
    id: m.id,
    actif: m.noyau || !aEteindre.has(m.id),
  }));
}
