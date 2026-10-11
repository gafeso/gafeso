/**
 * La fiche publique d'une notice porte son contenu DÈS LE HTML — backlog public.
 *
 * ⚠ CE QUI A ÉTÉ MESURÉ LE 11 SEPTEMBRE 2026. Texte visible du HTML servi pour
 * une notice, scripts retirés :
 *
 *     « Gafeso Accueil Catalogue Se connecter Créer un compte ☰ »
 *
 * Ni titre, ni auteur, ni `<h1>`, ni `<main>` : le contenu n'arrivait qu'après
 * l'exécution du JavaScript. C'est la page la plus importante d'un catalogue —
 * celle qu'on cherche à faire trouver — et elle était vide pour les moteurs.
 *
 * ⚠ ET L'IRONIE DE L'ENVELOPPE SERVEUR. On l'avait écrite POUR LES MACHINES :
 * rendre un vrai 404 pour qu'un vérificateur de liens ne prenne pas une notice
 * supprimée pour une notice vivante. Pendant ce temps, sa réponse 200 ne portait
 * rien. Le « introuvable » était honnête, le « trouvé » était vide.
 *
 * Ce test tient la propriété au seul endroit où elle se vérifie sans navigateur :
 * la fiche, montée avec sa notice initiale, affiche son titre AVANT toute
 * réponse réseau. La mesure du HTML réel, elle, est consignée dans le commit.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FicheNotice } from '@/app/opac/[id]/fiche-notice';
import FicheNoticePage from '@/app/opac/[id]/page';
import * as serverApi from '@/lib/server-api';

const introuvable = vi.fn();
vi.mock('next/navigation', () => ({
  notFound: () => {
    introuvable();
    throw new Error('NEXT_NOT_FOUND');
  },
  useParams: () => ({ id: 'r1' }),
  usePathname: () => '/opac/r1',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const NOTICE = {
  id: 'r1',
  title: 'Contes et transmission',
  titleComplement: 'travaux dirigés',
  author: 'Kaboré, Alain',
  contributors: [],
  isbn: 'EXEMPLE-1274',
  publishYear: 2024,
  language: 'fr',
  category: 'litterature',
  publisher: null,
  publicationCity: null,
  defenseUniversity: null,
  defensePlace: null,
  summary: null,
  keywords: [],
  items: [],
  availability: null,
  digitalCopy: null,
  membersOnly: false,
};

/**
 * ⚠ LE RÉSEAU NE RÉPOND JAMAIS, et c'est tout l'objet du test. Si la fiche
 * n'affiche son titre qu'après une réponse, ce montage le montre : rien ne vient.
 * Une doublure qui répondrait rendrait le test vert quelle que soit l'origine du
 * contenu — donc incapable de distinguer le rendu serveur du rendu client.
 */
function monterSansReseau(initial: typeof NOTICE | null) {
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
  return render(<FicheNotice initial={initial as never} />);
}

afterEach(() => vi.unstubAllGlobals());

describe('Fiche publique d’une notice', () => {
  it('affiche son titre sans attendre le réseau', () => {
    monterSansReseau(NOTICE);
    expect(screen.getByRole('heading', { name: /Contes et transmission/ })).toBeTruthy();
  });

  /**
   * ⚠ LA VALEUR SE CHERCHE DANS SA LIGNE DE DESCRIPTION, pas « quelque part
   * dans le document », et c'est la COUVERTURE COMPOSÉE qui l'a exigé.
   *
   * Elle porte le titre, l'auteur et l'année en `<tspan>` — délibérément, et
   * sous `aria-hidden`. Un lecteur d'écran ne les voit donc pas deux fois.
   * ⚠ Mais `getByText` n'honore PAS `aria-hidden` (seul `getByRole` le fait) :
   * il a trouvé deux « Kaboré, Alain » et refusé de choisir.
   *
   * ⚠ ET LE RÉFLEXE JUSTE AURAIT ÉTÉ DE SOUPÇONNER LE PRODUIT — c'est ce que
   * ce dépôt écrit, et c'est vrai la plupart du temps : ce qui est ambigu pour
   * `getByRole` est ambigu pour qui n'a pas l'écran. Ici non, et la raison est
   * mesurable : la duplication est SOUS `aria-hidden`, donc elle n'existe pas
   * pour l'arbre d'accessibilité. Ce qu'on corrige est l'imprécision du test,
   * et le gain est réel — « l'auteur est dans la ligne Auteur » dit plus que
   * « l'auteur est dans la page ».
   *
   * ⚠ Ne « corrigez » donc pas ce test en retirant la couverture : le
   * `*AllBy*` serait l'autre tentation, et il rendrait l'assertion muette sur
   * l'endroit où la donnée se trouve.
   */
  function valeurDe(libelle: string): string {
    const dts = Array.from(document.querySelectorAll('dt'));
    const dt = dts.find((n) => n.textContent?.trim() === libelle);
    expect(dt, `aucune ligne « ${libelle} » dans la fiche`).toBeTruthy();
    const dd = dt!.nextElementSibling;
    expect(dd?.tagName, `« ${libelle} » n’est pas suivi d’un <dd>`).toBe('DD');
    return dd!.textContent?.trim() ?? '';
  }

  it('et les données que cherche un moteur : auteur, année, domaine', () => {
    monterSansReseau(NOTICE);
    expect(valeurDe('Auteur')).toContain('Kaboré, Alain');
    expect(valeurDe('Année')).toBe('2024');
    expect(valeurDe('Domaine')).toBe('litterature');
  });

  /**
   * ⚠ SANS NOTICE INITIALE, ON N'AFFIRME RIEN. C'est le cas « API injoignable » :
   * l'enveloppe serveur passe `null` plutôt qu'un objet vide, sinon la page
   * rendrait une notice sans titre — un contenu affirmé qu'on n'a pas.
   */
  it('sans notice initiale : aucun titre inventé', () => {
    monterSansReseau(null);
    expect(screen.queryByRole('heading', { name: /Contes et transmission/ })).toBeNull();
  });
});

/**
 * ⚠ L'ENVELOPPE SERVEUR, APPELÉE DIRECTEMENT.
 *
 * Un contrôle négatif l'a exigée : remplacer son `?? null` par `?? ({})` — donc
 * faire rendre une notice SANS TITRE quand l'API est injoignable — ne faisait
 * tomber aucun test. Ce n'était ni un chemin mort ni une assertion trop faible :
 * c'était du code qu'aucun test ne montait. Un composant serveur est une
 * fonction async qui rend du JSX ; on peut l'appeler, et lire ce qu'elle passe.
 *
 * C'est le même geste que pour la caractérisation de `recordDetail` : chercher
 * le NIVEAU où le code est appelable, plutôt que l'outil qui simulerait le
 * client.
 */
describe('Enveloppe serveur de la fiche', () => {
  const appeler = () => FicheNoticePage({ params: Promise.resolve({ id: 'r1' }) });

  it('notice existante : elle est passée à la fiche', async () => {
    vi.spyOn(serverApi, 'noticePublique').mockResolvedValue({ etat: 'existe', notice: NOTICE });
    const el = (await appeler()) as { props: { initial: unknown } };
    expect(el.props.initial).toEqual(NOTICE);
  });

  it('API injoignable : `null`, jamais un objet vide', async () => {
    vi.spyOn(serverApi, 'noticePublique').mockResolvedValue({ etat: 'indisponible', notice: null });
    const el = (await appeler()) as { props: { initial: unknown } };
    // ⚠ `toBeNull`, pas `toBeFalsy` : `{}` est vrai, et c'est précisément la
    // valeur que la mutation posait. Un matcher laxiste aurait laissé passer.
    expect(el.props.initial).toBeNull();
  });

  it('notice introuvable : 404, et rien n’est rendu', async () => {
    introuvable.mockClear();
    vi.spyOn(serverApi, 'noticePublique').mockResolvedValue({ etat: 'introuvable', notice: null });
    await expect(appeler()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(introuvable).toHaveBeenCalledOnce();
  });
});
