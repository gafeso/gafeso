import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MESSAGE_BASE_INJOIGNABLE } from './base-injoignable';

/**
 * LES GARDES VIVANTS — ceux qui interrogent le SERVEUR, gatés `PG_LIVE=1`.
 *
 * ⚠ CE FICHIER EXISTE PARCE QU'UN GARDE QUE PERSONNE NE LANCE NE GARDE RIEN.
 * Les trois gardes vivants passaient tous — et ni `npm test`, ni le crochet de
 * pré-publication ne les exécutaient. Ils dormaient depuis leur écriture.
 *
 * Deux propriétés sont tenues ici, et aucune n'est décorative :
 *
 * **1. Tout garde vivant sort ROUGE si la base ne répond pas.** Un
 * `if (injoignable) return` rendrait vert un test qui n'a rien exercé — la
 * forme la plus répandue du faux positif de suite.
 *
 * **2. Le message de ce cas est une CONSTANTE PARTAGÉE**, parce qu'un script
 * shell le lit. Le crochet de pré-publication distingue « la propriété est
 * violée » (refus) de « il n'y avait pas de base » (avertissement) en
 * cherchant cette chaîne. Reformuler un message casserait ce couplage sans
 * bruit ; le test l'interdit.
 */

const RACINE = join(__dirname, '..');

/** Tous les fichiers de test qui portent un `describe.runIf(PG_LIVE)`. */
function gardesVivants(dir: string): string[] {
  const trouves: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const chemin = join(dir, e.name);
    if (e.isDirectory()) trouves.push(...gardesVivants(chemin));
    else if (e.name.endsWith('.spec.ts') && chemin !== __filename) {
      // ⚠ `chemin !== __filename` N'EST PAS UNE COQUETTERIE. Sans lui, ce
      // fichier se trouve LUI-MÊME : il contient la chaîne qu'il cherche, pour
      // pouvoir la chercher. L'instrument comptait quatre gardes vivants et
      // s'accusait de sortir en silence. C'est la forme la plus commune du
      // relevé qui reproduit ce qu'il traque — et elle s'est manifestée à la
      // PREMIÈRE exécution, parce que le témoin compte au lieu de constater.
      const source = readFileSync(chemin, 'utf8');
      if (source.includes("process.env.PG_LIVE === '1'")) trouves.push(chemin);
    }
  }
  return trouves;
}

/** Tous les fichiers de test, pour la réciproque. */
function tousLesTests(dir: string): string[] {
  const trouves: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const chemin = join(dir, e.name);
    if (e.isDirectory()) trouves.push(...tousLesTests(chemin));
    else if (e.name.endsWith('.spec.ts') && chemin !== __filename) trouves.push(chemin);
  }
  return trouves;
}

const VIVANTS = gardesVivants(RACINE);

describe('⚠ Les gardes vivants, et ce qu’ils promettent', () => {
  it('⚠ TÉMOIN QUI COMPTE : il y en a exactement HUIT', () => {
    // « Au moins un » confirmerait que le relevé tourne. Seul un compte exact
    // signale le suivant, écrit demain par quelqu'un qui n'aura pas lu ceci
    // — et qui pourrait le rendre vert sur une base absente.
    //
    // ⚠ PASSÉ DE TROIS À QUATRE le 12 septembre 2026, puis à SIX le 14 —
    // l'isolement entre écoles et la déprovision. Le compte a fait son office
    // les deux fois : il a fallu revenir ici et vérifier que les gardes neufs
    // respectent les deux promesses de ce fichier — nom en `-en-base`, et
    // ROUGE quand la base ne répond pas plutôt que vert sur rien.
    expect(VIVANTS.map((f) => f.replace(RACINE + '/', '')).sort()).toEqual([
      'admin/deprovision-en-base.spec.ts',
      'cataloging/fonds-conforme-en-base.spec.ts',
      'cataloging/formes-decomposees-en-base.spec.ts',
      'cataloging/vocabulaire-des-types-en-base.spec.ts',
      'collections/hierarchie-en-base.spec.ts',
      'roles/roles-systeme-en-base.spec.ts',
      'tenancy/derive-des-schemas-en-base.spec.ts',
      'tenancy/isolement-des-ecoles-en-base.spec.ts',
    ]);
  });

  it('⚠ LA CONVENTION DE NOM : tout garde vivant s’appelle `*-en-base.spec.ts`', () => {
    // ⚠ C'EST CE QUI LES REND RAMASSABLES. Le script `npm run test:base` et le
    // crochet de pré-publication les sélectionnent par ce motif — une
    // convention que le NOM porte ne peut pas se périmer comme une liste tenue
    // à la main, et c'est la faute qu'on a payée ailleurs sur les listes
    // d'exceptions.
    //
    // Le versant pur d'un garde vit alors dans un fichier à part : c'est ce qui
    // est arrivé au vocabulaire des types, coupé en deux le 12 septembre 2026.
    for (const f of VIVANTS) {
      expect(f, `${f} : un garde vivant doit finir par -en-base.spec.ts`).toMatch(
        /-en-base\.spec\.ts$/,
      );
    }
  });

  it('⚠ et RIEN d’autre ne porte ce nom — sinon le ramassage serait plus large qu’annoncé', () => {
    // La réciproque compte autant : un fichier nommé `-en-base` sans
    // `describe.runIf` serait lancé par `test:base` dans un contexte où il
    // n'attend rien, et le crochet le compterait comme un garde vivant.
    const nommes = tousLesTests(RACINE).filter((f) => /-en-base\.spec\.ts$/.test(f));
    expect(nommes.sort()).toEqual(VIVANTS.sort());
  });

  it('⚠ aucun ne sort en SILENCE quand la base ne répond pas', () => {
    // La forme interdite est `if (!joignable) return` : elle rend vert un test
    // qui n'a rien mesuré. La forme juste est une assertion.
    for (const f of VIVANTS) {
      const source = readFileSync(f, 'utf8');
      expect(source, f).not.toMatch(/if\s*\(\s*!\s*joignable\s*\)\s*return/);
      expect(source, f).toContain('MESSAGE_BASE_INJOIGNABLE');
    }
  });

  it('⚠ et ils emploient la CONSTANTE, que le crochet de pré-publication lit', () => {
    // Le couplage est réel : un script shell cherche cette chaîne pour
    // distinguer « propriété violée » de « pas de base ». Le déclarer une fois
    // et le vérifier ici est ce qui l'empêche de rompre en silence.
    for (const f of VIVANTS) {
      expect(readFileSync(f, 'utf8'), f).not.toContain(`'${MESSAGE_BASE_INJOIGNABLE}'`);
    }
    expect(MESSAGE_BASE_INJOIGNABLE).toMatch(/injoignable/);
  });
});
