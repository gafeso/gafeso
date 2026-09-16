/**
 * L'IMPORT DES ÉTUDIANTS ATTENDUS — l'aperçu d'abord, la suppression ensuite.
 *
 * ⚠ CE QUE CE LOT CORRIGE, ET C'EST UNE ABSENCE, PAS UN DÉFAUT. L'API porte
 * depuis P7 un dispositif complet : DEUX routes (lire / écrire) plutôt qu'un
 * `dryRun`, un aperçu qui NOMME les lignes qui partiraient, et un
 * `confirmeRetraits` qui refuse le remplacement si le nombre a bougé entre les
 * deux. L'écran n'en connaissait RIEN — ni `remplacer`, ni `confirmeRetraits`,
 * ni `retraits`. Le remplacement n'était donc pas « mal gardé » : il était
 * INATTEIGNABLE, et tout l'appareil de sûreté ne servait personne.
 *
 * ⚠ LE CONTRÔLE NÉGATIF NE PEUT PAS TROUVER UNE ABSENCE (leçon du 12 septembre)
 * — on ne mute pas ce qui n'a jamais été écrit. Ces tests sont donc écrits
 * depuis ce que la ROUTE SERT, champ par champ, et non depuis ce que l'écran
 * affichait : `aImporter`, `enErreur`, `errors`, `classes`, `retraits.total`,
 * `retraits.premiers`, et `retires` au retour de l'import.
 *
 * ⚠ ET LE HARNAIS INSTRUMENTE LA REQUÊTE, pas seulement la réponse (quatrième
 * forme de « l'instrument fausse le monde du test ») : c'est le seul moyen de
 * prouver qu'un `confirmeRetraits` part, qu'il porte le nombre AFFICHÉ, et
 * qu'aucun `Content-Type` manuel ne casse la frontière multipart.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ImportEtudiantsPage from '@/app/admin/import-etudiants/page';
import { LIBELLES } from '@/lib/libelles';
import { fermerSession, ouvrirSession } from './aide-session';

const T = LIBELLES.importEtudiants;

const ROUTEUR = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
vi.mock('next/navigation', () => ({
  // ⚠ objet STABLE : une fabrique qui rend un objet neuf à chaque rendu
  // relance les effets qui en dépendent (cinquième forme, 14 septembre).
  useRouter: () => ROUTEUR,
  usePathname: () => '/admin/import-etudiants',
}));

interface Envoi {
  url: string;
  entetes: Record<string, string>;
  corps: unknown;
}

let envois: Envoi[] = [];
/** Ce que l'API répondra, par route. Une route non prévue ÉCHOUE BRUYAMMENT. */
let reponses: Record<string, { ok: boolean; status: number; corps: unknown }> = {};

const APERCU_AVEC_RETRAITS = {
  aImporter: 3,
  enErreur: 0,
  errors: [],
  classes: ['L1 Droit'],
  retraits: {
    total: 12,
    premiers: [
      { matricule: 'ETU-0041', nom: 'Traoré Awa', className: 'L1 Droit' },
      { matricule: 'ETU-0042', nom: 'Zongo Moussa', className: 'L1 Droit' },
    ],
  },
};

const APERCU_SANS_RETRAIT = {
  aImporter: 2,
  enErreur: 0,
  errors: [],
  classes: ['L1 Droit'],
  retraits: { total: 0, premiers: [] },
};

function poser(chemin: string, corps: unknown, statut = 200) {
  reponses[chemin] = { ok: statut >= 200 && statut < 300, status: statut, corps };
}

beforeEach(() => {
  envois = [];
  reponses = {};
  poser('/api/auth/me/functions', { functions: ['outils.lecteurs'] });
  ouvrirSession();
  vi.stubGlobal('fetch', (entree: RequestInfo | URL, init?: RequestInit) => {
    const url = String(entree);
    const prevue = Object.keys(reponses).find((c) => url.includes(c));
    if (!prevue) {
      // Un repli discret transformerait un oubli de doublure en défaut apparent
      // du produit (leçon du 10 septembre). On échoue là où c'est vrai.
      return Promise.reject(new Error(`requête non couverte par la doublure — ${url}`));
    }
    envois.push({
      url,
      entetes: Object.fromEntries(
        Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [
          k.toLowerCase(),
          v,
        ]),
      ),
      corps: init?.body,
    });
    const r = reponses[prevue];
    return Promise.resolve({
      ok: r.ok,
      status: r.status,
      json: () => Promise.resolve(r.corps),
    } as Response);
  });
});

afterEach(() => {
  fermerSession();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function deposerLeFichier(contenu = 'matricule,email,prenom,nom,classe\n') {
  const champ = document.querySelector('input[type=file]') as HTMLInputElement;
  const fichier = new File([contenu], 'liste.csv', { type: 'text/csv' });
  Object.defineProperty(champ, 'files', { value: [fichier], configurable: true });
  fireEvent.change(champ);
}

function envoisVers(fragment: string) {
  return envois.filter((e) => e.url.includes(fragment));
}

/** Les champs d'un FormData, lus comme l'API les recevra. */
function champs(envoi: Envoi): Record<string, string> {
  const fd = envoi.corps as FormData;
  const out: Record<string, string> = {};
  fd.forEach((v, k) => {
    if (typeof v === 'string') out[k] = v;
  });
  return out;
}

describe('Import des étudiants attendus — l’aperçu avant l’écriture', () => {
  it('le premier geste sur un fichier LIT, il n’écrit pas', async () => {
    poser('/expected-students/import/apercu', APERCU_AVEC_RETRAITS);
    render(<ImportEtudiantsPage />);
    await screen.findByRole('button', { name: /Glissez un fichier CSV/ });

    deposerLeFichier();
    await screen.findByText(T.apercuTitre);

    expect(envoisVers('/import/apercu')).toHaveLength(1);
    // ⚠ L'assertion qui porte tout le lot : la route d'ÉCRITURE n'a pas été
    // appelée. « Deux routes et non un dryRun » ne vaut que si l'écran les
    // distingue aussi.
    expect(
      envois.filter((e) => e.url.includes('/expected-students/import') && !e.url.includes('/apercu')),
    ).toHaveLength(0);
  });

  it('l’aperçu NOMME ce qui partirait — pas seulement le nombre', async () => {
    poser('/expected-students/import/apercu', APERCU_AVEC_RETRAITS);
    render(<ImportEtudiantsPage />);
    deposerLeFichier();

    await screen.findByText(T.retraitsTitre(12));
    expect(screen.getByText('Traoré Awa')).toBeTruthy();
    expect(screen.getByText('Zongo Moussa')).toBeTruthy();
    // Deux noms sur douze : le reste se compte, et il le dit.
    expect(screen.getByText(T.retraitsEtAutres(10))).toBeTruthy();
    // La portée est écrite : sans elle, « 12 supprimés » se lit comme « 12 de
    // toute l'école », et c'est faux.
    expect(screen.getByText(T.retraitsPortee)).toBeTruthy();
  });

  it('la suppression est DÉCOCHÉE, et sans elle l’import ne demande aucun retrait', async () => {
    poser('/expected-students/import/apercu', APERCU_AVEC_RETRAITS);
    poser('/expected-students/import', { imported: 3, skipped: 0, errors: [], retires: 0 });
    render(<ImportEtudiantsPage />);
    deposerLeFichier();
    await screen.findByText(T.apercuTitre);

    const case_ = screen.getByRole('checkbox', { name: T.caseSupprimer(12) }) as HTMLInputElement;
    expect(case_.checked).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: T.importer }));
    await waitFor(() => expect(envoisVers('/expected-students/import').length).toBeGreaterThan(1));

    const ecriture = envoisVers('/expected-students/import').find((e) => !e.url.includes('/apercu'))!;
    expect(champs(ecriture)).toEqual({});
  });

  it('cochée, elle renvoie le nombre AFFICHÉ en confirmeRetraits', async () => {
    poser('/expected-students/import/apercu', APERCU_AVEC_RETRAITS);
    poser('/expected-students/import', { imported: 3, skipped: 0, errors: [], retires: 12 });
    render(<ImportEtudiantsPage />);
    deposerLeFichier();
    await screen.findByText(T.apercuTitre);

    fireEvent.click(screen.getByRole('checkbox', { name: T.caseSupprimer(12) }));
    // Le bouton DIT ce qu'il va faire une fois la case cochée.
    fireEvent.click(screen.getByRole('button', { name: T.importerEtSupprimer(12) }));

    const bandeau = await screen.findByText(/3 étudiant\(s\) importé\(s\)/);
    expect(bandeau.textContent).toContain(T.retiresFaits(12));
    const ecriture = envoisVers('/expected-students/import').find((e) => !e.url.includes('/apercu'))!;
    expect(champs(ecriture)).toEqual({ remplacer: 'true', confirmeRetraits: '12' });
  });

  it('aucun Content-Type manuel — la frontière multipart est posée par le navigateur', async () => {
    poser('/expected-students/import/apercu', APERCU_SANS_RETRAIT);
    render(<ImportEtudiantsPage />);
    deposerLeFichier();
    await screen.findByText(T.apercuTitre);

    const envoi = envoisVers('/import/apercu')[0];
    expect(envoi.entetes['content-type']).toBeUndefined();
    expect(envoi.corps).toBeInstanceOf(FormData);
  });

  it('rien à retirer : pas de case inerte', async () => {
    poser('/expected-students/import/apercu', APERCU_SANS_RETRAIT);
    render(<ImportEtudiantsPage />);
    deposerLeFichier();
    await screen.findByText(T.apercuTitre);

    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('le refus de concordance DIT que rien n’a été écrit, et offre la suite', async () => {
    poser('/expected-students/import/apercu', APERCU_AVEC_RETRAITS);
    poser(
      '/expected-students/import',
      { message: 'Remplacement refusé : l’aperçu annonçait 12 retrait(s), le fichier en produit 9.' },
      400,
    );
    render(<ImportEtudiantsPage />);
    deposerLeFichier();
    await screen.findByText(T.apercuTitre);

    fireEvent.click(screen.getByRole('checkbox', { name: T.caseSupprimer(12) }));
    fireEvent.click(screen.getByRole('button', { name: T.importerEtSupprimer(12) }));

    await screen.findByText(T.desaccordTitre);
    // ⚠ Ce que la personne doit savoir AVANT tout le reste : l'état de la base.
    expect(screen.getByText(new RegExp(T.desaccordSuite.slice(0, 30)))).toBeTruthy();
    // L'aperçu reste à l'écran, et le geste qui débloque est là.
    expect(screen.getByText(T.apercuTitre)).toBeTruthy();

    poser('/expected-students/import/apercu', { ...APERCU_AVEC_RETRAITS, retraits: { total: 9, premiers: [] } });
    fireEvent.click(screen.getByRole('button', { name: T.relancerApercu }));
    await screen.findByText(T.retraitsTitre(9));
    // La case est retombée : un nombre neuf demande un consentement neuf.
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
  });

  it('le compte rendu montre `retires` — une suppression se rapporte', async () => {
    poser('/expected-students/import/apercu', APERCU_SANS_RETRAIT);
    poser('/expected-students/import', { imported: 2, skipped: 0, errors: [], retires: 0 });
    render(<ImportEtudiantsPage />);
    deposerLeFichier();
    await screen.findByText(T.apercuTitre);

    fireEvent.click(screen.getByRole('button', { name: T.importer }));
    const bandeau = await screen.findByText(/2 étudiant\(s\) importé\(s\)/);
    expect(within(bandeau).queryByText(T.aucunRetrait) ?? bandeau.textContent).toBeTruthy();
    expect(bandeau.textContent).toContain(T.aucunRetrait);
  });
});

describe('Les textes de cet écran portent ce pour quoi ils existent', () => {
  // Un test qui restate la constante ne voit pas qu'elle est devenue inutile
  // (leçon du 12 septembre) : on affirme ici ce que le TEXTE doit dire.
  it('le refus de concordance nomme les DEUX absences : import et suppression', () => {
    expect(T.desaccordTitre).toMatch(/import/i);
    expect(T.desaccordTitre).toMatch(/supprim/i);
  });

  it('la portée des suppressions nomme sa borne, pas seulement son existence', () => {
    expect(T.retraitsPortee).toMatch(/classes? présentes|classes du fichier|classes présentes/i);
    expect(T.retraitsPortee).toMatch(/inscrit|réclamé/i);
  });
});
