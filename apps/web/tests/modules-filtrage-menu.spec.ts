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
import { moduleDeLaRoute, ROUTES_HORS_MENU, NAVIGATION_PERSONNEL, ongletsVisibles } from '@/lib/navigation';
import { modulesActivables } from './aide-modules';

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
// ⚠ LU DANS LE REGISTRE DE L'API, plus recopié. La liste en dur a fait échouer
// trois tests le 14 septembre 2026 en décrivant un monde sans `depot` — et elle
// l'aurait refait avec `moissonnage`. Un module ajouté côté API arrive ici sans
// qu'on y touche.
const TOUS = modulesActivables();

describe('quelles entrées dépendent d’un module', () => {
  it('témoin : exactement sept, et on sait lesquelles', () => {
    // ⚠ Un COMPTE, pas une présence. C'est lui qui signale l'entrée ajoutée
    // demain sans son module — celle à laquelle personne n'aura pensé. Il a
    // servi le 14 septembre 2026 : il en attendait deux, le circuit de dépôt en
    // a apporté deux de plus, et il a convoqué quelqu'un pour le constater.
    const avecModule = NAVIGATION_PERSONNEL.flatMap((o) => o.entrees).filter((e) => e.module);
    expect(avecModule.map((e) => e.href).sort()).toEqual([
      '/admin/depots-a-cataloguer',
      '/admin/depots-soumis',
      '/admin/interoperabilite',
      '/admin/moissonnage',
      '/admin/rappels',
      '/admin/rapport-annuel',
      // ⚠ Sixième depuis P8-1 : l'entrée portait `modulePrevu` — un champ
      // d'ATTENTE, qui a survécu toute une phase à la condition qui le
      // justifiait. Le module existe, ses routes sont gardées.
      '/admin/statistiques',
    ]);
  });

  it('⚠ le circuit de DÉPÔT a deux écrans HORS du menu, et ils comptent aussi', () => {
    // `/mon-depot` appartient à l'étudiant, `/depots-a-valider` au directeur :
    // tous deux atteints depuis l'en-tête. Sans `ROUTES_HORS_MENU`, éteindre le
    // module les laissait parfaitement accessibles — `moduleDeLaRoute` ne
    // parcourait que le menu, donc elle rendait `undefined`, c'est-à-dire
    // « aucun module requis ».
    expect(ROUTES_HORS_MENU).toEqual({ '/mon-depot': 'depot', '/depots-a-valider': 'depot' });
    expect(moduleDeLaRoute('/mon-depot')).toBe('depot');
    expect(moduleDeLaRoute('/depots-a-valider')).toBe('depot');
  });

  it('⚠ `/mes-encadrements` n’en fait PAS partie — et c’est voulu', () => {
    // Il liste les thèses déjà CATALOGUÉES qu'on a dirigées, en lisant le
    // catalogue. Éteindre le dépôt ferme le circuit ; il n'efface pas ce qui en
    // est sorti. Sans ce témoin, quelqu'un l'y ajouterait « par symétrie ».
    expect(moduleDeLaRoute('/mes-encadrements')).toBeUndefined();
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

  it('dépôt éteint : ses DEUX entrées d’administration disparaissent', () => {
    const actifs = TOUS.filter((m) => m !== 'depot');
    expect(hrefs(actifs)).not.toContain('/admin/depots-soumis');
    expect(hrefs(actifs)).not.toContain('/admin/depots-a-cataloguer');
    // Le reste du catalogue ne bouge pas : le dépôt en dépend, l'inverse est faux.
    expect(hrefs(actifs)).toContain('/admin/catalogue');
  });

  it('tout éteint : les quatre disparaissent, le noyau reste entier', () => {
    const restant = hrefs([]);
    for (const href of [
      '/admin/rappels',
      '/admin/interoperabilite',
      '/admin/depots-soumis',
      '/admin/depots-a-cataloguer',
    ]) {
      expect(restant).not.toContain(href);
    }
    expect(restant).not.toContain('/admin/moissonnage');
    // Témoin de COMPTE : le noyau n'a pas bougé.
    expect(restant.length).toBe(
      NAVIGATION_PERSONNEL.flatMap((o) => o.entrees).length - 7,
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
