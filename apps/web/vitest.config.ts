import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Racine du workspace, pour rejouer l'alias « @/* » de tsconfig.json.
const racine = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Même alias que tsconfig.json ("@/*": ["./*"]) : sans lui, les écrans
    // n'arrivent pas à résoudre leurs propres imports sous Vitest.
    alias: [{ find: /^@\//, replacement: racine }],
  },
  test: {
    // `globals: false` comme dans apps/api : les helpers s'importent
    // explicitement. Le nettoyage automatique de Testing Library, qui dépend
    // des globales, est donc rebranché à la main dans tests/setup.ts.
    globals: false,
    environment: 'jsdom',
    include: ['tests/**/*.spec.ts', 'tests/**/*.spec.tsx'],
    setupFiles: ['./tests/setup.ts'],
    /*
     * ⭐⭐ TROIS DÉLAIS, POSÉS APRÈS QU'UNE SUITE N'A PAS RENDU LA MAIN.
     *
     * Le 14 octobre 2026, `collections-formulaire-charge.spec.tsx` a bloqué DIX
     * MINUTES — aucun message, aucun cas nommé, et c'est le délai de l'outil
     * appelant qui a fini par couper. Une suite qui ne rend pas la main est
     * pire qu'une suite rouge : elle ne dit pas QUOI relire, et elle bloque
     * tout le monde.
     *
     * ⚠ Les valeurs sont LARGES exprès. Il ne s'agit pas de serrer la vis —
     * plusieurs épreuves attendent un débounce de 250 ms et un montage complet,
     * et un délai trop court accuserait du code correct. Il s'agit qu'un
     * blocage DEVIENNE UN ÉCHEC QUI NOMME SON CAS.
     */
    testTimeout: 15_000,
    hookTimeout: 15_000,
    /*
     * ⚠ Le seul qui agisse quand le worker lui-même ne rend plus la main : les
     * deux précédents supposent que la boucle d'événements tourne encore.
     */
    teardownTimeout: 20_000,
    /*
     * ⚠⚠ CE QUE CES TROIS DÉLAIS N'ATTRAPENT PAS, et c'est mesuré :
     *
     * | la forme | avec un délai à 3 s |
     * |---|---|
     * | `await` d'une promesse jamais résolue | ÉCHOUE à 3 s, en NOMMANT son cas ✅ |
     * | boucle synchrone de 30 s | **passe VERTE, après 30 s** 🔴 |
     *
     * Un délai suppose que la boucle d'événements tourne encore : il ne peut
     * pas interrompre du code qui l'AFFAME. Le blocage du 14 octobre était de
     * cette seconde espèce — c'est pourquoi `--testTimeout=3000` ne l'avait pas
     * coupé, et pourquoi j'ai cherché la cause dans l'écran pendant une heure.
     *
     * Ce qui reste comme protection contre cette espèce : le délai de la
     * commande appelante (`timeout 1500 npm test`), qui tue le processus. Il ne
     * nomme aucun cas — il dit seulement que quelque chose n'a pas fini.
     */
  },
});
