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
