/**
 * ⭐⭐ L'ADRESSE DU QR D'ÉTIQUETTE — la COURTE, et ce que l'écran DIT quand il
 * ne l'a pas.
 *
 * ## ⚠ LA DÉCISION, et le chiffre qui l'a motivée
 *
 * Deux adresses, deux supports (décision du 11 octobre 2026) :
 *
 * | Le support | L'adresse |
 * |---|---|
 * | affiche A4, bloc « Partager » | `publicUrl` — PÉRENNE |
 * | **étiquette collée dans un livre** | **`shortUrl` — COURTE** |
 *
 * Motif mesuré : le QR d'étiquette est un carré FIXE de 13 mm, et chaque
 * caractère d'adresse rétrécit ses modules — 0,289 mm pour `/opac/<uuid>`,
 * 0,265 mm pour la forme pérenne, 0,228 mm avec un nom d'école long.
 *
 * ## 🔴 ET LA ROUTE NE SERT PAS ENCORE CE CHAMP
 *
 * Mesuré par le chemin normal : `GET /cataloging/records/:id` ne porte AUCUN
 * des trois champs d'adressage. Le champ précédemment déclaré par l'écran —
 * `publicUrl` — n'avait JAMAIS été servi : le repli sur l'origine du navigateur
 * s'appliquait donc toujours, en silence, sur des QR qu'on colle dans des
 * livres.
 *
 * ⭐ C'est pourquoi ce fichier éprouve l'avertissement DANS LES DEUX SENS. Un
 * avertissement qui ne sait pas disparaître devient du bruit, et « le bruit use
 * ce qui doit être lu le jour où il compte ».
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { LIBELLES } from '@/lib/libelles';
import { adresseCourteDuQr, adresseCourteEstServie } from '@/lib/url-publique';

const ID = '9de9b299-cde5-4acc-9e76-0e800ad94281';
const COURTE = `https://biblio.univ-exemple.bf/opac/${ID}`;
const T = LIBELLES.etiquettes;

describe('⭐ adresseCourteDuQr — la forme courte, et son repli', () => {
  it('rend l’adresse servie quand le catalogue la donne', () => {
    expect(adresseCourteDuQr(ID, COURTE)).toBe(COURTE);
  });

  /*
   * ⚠ Témoin sur la chaîne VIDE : `''` est une valeur, pas une adresse. Sans ce
   * cas, un champ servi vide produirait un QR vers `https:///opac/…`.
   */
  it('⚠ une chaîne vide n’est PAS une adresse', () => {
    expect(adresseCourteDuQr(ID, '', 'https://b.exemple.bf')).toBe(
      `https://b.exemple.bf/opac/${ID}`,
    );
    expect(adresseCourteDuQr(ID, '   ', 'https://b.exemple.bf')).toBe(
      `https://b.exemple.bf/opac/${ID}`,
    );
  });

  it('retombe sur l’origine quand le champ est absent', () => {
    expect(adresseCourteDuQr(ID, null, 'https://b.exemple.bf')).toBe(
      `https://b.exemple.bf/opac/${ID}`,
    );
  });

  /**
   * ⭐ LA FORME COURTE NE PORTE PAS `resoudre`, et c'est tout l'objet de la
   * décision. Ce témoin tombera le jour où quelqu'un « harmonisera » l'étiquette
   * sur l'adresse pérenne — ce qui ferait monter le QR d'une version dans un
   * carré qui ne grandit pas.
   */
  it('⚠ la forme de repli est la COURTE, jamais celle de résolution', () => {
    const a = adresseCourteDuQr(ID, null, 'https://b.exemple.bf');
    expect(a).not.toContain('/opac/resoudre/');
    expect(a).toContain(`/opac/${ID}`);
  });

  it('adresseCourteEstServie discrimine dans les deux sens', () => {
    expect(adresseCourteEstServie(COURTE)).toBe(true);
    expect(adresseCourteEstServie(null)).toBe(false);
    expect(adresseCourteEstServie(undefined)).toBe(false);
    // ⚠ le cas qui ressemble le plus à une adresse sans en être une
    expect(adresseCourteEstServie('  ')).toBe(false);
  });
});

/**
 * ⭐⭐ ET L'AVERTISSEMENT SE MESURE SUR L'ÉCRAN, dans les deux sens.
 *
 * ⚠ L'écran est monté avec la réponse que la route sert VRAIMENT — doublure
 * écrite d'après la MESURE, pas d'après le code de l'API. C'est exactement ce
 * qui a manqué à `/opac/resoudre` le même jour : une doublure qui livrait la
 * valeur souhaitée au lieu de la valeur réelle a caché un 404 pour tout le
 * monde.
 */
describe('⭐⭐ l’écran DIT l’adresse, et avertit quand elle vient du navigateur', () => {
  async function monter(shortUrl?: string | null) {
    vi.resetModules();
    vi.doMock('next/navigation', () => ({
      useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
      usePathname: () => '/admin/etiquettes',
      useSearchParams: () => new URLSearchParams(`recordIds=${ID}`),
    }));
    vi.doMock('@/lib/functions', () => ({
      useMyFunctions: () => ({ functions: ['catalogue.gerer'] }),
    }));
    vi.doMock('@/lib/modules-actifs', () => ({
      useModulesActifs: () => ({ modulesActifs: null }),
    }));
    vi.doMock('@/lib/api', () => ({
      api: async () => ({
        id: ID,
        title: 'Gafeso — Guide d’utilisation',
        items: [{ id: 'i1', barcode: 'BIB-000229', callNumber: '004 GAF' }],
        ...(shortUrl === undefined ? {} : { shortUrl }),
      }),
    }));
    const { default: Page } = await import('@/app/admin/etiquettes/page');
    render(<Page />);
    // ⚠ On attend une ancre qui DOIT être là, jamais le vide : une assertion
    // d'absence précédée d'une attente qui se résout tout de suite ne mesure
    // rien.
    await screen.findByText(new RegExp(T.adresseDuQr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  it('🔴 sans `shortUrl` — ce que la route sert aujourd’hui — il AVERTIT', async () => {
    await monter(undefined);
    expect(screen.queryByText(T.adresseNonCanonique)).not.toBeNull();
  });

  it('⭐ avec `shortUrl` servi, l’avertissement DISPARAÎT et l’adresse est la sienne', async () => {
    await monter(COURTE);
    expect(screen.queryByText(T.adresseNonCanonique)).toBeNull();
    expect(screen.getByText(new RegExp(COURTE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeTruthy();
  });
});

/**
 * ⚠ CE QUE LE TEXTE DOIT DIRE — une assertion sur son CONTENU, séparée de son
 * emploi. « Un test qui restate la constante ne voit pas qu'elle est devenue
 * inutile. »
 */
describe('l’avertissement porte sa propriété', () => {
  it('dit d’où vient l’adresse ET que l’étiquette ne se reprend pas', () => {
    expect(T.adresseNonCanonique).toMatch(/ce navigateur/i);
    expect(T.adresseNonCanonique).toMatch(/ne se reprend pas|se colle/i);
    // ⚠ Il ne doit PAS prétendre que c'est un défaut du catalogue à signaler :
    // le champ n'est simplement pas encore servi.
    expect(T.adresseNonCanonique).not.toMatch(/erreur|panne|signalez/i);
  });
});
