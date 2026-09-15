/**
 * Le niveau de test qui manquait — écrit APRÈS la recette de P4-2, contre les
 * deux défauts qu'elle a trouvés pendant que onze tests unitaires passaient.
 *
 * ⚠ CE FICHIER COMMENCE PAR SES CONTRÔLES NÉGATIFS, pas par ses tests. Les deux
 * défauts sont corrigés depuis `ba1030f` : un test écrit sur du code déjà réparé
 * ne prouve rien tant qu'on n'a pas remis le défaut et vu tomber l'assertion.
 * Les deux mutations et leur résultat sont consignés en bas de ce fichier.
 *
 * Ce que ce niveau n'est pas : un test de bout en bout. Ni navigateur, ni
 * serveur, ni dépendance nouvelle.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { LIBELLES } from '@/lib/libelles';
import { fermerSession } from './aide-session';
import { ECRANS, fichierDEcranExiste, monterEcran, MODULES_ACTIVABLES } from './aide-ecran';

// ⚠ L'unique ligne de plomberie : la fabrique est hissée, elle ne peut pas lire
// une variable du test, donc c'est `aide-ecran` qui porte l'adresse courante.
// ⚠ La fabrique importe `aide-navigation`, qui n'importe RIEN de l'application.
// La faire passer par `aide-ecran` — qui importe les écrans, qui importent
// `next/navigation` — referme un cycle sur la doublure elle-même : la suite pend
// deux minutes sans collecter un seul test.
vi.mock('next/navigation', async () => (await import('./aide-navigation')).navigationDeTest());

const ADMIN = [
  'document.lire', 'catalogue.gerer', 'outils.catalogue', 'circulation.faire',
  'circulation.retards', 'adherents.gerer', 'lecteurs.voir', 'lecteurs.gerer',
  'outils.lecteurs', 'comptes.activer', 'comptes.gerer', 'collections.gerer',
  'statistiques.voir', 'etablissement.apparence', 'etablissement.regles',
  'diffusion.gerer', 'securite.roles', 'securite.audit', 'modules.gerer',
];
// ⚠ LU DANS LE REGISTRE, plus recopié : un module ajouté côté API arrive ici
// sans qu'on y touche. La liste en dur a fait échouer trois tests le
// 14 septembre 2026 en décrivant un monde où `depot` n'existe pas.
const TOUS = MODULES_ACTIVABLES as unknown as string[];

/** Ce que la fiche d'adhérent et le guichet demandent, pour monter sans lever. */
const REPONSES_ADHERENT = {
  '/patrons/p1/loans': { current: [], history: { entries: [], total: 0, page: 1, pageSize: 10 } },
  '/circulation/patrons/p1': {
    patron: { id: 'p1', barcode: 'P-2026-0001', category: 'etudiant', expiryDate: null, user: null },
    checkouts: [], holds: [], fines: { recordedXof: 0, accruingXof: 0, totalXof: 0 },
  },
  '/patrons/p1': {
    id: 'p1', firstName: 'Awa', lastName: 'Traoré', barcode: 'P-2026-0001',
    category: 'etudiant', userId: null, registrationDate: '2026-09-01T00:00:00.000Z',
    expiryDate: null, user: null,
  },
};

afterEach(() => {
  fermerSession();
  vi.unstubAllGlobals();
});

describe('La table des adresses ne ment pas sur le disque', () => {
  /**
   * ⚠ TÉMOIN QUI COMPTE, pas qui constate. « Au moins un fichier existe »
   * confirmerait que la lecture fonctionne ; compter les quatre est le seul
   * énoncé qui tombe le jour où l'un d'eux déménage — et c'est ce jour-là que la
   * table se mettrait à servir le mauvais écran en silence.
   */
  it('tous les écrans déclarés existent et exportent un défaut', () => {
    const chemins = Object.values(ECRANS).map((e) => e.fichier);
    // ⚠ Le témoin COMPTE, il ne constate pas. Le chiffre change quand la table
    // change, et c'est voulu : on le met à jour en sachant ce qu'on ajoute.
    // ⚠ 27 depuis le 15 septembre 2026 : /admin/rapport-annuel (P8-3).
    expect(chemins).toHaveLength(27);
    expect(chemins.filter(fichierDEcranExiste)).toHaveLength(27);
    // Aucun chemin en double : deux adresses qui pointent le même fichier
    // passeraient pour deux écrans couverts.
    expect(new Set(chemins).size).toBe(chemins.length);
  });

  it('et la lecture sait dire non', () => {
    expect(fichierDEcranExiste('app/admin/ecran-qui-n-existe-pas/page.tsx')).toBe(false);
  });
});

describe('Défaut n° 1 de P4-2 — la coque doit suivre la bascule', () => {
  /**
   * L'écran et la coque sont deux composants, chacun avec sa copie de l'état des
   * modules. Éteindre un module rechargeait la liste de l'écran mais PAS le
   * menu : l'entrée restait affichée jusqu'au prochain rechargement complet.
   *
   * ⚠ L'administrateur en conclut que son geste a échoué — et recommence. C'est
   * le seul défaut de la semaine qui pousse quelqu'un à refaire une action qui a
   * réussi.
   */
  it('éteindre Interopérabilité retire son entrée du menu, sans rechargement', async () => {
    monterEcran('/admin/modules', { fonctions: ADMIN, modules: [...TOUS] });

    // L'entrée est là AVANT le geste — sans ce constat, sa disparition ne
    // prouverait rien : elle pourrait n'avoir jamais été rendue.
    const entree = await screen.findByRole('link', { name: 'Interopérabilité' });
    expect(entree.getAttribute('href')).toBe('/admin/interoperabilite');

    fireEvent.click(await screen.findByRole('button', { name: 'Désactiver Interopérabilité' }));
    fireEvent.click(await screen.findByRole('button', { name: LIBELLES.modules.confirmer }));

    // ⚠ `queryBy*`, pas `findBy*` : pour affirmer une ABSENCE il faut un matcher
    // qui rend `null` tout de suite. `findBy*` attendrait ce qui ne viendra
    // jamais et dirait « j'ai renoncé » là où l'on veut « c'est absent ».
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'Interopérabilité' })).toBeNull(),
    );
  });

  /**
   * ⚠ L'AUTRE SENS, et il ne se teste pas avec n'importe quel module. « Rappels
   * envoyés » vit sous l'onglet Guichet : depuis `/admin/modules` la coque rend
   * la barre latérale d'Administration, donc cette entrée n'est rendue ni avant
   * ni après — un test écrit dessus échouerait sans rien dire de la bascule.
   * Interopérabilité est sous le même onglet que l'écran des modules, c'est
   * donc lui qui exerce l'apparition.
   */
  it('rallumer Interopérabilité fait réapparaître son entrée', async () => {
    monterEcran('/admin/modules', { fonctions: ADMIN, modules: ['amendes', 'rappels'] });
    await screen.findByRole('button', { name: 'Activer Interopérabilité' });
    expect(screen.queryByRole('link', { name: 'Interopérabilité' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Activer Interopérabilité' }));
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Interopérabilité' })).toBeTruthy(),
    );
  });
});

describe('Défaut n° 2 de P4-2 — l’adresse d’un module éteint est refusée', () => {
  /**
   * Aucun test unitaire ne tape une adresse : il monte le composant qu'on lui
   * DÉSIGNE, donc il ne passe jamais par la route. Ici le test nomme une
   * adresse, et c'est le harnais qui résout l'écran.
   */
  it('module éteint : l’écran ne s’affiche pas, le refus dit qu’on n’a rien supprimé', async () => {
    monterEcran('/admin/interoperabilite', {
      fonctions: ADMIN,
      modules: ['amendes', 'rappels'],
    });
    expect(await screen.findByText(LIBELLES.modules.ecranModuleInactif)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /Interopérabilité/ })).toBeNull();
    /**
     * ⚠ ET CE N'EST PAS UNE ALERTE. Un module désactivé est un état que le
     * produit permet de créer exprès : un administrateur l'a éteint. Le peindre
     * en rouge et l'annoncer comme une alerte qualifierait d'anomalie un réglage
     * volontaire — et apprendrait à lire les rouges comme du décor.
     */
    expect(screen.queryByRole('alert')).toBeNull();
  });

  /**
   * ⚠ CE QUE LE TEXTE DOIT DIRE, séparément de l'écran qui l'affiche. Un
   * contrôle négatif l'a exigé : remplacer ce libellé par « Accès refusé. » ne
   * faisait tomber aucun test, tous comparant à la CONSTANTE. Ils suivaient
   * donc sa dégradation sans broncher.
   *
   * Sa raison d'être tient en deux points, et son propre commentaire les dit :
   * rassurer — rien n'est perdu — et indiquer le chemin du retour. Sans eux,
   * quelqu'un qui retrouve un vieux signet croit la fonction supprimée.
   */
  it('le refus DIT que rien n’est perdu, et par où revenir', () => {
    const texte = LIBELLES.modules.ecranModuleInactif;
    expect(texte).toMatch(/aucune donnée n’a été supprimée/i);
    expect(texte).toMatch(/réactivez/i);
    expect(texte).toMatch(/Modules/);
  });

  it('module allumé : le même écran s’affiche', async () => {
    monterEcran('/admin/interoperabilite', {
      fonctions: ADMIN,
      modules: [...TOUS],
      reponses: { '/oai/sources': [], '/interoperabilite': {} },
    });
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('état des modules INCONNU : on ne refuse pas sur ce qu’on ignore', async () => {
    monterEcran('/admin/interoperabilite', {
      fonctions: ADMIN,
      modules: null,
      reponses: { '/oai/sources': [], '/interoperabilite': {} },
    });
    await screen.findByRole('link', { name: 'Interopérabilité' });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('Les trois écrans à risque montent dans leur coque', () => {
  it('/guichet', async () => {
    monterEcran('/guichet', { fonctions: ADMIN, modules: [...TOUS] });
    expect(await screen.findByRole('tab', { name: 'Adhérent' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Guichet' })).toBeTruthy();
  });

  it('/admin/adherents/p1', async () => {
    monterEcran('/admin/adherents/p1', {
      fonctions: ADMIN, modules: [...TOUS], reponses: REPONSES_ADHERENT,
    });
    expect(await screen.findByText(/P-2026-0001/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Adhérents' })).toBeTruthy();
  });
});

/**
 * ── CONTRÔLES NÉGATIFS EXÉCUTÉS ────────────────────────────────────────────
 *
 * Les deux défauts de P4-2 ont été RÉINTRODUITS dans le code de production, la
 * compilation vérifiée à chaque fois, et la suite relancée :
 *
 *   1. `invaliderModulesActifs()` commenté dans `app/admin/modules/page.tsx`
 *      → compile ; font tomber « éteindre Interopérabilité retire son entrée »
 *        et « rallumer Interopérabilité fait réapparaître son entrée ». Elles
 *        seules — c'est la même propriété dans ses deux sens.
 *
 *   2. `const moduleRequis: string | null = null` dans `admin-shell.tsx`
 *      → compile ; fait tomber « module éteint : l'écran ne s'affiche pas ».
 *        Elle seule : « module allumé » et « état inconnu » restent vertes, ce
 *        qui est exactement ce qu'on veut — la mutation retire le refus, elle
 *        n'en ajoute pas.
 *
 * ⚠ Première forme de la mutation n° 2 : `if (false && …)`. Elle NE COMPILAIT
 * PAS. La suite tombait quand même, et la lecture spontanée « le test attrape »
 * était fausse — c'est le compilateur qu'on éprouvait. Une mutation doit faire
 * tomber l'assertion visée, et elle seule, dans un code qui compile encore.
 *
 * Si l'une de ces mutations cessait de faire tomber quelque chose, ce fichier ne
 * vaudrait plus rien — et il faudrait le dire plutôt que le garder.
 */
