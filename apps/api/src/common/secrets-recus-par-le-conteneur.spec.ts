/**
 * 🔴 CHAQUE SECRET CONTRÔLÉ AU DÉMARRAGE DOIT ÊTRE ATTEIGNABLE PAR LE CONTENEUR
 * QUE LE COMPOSE DE PRODUCTION DÉMARRE.
 *
 * ## Ce qu'il a coûté — un démarrage de PRODUCTION, le 6 octobre 2026
 *
 * Mesuré par Jean sur la démonstration, en déployant rc4 :
 *
 *     REFUS DE DÉMARRER — POSTGRES_PASSWORD est VIDE.
 *
 * Or `.env.prod` la portait, 43 caractères. **Le conteneur `api` ne reçoit pas
 * cette variable** : `docker-compose.prod.yml` ne lui passe que `DATABASE_URL`,
 * composée depuis `${POSTGRES_PASSWORD}`. Le contrôle vérifiait donc une
 * variable ABSENTE DU CONTENEUR QU'IL PROTÈGE, et refusait de démarrer sur une
 * configuration parfaitement valide.
 *
 * ## ⚠ POURQUOI AUCUN TEST NE L'A VU, et c'est la leçon
 *
 * Ma recette fournissait l'environnement ELLE-MÊME (`env -i JWT_SECRET=… \
 * POSTGRES_PASSWORD=… node dist/main.js`). Elle mesurait donc **son propre
 * environnement**, jamais celui que le compose construit.
 *
 * > ⭐ Une recette qui FOURNIT l'environnement qu'elle éprouve ne mesure que
 * > sa propre fixture. Pour juger ce qu'un conteneur REÇOIT, il faut le
 * > démarrer par le chemin qui le démarrera en production.
 *
 * ## Ce que ce garde fait, et ce qu'il ne fait pas
 *
 * Il lit le compose de PRODUCTION et vérifie que chaque secret déclaré est
 * atteignable — sous son propre nom, ou par la variable que `portePar` désigne.
 * Il est déterministe et tourne dans `npm test`, sans docker.
 *
 * ⚠ **Sa borne, écrite** : il lit le compose, il ne démarre rien. Un conteneur
 * peut recevoir une variable et l'API la lire sous un autre nom. C'est
 * `scripts/recette-secrets-dans-le-conteneur.sh` qui mesure l'EFFET, en
 * démarrant réellement l'api par ce compose — « quand la forme ne se laisse pas
 * énumérer, mesurer l'effet est la sortie », et ici les deux sont possibles.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SECRETS_DE_PRODUCTION } from './secrets-de-production';

const RACINE = join(__dirname, '..', '..', '..', '..');
const COMPOSE = readFileSync(join(RACINE, 'docker', 'docker-compose.prod.yml'), 'utf-8');

/**
 * Le bloc `environment:` du service `api`, et lui seul.
 *
 * ⚠ On ne cherche PAS la variable dans tout le fichier : `POSTGRES_PASSWORD`
 * y figure bien — dans le service `db`, et dans l'URL de `api`. Chercher large
 * aurait déclaré le secret « atteignable » et laissé passer le défaut exact
 * qu'on corrige. C'est « un grep sur un nom ne prouve pas qu'on lit la chose
 * qui le porte », appliqué à un service.
 */
function environnementDeLApi(): string {
  const lignes = COMPOSE.split('\n');
  const debutService = lignes.findIndex((l) => l === '  api:');
  expect(debutService, 'service `api` introuvable dans le compose de production')
    .toBeGreaterThan(-1);
  const apresService = lignes.slice(debutService + 1);
  const finService = apresService.findIndex((l) => /^  [a-z]/.test(l));
  const service = (finService === -1 ? apresService : apresService.slice(0, finService)).join('\n');

  const debutEnv = service.split('\n').findIndex((l) => l.trim() === 'environment:');
  expect(debutEnv, 'bloc `environment:` introuvable dans le service api').toBeGreaterThan(-1);
  const apresEnv = service.split('\n').slice(debutEnv + 1);
  const finEnv = apresEnv.findIndex((l) => /^    [a-z]/.test(l));
  return (finEnv === -1 ? apresEnv : apresEnv.slice(0, finEnv)).join('\n');
}

describe('les secrets contrôlés au démarrage', () => {
  const env = environnementDeLApi();

  it('le relevé a bien isolé le bloc du service api — sinon tout ce qui suit est vrai sur rien', () => {
    // Témoin de PRÉSENCE sur un cas connu.
    expect(env).toMatch(/^\s+JWT_SECRET:/m);
    // ⚠ Témoin d'ABSENCE sur la confusion PLAUSIBLE : une clé du service `db`
    // ne doit pas entrer dans ce bloc. `POSTGRES_PASSWORD:` y est déclarée.
    expect(env, 'le bloc est trop large : il a attrapé le service db')
      .not.toMatch(/^\s+POSTGRES_PASSWORD:/m);
    expect(env.split('\n').length).toBeGreaterThan(15);
  });

  it('🔴 chaque secret déclaré est ATTEIGNABLE par le conteneur api', () => {
    const inatteignables: string[] = [];
    const examines: string[] = [];
    for (const s of SECRETS_DE_PRODUCTION) {
      const nomLu = s.portePar?.variable ?? s.variable;
      // La variable doit être une CLÉ du bloc environment de l'api : c'est ce
      // que le conteneur recevra. Qu'elle apparaisse dans une VALEUR ne suffit
      // pas — c'était tout le défaut.
      const cle = new RegExp(`^\\s+${nomLu}:`, 'm');
      if (!cle.test(env)) inatteignables.push(`${s.variable} (lu dans ${nomLu})`);
      examines.push(s.variable);
    }
    // ⚠ Le témoin ÉNUMÈRE : un compte global prouve que l'instrument tourne,
    // jamais qu'il tourne sur chaque élément.
    expect(examines).toEqual(SECRETS_DE_PRODUCTION.map((s) => s.variable));
    expect(
      inatteignables,
      'secrets contrôlés au démarrage que le conteneur api ne REÇOIT PAS — ' +
        'soit le compose doit les lui passer, soit la déclaration doit porter ' +
        '`portePar` vers la variable qui les transporte',
    ).toEqual([]);
  });

  it('⚠ et `POSTGRES_PASSWORD` est bien le cas PORTÉ — le garde doit le savoir', () => {
    const db = SECRETS_DE_PRODUCTION.find((s) => s.variable === 'POSTGRES_PASSWORD');
    expect(db, 'le mot de passe de la base doit rester contrôlé').toBeTruthy();
    expect(db!.portePar?.variable).toBe('DATABASE_URL');
    // et l'URL du compose porte bien la variable de l'opérateur
    // ⚠ Le nom d'utilisateur porte lui-même un `:` (`${POSTGRES_USER:-…}`) :
    // un motif `[^:]+` y échouait. On affirme ce qui compte — l'URL transporte
    // la variable de l'opérateur, juste avant l'hôte.
    expect(env).toMatch(/DATABASE_URL: postgresql:\/\/.*\$\{POSTGRES_PASSWORD\}@db:/);
  });
});
