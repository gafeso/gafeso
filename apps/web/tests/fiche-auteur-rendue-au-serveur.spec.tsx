/**
 * La fiche AUTEUR est rendue au serveur — le miroir de la fiche notice.
 *
 * ⚠ CE FICHIER EXISTE PARCE QUE J'AI APPLIQUÉ LA LEÇON À MOI-MÊME. Le
 * 14 septembre 2026, après avoir trouvé qu'un test gardait la jumelle MORTE de
 * `noticePublique`, j'ai versé le motif : *après avoir écrit un garde pour X,
 * demander qui garde le FRÈRE de X*.
 *
 * Posée à mon propre lot, la question mordait : l'enveloppe de la NOTICE avait
 * six cas, celle de l'AUTEUR — que je venais d'écrire — n'en avait aucun.
 * `opac-auteur-404-reel.spec.ts` éprouve la FONCTION, pas l'enveloppe.
 *
 * ⚠ J'avais pourtant vérifié les trois propriétés à la main (404, `h1` servi,
 * 256 octets de texte). **Une mesure est un moment ; seul le test se
 * souvient.**
 *
 * ⚠ LE RÉSEAU NE RÉPOND JAMAIS ICI, et c'est tout l'objet : si la fiche
 * n'affichait son nom qu'après une réponse, ce montage le montrerait. Une
 * doublure qui répondrait rendrait le test vert quelle que soit l'origine du
 * contenu — donc incapable de distinguer le rendu serveur du rendu client.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FicheAuteur } from '@/app/opac/auteurs/[id]/fiche-auteur';
import FicheAuteurPage, { generateMetadata } from '@/app/opac/auteurs/[id]/page';
import * as serverApi from '@/lib/server-api';

const introuvable = vi.fn();
vi.mock('next/navigation', () => ({
  notFound: () => {
    introuvable();
    throw new Error('NEXT_NOT_FOUND');
  },
  useParams: () => ({ id: 'a1' }),
  usePathname: () => '/opac/auteurs/a1',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const AUTEUR = {
  id: 'a1',
  displayName: 'Barry, Abdoulaye',
  bio: null,
  birthYear: null,
  deathYear: null,
  totalWorks: 1,
  worksByRole: [
    {
      role: 'AUTEUR_PRINCIPAL',
      count: 1,
      works: [
        { recordId: 'r1', title: 'Justice coutumière', year: 2022, recordType: 'ouvrage' },
      ],
    },
  ],
};

function monterSansReseau(initial: typeof AUTEUR | null) {
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
  return render(<FicheAuteur initial={initial as never} />);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Fiche publique d’un auteur — ce qu’un moteur voit', () => {
  it('affiche son nom sans attendre le réseau', () => {
    monterSansReseau(AUTEUR);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Barry, Abdoulaye');
  });

  it('et ses œuvres, qui sont ce qu’on vient chercher sur une fiche d’autorité', () => {
    monterSansReseau(AUTEUR);
    const texte = document.body.textContent ?? '';
    expect(texte).toContain('Justice coutumière');
    expect(texte).toContain('2022');
  });

  it('⚠ sans auteur initial : aucun nom inventé', () => {
    // C'est l'état « indisponible ». Rendre une fiche sans nom afficherait une
    // page qui affirme un contenu qu'elle n'a pas.
    monterSansReseau(null);
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(document.body.textContent).not.toContain('Barry');
  });
});

describe('L’enveloppe serveur de la fiche auteur', () => {
  const params = Promise.resolve({ id: 'a1' });

  it('auteur existant : il est passé à la fiche', async () => {
    vi.spyOn(serverApi, 'auteurPublic').mockResolvedValue({ etat: 'existe', auteur: AUTEUR });
    const el = (await FicheAuteurPage({ params })) as { props: { initial: unknown } };
    expect(el.props.initial).toBe(AUTEUR);
  });

  it('⚠ API injoignable : `null`, jamais un objet vide', async () => {
    // Un objet vide ferait rendre une fiche sans nom ; `null` laisse la fiche se
    // charger côté client et dire elle-même son échec.
    vi.spyOn(serverApi, 'auteurPublic').mockResolvedValue({ etat: 'indisponible', auteur: null });
    const el = (await FicheAuteurPage({ params })) as { props: { initial: unknown } };
    expect(el.props.initial).toBeNull();
    expect(introuvable).not.toHaveBeenCalled();
  });

  it('⚠ auteur introuvable : 404, et rien n’est rendu', async () => {
    introuvable.mockClear();
    vi.spyOn(serverApi, 'auteurPublic').mockResolvedValue({ etat: 'introuvable', auteur: null });
    await expect(FicheAuteurPage({ params })).rejects.toThrow('NEXT_NOT_FOUND');
    expect(introuvable).toHaveBeenCalledOnce();
  });

  it('⚠ une PANNE ne rend jamais 404 — c’est la moitié qui compte', async () => {
    introuvable.mockClear();
    vi.spyOn(serverApi, 'auteurPublic').mockResolvedValue({ etat: 'indisponible', auteur: null });
    await FicheAuteurPage({ params });
    expect(introuvable).not.toHaveBeenCalled();
  });
});

describe('Le titre d’onglet de la fiche auteur', () => {
  const params = Promise.resolve({ id: 'a1' });

  it('nomme l’auteur quand on le connaît', async () => {
    vi.spyOn(serverApi, 'auteurPublic').mockResolvedValue({ etat: 'existe', auteur: AUTEUR });
    expect(await generateMetadata({ params })).toEqual({ title: 'Barry, Abdoulaye' });
  });

  it('⚠ ne titre RIEN quand on ne sait pas — le segment reste vrai', async () => {
    // Titrer sur un état « indisponible » affirmerait ce qu'on n'a pas pu lire.
    vi.spyOn(serverApi, 'auteurPublic').mockResolvedValue({ etat: 'indisponible', auteur: null });
    expect(await generateMetadata({ params })).toEqual({});
  });

  it('⚠ c’est bien l’ÉTAT qui décide, pas la seule présence d’un nom', async () => {
    // ⚠ CE CAS A ÉTÉ AJOUTÉ APRÈS UN CONTRÔLE NÉGATIF QUI NE TOMBAIT PAS.
    //
    // Retirer `if (etat !== 'existe')` ne changeait rien : sur un état inconnu
    // `auteur` est nul aujourd'hui, donc le repli sur le nom couvrait le cas. Le
    // garde d'état était vrai et INEXERCÉ — une illusion de couverture.
    //
    // Ce cas fabrique la situation que le garde existe pour refuser : un état
    // qu'on ne sait pas lire, accompagné d'un contenu. Le jour où `auteurPublic`
    // rendra du partiel sur erreur — un cache, un repli, une lecture dégradée —
    // c'est cette assertion qui empêchera de titrer une page qu'on n'a pas lue.
    vi.spyOn(serverApi, 'auteurPublic').mockResolvedValue({
      etat: 'indisponible',
      auteur: AUTEUR,
    });
    expect(await generateMetadata({ params })).toEqual({});
  });
});
