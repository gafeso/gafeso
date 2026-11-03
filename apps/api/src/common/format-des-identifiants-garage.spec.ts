import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ⭐⭐ LE GÉNÉRATEUR ET LE VALIDATEUR SONT DEUX SOURCES — ON LES CONFRONTE EN
 * LES EXÉCUTANT, PAS EN COMPARANT DEUX COPIES.
 *
 * *Posé le 3 novembre 2026, sur exigence de Jean : « Le validateur est la
 * source : fais que le générateur en DÉPENDE, ou, si c'est impossible entre
 * bash et node, écris l'épreuve qui CONFRONTE les deux et qui tombe si l'un
 * bouge sans l'autre. »*
 *
 * ## 🔴 CE QUE L'ABSENCE DE CETTE ÉPREUVE A COÛTÉ
 *
 * `install.sh` produisait un secret en **base64url** (`gen_secret 24`) et un
 * identifiant retombant sur `gafeso`. `scripts/lib/garage-initialiser.mjs`
 * exige `/^GK[0-9a-f]{24}$/` et `/^[0-9a-f]{64}$/`. **Toute installation NEUVE
 * s'arrêtait donc à `garage-init`** — et `install.sh` ne contenait pas une
 * seule fois le mot « garage » sur ses 962 lignes : la bascule avait mis à jour
 * le compose, `DEPLOY.md` et l'auto-contrôle, pas l'installateur.
 *
 * ## ⚠ POURQUOI UNE CONFRONTATION ET PAS UNE DÉPENDANCE
 *
 * Faire dépendre le générateur du validateur demanderait d'exécuter `node`
 * depuis `install.sh`. Mais `install.sh` tourne sur un hôte NEUF, dont la
 * seule dépendance exigée est Docker — pas Node. Lui en imposer une
 * deuxième pour engendrer deux chaînes aléatoires serait payer cher un
 * couplage qu'une épreuve obtient gratuitement.
 *
 * ## ⭐ ET ELLE NE COMPARE PAS DEUX TEXTES : ELLE EXÉCUTE
 *
 * C'est tout l'écart avec un garde qui recopierait les deux expressions pour
 * les comparer — « quand une épreuve recalcule au lieu de LIRE, elle se
 * compare à elle-même » (Jean, 3 novembre 2026, troisième fois en deux jours).
 * Ici :
 *   · les deux expressions sont LUES dans le validateur ;
 *   · les deux commandes sont LUES dans `install.sh` et RÉELLEMENT EXÉCUTÉES ;
 *   · on applique les premières aux secondes.
 * Si l'un des deux bouge sans l'autre, le test tombe.
 */

const RACINE = join(__dirname, '..', '..', '..', '..');
const INSTALL = readFileSync(join(RACINE, 'install.sh'), 'utf-8');
const VALIDATEUR = readFileSync(join(RACINE, 'scripts', 'lib', 'garage-initialiser.mjs'), 'utf-8');

/** L'expression que le VALIDATEUR exige, lue dans sa source. */
function formeExigee(nom: 'FORME_CLE' | 'FORME_SECRET'): RegExp {
  const ligne = VALIDATEUR.split('\n').find((l) => l.includes(`const ${nom} =`));
  if (!ligne) throw new Error(`${nom} introuvable dans le validateur`);
  const m = ligne.match(/=\s*\/(.+)\/\s*;/);
  if (!m) throw new Error(`${nom} n'est pas une expression régulière littérale : ${ligne}`);
  return new RegExp(m[1]);
}

/** La commande que le GÉNÉRATEUR emploie, lue dans `install.sh` puis exécutée. */
function engendre(variable: string): string {
  const ligne = INSTALL.split('\n')
    .map((l) => l.trim())
    .find((l) => l.startsWith(`${variable}="`) && l.includes('openssl'));
  if (!ligne) throw new Error(`aucune génération openssl pour ${variable} dans install.sh`);
  const m = ligne.match(/^[A-Z_]+="(.*)"$/);
  if (!m) throw new Error(`génération illisible : ${ligne}`);
  // ⚠ ON L'EXÉCUTE. Lire la commande et juger sa FORME serait relire du texte ;
  // c'est sa SORTIE que le validateur recevra.
  return execFileSync('bash', ['-c', `printf '%s' "${m[1]}"`], { encoding: 'utf-8' }).trim();
}

describe('⚠ TÉMOINS DE LECTURE — les deux sources sont lues, et non vides', () => {
  it('chacune porte son ancrage', () => {
    expect(INSTALL.length, 'install.sh vide ou introuvable').toBeGreaterThan(5000);
    expect(VALIDATEUR).toContain('FORME_CLE');
    expect(VALIDATEUR).toContain('FORME_SECRET');
  });

  /**
   * ⚠ LE COMMENTAIRE D'`install.sh` AFFIRME QUE CETTE ÉPREUVE LE GARDE — et
   * « un commentaire qui affirme "protégé par X" est une affirmation sur du
   * CODE QUI VIT AILLEURS : il se vérifie en allant regarder X, ou pas du
   * tout ». Alors on va regarder, dans les deux sens.
   */
  it('⭐ install.sh NOMME cette épreuve, et par son chemin entier', () => {
    const chemin = 'apps/api/src/common/format-des-identifiants-garage.spec.ts';
    expect(
      INSTALL,
      `install.sh ne nomme plus ${chemin} : son commentaire promet un garde que personne ne retrouvera`,
    ).toContain(chemin);
  });

  it('⚠ et install.sh CONNAÎT désormais Garage — il l’ignorait entièrement', () => {
    // 962 lignes, zéro occurrence : c'est ce silence qui a laissé passer le
    // format MinIO dans un installateur Garage.
    expect(/garage/i.test(INSTALL), 'install.sh ne mentionne pas Garage').toBe(true);
  });
});

describe('🔴 LA CLÉ — ce qu’install.sh engendre satisfait ce que Garage exige', () => {
  it('⭐ la sortie RÉELLE du générateur passe l’expression RÉELLE du validateur', () => {
    const forme = formeExigee('FORME_CLE');
    const cle = engendre('MINIO_ROOT_USER');
    expect(cle, `« ${cle} » ne satisfait pas ${forme} — garage-init REFUSERA`).toMatch(forme);
  });

  it('⚠ et elle est ALÉATOIRE : deux exécutions diffèrent', () => {
    // Un générateur figé satisferait la forme et donnerait la même clé à
    // toutes les installations du monde.
    expect(engendre('MINIO_ROOT_USER')).not.toBe(engendre('MINIO_ROOT_USER'));
  });
});

describe('🔴 LE SECRET — même confrontation', () => {
  it('⭐ la sortie RÉELLE passe l’expression RÉELLE', () => {
    const forme = formeExigee('FORME_SECRET');
    const secret = engendre('MINIO_ROOT_PASSWORD');
    expect(secret, `le secret engendré ne satisfait pas ${forme}`).toMatch(forme);
    // ⚠ Le secret n'est PAS imprimé en cas d'échec : on dit la forme, jamais
    // la valeur. Ce fichier tourne dans une CI dont les journaux se lisent.
  });

  it('⚠ et il est ALÉATOIRE', () => {
    expect(engendre('MINIO_ROOT_PASSWORD')).not.toBe(engendre('MINIO_ROOT_PASSWORD'));
  });
});

describe('⚠ TÉMOIN D’ABSENCE — l’épreuve sait dire NON', () => {
  it('🔴 les anciennes formes de l’installateur sont REFUSÉES par le validateur', () => {
    // La confusion PLAUSIBLE, et c'est exactement ce qu'install.sh produisait :
    // un secret base64url, et l'identifiant « gafeso ».
    const base64url = execFileSync(
      'bash',
      ['-c', "openssl rand -base64 24 | tr -d '\\n=' | tr '+/' '-_'"],
      { encoding: 'utf-8' },
    ).trim();
    expect(
      base64url,
      'si cette forme PASSAIT, cette épreuve ne mesurerait rien',
    ).not.toMatch(formeExigee('FORME_SECRET'));
    expect('gafeso').not.toMatch(formeExigee('FORME_CLE'));
    // Et les voisines plausibles : bonne longueur, mauvais alphabet ou préfixe.
    expect('GK' + 'Z'.repeat(24)).not.toMatch(formeExigee('FORME_CLE'));
    expect('gk' + '0'.repeat(24)).not.toMatch(formeExigee('FORME_CLE'));
    expect('0'.repeat(63)).not.toMatch(formeExigee('FORME_SECRET'));
  });
});
