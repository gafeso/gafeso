import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * ⭐⭐ UNE OBLIGATION, PAS UN BALAYAGE.
 *
 * Le défaut de rc13 — un formulaire modifiable AVANT ses données — se cherche
 * mal par motif : il n'a pas de forme commune. `/admin/accueil` rendait ses
 * champs vides, `/admin/etablissement` les rend remplis de VALEURS PAR DÉFAUT,
 * et un troisième les rendra autrement. « Un motif syntaxique ne voit que la
 * forme qu'on a imaginée. »
 *
 * Chaque écran d'administration est donc **couvert**, ou **déclaré non couvert
 * AVEC SON MOTIF**. Un écran neuf n'est dans aucune des deux listes, et ce test
 * échoue en disant les DEUX issues — c'est la forme de `LIGNES_PARTAGEES` et de
 * `colonnes-ecrivables`, la seule qui ne se périme pas toute seule.
 *
 * ⚠ ET LA DETTE SE REFUSE DANS LES DEUX SENS : un écran déclaré « à migrer »
 * qui passe par `FormulaireCharge` fait TOMBER ce test. Une dette qui ne se
 * rappelle qu'en s'aggravant laisserait passer sa propre résolution.
 */

type Nature =
  | 'migre'
  /** ⚠ MESURÉ : rend un champ modifiable AVANT ses données. La dette est datée. */
  | 'a-migrer'
  /**
   * ⚠ MESURÉ : l'écran distingue DÉJÀ les phases à la main — un `return` précoce
   * conditionné à l'absence de la donnée chargée. Le migrer serait un remaniement
   * sans défaut à corriger. Cette nature est VÉRIFIÉE plus bas : une déclaration
   * qu'on ne mesure pas est une prose qu'on croit sur parole.
   */
  | 'garde-a-la-main'
  /** Ne charge rien avant de rendre. */
  | 'sans-chargement'
  /** Charge, mais n'écrit jamais : un affichage trop tôt n'écrase rien. */
  | 'lecture-seule';

/*
 * ⚠⚠ CETTE LISTE A ÉTÉ ÉCRITE DEUX FOIS, ET LA PREMIÈRE ÉTAIT UNE HISTOIRE.
 *
 * Elle déclarait TREIZE écrans « à migrer », chacun avec un motif plausible —
 * « un enregistrement prématuré vide une notice publiée », « élargit un droit en
 * silence ». Aucun n'avait été mesuré : ils venaient d'un balayage de FORME et
 * d'une famille connue dans laquelle les cas se rangeaient bien.
 *
 * Mesuré ensuite, instrument à quatre témoins dont un d'ABSENCE : ONZE des
 * quatorze écrans portent DÉJÀ leur garde. « Une entrée de backlog écrite sans
 * mesure est une hypothèse qui gagne l'autorité d'un fait en étant classée » —
 * et treize dettes fausses auraient fait remanier onze écrans qui vont bien.
 *
 * Ce qui m'a arrêté n'est pas une relecture : c'est d'avoir LU LE CODE des deux
 * premiers que j'allais migrer. `regles-de-circulation` distingue ses trois
 * états à la main ; `catalogue/[id]` sort sur « if (!record) » avant tout
 * formulaire.
 */

const ECRANS: Record<string, { nature: Nature; motif: string }> = {
  /* ───────────────────────────────────────────────────────────────────────
   * ⭐⭐ LES SIX ÉCRANS QUE LE PRÉDICAT NE VOYAIT PAS — 3 novembre 2026.
   *
   * Ils n'appellent l'API que par `api<T>(…)`, et `\bapi\(` ne matchait pas
   * cette forme. Ils rendaient des champs, ils chargeaient, et ils étaient dans
   * AUCUNE des deux listes — le garde vert sur une population amputée.
   *
   * ⚠ La nature de chacun est MESURÉE, pas devinée : on a compté ses écritures
   * (`method:`, `POST`/`PATCH`/`DELETE`), ses `<form>`, ses `onSubmit` et ses
   * `disabled`.
   * ─────────────────────────────────────────────────────────────────────── */
  'journal/page.tsx': {
    nature: 'lecture-seule',
    motif:
      'ses champs sont un FORMULAIRE DE FILTRE : il porte un <form> et un ' +
      'onSubmit, et sa soumission RELIT le journal — zéro écriture mesurée ' +
      '(aucun method:, aucun POST/PATCH/DELETE). Rien ne peut être soumis trop ' +
      'tôt : soumettre, ici, c’est lire.',
  },
  'rapport-annuel/page.tsx': {
    nature: 'lecture-seule',
    motif:
      'un sélecteur d’année et rien d’autre : aucun <form>, aucun onSubmit, ' +
      'zéro écriture mesurée. Le champ CHOISIT ce qu’on lit.',
  },
  'rappels/page.tsx': {
    nature: 'lecture-seule',
    motif:
      'des filtres sur la liste des rappels : aucun <form>, aucun onSubmit, ' +
      'zéro écriture mesurée. ⚠ Le déclenchement manuel des rappels vit sur une ' +
      'AUTRE surface — cet écran ne fait que lire.',
  },
  'statistiques/page.tsx': {
    nature: 'lecture-seule',
    motif:
      'deux champs de date et une granularité, qui bornent la LECTURE : aucun ' +
      '<form>, aucun onSubmit, zéro écriture mesurée.',
  },
  /* ⚠ LES DEUX SUIVANTS ÉCRIVENT, et c'est une DETTE DATÉE — pas un « garde
   * déjà ». Mesuré : leur seul `disabled` protège de la DOUBLE soumission
   * (`saving`, `enCours`), jamais de l'attente des options chargées. Les
   * déclarer « garde-a-la-main » serait une affirmation que le code ne porte
   * pas, et l'obligation exigerait une épreuve d'effet qui ne pourrait pas
   * passer. */
  'catalogue/page.tsx': {
    nature: 'a-migrer',
    motif:
      'formulaire de CRÉATION de notice : il poste /cataloging/records avec un ' +
      '`category` et un `recordType` dont les options arrivent par chargement. ' +
      'Son `disabled={saving}` ne protège que de la double soumission — on peut ' +
      'donc soumettre avant que les vocabulaires soient là. ⚠ DETTE du ' +
      '3 novembre 2026, trouvée en élargissant le prédicat ; non corrigée ici ' +
      'parce qu’un écran de création de notice ne se migre pas à la veille ' +
      'd’une v1.',
  },
  'depots-soumis/page.tsx': {
    nature: 'a-migrer',
    motif:
      'il poste un `directorId` choisi dans une liste de directeurs CHARGÉE. ' +
      'Son `disabled={enCours === d.id}` ne protège que de la double ' +
      'soumission. ⚠ Même dette, même date, même motif de report.',
  },
  'accueil/page.tsx': {
    nature: 'migre',
    /*
     * ⚠ ET LE DRAPEAU ÉCRIT À LA MAIN NE COUVRAIT QUE LA MOITIÉ DES CAS.
     * Mesuré avant migration, par l'effet : sur ÉCHEC de chargement l'écran
     * retombait dans le rendu ordinaire — DEUX boutons soumissibles et un
     * formulaire rempli d'EMPTY_CONTENT. Enregistrer effaçait la page
     * d'accueil. Et l'appel partait quel que soit le droit : une personne sans
     * la fonction déclenchait un 403 que NOUS provoquions.
     */
    motif:
      'le défaut d’origine, et le seul des trois qui soit grave : 22 champs, ' +
      '3 appels, des états partis de constantes (EMPTY_CONTENT, #0F2B46) et un ' +
      'échec de chargement qui laissait un formulaire soumissible derrière lui',
  },
  'moissonnage/page.tsx': {
    nature: 'garde-a-la-main',
    /*
     * ⚠ DEUXIÈME DÉCLARATION FAUSSE DE MA MAIN, et c'est l'ÉPREUVE PAR L'EFFET
     * qui l'a corrigée — pas une relecture. Mon relevé de source disait « aucun
     * return précoce » : c'est vrai, et l'écran garde quand même, par un rendu
     * conditionnel (`{!sources && !erreur && <p>Chargement…</p>}`) et un effet
     * qui n'appelle que si le droit est là.
     *
     * L'épreuve a trouvé UN bouton soumissible pendant le chargement. Ce n'était
     * pas un formulaire prématuré : c'était « Déclarer un entrepôt », un bouton
     * qui OUVRE un panneau et que HTML typait `submit` faute de `type`. Corrigé
     * à la SOURCE, dans le composant partagé, pas sur ce site.
     */
    motif:
      'la liste est gardée par un rendu conditionnel, l’appel ne part que si le ' +
      'droit est là, et le formulaire est une CRÉATION qui s’ouvre sur un clic ; ' +
      'éprouvé par l’effet — rien de soumissible avant les données',
  },
  'pages-legales/page.tsx': {
    nature: 'garde-a-la-main',
    /*
     * ⚠ TROISIÈME DÉCLARATION FAUSSE DE MA MAIN — et l'épreuve a quand même
     * trouvé un défaut, ailleurs que là où je l'annonçais.
     *
     * Je l'avais déclaré « à migrer » : son rendu ne montre AUCUN champ avant
     * les données, mesuré par l'effet. Mais l'effet de chargement partait quel
     * que soit le droit — une personne sans `etablissement.apparence`
     * déclenchait un 403 que NOUS provoquions. Corrigé.
     *
     * ⚠ Sa garantie la plus forte vit dans l'ACTION et non dans le rendu :
     * « on n'enregistre jamais si on n'a pas pu lire ». C'est juste, et c'est
     * exactement ce qu'un relevé de source ne sait pas voir.
     */
    motif:
      'aucun champ rendu avant les données — éprouvé par l’effet ; son contenu ' +
      'est PUBLIÉ au dehors, donc c’est le plus exposé des trois, et c’est pour ' +
      'ça que son appel ne part plus sans le droit',
  },
  'etablissement/page.tsx': {
    nature: 'migre',
    motif:
      '⚠ le pire de tous : ses états partaient sur des valeurs par DÉFAUT' +
      '(#0F2B46), donc le formulaire avait l’air rempli ET JUSTE avant les données' +
      '— enregistrer écrivait des couleurs que personne n’avait choisies' +
      'par-dessus celles de l’école',
  },
  'catalogue/[id]/page.tsx': {
    nature: 'garde-a-la-main',
    motif:
      'sort sur « if (!record) » avant tout formulaire — mesuré en lisant le code,' +
      'après avoir déclaré à tort que ses 18 champs videraient une notice publiée',
  },
  'regles-de-circulation/page.tsx': {
    nature: 'garde-a-la-main',
    motif:
      'distingue les TROIS états de sa table à la main, et son formulaire est une' +
      'CRÉATION qui part vide : aucun champ ne montre de donnée non arrivée',
  },
  'collections/[id]/page.tsx': {
    nature: 'garde-a-la-main',
    motif:
      'garde présent ; l’enjeu reste réel — les règles d’accès sont un OU dont la' +
      'plus large gagne — donc à éprouver en priorité le jour où on remanie cet' +
      'écran',
  },
  'roles/page.tsx': {
    nature: 'garde-a-la-main',
    motif:
      'garde présent ; un enregistrement prématuré y retirerait des droits à tout' +
      'un rôle, ce qui en fait le plus coûteux des « déjà gardés » si le garde' +
      'venait à sauter',
  },
  'adherents/[id]/page.tsx': {
    nature: 'garde-a-la-main',
    motif:
      'garde présent sur la fiche d’adhérent chargée',
  },
  'classes/page.tsx': {
    nature: 'garde-a-la-main',
    motif:
      'garde présent ; les classes gouvernent l’accès aux collections',
  },
  'categories/page.tsx': {
    nature: 'garde-a-la-main',
    motif:
      'garde présent ; ce vocabulaire décide de la teinte des couvertures',
  },
  'auteurs/page.tsx': {
    nature: 'garde-a-la-main',
    motif:
      'garde présent sur la liste des fiches d’autorité',
  },
  'comptes/page.tsx': {
    nature: 'garde-a-la-main',
    motif:
      'garde présent ; l’activation pose un RÔLE, donc le geste est une écriture' +
      'de droit',
  },
  'recolement/[id]/page.tsx': {
    nature: 'garde-a-la-main',
    motif:
      'garde présent ; « marquer les manquants » agit sur les exemplaires',
  },
  'adherents/page.tsx': {
    nature: 'lecture-seule',
    motif:
      'liste et recherche : les champs filtrent l’affichage, ils n’écrivent rien',
  },
  'collections/page.tsx': {
    nature: 'lecture-seule',
    motif:
      'liste ; la création ouvre un écran propre, et les champs de filtre' +
      'n’écrivent pas',
  },
  'recolement/page.tsx': {
    nature: 'lecture-seule',
    motif:
      'liste des sessions ; l’ouverture d’une session est un geste explicite',
  },
  'depots-a-cataloguer/page.tsx': {
    nature: 'lecture-seule',
    motif:
      'file de travail ; le seul champ est une recherche',
  },
  'import-etudiants/page.tsx': {
    nature: 'sans-chargement',
    motif:
      'le seul champ est un sélecteur de fichier ; l’appel a lieu à la SOUMISSION,' +
      'donc il n’y a aucune donnée à attendre avant de rendre le formulaire',
  },
  'outils/import-notices/page.tsx': {
    nature: 'sans-chargement',
    motif:
      'idem : un sélecteur de fichier et un envoi ; rien n’est lu avant le geste',
  },
};

const RACINE = join(process.cwd(), 'app', 'admin');

function ecransDuDisque(): string[] {
  const vus: string[] = [];
  const parcourir = (dossier: string, prefixe: string) => {
    for (const e of readdirSync(dossier, { withFileTypes: true })) {
      const chemin = join(dossier, e.name);
      if (e.isDirectory()) parcourir(chemin, `${prefixe}${e.name}/`);
      else if (e.name === 'page.tsx') vus.push(`${prefixe}${e.name}`);
    }
  };
  parcourir(RACINE, '');
  return vus.sort();
}

/**
 * ⚠ LA POPULATION SE DÉRIVE DU DISQUE, pas d'une liste écrite à la main : une
 * liste écrite à la main ne peut pas signaler ce qu'elle ignore.
 */
/**
 * ⚠ LE CODE SEUL — les commentaires RETIRÉS.
 *
 * 🔴 Mesuré par l'effet le 3 novembre 2026 : un commentaire citant `api(` et
 * `<input />` en PROSE suffisait à faire exiger une déclaration pour un écran
 * qui n'a ni l'un ni l'autre. Un détecteur qui signale du code correct se fait
 * désactiver, et il ne sert plus le jour où il a raison.
 *
 * ⚠ Le retrait est volontairement SIMPLE, et son témoin ci-dessous mesure qu'il
 * ne mange pas trop : ce dépôt a payé un nettoyeur gourmand qui avalait 2 262
 * caractères d'un fichier.
 */
export function codeSeul(source: string): string {
  const sansBloc = source.replace(/\/\*[\s\S]*?\*\//g, '');
  return sansBloc
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('//'))
    .join('\n');
}

/**
 * ⭐⭐ LE PRÉDICAT QUI SÉLECTIONNE — et il a été AVEUGLE SUR SIX ÉCRANS.
 *
 * 🔴 Mesuré le 3 novembre 2026 : `\bapi\(` ne matche PAS la forme GÉNÉRIQUE
 * `api<T>(…)`, qui est celle qu'emploie la moitié de ce dépôt. Neuf écrans de
 * `app/admin` n'appellent l'API que sous cette forme ; **six d'entre eux
 * rendent aussi des champs, et aucun n'était déclaré.**
 *
 * L'obligation existait pour qu'« un écran neuf soit dans aucune des deux
 * listes et que le test échoue ». Un écran écrit avec `api<T>(` était dans
 * aucune des deux listes **et le test passait** : c'est le vert sur une
 * population amputée, sur le garde censé l'empêcher.
 *
 * ⚠ Et ce n'est pas un oubli d'écriture : `\bapi\(` est exactement ce qu'on
 * tape quand on pense « l'appel à l'API ». La forme générique ne vient à
 * l'esprit qu'en relisant les appels réels — c'est-à-dire en mesurant.
 */
function chargeEtRendDesChamps(source: string): boolean {
  const code = codeSeul(source);
  // ⚠ `api<` autant qu'`api(` : la forme générique est la plus répandue ici.
  const appelle = /\bapi[(<]|\bfetch\(/.test(code);
  const champs = /<(input|textarea|select|Input|Textarea|Select)\b/.test(code);
  return appelle && champs;
}

describe('formulaires chargés — obligation déclarée', () => {
  const surLeDisque = ecransDuDisque();

  /**
   * ⭐⭐ LE TÉMOIN DU PRÉDICAT — et il manquait, mesuré le 3 novembre 2026.
   *
   * 🔴 Le contrôle négatif « le motif rétrécit à `\bapi\(` » n'a PAS mordu.
   * Logique : les six écrans qu'il cessait de voir sont désormais DÉCLARÉS,
   * donc le garde n'avait plus rien à réclamer. Une sur-déclaration est
   * inoffensive — et c'est exactement ce qui rend la régression invisible.
   *
   * ⭐ La propriété « le prédicat voit la forme générique » n'était tenue par
   * RIEN. Elle l'est ici, par deux témoins sur l'instrument lui-même : un cas
   * qu'il DOIT voir, un cas qu'il ne doit PAS voir. C'est « un témoin COMPTE, il
   * ne constate pas une présence », appliqué au sélecteur plutôt qu'au relevé.
   */
  it('⭐⭐ le prédicat VOIT la forme générique `api<T>(…)` — témoin de présence', () => {
    const source = readFileSync(join(RACINE, 'statistiques/page.tsx'), 'utf8');
    // ⚠ ce fichier n'appelle l'API QUE par la forme générique : c'est ce qui en
    // fait le bon témoin. Si un jour il passe à `api(`, ce cas le dira.
    expect(codeSeul(source)).toMatch(/\bapi</);
    expect(codeSeul(source)).not.toMatch(/\bapi\(/);
    expect(
      chargeEtRendDesChamps(source),
      '🔴 le prédicat ne voit plus `api<T>(…)` : six écrans de app/admin ' +
        'n’appellent l’API que sous cette forme, et ils redeviendraient ' +
        'invisibles à cette obligation',
    ).toBe(true);
  });

  /*
   * ⚠ TÉMOIN D'ABSENCE sur la confusion PLAUSIBLE : un écran qui ne charge rien
   * et ne rend aucun champ. Sans lui, un prédicat qui rendrait `true` partout
   * serait indiscernable d'un prédicat juste — et plus rassurant.
   */
  it('⚠ et il ne voit PAS un écran sans appel ni champ', () => {
    const source = readFileSync(join(RACINE, 'parametres/page.tsx'), 'utf8');
    expect(chargeEtRendDesChamps(source)).toBe(false);
  });

  it('⚠ le relevé LIT quelque chose : sinon tout ce qui suit est vert sur le vide', () => {
    expect(surLeDisque.length).toBeGreaterThan(20);
    // ⚠ TÉMOIN DE PRÉSENCE sur un cas dont je connais la réponse.
    expect(surLeDisque).toContain('accueil/page.tsx');
  });

  it('⚠ chaque écran qui charge ET rend des champs est DÉCLARÉ', () => {
    const concernes = surLeDisque.filter((f) =>
      chargeEtRendDesChamps(readFileSync(join(RACINE, f), 'utf8')),
    );
    expect(concernes.length).toBeGreaterThan(10);
    const absents = concernes.filter((f) => !ECRANS[f]);
    expect(
      absents,
      'écran neuf : déclarez-le « migre » s’il passe par FormulaireCharge, ' +
        'ou « a-migrer »/« lecture-seule » AVEC SON MOTIF. Les deux issues sont ' +
        'acceptables ; ne rien écrire ne l’est pas.',
    ).toEqual([]);
  });

  it('⚠ aucune déclaration PÉRIMÉE : un écran déclaré qui a disparu doit sortir de la liste', () => {
    const fantomes = Object.keys(ECRANS).filter((f) => !surLeDisque.includes(f));
    expect(fantomes).toEqual([]);
  });

  it('⚠ « migre » signifie qu’il passe VRAIMENT par le composant', () => {
    for (const [f, d] of Object.entries(ECRANS)) {
      if (d.nature !== 'migre') continue;
      const src = readFileSync(join(RACINE, f), 'utf8');
      expect(src, `${f} est déclaré « migre » et n’importe pas FormulaireCharge`).toMatch(
        /from '@\/components\/formulaire-charge'/,
      );
    }
  });

  it('⚠ ET LA DETTE SE REFUSE DANS LES DEUX SENS : un « a-migrer » migré fait TOMBER ce test', () => {
    for (const [f, d] of Object.entries(ECRANS)) {
      if (d.nature !== 'a-migrer') continue;
      const src = readFileSync(join(RACINE, f), 'utf8');
      expect(
        src.includes("from '@/components/formulaire-charge'"),
        `${f} passe désormais par FormulaireCharge : passez-le en « migre ». ` +
          'Une dette qui ne se rappelle qu’en s’aggravant laisserait passer sa résolution.',
      ).toBe(false);
    }
  });

  /*
   * ⭐⭐ CE N'EST PLUS UN RELEVÉ DE SOURCE QUI TRANCHE : C'EST L'EFFET.
   *
   * J'ai essayé deux motifs. Le premier n'acceptait qu'un `return` précoce : il
   * a ACCUSÉ `moissonnage`, qui garde par rendu conditionnel. Le second
   * acceptait aussi `{x && …}` : il répond « oui » à presque tout JSX, donc il
   * aurait déclaré gardé n'importe quel écran. Entre un détecteur qui signale du
   * code correct et un qui ne signale rien, aucun des deux ne vaut d'être lu.
   *
   * ⚠ Un relevé de source ne peut pas dire si une garde couvre bien le
   * FORMULAIRE : il voit une forme, et la propriété est un effet — « réponse
   * retardée, rien de soumissible ». Ce qui le mesure est une épreuve qui FAIT
   * TOURNER l'écran avec une réponse qu'on résout à la main.
   *
   * Le garde exige donc qu'une telle épreuve EXISTE pour chaque écran dont la
   * déclaration affirme quelque chose sur son comportement. C'est plus cher — un
   * fichier par écran — et c'est la seule chose qui ne se trompe pas.
   */
  const EPREUVES = readdirSync(join(process.cwd(), 'tests')).filter((f) =>
    /-formulaire-charge\.spec\.tsx$/.test(f),
  );

  it('⚠ le relevé des épreuves LIT quelque chose', () => {
    expect(EPREUVES.length).toBeGreaterThan(0);
    expect(EPREUVES).toContain('accueil-formulaire-charge.spec.tsx');
  });

  /*
   * ⚠ LA DETTE, DATÉE ET NOMMÉE — 14 octobre 2026.
   *
   * Dix écrans attendent leur épreuve par l'effet. Elle n'est pas facultative :
   * leur déclaration « garde-a-la-main » repose aujourd'hui sur la lecture de
   * leur code, et deux de mes lectures se sont déjà trompées.
   *
   * ⚠ ET ELLE SE REFUSE DANS LES DEUX SENS : un écran listé ici dont l'épreuve
   * EXISTE fait tomber ce test. Une dette qui ne se rappelle qu'en s'aggravant
   * laisserait passer sa propre résolution.
   */
  /*
   * ⭐ LA DETTE EST SOLDÉE — les dix écrans ont leur épreuve par l'effet.
   *
   * Elle a été portée quatre jours sous cette forme : nommée écran par écran,
   * datée, et refusée DANS LES DEUX SENS. C'est cette seconde moitié qui l'a
   * fait disparaître — un écran listé dont l'épreuve existait faisait tomber le
   * test, donc la liste ne pouvait pas survivre à sa propre résolution.
   *
   * ⚠ ON LA GARDE VIDE plutôt que de la supprimer : le prochain écran qui
   * arrive sans épreuve a un endroit où être inscrit, avec sa raison. Une liste
   * supprimée se réinvente mal.
   */
  const EPREUVE_EN_DETTE = new Set<string>([]);


  /*
   * ⭐ LA DETTE DU 14 OCTOBRE EST SOLDÉE — l'épreuve de `collections/[id]` porte
   * désormais SES DEUX CAS, le retardé et l'échec.
   *
   * Ce qui bloquait n'était ni l'écran, ni `vi.mock`, ni le découpage : c'était
   * `beforeEach(() => api.mockReset())` combiné à une doublure dont la promesse
   * ne se règle JAMAIS. Bisecté jusqu'à douze lignes, sans Next ni module
   * doublé — et un `afterEach` échoue proprement là où un `beforeEach` suspend.
   *
   * `epreuves-sans-crochet-effaceur.spec.ts` tient la propriété pour toutes les
   * épreuves, pas pour celle-ci : le blocage ne nomme AUCUN cas, donc une règle
   * écrite ne protégerait personne.
   */


  const nomDeLEpreuve = (f: string) =>
    `${f.replace(/\/page\.tsx$/, '').replace(/\/\[id\]$/, '').replace(/\//g, '-')}-formulaire-charge.spec.tsx`;

  it('⚠ une dette RÉSOLUE doit sortir de la liste', () => {
    const resolues = [...EPREUVE_EN_DETTE].filter((f) => EPREUVES.includes(nomDeLEpreuve(f)));
    expect(
      resolues,
      'leur épreuve existe : retirez-les de EPREUVE_EN_DETTE. Une dette qui ne se ' +
        'rappelle qu’en s’aggravant laisserait passer sa propre résolution.',
    ).toEqual([]);
  });

  it('⚠ tout écran déclaré « migre » ou « garde-a-la-main » a son ÉPREUVE PAR L’EFFET', () => {
    const manquantes: string[] = [];
    for (const [f, d] of Object.entries(ECRANS)) {
      if (d.nature !== 'migre' && d.nature !== 'garde-a-la-main') continue;
      // `catalogue/[id]/page.tsx` → `catalogue-formulaire-charge.spec.tsx`
      if (EPREUVE_EN_DETTE.has(f)) continue;
      if (!EPREUVES.includes(nomDeLEpreuve(f))) manquantes.push(f);
    }
    expect(
      manquantes,
      'écrivez leur épreuve : réponse retardée → rien de soumissible, données arrivées → ' +
        'formulaire rempli et actif. Un relevé de source ne peut pas trancher à sa place.',
    ).toEqual([]);
  });

  it('⚠ chaque motif est ÉCRIT, et il dit ce qu’un enregistrement prématuré COÛTE', () => {
    for (const [f, d] of Object.entries(ECRANS)) {
      expect(d.motif.length, `${f} : motif trop court pour apprendre quoi que ce soit`).
        toBeGreaterThan(30);
    }
  });
});
