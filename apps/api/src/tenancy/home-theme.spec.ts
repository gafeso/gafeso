import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HOME_TOKENS,
  HOME_TOKEN_KEYS,
  mergeHomeTokens,
  sanitizeHomeTokens,
} from './home-theme';

describe('home-theme — mergeHomeTokens', () => {
  it('renvoie les défauts complets pour une valeur absente/null', () => {
    expect(mergeHomeTokens(null)).toEqual(DEFAULT_HOME_TOKENS);
    expect(mergeHomeTokens(undefined)).toEqual(DEFAULT_HOME_TOKENS);
    // Toujours toutes les clés, quoi qu'il arrive.
    expect(Object.keys(mergeHomeTokens({}))).toEqual([...HOME_TOKEN_KEYS]);
  });

  it('applique les clés valides stockées PAR-DESSUS les défauts', () => {
    const merged = mergeHomeTokens({ bg: '#101010', surface: '#202020' });
    expect(merged.bg).toBe('#101010');
    expect(merged.surface).toBe('#202020');
    // Les non fournies gardent le défaut.
    expect(merged.text).toBe(DEFAULT_HOME_TOKENS.text);
  });

  it('ignore les valeurs invalides (non hex) et retombe sur le défaut', () => {
    const merged = mergeHomeTokens({ bg: 'red', highlight: '#GGGGGG', danger: '#abc' });
    expect(merged.bg).toBe(DEFAULT_HOME_TOKENS.bg);
    expect(merged.highlight).toBe(DEFAULT_HOME_TOKENS.highlight);
    expect(merged.danger).toBe(DEFAULT_HOME_TOKENS.danger);
  });
});

describe('home-theme — sanitizeHomeTokens (anti-injection)', () => {
  it('ne conserve que les clés connues et hexadécimales valides', () => {
    const out = sanitizeHomeTokens({
      bg: '#FFFFFF',
      text: '#000000',
      // Clé inconnue → écartée.
      evil: '#123456',
      // Valeur invalide → écartée.
      surface: 'javascript:alert(1)',
    });
    expect(out).toEqual({ bg: '#FFFFFF', text: '#000000' });
  });

  it('renvoie un objet vide pour une entrée non-objet', () => {
    expect(sanitizeHomeTokens(null)).toEqual({});
    expect(sanitizeHomeTokens('#FFFFFF')).toEqual({});
    expect(sanitizeHomeTokens(42)).toEqual({});
  });
});
