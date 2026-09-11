/**
 * L'adresse courante, dans un module qui n'importe RIEN de l'application.
 *
 * ⚠ POURQUOI IL EST SÉPARÉ DE `aide-ecran`. La fabrique de
 * `vi.mock('next/navigation', …)` importe ce module ; `aide-ecran`, lui, importe
 * les écrans, qui importent `next/navigation`. Tout tenir dans un seul fichier
 * ferme le cycle — et un cycle entre un module et sa propre doublure ne casse
 * pas : il PEND. La suite s'arrêtait au bout de deux minutes sans une ligne de
 * sortie, avant même d'avoir collecté un test.
 *
 * Le symptôme à reconnaître : le test qui ne touche à rien (ici la lecture de
 * quatre chemins sur le disque) pend lui aussi. Un blocage qui n'épargne pas le
 * test le plus inoffensif n'est pas dans les tests — il est au chargement.
 */

import { vi } from 'vitest';

const etat: { pathname: string; params: Record<string, string> } = {
  pathname: '/',
  params: {},
};

export function poserAdresse(pathname: string, params: Record<string, string> = {}): void {
  etat.pathname = pathname;
  etat.params = params;
}

export const pousser = vi.fn();
export const remplacer = vi.fn();
export const rafraichir = vi.fn();

/** À rendre depuis la fabrique de `vi.mock('next/navigation', …)`. */
export function navigationDeTest() {
  return {
    usePathname: () => etat.pathname,
    useParams: () => etat.params,
    useRouter: () => ({ push: pousser, replace: remplacer, refresh: rafraichir }),
    useSearchParams: () => new URLSearchParams(),
  };
}
