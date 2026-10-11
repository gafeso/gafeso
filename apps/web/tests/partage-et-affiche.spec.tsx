/**
 * LE BLOC « PARTAGER » ET L'AFFICHE A4 — ce que l'écran affirme, et ce qu'il
 * n'affirme pas.
 *
 * ## ⭐ LA RÈGLE QUI TRAVERSE CE FICHIER
 *
 * Un QR code est `aria-hidden` : il est **inutilisable pour qui ne voit pas**.
 * Ce qui l'autorise est que son contenu soit affiché EN TEXTE à côté de lui —
 * la même règle que pour la couverture composée, et elle se mesure par l'EFFET :
 * on retire le SVG et on relit ce qui RESTE.
 *
 * ⚠ ET ELLE A UNE SECONDE RAISON, PROPRE AU QR. `publicUrl` n'est pas servi par
 * l'API (mesuré le 11 octobre 2026, trente et une clés) : l'adresse est dérivée
 * de l'origine du navigateur. Une affiche imprimée depuis une adresse INTERNE
 * encoderait celle-là, et le QR serait inutilisable dehors. **L'adresse en clair
 * est ce qui permet à un humain de le voir avant de coller l'affiche dans un
 * couloir** — donc ce n'est pas un ornement, c'est le garde-fou.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

import { BlocPartage } from '@/components/bloc-partage';
import { LIBELLES } from '@/lib/libelles';
import { lienApplication, urlPubliqueDeNotice } from '@/lib/url-publique';

const T = LIBELLES.partage;
const ID = '9de9b299-cde5-4acc-9e76-0e800ad94281';

/**
 * ⚠ L'ORIGINE SE LIT, ELLE NE SE SUPPOSE PAS. J'avais écrit
 * `http://localhost` ; jsdom en sert une autre, et les cinq cas sont tombés
 * sur une chaîne que personne n'affichait. On demande au document.
 */
const ATTENDUE = `${window.location.origin}/opac/${ID}`;

/**
 * ⚠ L'AGENT UTILISATEUR SE REMPLACE, IL NE SE DEVINE PAS. `navigator.userAgent`
 * est en lecture seule en jsdom : on le redéfinit, et on le REND après chaque
 * cas — sans quoi un cas « Android » contaminerait les suivants, et le témoin
 * d'absence du bouton serait vert pour la mauvaise raison.
 */
const UA_ORIGINE = navigator.userAgent;
function agent(ua: string) {
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
}
beforeEach(() => agent(UA_ORIGINE));
afterEach(() => {
  Object.defineProperty(navigator, 'userAgent', { value: UA_ORIGINE, configurable: true });
  vi.unstubAllGlobals();
});

const ANDROID =
  'Mozilla/5.0 (Linux; Android 13; SM-A135F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36';
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const svgDuQr = () => document.querySelector('svg[aria-hidden="true"]');

describe('le bloc « Partager »', () => {
  it('rend un QR code et l’adresse EN CLAIR', async () => {
    render(<BlocPartage recordId={ID} />);
    const url = await waitFor(() => screen.getByText(ATTENDUE));
    expect(url).toBeTruthy();
    expect(svgDuQr(), 'aucun QR rendu').toBeTruthy();
  });

  /**
   * ⭐ LA RÈGLE QUI AUTORISE `aria-hidden`, MESURÉE PAR SON EFFET. On retire le
   * SVG et on relit la page : l'adresse doit RESTER. Aucune forme n'est
   * inspectée — c'est ce qui subsiste qui est compté.
   */
  it('⚠ l’adresse SURVIT au retrait du QR — sinon elle n’existe que pour l’œil', async () => {
    render(<BlocPartage recordId={ID} />);
    await waitFor(() => expect(svgDuQr()).toBeTruthy());
    const attendue = ATTENDUE;

    svgDuQr()!.remove();

    expect(
      (document.body.textContent ?? '').replace(/\s+/g, ' '),
      '⚠ l’adresse n’est portée que par le QR, qui est aria-hidden : invisible ' +
        'pour un lecteur d’écran, et invérifiable par un humain avant impression',
    ).toContain(attendue);
  });

  /**
   * ⭐ L'INVARIANT QUI COMPTE : **un QR existe SI ET SEULEMENT SI l'adresse est
   * affichée.** C'est la forme observable de « pas de QR tant qu'on ne sait
   * pas » — et c'est la bonne, parce que ce qui est dangereux n'est pas
   * l'instant de chargement, c'est un QR dont l'adresse n'est pas lisible.
   *
   * ⚠ J'avais d'abord écrit un cas sur l'état de chargement. Il ne mesure
   * rien : React 18 vide l'effet avant que `render` ne rende la main, donc
   * « Chargement… » n'est plus là quand on le cherche. Un test qui attend un
   * état qu'il ne peut pas atteindre est vert ou rouge pour une raison qui
   * n'est pas la sienne.
   *
   * ⚠ Et le danger est RÉEL : `matriceQr('')` rend un QR parfaitement VALIDE
   * d'une chaîne vide. Il se scanne, et il ne mène nulle part.
   */
  it('⚠ un QR n’existe QUE si son adresse est affichée', async () => {
    render(<BlocPartage recordId={ID} />);
    await waitFor(() => expect(svgDuQr()).toBeTruthy());
    expect(screen.getByText(ATTENDUE)).toBeTruthy();
    // Et l'adresse n'est pas vide : un QR d'une chaîne vide est un faux qui se
    // scanne.
    expect(ATTENDUE).not.toMatch(/\/opac\/$/);
    expect(ATTENDUE.length).toBeGreaterThan(20);
  });

  it('le bouton d’affiche mène à /affiche/<id>, dans un nouvel onglet', async () => {
    render(<BlocPartage recordId={ID} />);
    const lien = await waitFor(() => screen.getByRole('link', { name: T.imprimer }));
    expect(lien.getAttribute('href')).toBe(`/affiche/${ID}`);
    expect(lien.getAttribute('target')).toBe('_blank');
    // ⚠ `noopener` : un onglet ouvert sans lui garde une poignée sur le nôtre.
    expect(lien.getAttribute('rel')).toContain('noopener');
  });
});

describe('le bouton « Ouvrir dans l’app » — Android SEULEMENT', () => {
  it('sur Android : il est là, et il porte le lien gafeso://', async () => {
    agent(ANDROID);
    render(<BlocPartage recordId={ID} />);
    const lien = await waitFor(() => screen.getByRole('link', { name: T.ouvrirDansApp }));
    expect(lien.getAttribute('href')).toBe(
      lienApplication(ATTENDUE),
    );
  });

  /**
   * ⭐ ET IL DIT SA CONDITION, parce qu'un lien `gafeso://` sans application
   * installée ne fait RIEN — ni erreur, ni message. C'est « un bouton sans
   * effet », que ce dépôt refuse d'afficher, et on ne peut PAS détecter
   * l'installation depuis une page web. Dire la condition est tout ce qui
   * reste — « une règle conditionnelle se lit à l'écran, elle ne se découvre
   * pas par un refus ».
   */
  it('⚠ et il DIT qu’il suppose l’application installée', async () => {
    agent(ANDROID);
    render(<BlocPartage recordId={ID} />);
    await waitFor(() => expect(screen.getByText(T.ouvrirDansAppAide)).toBeTruthy());
    expect(T.ouvrirDansAppAide).toMatch(/install/i);
    // Et il dit que la page marche SANS : c'est la seconde moitié.
    expect(T.ouvrirDansAppAide).toMatch(/reste utilisable|sans/i);
  });

  it('⚠ sur iPhone : PAS de bouton — un lien Android n’y aboutirait pas', async () => {
    agent(IPHONE);
    render(<BlocPartage recordId={ID} />);
    // Ancre d'abord : on attend ce qui DOIT être là avant d'affirmer une absence.
    await waitFor(() => expect(screen.getByRole('link', { name: T.imprimer })).toBeTruthy());
    expect(screen.queryByRole('link', { name: T.ouvrirDansApp })).toBeNull();
    expect(screen.queryByText(T.ouvrirDansAppAide)).toBeNull();
  });

  /**
   * ⭐⭐ LA PAGE RESTE PLEINEMENT UTILISABLE SANS L'APPLICATION — et ce n'est
   * pas une intention, c'est une propriété : aucun chemin de la page ne passe
   * par le lien `gafeso://`. Le bouton est une COMMODITÉ AJOUTÉE.
   */
  it('⚠ sur Android, TOUT ce qui existe ailleurs existe encore', async () => {
    agent(ANDROID);
    render(<BlocPartage recordId={ID} />);
    await waitFor(() => expect(screen.getByRole('link', { name: T.ouvrirDansApp })).toBeTruthy());
    // Le QR, l'adresse et l'affiche : rien n'a été remplacé par le lien d'app.
    expect(svgDuQr()).toBeTruthy();
    expect(screen.getByText(ATTENDUE)).toBeTruthy();
    expect(screen.getByRole('link', { name: T.imprimer })).toBeTruthy();
    // Témoin de COMPTE : exactement DEUX liens, et le lien d'app n'en remplace
    // aucun — il s'ajoute.
    expect(document.querySelectorAll('a')).toHaveLength(2);
  });
});

describe('les textes portent leur propriété', () => {
  it('⚠ la phrase de l’affiche est celle que le lot demande, mot pour mot', () => {
    expect(LIBELLES.affiche.scannez).toBe('Scannez pour lire ce document');
  });

  it('⚠ l’aide d’impression DIT ce qui se perd en noir et blanc', () => {
    // Les navigateurs n'impriment pas les fonds par défaut, et la couverture
    // composée EST un fond. Le dire évite qu'on croie l'affiche cassée.
    expect(LIBELLES.affiche.aideImpression).toMatch(/noir et blanc/i);
    expect(LIBELLES.affiche.aideImpression).toMatch(/fonds? de couleur/i);
  });

  it('⚠ et l’affiche DIT son indisponibilité au lieu d’une feuille muette', () => {
    // Sans titre ni adresse, ce n'est pas une affiche. Et le texte ne dit PAS
    // que la notice a disparu — on ne déclare pas disparu ce qu'on n'a pas
    // pu joindre.
    expect(LIBELLES.affiche.indisponible).toMatch(/injoignable/i);
    expect(LIBELLES.affiche.indisponible).not.toMatch(/supprim|n’existe pas|introuvable/i);
  });
});
