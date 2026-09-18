/**
 * ⚠ UN REFUS N'EST PAS UNE ATTENTE.
 *
 * 🔴 CE QUE ÇA CORRIGE, ET C'EST UNE MESURE DU BACKEND. `/admin/classes`
 * atteint en TAPANT l'adresse avec un compte sans `lecteurs.gerer` : deux 403,
 * et le tableau restait sur « Chargement… » **indéfiniment**. Mesuré en onglet
 * neuf, deux fois.
 *
 * ⚠ Le menu cachait correctement l'entrée — ce n'était pas le problème. Le
 * problème est qu'un REFUS s'affichait comme une ATTENTE, et sans aucune
 * sortie : « Chargement… » invite à patienter sur quelque chose qui n'arrivera
 * jamais. C'est la famille du vide qui désinforme, prise à l'envers — ici ce
 * n'est pas un vide affirmé, c'est un doute éternel.
 *
 * ⭐ LA STRUCTURE FAUTIVE, en une ligne : la donnée pilote SEULE l'affichage.
 *
 *     const [classes, setClasses] = useState<T[] | null>(null);
 *     try { setClasses(await api(…)); } catch (e) { setError(…); }   // ⚠ reste NULLE
 *     …
 *     {classes === null && <tr>Chargement…</tr>}                     // ⚠ pour toujours
 *
 * Deux états (`null` / chargé) là où il y en a **trois** : j'attends, j'ai, on
 * m'a refusé. C'est « compter les états que la couche d'en dessous porte »,
 * appliqué non plus à une énumération de base mais aux ISSUES d'un appel.
 *
 * ── LE BALAYAGE, parce qu'une leçon sert à CHERCHER ─────────────────────────
 * Dix écrans affichent `LIBELLES.commun.chargement`. **Sept faisaient déjà
 * bien** — `!donnees && !error` —, et `adherents/[id]` portait la forme de
 * référence : garde de fonction, puis `error && !donnees` → message ET lien de
 * retour. **Trois ne l'avaient pas** : `classes`, `auteurs`, `recolement`.
 *
 * ⚠ Et mon relevé a d'abord manqué `adherents/[id]`, qui s'écrit
 * `if (!fiche) return …` et non `{x === null && …}` — il se trouve qu'il était
 * SAIN, mais l'instrument ne le savait pas. Un motif syntaxique ne voit que la
 * forme qu'on a imaginée.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { LIBELLES } from '@/lib/libelles';
import { fermerSession, ouvrirSession } from './aide-session';

let FONCTIONS: string[] = [];
vi.mock('@/lib/functions', () => ({ useMyFunctions: () => ({ functions: FONCTIONS }) }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/admin/classes',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

import ClassesPage from '@/app/admin/classes/page';
import AuteursPage from '@/app/admin/auteurs/page';
import RecolementPage from '@/app/admin/recolement/page';

/** L'API refuse tout, comme elle le fait pour un compte sans la fonction. */
function apiRefuse(statut = 403, message = 'Fonction requise pour cette action : lecteurs.gerer.') {
  vi.stubGlobal('fetch', () =>
    Promise.resolve({
      ok: false,
      status: statut,
      json: () => Promise.resolve({ message, statusCode: statut }),
    } as Response),
  );
}

beforeEach(() => {
  FONCTIONS = [];
  ouvrirSession();
});
afterEach(() => {
  fermerSession();
  vi.unstubAllGlobals();
});

const ECRANS = [
  { nom: '/admin/classes', Page: ClassesPage, fonction: 'lecteurs.gerer', refus: LIBELLES.refusDeDroit.classes },
  // ⚠ `auteurs` porte son refus DANS l'écran, antérieur au fichier de libellés.
  // On vise donc la PROPRIÉTÉ — le texte nomme la fonction qui manque — plutôt
  // que d'ajouter une seconde formulation du même refus dans les libellés.
  { nom: '/admin/auteurs', Page: AuteursPage, fonction: 'catalogue.gerer', refus: /catalogue\.gerer/ },
  { nom: '/admin/recolement', Page: RecolementPage, fonction: 'outils.catalogue', refus: LIBELLES.refusDeDroit.recolement },
];

describe('🔴 L’adresse tapée sans la fonction : un refus, jamais « Chargement… »', () => {
  for (const { nom, Page, fonction, refus } of ECRANS) {
    it(`${nom} refuse en nommant la fonction`, async () => {
      apiRefuse();
      render(<Page />);
      expect(await screen.findByText(refus)).toBeTruthy();
      // ⚠ L'assertion qui porte le lot : plus aucune invitation à patienter.
      expect(screen.queryByText(LIBELLES.commun.chargement)).toBeNull();
    });

    it(`${nom} : avec la fonction, mais l’API en panne, la liste le DIT`, async () => {
      FONCTIONS = [fonction];
      apiRefuse(500, 'Erreur interne');
      render(<Page />);
      // Le refus de droit ne s'affiche pas — ce n'en est pas un.
      await waitFor(() => expect(screen.queryByText(refus)).toBeNull());
      // Et la liste ne prétend pas charger indéfiniment.
      await waitFor(() =>
        expect(screen.queryByText(LIBELLES.commun.chargement)).toBeNull(),
      );
      expect(screen.getAllByText(LIBELLES.commun.listeNonChargee).length).toBeGreaterThan(0);
    });
  }
});

describe('Les textes portent ce pour quoi ils existent', () => {
  it('chaque refus NOMME la fonction qui manque', () => {
    for (const { fonction, refus } of ECRANS) {
      // Un littéral cite la fonction telle quelle ; une expression régulière
      // l'échappe. On compare donc sur une forme commune.
      const texte = (typeof refus === 'string' ? refus : refus.source).replace(/\\/g, '');
      expect(texte, `ce refus ne nomme pas ${fonction}`).toContain(fonction);
    }
  });

  it('⚠ et « liste non chargée » ne se confond pas avec « liste vide »', () => {
    // Un « aucune classe » sur un échec serait le faux silencieux qu'on corrige :
    // il AFFIRME une absence qu'on ne connaît pas.
    expect(LIBELLES.commun.listeNonChargee).not.toMatch(/aucun|vide|0 /i);
    expect(LIBELLES.commun.listeNonChargee).toMatch(/pas pu|impossible|échou/i);
  });
});
