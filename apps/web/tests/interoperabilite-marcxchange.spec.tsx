/**
 * Vocabulaire d'interopérabilité à l'écran — MarcXchange, jamais MARCXML.
 *
 * Reprend l'ancienne docs/NOTE-HARNAIS-FRONT-INTEROP.md, supprimée en même
 * temps que ce test comme elle le prévoyait (texte dans l'historique git).
 * Ferme le trou laissé par le
 * garde-fou du dépôt (apps/api/src/cataloging/unimarc-xml.spec.ts) : celui-ci
 * balaie les identifiants d'espace de noms de l'ancien schéma, qu'un libellé
 * d'écran comme « Export MARCXML » ne contient pas. (Les motifs exacts ne sont
 * pas recopiés ici : ce fichier tomberait sous le coup du garde-fou.)
 *
 * ⚠ Piège nommé dans la note : `not.toContain('MARC21')` serait FAUX sur
 * l'écran d'interopérabilité — la phrase dit « et non MARC21 », et c'est
 * précisément ce qu'on veut conserver. Ce qui doit être absent, c'est
 * `marcxml`, l'ancien nom de format que l'API refuse par une 400.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import InteroperabilitePage from '@/app/admin/interoperabilite/page';
import CataloguePage from '@/app/admin/catalogue/page';
import FicheNoticePage from '@/app/admin/catalogue/[id]/page';
import { fermerSession, ouvrirSession } from './aide-session';

const ID_NOTICE = 'rec-1';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: ID_NOTICE }),
  usePathname: () => '/admin/catalogue',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

function reponse(corps: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(corps) } as Response);
}

const NOTICE = {
  id: ID_NOTICE,
  title: 'Traité de papyrologie',
  titleComplement: null,
  author: null,
  contributors: [],
  keywords: [],
  category: null,
  recordType: 'ouvrage',
  publishYear: null,
  isbn: null,
  language: 'fr',
  publisher: null,
  publicationCity: null,
  defenseUniversity: null,
  defensePlace: null,
  summary: null,
  items: [],
};

function brancherFetch() {
  // Sans session, useMyFunctions ne demande rien et l'écran affiche son refus.
  ouvrirSession();
  vi.stubGlobal(
    'fetch',
    vi.fn((entree: RequestInfo | URL) => {
      const url = String(entree);
      if (url.includes('/auth/me/functions')) {
        // Fonctions livrées par l'API (découpage du 8 septembre 2026).
        return reponse({ functions: ['diffusion.gerer', 'catalogue.gerer'] });
      }
      if (url.includes(`/cataloging/records/${ID_NOTICE}`)) return reponse(NOTICE);
      if (url.includes('/cataloging/records')) {
        return reponse({ total: 0, page: 1, totalPages: 1, records: [] });
      }
      if (url.includes('/cataloging/keywords')) return reponse([]);
      if (url.includes('/categories')) return reponse([]);
      return reponse({});
    }),
  );
}

/** Tous les liens d'export de la page rendue. */
function liensExport(container: HTMLElement): HTMLAnchorElement[] {
  return Array.from(container.querySelectorAll('a[href*="/cataloging/export"]'));
}

afterEach(() => {
  vi.unstubAllGlobals();
  fermerSession();
});

describe("écran d'interopérabilité", () => {
  it('annonce marcxchange / ISO 25577 / UNIMARC', async () => {
    brancherFetch();
    const { container } = render(<InteroperabilitePage />);
    await screen.findByRole('heading', { name: 'Interopérabilité' });

    const texte = container.textContent ?? '';
    expect(texte).toContain('marcxchange');
    expect(texte).toContain('ISO 25577');
    expect(texte).toContain('UNIMARC');
  });

  it('ne mentionne MARC21 que pour dire que ce n’en est PAS', async () => {
    brancherFetch();
    const { container } = render(<InteroperabilitePage />);
    await screen.findByRole('heading', { name: 'Interopérabilité' });

    const texte = (container.textContent ?? '').replace(/\s+/g, ' ');

    // La négation doit être là : c'est elle qui empêche un moissonneur de
    // décoder de l'UNIMARC comme du MARC21.
    expect(texte).toContain('et non MARC21');

    // Et il ne doit RESTER aucune autre occurrence une fois la négation retirée.
    // (Un `not.toContain('MARC21')` nu serait une assertion fausse — voir l'en-tête.)
    expect(texte.replace(/et non MARC21/g, '')).not.toMatch(/MARC21/);
  });

  it("n'emploie plus « marcxml », l'ancien nom de format refusé par l'API", async () => {
    brancherFetch();
    const { container } = render(<InteroperabilitePage />);
    await screen.findByRole('heading', { name: 'Interopérabilité' });

    expect(container.textContent ?? '').not.toMatch(/marcxml/i);
  });
});

describe("boutons d'export", () => {
  it('le catalogue complet s’exporte en MarcXchange, jamais en marcxml', async () => {
    brancherFetch();
    const { container } = render(<CataloguePage />);
    await screen.findByRole('heading', { name: 'Catalogue' });

    const liens = liensExport(container);
    expect(liens.length).toBeGreaterThan(0);
    // Aucun lien resté à l'ancienne valeur : l'API la refuse par une 400, le
    // téléchargement échouerait sans que rien à l'écran ne l'explique.
    for (const lien of liens) expect(lien.getAttribute('href')).not.toMatch(/format=marcxml/i);

    const marcxchange = liens.find((l) => l.getAttribute('href')?.includes('format=marcxchange'));
    expect(marcxchange).toBeTruthy();
    expect(marcxchange!.getAttribute('href')).toBe('/api/cataloging/export?format=marcxchange');
    expect(marcxchange!.textContent?.trim()).toBe('Export MarcXchange');
    expect(marcxchange!.getAttribute('title')).toBe(
      'Exporter tout le catalogue en MarcXchange (ISO 25577, UNIMARC)',
    );

    // Le bouton voisin ISO 2709 est légitime et doit rester.
    const iso = liens.find((l) => l.getAttribute('href')?.includes('format=iso2709'));
    expect(iso?.textContent?.trim()).toBe('Export MARC');
  });

  it('une notice s’exporte en MarcXchange, jamais en marcxml', async () => {
    brancherFetch();
    const { container } = render(<FicheNoticePage />);
    await waitFor(() => expect(liensExport(container).length).toBeGreaterThan(0));

    const liens = liensExport(container);
    for (const lien of liens) expect(lien.getAttribute('href')).not.toMatch(/format=marcxml/i);

    const marcxchange = liens.find((l) => l.getAttribute('href')?.includes('format=marcxchange'));
    expect(marcxchange).toBeTruthy();
    expect(marcxchange!.getAttribute('href')).toBe(
      `/api/cataloging/export?format=marcxchange&ids=${ID_NOTICE}`,
    );
    expect(marcxchange!.textContent?.trim()).toBe('MarcXchange');
    expect(marcxchange!.getAttribute('title')).toBe(
      'Exporter cette notice en MarcXchange (ISO 25577, UNIMARC)',
    );
  });

  it("aucun libellé ni title d'export ne parle encore de MARCXML", async () => {
    brancherFetch();
    const { container } = render(<CataloguePage />);
    await screen.findByRole('heading', { name: 'Catalogue' });

    for (const lien of liensExport(container)) {
      expect(lien.textContent ?? '').not.toMatch(/marcxml/i);
      expect(lien.getAttribute('title') ?? '').not.toMatch(/marcxml/i);
      expect(lien.getAttribute('title') ?? '').not.toMatch(/MARC21/);
    }
  });
});
