'use client';

// Applique les couleurs de l'école (TenantSettings) aux variables CSS de
// marque. Chaque établissement a ainsi son identité sans rebuild — l'esprit
// multi-tenant. En cas d'échec (API down), les défauts Gafeso restent.

import { useEffect } from 'react';
import { api } from '@/lib/api';

function hexToRgbTriplet(hex: string): string | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const value = parseInt(match[1], 16);
  return `${(value >> 16) & 255} ${(value >> 8) & 255} ${value & 255}`;
}

export function ThemeProvider() {
  useEffect(() => {
    api<{ primaryColor: string; secondaryColor: string }>('/tenancy/current')
      .then((tenant) => {
        const root = document.documentElement;
        const primary = hexToRgbTriplet(tenant.primaryColor);
        const secondary = hexToRgbTriplet(tenant.secondaryColor);
        if (primary) root.style.setProperty('--brand-primary-rgb', primary);
        if (secondary) root.style.setProperty('--brand-secondary-rgb', secondary);
      })
      .catch(() => null);
  }, []);

  return null;
}
