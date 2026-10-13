import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * 🔴 TOUTE ROUTE QUI SERT UNE NOTICE AFFICHABLE SERT `coverTemplate` ET
 * `coverDomain` — ou DÉCLARE pourquoi elle ne le fait pas.
 *
 * ## 🔴 CE GARDE A ÉTÉ ÉCRIT DEUX FOIS, et la première version était fausse
 *
 * Ma première rédaction portait une population **DÉCLARÉE** : quatre routes,
 * nommées à la main. Jean a ajouté une cinquième — `GET /offline/my-documents`,
 * celle que l'app mobile utilise — en disant : *« c'est précisément le cas qu'il
 * doit attraper : une route oubliée »*.
 *
 * > ⭐⭐ **Il avait raison, et c'était structurel : une population DÉCLARÉE ne
 * > peut pas voir une route que personne n'a déclarée.** Le garde était COMPLET
 * > sur sa population — son vert était honnête — et aveugle à la cinquième. C'est
 * > « deux familles de gardes, un seul inventaire », dans sa forme la plus
 * > bête : j'avais écrit dans ce fichier qu'une liste déclarée corrigeait le
 * > problème, alors qu'elle le déplaçait.
 *
 * ## ⭐ LA FORME JUSTE : la population est DÉRIVÉE, la couverture est une OBLIGATION
 *
 * Le relevé cherche les SITES qui lisent le TITRE d'une notice — c'est la
 * définition opératoire d'« une notice affichable ». Chaque fichier qui en porte
 * est ensuite **couvert**, ou **déclaré non-couvert AVEC SON MOTIF**. Un fichier
 * neuf n'est dans aucune des deux listes, et le test dit les deux issues.
 *
 * C'est la forme de `LIGNES_PARTAGEES`, de `COLONNES_SERVIES` et de
 * `colonnes-ecrivables` — la seule qui ne se périme pas toute seule.
 *
 * ⚠ **Et le COMPTE de sites est déclaré par fichier** : un site de plus dans un
 * fichier déjà connu convoque quelqu'un ici, parce que c'est le moment où l'on
 * sait si cette nouvelle lecture sert un écran.
 */

const SRC = join(__dirname, '..');

function fichiersTs(dossier: string): string[] {
  return readdirSync(dossier).flatMap((f) => {
    const p = join(dossier, f);
    if (statSync(p).isDirectory()) return fichiersTs(p);
    return /\.ts$/.test(f) && !/\.spec\./.test(f) ? [p] : [];
  });
}

/**
 * Les SITES qui lisent le titre d'une notice.
 *
 * ⚠ `title: true` précédé, dans les 400 caractères qui précèdent, de
 * `biblioRecord` ou d'un `record: {` — c'est-à-dire un `select` sur une notice.
 * Grossier et assumé : il ne suit pas les variables, et sa borne est écrite
 * plutôt que découverte. Ce qu'il garantit est qu'un fichier NEUF qui lit un
 * titre de notice apparaît.
 */
function sitesParFichier(): Map<string, number> {
  const par = new Map<string, number>();
  for (const f of fichiersTs(SRC)) {
    const s = readFileSync(f, 'utf-8');
    // ⭐ 13/10/2026 — LA DÉRIVATION EST ÉLARGIE, et c'est une correction de
    // l'INSTRUMENT, pas de la liste.
    //
    // 🔴 Elle exigeait `biblioRecord` ou `record: {` dans les 400 caractères
    // PRÉCÉDANT le `title: true`. Or `SELECT_VITRINE` est un const EXTRAIT :
    //
    //     export const SELECT_VITRINE = { id: true, title: true, … }
    //
    // Ni l'un ni l'autre n'y figure — le const est à cent lignes des requêtes
    // qui l'emploient. `GET /opac/parcourir` et `GET /opac/nouveautes` étaient
    // donc INVISIBLES au relevé, et le front a mesuré 20 vignettes au repli
    // avant que personne ne le voie.
    //
    // ⚠ C'est « on factorise le CORPS, jamais l'ADRESSE » retourné contre une
    // PROJECTION : extraire le select pour ne pas l'écrire deux fois l'a retiré
    // du champ d'un garde qui lit la source.
    //
    // ⭐ La condition de FICHIER est le plancher robuste : un fichier qui
    // interroge `biblioRecord` quelque part voit tous ses `title: true`
    // comptés, const extrait compris. Elle est plus GROSSIÈRE — un `title:
    // true` sans rapport y entre aussi —, et c'est acceptable : chaque candidat
    // doit de toute façon être DÉCLARÉ. Un faux candidat coûte une ligne de
    // motif ; un manque silencieux a coûté vingt vignettes fausses.
    const fichierInterrogeDesNotices = /biblioRecord/.test(s);
    let n = 0;
    for (const m of s.matchAll(/title:\s*true/g)) {
      const avant = s.slice(Math.max(0, (m.index ?? 0) - 400), m.index);
      if (fichierInterrogeDesNotices || /record:\s*\{/.test(avant)) n += 1;
    }
    if (n > 0) par.set(f.slice(SRC.length + 1), n);
  }
  return par;
}

/** Les fichiers qui servent une notice affichable et POSENT la couverture. */
/**
 * ⚠ `appels` EST UN COMPTE EXACT, et il remplace un test par FICHIER.
 *
 * 🔴 La version précédente demandait au FICHIER s'il mentionnait
 * `champsDeCouverture`. Jean a demandé un contrôle négatif précis — « retirer
 * l'appel dans `parcourir` doit faire tomber le garde » — et il NE TOMBAIT
 * PAS : `opac.service.ts` porte quatre appels, en retirer un en laisse trois,
 * et `includes()` reste vrai.
 *
 * ⭐ Un compte exact tombe par ARITHMÉTIQUE. Et comme tous les comptes exacts de
 * ce dépôt, il ne dit pas que le code est juste : il oblige à revenir le
 * regarder quand il bouge.
 */
const COUVERTS: Record<string, { sites: number; appels: number; routes: string }> = {
  'opac/opac.service.ts': {
    sites: 2,
    appels: 4,
    routes:
      'GET /opac/records/:id · GET /opac/search · GET /opac/parcourir · GET /opac/nouveautes',
  },
  'reader/reader.controller.ts': {
    sites: 2,
    appels: 2,
    routes: 'GET /reader/consultations · GET /reader/hors-ligne',
  },
  'offline-licensing/offline-licenses.service.ts': {
    sites: 1,
    appels: 1,
    routes: 'GET /offline/my-documents (l’app mobile)',
  },
  /**
   * ⚠ « MES PRÊTS » VIT ICI, pas dans `reader.service.ts`.
   *
   * Jean a tranché « Mes prêts : COUVERT » et « patrons : lien-texte ». Mesuré,
   * c'est la MÊME fonction : `/reader/loans` délègue à
   * `PatronsService.loansOfPatron`, et `/patrons/:id/loans` (le guichet,
   * derrière `adherents.gerer`) l'appelle aussi.
   *
   * ⭐ Les champs sortent donc pour les DEUX publics. Le guichet les ignore —
   * ça ne coûte rien — là où une seconde requête ou un paramètre « avec
   * couverture » coûterait une divergence entre deux chemins qui répondent à la
   * même question.
   */
  'patrons/patrons.service.ts': {
    sites: 2,
    appels: 2,
    routes: 'GET /reader/loans (« Mes prêts ») · GET /patrons/:id/loans (guichet)',
  },
  'authors/authors.service.ts': {
    sites: 1,
    appels: 1,
    routes: 'GET /authors/:id — les œuvres de la fiche d’autorité',
  },
  'encadrements/encadrements.service.ts': {
    sites: 2,
    appels: 1,
    routes: 'GET /encadrements/miens — les mémoires dirigés',
  },
};

/**
 * Les fichiers qui lisent un titre de notice SANS poser la couverture, avec leur
 * motif.
 *
 * ⚠ DEUX NATURES, jamais confondues — c'est ce qui empêche cette liste de
 * devenir l'endroit où l'on enterre les oublis :
 *
 * · `hors-ecran` — la lecture ne sert aucun écran (courriel, étiquette, agrégat) ;
 * · `dette` — un écran MONTRE ce document et n'a pas sa couverture. À trancher.
 */
/**
 * Les statuts possibles — vocabulaire FERMÉ, et le garde REFUSE l'inconnu.
 *
 * ⚠ POURQUOI UN REFUS ET PAS UNE TOLÉRANCE : un statut inventé au passage («
 * `a-voir`, `plus-tard` ») ferait de cette liste l'endroit où l'on enterre les
 * trouvailles. Trois natures, et il faut en choisir une.
 */
const STATUTS = ['hors-ecran', 'lien-texte', 'dette'] as const;
type Statut = (typeof STATUTS)[number];

const SANS_COUVERTURE: Record<string, { sites: number; nature: Statut; motif: string }> = {
  /**
   * ⚠ TROUVÉ PAR LA DÉRIVATION ÉLARGIE le 13/10/2026 — l'ancienne ne le voyait
   * pas du tout. C'est la preuve que l'élargissement mesurait quelque chose :
   * il n'a pas seulement rattrapé `SELECT_VITRINE`, il a découvert un FICHIER.
   */
  'oai/oai.service.ts': {
    sites: 1,
    nature: 'hors-ecran',
    motif:
      'l’entrepôt OAI-PMH sert du Dublin Core et du MARC à des MOISSONNEURS — ' +
      'des machines. Une clé de teinte n’a aucun sens dans un format d’échange ' +
      'bibliographique, et l’y mettre inventerait un champ que personne ne lit.',
  },
  'reminders/reminders.service.ts': {
    sites: 1,
    nature: 'hors-ecran',
    motif: 'le titre part dans un COURRIEL de rappel — un courriel n’a pas de couverture.',
  },
  'labels/labels.service.ts': {
    sites: 1,
    nature: 'hors-ecran',
    motif:
      'la planche d’étiquettes est monochrome et porte un code-barres et un QR ; ' +
      'une teinte de couverture n’y a aucun sens.',
  },
  'stats/usage.service.ts': {
    sites: 1,
    nature: 'hors-ecran',
    motif: 'un agrégat de consultations — aucune notice n’y est montrée individuellement.',
  },
  'inventory/inventory.service.ts': {
    sites: 1,
    nature: 'hors-ecran',
    motif:
      'le récolement liste des EXEMPLAIRES à pointer sur une étagère, par cote ; ' +
      'c’est une liste de travail, pas une vitrine.',
  },
  'access-control/access-control.service.ts': {
    // ⚠ 1 → 3 avec la dérivation élargie : deux projections de plus dans le même
    // fichier, qui n'étaient pas dans la fenêtre de 400 caractères.
    sites: 3,
    nature: 'hors-ecran',
    motif: 'une décision d’accès — le titre n’y sert qu’à expliquer un refus.',
  },
  'circulation/circulation.service.ts': {
    sites: 6,
    nature: 'lien-texte',
    motif:
      'écrans de TRAVAIL du personnel — prêt, retour, récolement de guichet. Ils ' +
      'montrent un LIEN vers la notice, sans vignette : on y agit sur un ' +
      'code-barres, on n’y reconnaît pas un document à sa couverture. Tranché par ' +
      'Jean le 12/10/2026 — c’est une DÉCISION, pas une dette.',
  },
  'circulation/holds.service.ts': {
    sites: 2,
    nature: 'lien-texte',
    motif:
      'l’onglet Réservations du guichet — même nature que la circulation : un lien, ' +
      'pas une vignette. Tranché par Jean le 12/10/2026.',
  },
  /**
   * ⚠ MESURÉ : son UNIQUE site n'est pas « Mes prêts » — c'est `renewLoan`, le
   * RENOUVELLEMENT, qui lit le titre pour le message de refus. « Mes prêts »
   * délègue à `patrons.service.ts`, qui est COUVERT.
   */
  'reader/reader.service.ts': {
    sites: 1,
    nature: 'hors-ecran',
    motif:
      'le titre y sert à FORMULER un message de renouvellement (« Prêt en cours ' +
      'introuvable », la politique de renouvellement) — aucune vignette n’est ' +
      'rendue par cette méthode.',
  },
};

describe('🔴 la couverture sur toute route qui montre une notice', () => {
  const sites = sitesParFichier();

  it('⚠ TÉMOIN : le relevé voit une population, et elle n’est pas vide', () => {
    expect(sites.size, 'des fichiers lisent bien un titre de notice').toBeGreaterThan(10);
    const total = [...sites.values()].reduce((a, b) => a + b, 0);
    expect(total, 'et plusieurs sites par fichier').toBeGreaterThan(15);
  });

  it('🔴 chaque fichier qui lit un titre de notice est COUVERT ou DÉCLARÉ', () => {
    const inconnus = [...sites.keys()].filter(
      (f) => !(f in COUVERTS) && !(f in SANS_COUVERTURE),
    );
    expect(
      inconnus,
      'Ce(s) fichier(s) lisent le TITRE d’une notice et ne sont ni couverts ni ' +
        'déclarés. C’est le cas qu’un garde à population DÉCLARÉE ne peut pas ' +
        'voir — d’où celle-ci, dérivée.\n' +
        '· un écran montre cette notice → appelez `champsDeCouverture(notice)` et ' +
        'inscrivez le fichier dans COUVERTS ;\n' +
        '· la lecture ne sert aucun écran (courriel, étiquette, agrégat) → ' +
        'déclarez-la `hors-ecran` AVEC son motif ;\n' +
        '· un écran la montre mais l’arbitrage n’est pas pris → déclarez-la ' +
        '`dette`, ce qui la rend visible plutôt que oubliée.',
    ).toEqual([]);
  });

  it('🔴 chaque fichier COUVERT porte EXACTEMENT ses appels déclarés', () => {
    for (const [f, d] of Object.entries(COUVERTS)) {
      const source = readFileSync(join(SRC, f), 'utf-8');
      const appels = [...source.matchAll(/champsDeCouverture\(/g)].length;
      expect(
        appels,
        `${f} (${d.routes}) porte ${appels} appel(s) à \`champsDeCouverture\`, ` +
          `${d.appels} déclaré(s).\n` +
          '· un appel a DISPARU → une de ces routes ne pose plus la couverture, ' +
          'et les vignettes y tombent au repli SANS que rien ne casse ;\n' +
          '· un appel a été AJOUTÉ → une route de plus la pose : actualisez le ' +
          'compte, c’est une convocation, pas un échec.',
      ).toBe(d.appels);
    }
  });

  it('🔴 et AUCUN ne compose les champs à la main — une seule règle, un seul endroit', () => {
    // ⚠ LE MOTIF EXCLUT LES ANNOTATIONS DE TYPE, et le `\s*` va DANS
    // l'assertion : placé devant, il rétrograde jusqu'à zéro espace, le
    // lookahead voit « ␣CoverTemplate » et réussit — le motif accusait alors
    // `coverTemplate: CoverTemplate`, c'est-à-dire du code juste.
    const MOTIF = /(coverTemplate|coverDomain):(?!\s*(?:CoverTemplate|CoverDomain)\b)/g;
    const aLaMain: string[] = [];
    for (const f of Object.keys(COUVERTS)) {
      const source = readFileSync(join(SRC, f), 'utf-8');
      for (const m of source.matchAll(MOTIF)) aLaMain.push(`${f} → ${m[1]}`);
    }
    expect(
      [...new Set(aLaMain)],
      'Un champ composé à la main : passez par `champsDeCouverture`, qui rend les ' +
        'DEUX ensemble — on ne peut donc plus en poser un et oublier l’autre.',
    ).toEqual([]);
  });

  it('⚠ TÉMOIN DE COMPTE : le nombre de sites par fichier est celui qu’on a jugé', () => {
    const ecarts: string[] = [];
    for (const [f, n] of sites) {
      const attendu = COUVERTS[f]?.sites ?? SANS_COUVERTURE[f]?.sites;
      if (attendu !== undefined && attendu !== n) ecarts.push(`${f} : ${attendu} → ${n}`);
    }
    expect(
      ecarts,
      'Un site de plus (ou de moins) dans un fichier déjà jugé. Ce n’est pas un ' +
        'échec : c’est une convocation — cette NOUVELLE lecture sert-elle un écran ?',
    ).toEqual([]);
  });

  it('⚠ TÉMOIN D’ABSENCE : le relevé SAIT dire non', () => {
    const MOTIF = /(coverTemplate|coverDomain):(?!\s*(?:CoverTemplate|CoverDomain)\b)/g;
    const faux = 'return { coverTemplate: "manuel", coverDomain: "autre" };';
    expect([...faux.matchAll(MOTIF)].length, 'une composition à la main est VUE').toBe(2);
    const vrai = 'return { ...champsDeCouverture(n) };';
    expect([...vrai.matchAll(MOTIF)].length, 'la fonction unique ne l’est pas').toBe(0);
    const typeur = '{ coverTemplate: CoverTemplate; coverDomain: CoverDomain }';
    expect([...typeur.matchAll(MOTIF)].length, 'un TYPE n’est pas une faute').toBe(0);
    // Et une déclaration vide ne passerait pas pour une déclaration.
    for (const [f, d] of Object.entries(SANS_COUVERTURE)) {
      expect(d.motif.length, `${f} doit porter un motif`).toBeGreaterThan(40);
    }
  });

  it('🔴 aucun statut INCONNU — le vocabulaire est fermé', () => {
    // ⚠ EXIGÉ PAR JEAN LE 12/10/2026. Sans ce cas, un statut inventé au passage
    // (« a-voir », « plus-tard ») ferait de cette liste l'endroit où l'on
    // enterre les trouvailles : une ligne de plus et le garde se tait.
    const inconnus = Object.entries(SANS_COUVERTURE)
      .filter(([, d]) => !(STATUTS as readonly string[]).includes(d.nature))
      .map(([f, d]) => `${f} → « ${d.nature} »`);
    expect(
      inconnus,
      `Statut inconnu. Les trois seuls sont : ${STATUTS.join(', ')}.\n` +
        '· `hors-ecran` — la lecture ne sert aucun écran (courriel, étiquette, agrégat) ;\n' +
        '· `lien-texte` — un écran de TRAVAIL montre un lien, sans vignette : une DÉCISION ;\n' +
        '· `dette` — un écran montre la notice et l’arbitrage n’est pas pris.',
    ).toEqual([]);
    // ⚠ TÉMOIN D'ABSENCE : le relevé SAIT voir un statut inconnu.
    const faux = { nature: 'a-voir' as unknown as (typeof STATUTS)[number] };
    expect((STATUTS as readonly string[]).includes(faux.nature)).toBe(false);
  });

  it('⭐ LA RÉPARTITION DES TROIS STATUTS, comptée — une bascule convoque ici', () => {
    const par = (n: (typeof STATUTS)[number]) =>
      Object.entries(SANS_COUVERTURE).filter(([, d]) => d.nature === n);
    const sites = (n: (typeof STATUTS)[number]) =>
      par(n).reduce((a, [, d]) => a + d.sites, 0);

    // hors-ecran : courriel, étiquette, agrégat, récolement, accès, renouvellement
    // ⚠ 6 → 7 le 13/10/2026 : `oai` est entré avec la dérivation élargie.
    expect(par('hors-ecran').length, 'sept fichiers hors écran').toBe(7);
    // lien-texte : les écrans de travail du guichet — DÉCISION de Jean
    expect(par('lien-texte').length, 'deux fichiers en lien-texte').toBe(2);
    expect(sites('lien-texte'), 'huit sites de guichet').toBe(8);
    // ⭐ ZÉRO DETTE : les trois qui en étaient une sont COUVERTES depuis rc13.
    expect(
      par('dette').length,
      'aucune dette ne reste. Si ce compte monte, une route montre une notice ' +
        'sans couverture et personne ne l’a tranché.',
    ).toBe(0);
  });
});
