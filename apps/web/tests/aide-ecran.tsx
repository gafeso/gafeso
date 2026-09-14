/**
 * Monter un écran DANS SA COQUE, et y entrer PAR LA ROUTE.
 *
 * ⚠ POURQUOI CE NIVEAU EXISTE. La recette de P4-2 a trouvé deux défauts pendant
 * que onze tests unitaires passaient. Ils n'étaient pas mauvais : ils tenaient
 * l'écran ISOLÉ, et les deux défauts vivaient ailleurs.
 *
 *   1. Le menu ne se mettait pas à jour après une bascule — l'écran et la coque
 *      sont deux composants, chacun avec sa copie de l'état. Un test qui monte
 *      l'un ne voit jamais l'autre diverger.
 *   2. L'écran d'un module éteint restait atteignable par son adresse — aucun
 *      test ne tape une adresse : il monte le composant qu'on lui DÉSIGNE, donc
 *      il ne passe jamais par la route.
 *
 * Une recette d'écran voit ces défauts. Mais **elle ne s'exécute qu'une fois** :
 * rien ne rejouera P4-2 demain, et le menu peut rediverger au prochain lot sans
 * que personne le sache avant qu'un administrateur éteigne un module.
 *
 * D'où ce harnais, et ses deux règles de forme :
 *
 * ⚠ **LE TEST NOMME UNE ADRESSE, JAMAIS UN COMPOSANT.** C'est tout l'objet. Si
 * l'appelant choisissait le composant, il referait exactement le geste qui a
 * caché le second défaut. La table `ECRANS` fait la résolution, et un garde la
 * confronte au système de fichiers — un écran qui déménage casse le test au lieu
 * de le rendre muet.
 *
 * ⚠ **LA COQUE EST TOUJOURS MONTÉE.** Sans elle il n'y a ni menu à contredire,
 * ni refus d'adresse à exercer. Ce n'est pas un test de bout en bout : ni
 * navigateur, ni serveur, ni dépendance nouvelle — c'est le niveau qui manquait
 * juste au-dessus de l'unitaire.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '@testing-library/react';
import { vi } from 'vitest';
import { AdminShell } from '@/components/admin-shell';
import PageModules from '@/app/admin/modules/page';
import PageGuichet from '@/app/guichet/page';
import FicheAdherent from '@/app/admin/adherents/[id]/page';
import PageInteroperabilite from '@/app/admin/interoperabilite/page';
import PageStatistiques from '@/app/admin/statistiques/page';
import PageCatalogue from '@/app/admin/catalogue/page';
import PageAuteurs from '@/app/admin/auteurs/page';
import PageCategories from '@/app/admin/categories/page';
import PageClasses from '@/app/admin/classes/page';
import PageCollections from '@/app/admin/collections/page';
import PageComptes from '@/app/admin/comptes/page';
import PageEtablissement from '@/app/admin/etablissement/page';
import PageJournal from '@/app/admin/journal/page';
import PageRappels from '@/app/admin/rappels/page';
import PageRecolement from '@/app/admin/recolement/page';
import PageRoles from '@/app/admin/roles/page';
import PageReglesDePret from '@/app/admin/regles-de-pret/page';
import PageAccueilAdmin from '@/app/admin/accueil/page';
import PageAdherents from '@/app/admin/adherents/page';
import PageMonDepot from '@/app/mon-depot/page';
import PageMesEncadrements from '@/app/mes-encadrements/page';
import PageDepotsAValider from '@/app/depots-a-valider/page';
import PageDepotsACataloguer from '@/app/admin/depots-a-cataloguer/page';
import PageDepotsSoumis from '@/app/admin/depots-soumis/page';
import PageMoissonnage from '@/app/admin/moissonnage/page';
import PageMoissonnageDetail from '@/app/admin/moissonnage/[id]/page';
import { invaliderModulesActifs } from '@/lib/modules-actifs';
import { ouvrirSession } from './aide-session';
import { poserAdresse } from './aide-navigation';

/**
 * Adresse → écran, et le FICHIER qui doit la servir.
 *
 * `fichier` n'est pas une redite : c'est ce que le garde de
 * `ecran-dans-sa-coque.spec.tsx` confronte au disque. Sans lui, déplacer un
 * écran laisserait cette table pointer sur un import qui compile encore (l'ancien
 * chemin peut survivre) et le test continuerait de passer sur le mauvais écran.
 */
export const ECRANS = {
  '/admin/modules': { composant: PageModules, fichier: 'app/admin/modules/page.tsx' },
  '/guichet': { composant: PageGuichet, fichier: 'app/guichet/page.tsx' },
  '/admin/adherents/p1': {
    composant: FicheAdherent,
    fichier: 'app/admin/adherents/[id]/page.tsx',
    params: { id: 'p1' },
  },
  '/admin/interoperabilite': {
    composant: PageInteroperabilite,
    fichier: 'app/admin/interoperabilite/page.tsx',
  },
  '/admin/statistiques': {
    composant: PageStatistiques,
    fichier: 'app/admin/statistiques/page.tsx',
  },
  // ── Le reste de l'espace professionnel ────────────────────────────────────
  //
  // ⚠ AJOUTÉS EN BLOC, ET C'EST LE POINT. Les invariants de la coque — un repère
  // principal, un lien d'évitement en tête, des barres de navigation nommées, pas
  // un élément interactif sans nom — ne valent que sur les écrans qu'on leur
  // soumet. Les tenir sur cinq écrans, c'était tenir cinq écrans ; les tenir sur
  // la table entière, c'est tenir celui que quelqu'un ajoutera demain, à
  // condition qu'il l'y inscrive. Le garde de fichiers rend cette inscription
  // vérifiable : un écran déplacé casse le test au lieu de le rendre muet.
  '/admin/catalogue': { composant: PageCatalogue, fichier: 'app/admin/catalogue/page.tsx' },
  '/admin/auteurs': { composant: PageAuteurs, fichier: 'app/admin/auteurs/page.tsx' },
  '/admin/categories': { composant: PageCategories, fichier: 'app/admin/categories/page.tsx' },
  '/admin/classes': { composant: PageClasses, fichier: 'app/admin/classes/page.tsx' },
  '/admin/collections': { composant: PageCollections, fichier: 'app/admin/collections/page.tsx' },
  '/admin/comptes': { composant: PageComptes, fichier: 'app/admin/comptes/page.tsx' },
  '/admin/etablissement': { composant: PageEtablissement, fichier: 'app/admin/etablissement/page.tsx' },
  '/admin/journal': { composant: PageJournal, fichier: 'app/admin/journal/page.tsx' },
  '/admin/rappels': { composant: PageRappels, fichier: 'app/admin/rappels/page.tsx' },
  '/admin/recolement': { composant: PageRecolement, fichier: 'app/admin/recolement/page.tsx' },
  '/admin/roles': { composant: PageRoles, fichier: 'app/admin/roles/page.tsx' },
  '/admin/regles-de-pret': { composant: PageReglesDePret, fichier: 'app/admin/regles-de-pret/page.tsx' },
  // ⚠ `/admin/parametres` n'est PAS dans cette table : c'est une redirection,
  // pas un écran. Elle ne rend rien — lui demander un `<main>` ou un lien
  // d'évitement n'aurait aucun sens, et l'y inscrire aurait fait échouer la
  // suite sur une exigence qui ne la concerne pas.
  '/admin/accueil': { composant: PageAccueilAdmin, fichier: 'app/admin/accueil/page.tsx' },
  '/admin/adherents': { composant: PageAdherents, fichier: 'app/admin/adherents/page.tsx' },
  // ⚠ « Mon dépôt » n'est PAS un écran du personnel : il vit hors de la coque,
  // dans l'espace de l'étudiant. Il est dans cette table pour le garde de
  // fichiers et le compte, pas pour les invariants de coque — qui ne s'y
  // appliquent pas et ne lui sont pas soumis.
  '/mon-depot': {
    composant: PageMonDepot,
    fichier: 'app/mon-depot/page.tsx',
    // ⚠ HORS COQUE, et le dire ici évite deux erreurs. Cet écran est celui de
    // l'ÉTUDIANT : il porte lui-même son en-tête et son repère, comme
    // /mes-prets. Le monter dans la coque du personnel produirait deux `<main>`
    // et lui appliquerait des invariants qui ne le concernent pas — c'est
    // exactement ce qu'a fait le premier essai, et le test l'a dit.
    horsCoque: true,
  },
  // ⚠ Même nature que « Mon dépôt » : l'écran de l'ENSEIGNANT, hors de la coque
  // du personnel. Il porte son propre en-tête et son propre repère.
  '/mes-encadrements': {
    composant: PageMesEncadrements,
    fichier: 'app/mes-encadrements/page.tsx',
    horsCoque: true,
  },
  // Dans la coque : écrans du PERSONNEL.
  '/admin/moissonnage': {
    composant: PageMoissonnage,
    fichier: 'app/admin/moissonnage/page.tsx',
  },
  '/admin/moissonnage/[id]': {
    composant: PageMoissonnageDetail,
    fichier: 'app/admin/moissonnage/[id]/page.tsx',
    params: { id: 's1' },
  },
  '/admin/depots-soumis': {
    composant: PageDepotsSoumis,
    fichier: 'app/admin/depots-soumis/page.tsx',
  },
  '/admin/depots-a-cataloguer': {
    composant: PageDepotsACataloguer,
    fichier: 'app/admin/depots-a-cataloguer/page.tsx',
  },
  // Même nature : l'écran du DIRECTEUR, hors de la coque du personnel.
  '/depots-a-valider': {
    composant: PageDepotsAValider,
    fichier: 'app/depots-a-valider/page.tsx',
    horsCoque: true,
  },
} as const;

export type Adresse = keyof typeof ECRANS;

/** Les adresses montées DANS la coque — celles que ses invariants concernent. */
/**
 * Les écrans qui portent EUX-MÊMES leur en-tête et leur repère : « Mon dépôt »,
 * « Mes encadrements ». Ils sont hors des invariants de COQUE — la coque n'est
 * pas la leur — mais pas hors des invariants de PAGE : un repère principal et
 * le lien qui y mène ne dépendent d'aucune coque.
 *
 * ⚠ Ils n'étaient couverts par RIEN jusqu'au 12 septembre 2026. L'exclusion
 * était juste dans son motif et trop large dans son effet.
 */
export const ADRESSES_HORS_COQUE = (Object.keys(ECRANS) as Adresse[]).filter(
  (a) => 'horsCoque' in ECRANS[a],
);

export const ADRESSES_DE_COQUE = (Object.keys(ECRANS) as Adresse[]).filter(
  (a) => !('horsCoque' in ECRANS[a]),
);

/** Le fichier existe-t-il vraiment ? Lu depuis le disque, pas supposé. */
export function fichierDEcranExiste(chemin: string): boolean {
  try {
    return readFileSync(join(process.cwd(), chemin), 'utf8').includes('export default');
  } catch {
    return false;
  }
}

// ── Doublure réseau ──────────────────────────────────────────────────────────

export interface Montage {
  /** Fonctions du compte. */
  fonctions: string[];
  /** Modules ACTIFS. `null` = /modules ne répond jamais (état inconnu). */
  modules: string[] | null;
  /**
   * Table fragment d'URL → corps. Une URL qui ne correspond à aucun fragment
   * LÈVE : un appel oublié doit se voir, jamais recevoir un repli silencieux.
   * Deux doublures se sont tues cette semaine, et les deux fois la recherche du
   * défaut est partie du mauvais côté.
   */
  reponses?: Record<string, unknown>;
}

/** Tous les modules non-noyau du registre, pour écrire `modules` sans les lister. */
export const MODULES_ACTIVABLES = ['amendes', 'interoperabilite', 'rappels'] as const;

/**
 * Le corps de `GET /modules`, dans la forme COMPLÈTE que l'écran attend.
 *
 * ⚠ Une première version ne rendait que `{ id, actif }` — assez pour
 * `useModulesActifs`, donc le menu se filtrait correctement — et l'écran des
 * modules, lui, ne rendait aucun bouton. Le test échouait en disant « bouton
 * introuvable », c'est-à-dire en accusant l'écran. La doublure était seule
 * fautive : deux consommateurs de la même route n'en lisent pas la même part.
 */
function corpsDesModules(actifs: string[]) {
  const noyau = ['auth', 'usagers', 'catalogue', 'circulation', 'administration'];
  const module = (id: string, libelle: string, estNoyau: boolean) => ({
    id,
    libelle,
    description: `Description de ${libelle}.`,
    dependances: estNoyau ? [] : ['circulation'],
    noyau: estNoyau,
    actif: estNoyau || actifs.includes(id),
    verrouille: estNoyau,
    motifVerrouillage: null,
    motif: estNoyau ? { code: 'noyau' as const, modules: [] } : null,
    ecrans: estNoyau ? [] : [`un écran de ${libelle}`],
  });
  return [
    ...noyau.map((id) => module(id, id[0].toUpperCase() + id.slice(1), true)),
    module('amendes', 'Amendes', false),
    module('interoperabilite', 'Interopérabilité', false),
    module('rappels', 'Rappels', false),
  ];
}

/**
 * Monte l'écran servi par `adresse`, dans la coque, comme le ferait une adresse
 * tapée à la main. Rend le résultat de `render` et la fonction `fetch` simulée.
 */
export function monterEcran(adresse: Adresse, montage: Montage) {
  const cible = ECRANS[adresse];
  poserAdresse(adresse, 'params' in cible ? { ...cible.params } : {});

  ouvrirSession();
  invaliderModulesActifs(); // sinon une requête en vol d'un test précédent revient

  const appels: string[] = [];
  const fetchSimule = vi.fn((entree: RequestInfo | URL, init?: RequestInit) => {
    const url = String(entree);
    appels.push(`${init?.method ?? 'GET'} ${url}`);
    const ok = (corps: unknown) =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(corps) } as Response);

    if (url.includes('/auth/me/functions')) return ok({ functions: montage.fonctions });
    if (url.includes('/modules')) {
      if (montage.modules === null) return new Promise<Response>(() => {});
      // PATCH d'une bascule : l'API rend l'état à jour, et c'est la coque qui
      // doit s'en apercevoir — c'est précisément le défaut n° 1 de P4-2.
      if (init?.method === 'PATCH') {
        const id = url.split('/modules/')[1];
        const actif = JSON.parse(String(init.body ?? '{}')).actif !== false;
        montage.modules = actif
          ? [...(montage.modules ?? []), id]
          : (montage.modules ?? []).filter((m) => m !== id);
        return ok({ id, actif });
      }
      return ok(corpsDesModules(montage.modules));
    }
    for (const [fragment, corps] of Object.entries(montage.reponses ?? {})) {
      if (url.includes(fragment)) return ok(corps);
    }
    throw new Error(`Requête non couverte par le montage — ${init?.method ?? 'GET'} ${url}`);
  });
  vi.stubGlobal('fetch', fetchSimule);

  const Ecran = cible.composant;
  // ⚠ Un écran hors coque se monte NU : il porte son propre en-tête.
  const rendu = 'horsCoque' in cible ? <Ecran /> : (
    <AdminShell>
      <Ecran />
    </AdminShell>
  );
  return {
    ...render(rendu),
    appels,
    fetchSimule,
  };
}
