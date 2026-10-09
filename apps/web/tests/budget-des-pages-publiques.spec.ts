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
const CONSTRUIT = DEMANDE && existsSync(MANIFESTE);

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
const BUDGETS: Record<string, { cle: string; mesure: number; budget: number }> = {
  'accueil /': { cle: '/page', mesure: 147_701, budget: 160_000 },
  'résultats /opac': { cle: '/opac/page', mesure: 138_232, budget: 150_000 },
  'fiche /opac/[id]': { cle: '/opac/[id]/page', mesure: 139_408, budget: 150_000 },
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
