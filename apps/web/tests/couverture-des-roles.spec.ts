/**
 * Une fonction donnée à un rôle DOIT ouvrir une porte.
 *
 * ⚠ POURQUOI CE TEST EXISTE. Le produit surveillait les ÉCRANS SANS
 * PERMISSION — une entrée de menu visible menant à un écran qui refuse. Il n'a
 * jamais surveillé l'inverse : une PERMISSION SANS ÉCRAN.
 *
 * Le 10 septembre 2026, la mesure de l'espace professionnel a montré qu'une
 * bibliothécaire détient `adherents.gerer` — cinq routes d'API derrière elle,
 * dont « inscrire un adhérent » — et qu'aucun écran ne l'ouvre. Elle prête,
 * elle rend, elle ne peut pas inscrire un lecteur. Rien ne le signalait : un
 * droit sans porte ne lève aucune erreur, il ne fait rien.
 *
 * Le test lit les rôles système RÉELS de l'API et exige que chaque fonction
 * soit réclamée par une entrée de menu, ou déclarée dans
 * lib/fonctions-sans-ecran.ts avec sa raison.
 *
 * ⚠ Il lit `apps/api` depuis `apps/web`, en lecture seule, comme
 * fonctions-connues-de-l-api.spec.ts : le couplage EXISTE dans les faits.
 */

import { describe, expect, it } from 'vitest';
import { NAVIGATION_PERSONNEL } from '@/lib/navigation';
import { FONCTIONS_SANS_ECRAN } from '@/lib/fonctions-sans-ecran';
import { rolesSysteme } from './aide-roles-systeme';

/** Les fonctions qu'une entrée de menu réclame. */
const fonctionsDuMenu = new Set(
  NAVIGATION_PERSONNEL.flatMap((o) => o.entrees).flatMap((e) => e.fonctions),
);

const declarees = new Map(FONCTIONS_SANS_ECRAN.map((f) => [f.fonction, f]));

describe('lecture des rôles système', () => {
  it('les lit vraiment — témoin', () => {
    // Sans ce témoin, un chemin ou une regex cassée rendrait une liste VIDE et
    // toutes les assertions ci-dessous passeraient sans rien regarder.
    const roles = rolesSysteme();
    expect(roles.map((r) => r.nom)).toContain('Bibliothécaire');
    const bib = roles.find((r) => r.nom === 'Bibliothécaire')!;
    expect(bib.fonctions).toContain('catalogue.gerer');
    expect(bib.fonctions.length).toBeGreaterThan(3);
    expect(fonctionsDuMenu.size).toBeGreaterThan(5);
  });
});

describe('⚠ aucune fonction sans porte', () => {
  for (const role of rolesSysteme().filter((r) => r.fonctions.length > 0)) {
    it(`${role.nom} : chaque fonction ouvre un écran, ou est déclarée`, () => {
      const orphelines = role.fonctions.filter(
        (f) => !fonctionsDuMenu.has(f) && !declarees.has(f),
      );
      // Le message d'échec doit dire QUOI FAIRE : soit l'écran manque, soit la
      // fonction s'exerce ailleurs et il faut l'écrire.
      expect(
        orphelines,
        `${role.nom} détient ${orphelines.join(', ')} sans qu'aucune entrée de ` +
          `menu ne la réclame. Soit l'écran manque (défaut : ajoutez-le au ` +
          `backlog ET à lib/fonctions-sans-ecran.ts en 'defaut-connu'), soit ` +
          `elle s'exerce ailleurs (déclarez-la en 'exercee-ailleurs').`,
      ).toEqual([]);
    });
  }
});

describe('la liste d’exceptions ne devient pas un tapis', () => {
  it('chaque exception porte une raison qui dit quelque chose', () => {
    for (const f of FONCTIONS_SANS_ECRAN) {
      expect(f.raison.length, f.fonction).toBeGreaterThan(60);
    }
  });

  it('⚠ aucune exception ne survit à l’écran qu’elle attendait', () => {
    // Le jour où une entrée de menu réclame une fonction déclarée ici, la
    // déclaration est PÉRIMÉE — et une exception périmée est exactement ce qui
    // transforme cette liste en endroit où l'on enterre les trouvailles.
    const perimees = FONCTIONS_SANS_ECRAN.filter((f) => fonctionsDuMenu.has(f.fonction));
    expect(perimees.map((f) => f.fonction)).toEqual([]);
  });

  it('les défauts connus sont nommés comme tels, pas noyés', () => {
    // ⚠ CE TÉMOIN EST TOMBÉ LE 10 SEPTEMBRE 2026, ET C'ÉTAIT LA BONNE NOUVELLE.
    // Il exigeait exactement un défaut connu — `adherents.gerer`, la fonction
    // sans porte — en disant : « le jour où il n'y en a plus, ce témoin tombe,
    // et c'est une bonne nouvelle à constater plutôt qu'à supposer ». L'écran
    // /admin/adherents a été livré, la dette est payée, la liste est vide.
    //
    // La valeur attendue reste écrite EN DUR plutôt que remplacée par « aucune
    // contrainte » : y ajouter un défaut demain fera tomber ce test, et c'est
    // voulu — inscrire un droit sans porte doit être un geste conscient, pas
    // une ligne qui passe inaperçue dans une liste.
    //
    // ⚠ ET « DEMAIN » EST ARRIVÉ LE 12 SEPTEMBRE 2026 — DEUX FOIS DANS LA
    // JOURNÉE. Le matin, `depot.deposer` a été accordée à l'Étudiant avant que
    // l'écran « Mon dépôt » n'existe : ce test est tombé, la session backend a
    // dû inscrire la dette sciemment, et c'est exactement le geste qu'il exige.
    // Le soir, l'écran a été livré, la fonction a sa porte, la déclaration est
    // repassée en 'exercee-ailleurs' — et ce test est tombé de nouveau, dans
    // l'autre sens.
    //
    // C'est la mécanique voulue : le témoin tombe à CHAQUE changement d'état de
    // la dette, jamais entre les deux. Une dette qui ne se rappelle pas
    // d'elle-même n'est pas une dette, c'est un oubli en attente.
    const defauts = FONCTIONS_SANS_ECRAN.filter((f) => f.nature === 'defaut-connu');
    expect(defauts.map((f) => f.fonction)).toEqual([]);
  });

  it('un défaut connu, s’il y en a un, renvoie à une dette suivie', () => {
    // La propriété qui reste vraie même à zéro, et qui empêche cette liste de
    // devenir un tapis : un « défaut connu » sans numéro de backlog est une
    // trouvaille enterrée. Vide aujourd'hui, la règle tient pour demain.
    for (const f of FONCTIONS_SANS_ECRAN.filter((x) => x.nature === 'defaut-connu')) {
      expect(f.raison, f.fonction).toMatch(/backlog/i);
    }
  });
});
