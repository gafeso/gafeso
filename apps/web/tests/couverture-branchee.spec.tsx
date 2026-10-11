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

import { CouvertureComposee } from '@/components/couverture-composee';
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

const COMPOSANT = 'CouvertureComposee';

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
  categorie: 'absent' | 'optionnel' | 'requis';
  motif: string;
}

const SURFACES: Surface[] = [
  {
    ecran: 'app/affiche/[id]/page.tsx',
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
    ecran: 'app/mes-documents-hors-ligne/page.tsx',
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
    compose: false,
    typeDans: 'lib/server-api.ts',
    type: 'NoticeANouveaute',
    champ: 'category',
    categorie: 'absent',
    motif:
      '`GET /opac/nouveautes` ne sert PAS `category` (mesuré). Composer ici ' +
      'donnerait la teinte 0 à six notices quelconques, et la MÊME notice ' +
      'aurait une autre couleur sur sa fiche. La grille garde donc son image ' +
      'partagée — moins bonne, mais pas FAUSSE. Rapporté au backend.',
  },
  {
    ecran: 'app/opac/page.tsx',
    compose: false,
    typeDans: 'app/opac/page.tsx',
    type: 'Hit',
    champ: 'category',
    categorie: 'optionnel',
    motif:
      '`GET /opac/search` sert `category`, mais `GET /opac/parcourir` ne la ' +
      'sert pas — et les DEUX alimentent `result.hits` sur cet écran. Une ' +
      'liste mi-composée changerait de couleur selon le MODE, pour le même ' +
      'document. Cet écran ne montre aucune vignette aujourd’hui : ne pas ' +
      'composer n’y retire rien. Rapporté au backend.',
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
    expect(SURFACES).toHaveLength(5);
    for (const s of SURFACES) {
      expect(s.motif.length, `motif trop court pour ${s.ecran}`).toBeGreaterThan(60);
    }
    expect(SURFACES.filter((s) => s.compose)).toHaveLength(3);
  });

  it('une surface BRANCHÉE importe le composant, et reçoit `category` À COUP SÛR', () => {
    for (const s of SURFACES.filter((x) => x.compose)) {
      expect(sourceDe(s.ecran), `${s.ecran} doit importer ${COMPOSANT}`).toContain(
        COMPOSANT,
      );
      // ⚠ REQUIS, pas « déclaré ». Un `category?:` voudrait dire « parfois
      // absente », donc une teinte de repli sur un écran qui compose — et
      // c'est exactement la couleur fausse que l'obligation ① interdit.
      expect(
        s.categorie,
        `${s.ecran} compose : ${s.type} doit déclarer \`${s.champ}\` en REQUIS`,
      ).toBe('requis');
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
      expect(
        reelle,
        `⚠ ${s.type} (${s.typeDans}) déclare \`${s.champ}\` en « ${reelle} », ` +
          `alors que le motif de ${s.ecran} suppose « ${s.categorie} ». Le motif ` +
          `est à RELIRE. Deux issues — branchez la couverture composée sur cet ` +
          `écran si la teinte y est désormais sûre, ou réécrivez le motif en ` +
          `disant pourquoi elle ne l'est pas.`,
      ).toBe(s.categorie);
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
      if (f.includes('couverture-composee')) return false;
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
  it('la fiche rend UNE couverture, de la teinte du domaine', () => {
    monter();
    const svg = document.querySelector('svg[aria-hidden="true"]');
    expect(svg, 'aucune couverture composée sur la fiche').toBeTruthy();
    // `litterature` → teinte 10, « rouille ». Lue dans la table, donc un
    // changement de table convoque ce test aussi.
    expect(svg!.innerHTML).toContain('#6E2F1B');
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
    verifierRedondance(document.querySelector('svg[aria-hidden="true"]')!);
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
  it('⚠ et sur l’ÉTAGÈRE hors ligne aussi — sinon la règle ne vaut rien', () => {
    const html = renderToStaticMarkup(
      <CouvertureComposee
        notice={{ titre: 'Textiles et motifs', domaine: 'arts' }}
        largeur={56}
        hauteur={76}
      />,
    );
    // L'écran de l'étagère est monté dans `espace-lecteur-rendu.spec.tsx` ;
    // ici on vérifie la propriété du COUPLE couverture/texte tel que la carte
    // l'assemble : l'initiale est contenue dans le titre affiché.
    const initiale = (html.match(/>([^<]+)<\/text>/) ?? [])[1] ?? '';
    expect(initiale, 'la couverture de 56×76 doit porter une initiale').toHaveLength(1);
    expect(
      'Textiles et motifs',
      `l’initiale « ${initiale} » n’est pas dans le titre affiché à côté`,
    ).toContain(initiale);
  });

  function verifierRedondance(svg: Element) {
    // ⚠ LES FEUILLES SEULEMENT. `querySelectorAll('text, tspan')` rendait
    // AUSSI le `<text>` parent, dont le `textContent` est la concaténation de
    // ses lignes SANS séparateur — « Contes ettransmissionorale auBurkina
    // Faso », une chaîne qui n'existe nulle part et que rien ne pouvait
    // satisfaire. L'instrument accusait le produit.
    const portes = Array.from(svg.querySelectorAll('text'))
      .flatMap((t) => {
        const lignes = Array.from(t.querySelectorAll('tspan'));
        return lignes.length > 0 ? lignes : [t];
      })
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

  it('la couverture n’ajoute AUCUNE requête à la fiche', () => {
    const { container } = monter();
    const svg = container.querySelector('svg[aria-hidden="true"]')!;
    expect(svg.querySelectorAll('image, use').length).toBe(0);
    expect(svg.outerHTML).not.toMatch(/https?:|<image|\ssrc=/);
    // ⚠ Et l'EFFET global : la fiche ne demande aucune image.
    expect(container.querySelectorAll('img').length).toBe(0);
  });
});
