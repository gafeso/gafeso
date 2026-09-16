'use client';

// CE QUE LA PERSONNE CONNECTÉE PORTE AVEC ELLE — ses écrans, son école, et
// l'existence ou non d'une porte vers l'espace professionnel.
//
// ⚠ POURQUOI CE FICHIER EXISTE. Le produit a DEUX en-têtes : la vitrine
// (`components/home/home-header.tsx`) et celui du reste du site
// (`components/header.tsx`). Le 15 septembre 2026, le menu de compte a été posé
// dans le second ; le premier est resté avec sa propre idée de ce qu'un compte
// connecté doit offrir — un lien portant le PRÉNOM et menant à `/guichet`, pour
// tout le monde, étudiants compris.
//
// C'est « deux tableaux qui se ressemblent ne sont pas le même tableau » à
// l'échelle d'un composant : deux barres écrites séparément, qui décrivent la
// même chose et divergent à la première modification. La règle n'est donc pas
// « penser aux deux » — c'est de n'avoir qu'une source.

import { useEffect, useState } from 'react';
import { getUser, type SessionUser } from './session';
import { useMyFunctions } from './functions';
import { useModulesActifs } from './modules-actifs';
import { useNomEtablissement } from './etablissement';
import { premiereEntreeAccessible } from './navigation';
import { LIBELLES } from './libelles';
import type { EntreeCompte } from '@/components/menu-compte';

export interface CompteCourant {
  /** `null` = personne n'est connecté. */
  user: SessionUser | null;
  /** Les écrans de la PERSONNE, dans l'ordre du menu. */
  entrees: EntreeCompte[];
  /**
   * Où mène l'espace professionnel — **toujours `/admin`**, `null` si cette
   * personne n'y a AUCUNE entrée.
   *
   * ⚠ UNE SEULE ADRESSE, et pas l'écran calculé. `/admin` redirige déjà vers la
   * première section accessible, et cette logique y est éprouvée. Pointer le
   * lien directement sur la destination la dupliquerait, et donnerait un lien
   * dont l'adresse CHANGE selon la personne — impossible à mettre en signet,
   * impossible à nommer dans un script de démonstration.
   *
   * ⚠ Conditionné à « a-t-elle au moins une entrée ? » et jamais à une liste de
   * rôles : c'est ce qui évite une porte vers un écran qui refuse. La vitrine
   * offrait exactement cette porte-là — un lien vers `/guichet` sous le prénom
   * de n'importe quel connecté, et une étudiante y lisait « cet espace est
   * réservé au personnel de la bibliothèque ».
   */
  lienPro: string | null;
  /** `null` tant qu'on ne le sait pas : on n'écrit alors aucune ligne d'école. */
  etablissement: string | null;
}

export function useCompteCourant(fonctionsConnues?: string[] | null): CompteCourant {
  const [user, setUser] = useState<SessionUser | null>(null);
  const propres = useMyFunctions();
  const effectives = fonctionsConnues !== undefined ? fonctionsConnues : propres.functions;
  const { modulesActifs } = useModulesActifs();
  const etablissement = useNomEtablissement();

  useEffect(() => setUser(getUser()), []);

  // `null` (pas encore su) laisse passer : masquer sur une information qu'on
  // n'a pas ferait disparaître un écran auquel la personne a droit. La
  // garantie reste l'API, qui refuse les routes d'un module inactif.
  const moduleEteint = (id: string) => modulesActifs !== null && !modulesActifs.includes(id);

  const entrees: EntreeCompte[] = user
    ? [
        { href: '/profil', label: 'Mon compte', title: 'Mon compte (informations, mot de passe, sécurité)' },
        { href: '/mes-prets', label: 'Mes prêts', title: 'Mes prêts et réservations' },
        ...(effectives?.includes('depot.deposer') && !moduleEteint('depot')
          ? [
              {
                href: '/mon-depot',
                label: LIBELLES.monDepot.titre,
                title: 'Déposer un mémoire ou une thèse, et suivre son avancement',
                separeAvant: true,
              },
            ]
          : []),
        // ⚠ PAS DE CONDITION DE MODULE ICI, ET C'EST MESURÉ : le service lit le
        // CATALOGUE, pas les dépôts. Éteindre le dépôt ferme le circuit ; il
        // n'efface pas ce qui en est sorti.
        ...(effectives?.includes('encadrements.voir')
          ? [
              {
                href: '/mes-encadrements',
                label: LIBELLES.mesEncadrements.titre,
                title: 'Les mémoires et thèses que j’ai dirigés',
                separeAvant: !effectives?.includes('depot.deposer'),
              },
            ]
          : []),
      ]
    : [];

  return {
    user,
    entrees,
    lienPro: user && effectives && premiereEntreeAccessible(effectives) !== null ? '/admin' : null,
    etablissement,
  };
}
