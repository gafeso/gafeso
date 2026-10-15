import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ⭐⭐ UN FICHIER PUBLIÉ NE RENVOIE À RIEN QUI SOIT RETENU.
 *
 * Un instantané public est lu par quelqu'un qui n'a QUE lui. Un renvoi vers un
 * fichier que nous gardons est, pour ce lecteur, une impasse : il ne peut ni
 * l'ouvrir, ni savoir qu'il n'existe pas chez lui, ni deviner ce qu'il
 * contenait. Le document reste lisible, et il promet une suite qui n'arrive
 * jamais.
 *
 * ⚠ CE GARDE CHERCHE DEUX FORMES, et la seconde est celle qui a échappé à mon
 * premier relevé — il m'avait fait déclarer `docs/DEMARRER-FRONT.md` conforme :
 *
 *   ① un CHEMIN vers un fichier suivi mais non publié ;
 *   ② un POINTEUR NUMÉROTÉ : « backlog n°29 », « brief #2 ». Ce n'est pas un
 *      chemin, donc aucun relevé de chemins ne le voit — et c'est pourtant un
 *      renvoi aussi sûr qu'une adresse.
 *
 * ⚠ ET CE QU'IL NE CHERCHE PAS, parce que je l'ai MESURÉ avant de l'écrire :
 *
 *   · « le journal » — presque toujours LÉGITIME dans ce produit : le journal
 *     d'audit, le journal du conteneur, le journal de l'`api`. Mon premier
 *     motif en trouvait vingt, dont zéro renvoi. Un garde qui accuse du texte
 *     correct se fait désactiver, et il ne sert plus le jour où il a raison.
 *   · « le brief » sans numéro — de la PROSE : « il contredisait ce que tout le
 *     monde croyait, le brief d'architecture compris » ne renvoie à rien, il
 *     raconte.
 *
 * C'est la différence entre un pointeur et une mention, et seule la NUMÉROTATION
 * la rend mécanique.
 *
 * ⚠ LA FORME EST UNE OBLIGATION, pas un balayage : chaque renvoi est absent, ou
 * DÉCLARÉ ci-dessous avec son motif. Un renvoi neuf n'est dans aucune des deux
 * listes, et le test échoue en disant les deux issues.
 */

const RACINE = join(__dirname, '..', '..', '..', '..');
const git = (...a: string[]) =>
  execFileSync('git', a, { cwd: RACINE, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const PUBLIEUR = join(RACINE, 'scripts', 'publier-instantane.sh');

/**
 * ⚠ CE GARDE N'EST PAS MESURABLE DANS LE DÉPÔT PUBLIC, et il le DIT.
 *
 * 🔴 Il EXÉCUTE `publier-instantane.sh` pour lire la liste des fichiers qui
 * sortent — à la valeur réelle, jamais recopiée. Or ce script est RETENU : il
 * porte `SORTANT` et les interdictions, et le publier reviendrait à publier nos
 * décisions de publication.
 *
 * Résultat, mesuré sur la CI publique du 15 octobre 2026 :
 *     Error: spawnSync ./scripts/publier-instantane.sh ENOENT
 * La CI publique est devenue ROUGE sur un test qui ne pouvait pas tourner
 * là-bas.
 *
 * ⭐ ET C'EST, MOT POUR MOT, LA FAUTE QUE LA LEÇON DU 18 SEPTEMBRE DÉCRIT :
 * « le garde écrit ce matin pour attraper cette famille portait la faute : il
 * lisait le script de publication, qui n'est pas publié ». Connaître la règle
 * n'empêche pas de commettre la faute.
 *
 * ⚠ TROIS ISSUES EXISTENT, et la leçon les ordonne : publier la source — ici
 * impossible —, emporter le test avec elle, ou DÉGRADER EN LE DISANT. On prend
 * la troisième : ce garde mesure NOS décisions de publication, qui n'ont aucun
 * sens pour qui clone. Il ne passe donc pas en silence — il refuse de prétendre
 * avoir mesuré.
 */
const MESURABLE = existsSync(PUBLIEUR);

/** Les fichiers qui SORTENT — lus à la VALEUR RÉELLE, jamais recopiés. */
function publies(): Set<string> {
  const sortie = execFileSync('./scripts/publier-instantane.sh', ['--lister'], {
    cwd: RACINE,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return new Set(sortie.split('\n').map((l) => l.trim()).filter(Boolean));
}

const suivis = new Set(git('ls-files').split('\n').filter(Boolean));

const CHEMIN = /(?:docs|scripts|apps)\/[A-Za-z0-9._/-]+\.(?:md|sh|mjs|ts|tsx|sql|json)/g;
/**
 * ⚠ LES POINTEURS NUMÉROTÉS. Le numéro est ce qui distingue un renvoi d'une
 * mention : « backlog n°29 » désigne une entrée précise d'un document retenu,
 * « le backlog » ne désigne rien de vérifiable.
 */
const POINTEUR = /backlog n[°o] ?\d+|brief #\d+|brief n[°o] ?\d+/g;

type Renvoi = { depuis: string; vers: string };

/** Renvoi DÉCLARÉ : il subsiste, et on dit pourquoi. */
const DECLARES: { depuis: string; vers: string; motif: string }[] = [
  {
    depuis: 'docs/specification-couverture-composee.md',
    vers: 'docs/couvertures/source/positions-textes.json',
    motif:
      "le dossier `source/` porte l'ŒUVRE DU FOURNISSEUR, retenue jusqu'à cession " +
      'des droits. Le document DOIT la nommer : la grille de composition en vient, ' +
      "et un implémenteur qui ne sait pas d'où elle sort la réinventerait. Ce renvoi " +
      "tombe le jour où les droits sont cédés — c'est une dette de DROITS, pas de " +
      'rédaction.',
  },
  {
    depuis: 'docs/specification-couverture-composee.md',
    vers: 'apps/api/src/common/publication-declaree.spec.ts',
    motif:
      "le document explique que le dossier du fournisseur est déclaré `a-publier` " +
      'DANS ce fichier, et que la déclaration devient fausse — donc refusée — le ' +
      'jour où le dossier sort. Nommer le garde est le seul moyen de rendre la ' +
      'promesse vérifiable ; la masquer la rendrait indémontrable.',
  },
];

describe.skipIf(!MESURABLE)(
  '⚠ L’OBLIGATION : un fichier publié ne renvoie à rien de retenu',
  () => {
  const PUB = publies();
  const documents = [...PUB].filter((f) => f.endsWith('.md')).sort();
  const lus: string[] = [];
  const parChemin: Renvoi[] = [];
  const parPointeur: Renvoi[] = [];

  for (const f of documents) {
    let texte: string;
    try {
      texte = readFileSync(join(RACINE, f), 'utf8');
    } catch {
      continue;
    }
    lus.push(f);
    for (const m of texte.match(CHEMIN) ?? []) {
      // ⚠ un chemin qui ne DÉSIGNE RIEN n'est pas un renvoi vers un retenu :
      // c'est un exemple, ou un fichier disparu. Le second cas est une autre
      // famille, et le mélanger ici rendrait ce garde illisible.
      if (!suivis.has(m)) continue;
      if (PUB.has(m)) continue;
      parChemin.push({ depuis: f, vers: m });
    }
    for (const m of texte.match(POINTEUR) ?? []) {
      parPointeur.push({ depuis: f, vers: m.replace(/\s+/g, ' ') });
    }
  }

  it('⚠ TÉMOIN : les documents publiés sont LUS, et le relevé voit la matière', () => {
    // ⚠ Le témoin porte sur la MATIÈRE, pas sur les trouvailles : un dépôt
    // parfait n'aurait AUCUN renvoi, et un témoin qui exigerait des trouvailles
    // punirait celui qui fait bien.
    expect(lus.length, 'aucun document publié lu — ce garde ne mesure rien').toBeGreaterThan(10);
    expect(lus, 'DEPLOY.md doit être dans la population').toContain('DEPLOY.md');
  });

  it('⚠ TÉMOIN D’ABSENCE : les formes LÉGITIMES ne sont pas prises pour des renvois', () => {
    // Mesuré avant d'écrire ce garde : « le journal » apparaît vingt fois dans
    // les documents publiés, et zéro fois comme renvoi.
    for (const legitime of [
      "le journal d'audit",
      'le journal du conteneur',
      "le journal de l'api dit exactement quoi faire",
      'le brief d’architecture compris',
      'consultez le backlog',
    ]) {
      expect(legitime.match(POINTEUR), `« ${legitime} » ne doit PAS être pris pour un renvoi`).toBeNull();
    }
    // et le témoin de PRÉSENCE du même motif : il doit mordre sur un pointeur
    expect('voir backlog n°29'.match(POINTEUR), 'le motif doit voir un pointeur numéroté').not.toBeNull();
    expect('voir brief #2'.match(POINTEUR)).not.toBeNull();
  });

  it('chaque renvoi par CHEMIN est absent, ou DÉCLARÉ avec son motif', () => {
    const orphelins = parChemin.filter(
      (r) => !DECLARES.some((d) => d.depuis === r.depuis && d.vers === r.vers),
    );
    expect(
      orphelins.map((r) => `${r.depuis} → ${r.vers}`).sort(),
      'Un fichier PUBLIÉ renvoie à un fichier RETENU. Pour le lecteur du dépôt ' +
        'public, c’est une impasse muette.\n' +
        '  · le renvoi n’apporte rien → retirez-le, ou dites la chose au lieu de ' +
        'la désigner ;\n' +
        '  · le fichier visé DOIT sortir → ajoutez-le à SORTANT ;\n' +
        '  · le renvoi est nécessaire et le fichier reste retenu → déclarez-le ' +
        'dans DECLARES, avec son motif ET ce qui le ferait tomber.',
    ).toEqual([]);
  });

  it('aucun POINTEUR NUMÉROTÉ vers un document retenu', () => {
    expect(
      parPointeur.map((r) => `${r.depuis} : ${r.vers}`).sort(),
      'Un document publié renvoie au backlog ou à un brief PAR SON NUMÉRO.\n' +
        'Ce n’est pas un chemin, donc aucun relevé d’adresses ne le voit — et ' +
        'c’est pourtant une impasse aussi sûre.\n' +
        '  · remplacez le pointeur par CE QU’IL DIT (« la file d’attente n’est ' +
        'pas servie » plutôt que « backlog n°29 ») ;\n' +
        '  · gardez la date si elle situe la décision, elle ne renvoie à rien.',
    ).toEqual([]);
  });

  it('⚠ aucune déclaration ne couvre un renvoi DISPARU', () => {
    // Une exception qu'on ne relit jamais finit par couvrir autre chose.
    const perimees = DECLARES.filter(
      (d) => !parChemin.some((r) => r.depuis === d.depuis && r.vers === d.vers),
    );
    expect(
      perimees.map((d) => `${d.depuis} → ${d.vers}`),
      'Déclaration(s) qui ne correspondent plus à rien : le renvoi a été retiré, ' +
        'ou le fichier visé est sorti. Retirez la ligne.',
    ).toEqual([]);
  });
  },
);

/**
 * ⚠ ET LE CAS NON MESURABLE SE DIT, il ne se tait pas. Sans cette ligne,
 * l'absence du publieur rendrait le fichier VERT sur zéro cas — « une suite
 * verte sur une population vide », exactement ce que ce dépôt refuse.
 */
describe.runIf(!MESURABLE)('ce garde hors du dépôt interne', () => {
  it('⚠ NON MESURABLE ICI : le publieur est retenu, donc la liste est inconnue', () => {
    expect(MESURABLE, 'ce cas ne doit tourner que si le publieur est ABSENT').toBe(false);
    console.warn(
      '\n\u24d8 renvois-vers-un-retenu : NON MESURABLE dans ce clone.\n' +
        '  Ce garde exécute scripts/publier-instantane.sh, qui est RETENU de la\n' +
        '  publication. Il mesure nos décisions de publication — sans objet ici.\n',
    );
  });
});
