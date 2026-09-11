'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMyFunctions } from '@/lib/functions';
import { premiereEntreeAccessible } from '@/lib/navigation';

/**
 * Porte d'entrée de l'espace professionnel : redirige vers la première
 * section réellement accessible.
 *
 * Déduite de la navigation (même filtre, mêmes fonctions) plutôt que d'une
 * liste de rôles écrite à part : les deux ne peuvent plus diverger. L'ancienne
 * version envoyait un MANAGER sur /admin/comptes et un LIBRARIAN sur
 * /admin/catalogue — deux vérités de plus à tenir à jour.
 */
export default function AdminHome() {
  const router = useRouter();
  const { functions } = useMyFunctions();

  useEffect(() => {
    if (!functions) return;
    router.replace(premiereEntreeAccessible(functions) ?? '/');
  }, [functions, router]);

  return null;
}
