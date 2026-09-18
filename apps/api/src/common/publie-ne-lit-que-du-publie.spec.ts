import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ⚠ UN FICHIER PUBLIÉ NE DOIT LIRE QUE DU PUBLIÉ.
 *
 * Trouvé le 17 septembre 2026 : la CI du dépôt public était ROUGE. Le test
 * `releve-notice.spec.ts` lit `docs/p2-releve-notice.md`, un document interne
 * exclu de la publication. Chez nous il passe ; publié, il échoue en ENOENT.
 * Et le générateur d'inventaire, publié la veille, lisait le backlog — même
 * rupture, visible de quiconque clone le dépôt.
 *
 * ⚠ FAMILLE NEUVE ET STRUCTURELLE : **le garde de publication vérifie ce qui
 * SORT, pas ce que le sorti EXIGE.** Il affirme « aucun fichier interdit », ce
 * qui est vrai et ne dit rien des dépendances de ce qu'il laisse partir. C'est
 * la même cécité que « une liste blanche échoue en silence » — prise par
 * l'autre bout : là, un fichier manquait ; ici, il manque *à quelqu'un*.
 *
 * ## Pourquoi ce garde vit ICI et pas dans le script de publication
 *
 * Le script s'exécute à la main, quand on publie. Celui-ci s'exécute à CHAQUE
 * commit : un test neuf qui lit un document interne est refusé le jour où il
 * est écrit, pas le jour où quelqu'un s'en aperçoit sur GitHub.
 *
 * ## Sa borne, mesurée et déclarée
 *
 * Il ne relève que les chemins LITTÉRAUX (`'docs/x.md'`, `'scripts/y.sh'`). Un
 * chemin construit par variable lui échappe — c'est « un garde qui lit la
 * source ne suit pas les variables », et le remède est le même : on garde
 * l'adresse au point de lecture. Il ne juge PAS les mentions en commentaire :
 * seuls comptent les fichiers qui appellent réellement `readFileSync`.
 */

const RACINE = join(__dirname, '..', '..', '..', '..');
const LISTE = join(RACINE, 'scripts', 'publier-instantane.sh');

/** Les motifs d'inclusion de la liste blanche, lus dans le script lui-même. */
function motifsPublies(): string[] {
  const src = readFileSync(LISTE, 'utf8');
  // ⚠ Le nom de la variable est `SORTANT`, lu ici plutôt que supposé : ma
  // première écriture cherchait `INCLUS=(` et le témoin de présence est tombé.
  const debut = src.indexOf('SORTANT=(');
  const corps = debut === -1 ? src : src.slice(debut, src.indexOf('\n)', debut));
  return [...corps.matchAll(/^\s*'([^']+)'/gm)].map((m) => m[1]);
}

/** Les exclusions explicites, lues dans le même script. */
function motifsInterdits(): string[] {
  const src = readFileSync(LISTE, 'utf8');
  const debut = src.indexOf('FICHIERS_INTERDITS=(');
  if (debut === -1) return [];
  const corps = src.slice(debut, src.indexOf('\n)', debut));
  return [...corps.matchAll(/^\s*'([^']+)'/gm)].map((m) => m[1]);
}

const MOTIFS = motifsPublies();
// ⚠ UN FICHIER PEUT ÊTRE DANS LES DEUX LISTES : `apps/` l'inclut, une ligne
// nominative l'exclut. Ma première écriture ne lisait que les inclusions, et
// déclarait « publié » un fichier que je venais d'exclure.
const INTERDITS = motifsInterdits();

/**
 * Lectures TOLÉRÉES d'un fichier non publié, avec leur motif.
 *
 * ⚠ UNE EXEMPTION SE DÉCLARE, ELLE NE SE DEVINE PAS. L'instrument voit un
 * chemin littéral ; il ne sait pas dire si l'appel est GARDÉ. Plutôt qu'un
 * garde approximatif qui laisserait passer les vrais cas, on exige une ligne
 * ici — et son motif se relit.
 */
const TOLEREES: Record<string, { lu: string; motif: string }> = {
  'scripts/inventaire-produit.mjs': {
    lu: 'docs/backlog-backend.md',
    motif:
      'lecture GARDÉE par `existsSafe` : hors du dépôt interne, le compte des ' +
      'dettes devient « non mesurable ici » — jamais zéro, qui se lirait comme ' +
      'une mesure.',
  },
};
const correspond = (motifs: string[], chemin: string) =>
  motifs.some((m) => (m.endsWith('/') || m.endsWith('-') ? chemin.startsWith(m) : chemin === m || chemin.startsWith(`${m}/`)));
const estPublie = (chemin: string) => correspond(MOTIFS, chemin) && !correspond(INTERDITS, chemin);

/**
 * Les noms qui LISENT un fichier dans ce source : `readFileSync` et ses ALIAS
 * locaux (`const lire = (p) => readFileSync(p, 'utf8')`).
 *
 * ⚠ SANS LES ALIAS, LE GARDE EST AVEUGLE À SON PROPRE CAS : `inventaire-produit.mjs`
 * lit par `lire(...)`, et l'instrument ne voyait rien. Un angle mort qui se
 * ferme en trois lignes se ferme — il ne se déclare pas.
 */
function lecteursNommes(src: string): string[] {
  const alias = [...src.matchAll(/(?:const|let)\s+(\w+)\s*=[^;\n]{0,80}readFileSync/g)].map((m) => m[1]);
  return ['readFileSync', 'readFile', ...alias];
}

/** Fichiers suivis par git, sous un préfixe publiable, qui LISENT des fichiers. */
function lecteursPublies(): { fichier: string; lus: string[] }[] {
  const suivis = execSync('git ls-files', { cwd: RACINE, encoding: 'utf8' }).trim().split('\n');
  const out: { fichier: string; lus: string[] }[] = [];
  for (const f of suivis) {
    if (!/\.(ts|tsx|mjs|js)$/.test(f) || !estPublie(f)) continue;
    const src = readFileSync(join(RACINE, f), 'utf8');
    if (!/readFileSync|readFile\(/.test(src)) continue;
    // ⚠ SEULS LES CHEMINS DANS UN APPEL DE LECTURE. Ma première écriture prenait
    // tout littéral du fichier — donc les chemins CITÉS EN COMMENTAIRE, et elle
    // accusait un test qui ne lit que son XSD. Le motif ne désigne pas la faute.
    const lus = [
      ...new Set(
        [...src.matchAll(new RegExp(`(?:${lecteursNommes(src).join('|')})\\s*\\(([\\s\\S]{0,200}?)\\)`, 'g'))]
          .flatMap((appel) => [
            ...appel[1].matchAll(/['"`]((?:apps|docs|scripts|assets|docker)\/[A-Za-z0-9._/-]+\.[a-z]{2,6})['"`]/g),
          ])
          .map((m) => m[1])
          .filter((p) => existsSync(join(RACINE, p))),
      ),
    ];
    if (lus.length) out.push({ fichier: f, lus });
  }
  return out;
}

describe('⚠ un fichier PUBLIÉ ne lit que du PUBLIÉ', () => {
  const lecteurs = lecteursPublies();

  it('⚠ l’instrument voit quelque chose — sinon son silence ne vaut rien', () => {
    // Témoin de PRÉSENCE : la liste blanche est lue, et des lecteurs existent.
    expect(MOTIFS.length, 'la liste blanche n’a pas été lue').toBeGreaterThan(20);
    expect(lecteurs.length, 'aucun fichier publié ne lit de fichier : improbable').toBeGreaterThan(0);
    // Témoin d'ABSENCE sur la confusion PLAUSIBLE : un document interne connu
    // ne doit JAMAIS être vu comme publié.
    expect(estPublie('docs/journal.md'), 'le journal est interne').toBe(false);
    expect(estPublie('docs/backlog-backend.md'), 'le backlog est interne').toBe(false);
    expect(estPublie('apps/api/src/main.ts'), 'le code de l’API est publié').toBe(true);
  });

  it('⚠ une tolérance qui ne correspond plus est REFUSÉE', () => {
    // Sans cela, la liste deviendrait l'endroit où l'on enterre les
    // trouvailles : une ligne de plus, et le test se tait.
    const perimees = Object.entries(TOLEREES).filter(
      ([f, t]) => !lecteurs.find((l) => l.fichier === f)?.lus.includes(t.lu),
    );
    expect(
      perimees.map(([f, t]) => `${f} → ${t.lu}`),
      'Une tolérance déclarée ne correspond plus au code : retirez-la de ' +
        'TOLEREES — la lecture a disparu, ou elle a changé de cible.',
    ).toEqual([]);
  });

  it('⚠ aucun fichier publié ne lit un fichier NON publié', () => {
    const fautes = lecteurs.flatMap(({ fichier, lus }) =>
      lus
        .filter((p) => !estPublie(p) && TOLEREES[fichier]?.lu !== p)
        .map((p) => `${fichier}\n       lit → ${p}`),
    );
    expect(
      fautes,
      'Des fichiers PUBLIÉS lisent un fichier qui ne l’est pas :\n  · ' +
        fautes.join('\n  · ') +
        '\n\n⚠ Chez nous ils passent ; publiés, ils échouent en ENOENT — et la CI\n' +
        'du dépôt public devient rouge, visible de n’importe qui.\n\n' +
        'DEUX SORTIES, et le choix dépend de ce que le fichier ÉPROUVE :\n' +
        '  · il éprouve un couplage INTERNE → excluez-le AVEC sa source ;\n' +
        '  · il doit tourner partout → qu’il DÉGRADE en le disant, jamais en\n' +
        '    rendant zéro : un zéro se lit comme une mesure.\n\n' +
        '⚠ NE LE GATEZ PAS sur l’absence du fichier sans rien dire : le test se\n' +
        'tairait aussi chez nous le jour où la source est renommée.',
    ).toEqual([]);
  });
});
