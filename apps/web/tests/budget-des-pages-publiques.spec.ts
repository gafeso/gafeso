/**
 * LE BUDGET DE POIDS DES PAGES PUBLIQUES — mesuré, écrit, et gardé.
 *
 * Demandé par Jean le 9 octobre 2026 pour l'Université Virtuelle : *« utilisable
 * en 3G »*. Les étudiants sont dispersés et les réseaux coûtent.
 *
 * ## ⚠ CE QUE CE GARDE MESURE, ET CE QU'IL NE MESURE PAS
 *
 * Il pèse les **fragments statiques** (JS + CSS) qu'une page référence, en
 * **gzip**, lus dans le MANIFESTE d'un build de PRODUCTION. C'est la part
 * dominante sur un réseau lent, et la seule qu'on puisse peser sans serveur.
 *
 * ⚠ **Le document HTML n'y est PAS**, et il faut le dire plutôt que de laisser
 * croire à un total. Il se mesure sur un `next start` :
 *
 * ```
 * curl -s -H 'Accept-Encoding: gzip' -o /dev/null -w '%{size_download}' http://…/opac
 * ```
 *
 * ⚠ **Et le DEV ne mesure rien** : pas de minification, React de développement,
 * HMR. Toute mesure de poids se fait sur `next build` — c'est la même règle que
 * pour la CSP, et pour la même raison : le dev n'exerce pas ce qu'on vérifie.
 *
 * ## ⚠ POURQUOI IL EST GATÉ, ET CE QUE ÇA COÛTE
 *
 * Il a besoin d'un build. `npm test` tourne sans, et un garde qui échouerait
 * faute de build serait désactivé en une semaine. Il est donc **gaté sur la
 * PRÉSENCE du manifeste**, et il DIT ce qu'il n'a pas mesuré au lieu de passer
 * en silence — « un test qui ne peut pas mesurer n'est pas un test qui passe ».
 *
 * ⭐ Et c'est la borne honnête : **un garde que personne ne lance ne garde
 * rien**. `npm run budget` l'exécute, et il doit entrer dans le crochet de
 * pré-publication — c'est écrit en passation, ce n'est pas encore fait.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const RACINE = resolve(__dirname, '..');
const MANIFESTE = resolve(RACINE, '.next/app-build-manifest.json');
/**
 * ⚠⚠ GATÉ SUR `BUDGET=1`, COMME LES GARDES VIVANTS LE SONT SUR `PG_LIVE=1` — et
 * c'est une correction de ma première version, qui aurait rendu `npm test` ROUGE
 * dans tout clone sans build. La CI publique en est un.
 *
 * ⭐ La doctrine de ce dépôt est claire et j'y reviens : un test qui ne peut pas
 * mesurer ne doit pas PASSER en silence ; mais une porte fermée ne doit pas
 * casser la suite de ceux qui n'ont pas l'infrastructure. La sortie est la même
 * que pour la base de données — on GATE, et on s'assure que quelqu'un lance la
 * porte ouverte.
 *
 * ⚠ ET C'EST LA MOITIÉ QUI RESTE À FAIRE : `npm run budget` l'exécute (il
 * construit puis mesure), et il DOIT entrer dans le crochet de pré-publication.
 * Un garde que personne ne lance ne garde rien — écrit en passation, pas encore
 * fait, et c'est une dette nommée et non un oubli.
 */
const DEMANDE = process.env.BUDGET === '1';
/**
 * ⚠⚠ LE MANIFESTE SEUL NE DIT PAS SI LE BUILD EST DE PRODUCTION — et c'est un
 * défaut de ce garde, trouvé le 11 octobre 2026 sur lui-même.
 *
 * `next dev` écrit AUSSI `.next/app-build-manifest.json`. J'avais donc bâti en
 * production, mesuré, puis relancé le serveur de développement — qui a ÉCRASÉ
 * `.next/`. Relancé avec `BUDGET=1`, ce garde a annoncé que l'accueil pesait
 * **2 112 470 o** et réclamé 42 secondes de 3G : il mesurait les fragments NON
 * MINIFIÉS du mode développement.
 *
 * ⭐ Mon témoin du CSS l'a attrapé — « le CSS pèse 0 » — mais son message
 * envoyait au MAUVAIS endroit : « le relevé ne regarde pas au bon endroit ».
 * Le relevé regardait très bien ; c'est la MATIÈRE qui n'était pas la bonne.
 * Un message d'échec doit dire quoi faire, et celui-là faisait chercher un
 * défaut dans l'instrument.
 *
 * ⚠ C'est « l'instrument qui se trompe sur ce qu'il MESURE », dans sa forme la
 * plus bête : il lisait le bon fichier, dans le mauvais build.
 *
 * `BUILD_ID` discrimine, mesuré dans les deux états : absent en développement,
 * présent après `next build`.
 */
const BUILD_ID = resolve(RACINE, '.next/BUILD_ID');
const CONSTRUIT = DEMANDE && existsSync(MANIFESTE) && existsSync(BUILD_ID);
/** Un manifeste SANS `BUILD_ID` : c'est `next dev` qui a écrasé le build. */
const DEV_A_ECRASE = DEMANDE && existsSync(MANIFESTE) && !existsSync(BUILD_ID);

/**
 * LES BUDGETS, EN OCTETS GZIP (JS + CSS).
 *
 * ⚠ Mesurés le 9 octobre 2026 sur un build de production, et la marge est
 * VOLONTAIREMENT étroite : un budget large ne garde rien. Chaque cible porte la
 * mesure du jour, pour qu'on voie d'un coup d'œil ce qui a dérivé.
 *
 * ⚠ 3G ordinaire ≈ 50 Ko/s utiles. 150 Ko ≈ trois secondes de transfert, hors
 * latence — c'est le seuil au-delà duquel une page publique cesse d'être
 * utilisable sur le réseau des étudiants à distance.
 */
/*
 * ⚠ MESURES RÉÉCRITES LE 9 OCTOBRE 2026, APRÈS LE LOT rc9 — « réécrivez la
 * MESURE, pas le budget », et c'est ce qui est fait : les trois budgets sont
 * INCHANGÉS.
 *
 * | page | avant | après | écart | cause |
 * |---|---|---|---|---|
 * | accueil | 147 701 | 148 793 | +1 092 | le socle (libellés du lot) |
 * | /opac | 138 232 | 139 414 | +1 182 | le filtre « Lecture en ligne » |
 * | fiche | 139 408 | 142 069 | +2 661 | la COUVERTURE COMPOSÉE |
 *
 * ## ⚠ LOT QR, 11 OCTOBRE 2026 — et la marge de la fiche devient ÉTROITE
 *
 * | page | avant | après | écart | cause |
 * |---|---|---|---|---|
 * | accueil | 148 793 | 149 177 | +384 | fragment partagé |
 * | /opac | 139 414 | 139 798 | +384 | fragment partagé |
 * | **fiche** | 142 437 | **147 367** | **+4 930** | `uqr` (4 482 mesurés) + le bloc |
 * | affiche | — | 113 959 | neuve | composant SERVEUR |
 *
 * ⚠ RÉÉCRITES LE 11 OCTOBRE, APRÈS L'APERÇU DES ÉTIQUETTES : +377 à +431 sur
 * les quatre pages, par croissance du fragment PARTAGÉ. L'écran d'aperçu
 * lui-même (140 793 o) est du PERSONNEL et n'entre pas dans ce garde.
 *
 * ⚠ RÉÉCRITES APRÈS LA RÉCONCILIATION AVEC LE BACKEND (adresse canonique,
 * invariant du QR subordonné) : +84 à +137.
 *
 * ⚠ **IL NE RESTE QUE 2 065 o À LA FICHE.** C'est dit ici parce que la prochaine
 * addition à cet écran est un ARBITRAGE, plus une addition : il faudra choisir
 * entre alléger le socle, relever le budget en disant ce que ça coûte en 3G, ou
 * découper en morceaux chargés à la demande — ce qui échange des octets contre
 * une requête.
 *
 * ⚠ RÉÉCRITE UNE FOIS DE PLUS LE 11 OCTOBRE : la fiche passe à **142 437**
 * (+368). Le composant de couverture est désormais importé par DEUX routes — la
 * fiche et l'étagère hors ligne — et Next l'a déplacé dans un fragment
 * PARTAGÉ. L'accueil et `/opac` n'ont pas bougé d'un octet.
 *
 * ## ⭐⭐ ET LE POIDS QUE PAIE VRAIMENT UN VISITEUR N'A JAMAIS EU DE BUDGET
 *
 * Mesuré le 11 octobre 2026 sur un `next build` + `next start`, en lisant
 * l'en-tête `Content-Encoding` du serveur plutôt qu'en le supposant :
 *
 * | page | HTML gzip | fragments | TOTAL gzip | budget des FRAGMENTS | 3G |
 * |---|---|---|---|---|---|
 * | accueil | 15 874 | 148 793 | **164 667** | 160 000 | 3,3 s |
 * | /opac | 4 457 | 139 414 | **143 871** | 150 000 | 2,9 s |
 * | fiche | 7 428 | 142 437 | **149 865** | 150 000 | 3,0 s |
 *
 * ⚠ **CE N'EST PAS « LE BUDGET DE L'ACCUEIL EST DÉPASSÉ », et confondre les
 * deux serait exactement l'erreur que ce dépôt nomme** — comparer un total à un
 * budget qui, par construction, ne couvre que les fragments. L'en-tête de ce
 * fichier le dit depuis le premier jour : « Le document HTML n'y est PAS ».
 * Les trois budgets de fragments tiennent, et ils tiennent au chiffre près.
 *
 * ⭐ Ce que la mesure établit est autre chose : **le nombre qu'un visiteur paie
 * réellement n'est gardé par rien.** 164 667 o sur l'accueil, et le document
 * HTML y pèse 15 874 o gzip — presque quatre fois celui de `/opac`, parce que
 * l'accueil porte le contenu éditorial de l'école.
 *
 * ⚠ NON CORRIGÉ, et c'est une décision : aucun seuil n'a été dépassé, donc il
 * n'y a pas de défaut avéré. Donner un budget au TOTAL est un arbitrage de
 * produit — il faut choisir le chiffre, et le choisir engage ce qu'on refusera
 * demain. Rapporté à Jean le 11 octobre 2026.
 *
 * ⭐ LE PRIX DE LA COUVERTURE, MESURÉ : 2 661 o gzip de JS sur la fiche, plus
 * **326 o gzip de HTML** (pesé en retirant le SVG du document servi : 971 o
 * brut). Soit ≈ 3 Ko pour **zéro requête**.
 *
 * ⚠ Et c'est la comparaison qui décide, pas le chiffre nu : une vignette
 * d'image coûte une requête réseau — aller-retour compris, c'est ce qui coûte
 * en 3G, pas les octets. Les 481 notices de zinda partagent SIX fichiers de
 * couverture : l'image ne distinguait rien ET elle coûtait un aller-retour.
 *
 * Marge restante : 7 931 o sur la fiche, 10 586 sur /opac, 11 207 sur
 * l'accueil. Le socle commun pèse 122 241 o pour un budget de 130 000 — c'est
 * lui qui décide, et il n'a pas bougé du lot.
 */
const BUDGETS: Record<string, { cle: string; mesure: number; budget: number }> = {
  'accueil /': { cle: '/page', mesure: 149_638, budget: 160_000 },
  'résultats /opac': { cle: '/opac/page', mesure: 140_259, budget: 150_000 },
  'fiche /opac/[id]': { cle: '/opac/[id]/page', mesure: 147_935, budget: 150_000 },
  /**
   * ⭐ L'AFFICHE A4, ENTRÉE DANS CE GARDE LE 11 OCTOBRE 2026 — et elle y entre
   * parce qu'elle est PUBLIQUE. Le trou était déjà rapporté deux jours plus
   * tôt sous une autre forme : « le nombre qu'un visiteur paie n'est gardé par
   * rien ». Une page publique neuve sans budget en est le cas le plus simple,
   * et il ne coûtait qu'une ligne.
   *
   * Elle est plus LÉGÈRE que les trois autres (113 959 o) : c'est un composant
   * SERVEUR, il n'embarque donc ni la fiche cliente ni ses dépendances. Son
   * budget suit la même marge que les autres, ≈ 11 Ko.
   */
  'affiche /affiche/[id]': { cle: '/affiche/[id]/page', mesure: 114_055, budget: 125_000 },
};

/** ⚠ Le socle est COMMUN aux trois : il se garde une fois, et c'est là que tout se joue. */
const BUDGET_SOCLE = 130_000;

function fragments(cle: string): string[] {
  const man = JSON.parse(readFileSync(MANIFESTE, 'utf-8')) as {
    pages?: Record<string, string[]>;
  } & Record<string, unknown>;
  const pages = (man.pages ?? man) as Record<string, string[]>;
  return pages[cle] ?? [];
}

function gzipDe(rel: string): number {
  const p = resolve(RACINE, '.next', rel);
  if (!existsSync(p)) return 0;
  return gzipSync(readFileSync(p), { level: 9 }).length;
}

/**
 * Le CSS, pesé SUR LE DISQUE.
 *
 * ⚠⚠ MA PREMIÈRE VERSION RENDAIT ZÉRO, et c'est un contrôle négatif qui l'a
 * montré — pas une relecture. Elle cherchait les `.css` dans le MANIFESTE des
 * pages ; Next n'y met que du JS. Le garde additionnait donc « JS + 0 » en
 * affichant « CSS 0 » comme si c'était une mesure.
 *
 * ⚠ ET LE TÉMOIN DE DÉRIVE L'A ABSORBÉ : l'écart entre le réel (127 Ko) et la
 * mesure écrite (138 Ko) valait 8 %, sous le seuil de 10 %. Un seuil de
 * tolérance avale exactement les erreurs de l'ordre de sa propre taille — c'est
 * « un témoin qui AGRÈGE masque ce qu'il devrait désigner », appliqué à une
 * marge.
 *
 * ⚠ Et le témoin qui l'aurait vu tout de suite manquait : **le CSS ne peut pas
 * valoir zéro**. Il est écrit ci-dessous.
 */
function poidsCss(): number {
  const dossier = resolve(RACINE, '.next/static/css');
  if (!existsSync(dossier)) return 0;
  return readdirSync(dossier)
    .filter((f) => f.endsWith('.css'))
    .reduce((n, f) => n + gzipDe(join('static/css', f)), 0);
}

describe('le budget de poids des pages publiques', () => {
  it('⚠ la PORTE est-elle ouverte, et le build présent ?', () => {
    if (!DEMANDE) {
      // Porte fermée : on ne mesure rien, et on ne prétend rien. C'est
      // `npm run budget` qui l'ouvre.
      expect(CONSTRUIT).toBe(false);
      return;
    }
    // ⚠ PORTE OUVERTE ET PAS DE BUILD = ROUGE. Quelqu'un a demandé la mesure et
    // ne l'a pas obtenue : la taire serait exactement « un test qui ne peut pas
    // mesurer et qui passe quand même ».
    /*
     * ⚠ DEUX REFUS DISTINCTS, parce que les deux gestes ne sont pas les mêmes :
     * « il n'y a pas de build » se répare en construisant ; « le serveur de
     * développement a écrasé le build » se répare en l'ARRÊTANT d'abord, sans
     * quoi il réécrira `.next/` pendant la mesure suivante.
     */
    expect(
      DEV_A_ECRASE,
      '⚠ `.next/` porte un manifeste SANS `BUILD_ID` : c’est un build de ' +
        'DÉVELOPPEMENT. `next dev` possède ce dossier et l’a écrasé — mesurer ' +
        'ici pèserait les fragments NON MINIFIÉS, et le chiffre serait faux ' +
        'de plus d’un ORDRE DE GRANDEUR (2,1 Mo mesurés une fois, contre 149 Ko). ' +
        'ARRÊTEZ le serveur de développement, puis `npm run budget`.',
    ).toBe(false);
    expect(
      CONSTRUIT,
      'BUDGET=1 demandé mais aucun manifeste de build : lancez `npm run budget`, ' +
        'qui construit AVANT de mesurer.',
    ).toBe(true);
    expect(fragments('/page').length).toBeGreaterThan(3);
  });

  describe.runIf(CONSTRUIT)('les trois pages tiennent dans leur budget', () => {
    const css = CONSTRUIT ? poidsCss() : 0;

    it.each(Object.entries(BUDGETS))('%s', (nom, { cle, mesure, budget }) => {
      const js = fragments(cle).reduce((n, f) => n + gzipDe(f), 0);
      const total = js + css;
      expect(
        total,
        `${nom} pèse ${total} o gzip (JS ${js} + CSS ${css}), budget ${budget} o. ` +
          `Mesuré le 9 octobre 2026 : ${mesure} o. ` +
          `DEUX ISSUES — alléger (le socle d’abord : il est commun aux trois), ou ` +
          `relever le budget EN DISANT ce que ça coûte à un étudiant en 3G ` +
          `(≈ 50 Ko/s utiles, donc ${Math.round(total / 50_000 * 10) / 10} s de transfert).`,
      ).toBeLessThanOrEqual(budget);
    });

    it('⚠ le SOCLE commun aux trois tient dans le sien', () => {
      // C'est lui qui décide : le propre de chaque page est petit (6 à 16 Ko),
      // le socle fait 120. Alléger une page sans toucher au socle ne gagne rien.
      const communs = ['/page', '/opac/page', '/opac/[id]/page']
        .map((c) => new Set(fragments(c)))
        .reduce((a, b) => new Set([...a].filter((x) => b.has(x))));
      const poids = [...communs].reduce((n, f) => n + gzipDe(f), 0);
      expect(
        poids,
        `Le socle commun pèse ${poids} o gzip. C'est ce que TOUTE page publique ` +
          `paie, y compris la première visite d'un étudiant en 3G.`,
      ).toBeLessThanOrEqual(BUDGET_SOCLE);
    });

    it('⚠ témoin : le CSS ne peut pas valoir ZÉRO', () => {
      // Celui qui manquait. Ma première version cherchait les `.css` dans le
      // manifeste des pages, où Next n'en met pas : elle rendait 0, et le total
      // était faux de la taille du CSS. Un témoin de PRÉSENCE l'aurait dit
      // immédiatement — c'est la forme la moins chère de ce fichier.
      expect(css, 'le CSS pèse 0 : le relevé ne regarde pas au bon endroit').toBeGreaterThan(
        2_000,
      );
    });

    it('⚠ témoin : les mesures écrites ne sont pas périmées de plus de 10 %', () => {
      // Un budget dont la mesure de référence a dérivé ne dit plus rien de ce
      // qu'on a accepté. Ce témoin convoque pour réécrire la mesure, pas pour
      // relever le budget.
      for (const [nom, { cle, mesure }] of Object.entries(BUDGETS)) {
        const total = fragments(cle).reduce((n, f) => n + gzipDe(f), 0) + css;
        const ecart = Math.abs(total - mesure) / mesure;
        expect(
          ecart,
          `${nom} : la mesure écrite (${mesure} o) s'écarte de ${Math.round(ecart * 100)} % ` +
            `du réel (${total} o). Réécrivez la MESURE — pas le budget.`,
        ).toBeLessThan(0.1);
      }
    });
  });
});
