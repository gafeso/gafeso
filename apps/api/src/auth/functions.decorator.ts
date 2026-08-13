import { SetMetadata } from '@nestjs/common';

export const FUNCTIONS_KEY = 'fonctions';

/**
 * Exige une ou plusieurs fonctions (toutes) pour accéder à l'endpoint.
 * À utiliser avec JwtAuthGuard puis FunctionsGuard :
 *   @UseGuards(JwtAuthGuard, FunctionsGuard)
 *   @RequiresFunctions(FONCTIONS.CATALOGUE_GERER)
 */
export const RequiresFunctions = (...fonctions: string[]) =>
  SetMetadata(FUNCTIONS_KEY, fonctions);
