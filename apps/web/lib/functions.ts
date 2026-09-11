'use client';

// Fonctions effectives de l'utilisateur courant (rôles dynamiques, brique
// sécurité). Piloté uniquement pour l'affichage — l'API reste seule autorité,
// chaque action reste vérifiée côté serveur quoi que ce hook renvoie.

import { useEffect, useState } from 'react';
import { api } from './api';
import { getToken, getUser } from './session';

/**
 * Requête EN VOL, partagée par les appels simultanés — et relâchée dès qu'elle
 * aboutit.
 *
 * ⚠ CE QU'ON CORRIGE. Trois composants consultent les fonctions sur un même
 * écran — la coque, l'écran, sa garde — et chacun demandait les siennes :
 * TROIS appels identiques par chargement de page, mesurés au journal réseau le
 * 11 septembre 2026 (backlog n° 11). Sans conséquence visible en local, mais
 * trois allers-retours là où un suffit, et c'est sur une connexion lente que ça
 * se voit.
 *
 * ⚠ CE QU'ON NE FAIT PAS, ET C'EST LE POINT DÉLICAT : on ne mémorise PAS le
 * résultat. Les fonctions sont résolues en base à chaque requête côté API,
 * précisément pour qu'une révocation prenne effet immédiatement sans attendre
 * l'expiration du jeton. Un cache qui vivrait le temps de l'onglet garderait un
 * droit retiré visible jusqu'au prochain rechargement complet — on remplacerait
 * trois requêtes par un trou de sécurité.
 *
 * La promesse est donc relâchée à sa résolution : les appels d'un même rendu se
 * partagent une requête, une navigation ultérieure en refait une.
 */
let enVol: Promise<string[]> | null = null;

function fonctionsCourantes(): Promise<string[]> {
  if (enVol) return enVol;
  enVol = api<{ functions: string[] }>('/auth/me/functions', {}, getToken())
    .then((r) => r.functions)
    .catch(() => [] as string[]);
  // ⚠ `void` et non `return` : le relâchement ne doit pas se glisser dans la
  // chaîne rendue aux appelants, sinon chacun attendrait un tour de plus.
  void enVol.finally(() => {
    enVol = null;
  });
  return enVol;
}

export function useMyFunctions(): { functions: string[] | null } {
  const [functions, setFunctions] = useState<string[] | null>(null);

  useEffect(() => {
    // Sans session, l'appel partirait sur chaque page publique pour revenir en
    // 401. On répond « aucune fonction » sans déranger l'API — le résultat est
    // le même, la requête en moins.
    if (!getUser()) {
      setFunctions([]);
      return;
    }
    let vivant = true;
    void fonctionsCourantes().then((f) => {
      if (vivant) setFunctions(f);
    });
    return () => {
      vivant = false;
    };
  }, []);

  return { functions };
}
