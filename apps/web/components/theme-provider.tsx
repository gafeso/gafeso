'use client';

// Applique les couleurs de l'école (TenantSettings) aux variables CSS de
// marque. Chaque établissement a ainsi son identité sans rebuild — l'esprit
// multi-tenant. En cas d'échec (API down), les défauts Gafeso restent.

import { useEffect } from 'react';
import { chargerEtablissement } from '@/lib/etablissement';

function hexToRgbTriplet(hex: string): string | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const value = parseInt(match[1], 16);
  return `${(value >> 16) & 255} ${(value >> 8) & 255} ${value & 255}`;
}

export function ThemeProvider() {
  useEffect(() => {
    // ⚠ MÊME CHARGEMENT que le menu de compte, mémorisé dans
    // `lib/etablissement` : les couleurs et le nom de l'école viennent de la
    // même réponse, et une seule requête part.
    void chargerEtablissement().then((tenant) => {
      if (!tenant) return;
      const root = document.documentElement;
      const primary = hexToRgbTriplet(tenant.primaryColor);
      const secondary = hexToRgbTriplet(tenant.secondaryColor);
      if (primary) root.style.setProperty('--brand-primary-rgb', primary);
      if (secondary) root.style.setProperty('--brand-secondary-rgb', secondary);
    });
  }, []);

  return null;
}
