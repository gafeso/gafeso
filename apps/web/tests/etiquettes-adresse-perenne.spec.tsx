/**
 * ⭐⭐ L'ADRESSE DU QR D'ÉTIQUETTE — la PÉRENNE, et le REFUS de la courte.
 *
 * ## ⚠ CE FICHIER A ÉPROUVÉ LA DÉCISION INVERSE PENDANT TROIS SEMAINES
 *
 * Du 11 octobre au 2 novembre 2026, il contenait ce témoin :
 *
 * > « ⭐ LA FORME COURTE NE PORTE PAS `resoudre` […] Ce témoin tombera le jour
 * >   où quelqu'un "harmonisera" l'étiquette sur l'adresse pérenne — ce qui
 * >   ferait monter le QR d'une version dans un carré qui ne grandit pas. »
 *
 * ⭐ **Il avait raison sur le mécanisme et il manquait le SEUIL.** Le QR monte
 * bien d'une version (5 → 6) et les modules rétrécissent bien (0,2889 →
 * 0,2653 mm). Aucune des deux valeurs ne franchit `LARGEUR_MODULE_MIN_MM`
 * (0,25 mm), la largeur minimale que le produit se donne déjà pour un code
 * imprimé. La décroissance était mesurée ; la LIMITE n'avait jamais été
 * consultée.
 *
 * ## ⭐ LA DÉCISION VIENT DU SUPPORT, pas de la mesure
 *
 * Jean, 2 novembre 2026 : *« ce qui est imprimé sur un support DURABLE doit
 * porter la forme PÉRENNE. La forme courte meurt avec le domaine ; une
 * étiquette collée sur un livre doit survivre à un changement de domaine ou
 * d'hébergeur. »*
 *
 * ## ⚠ CE QUE CE FICHIER MESURE, et comment
 *
 * Il ne relit PAS l'appel qui fabrique l'adresse — un repli ajouté trois
 * fonctions plus loin lui échapperait. Il relit **le tracé du QR réellement
 * dessiné** et l'identifie en le comparant à la matrice de chaque candidate.
 * C'est un garde d'EFFET : ce qui est encodé, quelle que soit la façon dont le
 * code y est arrivé.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { Etiquette } from '@/components/etiquette';
import { LIBELLES } from '@/lib/libelles';
import { moduleQrMm, qrAssezGros, matriceQr, traceDesModules } from '@/lib/qr';
import {
  adresseCourtePerenne,
  estFormeCourte,
  estFormePerenne,
} from '@/lib/url-publique';

const ID = '9de9b299-cde5-4acc-9e76-0e800ad94281';
const BASE = 'https://biblio.univ-exemple.bf';
const COURTE = `${BASE}/opac/${ID}`;
/** ⚠ CE QUE L'API SERT : la longue, percent-encodée. Mesurée le 2 nov. 2026. */
const SERVIE = `${BASE}/opac/resoudre/oai%3Aexemple%3A${ID}`;
const IDENTIFIANT = `oai:exemple:${ID}`;
/**
 * ⭐ CE QUE L'ÉTIQUETTE IMPRIME : la courte, deux-points BRUTS.
 * 73 caractères pour `zinda` contre 85 — v5 au lieu de v6, 0,2889 mm au lieu
 * de 0,2653. Décisions de Jean du 2 novembre 2026.
 */
const PERENNE = `${BASE}/p/${IDENTIFIANT}`;
const T = LIBELLES.etiquettes;

describe('⭐ adresseCourtePerenne — composée, et SANS repli', () => {
  it('⭐ compose l’origine CANONIQUE et l’identifiant, en deux-points bruts', () => {
    expect(adresseCourtePerenne(SERVIE, IDENTIFIANT)).toBe(PERENNE);
    // ⚠ les deux-points restent BRUTS : c'est la décision ①, 4 caractères gagnés
    expect(adresseCourtePerenne(SERVIE, IDENTIFIANT)).toContain('oai:exemple:');
    expect(adresseCourtePerenne(SERVIE, IDENTIFIANT)).not.toContain('%3A');
  });

  /*
   * ⚠ L'ORIGINE vient de la `publicUrl` SERVIE, jamais du navigateur : une
   * impression faite depuis un poste de développement graverait `localhost`
   * dans un livre.
   */
  it('⚠ prend l’origine de l’adresse SERVIE, pas celle du navigateur', () => {
    const a = adresseCourtePerenne('https://canonique.bf/opac/resoudre/x', IDENTIFIANT);
    expect(a).toBe(`https://canonique.bf/p/${IDENTIFIANT}`);
  });

  it('⚠ une publicUrl inanalysable ne donne PAS une adresse fabriquée', () => {
    expect(adresseCourtePerenne('pas une url', IDENTIFIANT)).toBeNull();
  });

  /*
   * ⭐⭐ LE TÉMOIN QUI PORTE LA DÉCISION : absente, on rend `null` — jamais la
   * forme courte. Un repli serait un « second meilleur choix » là où la
   * décision dit qu'il n'y en a pas, et il collerait dans un livre une adresse
   * qui meurt avec le domaine.
   */
  it('⚠ rend null plutôt qu’une forme courte quand une partie manque', () => {
    expect(adresseCourtePerenne(null, IDENTIFIANT)).toBeNull();
    expect(adresseCourtePerenne(SERVIE, null)).toBeNull();
    expect(adresseCourtePerenne(undefined, undefined)).toBeNull();
    // ⚠ les cas qui ressemblent le plus à une valeur sans en être une
    expect(adresseCourtePerenne('', IDENTIFIANT)).toBeNull();
    expect(adresseCourtePerenne(SERVIE, '   ')).toBeNull();
  });
});

describe('les deux formes se reconnaissent, dans les deux sens', () => {
  it('estFormeCourte discrimine', () => {
    expect(estFormeCourte(COURTE)).toBe(true);
    expect(estFormeCourte(PERENNE)).toBe(false);
    // ⚠ témoin d'absence sur la confusion PLAUSIBLE : la forme pérenne
    // contient elle aussi un uuid, et elle ne doit pas passer pour courte.
    expect(estFormeCourte(`${BASE}/opac/resoudre/oai:exemple:${ID}`)).toBe(false);
  });

  /*
   * ⚠ QUATRE ÉCRITURES à reconnaître, et aucune ne se retire jamais : les deux
   * ROUTES (`/p/` et `/opac/resoudre/`) × les deux écritures du deux-points.
   * Les QR émis avant le 2 novembre 2026 portent l'ancienne route.
   */
  it('estFormePerenne reconnaît les DEUX routes et les DEUX écritures', () => {
    expect(estFormePerenne(`${BASE}/p/oai:exemple:${ID}`)).toBe(true);
    expect(estFormePerenne(`${BASE}/p/oai%3Aexemple%3A${ID}`)).toBe(true);
    expect(estFormePerenne(`${BASE}/opac/resoudre/oai:exemple:${ID}`)).toBe(true);
    expect(estFormePerenne(`${BASE}/opac/resoudre/oai%3Aexemple%3A${ID}`)).toBe(true);
    expect(estFormePerenne(COURTE)).toBe(false);
  });
});

/**
 * ⭐⭐ LA GRANDEUR QUI DÉCIDE — mesurée, pas déclarée.
 *
 * Les chiffres sont ceux du 2 novembre 2026, sur une notice réelle, dans un
 * carré de 13 mm zone de silence comprise.
 */
describe('⭐⭐ le module imprimé, et le seuil du produit', () => {
  /*
   * ⭐ LE GAIN DE LA ROUTE COURTE, mesuré : la forme imprimée retombe en
   * VERSION 5 — la même que l'ancienne forme courte, alors qu'elle porte
   * l'identifiant pérenne entier.
   */
  it('⭐ la forme IMPRIMÉE tient à 13 mm, et retombe en version 5', () => {
    const courte = matriceQr(COURTE);
    const imprimee = matriceQr(PERENNE);
    const longue = matriceQr(SERVIE);
    expect(courte.version).toBe(5);
    expect(imprimee.version).toBe(5);
    expect(longue.version).toBe(6);
    expect(moduleQrMm(imprimee.taille)).toBeCloseTo(0.2889, 4);
    expect(moduleQrMm(longue.taille)).toBeCloseTo(0.2653, 4);
    expect(qrAssezGros(imprimee.taille)).toBe(true);
  });

  /*
   * ⭐ LE TÉMOIN D'ABSENCE : le seuil doit savoir dire NON. Sans lui, un
   * `qrAssezGros` qui rendrait toujours `true` serait indiscernable d'un seuil
   * juste — et plus rassurant, puisqu'il n'abandonnerait jamais rien.
   *
   * ⚠ Version 7 = 45 modules + 8 de silence = 53 → 13/53 = 0,2453 mm.
   */
  it('⚠ et il REFUSE la version 7 — 0,2453 mm', () => {
    const taille7 = 4 * 7 + 17;
    expect(moduleQrMm(taille7)).toBeCloseTo(0.2453, 4);
    expect(qrAssezGros(taille7)).toBe(false);
    // la borne structurelle, écrite : version ≤ 6 ⟺ taille ≤ 44
    expect(qrAssezGros(4 * 6 + 17)).toBe(true);
  });
});

/* ────────────────────── LE GARDE D'EFFET ────────────────────── */

/**
 * ⭐⭐ CE QUE L'ÉTIQUETTE ENCODE RÉELLEMENT — identifié depuis son TRACÉ.
 *
 * ⚠ On ne lit pas le prop, on ne relit pas l'appel : on relit le `path` du SVG
 * dessiné et on cherche laquelle des candidates produit exactement cette
 * matrice. Un repli ajouté n'importe où dans la chaîne serait vu ici.
 */
function adresseEncodee(candidates: string[]): string | null {
  const svg = document.querySelector('svg[viewBox$="45 45"], svg[viewBox$="49 49"], svg[viewBox$="53 53"]');
  const d = svg?.querySelector('path')?.getAttribute('d');
  if (!d) return null;
  for (const c of candidates) {
    if (traceDesModules(matriceQr(c)) === d) return c;
  }
  return null;
}

describe('⭐⭐ l’épreuve qui REFUSE la forme courte dans les étiquettes', () => {
  const poser = (url: string | null) =>
    render(
      <Etiquette
        barcode="BIB-000229"
        cote="004 GAF"
        titre="Gafeso — Guide d’utilisation"
        etablissement="Université d’Exemple"
        urlNotice={url}
      />,
    );

  it('⭐ encode la forme PÉRENNE, et elle est identifiée depuis le tracé', () => {
    poser(PERENNE);
    const encodee = adresseEncodee([PERENNE, COURTE]);
    expect(encodee, 'aucune candidate ne produit le tracé dessiné').toBe(PERENNE);
  });

  /*
   * ⭐⭐ LE REFUS, et c'est l'épreuve que Jean a demandée : pas un commentaire.
   * Elle porte sur l'EFFET — ce qu'un QR d'étiquette encode —, donc elle tombe
   * quel que soit le chemin par lequel une forme courte reviendrait.
   */
  it('⭐⭐ REFUSE : aucune étiquette n’encode une forme courte', () => {
    poser(PERENNE);
    const encodee = adresseEncodee([PERENNE, COURTE]);
    expect(encodee).not.toBeNull();
    expect(estFormeCourte(encodee as string)).toBe(false);
    expect(estFormePerenne(encodee as string)).toBe(true);
  });

  /*
   * ⚠ ET SANS ADRESSE PÉRENNE : aucun QR, et le motif se DIT. Un QR qui
   * disparaît sans un mot est une dégradation silencieuse.
   */
  it('⚠ sans adresse pérenne : AUCUN QR, et le motif est dit', () => {
    poser(null);
    expect(adresseEncodee([PERENNE, COURTE])).toBeNull();
    expect(screen.queryByText(T.qrSansAdresse)).not.toBeNull();
  });
});

/**
 * ⭐⭐ ET LA MÊME ÉPREUVE SUR L'ÉCRAN — parce que celle du composant NE SUFFIT PAS.
 *
 * ## 🔴 CE QUE J'AVAIS ÉCRIT D'ABORD, ET POURQUOI C'ÉTAIT FAUX
 *
 * Les cas ci-dessus passent `PERENNE` à `Etiquette` à la main. Une forme courte
 * réintroduite dans l'ÉCRAN — un repli dans `adresseCourtePerenne`, un
 * `shortUrl` repris dans la page — ne les ferait donc **pas tomber** : le jeu
 * d'essai n'atteint pas le chemin qu'on prétend garder.
 *
 * ⭐ Ce bloc monte la PAGE avec la réponse que les routes servent VRAIMENT,
 * mesurée le 2 novembre 2026 par le chemin normal :
 *
 * | La route | Ce qu'elle sert |
 * |---|---|
 * | `GET /cataloging/records/:id` | 35 clés, **aucune** d'adressage (seul `coverUrl`) |
 * | `GET /opac/records/:id` | `identifiantPerenne`, `publicUrl` (percent-encodée), `shortUrl` |
 *
 * ⚠ La doublure résout PAR CHEMIN, et elle LÈVE sur un chemin non prévu : un
 * repli silencieux transformerait un oubli de doublure en défaut apparent du
 * produit.
 */
describe('⭐⭐ l’ÉCRAN encode la forme pérenne — l’épreuve sur le chemin réel', () => {
  async function monterEcran(publicUrl: string | null) {
    // ⚠ `publicUrl` est ce que l'API SERT (forme longue) ; l'écran compose /p/
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
      ApiError: class extends Error {},
      api: async (chemin: string) => {
        if (chemin === `/cataloging/records/${ID}`) {
          // ⚠ AUCUNE clé d'adressage — c'est ce que la route sert vraiment
          return {
            id: ID,
            title: 'Gafeso — Guide d’utilisation',
            items: [{ id: 'i1', barcode: 'BIB-000229', callNumber: '004 GAF' }],
          };
        }
        /*
         * ⚠ LA ROUTE SERT LES DEUX, et la doublure aussi — sinon le contrôle
         * négatif serait IMPOSSIBLE : une page qui reprendrait `shortUrl` ne
         * trouverait rien et retomberait sur « aucun QR », ce qui ressemble à
         * un refus correct. La doublure doit offrir la tentation.
         */
        if (chemin === `/opac/records/${ID}`)
          return { publicUrl, identifiantPerenne: publicUrl ? IDENTIFIANT : null, shortUrl: COURTE };
        if (chemin === '/tenancy/current') return { name: 'Université d’Exemple' };
        throw new Error(`requête non couverte — ${chemin}`);
      },
    }));
    const { default: Page } = await import('@/app/admin/etiquettes/page');
    render(<Page />);
    // ⚠ On attend une ancre qui DOIT être là : une assertion d'absence
    // précédée d'une attente qui se résout tout de suite ne mesure rien.
    await screen.findByText('004 GAF');
  }

  it('⭐⭐ REFUSE : ce que la planche encode n’est JAMAIS une forme courte', async () => {
    await monterEcran(SERVIE);
    const encodee = adresseEncodee([PERENNE, SERVIE, COURTE]);
    expect(encodee, 'aucune candidate ne produit le tracé dessiné').not.toBeNull();
    expect(estFormeCourte(encodee as string)).toBe(false);
    expect(estFormePerenne(encodee as string)).toBe(true);
    // ⭐ et c'est bien la COURTE qui est imprimée, pas celle que l'API sert
    expect(encodee).toBe(PERENNE);
    expect(encodee).not.toBe(SERVIE);
    expect(encodee).toContain('/p/oai:');
  });

  it('⚠ et quand l’OPAC ne sert rien : aucun QR, et le refus se dit', async () => {
    await monterEcran(null);
    expect(adresseEncodee([PERENNE, SERVIE, COURTE])).toBeNull();
    // ⚠ l'écran porte l'EXPLICATION, l'étiquette le motif COURT — deux textes,
    // parce qu'un carré de 13 mm n'imprime pas une phrase de soixante mots.
    expect(screen.queryByText(T.qrSansAdressePerenne)).not.toBeNull();
    expect(screen.queryByText(T.qrSansAdresse)).not.toBeNull();
  });
});

/**
 * ⚠ CE QUE LES TEXTES DOIVENT DIRE — assertions sur leur CONTENU, séparées de
 * leur emploi. « Un test qui restate la constante ne voit pas qu'elle est
 * devenue inutile. »
 */
describe('les textes portent leur propriété', () => {
  it('le refus dit POURQUOI et ce qui marche encore', () => {
    expect(T.qrSansAdressePerenne).toMatch(/pérenne/i);
    expect(T.qrSansAdressePerenne).toMatch(/ne se reprend pas|se colle/i);
    // ⚠ il doit nommer la SORTIE : la planche reste utile sans QR
    expect(T.qrSansAdressePerenne).toMatch(/cote|code-barres/i);
    // ⚠ et il ne doit pas accuser : le champ n'est pas encore servi, c'est tout
    expect(T.qrSansAdressePerenne).not.toMatch(/erreur|panne|signalez/i);
  });

  it('⚠ le motif IMPRIMÉ est court — il tient sur 13 mm', () => {
    expect(T.qrSansAdresse.length).toBeLessThan(40);
    expect(T.qrSansAdresse).toMatch(/pérenne/i);
    // ⚠ et il n'est PAS l'explication longue : les deux ne se confondent pas
    expect(T.qrSansAdresse).not.toBe(T.qrSansAdressePerenne);
  });

  it('le refus de GRANDEUR nomme le chiffre et le geste', () => {
    const texte = T.qrTropFin(0.2453);
    expect(texte).toContain('0,245');
    expect(texte).toMatch(/0,25/);
    expect(texte).toMatch(/adresse de cette école|trop longue/i);
  });
});
