/**
 * ⭐ AUCUN JETON FABRIQUÉ NE QUITTE SON PROCESSUS — et un seul fichier en signe.
 *
 * *Posé le 9 octobre 2026, le jour où le dernier jeton imprimé a disparu.*
 *
 * ## Ce que ce garde existe pour empêcher, et ce que ça a coûté
 *
 * `apps/api/scripts/mobile-e2e-fixture.ts` signait un jeton depuis
 * `process.env.JWT_SECRET` et l'IMPRIMAIT sur la sortie standard, deux fois.
 * L'exception nommée de `CLAUDE.md` — `offline-licensing.e2e.spec.ts` — pose
 * trois conditions CUMULATIVES, dont la première : **le jeton ne quitte JAMAIS
 * le processus du test.** Celui-là le quittait par construction : c'est la
 * session mobile qui le lisait.
 *
 * ⚠ Il a vécu du 29 juillet au 9 octobre. Trouvé le 13 septembre par un
 * balayage, puis LAISSÉ — à juste titre : le retirer cassait un e2e qu'une autre
 * session possédait. Il est parti le jour où elle a basculé sur
 * `POST /auth/login` avec les comptes de recette.
 *
 * > ⭐ **L'exception nommée disait elle-même sa date de péremption** : « le jour
 * > où un chemin d'obtention programmatique existera, l'exception tombe ». Ce
 * > chemin est `scripts/dev/comptes-de-recette.mjs`. Une exception qui porte sa
 * > condition de levée se lève ; celle qui ne la porte pas devient un droit
 * > acquis.
 *
 * ## ⚠ POURQUOI UNE OBLIGATION, ET NON UN BALAYAGE
 *
 * Chercher `jwt.sign` rend cinq fichiers, dont trois où c'est l'OFFICE du
 * produit — il émet des jetons, c'est son métier. Un balayage qui les signale
 * se fait désactiver ; un balayage qui les exclut par une liste d'exceptions
 * devient l'endroit où l'on enterre la prochaine trouvaille.
 *
 * Chaque fichier est donc CLASSÉ, avec son motif. Un fichier neuf n'est dans
 * aucune des trois listes, et le test échoue en disant les trois issues.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/** La racine d'`apps/api` : `src/auth` → deux crans. */
const RACINE = join(__dirname, '..', '..');

/**
 * ① LE PRODUIT ÉMET DES JETONS — c'est son office, pas une dérogation.
 *
 * ⚠ Ces trois-là signent avec le secret de l'application pour servir une
 * SESSION à quelqu'un qui s'est authentifié. Le jeton part alors dans un
 * cookie `httpOnly`, ce qui est exactement le contraire d'une impression.
 */
const PRODUIT: Record<string, string> = {
  'src/auth/auth.service.ts': 'émission de la session après authentification',
  'src/auth/auth.controller.ts': 'pose le cookie de session (httpOnly)',
  'src/admin/admin.service.ts': 'session de super-admin de plateforme',
};

/**
 * ② L'EXCEPTION NOMMÉE, et elle est UNE.
 *
 * ⚠ Ses trois conditions sont dans `CLAUDE.md`, et la première est celle que ce
 * garde mesure : le jeton ne quitte pas le processus. Les deux autres — une
 * expiration en MINUTES, et un motif écrit dans le fichier — sont vérifiées
 * plus bas.
 */
const EXCEPTION = 'src/offline-licensing/offline-licensing.e2e.spec.ts';

/**
 * ③ LES GARDES QUI NOMMENT LE MOTIF POUR L'INTERDIRE.
 *
 * ⚠ Un détecteur doit pouvoir écrire la forme qu'il traque, sinon il ne peut
 * pas expliquer son refus. Ce fichier-ci en est un exemplaire.
 */
const GARDES: Record<string, string> = {
  'src/auth/jeton-jamais-imprime.spec.ts': 'ce fichier : il nomme ce qu’il refuse',
};

// ⚠ `comptes-de-recette.spec.ts` N'EST PAS DANS LA POPULATION, et je l'y avais
// mis par supposition. Mesuré : il ne porte `jwt.sign` que dans une EXPRESSION
// RÉGULIÈRE (`/jwt\.sign/`), sans parenthèse d'appel — il n'en signe aucun. Le
// relevé a tranché, pas ma lecture.

/** Tous les fichiers TypeScript du périmètre, hors artefacts de construction. */
function fichiers(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (['node_modules', 'dist', '.next'].includes(e.name)) continue;
      fichiers(p, acc);
    } else if (e.name.endsWith('.ts')) {
      acc.push(p);
    }
  }
  return acc;
}

/** Les fichiers qui SIGNENT un jeton — relatifs à `apps/api`. */
const SIGNATAIRES = [...fichiers(join(RACINE, 'src')), ...fichiers(join(RACINE, 'scripts'))]
  // ⚠ TROIS FORMES, ET LA MESURE A DÛ LES DONNER.
  //
  // Mon premier motif était `jwt\.sign\(|from 'jsonwebtoken'` : il trouvait
  // 2 fichiers sur 5. Les trois du produit signent par le `JwtService` de
  // NestJS — `jwt.signAsync(...)` —, une forme que je n'avais pas imaginée.
  // « Un motif syntaxique ne voit que la forme qu'on a imaginée », et c'est la
  // raison pour laquelle le témoin de compte est juste au-dessus.
  .filter((p) =>
    /jwt\.sign\s*\(|signAsync\s*\(|from 'jsonwebtoken'/.test(readFileSync(p, 'utf-8')),
  )
  .map((p) => relative(RACINE, p))
  .sort();

describe('aucun jeton fabriqué ne quitte son processus', () => {
  it('⚠ TÉMOIN : le relevé a bien LU quelque chose', () => {
    // Un relevé vide rendrait toutes les assertions ci-dessous VRAIES, sur une
    // population nulle. C'est le témoin de compte, et il est indispensable ici :
    // le résultat attendu de ce garde est « rien à signaler ».
    expect(
      SIGNATAIRES.length,
      'aucun fichier signataire trouvé : c’est l’INSTRUMENT qu’il faut regarder',
    ).toBeGreaterThan(2);
  });

  it('⭐ CHAQUE signataire est classé — un fichier neuf fait tomber ce test', () => {
    expect(
      SIGNATAIRES,
      'Un fichier signe un jeton et n’est dans aucune des trois listes. Trois ' +
        'issues, et il faut choisir :\n' +
        '  (a) c’est le PRODUIT qui émet une session après authentification → ' +
        'PRODUIT, avec son motif ;\n' +
        '  (b) c’est un GARDE qui nomme le motif pour l’interdire → GARDES ;\n' +
        '  (c) c’est un test qui fabrique une session faute de chemin normal → ' +
        '🔴 NE L’AJOUTEZ PAS. `CLAUDE.md` n’admet QU’UNE exception, et elle est ' +
        'nommée. Le chemin normal EXISTE désormais : ' +
        '`npm run comptes:recette` pose des comptes à mot de passe fixe, et ' +
        '`POST /auth/login` donne une session. Une seconde exception ne se ' +
        'copie pas : elle se discute.',
    ).toEqual([...Object.keys(PRODUIT), EXCEPTION, ...Object.keys(GARDES)].sort());
  });

  it('🔴 AUCUN signataire n’IMPRIME ni n’ÉCRIT quoi que ce soit', () => {
    // ⚠ LA PROPRIÉTÉ EST « NE QUITTE PAS LE PROCESSUS », pas « n'imprime pas le
    // jeton ». On ne cherche donc pas la variable : un `console.log(JSON...)`
    // qui emporte un objet contenant le jeton ne nomme nulle part `token`.
    // C'est la faute exacte qu'avait `mobile-e2e-fixture.ts` : il imprimait un
    // JSON dont une clé portait le jeton.
    const fautifs: string[] = [];
    let examines = 0;
    for (const rel of SIGNATAIRES) {
      examines += 1;
      const code = readFileSync(join(RACINE, rel), 'utf-8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/^\s*\/\/.*$/gm, ' ');
      const sorties = [
        ...(code.match(/console\.(log|info|warn|error)\s*\(/g) ?? []),
        ...(code.match(/(append|write)FileSync?\s*\(/g) ?? []),
      ];
      // ⚠ Le PRODUIT a le droit de journaliser — un logger NestJS n'est pas une
      // impression de jeton, et `this.logger.warn('session ouverte')` est
      // exactement ce qu'on veut. On ne regarde donc que `console.*` et les
      // écritures de fichier, qui sont les deux façons dont un secret sort
      // d'un script.
      if (sorties.length > 0) {
        fautifs.push(`${rel} → ${sorties.join(', ')}`);
      }
    }
    expect(examines, 'chaque signataire doit avoir été LU').toBe(SIGNATAIRES.length);
    expect(
      fautifs,
      'Un fichier qui SIGNE un jeton ne doit ni l’imprimer ni l’écrire. Un ' +
        'jeton sorti du processus survit à la session qui l’a créé — dans une ' +
        'sortie de CI que personne ne relit, dans un profil de navigateur que ' +
        'personne ne nettoie, dans un fichier qu’un collègue ouvrira.\n' +
        `Trouvé : ${fautifs.join(' | ')}`,
    ).toEqual([]);
  });

  it('⚠ et l’exception nommée tient ses DEUX autres conditions', () => {
    const src = readFileSync(join(RACINE, EXCEPTION), 'utf-8');
    // Condition ② : il expire en MINUTES, pas en heures.
    const duree = /expiresIn:\s*'(\d+)([ms])'/.exec(src);
    expect(duree, 'l’expiration du jeton doit être déclarée et lisible').toBeTruthy();
    expect(duree![2], 'en MINUTES, pas en heures : « 5m », jamais « 1h »').toBe('m');
    expect(Number(duree![1]), 'quelques minutes pour une suite de trois secondes').toBeLessThanOrEqual(
      15,
    );
    // Condition ③ : le fichier DIT pourquoi il ne peut pas faire autrement.
    expect(src, 'le fichier doit écrire son motif').toMatch(/exception/i);
    expect(
      src,
      'et à quelle condition l’exception TOMBE — sans ça, c’est un droit acquis',
    ).toMatch(/chemin.{0,40}(normal|obtention)|tombe/i);
  });
});
