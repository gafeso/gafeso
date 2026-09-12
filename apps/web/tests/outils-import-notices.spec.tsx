/**
 * Compte rendu d'import MARC — les TROIS cas restent séparés à l'écran.
 *
 * L'écran a été EXTRAIT de app/admin/catalogue vers Outils · Import de notices
 * lors de la refonte de navigation ; ce test l'a suivi sans changer une seule
 * assertion — c'était bien un déplacement, pas une réécriture.
 *
 * Reprend l'ancienne docs/NOTE-HARNAIS-FRONT.md, supprimée en même temps que
 * ce test comme elle le prévoyait (son texte reste dans l'historique git).
 * Le contrat serveur est déjà tenu par
 * apps/api/src/cataloging/cataloging.service.spec.ts ; ce qui manquait est la
 * moitié qui l'affiche.
 *
 * Contrôle négatif attendu : fusionner deux des trois cas (par exemple
 * additionner sansValeur et inconnues) doit faire tomber ce test.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { LIBELLES } from '@/lib/libelles';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ImportNoticesPage from '@/app/admin/outils/import-notices/page';

// Réponse simulée de POST /api/cataloging/records/import-marc, telle que la
// note la fixe (valeurs non reconnues déjà triées par occurrences décroissantes).
const COMPTE_RENDU = {
  imported: 7,
  skipped: 0,
  categories: {
    reconnues: 1,
    sansValeur: 2,
    inconnues: 4,
    valeursInconnues: [
      { valeur: 'papyrologie', occurrences: 3 },
      { valeur: 'sigillographie', occurrences: 1 },
    ],
  },
};

function reponse(corps: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(corps) } as Response);
}

/** Faux `fetch` : l'upload passe par la globale, le mapping réponse → écran reste testé. */
function brancherFetch() {
  const faux = vi.fn((entree: RequestInfo | URL) => {
    const url = String(entree);
    if (url.includes('/cataloging/records/import-marc')) return reponse(COMPTE_RENDU);
    return reponse({});
  });
  vi.stubGlobal('fetch', faux);
  return faux;
}

/** Valeur affichée en face d'un libellé de cas (le <dd> voisin de son <dt>). */
function valeurDuCas(libelle: string): string {
  const dt = screen.getByText(libelle);
  const dd = dt.parentElement?.querySelector('dd');
  if (!dd) throw new Error(`Aucune valeur affichée pour le cas « ${libelle} ».`);
  return dd.textContent?.trim() ?? '';
}

async function importerUnFichier(container: HTMLElement) {
  const champ = container.querySelector('input[type="file"]');
  if (!champ) throw new Error("L'écran n'expose plus de champ de fichier pour l'import.");
  fireEvent.change(champ, {
    target: { files: [new File(['00000nam'], 'notices.mrc')] },
  });
  await screen.findByText('Compte rendu de l’import');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Ce que l’avis de valeurs non reconnues DOIT dire', () => {
  /**
   * ⚠ SA PROPRIÉTÉ, PAS SA VALEUR, et la première moitié est la plus fragile :
   * sans « les notices SONT importées », l'avis se lit comme un échec d'import.
   * Un test qui compare au libellé laisserait passer « Domaine non reconnu. »,
   * qui dit vrai et fait croire que tout est perdu.
   */
  it('il rassure sur l’import AVANT de dire ce qui manque', () => {
    expect(LIBELLES.importNotices.valeursNonReconnuesTexte).toMatch(/bien importées/i);
    expect(LIBELLES.importNotices.valeursNonReconnuesTexte).toMatch(/rien n’est perdu|conservée/i);
  });
});

describe("compte rendu d'import MARC", () => {
  it('affiche les trois cas SÉPARÉMENT, chacun avec sa propre valeur', async () => {
    brancherFetch();
    const { container } = render(<ImportNoticesPage />);
    await importerUnFichier(container);

    // Chaque compteur est lu en face de SON libellé : additionner deux cas
    // dans un même compteur fait tomber au moins deux de ces trois égalités.
    expect(valeurDuCas('Reconnus et repris')).toBe('1');
    expect(valeurDuCas('Absents de la source')).toBe('2');
    expect(valeurDuCas('Non reconnus, laissés vides')).toBe('4');

    // Et les trois cas existent bien en tant que cas distincts.
    expect(screen.getByText('Reconnus et repris')).toBeInTheDocument();
    expect(screen.getByText('Absents de la source')).toBeInTheDocument();
    expect(screen.getByText('Non reconnus, laissés vides')).toBeInTheDocument();
  });

  it('liste les valeurs non reconnues, la plus fréquente en tête', async () => {
    brancherFetch();
    const { container } = render(<ImportNoticesPage />);
    await importerUnFichier(container);

    const liste = screen.getByRole('heading', { name: 'Valeurs non reconnues' })
      .parentElement?.querySelector('ul');
    expect(liste).toBeTruthy();

    const lignes = Array.from(liste!.querySelectorAll('li')).map((li) => {
      const cellules = li.querySelectorAll('span');
      return [cellules[0]?.textContent?.trim(), cellules[1]?.textContent?.trim()];
    });
    // L'ordre est celui du serveur (occurrences décroissantes) : l'écran ne le
    // retrie pas, et ne doit pas le perdre. Le singulier/pluriel est porté par
    // l'écran, pas par l'API — donc testé ici aussi.
    expect(lignes).toEqual([
      ['papyrologie', '3 notices'],
      ['sigillographie', '1 notice'],
    ]);
  });

  it("n'affiche aucun compte rendu tant qu'aucun import n'a eu lieu", async () => {
    brancherFetch();
    render(<ImportNoticesPage />);
    await waitFor(() => expect(screen.getByText('Import de notices')).toBeInTheDocument());
    expect(screen.queryByText('Compte rendu de l’import')).toBeNull();
  });
});
