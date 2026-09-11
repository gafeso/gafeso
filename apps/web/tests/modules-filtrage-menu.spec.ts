/**
 * Le menu se filtre sur l'état RÉEL des modules — P4-3, moitié front.
 *
 * ⚠ LA RÈGLE NORMATIVE DU BRIEF EXIGE LES DEUX EFFETS ENSEMBLE : l'interface
 * n'affiche plus rien qui mène à un module éteint, ET l'API refuse ses routes
 * en le nommant. Ce filtrage sert le premier. Il ne remplace pas le second :
 * cacher sans refuser laisse une porte ouverte, refuser sans cacher laisse une
 * interface qui ment.
 *
 * ⚠ ET `null` LAISSE PASSER. Tant que l'état n'est pas connu, masquer ferait
 * disparaître des écrans auxquels la personne a droit, sur la foi d'une
 * information qu'on n'a pas encore — le même défaut que « Aucun auteur »
 * affiché avant la réponse, appliqué à la navigation.
 */

import { describe, expect, it } from 'vitest';
import { NAVIGATION_PERSONNEL, moduleDeLaRoute, ongletsVisibles } from '@/lib/navigation';

const ADMIN = [
  'document.lire', 'catalogue.gerer', 'outils.catalogue', 'circulation.faire',
  'circulation.retards', 'adherents.gerer', 'lecteurs.voir', 'lecteurs.gerer',
  'outils.lecteurs', 'comptes.activer', 'comptes.gerer', 'collections.gerer',
  'statistiques.voir', 'etablissement.apparence', 'etablissement.regles',
  'diffusion.gerer', 'securite.roles', 'securite.audit', 'modules.gerer',
];
const hrefs = (modules: string[] | null) =>
  ongletsVisibles(ADMIN, modules).flatMap((o) => o.entrees.map((e) => e.href));

/** Tous les modules déclarés par les entrées, plus les non-noyau du registre. */
const TOUS = ['amendes', 'interoperabilite', 'rappels'];

describe('quelles entrées dépendent d’un module', () => {
  it('témoin : exactement deux, et on sait lesquelles', () => {
    // ⚠ Un COMPTE, pas une présence. C'est lui qui signale l'entrée ajoutée
    // demain sans son module — celle à laquelle personne n'aura pensé.
    const avecModule = NAVIGATION_PERSONNEL.flatMap((o) => o.entrees).filter((e) => e.module);
    expect(avecModule.map((e) => e.href).sort()).toEqual([
      '/admin/interoperabilite',
      '/admin/rappels',
    ]);
  });

  it('⚠ `amendes` n’a PAS d’entrée : ses blocs vivent dans des écrans du noyau', () => {
    // Le guichet et la fiche d'adhérent appartiennent au noyau. Éteindre
    // `amendes` n'y retire pas une entrée mais des BLOCS — c'est P4-4, et le
    // dire ici évite qu'on croie ce lot complet.
    const avecModule = NAVIGATION_PERSONNEL.flatMap((o) => o.entrees).map((e) => e.module);
    expect(avecModule).not.toContain('amendes');
  });
});

describe('⚠ un module éteint retire son entrée', () => {
  it('interopérabilité éteinte : l’entrée disparaît, les autres restent', () => {
    const actifs = TOUS.filter((m) => m !== 'interoperabilite');
    expect(hrefs(actifs)).not.toContain('/admin/interoperabilite');
    expect(hrefs(actifs)).toContain('/admin/rappels');
    expect(hrefs(actifs)).toContain('/admin/catalogue');
  });

  it('rappels éteints : idem, et symétrique', () => {
    const actifs = TOUS.filter((m) => m !== 'rappels');
    expect(hrefs(actifs)).not.toContain('/admin/rappels');
    expect(hrefs(actifs)).toContain('/admin/interoperabilite');
  });

  it('les deux éteints : les deux disparaissent, le noyau reste entier', () => {
    const restant = hrefs([]);
    expect(restant).not.toContain('/admin/rappels');
    expect(restant).not.toContain('/admin/interoperabilite');
    // Témoin : le noyau n'a pas bougé — 18 entrées sur 20.
    expect(restant.length).toBe(
      NAVIGATION_PERSONNEL.flatMap((o) => o.entrees).length - 2,
    );
  });
});

describe('⚠ ce qu’on ne sait pas encore ne masque rien', () => {
  it('`null` laisse passer toutes les entrées', () => {
    expect(hrefs(null)).toContain('/admin/interoperabilite');
    expect(hrefs(null)).toContain('/admin/rappels');
  });

  it('tous actifs : rien n’est masqué non plus', () => {
    expect(hrefs(TOUS).length).toBe(NAVIGATION_PERSONNEL.flatMap((o) => o.entrees).length);
  });
});

describe('le module ne remplace pas la permission', () => {
  it('un module actif n’ouvre rien à qui n’a pas la fonction', () => {
    // Les deux filtres se composent : le droit ET le module. Un seul des deux
    // suffirait à laisser passer une entrée qui ne devrait pas s'afficher.
    const sansDiffusion = ADMIN.filter((f) => f !== 'diffusion.gerer');
    const vus = ongletsVisibles(sansDiffusion, TOUS).flatMap((o) => o.entrees.map((e) => e.href));
    expect(vus).not.toContain('/admin/interoperabilite');
  });
});

describe('⚠ l’adresse tapée directement est refusable', () => {
  // Retirer l'entrée ne suffit pas : la règle normative de P4 exige « ni entrée
  // de menu, ni bouton, ni écran atteignable par son adresse ». Mesuré en
  // recette le 11 septembre 2026 — module éteint, `/admin/interoperabilite`
  // s'affichait encore normalement et annonçait un entrepôt qui répond 403.
  it('une route de module est reconnue comme telle', () => {
    expect(moduleDeLaRoute('/admin/interoperabilite')).toBe('interoperabilite');
    expect(moduleDeLaRoute('/admin/rappels')).toBe('rappels');
  });

  it('une sous-route l’est aussi — on n’entre pas par la porte de service', () => {
    expect(moduleDeLaRoute('/admin/rappels/quelque-chose')).toBe('rappels');
  });

  it('une route du noyau n’exige aucun module', () => {
    expect(moduleDeLaRoute('/admin/catalogue')).toBeUndefined();
    expect(moduleDeLaRoute('/guichet')).toBeUndefined();
  });

  it('⚠ la route la plus PRÉCISE gagne', () => {
    // `/admin/rappels` et `/admin/r…` pourraient se recouvrir : c'est le même
    // piège que les clés ambiguës d'une doublure, et il se referme pareil.
    expect(moduleDeLaRoute('/admin/recolement')).toBeUndefined();
  });
});
