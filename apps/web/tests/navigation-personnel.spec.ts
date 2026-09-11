/**
 * Navigation du personnel — structure, permissions, et absence d'entrée inerte.
 *
 * Mécanise la recette du lot « refonte de la navigation ». Le contrôle négatif
 * n° 6 (« la recette échoue si on rétablit l'ancienne navigation ») est tenu
 * par le premier bloc : l'ancienne nav mettait Comptes, Classes et Import
 * étudiants à plat sous « Administration ».
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ENTREES_ECARTEES,
  NAVIGATION_PERSONNEL,
  ongletDe,
  ongletsVisibles,
  premiereEntreeAccessible,
} from '@/lib/navigation';
import { elargissements, PERMISSIONS_CIBLES } from '@/lib/permissions-cibles';

// Vitest tourne avec apps/web pour racine (root de vitest.config.ts).
const ecran = (href: string) => resolve(process.cwd(), `app${href}`, 'page.tsx');
const toutes = NAVIGATION_PERSONNEL.flatMap((o) => o.entrees);
const onglet = (id: string) => NAVIGATION_PERSONNEL.find((o) => o.id === id);

describe('découpage par métier (et non plus tout sous Administration)', () => {
  it('le travail quotidien n’est plus un acte d’administration', () => {
    const admin = onglet('administration');
    expect(admin).toBeDefined();
    const hrefsAdmin = admin!.entrees.map((e) => e.href);

    // C'était le cœur du problème : 15 entrées à plat sous « Administration »,
    // dont le travail quotidien d'une bibliothécaire.
    expect(hrefsAdmin).not.toContain('/admin/comptes');
    expect(hrefsAdmin).not.toContain('/admin/classes');
    expect(hrefsAdmin).not.toContain('/admin/import-etudiants');
    expect(hrefsAdmin).not.toContain('/admin/catalogue');
    expect(hrefsAdmin).not.toContain('/admin/recolement');
  });

  it('chaque entrée déplacée est atteignable à sa nouvelle place, et à elle seule', () => {
    // Recette n° 1 : une entrée n'apparaît que dans UN onglet.
    const parHref = new Map<string, string[]>();
    for (const o of NAVIGATION_PERSONNEL) {
      for (const e of o.entrees) parHref.set(e.href, [...(parHref.get(e.href) ?? []), o.id]);
    }
    for (const [href, onglets] of parHref) {
      expect(onglets, `${href} apparaît dans plusieurs onglets`).toHaveLength(1);
    }

    expect(onglet('lecteurs')!.entrees.map((e) => e.href)).toContain('/admin/comptes');
    expect(onglet('outils')!.entrees.map((e) => e.href)).toContain('/admin/import-etudiants');
    expect(onglet('guichet')!.entrees.map((e) => e.href)).toContain('/guichet');
  });

  it('Administration ne garde que du paramétrage', () => {
    expect(onglet('administration')!.entrees.map((e) => e.libelle)).toEqual([
      // ⚠ « Modules » EN TÊTE : activer un module décide de ce que les autres
      // écrans montrent. C'est le réglage qui commande les réglages.
      'Modules',
      'Identité',
      'Règles de prêt',
      'Page d’accueil',
      'Interopérabilité',
      'Rôles',
      'Journal d’audit',
    ]);
  });
});

describe('libellés', () => {
  it('« Catégories » est devenu « Domaines », route inchangée', () => {
    const domaines = toutes.find((e) => e.href === '/admin/categories');
    expect(domaines?.libelle).toBe('Domaines');
    expect(toutes.map((e) => e.libelle)).not.toContain('Catégories');
  });

  it('le paramétrage est scindé par métier, sous un sous-groupe commun', () => {
    // « Identité et réglages » disait bien ce qu'était l'écran : deux métiers
    // dans une entrée. Scindé le 11 septembre 2026 — deux entrées, deux
    // permissions, un sous-groupe « Établissement » qui les rassemble.
    const identite = toutes.find((e) => e.href === '/admin/etablissement');
    const regles = toutes.find((e) => e.href === '/admin/regles-de-pret');
    expect(identite?.libelle).toBe('Identité');
    expect(regles?.libelle).toBe('Règles de prêt');
    expect(identite?.groupe).toBe('Établissement');
    expect(regles?.groupe).toBe('Établissement');
    // L'ancienne entrée n'est plus proposée : elle redirige, elle ne se navigue plus.
    expect(toutes.map((e) => e.href)).not.toContain('/admin/parametres');
  });
});

describe('aucune entrée inerte', () => {
  it('chaque href pointe vers un écran qui existe réellement sur le disque', () => {
    // Mécanise « on ne pose pas d'entrée inerte » : une entrée dont l'écran
    // n'a pas encore été écrit fait tomber ce test, au lieu de promettre à la
    // bibliothécaire un écran qui n'arrivera jamais.
    // Témoin positif : la vérification DOIT savoir reconnaître un écran qui
    // existe, sans quoi « aucun manquant » ne prouverait rien — ce serait juste
    // un chemin qui ne pointe nulle part.
    expect(existsSync(ecran('/admin/catalogue'))).toBe(true);
    expect(existsSync(ecran('/admin/ecran-qui-n-existe-pas'))).toBe(false);

    const manquants = toutes.filter((e) => !existsSync(ecran(e.href)));
    expect(manquants.map((e) => `${e.libelle} → ${e.href}`)).toEqual([]);
  });

  it('ce qui est écarté de la maquette est nommé, pas oublié', () => {
    // Un lot qui réduit la cible sans le dire se lit comme un lot qui l'a
    // couverte. Chaque écart porte sa raison.
    expect(ENTREES_ECARTEES.length).toBeGreaterThan(0);
    for (const e of ENTREES_ECARTEES) expect(e.raison.length).toBeGreaterThan(10);
  });
});

describe('filtrage par fonction', () => {
  // Fonctions RÉELLES des rôles système (apps/api/src/auth/functions.ts,
  // découpage livré le 8 septembre 2026). Les recopier plutôt que d'en
  // inventer : un jeu imaginaire testerait une application qui n'existe pas.
  const BIBLIOTHECAIRE = [
    'document.lire',
    'catalogue.gerer',
    'outils.catalogue',
    'circulation.faire',
    'adherents.gerer',
  ];
  const GESTIONNAIRE = [
    'document.lire',
    'outils.lecteurs',
    'lecteurs.voir',
    'comptes.activer',
    'lecteurs.gerer',
  ];

  it('un compte sans une permission ne voit pas l’entrée correspondante', () => {
    // Recette n° 3.
    const vus = ongletsVisibles(BIBLIOTHECAIRE).flatMap((o) => o.entrees.map((e) => e.href));
    expect(vus).toContain('/admin/catalogue');
    expect(vus).not.toContain('/admin/comptes'); // lecteurs.voir absent
    expect(vus).not.toContain('/admin/roles'); // securite.roles absent
  });

  it('un onglet dont aucune entrée n’est permise disparaît — ni grisé, ni vide', () => {
    // Recette n° 4.
    const ids = ongletsVisibles(GESTIONNAIRE).map((o) => o.id);
    expect(ids).toContain('lecteurs');
    expect(ids).toContain('outils');
    expect(ids).not.toContain('guichet'); // circulation.faire absent
    expect(ids).not.toContain('administration');
    for (const o of ongletsVisibles(GESTIONNAIRE)) expect(o.entrees.length).toBeGreaterThan(0);
  });

  it('sans aucune fonction, la navigation est vide (fail-closed)', () => {
    expect(ongletsVisibles([])).toEqual([]);
    expect(premiereEntreeAccessible([])).toBeNull();
  });

  it('le bibliothécaire a une destination : il avait l’accès mais pas le lien', () => {
    // L'ancien header ne montrait « Administration » qu'à MANAGER/ADMIN alors
    // que la coque admettait aussi LIBRARIAN — accès sans lien.
    expect(premiereEntreeAccessible(BIBLIOTHECAIRE)).toBe('/admin/catalogue');
  });
});

describe('onglet courant', () => {
  it('reconnaît l’onglet d’une route, y compris une sous-route', () => {
    expect(ongletDe('/admin/catalogue')?.id).toBe('catalogue');
    expect(ongletDe('/admin/catalogue/abc123')?.id).toBe('catalogue');
    expect(ongletDe('/guichet')?.id).toBe('guichet');
    expect(ongletDe('/admin/journal')?.id).toBe('administration');
    expect(ongletDe('/opac')).toBeUndefined();
  });

  it('la route la plus précise gagne', () => {
    // /admin/outils/import-notices est sous Outils, pas sous Catalogue.
    expect(ongletDe('/admin/outils/import-notices')?.id).toBe('outils');
  });
});

describe('table des permissions cibles', () => {
  it('couvre toutes les entrées, sans entrée morte', () => {
    expect(Object.keys(PERMISSIONS_CIBLES).sort()).toEqual(
      toutes.map((e) => e.href).sort(),
    );
  });

  it('déclare les permissions RÉELLEMENT exigées aujourd’hui', () => {
    // La table doit être le miroir exact de la navigation. Sans cet invariant,
    // on relirait une table qui décrit une application disparue — c'est
    // exactement ce qui s'est produit quand l'API a renommé ses fonctions et
    // que ce test est tombé.
    for (const e of toutes) {
      expect(PERMISSIONS_CIBLES[e.href].actuelle, e.href).toEqual(e.fonctions);
    }
  });

  it('n’exige plus aucune fonction que l’API ne connaît pas', () => {
    // Les six noms supprimés par le découpage. Les laisser dans la nav ferait
    // disparaître leurs entrées pour TOUT LE MONDE, administrateur compris,
    // puisque le filtre est un `includes` — et en silence.
    const disparues = [
      'comptes.voir',
      'classes.gerer',
      'circulation.gerer',
      'etudiants.importer',
      'roles.gerer',
      'etablissement.gerer',
    ];
    const exigees = new Set(toutes.flatMap((e) => e.fonctions));
    for (const morte of disparues) {
      expect([...exigees], `${morte} n'existe plus côté API`).not.toContain(morte);
    }
  });
});

describe('nature des changements de permission', () => {
  it('un élargissement nomme toujours qui gagne l’accès', () => {
    // C'est la distinction qui compte pour le lot qui appliquera la table :
    // renommer ne demande l'accord de personne, ouvrir un écran à de nouvelles
    // personnes si. Un élargissement anonyme serait appliqué sans être vu.
    for (const [href, c] of elargissements()) {
      expect(c.gagnants, `${href} élargit sans dire à qui`).toBeDefined();
      expect(c.gagnants!.length, href).toBeGreaterThan(0);
    }
  });

  it('seuls les élargissements portent des gagnants', () => {
    for (const [href, c] of Object.entries(PERMISSIONS_CIBLES)) {
      if (c.nature !== 'elargissement') {
        expect(c.gagnants, `${href} n'élargit pas mais nomme des gagnants`).toBeUndefined();
      }
    }
  });

  it('les rappels relèvent de circulation.retards, pas de circulation.faire', () => {
    // Koha isole overdues_report du reste de la circulation : voir qui est en
    // retard ne va pas de soi pour qui tient le guichet. Un circulation.faire
    // fourre-tout referait en plus petit la faute d'etablissement.gerer.
    const rappels = PERMISSIONS_CIBLES['/admin/rappels'];
    expect(rappels.cible).toBe('circulation.retards');
    // Le renommage est LIVRÉ : circulation.retards existe côté API, distinct
    // de circulation.faire. Ce qui reste ouvert n'est plus un nom mais une
    // composition de rôle — le Bibliothécaire ne porte pas circulation.retards,
    // alors que la maquette la lui destine. D'où « élargissement » et non
    // « inchangée », sur une ligne où actuelle et cible sont pourtant égales.
    expect(rappels.nature).toBe('elargissement');
    // Les maquettes ne sont pas versionnées (.gitignore : documents de travail
    // internes) : c'est cette table qui porte durablement la décision.
    expect(PERMISSIONS_CIBLES['/guichet'].cible).toBe('circulation.faire');
  });

  it('⚠ PLUS AUCUN écran ne réclame deux permissions', () => {
    // Le besoin de deux droits pour un écran était le SYMPTÔME d'un écran qui
    // mélange deux métiers, jamais une fatalité. /admin/parametres était le
    // dernier ; il est scindé. Ce test devient un garde-fou : le jour où une
    // entrée en réclame deux, elle est à couper, pas à documenter.
    const multiples = Object.entries(PERMISSIONS_CIBLES).filter(([, c]) => Array.isArray(c.cible));
    expect(multiples.map(([href]) => href)).toEqual([]);
  });
});
