/**
 * OÙ LA COUVERTURE COMPOSÉE EST BRANCHÉE — une OBLIGATION, pas un balayage.
 *
 * `docs/specification-couverture-composee.md` pose, en première obligation :
 * *« un document a une couleur, pas une couleur par écran. »* La teinte vient
 * de `category`. **Une surface qui ne reçoit pas `category` ne peut donc pas
 * composer** — elle rendrait tout en teinte 0, c'est-à-dire la vraie couleur
 * de la médecine, sur des documents qui n'en sont pas.
 *
 * ## ⚠ CE QUE J'AI MESURÉ, le 9 octobre 2026, contre l'API de développement
 *
 * | Route | `category` | `recordType` |
 * |---|---|---|
 * | `GET /opac/search` | ✅ `'droit'` | ✅ |
 * | `GET /opac/records/:id` | ✅ `'sciences'` | ✅ |
 * | `GET /opac/parcourir` | 🔴 **ABSENT** | ✅ |
 * | `GET /opac/nouveautes` | 🔴 **ABSENT** | ✅ |
 *
 * D'où la forme de ce fichier : chaque surface publique qui montre une
 * vignette est **branchée**, ou **déclarée non-branchée AVEC SON MOTIF**. Une
 * surface neuve n'est dans aucune des deux listes, et le test échoue en disant
 * les deux issues.
 *
 * ⚠ ET LA MOITIÉ QUI S'EFFACE D'ELLE-MÊME : pour chaque surface non branchée,
 * le garde exige que le TYPE du front ne déclare pas `category`. Le jour où le
 * backend la sert et où quelqu'un l'ajoute au type, le motif devient faux et
 * ce test REFUSE en nommant la surface. *Une dette qui ne se rappelle pas
 * d'elle-même n'est pas une dette, c'est un oubli en attente.*
 */
import fs from 'node:fs';
import path from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CouvertureV3 } from '@/components/couverture-v3';
import { TEINTE_DU_DOMAINE } from '@/lib/couvertures-v3.generated';
import { FicheNotice } from '@/app/opac/[id]/fiche-notice';

/**
 * ⚠ LES OBJETS SONT FABRIQUÉS UNE FOIS, HORS DE LA FABRIQUE.
 *
 * Un `useRouter: () => ({ push: vi.fn() })` rend un objet NEUF à chaque appel.
 * Posé dans un tableau de dépendances d'effet, il relance l'effet à chaque
 * rendu — boucle infinie, puis worker mort à court de mémoire. Le symptôme ne
 * ressemble pas à sa cause : une suite qui MEURT au lieu d'échouer.
 */
const PARAMS = { id: 'r1' };
const ROUTER = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
const RECHERCHE = new URLSearchParams();

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  useParams: () => PARAMS,
  usePathname: () => '/opac/r1',
  useRouter: () => ROUTER,
  useSearchParams: () => RECHERCHE,
}));

const RACINE = path.resolve(__dirname, '..');
const sourceDe = (rel: string) => fs.readFileSync(path.join(RACINE, rel), 'utf8');

/**
 * ⭐⭐ IL N'Y A PLUS QU'UNE GÉNÉRATION. La couverture dessinée de rc8 est
 * SUPPLANTÉE et retirée du dépôt le 12 octobre 2026 (décision) : la seule
 * référence est la v3 — 8 gabarits, texte aux positions de
 * `positions-textes.json`, graine FNV-1a + xorshift32.
 *
 * ⚠ Le champ `generation` reste, et il ne vaut que `'v3'`. Le garder plutôt que
 * de le retirer laisse la place à la prochaine génération SANS réécrire
 * l'inventaire — et le témoin ci-dessous refuse qu'une surface déclare autre
 * chose en douce.
 */
const COMPOSANT = 'CouvertureV3';
const COMPOSANT_DE = { v3: COMPOSANT } as const;

interface Surface {
  ecran: string;
  compose: boolean;
  /** Le fichier qui déclare le type de la charge reçue par cet écran. */
  typeDans: string;
  /** Le nom de l'interface à lire dans ce fichier. */
  type: string;
  /**
   * ⚠ LE NOM DU CHAMP, PAR SURFACE — et ce n'est pas une complication gratuite.
   * `/reader/hors-ligne` sert le domaine sous le nom `domaine`, pas `category`.
   * Mesuré le 11 octobre 2026 : c'est LA MÊME CHAÎNE (5 baux comparés contre
   * `GET /opac/records/:id`, zéro écart), mais un garde qui chercherait
   * `category` en dur déclarerait cette surface « sans domaine » et refuserait
   * un branchement parfaitement juste. C'est « un grep sur un nom ne prouve pas
   * qu'on lit la chose qui le porte », appliqué à un SYNONYME.
   */
  champ: string;
  /**
   * Comment ce type déclare `category` AUJOURD'HUI — et c'est le lien
   * mécanique du motif : s'il change, le motif est à relire.
   */
  /**
   * ⚠ QUATRE NATURES, ET LA DERNIÈRE EST DATÉE.
   *
   * `requis` est la seule nature saine pour une surface qui compose : un `?`
   * veut dire « parfois absente », donc une teinte de repli sur un écran qui
   * compose — la couleur FAUSSE que l'obligation ① interdit.
   *
   * ⭐ `en-attente` nomme l'intervalle : la route ne sert pas encore le champ,
   * la vignette emploie le repli PRESCRIT (`manuel` / `autre`, fond neutre qui
   * n'affirme aucun domaine), et le motif NOMME la route attendue. Un témoin
   * exige ce nom — sans quoi la nature deviendrait l'endroit où l'on enterre
   * les surfaces mal servies.
   */
  categorie: 'absent' | 'optionnel' | 'requis' | 'en-attente';
  /**
   * ⭐⭐ LA GÉNÉRATION, et elle est TRANSITOIRE PAR MESURE, pas par goût.
   *
   * Mesuré le 12 octobre 2026 : `coverTemplate` et `coverDomain` ne sont servis
   * que par `GET /opac/records/:id`. Les deux surfaces qui lisent cette route
   * portent donc la v3 ; les deux autres gardent la v2, faute des deux clés.
   *
   * ⚠ Et on ne replie PAS côté front : « si vous le refaites, vous le referez
   * autrement, et trois clients composeraient trois couvertures pour un même
   * document » *(session backend)*. Dériver `coverDomain` de `category` ici
   * serait exactement cela.
   *
   * ⭐ Le compte par génération CONVOQUE : le jour où les champs arrivent sur
   * les autres routes, il tombe et quelqu'un bascule.
   */
  generation: 'v3';
  motif: string;
}

const SURFACES: Surface[] = [
  {
    ecran: 'app/opac/auteurs/[id]/fiche-auteur.tsx',
    generation: 'v3',
    compose: true,
    typeDans: 'app/opac/auteurs/[id]/fiche-auteur.tsx',
    type: 'Work',
    champ: 'coverDomain',
    categorie: 'requis',
    motif:
      'MESURÉ le 15 octobre 2026 sur l’objet ENTIER servi par ' +
      '`GET /opac/authors/:id` : chaque œuvre porte `coverDomain, coverTemplate, ' +
      'recordId, recordType, title, year`. La fiche publique d’un auteur est une ' +
      'page de DÉCOUVERTE — on y arrive sans savoir ce que la personne a écrit — ' +
      'donc la vignette y fait plus que décorer : elle distingue les domaines ' +
      'd’un coup d’œil dans une liste qui n’a ni auteur ni éditeur à afficher.',
  },
  {
    ecran: 'app/mes-encadrements/page.tsx',
    generation: 'v3',
    compose: true,
    typeDans: 'app/mes-encadrements/page.tsx',
    type: 'Encadrement',
    champ: 'coverDomain',
    categorie: 'requis',
    motif:
      '`EncadrementsService` type les deux clés LÀ-BAS (`coverTemplate: ' +
      'CoverTemplate`, `coverDomain: CoverDomain`) et les sert ; on ne les dérive ' +
      'donc pas ici. ⚠ La colonne n’a pas d’intitulé visible : la vignette porte ' +
      '`aria-hidden` et ne dit rien de plus que le titre d’à côté — un en-tête la ' +
      'ferait annoncer deux fois à un lecteur d’écran.',
  },
  {
    ecran: 'app/affiche/[id]/page.tsx',
    generation: 'v3',
    compose: true,
    typeDans: 'app/affiche/[id]/page.tsx',
    type: 'Notice',
    champ: 'category',
    categorie: 'requis',
    motif:
      'l’affiche A4 lit la notice par `noticePublique()`, donc la charge de ' +
      '`GET /opac/records/:id`, qui sert `category`. ⚠ Et la couverture y est un ' +
      'ORNEMENT : les navigateurs n’impriment pas les fonds par défaut, donc elle ' +
      'peut disparaître à l’impression — rien d’essentiel n’en dépend, tout le ' +
      'contenu de l’affiche est du texte et un tracé noir.',
  },
  {
    ecran: 'app/mes-prets/page.tsx',
    generation: 'v3',
    compose: true,
    typeDans: 'app/mes-prets/page.tsx',
    type: 'CurrentLoan',
    champ: 'coverDomain',
    categorie: 'requis',
    motif:
      '`GET /reader/loans` sert `coverTemplate` et `coverDomain` depuis le ' +
      '13 octobre 2026 (mesuré sur l’objet entier, via `PatronsService.loansOfPatron`). ' +
      '⭐ Cette ligne a porté la nature `en-attente` pendant un jour, avec le nom de ' +
      'la route manquante ; elle est devenue FAUSSE à l’arrivée du champ et le garde ' +
      'est tombé — c’est ainsi qu’on l’a su. ⚠ Et la vignette n’est PAS sur le ' +
      'tableau des RÉSERVATIONS du même écran : « circulation, holds et patrons ' +
      'restent en lien texte, par décision ». La table de l’HISTORIQUE n’en porte pas ' +
      'non plus, et son type ne déclare donc pas les clés.',
  },
  {
    ecran: 'app/mes-consultations/page.tsx',
    generation: 'v3',
    compose: true,
    typeDans: 'app/mes-consultations/page.tsx',
    type: 'Consultation',
    champ: 'coverDomain',
    categorie: 'requis',
    motif:
      '`GET /reader/consultations` sert `coverTemplate` et `coverDomain` depuis le ' +
      '12 octobre 2026 (mesuré). La vignette est en 56×78, donc en MINIATURE : aucun ' +
      'texte — à cette taille un titre ferait 3,7 px. Elle DOUBLE le titre de sa ' +
      'ligne, affiché juste à côté, donc elle reste décorative.',
  },
  {
    ecran: 'app/mes-documents-hors-ligne/page.tsx',
    generation: 'v3',
    compose: true,
    typeDans: 'app/mes-documents-hors-ligne/page.tsx',
    type: 'DocumentHorsLigne',
    champ: 'domaine',
    categorie: 'requis',
    motif:
      '`GET /reader/hors-ligne` sert `domaine` depuis le 11 octobre 2026, et c’est LA ' +
      'MÊME CHAÎNE que `category` — 5 baux comparés contre `GET /opac/records/:id`, ' +
      'zéro écart. La teinte est donc celle du document. Couverture en 56×76, donc ' +
      'INITIALE SEULE : la spécification tranche ce cas pour les petites vignettes.',
  },
  {
    ecran: 'app/opac/[id]/fiche-notice.tsx',
    generation: 'v3',
    compose: true,
    typeDans: 'app/opac/[id]/fiche-notice.tsx',
    type: 'RecordDetail',
    champ: 'category',
    categorie: 'requis',
    motif:
      '`GET /opac/records/:id` sert `category` — mesuré : « sciences ». La ' +
      'teinte est donc celle du document, et pas un repli.',
  },
  {
    ecran: 'app/sections-differees.tsx',
    generation: 'v3',
    compose: true,
    typeDans: 'lib/server-api.ts',
    type: 'NoticeANouveaute',
    champ: 'coverDomain',
    categorie: 'requis',
    motif:
      '⭐ RENVERSÉ LE 13 OCTOBRE 2026, et son ancien motif disait exactement ce qui ' +
      'a changé : « `GET /opac/nouveautes` ne sert PAS `category` — composer ici ' +
      'donnerait la teinte 0 à six notices quelconques, et la MÊME notice aurait une ' +
      'autre couleur sur sa fiche. Rapporté au backend. » La route sert désormais ' +
      '`coverTemplate` et `coverDomain` (mesuré sur l’objet entier), donc la teinte ' +
      'est celle du document et elle s’accorde avec sa fiche. ' +
      '⚠ Et la v3 remplace ici le TITRE DANS UN CADRE, pas une image : quand ' +
      '`coverUrl` existe, c’est la vraie couverture du document qui s’affiche — un ' +
      'dessin ne prend jamais la place d’une photographie.',
  },

  {
    ecran: 'app/opac/page.tsx',
    generation: 'v3',
    compose: true,
    typeDans: 'app/opac/page.tsx',
    type: 'Hit',
    champ: 'coverDomain',
    categorie: 'requis',
    motif:
      'Cet écran lit DEUX routes, et les DEUX servent les clés depuis le 13 octobre ' +
      '2026 (mesuré sur l’objet entier après rebase) : `GET /opac/search` et ' +
      '`GET /opac/parcourir`. ⭐ Cette ligne a porté la nature `en-attente` une ' +
      'journée, avec le nom de la route manquante, et elle est devenue FAUSSE à ' +
      'l’arrivée du champ — deuxième fois en deux jours que cette nature se solde ' +
      'd’elle-même. ⚠ Et la mesure qui l’avait motivée était à l’écran : ' +
      '`/opac?numeriques=1` rendait 20 vignettes au repli NEUTRE, là où ' +
      '`/opac?q=droit` en rendait 20 au `#8A4A00` du domaine.',
  },
];

/**
 * Comment une interface déclare un champ : `absent`, `optionnel` ou `requis`.
 *
 * ⚠ LES TROIS, ET PAS DEUX — c'est un contrôle négatif qui l'a exigé. Ma
 * première version ne demandait que « le champ est-il déclaré ? », et elle a
 * REFUSÉ `app/opac/page.tsx` en disant « le motif est périmé ». Il ne l'était
 * pas : `Hit` déclare bien `category`, en OPTIONNEL, précisément parce que
 * `parcourir` ne la sert pas. Mon lien mécanique testait autre chose que le
 * motif que j'avais écrit à côté.
 *
 * ⚠ C'est « une obligation déclarée vérifie qu'on a RÉPONDU, pas que la
 * réponse est VRAIE », retourné contre le garde : la déclaration était juste,
 * et c'est la VÉRIFICATION qui portait sur une autre propriété. Une obligation
 * ne vaut que si son contrôle mesure le motif, pas un motif voisin.
 */
type Declaration = 'absent' | 'optionnel' | 'requis';

function declarationDe(fichier: string, nom: string, champ: string): Declaration {
  const src = sourceDe(fichier);
  const i = src.indexOf(`interface ${nom} {`);
  expect(i, `interface ${nom} introuvable dans ${fichier}`).toBeGreaterThan(-1);
  const reste = src.slice(i);
  const fin = reste.search(/\n\}/);
  expect(fin, `fin de l’interface ${nom} introuvable`).toBeGreaterThan(-1);
  const corps = reste.slice(0, fin);
  // ⚠ Témoin de LECTURE sur la MATIÈRE, jamais sur les trouvailles : une
  // interface a toujours des champs, et c'est ce qui prouve qu'on l'a lue.
  const tous = Array.from(corps.matchAll(/^\s{2}(\w+)(\??):/gm));
  expect(tous.length, `aucun champ lu dans ${nom} — l’interface a-t-elle été lue ?`)
    .toBeGreaterThan(2);
  const trouve = tous.find((m) => m[1] === champ);
  if (!trouve) return 'absent';
  return trouve[2] === '?' ? 'optionnel' : 'requis';
}

describe('l’inventaire des surfaces', () => {
  it('chaque surface est branchée, ou déclarée non-branchée AVEC SON MOTIF', () => {
    // ⚠ Témoin de COMPTE : une surface ajoutée à la liste sans être traitée
    // ci-dessous convoque quelqu'un.
    /*
     * ⚠ 6 DEPUIS LE 12 OCTOBRE 2026 : `/mes-consultations` a reçu sa vignette
     * quand `GET /reader/consultations` a servi les deux clés. Le compte a
     * CONVOQUÉ — c'est ainsi qu'on l'a su, et non par une relecture.
     */
    expect(SURFACES).toHaveLength(9);
    for (const s of SURFACES) {
      expect(s.motif.length, `motif trop court pour ${s.ecran}`).toBeGreaterThan(60);
    }
    /*
     * ⚠ 6 DEPUIS LE 13 OCTOBRE 2026 : la liste de l'OPAC a reçu sa vignette.
     * Cinquième convocation de ce compte en deux jours — à chaque surface
     * neuve, et jamais par une relecture.
     */
    /*
     * ⚠ 7 DEPUIS LE 13 OCTOBRE 2026 : l'étagère des nouveautés a basculé quand
     * la route a servi les clés. SIXIÈME convocation de ce compte en trois
     * jours — une par surface neuve, et jamais par une relecture.
     */
    expect(SURFACES.filter((s) => s.compose)).toHaveLength(9);
  });

  it('une surface BRANCHÉE importe le composant, et reçoit `category` À COUP SÛR', () => {
    for (const s of SURFACES.filter((x) => x.compose)) {
      const attendu = COMPOSANT_DE[s.generation];
      expect(sourceDe(s.ecran), `${s.ecran} doit importer ${attendu}`).toContain(attendu);
      /*
       * ⚠ TÉMOIN D'ABSENCE : une surface ne porte PAS les deux générations. Les
       * deux composants coexistent le temps que les champs arrivent, et c'est
       * exactement le moment où un écran peut en importer deux — l'un mort,
       * l'autre vivant.
       */
      /*
       * ⚠ TÉMOIN D'ABSENCE : l'ancienne couverture est RETIRÉE du dépôt, et
       * aucun écran ne doit la rappeler — un import mort compile tant que le
       * fichier existe, et il n'existe plus.
       */
      expect(
        sourceDe(s.ecran),
        `${s.ecran} importe encore la couverture supplantée`,
      ).not.toContain('couverture-composee');
      // ⚠ REQUIS, pas « déclaré ». Un `category?:` voudrait dire « parfois
      // absente », donc une teinte de repli sur un écran qui compose — et
      // c'est exactement la couleur fausse que l'obligation ① interdit.
      /*
       * ⚠ `en-attente` est toléré, et seulement avec un motif qui NOMME la
       * route manquante. C'est ce qui la distingue d'un `optionnel` posé pour
       * se débarrasser du garde.
       */
      if (s.categorie === 'en-attente') {
        expect(
          s.motif,
          `${s.ecran} : une attente doit NOMMER la route qui ne sert pas encore le champ`,
        ).toMatch(/GET \/[a-z/-]+/);
      } else {
        expect(
          s.categorie,
          `${s.ecran} compose : ${s.type} doit déclarer \`${s.champ}\` en REQUIS`,
        ).toBe('requis');
      }
    }
  });

  it('une surface NON branchée n’importe pas le composant', () => {
    for (const s of SURFACES.filter((x) => !x.compose)) {
      expect(sourceDe(s.ecran), `${s.ecran} ne doit pas composer`).not.toContain(
        COMPOSANT,
      );
    }
  });

  /**
   * ⭐ LA MOITIÉ QUI S'EFFACE D'ELLE-MÊME.
   *
   * Chaque motif repose sur la façon dont le type déclare `category`. Ce test
   * confronte la déclaration ÉCRITE à celle que porte la source : le jour où
   * le backend sert `category` sur `parcourir` ou `nouveautes` et où quelqu'un
   * met le type à jour, le motif devient faux et ce test REFUSE en nommant la
   * surface et les deux issues.
   *
   * *Une dette qui ne se rappelle pas d'elle-même n'est pas une dette, c'est
   * un oubli en attente.*
   */
  it('la déclaration du champ de domaine de chaque type est ENCORE celle du motif', () => {
    for (const s of SURFACES) {
      const reelle = declarationDe(s.typeDans, s.type, s.champ);
      /*
       * ⭐⭐ CE QUI REND L'ATTENTE AUTO-EFFAÇANTE. Une surface `en-attente`
       * écrit le champ en `?` dans son type, puisque la route ne le sert pas.
       * Le jour où elle le sert, le type passe en REQUIS — et la nature
       * déclarée devient alors FAUSSE, donc ce cas tombe et quelqu'un vient la
       * retirer.
       *
       * ⚠ C'est le lien mécanique, pas une convention : « une dette qui ne se
       * rappelle pas d'elle-même n'est pas une dette, c'est un oubli en
       * attente ».
       */
      const attendue = s.categorie === 'en-attente' ? 'optionnel' : s.categorie;
      expect(
        reelle,
        `⚠ ${s.type} (${s.typeDans}) déclare \`${s.champ}\` en « ${reelle} », ` +
          `alors que le motif de ${s.ecran} suppose « ${s.categorie} ». Le motif ` +
          `est à RELIRE. Deux issues — branchez la couverture composée sur cet ` +
          `écran si la teinte y est désormais sûre, ou réécrivez le motif en ` +
          `disant pourquoi elle ne l'est pas.`,
      ).toBe(attendue);
    }
  });

  /**
   * ⚠ LA SECONDE POPULATION, DÉRIVÉE — et sa borne est écrite.
   *
   * L'inventaire déclaré ci-dessus est l'autorité : il est sémantique (« quels
   * écrans montrent la vignette d'une notice ? »), et aucun motif ne répond à
   * cette question. Ce témoin ne fait que l'autre moitié : il refuse qu'un
   * écran emploie l'un des DEUX mécanismes connus sans être déclaré.
   *
   * ⚠ Sa borne : un écran qui montrerait une vignette d'une TROISIÈME façon
   * lui est invisible. C'est « un garde dont la population dérive de la chose
   * qu'il cherche » — et c'est pourquoi la liste déclarée existe.
   */
  it('aucun écran n’emploie un mécanisme de vignette sans être déclaré', () => {
    const fichiers: string[] = [];
    const parcourir = (dir: string) => {
      for (const e of fs.readdirSync(path.join(RACINE, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) parcourir(rel);
        else if (/\.tsx?$/.test(e.name)) fichiers.push(rel);
      }
    };
    parcourir('app');
    parcourir('components');

    const declares = new Set(SURFACES.map((s) => s.ecran));
    const employeurs = fichiers.filter((f) => {
      if (f.includes('couverture-v3')) return false;
      const src = sourceDe(f);
      return src.includes(COMPOSANT) || /src=\{[^}]*coverUrl/.test(src);
    });

    // Témoin de PRÉSENCE : un balayage qui ne trouve RIEN passerait tout seul.
    expect(employeurs.length, 'le balayage n’a lu aucun écran').toBeGreaterThan(0);
    expect(
      employeurs.filter((f) => !declares.has(f)),
      'écran(s) montrant une vignette de notice et absent(s) de SURFACES — ' +
        'déclarez-le : `compose: true` s’il reçoit `category`, ou ' +
        '`compose: false` AVEC SON MOTIF.',
    ).toEqual([]);
  });
});

/* ───────────────────────────── l'EFFET, sur l'écran ───────────────────────── */

const NOTICE = {
  /*
   * ⚠ LA DOUBLURE SERT LES DEUX CLÉS, parce que la VRAIE route les sert
   * (mesuré). Sans elles, mon repli « mort et gardé » tirait et la couverture
   * sortait à la teinte d'`autre` — un test vert aurait alors validé un écran
   * dont la teinte ne vient PAS du domaine. « Une doublure est une hypothèse,
   * et un test vert ne confirme que moi. »
   */
  coverTemplate: 'manuel',
  coverDomain: 'litterature',
  id: 'r1',
  title: 'Contes et transmission orale au Burkina Faso',
  titleComplement: null,
  author: 'Kaboré, Alain',
  contributors: [],
  isbn: null,
  publishYear: 2024,
  embargoUntil: null,
  language: 'fr',
  category: 'litterature',
  publisher: null,
  publicationCity: null,
  defenseUniversity: null,
  defensePlace: null,
  summary: null,
  keywords: [],
  items: [],
  availability: null,
  digitalCopy: null,
  membersOnly: false,
  hasDigital: false,
};

function monter() {
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
  return render(<FicheNotice initial={NOTICE as never} />);
}
afterEach(() => vi.unstubAllGlobals());

describe('la couverture de la fiche, mesurée sur l’écran', () => {
  /**
   * ⭐⭐ LA FICHE PORTE LA v3 DEPUIS LE 12 OCTOBRE 2026, et la mesure change de
   * FORME avec elle : la v3 n'est plus un `<svg>` mais un `<div aria-hidden>`
   * — fond de domaine en CSS, motif inline, texte en HTML.
   *
   * ⚠ Et la TEINTE ne vient plus de la table des douze : elle vient de
   * `TEINTE_DU_DOMAINE`, la table de §9, lue par le module engendré. Un
   * changement de §9 convoque donc ce test — c'est le lien mécanique qu'on
   * veut, et il remplace celui de la table précédente.
   */
  it('la fiche rend UNE couverture v3, de la teinte de son domaine', () => {
    monter();
    const couv = document.querySelector('div[aria-hidden="true"]');
    expect(couv, 'aucune couverture v3 sur la fiche').toBeTruthy();
    // `litterature` → `#8A1F55`, lu dans §9 et porté par le module engendré.
    expect(TEINTE_DU_DOMAINE.litterature).toBe('#8A1F55');
    expect((couv as HTMLElement).style.background).toContain('rgb(138, 31, 85)');
    /*
     * ⚠ TÉMOIN D'ABSENCE : la teinte de l'ANCIENNE table ne doit plus être là.
     * Sans lui, un écran qui porterait les deux générations passerait.
     */
    expect(document.body.innerHTML).not.toContain('#6E2F1B');
  });

  /**
   * ⭐⭐ LA RÈGLE QUI AUTORISE `aria-hidden`, MESURÉE PAR SON EFFET.
   *
   * La couverture est décorative parce qu'elle DOUBLE un texte déjà affiché.
   * Ce n'est pas une intention : c'est une propriété, et elle se compte — tout
   * texte que porte la couverture doit exister AILLEURS dans la page.
   *
   * ⚠ Aucune forme n'est inspectée ici. C'est ce qui RESTE qui est compté :
   * poser `recordType` sur la couverture — alors que la fiche ne l'affiche
   * nulle part en texte — ferait tomber ce test, et c'est exactement le défaut
   * qu'on veut barrer (une information accessible à l'œil seul).
   */
  it('tout texte de la couverture est AUSSI affiché en texte ailleurs', () => {
    monter();
    /*
     * ⚠ C'est `div`, pas `svg` : la v3 rend son texte en HTML. La règle, elle,
     * ne change pas — et c'est elle qui interdit de poser `recordType` sur la
     * couverture de la fiche, puisque la fiche ne l'affiche NULLE PART.
     */
    verifierRedondance(document.querySelector('div[aria-hidden="true"]')!);
  });

  /**
   * ⭐ LA MÊME RÈGLE, SUR LA SECONDE SURFACE — et c'est ce qui rend la règle
   * utile plutôt que décorative : elle ne vaut que si elle s'applique à toute
   * surface qui compose, sinon la suivante échappe par construction.
   *
   * Sur l'étagère, la couverture fait 56×76 : elle ne porte donc QUE
   * l'INITIALE du titre, qui est un fragment du titre affiché à côté. La
   * redondance est satisfaite.
   *
   * ⚠ ET MA PREMIÈRE RÉDACTION AFFIRMAIT UNE GARANTIE QUE CE CAS N'A PAS :
   * « si quelqu'un agrandissait la vignette au-dessus de 80 px sans afficher
   * l'auteur ni l'année, ce cas tomberait ». Mesuré par un contrôle négatif —
   * il ne tombe PAS. L'appel de l'étagère ne passe ni `auteur` ni `annee` :
   * agrandie, la couverture ne porterait que des lignes de titre, qui sont
   * affichées. La redondance reste donc vraie, et c'est la LISIBILITÉ qui
   * souffrirait.
   *
   * ⭐ Ce qui tient réellement le choix des 56×76 est le cas voisin
   * `espace-lecteur-rendu.spec.tsx` : « l'étagère rend une couverture à
   * l'INITIALE SEULE ». Lui tombe si on agrandit.
   */
  /**
   * ⭐ LA MÊME RÈGLE SUR L'ÉTAGÈRE — et la v3 y répond plus franchement.
   *
   * À 56 px la v3 passe en MINIATURE : aucun texte du tout. La redondance est
   * donc satisfaite trivialement, et c'est mieux qu'une initiale — à cette
   * taille, une initiale seule est une information que personne ne lit.
   *
   * ⚠ Mesuré : le titre y ferait 3,7 px (33 × 56/500).
   */
  it('⚠ et sur l’ÉTAGÈRE hors ligne : la miniature ne porte AUCUN texte', () => {
    const html = renderToStaticMarkup(
      <CouvertureV3 coverTemplate="these" coverDomain="arts" titre="Textiles et motifs" largeur={56} />,
    );
    const texte = html.replace(/<[^>]+>/g, '').trim();
    expect(texte, 'la miniature porte du texte illisible à 56 px').toBe('');
    // ⚠ Et elle emploie le logo SYMBOLE, pas l'horizontal.
    expect(html).toContain('gafeso_icone_simplifiee.svg');
  });

  function verifierRedondance(svg: Element) {
    // ⚠ LES FEUILLES SEULEMENT. `querySelectorAll('text, tspan')` rendait
    // AUSSI le `<text>` parent, dont le `textContent` est la concaténation de
    // ses lignes SANS séparateur — « Contes ettransmissionorale auBurkina
    // Faso », une chaîne qui n'existe nulle part et que rien ne pouvait
    // satisfaire. L'instrument accusait le produit.
    /*
     * ⚠ DEUX GÉNÉRATIONS, DEUX FORMES DE TEXTE. La v2 écrit dans des `<text>`
     * SVG ; la v3 écrit du HTML. Un relevé qui ne connaît que la première rend
     * ZÉRO sur la seconde — et le témoin de compte accuse alors la couverture
     * de « ne porter aucun texte », alors que c'est l'instrument qui regarde
     * ailleurs. « Un motif syntaxique ne voit que la forme qu'on a imaginée. »
     */
    const enSvg = Array.from(svg.querySelectorAll('text')).flatMap((t) => {
      const lignes = Array.from(t.querySelectorAll('tspan'));
      return lignes.length > 0 ? lignes : [t];
    });
    const enHtml =
      enSvg.length > 0
        ? []
        : Array.from(svg.querySelectorAll('div, span')).filter((n) => n.children.length === 0);
    const portes = [...enSvg, ...enHtml]
      .map((n) => (n.textContent ?? '').trim().replace(/…$/, ''))
      .filter((t) => t.length > 0);

    // Témoin de COMPTE : un SVG sans texte passerait la boucle sans rien dire.
    expect(portes.length, 'la couverture ne porte aucun texte').toBeGreaterThan(2);

    svg.remove(); // on retire la couverture, et on relit la page SANS elle
    const dehors = (document.body.textContent ?? '').replace(/\s+/g, ' ');
    for (const t of portes) {
      expect(
        dehors,
        `⚠ « ${t} » n’est porté QUE par la couverture, qui est aria-hidden : ` +
          'invisible pour un lecteur d’écran. Affichez ce champ en texte sur ' +
          'l’écran, ou retirez-le de la couverture.',
      ).toContain(t.replace(/\s+/g, ' '));
    }
  }

  /**
   * ⭐⭐ L'INVARIANT A CHANGÉ PAR DÉCISION, ET IL EST PLUS FORT.
   *
   * La v2 ne demandait AUCUNE requête : tout était inline. La v3 porte un
   * logo, et le fournisseur le répétait — 9 670 octets dans CHACUN des huit
   * gabarits, 92 % du plus léger. Jean a tranché : « sers les gabarits comme
   * fichiers statiques mis en cache, logo défini une seule fois ».
   *
   * ⚠ Donc « aucune requête » est faux, et le dire resterait un faux
   * dispositif. Ce qui le remplace est la propriété qui compte VRAIMENT —
   * et elle est plus forte, parce qu'elle porte sur N couvertures :
   *
   * > ⭐ **Une page qui montre N couvertures ne demande qu'UNE image.** Même
   * > URL pour toutes : le navigateur la demande une fois, et le cache la
   * > rend ensuite. C'est la seule chose qui rendait « zéro requête »
   * > désirable — pas le zéro lui-même.
   */
  it('⭐ N couvertures ne demandent qu’UNE image, et c’est un fichier DÉJÀ public', () => {
    const { container } = monter();
    const couv = container.querySelector('div[aria-hidden="true"]')!;

    // ⚠ Le motif reste INLINE : aucune requête pour lui.
    expect(couv.querySelectorAll('svg image, svg use').length).toBe(0);

    const images = Array.from(container.querySelectorAll('img'));
    const adresses = new Set(images.map((n) => n.getAttribute('src')));
    expect(adresses.size, 'plus d’une adresse d’image : le cache ne sert plus').toBeLessThanOrEqual(1);
    for (const a of adresses) {
      /*
       * ⚠ TÉMOIN D'ABSENCE, et il tient la décision de DROITS : le tracé du
       * fournisseur est retenu de la publication. Un `src` vers
       * `/couvertures/` signifierait qu'on le recopie dans `public/`.
       */
      expect(a, 'la couverture doit employer le logo DÉJÀ public').toBe(
        '/marque/gafeso_horizontal.svg',
      );
    }
    // ⚠ Et il est BLANCHI en CSS plutôt que servi en seconde variante.
    if (images[0]) expect(images[0].style.filter).toContain('invert(1)');
  });

  /**
   * ⭐ LA MESURE QUI PROUVE LE « N → 1 ». Trois couvertures montées ensemble ne
   * doivent toujours donner qu'UNE adresse — sans quoi la mise en cache ne
   * sert à rien et une liste de vingt notices demanderait vingt fichiers.
   */
  it('⭐ trois couvertures côte à côte : toujours UNE seule adresse', () => {
    const html = renderToStaticMarkup(
      <>
        <CouvertureV3 coverTemplate="these" coverDomain="droit" titre="A" largeur={56} />
        <CouvertureV3 coverTemplate="memoire" coverDomain="arts" titre="B" largeur={56} />
        <CouvertureV3 coverTemplate="article" coverDomain="sciences" titre="C" largeur={56} />
      </>,
    );
    const adresses = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1]);
    expect(adresses).toHaveLength(3);
    expect(new Set(adresses).size, 'trois adresses différentes : N requêtes au lieu d’une').toBe(1);
  });
});
