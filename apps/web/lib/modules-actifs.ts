'use client';

// État des modules pour l'établissement courant — P4-3, moitié front.
//
// ⚠ IL NE PROTÈGE RIEN, et c'est important de le dire ici. La règle normative du
// brief P4 exige les DEUX effets ensemble : l'interface n'affiche plus rien qui
// mène à un module éteint, ET l'API refuse ses routes en le nommant. Ce hook
// sert le premier. Le second est la garantie, et il ne dépend pas de lui —
// cacher sans refuser laisserait une porte ouverte.

import { useEffect, useState } from 'react';
import { api } from './api';
import { getToken, getUser } from './session';

/**
 * Requête EN VOL partagée, relâchée à sa résolution — même mécanique que
 * `useMyFunctions`, et pour la même raison : trois consommateurs sur un écran
 * feraient trois appels, et mémoriser le résultat garderait un module éteint
 * visible jusqu'au prochain rechargement complet.
 */
/**
 * ⚠ RÉSOUT `null` EN CAS D'ÉCHEC, elle ne REJETTE PAS.
 *
 * La première écriture levait une erreur, et `void enVol.finally(...)` sur une
 * promesse qui rejette produit un **rejet non géré** : la suite passait ses 250
 * assertions et sortait pourtant en 1, avec cinq erreurs hors assertions. Un
 * test vert n'est pas une exécution propre — et mon propre grep, qui ne gardait
 * que la ligne « Tests », me cachait la section qui le disait.
 *
 * `null` porte la même information sans le piège : « on ne sait pas », distinct
 * d'une liste vide qui se lirait « aucun module actif » et masquerait tout le
 * menu sur une simple panne réseau.
 */
let enVol: Promise<string[] | null> | null = null;

function modulesCourants(): Promise<string[] | null> {
  if (enVol) return enVol;
  enVol = api<{ id: string; actif: boolean }[]>('/modules', {}, getToken())
    .then((liste) => liste.filter((m) => m.actif).map((m) => m.id))
    .catch(() => null);
  void enVol.finally(() => {
    enVol = null;
  });
  return enVol;
}

/**
 * Abonnés à recharger quand l'état des modules change.
 *
 * ⚠ POURQUOI CE MÉCANISME EXISTE. L'écran des modules et la coque sont deux
 * composants distincts, chacun avec sa copie de l'état. Basculer un module
 * rechargeait la liste de l'écran mais PAS le menu : l'entrée d'un module qu'on
 * venait d'éteindre restait affichée jusqu'au prochain rechargement complet.
 * Constaté en recette le 11 septembre 2026 — l'interface mentait sur ce qu'elle
 * venait elle-même de faire.
 */
const abonnes = new Set<() => void>();

/** À appeler après toute bascule : la coque et l'écran se reconstruisent. */
export function invaliderModulesActifs(): void {
  enVol = null;
  for (const relire of abonnes) relire();
}

export function useModulesActifs(): { modulesActifs: string[] | null } {
  const [modulesActifs, setModulesActifs] = useState<string[] | null>(null);

  useEffect(() => {
    if (!getUser()) return; // page publique : rien à filtrer
    let vivant = true;
    // `null` en cas d'échec : le menu montre tout, et l'API refusera ce qui
    // doit l'être. Masquer sur une panne ferait disparaître des écrans auxquels
    // l'utilisateur a droit.
    const relire = () => {
      void modulesCourants().then((m) => {
        if (vivant && m !== null) setModulesActifs(m);
      });
    };
    relire();
    abonnes.add(relire);
    return () => {
      vivant = false;
      abonnes.delete(relire);
    };
  }, []);

  return { modulesActifs };
}
