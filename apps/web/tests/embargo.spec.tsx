/**
 * L'EMBARGO — poser une date, et la DIRE. Les deux moitiés, un seul lot.
 *
 * 🔴 CE QUE ÇA CORRIGE (dette front n° 16, tranchée première après le 21).
 * L'API portait l'embargo ENTIÈREMENT : `CreateRecordDto` et `UpdateRecordDto`
 * acceptent `embargoUntil`, le service l'écrit, DEUX points de décision
 * l'appliquent (l'accès en ligne et l'émission de licence hors-ligne), le
 * contrat de notice publique le SERT, et le 16 septembre le backend a même
 * séparé son refus de celui d'un droit manquant — pour que le lecteur sache
 * qu'il doit ATTENDRE et non DEMANDER.
 *
 * Le front ne connaissait pas le mot : **zéro occurrence**. Aucun champ, aucun
 * affichage. Et **zéro notice sous embargo sur 8 480** : la fonctionnalité
 * n'avait jamais pu être exercée par le produit.
 *
 * ⚠ LA FORME FAUTIVE QUE CE LOT REFUSE : livrer le champ SEUL. C'est le geste
 * qui vient — le champ est petit, l'affichage est un autre écran. Le résultat
 * est un document que la bibliothécaire croit avoir protégé et qui, pour le
 * lecteur, refuse sans rien dire : il conclut à une panne et réessaie. La
 * moitié 1 seule ne fait pas un pas vers la fonctionnalité, elle FABRIQUE le
 * défaut que la moitié 2 corrige.
 */

import { describe, expect, it } from 'vitest';
import { dateLisible, lireEmbargo, pourChampDate } from '@/lib/embargo';
import { LIBELLES } from '@/lib/libelles';

const MAINTENANT = new Date('2026-09-22T11:00:00Z');

describe('⚠ TROIS états, pas deux', () => {
  it('aucune date : aucun embargo', () => {
    expect(lireEmbargo(null, MAINTENANT).etat).toBe('aucun');
    expect(lireEmbargo(undefined, MAINTENANT).etat).toBe('aucun');
    expect(lireEmbargo('', MAINTENANT).etat).toBe('aucun');
  });

  it('une date FUTURE : en cours', () => {
    const r = lireEmbargo('2027-01-15T00:00:00Z', MAINTENANT);
    expect(r.etat).toBe('en-cours');
  });

  it('⚠ une date PASSÉE : ÉCHU, jamais « sous embargo »', () => {
    // L'état que deux états auraient écrasé : un document redevenu lisible
    // continuerait d'annoncer qu'il ne l'est pas.
    const r = lireEmbargo('2025-01-15T00:00:00Z', MAINTENANT);
    expect(r.etat).toBe('echu');
  });

  it('⚠ la BORNE est celle de l’API — strictement supérieur', () => {
    // `sousEmbargo()` compare `embargoUntil.getTime() > maintenant`. Deux
    // implémentations d'une même frontière divergent le jour où l'une change.
    const pile = MAINTENANT.toISOString();
    expect(lireEmbargo(pile, MAINTENANT).etat).toBe('echu');
    expect(lireEmbargo(new Date(MAINTENANT.getTime() + 1).toISOString(), MAINTENANT).etat).toBe(
      'en-cours',
    );
  });

  it('une date illisible ne bloque rien et ne prétend rien', () => {
    expect(lireEmbargo('pas-une-date', MAINTENANT).etat).toBe('aucun');
  });
});

describe('⚠ la date du champ est LOCALE, pas UTC', () => {
  it('pourChampDate ne décale pas le jour', () => {
    // ⚠ `toISOString().slice(0,10)` rendrait la VEILLE pour toute date à
    // minuit sur un navigateur à l'est de Greenwich. Le produit vise l'Afrique
    // de l'Ouest, mais rien ne garantit le fuseau du navigateur.
    const minuitLocal = new Date(2027, 0, 15, 0, 0, 0);
    expect(pourChampDate(minuitLocal)).toBe('2027-01-15');
  });

  it('elle porte le format qu’un <input type="date"> exige', () => {
    expect(pourChampDate(new Date(2026, 8, 3))).toBe('2026-09-03');
  });
});

describe('Les textes portent ce pour quoi ils existent', () => {
  it('⚠ la phrase du lecteur dit qu’il doit ATTENDRE, pas demander', () => {
    // C'est la raison pour laquelle l'API sert la date. Un test qui restate la
    // constante suivrait sa dégradation sans broncher.
    const suite = LIBELLES.embargo.enCoursSuite;
    expect(suite).toMatch(/description|consultable/i);
    expect(suite).toMatch(/fichier/i);
    // Et surtout : il n'y a personne à qui s'adresser.
    expect(suite).not.toMatch(/contactez|demandez|adressez/i);
  });

  it('la phrase porte la DATE, sans quoi « attendez » est une impasse', () => {
    expect(LIBELLES.embargo.enCours('15 janvier 2027')).toContain('15 janvier 2027');
  });

  it('⚠ l’aide du champ dit que le document reste DÉCRIT', () => {
    // Sans ça, une bibliothécaire peut croire qu'un embargo retire la notice du
    // catalogue — et renoncer à en poser un.
    expect(LIBELLES.embargo.champAide).toMatch(/décrit|description|catalogue/i);
    expect(LIBELLES.embargo.champAide).toMatch(/vide/i);
  });

  it('⚠ et la LEVÉE est nommée : vider le champ est un geste, pas un oubli', () => {
    expect(LIBELLES.embargo.lever).toMatch(/lève|lever/i);
  });

  it('« échu » ne se lit pas comme « en cours »', () => {
    const enCours = LIBELLES.embargo.enCours('1 mars 2027');
    const echu = LIBELLES.embargo.echu('1 mars 2020');
    expect(echu).not.toEqual(enCours);
    expect(echu).toMatch(/échu/i);
  });

  it('la date se lit en toutes lettres, jamais en ISO', () => {
    expect(dateLisible(new Date(2027, 0, 15))).toBe('15 janvier 2027');
  });
});
