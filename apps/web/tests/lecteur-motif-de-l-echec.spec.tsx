/**
 * ⭐⭐ LE LECTEUR DISTINGUE UN REFUS D'ORIGINE D'UNE PANNE RÉSEAU.
 *
 * ## 🔴 CE QU'UN MESSAGE MUET A COÛTÉ : DOUZE JOURS
 *
 * Le 2 novembre 2026, après une migration de MinIO vers Garage, le navigateur
 * refusait les PDF faute d'`Access-Control-Allow-Origin`. Le lecteur disait
 * *« Le document n'a pas pu être chargé »* — honnête, calme, et MUET. La suite
 * de tests était verte, la migration était juste, et la lecture impossible.
 *
 * Jean, 2 novembre 2026 : *« un lecteur qui aurait nommé le refus d'origine
 * nous aurait fait gagner douze jours. L'auto-contrôle ne tourne qu'à
 * l'installation ; la panne, elle, peut naître plus tard — un domaine qui
 * change, un tenant qu'on ajoute. »*
 *
 * ## ⚠ ET L'ERREUR NE LES DISTINGUE PAS
 *
 * Un blocage CORS et une coupure réseau lèvent **le même `TypeError`**, sans
 * détail — par conception du navigateur. Ce fichier éprouve donc le
 * DISCRIMINANT : au moment de l'échec, on redemande notre propre origine. Si
 * elle répond, le réseau est debout.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { classerEchec, RefusDeLUrl } from '@/components/pdf-reader';
import { LIBELLES } from '@/lib/libelles';

const NOTRE_ORIGINE = 'https://biblio.univ-exemple.bf';
const STOCKAGE = 'https://stockage.exemple.net/digital-copies/x.pdf?sig=abc';
const CHEZ_NOUS = `${NOTRE_ORIGINE}/api/opac/documents/x.pdf`;

/** ⚠ Le `TypeError` exact qu'un `fetch` bloqué lève — ni plus, ni moins. */
const echecDeFetch = () => new TypeError('Failed to fetch');

function poser({ enLigne = true, sondeRepond = true }: { enLigne?: boolean; sondeRepond?: boolean }) {
  vi.stubGlobal('location', { ...window.location, origin: NOTRE_ORIGINE, href: `${NOTRE_ORIGINE}/opac/x/lire` });
  vi.stubGlobal('navigator', { ...window.navigator, onLine: enLigne });
  /*
   * ⚠ La doublure déclare son ARGUMENT. Sans lui, `mock.calls[0][0]` ne
   * compile pas — vitest transpile sans vérifier, `tsc` refuse, et c'est `tsc`
   * qui a raison : « une suite verte ne dit rien des types ».
   */
  const sonde = vi.fn(async (cible: RequestInfo | URL) => {
    void cible;
    if (!sondeRepond) throw echecDeFetch();
    return new Response('ok');
  });
  vi.stubGlobal('fetch', sonde);
  return sonde;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('⭐⭐ le discriminant : notre propre origine répond-elle ?', () => {
  it('⭐ réseau DEBOUT + document d’une autre origine → « origine »', async () => {
    const sonde = poser({});
    expect(await classerEchec(echecDeFetch(), STOCKAGE)).toBe('origine');
    // ⚠ et la sonde a bien été TIRÉE, sur NOTRE origine : sinon rien n'est mesuré
    expect(sonde).toHaveBeenCalledTimes(1);
    expect(String(sonde.mock.calls[0][0])).toContain('/api/');
  });

  /*
   * ⭐⭐ LES TROIS CAS QUI DOIVENT RENDRE « reseau », et chacun écarte un faux.
   * Le troisième est le plus important : quand la sonde échoue, les deux
   * explications restent possibles — on rend le motif le moins ACCUSATEUR,
   * parce que dire « le serveur a refusé » sur une coupure enverrait une
   * bibliothécaire chercher une panne qui n'existe pas.
   */
  it('⚠ appareil hors ligne → « reseau », et la sonde n’est même pas tirée', async () => {
    const sonde = poser({ enLigne: false });
    expect(await classerEchec(echecDeFetch(), STOCKAGE)).toBe('reseau');
    expect(sonde).not.toHaveBeenCalled();
  });

  it('⚠ document de NOTRE origine → « reseau » : CORS ne s’y applique pas', async () => {
    const sonde = poser({});
    expect(await classerEchec(echecDeFetch(), CHEZ_NOUS)).toBe('reseau');
    expect(sonde).not.toHaveBeenCalled();
  });

  it('⚠ la sonde échoue aussi → « reseau » : on ne SAIT pas, on ne devine pas', async () => {
    poser({ sondeRepond: false });
    expect(await classerEchec(echecDeFetch(), STOCKAGE)).toBe('reseau');
  });
});

describe('les deux autres motifs restent séparés', () => {
  it('une erreur qui n’est PAS un TypeError → « illisible »', async () => {
    poser({});
    expect(await classerEchec(new Error('bad XRef entry'), STOCKAGE)).toBe('illisible');
  });

  /*
   * ⚠ Le refus HTTP garde son motif propre : c'est LUI qui autorise une
   * redemande d'URL fraîche, et c'est le seul.
   */
  it('un refus HTTP de l’URL signée → « url », sans sonder', async () => {
    const sonde = poser({});
    expect(await classerEchec(new RefusDeLUrl(403), STOCKAGE)).toBe('url');
    expect(sonde).not.toHaveBeenCalled();
  });

  /*
   * ⚠ ET LE TÉMOIN QUI SÉPARE LE VRAI TYPE DE SON SOSIE : un objet qui porte
   * seulement le NOM `RefusDeLUrl` n'en est pas un, et le classement ne doit
   * PAS le prendre pour tel. Ma première écriture n'avait que ce cas-là — le
   * motif `url` était promis et jamais exercé, faute d'export.
   */
  it('⚠ un SOSIE de RefusDeLUrl n’obtient pas le motif « url »', async () => {
    poser({});
    const sosie = Object.assign(new Error('HTTP 403'), { name: 'RefusDeLUrl' });
    expect(await classerEchec(sosie, STOCKAGE)).toBe('illisible');
  });
});

/**
 * ⭐⭐ LE CONTRÔLE NÉGATIF DE L'EXIGENCE : si l'on FUSIONNE les deux cas,
 * l'épreuve tombe.
 *
 * ⚠ Il est STRUCTUREL, pas une mutation à relancer à la main : les quatre
 * messages doivent être DEUX À DEUX DISTINCTS, et celui du refus d'origine doit
 * nommer le serveur de documents. Fondre `echecOrigine` dans `echecReseau` fait
 * tomber ce bloc immédiatement.
 */
describe('⭐⭐ les quatre messages sont distincts, et celui qui compte NOMME', () => {
  const T = LIBELLES.lecteur;
  const tous = [T.echecOrigine, T.echecReseau, T.echecExpire, T.echecIllisible];

  it('⭐⭐ aucun des quatre ne se confond avec un autre', () => {
    expect(new Set(tous).size, 'deux motifs portent le même texte : le lecteur est redevenu muet').toBe(4);
  });

  it('⭐ celui du refus d’origine NOMME le serveur de documents', () => {
    expect(T.echecOrigine).toMatch(/serveur de documents/i);
    // ⚠ et il DÉTROMPE : la cause n'est pas chez l'étudiant
    expect(T.echecOrigine).toMatch(/pas votre connexion/i);
    // ⚠ et il donne une SORTIE — un refus sans issue ne sert à rien
    expect(T.echecOrigine).toMatch(/bibliothèque/i);
  });

  it('⚠ celui du réseau ne l’accuse PAS, et propose de réessayer', () => {
    expect(T.echecReseau).toMatch(/connexion/i);
    expect(T.echecReseau).toMatch(/réessayez/i);
    expect(T.echecReseau).not.toMatch(/serveur de documents/i);
  });

  it('⚠ aucun des quatre n’explique ce qu’est une origine à un étudiant', () => {
    for (const m of tous) {
      expect(m, m).not.toMatch(/CORS|Access-Control|en-tête HTTP|cross-origin/i);
    }
  });
});
