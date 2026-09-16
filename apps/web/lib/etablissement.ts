// Le nom de l'établissement courant, chargé UNE FOIS pour toute la page.
//
// ⚠ POURQUOI UN CACHE DE MODULE PLUTÔT QU'UN CONTEXTE. `/tenancy/current` était
// déjà appelé à chaque page par le ThemeProvider, pour les couleurs de l'école.
// Le menu de compte a besoin du NOM de la même réponse. Une seconde requête
// serait un appel de plus sur chaque écran pour une ligne d'affichage ; un
// contexte demanderait d'envelopper l'arbre entier pour la même donnée.
//
// La promesse est mémorisée : deux appelants dans le même chargement de page
// partagent la même requête, et le second n'en déclenche pas.

import { api } from './api';
import { useEffect, useState } from 'react';

export interface EtablissementCourant {
  name: string;
  slug: string;
  primaryColor: string;
  secondaryColor: string;
}

let enCours: Promise<EtablissementCourant | null> | null = null;

/** ⚠ L'échec vaut `null`, jamais une exception : aucun écran ne doit tomber
 *  parce que le nom de l'école n'a pas pu être lu. */
export function chargerEtablissement(): Promise<EtablissementCourant | null> {
  enCours ??= api<EtablissementCourant>('/tenancy/current').catch(() => null);
  return enCours;
}

/** ⚠ Pour les tests seulement : la mémorisation survivrait d'un cas à l'autre. */
export function oublierEtablissement(): void {
  enCours = null;
}

/**
 * Le nom de l'établissement, ou `null` tant qu'on ne le sait pas.
 *
 * ⚠ `null` VEUT DIRE « PAS ENCORE SU », et l'appelant n'affiche alors RIEN —
 * jamais un repli qui ressemblerait à un nom. C'est la règle de ce dépôt sur
 * les non-réponses : une donnée pas encore chargée ne s'écrit pas comme un
 * fait.
 */
export function useNomEtablissement(): string | null {
  const [nom, setNom] = useState<string | null>(null);
  useEffect(() => {
    let vivant = true;
    void chargerEtablissement().then((t) => {
      if (vivant && t?.name) setNom(t.name);
    });
    return () => {
      vivant = false;
    };
  }, []);
  return nom;
}
