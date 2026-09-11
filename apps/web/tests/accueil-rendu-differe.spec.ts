/**
 * La page d'accueil n'attend plus ce qui n'empêche pas de l'afficher.
 *
 * ⚠ MESURÉ, pas supposé. Avec 1,5 s de latence par appel :
 *   — quatre appels en série ......... premier octet 6,25 s
 *   — trois en parallèle ............. premier octet 3,14 s
 *   — trois différés (ce lot) ........ premier octet 1,53 s
 * Et surtout : premier octet ≈ page complète, avant. Rien ne s'écoulait, le
 * visiteur regardait du blanc du début à la fin.
 *
 * ⚠ LE PLANCHER EST STRUCTUREL : `fetchTenantHome` commande l'affichage — nom
 * de l'école, bandeau, repli sobre d'un domaine inconnu. Descendre sous un
 * aller-retour échangerait du blanc contre un squelette sans marque, et c'est
 * une décision prise contre.
 *
 * Ce test lit la SOURCE, faute de pouvoir rendre un composant serveur
 * asynchrone dans jsdom. C'est une vérification de forme, et elle est explicite
 * à ce sujet : elle tient les invariants qui font la performance, pas le rendu.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const page = readFileSync(join(process.cwd(), 'app', 'page.tsx'), 'utf-8');
const sections = readFileSync(join(process.cwd(), 'app', 'sections-differees.tsx'), 'utf-8');

const DIFFERES = ['fetchConstellation', 'fetchChiffres', 'fetchNouveautes'] as const;

describe('⚠ la page n’attend plus les trois appels différés', () => {
  it('témoin : les deux fichiers sont bien lus', () => {
    // Sans lui, un chemin erroné rendrait des chaînes vides et tout
    // « n'apparaît pas » serait trivialement vrai.
    expect(page).toContain('export default async function HomePage');
    expect(sections).toContain('export function SectionConstellation');
  });

  for (const appel of DIFFERES) {
    it(`${appel} n’est PAS appelé par page.tsx`, () => {
      // C'est l'invariant de performance : un seul de ces appels remis dans la
      // page, et elle réattend — on repasserait de 1,53 s à 3,14 sans que rien
      // ne le signale.
      expect(page).not.toContain(`${appel}(`);
    });

    it(`${appel} vit dans une section différée`, () => {
      expect(sections).toContain(`${appel}()`);
    });
  }

  it('les trois sections sont bien derrière une frontière Suspense', () => {
    expect(sections.match(/<Suspense/g)?.length).toBe(3);
  });
});

describe('⚠ ce que la page attend ENCORE, et pourquoi', () => {
  it('fetchTenantHome reste avant le repli sobre', () => {
    const debut = page.indexOf('export default async function HomePage');
    const posHome = page.indexOf('await fetchTenantHome()', debut);
    const posRepli = page.indexOf('if (!home)', debut);
    expect(posHome).toBeGreaterThan(-1);
    expect(posRepli).toBeGreaterThan(posHome);
  });
});

describe('⚠ la navigation ne dépend plus d’un appel qui ne la concerne pas', () => {
  it('l’ancre « Catalogue » est inconditionnelle', () => {
    // Elle s'affichait selon `hasSavoirs || catalogueInconnu` : le menu
    // attendait la constellation pour savoir s'il montrait « Catalogue ».
    // C'est ce qui empêchait de diffuser la page tôt.
    expect(page).toContain("{ href: '#savoirs', label: 'Catalogue' }");
    expect(page).not.toContain('hasSavoirs');
    expect(page).not.toContain('catalogueInconnu');
  });
});
