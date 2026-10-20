import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('@/lib/api', async () => {
  const reel = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...reel, api: (...a: unknown[]) => api(...a) };
});
vi.mock('@/lib/session', async () => {
  const reel = await vi.importActual<typeof import('@/lib/session')>('@/lib/session');
  return { ...reel, getUser: () => ({ id: 'u1', email: 'etu@exemple.test', firstName: 'Awa', lastName: 'Traoré', role: 'STUDENT', className: 'L1_DROIT' }) };
});
vi.mock('next/navigation', () => {
  const routeur = { push: () => {}, replace: () => {}, refresh: () => {}, back: () => {} };
  return { useParams: () => ({ id: 'n1' }), useRouter: () => routeur, usePathname: () => '/opac/n1/lire' };
});

/*
 * ⚠ LE LECTEUR PDF EST DOUBLÉ, et c'est voulu : pdf.js est chargé NATIVEMENT
 * par le navigateur (`import()` avec `webpackIgnore`), ce que jsdom ne sait pas
 * faire. Ce qu'on éprouve n'est pas le rendu d'un PDF — c'est le CONTRAT entre
 * la page et le lecteur : combien de fois la page accepte de resigner une URL.
 *
 * La doublure rejoue donc exactement la logique du vrai lecteur : elle tente,
 * et sur refus elle appelle `redemanderUrl` UNE fois.
 */
const tentatives: string[] = [];
let refuser: (adresse: string) => boolean = () => true;

/** ⚠ Un plafond DUR : un test qui boucle ne doit jamais suspendre la suite. */
const PLAFOND = 12;

vi.mock('@/components/pdf-reader', () => ({
  PdfReader: ({ url, redemanderUrl }: { url: string; redemanderUrl?: () => Promise<string | null> }) => {
    /*
     * ⚠⚠ CETTE DOUBLURE EST ADVERSE, ET ELLE DOIT L'ÊTRE.
     *
     * Ma première version ne redemandait qu'UNE fois — elle portait donc
     * elle-même la borne qu'on prétend éprouver, et retirer `redemandeFaite`
     * de la page laissait les trois cas VERTS. Le jeu d'essai n'atteignait pas
     * le chemin.
     *
     * Celle-ci redemande TANT QU'ON LUI DONNE une URL : c'est le comportement
     * d'un lecteur qui se rejouerait lui-même, et c'est exactement ce contre
     * quoi la borne existe. Avec elle, deux tentatives ; sans elle, le plafond.
     */
    const essayer = async () => {
      let adresse = url;
      for (let i = 0; i < PLAFOND; i += 1) {
        tentatives.push(adresse);
        if (!refuser(adresse)) return;
        const fraiche = await redemanderUrl?.();
        if (!fraiche) return;
        adresse = fraiche;
      }
    };
    void essayer();
    /*
     * ⚠ UN NOM ACCESSIBLE, PAS UN `data-testid`. Un crochet de test ne dit rien
     * d'un écran ; `cibler-par-le-nom-accessible` le refuse, et il a raison —
     * ce que le test ne sait pas atteindre, une technologie d'assistance ne le
     * sait pas non plus.
     */
    return (
      <div role="document" aria-label="Lecteur de document">
        {url}
      </div>
    );
  },
}));
vi.mock('@/components/epub-reader', () => ({ EpubReader: () => <div /> }));

import LirePage from '@/app/opac/[id]/lire/page';

const CHARGE = (n: number) => ({
  url: `https://stockage.test/doc.pdf?sig=${n}`,
  fileFormat: 'PDF' as const,
  expiresInSeconds: 300,
  title: 'Textiles et motifs',
});

const souffler = (ms = 60) => new Promise((r) => setTimeout(r, ms));

describe('la redemande d’URL de lecture', () => {
  beforeEach(() => {
    api.mockReset();
    tentatives.length = 0;
    refuser = () => true;
  });

  it('⚠ URL PÉRIMÉE : une redemande, une nouvelle tentative, et la page s’affiche', async () => {
    let n = 0;
    api.mockImplementation(() => Promise.resolve(CHARGE(++n)));
    // La PREMIÈRE adresse est refusée, la seconde passe.
    refuser = (adresse) => adresse.endsWith('sig=1');

    render(<LirePage />);
    await screen.findByRole('document', { name: 'Lecteur de document' });
    await souffler(120);

    expect(api, 'une seule redemande : deux appels à /read en tout').toHaveBeenCalledTimes(2);
    expect(tentatives, 'la seconde tentative emploie l’URL FRAÎCHE').toEqual([
      'https://stockage.test/doc.pdf?sig=1',
      'https://stockage.test/doc.pdf?sig=2',
    ]);
  });

  it('⚠ SECONDE TENTATIVE REFUSÉE : on s’arrête — pas de boucle', async () => {
    let n = 0;
    api.mockImplementation(() => Promise.resolve(CHARGE(++n)));
    refuser = () => true; // tout est refusé

    render(<LirePage />);
    await screen.findByRole('document', { name: 'Lecteur de document' });
    await souffler(200);

    /*
     * ⭐ LE FAIT QUI COMPTE : le COMPTE, pas la présence d'un message. Une
     * assertion sur le texte d'erreur passerait aussi sur une boucle infinie
     * qui finit par afficher le même message — c'est le nombre d'appels qui
     * distingue « il s'arrête » de « il recommence ».
     */
    expect(api, 'deux appels AU PLUS : l’original et l’unique redemande').toHaveBeenCalledTimes(2);
    expect(tentatives.length, 'deux tentatives de fichier, pas davantage').toBe(2);
  });

  it('⚠ URL ACCEPTÉE DU PREMIER COUP : aucune redemande', async () => {
    api.mockResolvedValue(CHARGE(1));
    refuser = () => false;

    render(<LirePage />);
    await screen.findByRole('document', { name: 'Lecteur de document' });
    await souffler(120);

    // ⚠ TÉMOIN D'ABSENCE : sans lui, une page qui redemanderait TOUJOURS
    // passerait les deux cas précédents.
    expect(api, 'le cas nominal ne doit coûter qu’un seul appel').toHaveBeenCalledTimes(1);
    expect(tentatives).toEqual(['https://stockage.test/doc.pdf?sig=1']);
  });
});
