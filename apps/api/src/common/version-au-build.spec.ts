/**
 * ⭐ LA CONSTRUCTION DE PRODUCTION REFUSE SANS VERSION — et rien ne la substitue.
 *
 * *Posé le 9 octobre 2026, après le déploiement de rc7 sur la démonstration.*
 *
 * ## Ce qui s'est passé, et pourquoi un garde ne suffisait pas avant
 *
 * `up -d --build` lancé sans `eval "$(scripts/version-du-depot.sh --exporter)"`
 * a produit une image qui répond « non étiquetée / commit inconnu » sur
 * `/health`, **sans aucun avertissement**. La cause n'était pas un oubli de
 * documentation : le compose substituait `${GAFESO_VERSION:-non étiquetée}`.
 *
 * > ⭐ **Ce défaut était défendable EN SOI — « dire la vérité plutôt qu'un
 * > numéro plausible » — et faux à CET ENDROIT : il rendait l'OUBLI
 * > indiscernable du CHOIX.** Les deux produisaient la même image, et seul
 * > l'opérateur savait laquelle il avait voulue. Il ne le savait pas non plus.
 *
 * ## Les deux moitiés, et il faut les DEUX
 *
 * | Où | Ce qui tient la propriété |
 * |---|---|
 * | `docker-compose.prod.yml` | `${GAFESO_VERSION}` SANS défaut — sinon la variable n'arrive jamais vide |
 * | `apps/api/Dockerfile` | un `RUN` qui REFUSE quand elle est vide, et dit la commande |
 *
 * Retirer l'une rend l'autre inopérante : sans le refus, le vide passe ; sans
 * le retrait du défaut, le refus ne se déclenche jamais. C'est « deux sources
 * qui s'accordent par coïncidence » retourné — ici il faut qu'elles s'accordent,
 * et ce test est ce qui les tient ensemble.
 *
 * ⚠ **Et la tolérance du PRODUIT reste**, délibérément : `version.ts` rend
 * « non étiquetée » sur une valeur vide. Un conteneur lancé à la main doit DIRE
 * qu'il ne sait pas. On refuse de FABRIQUER une image sans version ; on
 * n'interdit pas d'en EXÉCUTER une. Les deux ne se contredisent pas, et un test
 * ci-dessous l'affirme — sans lui, quelqu'un « harmoniserait » les deux.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const RACINE = join(__dirname, '..', '..', '..', '..');
const COMPOSE = readFileSync(join(RACINE, 'docker', 'docker-compose.prod.yml'), 'utf-8');

/**
 * Le compose SANS ses commentaires — ce qu'il FAIT, pas ce qu'il dit.
 *
 * ⚠ Indispensable, et trouvé par l'échec : le compose NOMME la forme interdite
 * (`${GAFESO_VERSION:-non étiquetée}`) pour expliquer pourquoi elle est partie.
 * Mon premier motif la trouvait là et refusait le fichier qui l'explique —
 * cinquième fois de la journée qu'un garde lit l'intérieur d'un commentaire.
 */
const COMPOSE_CODE = COMPOSE.replace(/^\s*#.*$/gm, ' ');
const DOCKERFILE = readFileSync(join(RACINE, 'apps', 'api', 'Dockerfile'), 'utf-8');

describe('la version se pose au BUILD, ou la construction refuse', () => {
  it('⚠ TÉMOIN : les deux fichiers ont été LUS', () => {
    expect(COMPOSE.length, 'compose introuvable ou vide').toBeGreaterThan(2000);
    expect(DOCKERFILE.length, 'Dockerfile introuvable ou vide').toBeGreaterThan(2000);
  });

  it('🔴 le compose ne SUBSTITUE aucun défaut à la version', () => {
    for (const v of ['GAFESO_VERSION', 'GAFESO_COMMIT']) {
      // ⚠ On cherche la forme `${VAR:-...}` ou `${VAR:...}` — toute
      // substitution par défaut, quelle qu'en soit la valeur. « non étiquetée »
      // n'était pas le problème : c'était le FAIT de substituer.
      const defaut = new RegExp(`\\$\\{${v}\\s*:`);
      expect(
        COMPOSE_CODE,
        `Le compose substitue un défaut à ${v}. Alors la variable n'arrive ` +
          'JAMAIS vide au build, et le refus du Dockerfile ne se déclenche ' +
          'jamais.\n' +
          '⚠ Un défaut ici rend l’OUBLI indiscernable du CHOIX — c’est le ' +
          'défaut exact qui a produit l’image muette de rc7, et il était ' +
          'défendable en soi.',
      ).not.toMatch(defaut);
      // Et elle doit bien être PASSÉE au build : sans ça, le refus tirerait
      // toujours, ce qui est l'autre façon de tout casser.
      expect(COMPOSE_CODE, `${v} doit être passée en argument de build`).toContain(
        `\${${v}}`,
      );
    }
  });

  it('⚠ TÉMOIN D’ABSENCE : le retrait des commentaires DISCRIMINE', () => {
    // Le compose DOIT continuer d'expliquer la forme retirée — c'est la seule
    // trace du motif —, et le code ne doit pas la porter. Sans ce témoin, un
    // retrait trop large rendrait les assertions ci-dessus vraies sur du vide.
    expect(COMPOSE, 'le motif doit rester écrit dans le compose').toMatch(
      /GAFESO_VERSION:-/,
    );
    expect(COMPOSE_CODE, 'et le CODE ne doit pas la porter').not.toMatch(/GAFESO_VERSION:-/);
    expect(COMPOSE_CODE.length, 'le retrait a tout emporté : instrument faux').toBeGreaterThan(
      1200,
    );
  });

  it('🔴 le Dockerfile REFUSE quand la version est vide, et DIT quoi lancer', () => {
    // La forme, et elle importe : un `RUN` qui sort en 1. Un `echo` seul serait
    // « un garde qui DÉTECTE et laisse passer ».
    expect(DOCKERFILE, 'le refus doit exister').toMatch(/REFUS DE CONSTRUIRE/);
    expect(DOCKERFILE, 'il doit tester le VIDE, pas la présence').toMatch(
      /-z "\$GAFESO_VERSION"/,
    );
    expect(DOCKERFILE, 'et le commit aussi').toMatch(/-z "\$GAFESO_COMMIT"/);
    expect(DOCKERFILE, 'il doit SORTIR en échec, pas seulement afficher').toMatch(
      /exit 1;\s*\\?\s*\n?\s*fi/,
    );
    // ⚠ LE MESSAGE DIT QUOI FAIRE — pas ce qui ne va pas. C'est la propriété
    // qui distingue un garde qu'on suit d'un garde qu'on contourne.
    expect(DOCKERFILE, 'le message doit nommer le script').toMatch(/version-du-depot\.sh/);
    expect(DOCKERFILE, 'et renvoyer à la séquence complète').toMatch(/DEPLOY\.md/);
  });

  it('⚠ et les ARG n’ont PAS de défaut — sinon le vide n’arrive jamais', () => {
    // Un `ARG GAFESO_VERSION="non étiquetée"` reprendrait silencieusement la
    // main quand le build-arg est absent, et le refus ne tirerait pas.
    expect(
      DOCKERFILE,
      'les ARG de version doivent être déclarés VIDES : un défaut au niveau du ' +
        'Dockerfile rétablirait exactement le silence qu’on vient de retirer.',
    ).toMatch(/ARG GAFESO_VERSION=""/);
    expect(DOCKERFILE).toMatch(/ARG GAFESO_COMMIT=""/);
  });

  it('⭐ et le PRODUIT, lui, garde sa tolérance à l’EXÉCUTION', () => {
    // ⚠ CE TEST EXISTE POUR EMPÊCHER UNE « HARMONISATION ».
    //
    // Quelqu'un verra le refus au build et voudra le même au démarrage. Ce
    // serait faux : un conteneur lancé à la main, un développement, une recette
    // sur cluster jetable — tous doivent pouvoir TOURNER en disant « je ne sais
    // pas ». La différence n'est pas une inconséquence : construire est un
    // geste délibéré avec une commande à lancer, exécuter ne l'est pas.
    const version = readFileSync(
      join(RACINE, 'apps', 'api', 'src', 'health', 'version.ts'),
      'utf-8',
    );
    expect(version, 'le repli honnête doit rester').toMatch(/SANS_ETIQUETTE/);
    expect(
      version,
      'et `version.ts` ne doit PAS lever : un conteneur sans version doit ' +
        'démarrer et le DIRE.',
    ).not.toMatch(/throw new Error/);
  });
});
