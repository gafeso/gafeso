'use client';

// Fonctions effectives de l'utilisateur courant (rôles dynamiques, brique
// sécurité). Piloté uniquement pour l'affichage — l'API reste seule autorité,
// chaque action reste vérifiée côté serveur quoi que ce hook renvoie.

import { useEffect, useState } from 'react';
import { api } from './api';
import { getToken } from './session';

export function useMyFunctions(): { functions: string[] | null } {
  const [functions, setFunctions] = useState<string[] | null>(null);

  useEffect(() => {
    api<{ functions: string[] }>('/auth/me/functions', {}, getToken())
      .then((r) => setFunctions(r.functions))
      .catch(() => setFunctions([]));
  }, []);

  return { functions };
}
