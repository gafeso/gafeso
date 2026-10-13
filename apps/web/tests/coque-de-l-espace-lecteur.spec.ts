/**
 * ⭐⭐ TOUTE PAGE DE L'ESPACE LECTEUR REND SA COQUE — ou elle est DÉCLARÉE.
 *
 * ## 🔴 L'IMPASSE QUI A MOTIVÉ CE GARDE
 *
 * Constaté par Jean sur la démonstration rc12, compte étudiant :
 * `/mes-consultations` et `/mes-documents-hors-ligne` s'affichaient **sans
 * en-tête, sans menu, sans pied**. Aucune navigation — pour sortir, il fallait
 * taper une adresse.
 *
 * ⚠ **Aucun de nos gardes ne pouvait le voir**, et pas par oubli : six écrans
 * recopiaient la coque dans leur propre `return`, donc il n'existait aucune
 * population à inventorier. C'est « deux familles de gardes, un seul
 * inventaire » — la seconde famille était invisible par construction, puisqu'il
 * n'y avait pas de première.
 *
 * ## ⭐ UNE OBLIGATION, PAS UN BALAYAGE
 *
 * La population est DÉRIVÉE du système de fichiers : tout `app/**\/page.tsx`
 * hors administration. Chaque écran est donc
 *
 * · **couvert** — il rend `<Header />` ou `<CoqueLecteur />`, lui-même ou par un
 *   layout ANCÊTRE (c'est ainsi que les six écrans d'`/opac` sont servis) ;
 * · ou **déclaré** ci-dessous, AVEC SON MOTIF.
 *
 * Une page neuve n'est dans aucune des deux listes, et le test échoue en
 * disant les deux issues. « Un balayage garde un usage, et un seul : trouver la
 * première occurrence. Il ne peut pas garder la propriété. »
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const APP = resolve(process.cwd(), 'app');

/**
 * ⚠ LES EXCEPTIONS, ET LEUR MOTIF — jamais une liste nue.
 *
 * ⭐ Deux natures, et les confondre ferait de cette liste l'endroit où l'on
 * enterre les trouvailles :
 *
 * · `sans-session` — la coque PORTE le menu du compte, et il n'y a pas de
 *   compte. Afficher un menu de session sur un écran de connexion promettrait
 *   ce qu'il n'y a pas ;
 * · `impression` — l'écran EXISTE pour sortir sur papier, et son menu
 *   mangerait la page ;
 * · `coque-propre` — l'écran porte sa propre navigation complète, mesurée.
 */
const EXCEPTIONS: ReadonlyArray<{
  readonly route: string;
  readonly nature: 'sans-session' | 'impression' | 'coque-propre';
  readonly motif: string;
}> = [
  {
    route: '/',
    nature: 'coque-propre',
    motif:
      'l’accueil d’établissement porte sa propre navigation complète — mesuré par ' +
      'l’effet : 1 <header>, 1 <nav>, 1 <footer> dans l’HTML servi.',
  },
  {
    route: '/affiche/[id]',
    nature: 'impression',
    motif:
      'affiche A4 d’une seule page, sans menu ni pied EXPRÈS : elle vit à la racine ' +
      'parce qu’un layout imbriqué ne peut pas retirer son parent.',
  },
  {
    route: '/e/[slug]',
    nature: 'coque-propre',
    motif:
      'page d’atterrissage du QR d’établissement : elle s’adresse à quelqu’un qui ' +
      'n’a NI l’application NI de session, et porte sa propre navigation minimale.',
  },
  {
    route: '/login',
    nature: 'sans-session',
    motif: 'on y arrive sans compte : un menu de compte y promettrait une session.',
  },
  {
    route: '/inscription',
    nature: 'sans-session',
    motif:
      'le compte n’existe pas encore : un menu de compte y afficherait une session ' +
      'que personne n’a ouverte.',
  },
  {
    route: '/definir-mot-de-passe',
    nature: 'sans-session',
    motif: 'atteint par un lien à usage unique, avant toute session.',
  },
  {
    route: '/mentions-legales',
    nature: 'coque-propre',
    motif:
      '⚠ DETTE RECONNUE, pas un choix : ces pages n’ont aucune navigation, et leur ' +
      'public EST le dehors (le pied de page y mène, un QR peut y mener). Rapporté ' +
      'le 12 octobre 2026 ; elles restent déclarées ici pour que le manque soit une ' +
      'dette nommée plutôt qu’un oubli.',
  },
  {
    route: '/confidentialite',
    nature: 'coque-propre',
    motif: 'même dette que /mentions-legales, même date.',
  },
];

/** Tous les `page.tsx`, en route, hors administration et hors guichet. */
function routes(): string[] {
  const sortie: string[] = [];
  (function marcher(d: string) {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) marcher(p);
      else if (e === 'page.tsx') {
        const r = `/${relative(APP, d).replace(/\\/g, '/')}`;
        sortie.push(r === '/.' ? '/' : r);
      }
    }
  })(APP);
  return sortie
    .filter((r) => !/^\/(admin|guichet|installation)(\/|$)/.test(r))
    .sort();
}

/**
 * ⚠ ON REMONTE LES LAYOUTS ANCÊTRES. Sans cela, les six écrans d'`/opac`
 * seraient déclarés nus — ils tiennent leur coque d'`app/opac/layout.tsx`.
 * « Un test unitaire monte ce qu'on lui donne » : ici c'est l'ARBRE qui donne.
 */
function coqueDe(route: string): string | null {
  let d = route === '/' ? APP : join(APP, route.slice(1));
  const candidats = [join(d, 'page.tsx')];
  for (;;) {
    const l = join(d, 'layout.tsx');
    if (existsSync(l)) candidats.push(l);
    if (d === APP) break;
    d = dirname(d);
  }
  for (const c of candidats) {
    if (/<Header\b|<CoqueLecteur\b/.test(readFileSync(c, 'utf-8'))) return relative(APP, c);
  }
  return null;
}

describe('⭐⭐ la coque de l’espace lecteur — couverte, ou déclarée avec son motif', () => {
  const declarees = new Set(EXCEPTIONS.map((e) => e.route));

  it('chaque écran rend la coque, ou figure dans les exceptions', () => {
    const nus = routes().filter((r) => coqueDe(r) === null && !declarees.has(r));
    expect(
      nus,
      'Ces écrans ne rendent NI en-tête NI CoqueLecteur, et ne sont pas déclarés. ' +
        'Deux issues : enveloppez la page dans <CoqueLecteur> (c’est presque ' +
        'toujours la bonne), ou ajoutez-la à EXCEPTIONS avec sa nature et son MOTIF.',
    ).toEqual([]);
  });

  /**
   * ⭐ UNE DÉCLARATION PÉRIMÉE EST REFUSÉE. Le jour où l'un de ces écrans
   * reçoit la coque, sa ligne devient fausse — et « une dette qui ne se
   * rappelle pas d'elle-même n'est pas une dette, c'est un oubli en attente ».
   */
  it('⚠ aucune exception n’est PÉRIMÉE', () => {
    const perimees = EXCEPTIONS.filter((e) => coqueDe(e.route) !== null).map((e) => e.route);
    expect(
      perimees,
      'Ces écrans rendent désormais la coque : retirez-les d’EXCEPTIONS.',
    ).toEqual([]);
  });

  it('⚠ aucune exception ne désigne un écran DISPARU', () => {
    const connues = new Set(routes());
    expect(EXCEPTIONS.filter((e) => !connues.has(e.route)).map((e) => e.route)).toEqual([]);
  });

  it('chaque exception porte une nature ET un motif', () => {
    for (const e of EXCEPTIONS) {
      expect(['sans-session', 'impression', 'coque-propre']).toContain(e.nature);
      expect(e.motif.length, `${e.route} : motif trop court pour être un motif`).toBeGreaterThan(40);
    }
  });

  /**
   * ⭐⭐ LE COMPTE EXACT, et il CONVOQUE. « Un compte exact ne dit pas que le
   * code est juste : il oblige à revenir le regarder. »
   *
   * ⚠ Et un témoin de COMPTE ne suffit pas — on compare les ÉLÉMENTS. Une
   * erreur symétrique (un écran de plus hors coque, un de moins) laisserait le
   * total juste. C'est la faute mesurée le 16 septembre 2026 sur
   * `CHEMINS_DU_RENDU_SERVEUR`.
   */
  it('⭐ les deux écrans de l’impasse rc12 sont DANS la coque', () => {
    for (const r of ['/mes-consultations', '/mes-documents-hors-ligne']) {
      expect(coqueDe(r), `${r} est de nouveau sans navigation — l’impasse rc12`).not.toBeNull();
    }
  });

  it('⭐ la population et les exceptions, comparées ÉLÉMENT par élément', () => {
    /*
     * ⚠ 21, MESURÉ — j'avais d'abord écrit 16, de mémoire. Un compte exact
     * écrit sans mesure est « une impression bien habillée », et il survit à la
     * vérification que personne ne fera. Le test l'a refusé tout de suite.
     */
    expect(routes().length).toBe(21);
    expect([...declarees].sort()).toEqual([
      '/',
      '/affiche/[id]',
      '/confidentialite',
      '/definir-mot-de-passe',
      '/e/[slug]',
      '/inscription',
      '/login',
      '/mentions-legales',
    ]);
  });
});
