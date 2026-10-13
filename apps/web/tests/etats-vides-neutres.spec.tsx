/**
 * ⭐⭐ UN ÉTAT VIDE N'EST PAS UNE FAUTE — et ce garde le mesure par l'EFFET.
 *
 * ## 🔴 CE QUI L'A MOTIVÉ
 *
 * Constaté par Jean sur rc12, compte étudiant sans historique :
 * `/mes-consultations` et `/mes-documents-hors-ligne` affichaient leur état vide
 * dans un encadré **rose/rouge**. Il se lisait comme une erreur.
 *
 * ## ⚠ ET MON PREMIER RELEVÉ A CHERCHÉ LA MAUVAISE FORME
 *
 * J'ai cherché `tone="error"` : 62 occurrences, **aucune** fautive. Le ton
 * employé était `tone="warning"`, dont la table rend `bg-ocre/10` — l'ocre de
 * marque à 10 %, c'est-à-dire un rose pâle. « Un motif syntaxique ne voit que la
 * forme qu'on a imaginée », et j'avais imaginé la mauvaise.
 *
 * ⭐ **Pire, et c'est ce qui rend le défaut structurel** : `ocre` est la couleur
 * SECONDAIRE DU TENANT, alimentée par `TenantSettings`. Un état vide peint avec
 * elle **change de couleur d'une école à l'autre** — et peut tomber sur un rouge
 * franc. Le garde porte donc sur les DEUX familles, pas seulement sur le rouge.
 *
 * ## ⭐ CE QU'IL MESURE
 *
 * · ce que `EtatVide` REND — aucun jeton d'erreur, aucun `role="alert"` ;
 * · que chaque écran à état vide l'EMPLOIE, par une obligation déclarée ;
 * · qu'un état vide donne TOUJOURS une sortie.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { EtatVide } from '@/components/etat-vide';
import { LIBELLES } from '@/lib/libelles';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: unknown }) => (
    <a href={href}>{children as never}</a>
  ),
}));

/** ⚠ Les deux familles : le rouge des erreurs, ET l'ocre dynamique du tenant. */
const JETONS_INTERDITS = [
  'bg-red',
  'text-red',
  'border-red',
  'bg-ocre/10',
  'bg-ocre/20',
] as const;

/**
 * ⚠ L'OBLIGATION DÉCLARÉE. Chaque écran qui montre un état vide de cette nature
 * l'emploie. Un écran neuf n'est pas dans la liste, et le compte exact convoque.
 *
 * ⭐ `sansExemplaire` de l'aperçu des étiquettes n'y est PAS, et c'est écrit :
 * ce n'est pas un état vide mais une BORNE par notice — « cette notice-ci n'a
 * pas de code-barres ». Elle reste un avertissement, parce qu'elle signale une
 * donnée qui manque là où on l'attendait.
 */
const ECRANS_A_ETAT_VIDE: ReadonlyArray<{ readonly fichier: string; readonly quoi: string }> = [
  { fichier: 'app/mes-consultations/page.tsx', quoi: 'aucune consultation' },
  { fichier: 'app/mes-documents-hors-ligne/page.tsx', quoi: 'aucun document emporté' },
  { fichier: 'app/mes-prets/page.tsx', quoi: 'aucune carte de bibliothèque' },
  { fichier: 'app/admin/etiquettes/page.tsx', quoi: 'aucune notice cochée' },
];

const sourceDe = (f: string) => readFileSync(resolve(process.cwd(), f), 'utf-8');

describe('⭐⭐ ce que `EtatVide` REND — mesuré, pas déclaré', () => {
  function rendre(actions = [{ libelle: 'Parcourir le catalogue', href: '/opac' }]) {
    const { container } = render(
      <EtatVide phrase="Rien ici pour le moment." detail="Et voici pourquoi." actions={actions} />,
    );
    return container;
  }

  it('aucun jeton d’erreur, aucune couleur de marque', () => {
    const html = rendre().innerHTML;
    for (const j of JETONS_INTERDITS) {
      expect(html, `un état vide ne doit pas porter « ${j} » : il se lit comme une faute`).not.toContain(j);
    }
  });

  /**
   * ⭐ LA MOITIÉ INVISIBLE DU DÉFAUT. `Alert` pose `role="alert"` pour le ton
   * `error` ; un lecteur d'écran annonçait donc « alerte » sur une étagère vide.
   * Aucune couleur n'aurait dit ça à sa place.
   */
  it('⚠ aucun `role="alert"` — un vide n’interrompt personne', () => {
    expect(rendre().querySelector('[role="alert"]')).toBeNull();
  });

  it('⭐ une SORTIE est rendue, et elle mène quelque part', () => {
    const liens = rendre().querySelectorAll('a[href]');
    expect(liens.length, 'un état vide sans sortie est une impasse').toBeGreaterThan(0);
    for (const a of liens) expect(a.getAttribute('href')).toMatch(/^\//);
  });

  it('les deux sorties du lecteur sont rendues quand on les donne', () => {
    const c = rendre([
      { libelle: LIBELLES.etatsVides.parcourirCatalogue, href: '/opac' },
      { libelle: LIBELLES.etatsVides.telechargerDepuisApp, href: '/e/zinda' },
    ]);
    expect(c.textContent).toContain(LIBELLES.etatsVides.parcourirCatalogue);
    expect(c.textContent).toContain(LIBELLES.etatsVides.telechargerDepuisApp);
  });
});

describe('⭐ l’obligation : chaque écran à état vide emploie `EtatVide`', () => {
  it('les quatre écrans l’emploient', () => {
    for (const e of ECRANS_A_ETAT_VIDE) {
      expect(sourceDe(e.fichier), `${e.fichier} (${e.quoi}) doit employer EtatVide`).toContain(
        'EtatVide',
      );
    }
  });

  /**
   * ⭐⭐ LE TÉMOIN QUI TIENT LA DÉCISION : plus aucun de ces écrans ne peint un
   * état vide avec `tone="warning"`. C'est le ton exact que Jean a vu.
   */
  it('⚠ et aucun n’a gardé un `tone="warning"` sur son état VIDE', () => {
    for (const e of ECRANS_A_ETAT_VIDE) {
      const src = sourceDe(e.fichier)
        .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, '')
        .split('\n')
        .filter((l) => !l.trim().startsWith('//'))
        .join('\n');
      /*
       * ⚠ La BORNE est écrite : on cherche un `tone="warning"` à moins de trois
       * lignes d'un libellé d'absence. Un avertissement LÉGITIME ailleurs dans
       * le même fichier ne doit pas être accusé — `admin/etiquettes` en garde
       * un pour `sansExemplaire`, et c'est juste.
       */
      const lignes = src.split('\n');
      const fautifs = lignes
        .map((l, i) => ({ l, i }))
        .filter(({ l }) => l.includes('tone="warning"'))
        .filter(({ i }) =>
          lignes
            .slice(i, i + 3)
            .join(' ')
            .match(/aucun|aucune|T\.vide/i),
        );
      expect(
        fautifs.map(({ i }) => `${e.fichier}:${i + 1}`),
        'un état vide peint en `warning` : c’est le rose que Jean a vu',
      ).toEqual([]);
    }
  });

  it('⭐ compte EXACT des écrans déclarés — il convoque', () => {
    expect(ECRANS_A_ETAT_VIDE).toHaveLength(4);
    expect(ECRANS_A_ETAT_VIDE.map((e) => e.fichier).sort()).toEqual([
      'app/admin/etiquettes/page.tsx',
      'app/mes-consultations/page.tsx',
      'app/mes-documents-hors-ligne/page.tsx',
      'app/mes-prets/page.tsx',
    ]);
  });
});
