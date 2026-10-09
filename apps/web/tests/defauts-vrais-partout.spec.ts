/**
 * UN TEXTE PAR DÉFAUT DOIT ÊTRE VRAI SUR CHAQUE INSTANCE.
 *
 * `LIBELLES.defauts.*` est servi quand l'établissement n'a rien écrit — donc
 * sur TOUTE installation neuve, le premier jour, avant que personne n'édite.
 * Mesuré le 8 octobre 2026 : `app/page.tsx` fait `identity.lead ||
 * LIBELLES.defauts.presentation`, et l'API renvoie `lead: ''` par défaut. Ces
 * textes atteignent donc vraiment le public.
 *
 * ⚠ CE QU'ILS NE PEUVENT PAS FAIRE : affirmer un MODE D'ACCÈS. Le défaut disait
 * « Cherchez, EMPRUNTEZ et lisez les ressources de votre bibliothèque, SUR
 * PLACE comme hors connexion. » Sur une université à distance — étudiants
 * dispersés, aucun rayon physique — c'était la première phrase de la page
 * d'accueil, et elle envoyait emprunter sur place.
 *
 * ⚠ LA PORTÉE EST CELLE DES DÉFAUTS, ET D'EUX SEULS. Le contenu qu'une école
 * ÉCRIT peut parler de son campus, de ses horaires et de ses rayons : c'est sa
 * vitrine, elle sait ce qu'elle a. C'est exactement « un avertissement ne se
 * place que là où il détrompe », appliqué à un garde — la propriété ne vaut que
 * là où le texte part sur toutes les instances.
 *
 * ⚠ Et ce n'est pas un vide qui invite à agir : c'est un PLEIN qui affirme.
 * Personne ne va vérifier une phrase d'accueil qui se lit bien.
 */
import { describe, expect, it } from 'vitest';
import { LIBELLES } from '@/lib/libelles';

/**
 * Les mots qui affirment un mode d'accès PHYSIQUE.
 *
 * ⚠ Choisis sur ce qu'ils AFFIRMENT, pas sur leur famille lexicale.
 * « consulter » et « lire » ne disent pas où ; « emprunter », « sur place » et
 * « rayon » le disent.
 */
const MOTS_DE_RAYON = [
  'empruntez',
  'emprunter',
  'emprunt',
  'sur place',
  'sur site',
  'campus',
  'rayon',
  'étagère',
  'exemplaire',
  'guichet',
  'salle de lecture',
  'horaires',
  'venez',
];

const defauts = LIBELLES.defauts as Record<string, unknown>;

describe('les textes par défaut sont vrais sur chaque instance', () => {
  it('⚠ témoin de COMPTE : le relevé a bien vu des défauts', () => {
    // Sans lui, un bloc renommé rendrait une population VIDE et toutes les
    // assertions « tous les défauts satisfont P » passeraient sur rien.
    const textes = Object.values(defauts).filter((v) => typeof v === 'string');
    expect(textes.length).toBeGreaterThan(2);
  });

  it('⚠ aucun défaut n’affirme un MODE D’ACCÈS', () => {
    const fautifs: string[] = [];
    for (const [cle, valeur] of Object.entries(defauts)) {
      if (typeof valeur !== 'string') continue;
      const trouves = MOTS_DE_RAYON.filter((m) => valeur.toLowerCase().includes(m));
      if (trouves.length > 0) fautifs.push(`defauts.${cle} → ${trouves.join(', ')}`);
    }
    expect(
      fautifs,
      'Un texte par défaut part sur TOUTE instance, y compris une bibliothèque ' +
        'sans rayon. Retirez le mode d’accès, ou sortez ce texte des défauts.',
    ).toEqual([]);
  });

  it('⚠ témoin d’ABSENCE : le relevé sait DIRE NON sur la confusion plausible', () => {
    // Le motif doit mordre sur l'ancien texte — celui qui a motivé ce garde —
    // et se taire sur le nouveau. Sans ce témoin, un motif qui ne matche jamais
    // rendrait le test vert sur n'importe quoi.
    const ancien = 'Cherchez, empruntez et lisez les ressources de votre bibliothèque, sur place comme hors connexion.';
    expect(MOTS_DE_RAYON.some((m) => ancien.toLowerCase().includes(m))).toBe(true);
    expect(
      MOTS_DE_RAYON.some((m) => LIBELLES.defauts.presentation.toLowerCase().includes(m)),
    ).toBe(false);
  });

  it('⚠ et le défaut reste une INVITATION — il ne devient pas une notice technique', () => {
    // La propriété que le registre des textes lui reconnaît : un impératif
    // d'invitation. En retirant « empruntez » on pouvait tomber dans l'inverse —
    // une phrase descriptive qui ne s'adresse à personne.
    expect(LIBELLES.defauts.presentation).toMatch(/cherchez|consultez|découvrez/i);
    expect(LIBELLES.defauts.presentation.length).toBeGreaterThan(20);
  });
});
