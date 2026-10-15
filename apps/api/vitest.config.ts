import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    /*
     * ⭐ TROIS DÉLAIS, POSÉS COMME CEUX DU WEB — et la MÊME limite écrite.
     *
     * ⚠ Les valeurs sont LARGES exprès. Il ne s'agit pas de serrer la vis :
     * les gardes vivants parlent à une base et à un moteur de recherche, et un
     * délai trop court accuserait du code correct. Il s'agit qu'un blocage
     * DEVIENNE UN ÉCHEC QUI NOMME SON CAS, au lieu d'une suite qui pend.
     */
    testTimeout: 15_000,
    hookTimeout: 15_000,
    /*
     * ⚠ Le seul qui agisse quand le worker ne rend plus la main : les deux
     * précédents supposent que la boucle d'événements tourne encore.
     */
    teardownTimeout: 20_000,
    /*
     * ⚠⚠ CE QUE CES TROIS DÉLAIS N'ATTRAPENT PAS — la même limite que le web,
     * écrite ici pour qui lit CE fichier :
     *
     * | la forme | avec un délai |
     * |---|---|
     * | `await` d'une promesse jamais résolue | ÉCHOUE, en NOMMANT son cas ✅ |
     * | boucle SYNCHRONE de 30 s | **passe VERTE, après 30 s** 🔴 |
     *
     * Un délai suppose que la boucle d'événements tourne encore : il ne peut
     * pas interrompre du code qui l'AFFAME. Les recopier sans recopier cette
     * limite laisserait croire que la suite de l'API est protégée contre les
     * deux espèces.
     *
     * Ce qui reste contre la seconde : le délai de la commande appelante
     * (`timeout … npm test`), qui tue le processus. Il ne nomme aucun cas — il
     * dit seulement que quelque chose n'a pas fini.
     */
    globals: false,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
});
