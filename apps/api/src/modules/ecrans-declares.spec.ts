import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { MODULES, MODULES_ACTIVABLES, MODULES_PAR_ID } from './registre-modules';

/**
 * LES ÉCRANS DÉCLARÉS EXISTENT, ET CEUX QUI CHANGENT SONT DÉCLARÉS.
 *
 * ⚠ CE TEST EXISTE PARCE QU'UNE RELECTURE A ÉCHOUÉ DEUX FOIS. La déclaration a
 * promis la disparition d'un « écran Amendes » qui n'a jamais existé, puis d'un
 * « Administration · Tarifs d'amendes » qui n'existe pas non plus — pendant que
 * la fiche d'adhérent, qui perd réellement sa section, n'était pas déclarée.
 *
 * Et le moment où cette liste s'affiche est le PIRE pour se tromper : la boîte
 * de confirmation, juste avant que l'administrateur éteigne un module pour
 * toute l'école. Elle nommait un écran imaginaire et taisait celui qui change.
 *
 * ⚠ IL FRANCHIT LA FRONTIÈRE DES WORKSPACES EN LECTURE SEULE, délibérément,
 * comme `fonctions-connues-de-l-api.spec.ts` le fait dans l'autre sens. Le
 * couplage existe dans les faits : la déclaration PARLE des écrans du front.
 * Autant qu'il soit vérifié.
 */
const APP = join(__dirname, '../../../web/app');

/** Toutes les pages du front, par chemin relatif à `app/`. */
function pagesDuFront(dossier = ''): string[] {
  const base = join(APP, dossier);
  if (!existsSync(base)) return [];
  return readdirSync(base, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return pagesDuFront(join(dossier, e.name));
    return e.name === 'page.tsx' ? [dossier] : [];
  });
}

/**
 * Le code d'une page, commentaires retirés — PAR BLOCS, pas ligne à ligne.
 *
 * ⚠ LA NUANCE A ÉTÉ SIGNALÉE PAR LA SESSION FRONT, et elle est fondée même si
 * son cas ne mordait pas. Un filtre ligne à ligne retire bien `//`, `*` et
 * `/*` en début de ligne — donc les blocs `/** … *\/` classiques. Mais un
 * commentaire JSX multiligne a des lignes de CONTINUATION sans aucun
 * marqueur :
 *
 *     {(slash-star) Le paramétrage des rappels
 *         n'est PAS ici (star-slash)}
 *
 * Les deux lignes passent le filtre, et le garde signale une page qui dit
 * précisément le CONTRAIRE d'une dépendance. Mesuré : 2 occurrences avec le
 * filtre ligne à ligne, 0 avec le filtre par blocs.
 *
 * C'est exactement le défaut qui avait fait crier le détecteur de textes en dur
 * du front — même cause, autre outil. Et l'enjeu n'est pas la gêne : un
 * détecteur qui signale du code correct se fait désactiver, et ne sert plus le
 * jour où il a raison. Celui-ci vient de prouver qu'il a raison.
 */
export function retirerCommentaires(source: string): string {
  return source
    // Blocs `/* … *\/` et `{/* … *\/}`, y compris sur plusieurs lignes.
    .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, '')
    // Puis les lignes `//`.
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');
}

function codeDeLaPage(chemin: string): string {
  const f = join(APP, chemin, 'page.tsx');
  if (!existsSync(f)) return '';
  return retirerCommentaires(readFileSync(f, 'utf-8'));
}

/**
 * ⚠ LE GARDE PERDAIT SA PORTÉE À MESURE QUE LE PROJET APPLIQUAIT SA PROPRE
 * RÈGLE — et c'est ce qui l'a rendu aveugle aux quatre écrans du dépôt.
 *
 * *Mesuré le 14 septembre 2026.*
 *
 * `motifEcrans` cherche des mots FRANÇAIS dans le code d'une page. Or la règle
 * « les textes visibles sortent du code » (10 septembre) les en fait sortir :
 * une page migrée n'écrit plus « Dépôts à cataloguer », elle écrit `T.titre`.
 * Les mots restent dans un commentaire d'en-tête — que ce fichier RETIRE, à
 * juste titre.
 *
 * Résultat mesuré : sur les quatre écrans du circuit de dépôt, **zéro** était
 * visible à ce garde. `mon-depot` n'était déclaré que parce que quelqu'un
 * l'avait écrit à la main ; les trois autres étaient absents de la déclaration
 * et le garde rendait VERT.
 *
 * ⚠ Ce n'est pas un défaut du garde ni de la règle : c'est leur RENCONTRE. Un
 * garde qui s'affaiblit à chaque lot conforme est plus dangereux qu'un garde
 * absent — il s'éteint progressivement, sans jamais rougir.
 *
 * Le remède suit la règle au lieu de la subir : le texte d'une page est son
 * code PLUS les libellés qu'elle NOMME. Chaque page référence `LIBELLES.<clé>`
 * — on résout ces clés dans `libelles.ts` et on les joint au texte examiné.
 */
const LIBELLES_SRC = join(APP, '../lib/libelles.ts');

/**
 * ⚠ AU LIBELLÉ PRÈS, ET PAS AU PAQUET — sinon le garde crie à tort, et un
 * détecteur qui crie à tort se fait désactiver.
 *
 * *Mesuré le 14 septembre 2026, en élargissant ce garde : prendre le bloc
 * ENTIER de `LIBELLES.adherents` attribuait à la LISTE des adhérents les
 * libellés d'amendes que seule la FICHE affiche — les deux pages partagent un
 * paquet. Deux faux positifs sur six signalements.*
 *
 * On résout donc les feuilles RÉELLEMENT employées : `T.amendes`,
 * `LIBELLES.adherents.amendes`. Une page qui importe un paquet sans en lire la
 * feuille n'hérite plus de son texte.
 */
function feuillesEmployees(code: string): Map<string, Set<string>> {
  const parPaquet = new Map<string, Set<string>>();
  const ajouter = (paquet: string, feuille: string) => {
    if (!parPaquet.has(paquet)) parPaquet.set(paquet, new Set());
    parPaquet.get(paquet)!.add(feuille);
  };
  // `const T = LIBELLES.adherents;` → alias T
  const alias = new Map<string, string>();
  for (const m of code.matchAll(/const (\w+)\s*=\s*LIBELLES\.(\w+)/g)) alias.set(m[1], m[2]);
  for (const [a, paquet] of alias) {
    for (const m of code.matchAll(new RegExp(`\\b${a}\\.(\\w+)`, 'g'))) ajouter(paquet, m[1]);
  }
  for (const m of code.matchAll(/LIBELLES\.(\w+)\.(\w+)/g)) ajouter(m[1], m[2]);
  return parPaquet;
}

function texteDesLibelles(parPaquet: Map<string, Set<string>>): string {
  if (!existsSync(LIBELLES_SRC) || parPaquet.size === 0) return '';
  // ⚠ Commentaires retirés ICI AUSSI : « Rappel discret, en tête de liste »
  // dans un commentaire de `libelles.ts` faisait signaler `admin/collections`
  // comme concernée par le module `rappels`. Même cause que pour les pages.
  const src = retirerCommentaires(readFileSync(LIBELLES_SRC, 'utf-8'));
  let texte = '';
  for (const [paquet, feuilles] of parPaquet) {
    const debut = src.indexOf(`\n  ${paquet}: {`);
    if (debut < 0) continue;
    const fin = src.indexOf('\n  },', debut);
    const bloc = src.slice(debut, fin < 0 ? undefined : fin);
    for (const feuille of feuilles) {
      // La ligne (ou la fonction) qui porte cette feuille, jusqu'à la suivante.
      const d = bloc.indexOf(`\n    ${feuille}:`);
      if (d < 0) continue;
      const f = bloc.indexOf('\n    ', d + 6);
      texte += bloc.slice(d, f < 0 ? undefined : f) + '\n';
    }
  }
  return texte;
}

/** Le code de la page ET les libellés qu'elle EMPLOIE — voir le bloc ci-dessus. */
function texteDeLaPage(chemin: string): string {
  const code = codeDeLaPage(chemin);
  return code + '\n' + texteDesLibelles(feuillesEmployees(code));
}

/**
 * Pages qui MENTIONNENT un module sans en DÉPENDRE.
 *
 * ⚠ Ce garde est approximatif par construction — il cherche UN MOT par module —
 * et il le dit. Un écran peut nommer « amende » sans rien perdre quand le module
 * s'éteint ; le déclarer dans `ecrans` mentirait à la boîte de confirmation, qui
 * annonce ce qui va DISPARAÎTRE.
 *
 * ⚠ Chaque tolérance porte son motif, et le test ci-dessous refuse celles qui
 * deviennent périmées.
 */
const MENTIONS_SANS_DEPENDANCE: Record<string, Record<string, string>> = {
  amendes: {
    'admin/regles-de-circulation':
      'Cet écran règle `finePerDay` parmi les quatre champs d’une règle de ' +
      'circulation, donc il nomme « amende ». Mais il ne DÉPEND plus du module ' +
      'depuis le 26/09/2026 : ses routes ne portent plus `@ModuleRequis`, et ' +
      'l’écran affiche sa colonne Amende sans consulter l’état du module — rien ' +
      'n’y disparaît. Le déclarer ferait promettre à la boîte de confirmation la ' +
      'disparition d’un écran qui reste. ' +
      '⚠ Ce que ça révèle est signalé au front : un champ dont la valeur est ' +
      'figée à zéro module éteint ne devrait pas paraître réglable.',
  },
};

describe('écrans déclarés — le front est là où on le croit', () => {
  const pages = pagesDuFront();

  it('le relevé voit bien les pages du front (témoin positif)', () => {
    // Sans ce témoin, un chemin d'accès faux rendrait une liste vide et TOUS
    // les tests ci-dessous passeraient au vert en ne vérifiant rien — le
    // défaut exact que ce fichier existe pour empêcher.
    expect(pages.length).toBeGreaterThanOrEqual(15);
    expect(pages).toContain('guichet');
    expect(pages).toContain(join('admin', 'adherents', '[id]'));
    // Et un témoin NÉGATIF nommé : l'écran que la déclaration promettait à tort.
    expect(pages).not.toContain(join('admin', 'tarifs'));
  });

  it('⚠ CHAQUE écran déclaré par un module EXISTE dans apps/web', () => {
    const fantomes: string[] = [];
    for (const m of MODULES) {
      for (const e of m.ecrans) {
        const attendu = e.chemin.split('/').join('/');
        if (!pages.includes(attendu.split('/').join('/'))) {
          // `join` normalise les séparateurs selon la plateforme.
          if (!pages.includes(e.chemin.split('/').reduce((a, b) => join(a, b)))) {
            fantomes.push(`${m.id} → ${e.chemin}`);
          }
        }
      }
    }
    expect(fantomes, 'écrans déclarés introuvables dans apps/web').toEqual([]);
  });

  it('⚠ CHAQUE page qui parle d’un module est DÉCLARÉE par lui', () => {
    // Le sens inverse, et c'est celui qui manquait : la fiche d'adhérent perdait
    // sa section sans être déclarée, donc la confirmation la taisait.
    const oublis: string[] = [];
    for (const id of MODULES_ACTIVABLES) {
      const m = MODULES_PAR_ID.get(id)!;
      if (!m.motifEcrans) continue;
      const declarees = new Set(
        m.ecrans.map((e) => e.chemin.split('/').reduce((a, b) => join(a, b))),
      );
      const motif = new RegExp(m.motifEcrans, 'i');
      for (const page of pages) {
        if (!motif.test(texteDeLaPage(page))) continue;
        if (MENTIONS_SANS_DEPENDANCE[id]?.[page]) continue;
        if (!declarees.has(page)) oublis.push(`${id} → ${page} parle de « ${m.motifEcrans} »`);
      }
    }
    expect(oublis, 'pages concernées mais non déclarées').toEqual([]);
  });

  it('⚠ une tolérance PÉRIMÉE est refusée', () => {
    // Une page qui a cessé de parler du module, ou qui est désormais déclarée,
    // ne doit plus figurer ici : une exception qu'on ne relit jamais finit par
    // couvrir autre chose.
    const mortes: string[] = [];
    for (const [id, pages] of Object.entries(MENTIONS_SANS_DEPENDANCE)) {
      const m = MODULES_PAR_ID.get(id)!;
      const motif = new RegExp(m.motifEcrans, 'i');
      for (const page of Object.keys(pages)) {
        const existe = pagesDuFront().includes(page);
        const parle = existe && motif.test(texteDeLaPage(page));
        const declaree = m.ecrans.some((e) => e.chemin === page);
        if (!parle || declaree) mortes.push(`${id} → ${page}`);
      }
    }
    expect(
      mortes,
      'Tolérance(s) qui ne correspondent plus : la page ne parle plus du ' +
        'module, a disparu, ou est désormais déclarée. Retirez la ligne.',
    ).toEqual([]);
  });

  it('chaque module activable déclare au moins un endroit, et chacun dit QUOI', () => {
    for (const id of MODULES_ACTIVABLES) {
      const m = MODULES_PAR_ID.get(id)!;
      expect(m.ecrans.length, id).toBeGreaterThan(0);
      for (const e of m.ecrans) {
        expect(e.quoi.length, `${id} → ${e.chemin}`).toBeGreaterThan(5);
        expect(e.chemin, `${id}`).not.toMatch(/^\//); // relatif à app/, jamais absolu
      }
    }
  });

  it('le NOYAU ne déclare aucun écran — il ne s’éteint pas', () => {
    for (const m of MODULES.filter((x) => x.noyau)) {
      expect(m.ecrans, m.id).toEqual([]);
    }
  });
});

describe('écrans déclarés — le retrait des commentaires tient sur le JSX', () => {
  it('⚠ un commentaire JSX MULTILIGNE est retiré EN ENTIER', () => {
    // Le cas signalé par la session front. Les lignes de continuation d'un
    // commentaire JSX ne portent AUCUN marqueur : un filtre ligne à ligne les
    // garde, et le garde signale alors une page qui dit le contraire d'une
    // dépendance.
    const source = [
      'export default function Page() {',
      '  return (',
      '    <div>',
      '      {/* Le paramétrage des rappels',
      "          n'est PAS ici — voir /admin/rappels */}",
      '      <p>Règles de prêt</p>',
      '    </div>',
      '  );',
      '}',
    ].join('\n');
    expect(retirerCommentaires(source)).not.toMatch(/rappels?/i);
    // Et le code UTILE survit — un filtre trop large serait l'autre faute.
    expect(retirerCommentaires(source)).toContain('Règles de prêt');
  });

  it('retire aussi les blocs `/* */` et les lignes `//`', () => {
    const source = ['/* amendes */', '// amendes', 'const x = 1;'].join('\n');
    expect(retirerCommentaires(source)).not.toMatch(/amendes/);
    expect(retirerCommentaires(source)).toContain('const x = 1;');
  });

  it('⚠ la page mise en cause par le front n’est PAS signalée', () => {
    // Témoin NOMMÉ : `admin/regles-de-pret` parle des rappels dans un
    // commentaire d'en-tête, pour dire qu'ils ne sont PAS là. La déclarer
    // serait faux — éteindre le module n'y retire rien.
    const code = codeDeLaPage(join('admin', 'regles-de-pret'));
    expect(code, 'la page doit être lisible').not.toBe('');
    expect(code).not.toMatch(/\brappels?\b/i);
  });
});
