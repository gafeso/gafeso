import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * ⭐ LES TROIS DÉLAIS SONT POSÉS, ET CE GARDE LES TIENT.
 *
 * Ils ont été ajoutés le 14 octobre 2026, après qu'une suite n'a pas rendu la
 * main pendant dix minutes — aucun message, aucun cas nommé. Sans ce garde, les
 * retirer ne casserait RIEN : tout resterait vert, et on ne le saurait qu'au
 * prochain blocage.
 *
 * ⚠ CE GARDE VÉRIFIE LA CONFIGURATION, PAS LE COMPORTEMENT — et c'est une borne
 * écrite, pas un oubli. Le comportement a été mesuré à la main, dans les deux
 * sens, et le résultat est dans `vitest.config.ts` :
 *
 * · une promesse jamais résolue ÉCHOUE au délai, en nommant son cas ;
 * · une boucle SYNCHRONE passe VERTE, parce qu'un délai suppose que la boucle
 *   d'événements tourne encore.
 *
 * L'éprouver ici coûterait le délai lui-même à chaque exécution, pour tout le
 * monde, et rendrait la suite rouge par construction. On tient donc la valeur,
 * et on écrit ce qu'elle ne couvre pas.
 */
const CONFIG = readFileSync(join(process.cwd(), 'vitest.config.ts'), 'utf8');

describe('les délais de la suite', () => {
  it('⚠ le garde LIT bien le fichier de configuration', () => {
    expect(CONFIG.length).toBeGreaterThan(200);
    // ⚠ TÉMOIN DE PRÉSENCE sur une ligne dont je connais la réponse.
    expect(CONFIG).toContain("environment: 'jsdom'");
  });

  it('⚠ les TROIS délais sont posés, et chacun porte une valeur', () => {
    for (const clef of ['testTimeout', 'hookTimeout', 'teardownTimeout'] as const) {
      const trouve = CONFIG.match(new RegExp(`${clef}:\\s*([0-9_]+)`));
      expect(trouve, `${clef} n’est plus posé : une suite qui bloque ne nommera plus son cas`).
        toBeTruthy();
      expect(Number(trouve![1].replace(/_/g, '')), `${clef} à zéro ne borne rien`).toBeGreaterThan(
        0,
      );
    }
  });

  it('⚠ et la BORNE est écrite à côté : un délai n’attrape pas une boucle synchrone', () => {
    // ⚠ Sans cette phrase, quelqu'un croira la suite protégée contre tout
    // blocage — et c'est précisément l'espèce qui nous a coûté dix minutes.
    expect(CONFIG).toMatch(/boucle synchrone/i);
    expect(CONFIG).toMatch(/passe VERTE/);
  });
});
