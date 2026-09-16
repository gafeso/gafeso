/**
 * ⚠ AUCUN CHIFFRE DE FONDS FIGÉ DANS LES TEXTES DE LA PAGE D'ACCUEIL.
 *
 * Le seed annonçait « Plus de 12 000 références » sur une école qui en compte
 * **480** — vingt-cinq fois trop, sur la PREMIÈRE phrase que lit un visiteur du
 * catalogue public. Retiré le 15 septembre 2026 ; ce garde existe pour que le
 * retrait ne se défasse pas.
 *
 * ⚠ C'est « un libellé qui décrit un ÉTAT DU SYSTÈME n'est pas une constante,
 * c'est une MESURE FIGÉE DANS UNE CHAÎNE ». Le nombre était peut-être vrai le
 * jour où la maquette a été écrite ; il ne l'a jamais été en base, et personne
 * ne relit un texte qui a l'air correct.
 *
 * ⚠ ET LE COMMENTAIRE NE SUFFISAIT PAS. Le seed PORTE déjà l'explication —
 * « aucun chiffre ici, et c'est délibéré ». Un texte qui décrit une sauvegarde
 * est un test qui n'a pas été écrit : la prochaine personne qui voudra rendre
 * la page plus engageante écrira un nombre, et rien ne l'arrêterait.
 *
 * ⚠ LE GESTE QUI LE VIOLERA, écrit ici parce qu'il est raisonnable : quelqu'un
 * voudra « donner une idée de la taille du fonds » et écrira « Plus de N
 * documents ». Ce n'est pas une sottise — c'est ce que font toutes les pages
 * d'accueil de bibliothèque. La réponse est que ce chiffre se CALCULE : la
 * constellation de l'accueil le rend déjà, à chaque visite, et il est juste.
 *
 * ⚠ CE QUE CE GARDE NE COUVRE PAS, écrit plutôt que tu : il lit le SEED. Le
 * contenu de la page est ensuite SAISI par l'établissement dans
 * `/admin/accueil`, et une école qui écrit son propre chiffre n'est arrêtée par
 * rien. Ce qu'on tient ici, c'est que le produit n'en propose pas un par
 * défaut — la seule moitié qui nous appartienne.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SEED = resolve(__dirname, '..', '..', '..', 'scripts', 'seed-demo.mjs');

/** ⚠ Le code seul : le commentaire qui RACONTE le retrait cite le chiffre. */
function sansCommentaires(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');
}

/** Le bloc `PAGE_ACCUEIL` du seed, commentaires retirés. */
function pageAccueil(): string {
  const source = sansCommentaires(readFileSync(SEED, 'utf-8'));
  const debut = source.indexOf('const PAGE_ACCUEIL = {');
  expect(debut, 'le bloc PAGE_ACCUEIL a disparu du seed').toBeGreaterThan(-1);
  return source.slice(debut, source.indexOf('\n};', debut));
}

/**
 * Les chaînes destinées à être LUES.
 *
 * ⚠ On apparie TOUTES les chaînes, puis on écarte par la longueur — jamais
 * l'inverse. Une première écriture cherchait `'([^']{12,})'`, ce qui SAUTE les
 * chaînes courtes ('UEX', 'UE') et DÉSYNCHRONISE l'appariement : le moteur
 * repart alors du guillemet FERMANT de la chaîne courte et prend le code
 * intermédiaire pour un texte. Le garde était vert sur un seed qui portait la
 * faute — c'est le contrôle négatif qui l'a dit, pas la relecture.
 */
function textesVisibles(bloc: string): string[] {
  return [...bloc.matchAll(/'([^']*)'/g)]
    .map((m) => m[1])
    .filter((t) => t.length >= 12)
    .filter((t) => !/^https?:|^\/|@|^[A-Z]{2,}$/.test(t));
}

/** Le motif fautif : un nombre suivi d'une unité de fonds. */
const CHIFFRE_DE_FONDS =
  /\b\d[\d\s\u202f\u00a0]{2,}\s*(références?|documents?|ouvrages?|titres?|notices?|volumes?)/i;

function textesFautifs(bloc: string): string[] {
  return textesVisibles(bloc).filter((t) => CHIFFRE_DE_FONDS.test(t));
}

describe('la page d’accueil n’annonce aucun chiffre de fonds', () => {
  it('⚠ témoin de COMPTE : l’instrument lit bien les 18 textes du bloc', () => {
    // Un compte exact, pas « au moins un » : il oblige à revenir regarder le
    // jour où un texte s'ajoute — et c'est ce jour-là qu'un chiffre entrerait.
    const textes = textesVisibles(pageAccueil());
    expect(
      textes.length,
      'Le bloc PAGE_ACCUEIL a gagné ou perdu un texte. Relisez-le : si c’est ' +
        'un ajout, vérifiez qu’il n’annonce aucune taille de fonds, puis ' +
        'ajustez ce compte.',
    ).toBe(18);
    expect(textes.some((t) => /biblioth[èe]que/i.test(t))).toBe(true);
  });

  it('⚠ aucun texte du seed n’annonce un nombre de documents', () => {
    expect(
      textesFautifs(pageAccueil()),
      'Un chiffre de fonds écrit dans un texte est une MESURE FIGÉE : il était ' +
        'peut-être vrai le jour où on l’a écrit, et personne ne relit un texte ' +
        'qui a l’air correct. Les chiffres réels se calculent à chaque visite — ' +
        'la constellation de la page d’accueil les rend déjà.',
    ).toEqual([]);
  });

  it('⚠ témoins SYNTHÉTIQUES, passés par tout le chemin de l’instrument', () => {
    // ⚠ Ni l'un ni l'autre ne vient du seed : un témoin tiré de ce qu'on
    // mesure est circulaire — il confirme ce qu'on croyait déjà. Et ils
    // traversent `textesFautifs` en entier, pas le seul motif : la première
    // écriture n'éprouvait QUE le motif, et l'appariement, lui, était faux.
    const bloc = [
      'const PAGE_ACCUEIL = {',
      "  identity: { acronym: 'UEX', short: 'UE' },", // ⚠ les chaînes courtes qui désynchronisaient
      "  hero: { lead: 'Plus de 12 000 références à portée de main.' },", // DOIT sortir
      "  search: { hint: 'Livres, thèses et documents numérisés.' },", // ne doit PAS
      '};',
    ].join('\n');

    expect(textesFautifs(bloc)).toEqual(['Plus de 12 000 références à portée de main.']);
  });

  it('⚠ et les espaces du nombre s’écrivent en ÉCHAPPEMENTS, pas au clavier', () => {
    // La forme d'un caractère dans un fichier source ne se lit pas, elle
    // s'écrit : un espace fine insécable et une espace ordinaire s'affichent
    // à l'identique, et un copier-coller les échange sans rien signaler.
    const FINE = '12\u202f000 références';   // espace fine insécable
    const INSEC = '12\u00a0000 documents';   // espace insécable
    const ORDINAIRE = '12 000 ouvrages';     // espace ordinaire

    // ⚠ Le témoin qui distingue les trois SANS les afficher : à l'écran, et
    // dans un diff, elles sont indiscernables.
    expect([FINE.charCodeAt(2), INSEC.charCodeAt(2), ORDINAIRE.charCodeAt(2)]).toEqual([
      0x202f, 0x00a0, 0x20,
    ]);

    expect(CHIFFRE_DE_FONDS.test(FINE)).toBe(true);
    expect(CHIFFRE_DE_FONDS.test(INSEC)).toBe(true);
    expect(CHIFFRE_DE_FONDS.test(ORDINAIRE)).toBe(true);
    expect(CHIFFRE_DE_FONDS.test('01 BP 0000, Ouagadougou')).toBe(false); // l’adresse du seed
    expect(CHIFFRE_DE_FONDS.test('© 2026 — Université d’Exemple')).toBe(false);
  });
});
