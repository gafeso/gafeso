/**
 * LES PAGES LÉGALES — et le cas qui décide de tout : la route est PUBLIQUE.
 *
 * ⚠ CE QUE CE FICHIER ÉPROUVE EN PREMIER n'est pas la normalisation, c'est la
 * NON-DIVULGATION. `GET /tenancy/home` est déclarée « contenu de la vitrine
 * publique » : servir la colonne telle quelle y publierait les brouillons d'une
 * bibliothécaire — un texte juridique à demi rédigé, lisible de tout
 * l'internet, sous le nom de l'établissement.
 *
 * C'est « quand le faux silencieux SORT de l'application » : la réponse quitte
 * le produit, donc la distinction cesse d'être une élégance.
 */
import { describe, expect, it } from 'vitest';
import {
  CLES_PAGES,
  MAX_BLOCS,
  MAX_LONGUEUR_BLOC,
  normaliserPagesLegales,
  PAGES_LEGALES_VIDES,
  pourLePublic,
} from './pages-legales';
import { raisonDeRefusDesPagesLegales } from './dto/pages-legales.validator';

describe('ce que la route PUBLIQUE laisse sortir', () => {
  const avecBrouillon = normaliserPagesLegales({
    mentions: { blocs: { editeur: 'Université d’Exemple' }, publieeLe: '2026-10-06T10:00:00.000Z' },
    confidentialite: { blocs: { collecte: 'BROUILLON — à relire par le juriste' }, publieeLe: null },
  });

  it('🔴 un BROUILLON ne sort pas — ni son texte, ni son existence', () => {
    const vu = pourLePublic(avecBrouillon);
    expect(vu.confidentialite.blocs).toEqual({});
    expect(vu.confidentialite.publieeLe).toBeNull();
    // Le témoin qui COMPTE : aucune trace du texte, où que ce soit dans la réponse.
    expect(JSON.stringify(vu)).not.toContain('BROUILLON');
    expect(JSON.stringify(vu)).not.toContain('juriste');
  });

  it('et une page PUBLIÉE sort entière — sinon le filtre ne servirait à rien', () => {
    const vu = pourLePublic(avecBrouillon);
    expect(vu.mentions.blocs.editeur).toBe('Université d’Exemple');
    expect(vu.mentions.publieeLe).toBe('2026-10-06T10:00:00.000Z');
  });

  it('⚠ et le filtre porte sur LES DEUX pages, pas sur celle qu’on a en tête', () => {
    // Témoin d'ABSENCE sur la confusion plausible : un filtre écrit pour
    // `confidentialite` et oublié sur `mentions`. Chaque page est énumérée.
    const examinees: string[] = [];
    for (const cle of CLES_PAGES) {
      const brouillon = normaliserPagesLegales({
        [cle]: { blocs: { x: 'SECRET' }, publieeLe: null },
      });
      expect(JSON.stringify(pourLePublic(brouillon)), `page ${cle}`).not.toContain('SECRET');
      examinees.push(cle);
    }
    expect(examinees).toEqual([...CLES_PAGES]);
  });

  it('rien du tout en base rend les deux pages vides, jamais `undefined`', () => {
    for (const rien of [null, undefined, 'texte', 42, []]) {
      expect(normaliserPagesLegales(rien)).toEqual(PAGES_LEGALES_VIDES);
    }
  });
});

describe('la normalisation', () => {
  it('⚠ NFC à la frontière — ces textes arrivent d’un copier-coller', () => {
    // ⚠ La forme s'écrit en ÉCHAPPEMENTS, jamais au clavier : un éditeur qui
    // réenregistre le fichier changerait la forme sans aucun diff visible.
    // ⚠ LA FORME S'ÉCRIT EN ÉCHAPPEMENTS, JAMAIS AU CLAVIER. Première
    // rédaction de ce test : `const NFD = 'Ouedraogo'` tapé normalement — son
    // témoin de longueur passait PAR ACCIDENT de la façon dont le fichier avait
    // été écrit. Un réenregistrement par un éditeur, un copier-coller, un
    // formateur : le test devient vert et RIEN ne le signale, parce que les deux
    // versions s'affichent au caractère près.
    //
    // Et c'est la famille où le CODE SOURCE lui-même est l'instrument qui mente :
    // on relit son propre fichier, on y voit ce qu'on voulait y mettre, et ce
    // n'est pas ce qu'il contient.
    const NFD = 'Ou\u0065\u0301draogo'; // e + accent combinant
    const NFC = 'Ou\u00e9draogo';        // é précomposé
    expect(NFD.length, 'la forme decomposee doit l etre : sinon ce test ne mesure rien').toBe(10);
    expect(NFC.length).toBe(9);
    // ⭐ Et `tsc` a REFUSÉ la comparaison directe `NFD === NFC` :
    //   « types '"Ouédraogo"' and '"Ouédraogo"' have no overlap »
    // C'est-à-dire que le COMPILATEUR prouve statiquement que les deux
    // littéraux diffèrent — une preuve plus forte que cette assertion, et
    // obtenue gratuitement par l'écriture en échappements. On élargit donc le
    // type pour que la comparaison soit légale, et on garde le témoin : il
    // parlera encore le jour où ces deux valeurs viendront d'ailleurs.
    const decomposee: string = NFD;
    expect(decomposee === NFC, 'les deux formes ne sont pas égales').toBe(false);

    const vu = normaliserPagesLegales({ mentions: { blocs: { d: NFD }, publieeLe: null } });
    expect(vu.mentions.blocs.d).toBe(NFC);
  });

  it('une date de publication invalide devient `null` — jamais une chaîne arbitraire', () => {
    const vu = normaliserPagesLegales({
      mentions: { blocs: {}, publieeLe: 'bientôt' },
      confidentialite: { blocs: {}, publieeLe: 42 },
    });
    expect(vu.mentions.publieeLe).toBeNull();
    expect(vu.confidentialite.publieeLe).toBeNull();
    // ⭐ ET C'EST LA PROPRIÉTÉ QUI COMPTE : une date illisible ne doit pas
    // PUBLIER. `pourLePublic` ne voit que `null`, donc la page reste cachée.
    expect(JSON.stringify(pourLePublic(vu))).not.toContain('bientôt');
  });

  it('les clés et blocs inexploitables sont écartés, pas rendus `undefined`', () => {
    const vu = normaliserPagesLegales({
      mentions: { blocs: { '': 'sans identifiant', bon: 'texte', nombre: 42 }, publieeLe: null },
    });
    expect(Object.keys(vu.mentions.blocs)).toEqual(['bon']);
  });
});

describe('⚠ l’ÉCRITURE refuse ce que la lecture tronquerait', () => {
  // ⚠ C'est la leçon écrite à côté, pour le bandeau d'accueil : « les
  // normaliseurs tronquent en silence, ce qui est le bon comportement en LECTURE
  // mais un faux silencieux en ÉCRITURE ». Sur un document juridique, une
  // troncature silencieuse n'est pas une gêne d'affichage.
  it('un bloc trop long est REFUSÉ, et le refus NOMME le plafond', () => {
    const motif = raisonDeRefusDesPagesLegales({
      mentions: { blocs: { editeur: 'x'.repeat(MAX_LONGUEUR_BLOC + 1) } },
    });
    expect(motif).toBeTruthy();
    expect(motif).toContain(String(MAX_LONGUEUR_BLOC));
    expect(motif, 'il doit dire QUOI FAIRE').toMatch(/découpez/i);
  });

  it('trop de blocs est REFUSÉ, et le refus NOMME le plafond', () => {
    const blocs = Object.fromEntries(
      Array.from({ length: MAX_BLOCS + 1 }, (_, i) => [`b${i}`, 'x']),
    );
    const motif = raisonDeRefusDesPagesLegales({ mentions: { blocs } });
    expect(motif).toContain(String(MAX_BLOCS));
    expect(motif).toContain(String(MAX_BLOCS + 1));
  });

  it('⚠ une page INCONNUE est refusée, pas ignorée — « confidentialite » mal écrit', () => {
    const motif = raisonDeRefusDesPagesLegales({ confidentialité: { blocs: {} } });
    expect(motif, 'une clé écartée en silence donnerait une page enregistrée nulle part')
      .toBeTruthy();
    expect(motif).toContain('confidentialité');
    expect(motif).toContain('mentions');
  });

  it('une date de publication invalide est REFUSÉE à l’écriture', () => {
    expect(raisonDeRefusDesPagesLegales({ mentions: { blocs: {}, publieeLe: 'bientôt' } }))
      .toMatch(/date/i);
  });

  it('⭐ et les formes LÉGITIMES passent — sinon le validateur se fait désactiver', () => {
    const legitimes: unknown[] = [
      {},
      { mentions: { blocs: {}, publieeLe: null } },
      { mentions: { blocs: { e: 'texte' }, publieeLe: '2026-10-06T10:00:00.000Z' } },
      { confidentialite: { blocs: { c: 'x'.repeat(MAX_LONGUEUR_BLOC) } } },
      { mentions: null, confidentialite: undefined },
      // ⚠ Le cas limite EXACT : pile au plafond, et non au-dessus.
      {
        mentions: {
          blocs: Object.fromEntries(Array.from({ length: MAX_BLOCS }, (_, i) => [`b${i}`, 'x'])),
        },
      },
    ];
    const vus: number[] = [];
    legitimes.forEach((v, i) => {
      expect(raisonDeRefusDesPagesLegales(v), `cas légitime n° ${i}`).toBeNull();
      vus.push(i);
    });
    expect(vus).toEqual([0, 1, 2, 3, 4, 5]);
  });
});
