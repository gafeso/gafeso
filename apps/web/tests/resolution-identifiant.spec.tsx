/**
 * LA RÉSOLUTION D'UN IDENTIFIANT PÉRENNE — les TROIS états, et ce que la page
 * en fait.
 *
 * ## ⚠⚠ L'ENJEU, ET IL EST D'UN AUTRE ORDRE QUE D'HABITUDE
 *
 * Cette adresse est **imprimée** : des QR collés dans des livres, des affiches
 * dans des couloirs. Un 404 rendu parce que le catalogue a cligné serait
 * archivé par les moteurs d'indexation et les vérificateurs de liens comme
 * « cet identifiant n'existe pas » — et l'étiquette, elle, reste collée.
 *
 * ⭐ D'où trois états et non deux, et d'où le cas qui compte le plus ici :
 * **`indisponible` ne rend PAS 404.**
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { identifiantDuSegment } from '@/lib/url-publique';

const HOTE = 'bib.exemple.bf';
vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Map([['x-forwarded-host', HOTE]])),
}));

/** ⚠ Fabriqués UNE FOIS : des doublures neuves à chaque appel relanceraient
 *  les effets du composant indéfiniment. */
const REDIRECTION_PERMANENTE = vi.fn();
const PAS_TROUVE = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});
vi.mock('next/navigation', () => ({
  permanentRedirect: (u: string) => {
    REDIRECTION_PERMANENTE(u);
    // ⚠ Le vrai `permanentRedirect` LÈVE : rien ne s'exécute après lui. Une
    // doublure qui rendrait la main laisserait le code continuer, et le test
    // mesurerait un chemin que la production ne prend jamais.
    throw new Error('NEXT_REDIRECT');
  },
  notFound: PAS_TROUVE,
}));

const ID = '9de9b299-cde5-4acc-9e76-0e800ad94281';
const IDENT = `oai:zinda:${ID}`;
/**
 * ⚠⚠ CE QUE NEXT LIVRE VRAIMENT — et la doublure qui a laissé passer le défaut.
 *
 * `params` ne rend PAS l'identifiant décodé : il rend le segment
 * PERCENT-ENCODÉ. Mesuré sur le serveur de développement, et identique que le
 * QR ait porté les deux-points BRUTS ou ENCODÉS — Next normalise l'adresse,
 * donc il n'y a qu'UNE forme à traiter.
 *
 * La première version de ce fichier montait la page avec `IDENT`, c'est-à-dire
 * avec la valeur DÉJÀ décodée. **Douze cas verts, et l'écran rendait 404 à tout
 * le monde**, sur l'adresse la plus irréversible du produit — celle qu'un QR
 * imprimé porte. C'est « une doublure est une hypothèse, et un test vert ne
 * confirme que moi ».
 */
const SEGMENT = encodeURIComponent(IDENT);

function brancherFetch(reponse: { status: number; corps?: unknown } | 'panne') {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      if (reponse === 'panne') throw new Error('ECONNREFUSED');
      return new Response(
        reponse.corps === undefined ? '' : JSON.stringify(reponse.corps),
        { status: reponse.status, headers: { 'Content-Type': 'application/json' } },
      );
    }),
  );
}

beforeEach(() => {
  REDIRECTION_PERMANENTE.mockClear();
  PAS_TROUVE.mockClear();
  vi.resetModules();
});
afterEach(() => vi.unstubAllGlobals());

async function resoudre(identifiant = IDENT) {
  const { resoudreIdentifiant } = await import('@/lib/server-api');
  return resoudreIdentifiant(identifiant);
}

describe('les trois états de la résolution', () => {
  it('200 avec un `id` → `trouve`', async () => {
    brancherFetch({ status: 200, corps: { id: ID, title: 'T' } });
    expect(await resoudre()).toEqual({ etat: 'trouve', recordId: ID });
  });

  it('404 → `introuvable` — et c’est le SEUL cas qui le soit', async () => {
    brancherFetch({ status: 404, corps: { message: 'Notice introuvable.' } });
    expect(await resoudre()).toEqual({ etat: 'introuvable' });
  });

  /**
   * ⭐⭐ LE CAS QUI COMPTE LE PLUS : une panne n'est PAS une absence.
   *
   * Sans cette distinction, un catalogue momentanément injoignable ferait
   * déclarer « inexistant » un identifiant parfaitement valide — à des moteurs
   * qui l'archivent, pour une étiquette qu'on ne décolle pas.
   */
  it('⚠ 500 → `indisponible`, PAS `introuvable`', async () => {
    brancherFetch({ status: 500 });
    expect(await resoudre()).toEqual({ etat: 'indisponible' });
  });

  it('⚠ réseau coupé → `indisponible`', async () => {
    brancherFetch('panne');
    expect(await resoudre()).toEqual({ etat: 'indisponible' });
  });

  /**
   * ⚠ UN 200 SANS `id` NE REDIRIGE PAS. Il produirait `/opac/undefined` — une
   * adresse qui existe, répond, et ne mène nulle part. Pire qu'un refus, parce
   * qu'elle a l'air de marcher.
   */
  it('⚠ 200 sans `id` → `indisponible`, jamais une redirection vers `undefined`', async () => {
    brancherFetch({ status: 200, corps: { title: 'T' } });
    expect(await resoudre()).toEqual({ etat: 'indisponible' });
    brancherFetch({ status: 200, corps: { id: '' } });
    expect(await resoudre()).toEqual({ etat: 'indisponible' });
  });

  /**
   * ⚠ L'IDENTIFIANT PART ENCODÉ. Il porte des deux-points ; l'API accepte les
   * deux formes (mesuré), mais encoder est la seule écriture qui reste juste si
   * un identifiant contenait un jour un caractère réservé.
   */
  it('⚠ l’identifiant est ENCODÉ dans l’URL appelée', async () => {
    brancherFetch({ status: 200, corps: { id: ID } });
    await resoudre();
    const appel = (globalThis.fetch as unknown as { mock: { calls: string[][] } }).mock.calls[0][0];
    expect(String(appel)).toContain(encodeURIComponent(IDENT));
    // Témoin d'ABSENCE : les deux-points bruts ne partent pas dans le chemin.
    expect(String(appel)).not.toContain(`/resoudre/${IDENT}`);
  });
});

describe('ce que la PAGE fait de chaque état', () => {
  // ⚠ Le défaut est `SEGMENT`, jamais `IDENT` : on monte la page avec ce que
  // Next LIVRE, pas avec ce qu'on souhaiterait qu'il livre.
  async function monter(identifiant = SEGMENT) {
    const { default: Page } = await import('@/app/opac/resoudre/[identifiant]/page');
    return Page({ params: Promise.resolve({ identifiant }) });
  }

  /**
   * ⭐ UNE REDIRECTION PERMANENTE (308), et deux invariants la rendent exacte :
   * `BiblioRecord.id` ne change JAMAIS, et `/opac/<id>` est valide pour
   * toujours. Un 307 ferait redemander la résolution à chaque visiteur pour
   * rien.
   */
  it('`trouve` → redirection PERMANENTE vers /opac/<id>', async () => {
    brancherFetch({ status: 200, corps: { id: ID } });
    await expect(monter()).rejects.toThrow('NEXT_REDIRECT');
    expect(REDIRECTION_PERMANENTE).toHaveBeenCalledWith(`/opac/${ID}`);
    // Témoin d'ABSENCE : aucun 404 sur le chemin heureux.
    expect(PAS_TROUVE).not.toHaveBeenCalled();
  });

  it('`introuvable` → 404 explicite', async () => {
    brancherFetch({ status: 404, corps: {} });
    await expect(monter()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(PAS_TROUVE).toHaveBeenCalled();
    expect(REDIRECTION_PERMANENTE).not.toHaveBeenCalled();
  });

  /**
   * ⭐⭐ ET C'EST L'ASSERTION LA PLUS IMPORTANTE DE CE FICHIER : une panne ne
   * rend NI 404 NI redirection. Elle rend une PAGE qui dit qu'on ne sait pas.
   */
  it('⚠ `indisponible` → ni 404, ni redirection : une page qui le DIT', async () => {
    brancherFetch({ status: 500 });
    const vue = await monter();
    expect(PAS_TROUVE, '🔴 une panne a produit un 404 : les moteurs l’archiveraient').not.toHaveBeenCalled();
    expect(REDIRECTION_PERMANENTE).not.toHaveBeenCalled();
    expect(vue, 'la page ne rend rien sur une panne').toBeTruthy();
  });
});

describe('les textes de refus portent leur propriété', () => {
  it('⚠ le 404 dit « pas d’ICI », jamais « il existe ailleurs »', async () => {
    const { LIBELLES } = await import('@/lib/libelles');
    const T = LIBELLES.resolution;
    // L'API refuse délibérément de révéler qu'une notice existe ailleurs : ce
    // serait dire à un inconnu ce que porte le fonds d'un autre établissement.
    expect(T.introuvableTitre).toMatch(/d’ici|ici/i);
    expect(T.introuvableTexte).toMatch(/autre bibliothèque|une autre/i);
    expect(T.introuvableTexte).not.toMatch(/existe (bien )?(ailleurs|dans)/i);
  });

  it('⚠ et il porte une SORTIE — qui vient de scanner tient un livre', async () => {
    const { LIBELLES } = await import('@/lib/libelles');
    expect(LIBELLES.resolution.introuvableSortie).toMatch(/chercher|catalogue/i);
  });

  it('⚠ l’indisponibilité dit qu’on ne SAIT pas, et que l’étiquette reste bonne', async () => {
    const { LIBELLES } = await import('@/lib/libelles');
    const T = LIBELLES.resolution;
    expect(T.indisponibleTexte).toMatch(/n’avons pas pu|pas pu vérifier/i);
    expect(T.indisponibleTexte).toMatch(/réessayez/i);
    // ⚠ Elle ne doit PAS dire que le code est invalide : c'est le faux qu'on
    // évite, et c'est pour lui que les trois états existent.
    expect(T.indisponibleTexte).not.toMatch(/invalide|n’existe pas|introuvable/i);
  });
});

/**
 * ⭐⭐ LE GARDE DE RÉGRESSION DU DÉCODAGE — le défaut qui rendait 404 à tout le
 * monde, et que douze cas verts n'ont pas vu.
 *
 * ## ⚠ CE QU'IL MESURE, et pourquoi en DEUX moitiés
 *
 * · la fonction PURE décode, et ne lève jamais ;
 * · ⭐ et la PAGE, montée avec le segment que Next LIVRE, appelle l'API avec
 *   l'identifiant DÉCODÉ — c'est la seule moitié qui éprouve le chemin réel.
 *
 * Le témoin le plus parlant est le NÉGATIF de l'URL : elle ne doit porter
 * AUCUN `%25`. Un `%25` est la signature exacte du double encodage, et il
 * suffit à faire rendre 404 à un identifiant valide.
 */
describe('⭐ le décodage du segment — ce qui rendait 404 à tout le monde', () => {
  it('décode la forme que Next livre', () => {
    expect(identifiantDuSegment(SEGMENT)).toBe(IDENT);
  });

  /*
   * ⚠ Témoin d'IDEMPOTENCE : la forme déjà décodée doit traverser inchangée.
   * Sans lui, un décodage qui ne s'applique qu'à une forme casserait l'autre
   * le jour où Next changerait de normalisation.
   */
  it('laisse passer la forme déjà décodée', () => {
    expect(identifiantDuSegment(IDENT)).toBe(IDENT);
  });

  /**
   * ⚠ BRANCHE MORTE, ET SA MORT EST ÉCRITE. Mesuré sur le serveur de
   * développement : `/opac/resoudre/100%`, `oai%3A%` et `%zz` rendent **400**,
   * refusés par Next AVANT que la page s'exécute. Le repli est donc
   * inatteignable par HTTP aujourd'hui.
   *
   * ⭐ Il est gardé quand même, et c'est une décision, pas un oubli : laisser
   * l'exception passer produirait un **500 sur une adresse IMPRIMÉE** le jour
   * où un mandataire, un autre serveur ou une version de Next laisserait
   * passer la forme malformée. « Un repli mort et JUSTE vaut mieux qu'un repli
   * absent et faux — à une condition : que sa mort soit écrite. »
   */
  it('⚠ ne LÈVE pas sur une forme malformée (branche morte, gardée exprès)', () => {
    expect(() => identifiantDuSegment('100%')).not.toThrow();
    expect(identifiantDuSegment('100%')).toBe('100%');
  });

  it('⭐ la PAGE appelle l’API avec l’identifiant DÉCODÉ, jamais doublement encodé', async () => {
    brancherFetch({ status: 200, corps: { id: ID, title: 'T' } });
    const { default: Page } = await import('@/app/opac/resoudre/[identifiant]/page');
    await Page({ params: Promise.resolve({ identifiant: SEGMENT }) }).catch(() => undefined);

    const url = String(
      (globalThis.fetch as unknown as { mock: { calls: string[][] } }).mock.calls[0][0],
    );
    // ⚠ LE TÉMOIN NÉGATIF : `%25` est la signature du double encodage.
    expect(url, 'un `%25` dans l’URL = double encodage = 404 sur un identifiant valide').not.toContain('%25');
    expect(url).toContain(`/resoudre/${encodeURIComponent(IDENT)}`);
    expect(REDIRECTION_PERMANENTE).toHaveBeenCalledWith(`/opac/${ID}`);
  });
});
