import { SetMetadata } from '@nestjs/common';

export const MODULE_REQUIS_KEY = 'moduleRequis';

/**
 * Déclare qu'une route appartient à un MODULE activable.
 *
 * ⚠ ELLE S'APPLIQUE AUX ROUTES *DU* MODULE, jamais à une route du noyau qui en
 * consomme un effet. Distinction payée en la cherchant : `POST /circulation/return`
 * calcule une amende, mais rendre un livre appartient à la CIRCULATION. La
 * garder avec `@ModuleRequis('amendes')` empêcherait de rendre un document dans
 * une école qui a éteint les amendes — la règle d'activation dit de refuser les
 * routes du module, pas d'éteindre le noyau qui s'en sert.
 *
 * Un effet de module dans une route du noyau se règle donc par une BRANCHE
 * (l'amende vaut zéro), pas par un refus.
 */
export const ModuleRequis = (moduleId: string) => SetMetadata(MODULE_REQUIS_KEY, moduleId);
