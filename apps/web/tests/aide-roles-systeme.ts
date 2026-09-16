// Les rôles système, LUS DANS LEUR SOURCE — jamais recopiés.
//
// ⚠ POURQUOI CE FICHIER EXISTE. Le 14 septembre 2026, le rôle Bibliothécaire a
// reçu `lecteurs.voir`. `couverture-des-roles.spec.ts` lisait la vraie valeur et
// a suivi tout seul ; `coque-personnel.spec.tsx` en gardait une COPIE écrite à
// la main, qui est devenue fausse à la seconde où la définition a changé — sans
// que rien ne tombe, puisqu'une copie est cohérente avec elle-même.
//
// C'est « deux tableaux qui se ressemblent ne sont pas le même tableau » :
// ici ils décrivent BIEN le même objet, donc les fondre est juste. Et c'est
// « un garde qui compare une copie à une copie ne garde rien », appliqué à un
// jeu d'essai plutôt qu'à un garde.
//
// La frontière des espaces de travail est franchie en LECTURE SEULE,
// délibérément : le couplage existe dans les faits, autant qu'il soit vérifié.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CATALOGUE_API = resolve(process.cwd(), '..', 'api', 'src', 'auth', 'functions.ts');
const source = readFileSync(CATALOGUE_API, 'utf-8');

/** Les identifiants du catalogue, par nom de constante (CATALOGUE_GERER → …). */
export function catalogue(): Record<string, string> {
  const bloc = source.slice(
    source.indexOf('export const FONCTIONS'),
    source.indexOf('} as const;'),
  );
  return Object.fromEntries(
    [...bloc.matchAll(/(\w+):\s*'([a-z]+\.[a-z]+)'/g)].map((m) => [m[1], m[2]]),
  );
}

/**
 * TOUT le catalogue, c'est-à-dire ce que porte l'Administrateur.
 *
 * ⚠ `fonctionsDuRole('Administrateur')` REFUSE de répondre, délibérément : sa
 * liste est `TOUTES_LES_FONCTIONS`, et rendre un tableau vide serait le pire
 * des deux mondes — un test vert sur un rôle qui ne voit rien. On passe donc
 * par ici, et on lit le catalogue.
 */
export function toutesLesFonctions(): string[] {
  const tout = Object.values(catalogue());
  if (tout.length < 20) {
    throw new Error(
      `Le catalogue de fonctions rend ${tout.length} entrées — la lecture de ` +
        `apps/api/src/auth/functions.ts a probablement échoué.`,
    );
  }
  return tout;
}

/** Les rôles système et leurs fonctions, résolus en identifiants. */
export function rolesSysteme(): { nom: string; fonctions: string[] }[] {
  const fon = catalogue();
  const bloc = source.slice(source.indexOf('export const ROLES_SYSTEME'));
  return [
    ...bloc.matchAll(
      /name:\s*'([^']+)',[\s\S]*?functions:\s*(\[[\s\S]*?\]|TOUTES_LES_FONCTIONS)/g,
    ),
  ].map((m) => ({
    nom: m[1],
    // ⚠ L'Administrateur porte TOUTES_LES_FONCTIONS, pas une liste. Les appelants
    // qui en ont besoin le traitent à part ; ici il rend une liste vide.
    fonctions:
      m[2] === 'TOUTES_LES_FONCTIONS'
        ? []
        : [...m[2].matchAll(/FONCTIONS\.(\w+)/g)].map((f) => fon[f[1]]).filter(Boolean),
  }));
}

/**
 * Les fonctions d'un rôle système, telles que l'API les définit AUJOURD'HUI.
 *
 * ⚠ Échoue bruyamment si le rôle n'existe pas : un nom mal orthographié rendrait
 * une liste vide, et l'écran monté afficherait son refus — le test passerait
 * alors sur une page qui n'est pas celle qu'on croit mesurer.
 */
export function fonctionsDuRole(nom: string): string[] {
  const role = rolesSysteme().find((r) => r.nom === nom);
  if (!role) {
    throw new Error(
      `Rôle système « ${nom} » introuvable dans apps/api/src/auth/functions.ts. ` +
        `Rôles lus : ${rolesSysteme().map((r) => r.nom).join(', ')}`,
    );
  }
  if (role.fonctions.length === 0) {
    throw new Error(
      `Le rôle « ${nom} » rend une liste VIDE — soit il porte TOUTES_LES_FONCTIONS ` +
        `(Administrateur : traitez-le à part), soit la lecture de sa source a échoué.`,
    );
  }
  return role.fonctions;
}
