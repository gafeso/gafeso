/**
 * LE RAPPORT ANNUEL — les trois propriétés qui le rendent honnête.
 *
 * ⚠ CE N'EST PAS UN TABLEAU DE BORD, et c'est ce qui décide de tout. Le tableau
 * de bord répond « comment ça va » au quotidien ; celui-ci est le document
 * qu'une directrice remet à son université une fois par an, et qu'elle fait à
 * la main aujourd'hui. Il est lu par des gens qui n'ont pas construit le
 * produit, et il sert à décider d'un budget — un zéro faux y coûte plus que
 * partout ailleurs.
 *
 * Les trois propriétés viennent du CONTRAT de l'API, pas de mon goût :
 *   1. les réserves sont EN TÊTE — « ce que le rapport ne peut pas dire, en
 *      tête plutôt qu'en note de bas » ;
 *   2. un bloc non calculable dit son MOTIF et ne ressemble pas à une panne ;
 *   3. une ligne masquée par le seuil RESTE, et dit pourquoi.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import PageRapportAnnuel from '@/app/admin/rapport-annuel/page';
import { LIBELLES } from '@/lib/libelles';

const T = LIBELLES.rapportAnnuel;

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/rapport-annuel',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/session', () => ({ getToken: () => 'jeton' }));

const calcule = <T,>(valeurs: T) => ({ etat: 'calcule' as const, valeurs });

const RAPPORT = {
  etablissement: 'Université d’Exemple',
  annee: 2025,
  periode: { debut: '2025-01-01', fin: '2025-12-31', libelle: 'Année 2025' },
  reserves: [
    'La date d’ACQUISITION d’un exemplaire n’est pas enregistrée.',
    'Un groupe de moins de 5 n’est pas publié.',
  ],
  fonds: calcule({
    documents: 480,
    exemplaires: 512,
    documentsNumeriques: 210,
    cataloguesDansLAnnee: 64,
    parCategorie: [
      { libelle: 'droit', nombre: 53 },
      // ⚠ La ligne MASQUÉE — elle reste, et elle dit pourquoi.
      { libelle: 'langues', nombre: null, masque: 'effectif trop faible pour être publié' },
    ],
  }),
  lecteurs: calcule({ inscrits: 63, actifsDansLAnnee: 41, parCategorie: [] }),
  circulation: calcule({ prets: 100, retours: 55, pretsEnRetardAuTerme: 7, tauxDeRotation: 0.2 }),
  numerique: calcule({ lecturesEnLigne: 12, telechargements: 3, lecturesHorsLigne: 0 }),
  depot: calcule({ deposes: 6, soumis: 1, valides: 3, refuses: 1, catalogues: 3 }),
  diffusion: {
    etat: 'non_calculable' as const,
    motif:
      'Les requêtes du serveur OAI-PMH ne sont pas journalisées : le nombre de ' +
      'notices moissonnées par des tiers n’est pas mesurable. Ce n’est pas zéro — c’est inconnu.',
  },
};

/** ⚠ Ce qui n'est pas prévu échoue BRUYAMMENT : un repli discret ferait accuser l'écran. */
function brancher(corps: unknown = RAPPORT) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (String(url).includes('/stats/rapport-annuel'))
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(corps) } as Response);
      throw new Error(`requête non couverte — ${url}`);
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function monter(corps: unknown = RAPPORT) {
  brancher(corps);
  render(<PageRapportAnnuel />);
  await waitFor(() => expect(screen.getByText('Université d’Exemple')).toBeTruthy());
}

describe('⚠ 1. Les réserves sont EN TÊTE', () => {
  it('elles s’affichent, toutes', async () => {
    await monter();
    expect(screen.getByText(T.reservesTitre)).toBeTruthy();
    for (const r of RAPPORT.reserves) expect(screen.getByText(r)).toBeTruthy();
  });

  it('⚠ et AVANT le premier chiffre — pas en note de bas', async () => {
    // Les reléguer en pied de page rendrait le document plus flatteur et moins
    // vrai. C'est le contrat de l'API qui l'exige, pas une préférence.
    await monter();
    const reserves = screen.getByText(T.reservesTitre);
    const premierBloc = screen.getByText(T.blocs.fonds);
    // `compareDocumentPosition` : 4 = « l'argument SUIT le nœud ».
    expect(reserves.compareDocumentPosition(premierBloc) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('⚠ 2. Un bloc non calculable dit son MOTIF', () => {
  it('le motif est affiché, en toutes lettres', async () => {
    // ⚠ Le motif partage son paragraphe avec le préfixe (« …et voici pourquoi : »),
    // donc on cherche dans le CONTENU de la section, pas par égalité de nœud.
    // Une première rédaction en `getByText(motif)` échouait sur l'écran JUSTE.
    await monter();
    const section = screen.getByText(T.blocs.diffusion).closest('section')!;
    expect(section.textContent).toContain(RAPPORT.diffusion.motif);
  });

  it('⚠ et AUCUN zéro n’est inventé à sa place', async () => {
    // C'est tout l'enjeu : « 0 notice moissonnée » se lirait « personne ne nous
    // moissonne », une AFFIRMATION que le produit ne peut pas faire — et
    // précisément celle qui prouverait la valeur de l'école.
    await monter();
    const section = screen.getByText(T.blocs.diffusion).closest('section')!;
    expect(section.textContent).not.toMatch(/\b0\b/);
  });

  it('⚠ il ne ressemble PAS à une panne, et ne propose pas de réessayer', async () => {
    // Un bloc non calculable est une limite assumée, pas un incident. Le peindre
    // en alerte apprendrait à lire les alertes comme du décor — et proposer un
    // nouvel essai enverrait chercher une panne là où il y a une borne.
    await monter();
    const section = screen.getByText(T.blocs.diffusion).closest('section')!;
    expect(section.querySelector('[role="alert"]')).toBeNull();
    expect(section.textContent).not.toMatch(/erreur|échec|r[ée]essayer/i);
  });
});

describe('⚠ 3. Une ligne masquée par le seuil RESTE', () => {
  it('le groupe est là, et son effectif est remplacé par le motif', async () => {
    // ⚠ La supprimer ferait disparaître le groupe du rapport : un lecteur en
    // conclurait qu'il n'existe pas, ou que son effectif est nul. C'est
    // exactement le faux que ce seuil existe pour éviter — une absence muette
    // se lit comme un zéro.
    await monter();
    expect(screen.getByText('langues')).toBeTruthy();
    expect(screen.getByText('effectif trop faible pour être publié')).toBeTruthy();
  });

  it('témoin : une ligne NON masquée montre bien son nombre', async () => {
    // Sans lui, « le groupe est affiché » ne distinguerait pas un tableau qui
    // masque tout d'un tableau qui masque ce qu'il faut.
    await monter();
    expect(screen.getByText('droit')).toBeTruthy();
    expect(screen.getByText('53')).toBeTruthy();
  });
});

describe('⚠ 4. L’année EN COURS se signale comme partielle', () => {
  const ANNEE_EN_COURS = new Date().getUTCFullYear();

  it('une année écoulée ne porte AUCUN avertissement', async () => {
    await monter();
    expect(screen.queryByText(/Année en cours/)).toBeNull();
  });

  it('⚠ l’année en cours le DIT — dix mois ne sont pas un bilan', async () => {
    // Ce document sert à demander un budget. Un total partiel qui ne se
    // signale pas est un faux — et c'est le seul que ce rapport puisse
    // produire sans qu'aucun de ses blocs soit en cause.
    await monter({
      ...RAPPORT,
      annee: ANNEE_EN_COURS,
      periode: {
        debut: `${ANNEE_EN_COURS}-01-01`,
        fin: `${ANNEE_EN_COURS}-12-31`,
        libelle: `du 1er janvier au 31 décembre ${ANNEE_EN_COURS}`,
      },
    });
    expect(screen.getByText(/Année en cours/)).toBeTruthy();
  });

  it('⚠ et il porte la date DU JOUR, pas la fin de la période', async () => {
    // ⚠ PREMIÈRE ÉCRITURE FAUSSE, trouvée en recette : la phrase affichait
    // « chiffres arrêtés au 2026-12-31 » — la fin de la période demandée, donc
    // une date FUTURE, qui contredisait exactement ce qu'elle prétend dire.
    // Un avertissement qui se trompe de date est pire que pas d'avertissement :
    // il donne une précision fausse à qui la lit sans la vérifier.
    await monter({
      ...RAPPORT,
      annee: ANNEE_EN_COURS,
      periode: {
        debut: `${ANNEE_EN_COURS}-01-01`,
        fin: `${ANNEE_EN_COURS}-12-31`,
        libelle: `du 1er janvier au 31 décembre ${ANNEE_EN_COURS}`,
      },
    });
    const phrase = screen.getByText(/Année en cours/).textContent ?? '';
    expect(phrase).not.toContain('31 décembre');
    expect(phrase).toContain(
      new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }),
    );
  });

  it('⚠ l’année en cours est OFFERTE au sélecteur — sinon l’avertissement est inatteignable', async () => {
    // Première écriture : le sélecteur s'arrêtait à l'année écoulée, donc la
    // phrase ci-dessus ne pouvait JAMAIS s'afficher. Un texte que le produit ne
    // peut pas atteindre est une illusion de garantie.
    await monter();
    const annees = [...document.querySelectorAll('option')].map((o) => o.getAttribute('value'));
    expect(annees).toContain(String(ANNEE_EN_COURS));
  });
});

describe('⚠ 5. La période ne se dit pas deux fois', () => {
  it('le libellé de l’API suffit, et il n’est pas réécrit moins bien', async () => {
    // Première écriture : « du 1er janvier au 31 décembre 2025 — du 1 janvier
    // 2025 au 31 décembre 2025 inclus ». La même phrase deux fois, et la
    // seconde moins bien écrite (« 1 janvier » au lieu de « 1er »).
    await monter();
    const entete = screen.getByText('Université d’Exemple').nextElementSibling;
    expect(entete?.textContent).toBe(RAPPORT.periode.libelle);
  });
});

describe('Ce que les textes DOIVENT dire', () => {
  it('⚠ le titre des réserves annonce une LIMITE, pas un appareil critique', () => {
    // « Notes méthodologiques » se saute. Celui-ci se lit.
    expect(T.reservesTitre).toMatch(/ne peut pas dire/i);
  });

  it('⚠ le préfixe d’un bloc absent ne dit ni erreur ni réessai', () => {
    expect(T.blocAbsentPrefixe).not.toMatch(/erreur|r[ée]essay/i);
    expect(T.blocAbsentPrefixe).toMatch(/pourquoi|calculable/i);
  });
});
