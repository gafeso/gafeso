import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 🔴 LA CAUSE AVANT LE REMÈDE — et le remède ne détruit pas une pile saine.
 *
 * *Posé le 3 novembre 2026, après que la recette d'installation a trouvé ceci
 * sur une machine NEUVE, avec de vrais domaines :*
 *
 *     6/7 · Lecture d'un document, de bout en bout
 *     ✖ LE STOCKAGE EST INJOIGNABLE DEPUIS L'HÔTE.
 *     curl: (35) OpenSSL/3.0.13: error:0A000438:SSL routines::tlsv1 alert internal error
 *
 * Deux minutes plus tard, les trois domaines répondaient : Caddy obtenait
 * encore ses certificats auprès de Let's Encrypt.
 *
 * ## DEUX DÉFAUTS, et ils se cumulaient
 *
 * ① **LE MOMENT.** L'auto-contrôle se lançait avant que le certificat existe.
 *   Le contrôle était juste ; il mesurait au mauvais instant. Il l'aurait fait
 *   chez CHAQUE auto-hébergeur installant sur de vrais domaines.
 *
 * ② **LA CAUSE.** « Injoignable » confondait trois causes distinctes — pas de
 *   certificat, pas de DNS, rien qui écoute — et envoyait l'exploitant
 *   vérifier « le DNS, Caddy, et que le conteneur tourne » là où il n'y avait
 *   rien à voir.
 *
 * ③ **ET LE REMÈDE, qui est le plus grave.** `CLEANUP_HINT` était posé une
 *   seule fois, au démarrage de la pile, et restait armé pendant le
 *   provisionnement et l'auto-contrôle : un échec de certificat conseillait
 *   « dc down -v puis rm -f .env.prod ». **La destruction d'une installation
 *   parfaitement saine, volumes compris, pour un défaut qui se résolvait seul.**
 *
 * ## ⚠ LES CODES DE curl SONT MESURÉS, PAS CITÉS
 *
 * 35 (TLS), 7 (rien n'écoute), 6 (DNS) ont été relevés par l'effet : un
 * serveur en clair interrogé en `https://` rend bien 35, le même code que la
 * recette a vu. Le cas ci-dessous REJOUE le classificateur réel.
 */

const RACINE = join(__dirname, '..', '..', '..', '..');
const INSTALL = readFileSync(join(RACINE, 'install.sh'), 'utf-8');
const AUTO = readFileSync(join(RACINE, 'scripts', 'autocontrole-lecture.sh'), 'utf-8');

/** Les lignes de CODE d'une fonction shell — commentaires dépouillés. */
function codeDe(source: string, nom: string): string {
  const lignes = source.split('\n');
  const d = lignes.findIndex((l) => l.startsWith(`${nom}()`));
  if (d < 0) throw new Error(`fonction ${nom} introuvable`);
  const f = lignes.findIndex((l, i) => i > d && l === '}');
  return lignes
    .slice(d + 1, f)
    .map((l) => l.replace(/^\s*#.*$/, ''))
    .join('\n');
}

describe('🔴 ① LE MOMENT — le certificat est attendu AVANT la lecture', () => {
  it('⭐ main() appelle attendre_certificat puis autocontrole, dans cet ordre', () => {
    // ⚠ L'ORDRE DES APPELS, pas les positions dans le fichier : « la position
    // dans le fichier n'est pas l'ordre d'exécution » (CLAUDE.md §2), leçon
    // payée ce matin même sur un autre garde.
    const lignes = INSTALL.split('\n');
    const d = lignes.findIndex((l) => l.startsWith('main()'));
    const f = lignes.findIndex((l, i) => i > d && l === '}');
    const appels = lignes
      .slice(d + 1, f)
      .map((l) => l.replace(/#.*$/, '').trim())
      .filter(Boolean);
    const iCert = appels.indexOf('attendre_certificat');
    const iAuto = appels.indexOf('autocontrole');
    expect(iCert, 'attendre_certificat n’est pas appelée par main()').toBeGreaterThan(-1);
    expect(iAuto).toBeGreaterThan(-1);
    expect(iCert, 'le certificat doit être attendu AVANT la lecture').toBeLessThan(iAuto);
  });

  it('⭐ l’attente est BORNÉE — sans borne, une installation pend indéfiniment', () => {
    const code = codeDe(INSTALL, 'attendre_certificat');
    expect(code).toMatch(/timeout=/);
    expect(code, 'la borne doit être franchie, pas seulement déclarée').toMatch(/reste.*-le 0|le 0/);
  });

  it('⚠ et en mode local elle NE FAIT RIEN, en le DISANT', () => {
    // Caddy sert en clair sur localhost : attendre un certificat y serait
    // attendre une chose qui n'arrivera jamais. Un saut SILENCIEUX, en
    // revanche, ferait croire à une attente réussie.
    const code = codeDe(INSTALL, 'attendre_certificat');
    expect(code).toMatch(/https:\/\//);
    expect(code).toMatch(/return 0/);
    expect(code, 'le saut doit être annoncé').toMatch(/info /);
  });
});

describe('🔴 ② LA CAUSE — trois issues nommées, dans les DEUX fichiers', () => {
  // ⚠ `autocontrole-lecture.sh` est AUSSI lancé à la main depuis DEPLOY.md :
  // corriger seulement le moment dans install.sh aurait laissé la fausse cause
  // en place là-bas.
  for (const [nom, source] of [
    ['install.sh', INSTALL],
    ['scripts/autocontrole-lecture.sh', AUTO],
  ] as const) {
    it(`⭐ ${nom} classe la famille TLS à part du cas générique`, () => {
      expect(source, `${nom} ne distingue pas les codes TLS de curl`).toMatch(/35\|58\|60\|77\|83/);
      expect(source, `${nom} ne nomme pas la cause « certificat »`).toMatch(/CERTIFICAT/);
    });
  }

  it('⭐⭐ PAR L’EFFET : le classificateur RÉEL, rejoué avec le code 35', () => {
    // On EXÉCUTE le `case` tel qu'il est écrit dans le script, au lieu de
    // relire son texte : c'est la seule façon de savoir ce qu'il DIT.
    const d = AUTO.indexOf('  case "$CURL" in');
    const f = AUTO.indexOf('  esac\n', d) + '  esac\n'.length;
    expect(d, 'le classificateur est introuvable').toBeGreaterThan(0);
    const bloc = AUTO.slice(d, f);
    const script = [
      "rouge() { printf '%s\\n' \"$*\"; }",
      "gris() { printf '%s\\n' \"$*\"; }",
      'CURL=35',
      bloc,
    ].join('\n');
    const sortie = execFileSync('bash', ['-c', script], { encoding: 'utf-8' });
    expect(sortie, 'un échec TLS doit nommer le CERTIFICAT').toContain('CERTIFICAT');
    expect(sortie, 'il ne doit PLUS dire « injoignable »').not.toMatch(/INJOIGNABLE/);
    expect(sortie, 'et il doit interdire la destruction').toMatch(/NE DÉTRUISEZ RIEN/);
  });

  it('🔴 TÉMOIN D’ABSENCE — un code INCONNU ne reçoit aucun remède inventé', () => {
    // La tentation est de ranger l'inconnu dans la cause la plus fréquente.
    // « Quand on ne sait pas, on le dit » : le cas générique nomme le code et
    // s'abstient de conseiller.
    const d = AUTO.indexOf('  case "$CURL" in');
    const f = AUTO.indexOf('  esac\n', d) + '  esac\n'.length;
    const script = [
      "rouge() { printf '%s\\n' \"$*\"; }",
      "gris() { printf '%s\\n' \"$*\"; }",
      'CURL=99',
      AUTO.slice(d, f),
    ].join('\n');
    const sortie = execFileSync('bash', ['-c', script], { encoding: 'utf-8' });
    expect(sortie).toMatch(/non classée/);
    expect(sortie, 'il ne doit pas accuser le certificat sur un code inconnu').not.toMatch(
      /CERTIFICAT TLS/,
    );
  });
});

describe('🔴 ③ LE REMÈDE — il ne détruit plus une pile saine', () => {
  it('⭐⭐ dès que la pile est SAINE, le conseil destructeur est remplacé', () => {
    const code = codeDe(INSTALL, 'compose_up');
    // Le conseil destructeur existe encore — il est JUSTE tant que la pile ne
    // démarre pas — mais il doit être SUIVI d'un remplacement.
    const iDestructeur = code.indexOf('down -v');
    const iRemplacement = code.lastIndexOf('CLEANUP_HINT=');
    expect(iDestructeur, 'le conseil de repartir de zéro a disparu').toBeGreaterThan(-1);
    expect(
      iRemplacement,
      'CLEANUP_HINT doit être réécrit après que les services sont sains',
    ).toBeGreaterThan(iDestructeur);
  });

  it('🔴 et le conseil posé APRÈS la santé ne contient AUCUNE destruction', () => {
    const code = codeDe(INSTALL, 'compose_up');
    const apres = code.slice(code.lastIndexOf('CLEANUP_HINT='));
    for (const destructeur of ['down -v', 'rm -f', 'docker volume rm']) {
      expect(
        apres,
        `le conseil d’après-santé propose « ${destructeur} » : il détruirait des données existantes`,
      ).not.toContain(destructeur);
    }
    expect(apres, 'il doit dire explicitement de ne pas détruire').toMatch(/ne la détruisez pas/i);
  });

  it('🔴 aucun arrêt du chemin « certificat » ne conseille de détruire', () => {
    const code = codeDe(INSTALL, 'attendre_certificat');
    for (const destructeur of ['down -v', 'rm -f']) {
      expect(code, `le chemin certificat propose « ${destructeur} »`).not.toContain(destructeur);
    }
    // Et il dit quoi faire : relancer, pas détruire.
    expect(code).toMatch(/--force/);
  });
});
