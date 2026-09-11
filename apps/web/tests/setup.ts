import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
// L'entrée « /vitest » fait les deux choses : elle branche les matchers sur le
// `expect` de Vitest ET elle augmente ses types. Importer
// « /matchers » + expect.extend à la main marche à l'exécution mais laisse
// `toBeInTheDocument` non typé — et `next build` ne type-vérifie PAS tests/,
// donc rien ne l'aurait signalé. Vérifier avec `npm run typecheck`.
import '@testing-library/jest-dom/vitest';

// Testing Library ne branche son nettoyage automatique que si les globales
// de test existent ; on tourne avec `globals: false`, donc on le fait ici.
afterEach(() => {
  cleanup();
});
