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
import { toutesLesFonctions } from './aide-roles-systeme';

// ⚠ LU DANS L'API, PLUS RECOPIÉ. Cette liste était écrite à la main, et elle
// avait vieilli : `depot.valider` n'y figurait pas. Le jour où cette fonction
// a commandé une entrée de menu — la refonte du 15 septembre 2026 —, le test
// a compté une entrée de moins que le menu n'en porte, et il a accusé le
// produit. Une copie de vocabulaire ne se périme pas bruyamment : elle dévie.
const ADMIN = toutesLesFonctions();
const hrefs = (modules: string[] | null) =>
  ongletsVisibles(ADMIN, modules).flatMap((o) => o.entrees.map((e) => e.href));

/** Tous les modules déclarés par les entrées, plus les non-noyau du registre. */
// ⚠ LU DANS LE REGISTRE DE L'API, plus recopié. La liste en dur a fait échouer
// trois tests le 14 septembre 2026 en décrivant un monde sans `depot` — et elle
// l'aurait refait avec `moissonnage`. Un module ajouté côté API arrive ici sans
// qu'on y touche.
const TOUS = modulesActivables();

describe('quelles entrées dépendent d’un module', () => {
  it('témoin : exactement huit, et on sait lesquelles', () => {
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
      /*
       * ⚠ `/admin/regles-de-circulation` A QUITTÉ CETTE LISTE le 26 septembre
       * 2026, et c'est le geste que le témoin d'en dessous avait annoncé :
       * « le jour où l'API découple, cette entrée change de module — et ce
       * témoin le rappellera ». Il l'a rappelé, en refusant.
       *
       * Ses quatre routes ne portent plus `@ModuleRequis('amendes')` : trois
       * des quatre champs — durée du prêt, plafond de prêts, plafond de
       * renouvellements — n'ont rien à voir avec les amendes, et le service de
       * circulation les lit DIRECTEMENT. Une école qui éteignait le module
       * voyait donc ses durées APPLIQUÉES et leur réglage inatteignable.
       */
      // ⚠ Sixième depuis P8-1 : l'entrée portait `modulePrevu` — un champ
      // d'ATTENTE, qui a survécu toute une phase à la condition qui le
      // justifiait. Le module existe, ses routes sont gardées.
      '/admin/statistiques',
      // ⚠ Huitième depuis la refonte de navigation du 15 septembre 2026 :
      // `/depots-a-valider` a quitté l'EN-TÊTE pour la barre métier. Elle
      // portait déjà son module dans `ROUTES_HORS_MENU` ; elle le porte
      // désormais comme entrée, à un seul endroit.
      '/depots-a-valider',
    ]);
  });

  it('⚠ le circuit de DÉPÔT garde UN écran hors du menu, et il compte aussi', () => {
    // `/mon-depot` appartient à l'étudiant et vit dans le MENU DE COMPTE : il
    // n'est donc dans aucun onglet. Sans `ROUTES_HORS_MENU`, éteindre le module
    // le laissait parfaitement accessible — `moduleDeLaRoute` ne parcourt que
    // le menu métier, donc elle rendait `undefined`, c'est-à-dire « aucun
    // module requis ».
    expect(ROUTES_HORS_MENU).toEqual({ '/mon-depot': 'depot' });
    expect(moduleDeLaRoute('/mon-depot')).toBe('depot');
  });

  it('⚠ `/depots-a-valider` est gardée par le MENU, plus par la table', () => {
    // Le 15 septembre 2026 elle est devenue une entrée de la barre métier. La
    // garantie ne doit pas s'être perdue en chemin : c'est la même propriété,
    // par un autre porteur. Une propriété qui change de porteur est exactement
    // le moment où elle disparaît sans bruit.
    expect(ROUTES_HORS_MENU['/depots-a-valider']).toBeUndefined();
    expect(moduleDeLaRoute('/depots-a-valider')).toBe('depot');
  });

  it('⚠ `/mes-encadrements` n’en fait PAS partie — et c’est voulu', () => {
    // Il liste les thèses déjà CATALOGUÉES qu'on a dirigées, en lisant le
    // catalogue. Éteindre le dépôt ferme le circuit ; il n'efface pas ce qui en
    // est sorti. Sans ce témoin, quelqu'un l'y ajouterait « par symétrie ».
    expect(moduleDeLaRoute('/mes-encadrements')).toBeUndefined();
  });

  it('⚠ `amendes` n’a AUCUNE entrée — ses effets sont des blocs dans le noyau', () => {
    // ⚠ CE TÉMOIN A DIT TROIS CHOSES SUCCESSIVES, et les trois étaient vraies
    // à leur date. Il vaut d'être lu en entier, parce qu'il est le seul de ce
    // dépôt à avoir annoncé son propre retournement :
    //
    //   · avant le 22/09 — « amendes n'a PAS d'entrée, ses blocs vivent dans
    //     des écrans du noyau » ;
    //   · le 22/09 — « UNE entrée : `/admin/regles-de-circulation`, premier
    //     écran ENTIER que ce module gouverne » ;
    //   · le 26/09 — de nouveau AUCUNE, parce que l'API a découplé.
    //
    // ⚠ ET LA VERSION DU 22 ÉCRIVAIT LE GESTE À VENIR : « le couplage est
    // DISCUTABLE […] une règle porte aussi la durée du prêt et le plafond
    // d'emprunts, qui n'ont rien à voir avec les amendes. Une école qui éteint
    // les amendes perd le réglage de ses durées de prêt. Le jour où l'API
    // découple, cette entrée change de module — et ce témoin le rappellera. »
    // Il l'a rappelé en refusant le lot d'aujourd'hui.
    //
    // Le guichet et la fiche d'adhérent restent dans le noyau : éteindre
    // `amendes` y retire des BLOCS, pas une entrée. C'est ce que ce témoin
    // disait au départ, et il le redit.
    const parModule = NAVIGATION_PERSONNEL.flatMap((o) => o.entrees).filter(
      (e) => e.module === 'amendes',
    );
    expect(parModule.map((e) => e.href)).toEqual([]);
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

  it('tout éteint : les SIX du dépôt et des modules disparaissent, le noyau reste entier', () => {
    const restant = hrefs([]);
    for (const href of [
      '/admin/rappels',
      '/admin/interoperabilite',
      '/admin/depots-soumis',
      '/admin/depots-a-cataloguer',
      // ⚠ Depuis le 15 septembre 2026, la file du directeur est une entrée de
      // la barre : elle doit disparaître comme les deux autres du circuit.
      '/depots-a-valider',
    ]) {
      expect(restant).not.toContain(href);
    }

    // ⚠ ET L'AFFIRMATION INVERSE, sur l'écran qui a quitté cette liste le
    // 26 septembre 2026 : `/admin/regles-de-circulation` DOIT RESTER, tous
    // modules éteints. Sans cette ligne, le retrait ne serait gardé par rien —
    // une entrée retirée d'une liste d'attendus ne laisse aucune trace, et
    // c'est exactement la forme « qu'est-ce qui reste écrit sans plus être
    // vrai ? » prise à l'envers : ici il ne reste RIEN d'écrit.
    //
    // Le motif tient en une phrase : le service de circulation lit les durées
    // et les plafonds DIRECTEMENT, donc ils s'appliquent même module éteint.
    // Un paramètre qui agit doit rester réglable.
    expect(restant).toContain('/admin/regles-de-circulation');
    expect(restant).not.toContain('/admin/moissonnage');
    // ⚠ Témoin de COMPTE, et il compare les ÉLÉMENTS, pas seulement le total.
    // Un compte exact sur deux listes ne prouve rien tant qu'on n'a pas comparé
    // leur contenu : neuf d'un côté, neuf de l'autre peut concorder pendant
    // qu'une entrée est entrée et une autre sortie (mesuré le 16 septembre sur
    // CHEMINS_DU_RENDU_SERVEUR).
    const toutes = NAVIGATION_PERSONNEL.flatMap((o) => o.entrees);
    const gouvernees = toutes.filter((e) => e.module).map((e) => e.href);
    expect(restant.sort()).toEqual(
      toutes
        .map((e) => e.href)
        .filter((h) => !gouvernees.includes(h))
        .sort(),
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
