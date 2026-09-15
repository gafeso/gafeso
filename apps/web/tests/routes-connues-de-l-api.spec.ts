/**
 * Tout appel du front — VERBE et CHEMIN — doit correspondre à une route de l'API.
 *
 * ⚠ POURQUOI CE TEST EXISTE. Il est le jumeau de
 * `fonctions-connues-de-l-api.spec.ts`, et il répond à la même question, posée
 * ailleurs : **« qu'est-ce qui reste écrit sans plus être vrai ? »**
 *
 * Une fonction disparue rend un `includes` faux pour tout le monde, en
 * silence. Un appel disparu est pire : il compile, il se relit sans effort, la
 * suite passe — parce qu'une doublure de test répond ce qu'on lui dit de
 * répondre, jamais ce que l'API répondrait. Le défaut n'existe qu'au clic, en
 * production, sur un écran qu'on croyait vérifié. C'est le motif exact du
 * renommage de permissions du 8 septembre 2026, déplacé des droits vers les
 * routes ; rien dans le dépôt ne le gardait.
 *
 * ⚠ Il lit `apps/api` depuis `apps/web`. Franchir la frontière est délibéré :
 * le couplage EXISTE dans les faits, autant qu'il soit vérifié. Lecture seule.
 *
 * ⚠ SA BORNE, ÉCRITE POUR QU'ON NE LA CROIE PAS PLUS LARGE QU'ELLE N'EST.
 * Il compare des couples verbe+chemin, pas des PARAMÈTRES. Le 12 septembre
 * 2026, `/authors` rendait `totalPages` en refusant `page` : le chemin
 * existait, le verbe était bon, et le contrat mentait quand même. Ce garde ne
 * voit pas cette famille-là — seule la recette à l'écran l'a vue. Un garde
 * approximatif qui DIT qu'il l'est laisse chercher ; un garde qu'on croit
 * complet fait cesser de chercher.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const RACINE_API = resolve(process.cwd(), '..', 'api', 'src');

/**
 * `lib/api.ts` construit `/api${path}` : c'est la PLOMBERIE, pas un appelant.
 * L'inclure ferait relever un chemin `/api` qui n'est la route de personne.
 */
const PLOMBERIE = 'lib/api.ts';

/**
 * Nature d'une exception — et les deux ne se confondent JAMAIS.
 * `servi-ailleurs` : l'appel est légitime et ne vient pas d'un contrôleur Nest
 *   (réécriture Next, service tiers, route montée hors décorateur).
 * `defaut-connu`   : c'est un défaut suivi, avec sa date et son suivi.
 * Si les deux s'écrivaient pareil, cette liste deviendrait l'endroit où l'on
 * enterre les trouvailles : une ligne de plus, et le test se tait.
 */
type Exception = {
  /** La clé telle qu'elle s'affiche dans l'échec : `POST /chemin/*`. */
  appel: string;
  nature: 'servi-ailleurs' | 'defaut-connu';
  pourquoi: string;
};

/**
 * Vide au 12 septembre 2026 : les 113 couples verbe+chemin appelés par le
 * front ont tous leur route. Le mécanisme reste, pour que le jour où il en
 * manque un, la réponse soit d'ÉCRIRE pourquoi — pas de retirer le test.
 */
const EXCEPTIONS: Exception[] = [
  {
    appel: 'POST /revalidate',
    nature: 'servi-ailleurs',
    pourquoi:
      'Route handler Next (app/revalidate/route.ts), pas un contrôleur Nest : ' +
      'elle purge le cache de rendu après un changement d’apparence.',
  },
];

/**
 * Couples verbe+chemin distincts appelés par le front, au 12 septembre 2026.
 * 113 par le client JSON, 6 par `fetch` (5 téléversements + le descripteur
 * public), 1 séparé de sa parenthèse par un commentaire, et
 * `GET /encadrements/miens` ajouté le jour même par l'écran « Mes
 * encadrements », puis `GET /depots/directeurs` et
 * `PATCH /depots/:id/directeur` par la désignation du directeur — le compte a
 * fait son travail dès son premier lot, et deux fois le jour même.
 */
const NOMBRE_D_APPELS = 139;
/**
 * Dont ceux qui ne sont pas des lectures. Voir le témoin sur les verbes.
 * 70, et c'est EXACTEMENT le nombre d'occurrences de `method:` du front —
 * l'écart de six qui existait au premier jet a désigné deux angles morts de
 * l'extracteur, pas six appels légitimes.
 */
const NOMBRE_D_ECRITURES = 81;

/** Un chemin normalisé en segments : les paramètres deviennent `*`. */
function normaliser(chemin: string): string {
  const segments = chemin
    .split('?')[0]
    .split('/')
    .filter((s) => s !== '')
    .map((s) => {
      if (s.startsWith(':') || s.startsWith('${')) return '*';
      // `authors${…}` : l'interpolation est un suffixe (requête, fragment
      // conditionnel), pas un segment. On garde le préfixe statique.
      const i = s.indexOf('${');
      return i === -1 ? s : s.slice(0, i);
    })
    .filter((s) => s !== '');
  return '/' + segments.join('/');
}

/** Les routes réelles de l'API, lues dans ses contrôleurs : `VERBE /chemin`. */
function routesDeLApi(): Set<string> {
  const fichiers = execFileSync('grep', ['-rl', '@Controller(', RACINE_API], { encoding: 'utf-8' })
    .split('\n')
    .filter(Boolean);
  const routes = new Set<string>();
  for (const f of fichiers) {
    const src = readFileSync(f, 'utf-8');
    const base = /@Controller\(\s*'([^']*)'\s*\)/.exec(src)?.[1] ?? '';
    for (const m of src.matchAll(/@(Get|Post|Patch|Put|Delete)\(\s*(?:'([^']*)')?\s*\)/g)) {
      const chemin = normaliser('/' + [base, m[2] ?? ''].filter(Boolean).join('/'));
      routes.add(`${m[1].toUpperCase()} ${chemin}`);
    }
  }
  return routes;
}

type Appel = { appel: string; verbe: string; brut: string; fichier: string };

/**
 * Tout appel `api(…)` du front, verbe compris.
 *
 * ⚠ L'extraction se fait caractère par caractère et non par expression
 * régulière : un gabarit peut contenir un ternaire portant lui-même des
 * accents graves (`/authors${p ? `?${p}` : ''}`), et une regex naïve s'y
 * arrête au mauvais endroit — elle l'a fait, et elle a signalé un chemin `/*`
 * qui n'existait pas. Un instrument qui fabrique ses trouvailles retire la
 * confiance qu'on accordait à ce qu'il trouve.
 *
 * Le verbe se lit dans l'option `method` du MÊME appel : on borne la lecture
 * aux parenthèses de `api(`, sans quoi un `method` voisin serait attribué au
 * mauvais chemin. Absent, c'est une lecture — le défaut de `lib/api.ts`.
 */
function appelsDuFront(): Appel[] {
  const fichiers = execFileSync(
    'grep',
    ['-rlE', '\\b(api(<[^>]*>)?|fetch)\\(', 'app', 'components', 'lib'],
    { cwd: process.cwd(), encoding: 'utf-8' },
  )
    .split('\n')
    .filter(Boolean);

  const trouves: Appel[] = [];
  for (const f of fichiers) {
    const src = readFileSync(resolve(process.cwd(), f), 'utf-8');
    if (f === PLOMBERIE) continue;
    // ⚠ Le `(?:…)*` saute les COMMENTAIRES entre la parenthèse et le chemin.
    // Sans lui, `api(\n  // pourquoi cette route\n  '/auth/policy',` est
    // invisible — l'appel entier, pas seulement son verbe. Un relevé qui
    // présume une forme ne voit pas ce qui s'en écarte, et son silence se lit
    // comme une absence de défaut.
    for (const m of src.matchAll(
      /\b(?:api(?:<[^>]*>)?|fetch)\(\s*(?:(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/)\s*)*(['`])/g,
    )) {
      const guillemet = m[1];
      let i = m.index! + m[0].length;
      let profondeur = 0;
      let brut = '';
      while (i < src.length) {
        const c = src[i];
        if (profondeur === 0 && c === guillemet) break;
        if (c === '$' && src[i + 1] === '{') {
          profondeur += 1;
          brut += '${';
          i += 2;
          continue;
        }
        if (profondeur > 0) {
          if (c === '{') profondeur += 1;
          else if (c === '}') profondeur -= 1;
          i += 1;
          continue;
        }
        brut += c;
        i += 1;
      }
      // `${apiUrl()}/tenancy/descriptor` : l'origine interpolée n'est pas un
      // segment de route. On la retire avant tout.
      if (brut.startsWith('${')) brut = brut.slice(2);
      // Les téléversements passent par `fetch('/api/…')` — le client JSON ne
      // sait pas envoyer de FormData. `/api` est la réécriture Next
      // (next.config.mjs), pas un segment de l'API.
      if (brut.startsWith('/api/')) brut = brut.slice(4);
      // On ne retient que ce qui EST un chemin : `fetch(url)` avec une
      // variable ne commence pas par `/` et sort du périmètre de ce garde.
      if (!brut.startsWith('/')) continue;

      // La portée du verbe : les parenthèses de cet appel-ci, et elles seules.
      const ouvrante = m.index! + m[0].indexOf('(');
      let k = ouvrante;
      let paren = 0;
      while (k < src.length) {
        if (src[k] === '(') paren += 1;
        else if (src[k] === ')') {
          paren -= 1;
          if (paren === 0) break;
        }
        k += 1;
      }
      const verbe = /method:\s*'([A-Za-z]+)'/.exec(src.slice(ouvrante, k))?.[1].toUpperCase() ?? 'GET';
      trouves.push({ appel: `${verbe} ${normaliser(brut)}`, verbe, brut, fichier: f });
    }
  }
  return trouves;
}

/**
 * ⚠ LE CANAL DES LIENS, fermé le 12 septembre 2026 après qu'il eut fabriqué une
 * trouvaille. Les exports, les CSV, les PDF d'étiquettes et le QR ne passent ni
 * par `api()` ni par `fetch()` : ce sont des `<a href="/api/…" download>`, car
 * le cookie est same-origin et un lien suffit.
 *
 * Le relevé ne les voyait pas — et il déclarait donc « sans porte » des routes
 * que le front atteint, dont `GET /encadrements/miens.csv` que je venais
 * d'écrire moi-même.
 */
function liensVersLApi(): Appel[] {
  const dejaReleves = new Set(appelsDuFront().map((a) => normaliser(a.brut)));
  const fichiers = execFileSync('grep', ['-rl', '/api/', 'app', 'components', 'lib'], {
    cwd: process.cwd(),
    encoding: 'utf-8',
  })
    .split('\n')
    .filter(Boolean);
  const trouves: Appel[] = [];
  for (const f of fichiers) {
    if (f === PLOMBERIE) continue;
    const src = readFileSync(resolve(process.cwd(), f), 'utf-8');
    for (const m of src.matchAll(/['"`](\/api\/[^'"`\s]+)['"`]/g)) {
      const brut = m[1].slice(4);
      // ⚠ Un lien est une LECTURE — mais la même chaîne sert aussi de premier
      // argument aux `fetch` de TÉLÉVERSEMENT, qui sont des POST. Les compter
      // en GET fabriquait trois « routes sans porte » qui n'existaient pas :
      // le relevé se trompait sur le verbe, pas sur le chemin. On écarte donc
      // tout chemin déjà relevé avec son verbe par l'extraction d'appels.
      if (dejaReleves.has(normaliser(brut))) continue;
      trouves.push({ appel: `GET ${normaliser(brut)}`, verbe: 'GET', brut, fichier: f });
    }
  }
  return trouves;
}

/**
 * ⚠ LE CLIENT DE RENDU SERVEUR — `lib/server-api.ts` — est un SECOND client,
 * pas de la plomberie. Il construit ses URL par `${apiUrl()}${path}` où `path`
 * arrive d'un helper interne : l'extraction par site d'appel ne le voit pas.
 *
 * Six chemins, mesurés une fois et nommés ici. C'est une borne FERMÉE à la
 * main plutôt que déclarée : le compte exact force à revenir le jour où un
 * septième apparaît.
 */
const CHEMINS_DU_RENDU_SERVEUR = [
  'GET /opac/chiffres',
  'GET /opac/constellation',
  'GET /opac/nouveautes',
  'GET /opac/search',
  'GET /opac/records/*',
  'GET /tenancy/home',
] as const;

/** Une exception dont la route EXISTE désormais : elle ne dit plus le vrai. */
function exceptionsPerimees(liste: Exception[], routes: Set<string>): string[] {
  return liste
    .filter((e) => routes.has(e.appel))
    .map((e) => `${e.appel} — la route EXISTE désormais, retirez cette exception (${e.nature})`);
}

/** Une exception pour un appel que plus aucun écran n'émet. */
function exceptionsOrphelines(liste: Exception[], appeles: Set<string>): string[] {
  return liste
    .filter((e) => !appeles.has(e.appel))
    .map((e) => `${e.appel} — plus aucun écran ne l’émet, retirez cette exception`);
}

describe('l’instrument, avant ce qu’il mesure', () => {
  it('lit un nombre plausible de routes, et des routes NOMMÉES', () => {
    // Témoin : sans lui, un chemin de lecture erroné rendrait un ensemble vide
    // et toutes les assertions ci-dessous passeraient sans rien vérifier.
    const routes = routesDeLApi();
    expect(routes.size).toBeGreaterThan(100);
    expect(routes).toContain('GET /opac/records/*');
    expect(routes).toContain('GET /depots/mes-depots');
    expect(routes).toContain('POST /depots/*/soumettre');
  });

  it('⚠ extrait un gabarit qui contient un ternaire à accents graves imbriqués', () => {
    // LE cas qui a fait mentir la première version de l'extracteur. Il vit
    // dans /admin/auteurs : `/authors${params.toString() ? `?${params}` : ''}`.
    // Une regex s'arrêtait au deuxième accent grave et rapportait `/*`.
    const auteurs = appelsDuFront().filter((c) => c.fichier.includes('admin/auteurs'));
    expect(auteurs.map((c) => c.appel)).toContain('GET /authors');
    expect(auteurs.map((c) => c.appel)).not.toContain('GET /*');
  });

  it('⚠ lit vraiment les VERBES, il ne les rabat pas tous sur GET', () => {
    // Sans ce témoin, un extracteur aveugle aux verbes rendrait `GET` partout
    // — et la moitié du garde serait décorative sans que rien ne le dise.
    const appels = appelsDuFront();
    const ecritures = appels.filter((a) => a.verbe !== 'GET');
    expect(new Set(ecritures.map((a) => a.appel)).size).toBeGreaterThan(0);
    expect(ecritures.length).toBe(NOMBRE_D_ECRITURES);
    expect(new Set(ecritures.map((a) => a.verbe))).toEqual(new Set(['POST', 'PATCH', 'DELETE']));
  });

  it('⚠ voit un appel séparé de sa parenthèse par un COMMENTAIRE', () => {
    // Témoin nommé sur ce que l'instrument POURRAIT manquer — jamais sur ce
    // qu'il trouve le plus facilement. `/admin/etablissement` porte cinq
    // lignes de commentaire entre `api(` et `'/auth/policy'` : la première
    // version de l'extracteur ne voyait pas l'appel du tout, et son silence
    // se lisait comme « rien à signaler ».
    const etab = appelsDuFront().filter((c) => c.fichier.includes('admin/etablissement'));
    expect(etab.map((c) => c.appel)).toContain('PATCH /auth/policy');
  });

  it('⚠ voit les TÉLÉVERSEMENTS, qui ne passent pas par le client JSON', () => {
    // `fetch('/api/…')` avec un FormData : le client `api` ne sait pas les
    // envoyer. C'est la surface la plus lourde du front, et la seule qu'un
    // garde bâti sur le seul client aurait laissée dehors.
    const appels = appelsDuFront().map((c) => c.appel);
    expect(appels).toContain('POST /cataloging/records/import-marc');
    expect(appels).toContain('POST /accounts/expected-students/import');
    expect(appels).toContain('POST /cataloging/records/*/digital-copy');
  });

  it('compte les appels du front — un compte, pas une présence', () => {
    // ⚠ Un témoin qui CONSTATE une présence confirme que l'outil tourne ; seul
    // un témoin qui COMPTE signale ce à quoi on n'a pas pensé. Ce chiffre
    // s'écrit en dur : un écran ajouté ou perdu par accident le fait tomber, et
    // c'est le moment de relire, pas de le rehausser sans regarder.
    expect(new Set(appelsDuFront().map((c) => c.appel)).size).toBe(NOMBRE_D_APPELS);
  });
});

describe('les appels du front', () => {
  it('⚠ les LIENS et le rendu serveur atteignent eux aussi de vraies routes', () => {
    // Deux canaux que l'extraction par site d'appel ne voit pas. Sans eux, le
    // garde déclare « sans porte » des routes que le front atteint — il l'a
    // fait, sur une route que je venais d'écrire.
    const routes = routesDeLApi();
    const liens = liensVersLApi();
    expect(liens.length).toBeGreaterThan(10); // témoin : le relevé a bien vu
    const inconnus = [
      ...new Set([...liens.map((l) => l.appel), ...CHEMINS_DU_RENDU_SERVEUR]),
    ].filter((a) => !routes.has(a));
    expect(inconnus).toEqual([]);
  });

  it('correspondent tous à une route de l’API', () => {
    const routes = routesDeLApi();
    const declarees = new Set(EXCEPTIONS.map((e) => e.appel));
    const inconnus = [
      ...new Map(
        appelsDuFront()
          .filter((c) => !routes.has(c.appel) && !declarees.has(c.appel))
          .map((c) => [c.appel, c]),
      ).values(),
    ];

    expect(
      inconnus.map((c) => `${c.appel}  (${c.brut})  ${c.fichier}`),
      inconnus.length === 0
        ? ''
        : [
            '',
            'Ces appels ne correspondent à aucune route de l’API.',
            'Trois issues, et une seule est un contournement :',
            '  • la route a été renommée, supprimée, ou son VERBE a changé →',
            '    CORRIGEZ L’APPEL, et signalez-le à la session backend dans',
            '    docs/passation.md ;',
            '  • l’appel est servi autrement (réécriture Next, tiers) →',
            '    déclarez-le dans EXCEPTIONS avec nature: "servi-ailleurs" ;',
            '  • c’est un défaut SUIVI → nature: "defaut-connu", avec sa date.',
            'Le troisième ne se prend jamais pour se débloquer.',
            '',
          ].join('\n'),
    ).toEqual([]);
  });

  it('⚠ une exception PÉRIMÉE est refusée', () => {
    // Une dette qui ne se rappelle pas d'elle-même n'est pas une dette, c'est
    // un oubli en attente. Le jour où la route revient, la ligne devient
    // fausse — et ce test la rejette au lieu de la laisser dormir.
    //
    // ⚠ EXCEPTIONS est VIDE aujourd'hui : sans le cas fabriqué ci-dessous,
    // cette assertion serait `expect([]).toEqual([])` — verte sans avoir rien
    // mesuré, exactement la forme que ce dépôt a appris à refuser.
    const routes = routesDeLApi();
    const fabriquee: Exception[] = [
      { appel: 'GET /depots/mes-depots', nature: 'defaut-connu', pourquoi: 'témoin' },
    ];
    expect(exceptionsPerimees(fabriquee, routes)).toHaveLength(1);
    expect(exceptionsPerimees(EXCEPTIONS, routes)).toEqual([]);
  });

  it('⚠ une exception ORPHELINE est refusée', () => {
    // Symétrique du précédent : une exception pour un appel que plus personne
    // n'émet reste écrite sans plus être vraie — la question même que ce
    // fichier pose au reste du code.
    const appeles = new Set(appelsDuFront().map((c) => c.appel));
    const fabriquee: Exception[] = [
      { appel: 'GET /plus-personne-ne-lappelle', nature: 'servi-ailleurs', pourquoi: 'témoin' },
    ];
    expect(exceptionsOrphelines(fabriquee, appeles)).toHaveLength(1);
    expect(exceptionsOrphelines(EXCEPTIONS, appeles)).toEqual([]);
  });
});
