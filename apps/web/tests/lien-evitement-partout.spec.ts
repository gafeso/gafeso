/**
 * Tout écran qui porte une barre de navigation porte un lien d'évitement.
 *
 * ⚠ POURQUOI UN TEST DE SOURCE, ET PAS UN TEST DE RENDU. La présence du lien se
 * vérifie écran par écran en jsdom — mais jsdom ne dit RIEN de celui qui sera
 * écrit demain. Cet invariant-là ne se tient qu'en partant des FICHIERS : une
 * page publique ajoutée sans lien d'évitement doit faire échouer la suite, y
 * compris quand personne n'a pensé à écrire son test.
 *
 * ⚠ ET IL PORTE AUSSI LA CIBLE. Un lien d'évitement qui pointe sur un `id` que
 * personne ne pose est pire qu'absent : il occupe la première tabulation et ne
 * mène nulle part. Les deux moitiés se vérifient donc ensemble.
 *
 * Ce que ce test ne couvre PAS, et qui est dit plutôt que tu : que le lien soit
 * VISIBLE au focus. Cela dépend d'une règle CSS et d'une mise en page, dont
 * jsdom n'a ni l'une ni l'autre — trois mesures au navigateur ont été
 * nécessaires, elles sont consignées dans `globals.css`.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const lire = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * Source débarrassée de ses commentaires.
 *
 * ⚠ ÉCRIT APRÈS COUP, PARCE QUE LE TEST S'EST TROMPÉ À SA PREMIÈRE EXÉCUTION.
 * Il annonçait un `<main>` sans cible dans `admin-shell.tsx` : le cinquième
 * n'était pas du code, c'était le commentaire qui RACONTE l'absence corrigée
 * — « ⚠ `<main>` MANQUAIT ICI ». L'instrument fabriquait sa trouvaille.
 *
 * ⚠ Et la circonstance mérite d'être écrite : j'ai signalé ce défaut exact à la
 * session back le soir même, sur son garde `motifEcrans`, avant de l'écrire
 * moi-même dans l'heure. Le retrait se fait donc PAR BLOCS et non ligne à ligne
 * — les lignes de continuation d'un commentaire JSX ne portent aucun marqueur,
 * c'est précisément ce qui l'avait pris en défaut.
 */
/**
 * ⚠ PAR ÉTAT DE LIGNE, PLUS PAR EXPRESSION RÉGULIÈRE — 22 septembre 2026.
 *
 * L'ancienne version enchaînait trois `replace` multilignes, dont
 * `\{\s*\/\*[\s\S]*?\*\/\s*\}` pour les commentaires JSX. Elle a mangé
 * **2 262 caractères** de `mes-encadrements` — soixante-dix lignes, les deux
 * `<main>` compris — parce qu'une ACCOLADE D'INTERFACE suivie d'un JSDoc lui
 * ressemble mot pour mot :
 *
 *     interface Donnees {
 *       /** ⚠ … *␟/          ← vu comme l'ouverture d'un `{\/* … *\/}`
 *
 * …et le non-gourmand se referme alors sur le PREMIER vrai `*␟/}` venu, ici
 * soixante-dix lignes plus bas. Le fichier ne déclarait plus aucun `<main>`.
 *
 * ⚠ ET LE DÉFAUT ÉTAIT INVISIBLE tant que la population était une liste de cinq
 * fichiers écrite à la main : aucun des cinq n'avait cette forme. C'est en
 * DÉRIVANT la population qu'il est apparu — l'élargissement d'un garde éprouve
 * l'instrument autant que le code.
 *
 * Le suivi d'état par ligne est la forme que ce dépôt a retenue le 11 septembre
 * 2026, pour ce défaut exact, dans un autre garde.
 */
function sansCommentaires(src: string): string {
  const gardees: string[] = [];
  let dansCommentaire = false;
  for (const ligne of src.split('\n')) {
    const nette = ligne.trim();
    if (dansCommentaire) {
      if (nette.includes('*/')) dansCommentaire = false;
      continue;
    }
    if (nette.startsWith('//')) continue;
    if (nette.startsWith('/*') || nette.startsWith('{/*')) {
      if (!nette.includes('*/')) dansCommentaire = true;
      continue;
    }
    gardees.push(ligne);
  }
  return gardees.join('\n');
}

/**
 * Les entrées qui posent une barre de navigation, et doivent donc l'offrir.
 *
 * ⚠ DÉRIVÉE, PLUS ÉCRITE À LA MAIN — 13 septembre 2026, et ça a coûté deux
 * défauts. La liste nommait trois fichiers ; le garde s'appelle « partout ».
 * Entre-temps `/mes-prets` et `/profil` ont reçu leur propre `<Header />`, donc
 * leur propre navigation, et AUCUN lien d'évitement : un usager au clavier
 * traversait tout le menu à chaque visite, sur les deux écrans personnels les
 * plus fréquentés d'un lecteur.
 *
 * Une liste de fichiers tenue à la main est une déclaration en prose sur un
 * artefact qu'on ne compile pas : elle SERA fausse. Le critère mécanique est
 * ici évident — qui rend `<Header />` porte une navigation.
 */
function fichiersRendant(motif: string): string[] {
  const { execFileSync } = require('node:child_process') as typeof import('node:child_process');
  return execFileSync('grep', ['-rl', motif, 'app', 'components', '--include=*.tsx'], {
    cwd: process.cwd(),
    encoding: 'utf-8',
  })
    .split('\n')
    .filter(Boolean)
    .sort();
}

const AVEC_NAVIGATION = [
  ...fichiersRendant('<Header'),
  // La coque publique du catalogue : elle pose sa navigation sans `<Header />`.
  'app/opac/layout.tsx',
  'app/page.tsx',
].filter((f, i, t) => t.indexOf(f) === i);

/**
 * Les fichiers qui rendent un `<main>` — DÉRIVÉS, plus déclarés.
 *
 * ⚠ CETTE LISTE ÉTAIT ÉCRITE À LA MAIN : cinq chemins. Mesuré le 22 septembre
 * 2026 : **23 fichiers rendent un `<main>`**, et la moitié gardée du garde en
 * couvrait cinq. Le reproche que l'en-tête de ce fichier adresse aux listes
 * tenues à la main — « elle SERA fausse » — valait donc pour sa propre seconde
 * moitié.
 *
 * ⚠ ET 23 N'ÉTAIT PAS 23 DÉFAUTS. Le tri, qui est tout l'intérêt de la mesure :
 *
 * · **3 défauts réels** — `/opac/[id]/lire`, `/opac/auteurs/[id]`,
 *   `/opac/[id]/not-found` : leur `<main>` ne portait pas `id={ID_CONTENU}`,
 *   et le layout `/opac` rend pourtant le lien. **Le lien d'évitement de ces
 *   trois pages ne menait nulle part.** Corrigés le 22 septembre.
 * · **2 défauts d'une autre nature** — `/admin/catalogue/[id]` et
 *   `/admin/collections/[id]` rendaient leur PROPRE `<main>` dans leur branche
 *   de chargement, IMBRIQUÉ dans celui de la coque. Corrigés aussi.
 * · **4 écrans sans aucune barre** — `login`, `inscription`,
 *   `definir-mot-de-passe`, `e/[slug]` : pas de navigation, donc pas de lien
 *   d'évitement, donc aucune cible à porter. Ils sont EXCLUS par mesure, pas
 *   par liste.
 * · le reste : des `<main>` cités dans des COMMENTAIRES.
 */
function mainsRendus(source: string): string[] {
  return sansCommentaires(source).match(/<main\b[^>]*>/g) ?? [];
}

function fichiersRendantUnMain(): string[] {
  // ⚠ Un `<main>` cité dans un COMMENTAIRE n'est pas un `<main>` rendu —
  // `admin-shell` en porte un qui RACONTE l'absence corrigée en septembre, et
  // deux écrans du personnel portent désormais la note « pas de main ici ».
  return fichiersRendant('<main ').filter((f) => mainsRendus(lire(f)).length > 0);
}

/**
 * ⚠ DÉCLARÉS SANS BARRE, DONC SANS CIBLE — et c'est MESURÉ, pas supposé : ces
 * quatre écrans ne rendent ni `<Header>`, ni `<nav>`, ni `<LienDEvitement>`.
 * Le jour où l'un d'eux gagne une barre, le témoin d'en dessous le dit.
 */
const SANS_BARRE = [
  'app/login/page.tsx',
  'app/inscription/page.tsx',
  'app/definir-mot-de-passe/page.tsx',
  'app/e/[slug]/page.tsx',
];

const PORTEURS_DE_CIBLE = fichiersRendantUnMain().filter((f) => !SANS_BARRE.includes(f));

describe('l’instrument, avant ce qu’il mesure', () => {
  it('⚠ témoin SYNTHÉTIQUE — une accolade suivie d’un JSDoc n’est pas un commentaire JSX', () => {
    // ⚠ LE DÉFAUT EXACT QUE L'ANCIENNE VERSION PORTAIT, en entrée fabriquée :
    // elle voyait dans `interface X {` + `/** … */` l'ouverture d'un `{/* … */}`
    // et se refermait sur le premier `*/}` venu — soixante-dix lignes plus bas,
    // emportant tout ce qu'il y avait entre les deux.
    //
    // Le témoin est un BLOC D'ENTRÉE, pas une valeur : il passe par tout le
    // chemin de l'instrument, et c'est la seule forme qui éprouve les lignes
    // que la dernière n'exerce pas.
    const bloc = [
      'interface Donnees {',
      '  /** une note. */',
      '  champ: boolean;',
      '}',
      'const a = <main id={ID_CONTENU}>x</main>;',
      "        {/* un vrai commentaire JSX",
      '            sur plusieurs lignes */}',
      'const b = <main id={ID_CONTENU}>y</main>;',
    ].join('\n');
    expect(mainsRendus(bloc)).toHaveLength(2);
  });

  it('⚠ et un `<main>` cité dans un commentaire ne compte pas', () => {
    const bloc = ['// <main> manquait ici', '/* <main> aussi */', 'const c = 1;'].join('\n');
    expect(mainsRendus(bloc)).toHaveLength(0);
  });

  it('témoin de COMPTE — la population dérivée n’est ni vide ni la liste d’avant', () => {
    // Cinq chemins étaient écrits à la main ; 23 fichiers rendent un `<main>`,
    // dont quatre écrans sans barre, exclus par mesure.
    expect(PORTEURS_DE_CIBLE.length).toBeGreaterThan(8);
    expect(PORTEURS_DE_CIBLE).toContain('components/admin-shell.tsx');
    // ⚠ Les trois qui manquaient, et dont le lien ne menait nulle part.
    expect(PORTEURS_DE_CIBLE).toContain('app/opac/[id]/lire/page.tsx');
    expect(PORTEURS_DE_CIBLE).toContain('app/opac/[id]/not-found.tsx');
    // Témoin d'ABSENCE sur la confusion plausible : un écran SANS barre.
    expect(PORTEURS_DE_CIBLE).not.toContain('app/login/page.tsx');
  });

  it('⚠ les écrans déclarés SANS BARRE n’en ont toujours aucune', () => {
    // Refusé dans les deux sens : le jour où l'un d'eux gagne un en-tête, il
    // doit sortir de cette liste et recevoir sa cible.
    for (const f of SANS_BARRE) {
      const src = lire(f);
      expect(src, `${f} porte désormais une barre : retirez-le de SANS_BARRE`).not.toMatch(
        /<Header|<nav\b|LienDEvitement/,
      );
    }
  });
});

describe('⚠ la population est DÉRIVÉE, pas déclarée', () => {
  it('elle voit les écrans que la liste écrite à la main ratait', () => {
    // ⚠ TÉMOIN NOMMÉ sur ce que l'instrument POURRAIT manquer. Ces deux écrans
    // ont reçu leur propre en-tête après l'écriture du garde, et sont restés
    // sans lien d'évitement parce que personne n'a pensé à allonger la liste.
    expect(AVEC_NAVIGATION).toContain('app/mes-prets/page.tsx');
    expect(AVEC_NAVIGATION).toContain('app/profil/page.tsx');
  });

  it('et elle en voit un nombre plausible', () => {
    // Un compte, pas une présence : le jour où un écran porte un en-tête sans
    // lien d'évitement, c'est CE test qui convoque — avant même l'assertion.
    expect(AVEC_NAVIGATION.length).toBeGreaterThanOrEqual(8);
  });
});

describe('Lien d’évitement', () => {
  it.each(AVEC_NAVIGATION)('%s rend <LienDEvitement />', (fichier) => {
    expect(lire(fichier)).toContain('<LienDEvitement />');
  });

  it.each(PORTEURS_DE_CIBLE)('%s pose id={ID_CONTENU} sur chacun de ses <main>', (fichier) => {
    const src = lire(fichier);
    const mains = sansCommentaires(src).match(/<main\b[^>]*>/g) ?? [];
    // ⚠ Un témoin qui COMPTE : chaque `<main>` du fichier, pas « au moins un ».
    // La fiche d'une notice en a DEUX — celui du chargement et celui du contenu
    // — et le lien doit fonctionner pendant le chargement aussi.
    expect(mains.length).toBeGreaterThan(0);
    expect(mains.filter((m) => m.includes('id={ID_CONTENU}'))).toHaveLength(mains.length);
  });

  it('la cible est une seule chaîne, déclarée à un seul endroit', () => {
    const src = lire('components/lien-evitement.tsx');
    expect(src).toContain("export const ID_CONTENU = 'contenu'");
    expect(src).toContain('href={`#${ID_CONTENU}`}');
  });

  /** ⚠ Témoin : la lecture regarde bien les fichiers, et sait dire non. */
  it('témoin — un fichier sans lien est bien vu comme tel', () => {
    expect(lire('app/opac/page.tsx')).not.toContain('<LienDEvitement />');
  });

  /**
   * ⚠ TÉMOIN DU RETRAIT DES COMMENTAIRES, sur le cas qui a pris le test en
   * défaut. `admin-shell.tsx` PARLE de `<main>` dans un commentaire : un relevé
   * qui le compte lit du texte, pas du code.
   *
   * ⚠ LA PROPRIÉTÉ EST L'ÉCART, PAS LE TOTAL. Les comptes absolus ont changé le
   * 14 septembre 2026 — l'écran « module éteint » a été extrait dans son propre
   * composant, emportant un `<main>` — et le témoin a convoqué quelqu'un, ce qui
   * est sa fonction. Mais un total se périme à chaque ajout ; l'ÉCART de un, lui,
   * dit exactement ce que ce témoin existe pour dire.
   */
  it('témoin — un <main> cité dans un commentaire n’est pas compté', () => {
    const brut = lire('components/admin-shell.tsx');
    expect(brut).toContain('`<main>` MANQUAIT ICI');
    const avec = (brut.match(/<main\b[^>]*>/g) ?? []).length;
    const sans = (sansCommentaires(brut).match(/<main\b[^>]*>/g) ?? []).length;
    // Exactement un de plus dans la source brute : celui qui est cité.
    expect(avec - sans).toBe(1);
    // Et un compte exact sur le CODE, qui convoque le jour où il change.
    expect(sans).toBe(3);
  });
});
