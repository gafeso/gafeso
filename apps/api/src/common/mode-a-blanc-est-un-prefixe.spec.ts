import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 🔴 LE MODE À BLANC EST UN PRÉFIXE STRICT — L'ARRÊT EST LA SEULE DIFFÉRENCE.
 *
 * *Posé le 3 novembre 2026, sur les trois conditions de Jean : « MÊME CHEMIN DE
 * CODE, arrêté à un point. Pas une branche parallèle : deux chemins qui
 * s'accordent s'accordent par coïncidence. »*
 *
 * ## Ce que `--dry-run` doit garantir
 *
 * ① il exécute les MÊMES fonctions, dans le MÊME ordre, et s'arrête ;
 * ② ce qu'il écrit est ce qu'une installation réelle écrirait ;
 * ③ il ne laisse RIEN qui ferait refuser un lancement réel ensuite.
 *
 * ## ⭐ COMMENT ② SE PROUVE SANS JOUER UNE INSTALLATION RÉELLE
 *
 * Pas en comparant deux sorties — il n'y a qu'un producteur. En prouvant que
 * **le drapeau n'atteint aucune fonction qui produise quelque chose** :
 * `write_env`, `poser_version` et `verifier_compose` ne le mentionnent pas. La
 * seule différence est `ENV_FILE`, réaffecté une fois dans `main`. Si demain
 * quelqu'un ajoute `if [ "$DRY_RUN" = 1 ]` dans `write_env` — le geste exact
 * qui transformerait le préfixe en branche parallèle — ces cas tombent.
 *
 * ## ⚠ ET IL A DÉJÀ PAYÉ SON ÉCRITURE
 *
 * Le premier `--dry-run` exécuté a trouvé une faute que AUCUN garde textuel ne
 * pouvait voir : un commentaire que j'avais ajouté DANS le heredoc de
 * `.env.prod` contenait `${VAR:?}`, et le heredoc n'est pas protégé. Bash le
 * substituait et mourait — « line 815: VAR: parameter null or not set ».
 * **Toute installation était cassée**, et mes deux gardes lisaient le texte
 * sans jamais l'exécuter. Mesuré par l'effet, au premier essai.
 */

const RACINE = join(__dirname, '..', '..', '..', '..');
const INSTALL = readFileSync(join(RACINE, 'install.sh'), 'utf-8');

/** Le corps d'une fonction shell `nom() { … }`, accolade de fin en colonne 0. */
function corps(nom: string): string {
  const lignes = INSTALL.split('\n');
  const d = lignes.findIndex((l) => l.startsWith(`${nom}()`));
  if (d < 0) throw new Error(`fonction ${nom} introuvable dans install.sh`);
  const f = lignes.findIndex((l, i) => i > d && l === '}');
  if (f < 0) throw new Error(`fonction ${nom} non refermée`);
  return lignes.slice(d + 1, f).join('\n');
}

/** Les lignes de CODE de `main()` — commentaires dépouillés. */
function appelsDeMain(): string[] {
  return corps('main')
    .split('\n')
    .map((l) => l.replace(/#.*$/, '').trim())
    .filter(Boolean);
}

describe('⚠ TÉMOINS DE LECTURE', () => {
  it('install.sh est lu, et les quatre fonctions existent', () => {
    expect(INSTALL.length).toBeGreaterThan(5000);
    for (const f of ['write_env', 'poser_version', 'verifier_compose', 'main']) {
      expect(corps(f).length, `${f} vide`).toBeGreaterThan(20);
    }
  });

  it('⭐ TÉMOIN DE PRÉSENCE — le relevé voit bien le drapeau là où il DOIT être', () => {
    // Si ce cas tombe, le relevé ne sait pas reconnaître une mention et les
    // témoins d'absence ci-dessous seraient verts pour la mauvaise raison.
    expect(corps('main')).toContain('DRY_RUN');
    expect(corps('bilan_a_blanc')).toContain('DRY_RUN_TMP');
  });
});

describe('🔴 ① LE DRAPEAU N’ATTEINT AUCUNE FONCTION QUI PRODUIT', () => {
  // ⚠ `verifier_compose` incluse : le jour où elle se relâcherait « parce qu'on
  // est à blanc », le mode à blanc cesserait de prouver ce qu'il prouve.
  for (const f of ['write_env', 'poser_version', 'verifier_compose']) {
    it(`⭐ ${f} ignore DRY_RUN — sinon le préfixe devient une branche`, () => {
      expect(
        corps(f),
        `${f} teste DRY_RUN : ce qu'elle produit peut désormais DIFFÉRER d'une ` +
          'installation réelle, et les deux chemins ne s’accorderont que par coïncidence',
      ).not.toContain('DRY_RUN');
    });
  }
});

describe('🔴 ② L’ARRÊT EST LA SEULE DIFFÉRENCE, et il est UNIQUE', () => {
  it('⭐ un seul arrêt dans main, et c’est un `return`', () => {
    const arrets = appelsDeMain().filter((l) => l.includes('DRY_RUN') && l.includes('return'));
    expect(arrets.length, 'il doit y avoir exactement UN point d’arrêt').toBe(1);
  });

  it('⭐ et tout ce qui précède l’arrêt est aussi joué par une installation RÉELLE', () => {
    // C'est la définition d'un préfixe : les appels d'avant ne sont pas
    // conditionnés au mode. Un `if DRY_RUN` ailleurs dans main romprait ça.
    const lignes = appelsDeMain();
    const i = lignes.findIndex((l) => l.includes('DRY_RUN') && l.includes('return'));
    expect(i).toBeGreaterThan(0);
    const avant = lignes.slice(0, i);
    /**
     * ⚠ CE CAS A ÉTÉ RESSERRÉ : il exigeait ZÉRO mention de `DRY_RUN` avant
     * l'arrêt, et accusait donc le bloc de détournement d'`ENV_FILE` — la
     * SEULE différence légitime, celle que tout le reste de ce fichier
     * documente. Un garde qui accuse ce qu'il est censé autoriser se
     * désactive.
     *
     * La propriété vraie est plus étroite : aucun APPEL DE FONCTION du
     * préfixe n'est conditionné au mode. Les mentions tolérées sont celles du
     * détournement — `mktemp`, `ENV_FILE`, `trap`, et leur `if`/`fi`.
     */
    const detournement = /DRY_RUN_TMP|ENV_FILE=|trap |^if \[ "\$DRY_RUN" = 1 \]; then$|^fi$/;
    expect(
      avant.filter((l) => l.includes('DRY_RUN') && !detournement.test(l)),
      'une fonction du préfixe est conditionnée au mode : ce n’est plus un préfixe',
    ).toEqual([]);
    // Et aucun appel nu de fonction ne vit dans le bloc de détournement.
    expect(avant.filter((l) => /^(write_env|poser_version|verifier_compose)$/.test(l)).length).toBe(3);
    // Et le préfixe contient bien les trois producteurs : un arrêt placé trop
    // tôt rendrait le mode à blanc vert sans rien éprouver.
    for (const f of ['write_env', 'poser_version', 'verifier_compose']) {
      expect(avant.some((l) => l === f), `${f} n’est pas dans le préfixe`).toBe(true);
    }
  });

  it('🔴 TÉMOIN D’ABSENCE — l’arrêt ne saute AUCUN producteur', () => {
    // La confusion plausible : arrêter avant `verifier_compose` pour « aller
    // plus vite ». Le mode à blanc dirait alors « tout va bien » sans avoir
    // jamais demandé au compose s'il accepte l'environnement.
    const lignes = appelsDeMain();
    const i = lignes.findIndex((l) => l.includes('DRY_RUN') && l.includes('return'));
    const apres = lignes.slice(i + 1);
    expect(apres.some((l) => l === 'verifier_compose')).toBe(false);
    expect(apres.some((l) => l === 'write_env')).toBe(false);
  });
});

describe('🔴 ③ IL NE LAISSE RIEN — et il le DIT', () => {
  it('⭐ le fichier est écrit dans un dossier temporaire, pas sur .env.prod', () => {
    const m = corps('main');
    expect(m).toContain('mktemp -d');
    expect(m, "ENV_FILE doit être détourné, sinon un .env.prod réel est écrasé").toMatch(
      /ENV_FILE="\$DRY_RUN_TMP/,
    );
  });

  it('🔴 et il est supprimé même en cas d’interruption — `trap`', () => {
    // Un Ctrl-C au milieu laisserait sinon un fichier de VRAIS SECRETS en
    // clair dans /tmp.
    expect(corps('main')).toMatch(/trap .*rm -rf.*DRY_RUN_TMP.*EXIT/);
  });

  it('⚠ et il NOMME ce qu’il n’a pas éprouvé', () => {
    // Un contrôle qui s'arrête tôt et se taît sur son périmètre fait croire à
    // une installation validée de bout en bout.
    const b = corps('bilan_a_blanc');
    // ⚠ Le motif évite l'apostrophe : la source shell l'échappe en `'"'"'`,
    // et la chercher telle quelle ne trouvait rien — le garde tombait sur du
    // code correct.
    expect(b).toContain('A PAS ÉTÉ ÉPROUVÉ');
    expect(b).toContain('check_dns');
  });
});

/**
 * ⭐⭐ ET LA MESURE PAR L'EFFET — on l'EXÉCUTE.
 *
 * ⚠ `verifier_compose` exige un Docker qui répond : sans lui, le mode à blanc
 * rend INDÉCIDABLE, et c'est juste. Ce cas se conditionne donc à Docker — mais
 * il le DIT, et un premier cas MESURE l'état pour qu'aucun silence ne passe
 * pour un succès.
 */
describe('⭐⭐ PAR L’EFFET — le mode à blanc s’exécute vraiment', () => {
  const dockerRepond = (() => {
    try {
      execFileSync('docker', ['info'], { stdio: 'ignore', timeout: 20_000 });
      return true;
    } catch {
      return false;
    }
  })();

  it('⚠ OÙ EN EST L’ENVIRONNEMENT — ce cas MESURE, il ne juge pas', () => {
    // eslint-disable-next-line no-console
    console.log(
      `    [mode à blanc] Docker ${dockerRepond ? 'répond — le cas suivant EXÉCUTE' : 'ne répond pas — le cas suivant est écarté, et ce n’est PAS un succès'}`,
    );
    expect(typeof dockerRepond).toBe('boolean');
  });

  /**
   * 🔴 LE DÉFAUT QUE LE MODE À BLANC A TROUVÉ LE JOUR DE SA NAISSANCE.
   *
   * *Première exécution sous `test:base` — qui injecte `.env` dans
   * l'environnement via `dotenv -e` :*
   *
   *     failed to read /tmp/…/.env.prod: line 67: key cannot contain a space
   *
   * Un PEM est multiligne par nature, et c'est la forme sous laquelle un
   * exploitant ou une CI l'exporte. `gen_license_key` aplatissait déjà le PEM
   * qu'il ENGENDRE ; le chemin de la valeur HÉRITÉE ne le faisait pas — deux
   * chemins pour une même valeur, dont un seul respectait la convention.
   * L'installation réelle aurait échoué au `up`, sur un message qui n'accuse
   * pas la clé.
   *
   * ⚠ La clé employée ici est FAUSSE et le restera : trois lignes suffisent à
   * reproduire, et aucune vraie clé n'a de raison d'entrer dans une épreuve.
   */
  it.runIf(dockerRepond)(
    '🔴 une clé héritée MULTILIGNE n’écrit plus un fichier illisible',
    () => {
      const bac = mkdtempSync(join(tmpdir(), 'gafeso-pem-'));
      const conf = join(bac, 'essai.conf');
      writeFileSync(conf, 'DOMAIN=localhost\nADMIN_EMAIL=admin@exemple.org\n');
      const sortie = execFileSync(
        'bash',
        ['./install.sh', '--dry-run', '--config', conf, '--skip-dns-check'],
        {
          cwd: RACINE,
          encoding: 'utf-8',
          timeout: 300_000,
          env: {
            ...process.env,
            OFFLINE_LICENSE_PRIVATE_KEY:
              '-----BEGIN FAUSSE CLE-----\nLIGNE DEUX AVEC DES ESPACES\n-----END FAUSSE CLE-----',
          },
        },
      );
      // L'EFFET : le compose accepte le fichier, et l'aplatissement est DIT.
      expect(sortie).toContain('le compose se résout');
      expect(sortie, "l'aplatissement doit être annoncé, jamais silencieux").toContain('aplatie');
    },
    320_000,
  );

  it.runIf(dockerRepond)(
    '⭐⭐ il sort en 0, écrit un environnement que le compose RÉSOUT, et ne laisse rien',
    () => {
      const bac = mkdtempSync(join(tmpdir(), 'gafeso-blanc-'));
      const conf = join(bac, 'essai.conf');
      writeFileSync(conf, 'DOMAIN=localhost\nADMIN_EMAIL=admin@exemple.org\n');

      const sortie = execFileSync(
        'bash',
        ['./install.sh', '--dry-run', '--config', conf, '--skip-dns-check'],
        { cwd: RACINE, encoding: 'utf-8', timeout: 300_000 },
      );

      // L'EFFET : le compose a accepté l'environnement engendré.
      expect(sortie).toContain('le compose se résout');
      // ③ par l'effet : le dossier temporaire annoncé n'existe plus.
      const chemin = sortie.match(/(\/tmp\/[^\s/]+)\/\.env\.prod/)?.[1];
      expect(chemin, "le chemin temporaire doit être annoncé").toBeTruthy();
      expect(existsSync(chemin!), 'un fichier de VRAIS SECRETS est resté dans /tmp').toBe(false);
      // ⚠ ET AUCUN SECRET DANS LA SORTIE — elle est lue, journalisée, collée.
      expect(sortie).not.toMatch(/MINIO_ROOT_PASSWORD=\S/);
      expect(sortie).not.toMatch(/GARAGE_RPC_SECRET=\S/);
    },
    320_000,
  );
});
