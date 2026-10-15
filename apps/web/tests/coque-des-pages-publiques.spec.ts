import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { PREFIXES_PUBLICS_POUR_TEST } from '@/middleware';

/**
 * ⭐⭐ TOUTE PAGE PUBLIQUE PORTE L'EN-TÊTE ET LE PIED COMMUNS.
 *
 * ## 🔴 CE QU'IL RÉPARE, mesuré le 15 octobre 2026 contre le serveur
 *
 * `/opac` rendait 200, son en-tête, et **zéro `<footer>`, zéro lien légal**.
 * Les mentions légales et la confidentialité n'étaient donc atteignables que
 * depuis la page d'accueil. Et elles-mêmes rendaient leur texte NU : ni
 * en-tête, ni pied, ni retour au catalogue.
 *
 * ⚠ Ces deux pages sont la seule classe d'écrans de ce produit dont le PUBLIC
 * EST LE DEHORS. Des mentions légales qu'on n'atteint d'aucune page ne sont pas
 * des mentions légales.
 *
 * ## ⚠ LA POPULATION EST DÉCLARÉE, PAS DÉRIVÉE DU MIDDLEWARE
 *
 * Et c'est la leçon du 9 octobre, payée une fois : le garde des titres dérivait
 * sa population des préfixes publics du middleware. Une page qui aurait DÛ être
 * publique et ne l'était pas n'entrait donc dans aucune population — le garde
 * ne pouvait rien signaler, et son vert était honnête.
 *
 * ⭐ Ici la liste est ÉCRITE. Un écran qui doit être public y figure même si le
 * middleware l'a oublié — et le témoin ci-dessous confronte les deux listes,
 * dans les deux sens.
 */

const RACINE = join(process.cwd(), 'app');

type Nature =
  /** Rend la coque commune : en-tête + pied. */
  | 'coque-commune'
  /** Rend sa propre coque entière — avec son motif. */
  | 'coque-propre';

const PAGES_PUBLIQUES: Record<string, { nature: Nature; motif: string }> = {
  'opac': {
    nature: 'coque-commune',
    motif: 'le catalogue public et tout ce qui vit sous lui (notices, auteurs)',
  },
  'mentions-legales': {
    nature: 'coque-commune',
    motif:
      'son public EST le dehors ; sans pied, aucun retour au catalogue ni accès ' +
      'à l’autre page légale',
  },
  'confidentialite': {
    nature: 'coque-commune',
    motif: 'idem — les deux pages légales partagent la même coque',
  },
  '': {
    nature: 'coque-propre',
    motif:
      'la PAGE D’ACCUEIL porte un pied RICHE (contacts, horaires, services) ' +
      'composé depuis `content`, que les autres pages n’ont pas. Le recopier ' +
      'ferait deux pieds à tenir d’accord ; elle garde donc le sien, et c’est ' +
      'elle qui portait déjà les liens légaux.',
  },
  'e': {
    nature: 'coque-propre',
    motif:
      'la page d’inscription par lien d’école est une porte d’entrée NUE : son ' +
      'seul geste est de s’inscrire, et un en-tête de catalogue y proposerait de ' +
      'partir ailleurs. Elle porte son propre pied, qui ramène à la connexion.',
  },
  'installation': {
    nature: 'coque-propre',
    motif:
      'l’assistant d’installation tourne AVANT qu’une école existe : il n’y a ni ' +
      'nom d’établissement, ni catalogue, ni pages légales à lier.',
  },
  'affiche': {
    nature: 'coque-propre',
    motif:
      'l’affiche A4 imprimable exige « sans menu ni pied » — c’est la raison ' +
      'pour laquelle elle vit à la racine plutôt que sous `/opac`.',
  },
};

const coque = (segment: string) => {
  const p = join(RACINE, segment, 'layout.tsx');
  return existsSync(p) ? readFileSync(p, 'utf8') : '';
};

describe('la coque des pages publiques', () => {
  it('⚠ le relevé LIT quelque chose : sinon tout ce qui suit est vert sur le vide', () => {
    expect(readdirSync(RACINE).length).toBeGreaterThan(10);
    // ⚠ TÉMOIN DE PRÉSENCE sur un cas dont je connais la réponse.
    expect(coque('opac')).toContain('Header');
  });

  it('⚠ chaque page « coque-commune » rend l’EN-TÊTE ET LE PIED', () => {
    for (const [segment, d] of Object.entries(PAGES_PUBLIQUES)) {
      if (d.nature !== 'coque-commune') continue;
      const src = coque(segment);
      expect(src, `/${segment} n’a pas de layout.tsx`).not.toBe('');
      expect(src, `/${segment} ne rend pas <Header />`).toContain('<Header />');
      expect(src, `/${segment} ne rend pas <PiedCommun /> — rien n’y mène aux pages légales`).
        toContain('<PiedCommun />');
    }
  });

  it('⚠ une « coque-propre » ne rend PAS le pied commun : sinon elle en aurait deux', () => {
    for (const [segment, d] of Object.entries(PAGES_PUBLIQUES)) {
      if (d.nature !== 'coque-propre') continue;
      expect(coque(segment), `/${segment} rend le pied commun ET le sien`).not.toContain(
        '<PiedCommun />',
      );
    }
  });

  it('⚠ chaque motif est ÉCRIT, et il dit POURQUOI cette nature', () => {
    for (const [s, d] of Object.entries(PAGES_PUBLIQUES)) {
      expect(d.motif.length, `/${s} : motif trop court pour apprendre quoi que ce soit`).
        toBeGreaterThan(40);
    }
  });

  /*
   * ⚠ LES DEUX LISTES SE CONFRONTENT, DANS LES DEUX SENS. C'est ce qui empêche
   * la famille « un garde dont la population dérive de la chose mal configurée
   * ne peut pas la voir » : si le middleware oublie un préfixe, la liste écrite
   * ici le réclame ; s'il en gagne un, elle le réclame aussi.
   */
  it('⚠ tout segment DÉCLARÉ public l’est aussi dans le middleware', () => {
    const prefixes = new Set(
      PREFIXES_PUBLICS_POUR_TEST.map((p) => p.replace(/^\//, '').replace(/\/$/, '')),
    );
    const absents = Object.keys(PAGES_PUBLIQUES).filter((s) => s !== '' && !prefixes.has(s));
    expect(
      absents,
      'déclarés publics ici et ABSENTS de PUBLIC_PREFIXES : le middleware les ' +
        'redirigera vers /login, et aucun garde dérivé du middleware ne le verra.',
    ).toEqual([]);
  });

  it('⚠ et tout préfixe public du middleware qui est un ÉCRAN est déclaré ici', () => {
    const ecrans = Object.keys(PAGES_PUBLIQUES);
    const oublies = PREFIXES_PUBLICS_POUR_TEST.map((p) => p.replace(/^\//, '').replace(/\/$/, ''))
      // ⚠ Les préfixes d'ACTIFS ne sont pas des écrans : ils n'ont pas de coque.
      .filter((s) => s !== '' && !s.startsWith('.') && !['marque', 'demo'].includes(s))
      .filter((s) => existsSync(join(RACINE, s)))
      .filter((s) => !ecrans.includes(s));
    expect(
      oublies,
      'public dans le middleware, et absent de cette liste : déclarez sa nature ' +
        '— « coque-commune », ou « coque-propre » AVEC SON MOTIF.',
    ).toEqual([]);
  });
});
