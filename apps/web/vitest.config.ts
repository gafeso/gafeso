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
  },
});
