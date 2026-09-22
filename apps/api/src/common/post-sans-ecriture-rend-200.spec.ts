/**
 * UNE ROUTE `POST` QUI N'ÉCRIT RIEN NE REND PAS « 201 CREATED ».
 *
 * NestJS rend **201** par défaut sur `@Post`. C'est juste pour une création ;
 * c'est un FAUX pour un aperçu, une prévisualisation, une simulation — une
 * route qui lit et dit ce qui SE PASSERAIT.
 *
 * ⚠ Ce n'est pas une élégance. Un code de réponse est lu par des MACHINES, qui
 * n'ont aucun moyen de recouper l'affirmation avec autre chose. C'est la même
 * famille que le 404 rendu à un moteur d'indexation : un faux qui QUITTE
 * l'application change d'ordre de grandeur, parce qu'il est archivé par des
 * tiers et qu'il survit à ce qui l'a causé.
 *
 * ## La forme : une OBLIGATION, pas un balayage
 *
 * On ne peut pas déduire d'un motif syntaxique qu'une route « n'écrit rien » —
 * l'écriture voyage par un service, par un helper, par une transaction. La
 * liste est donc DÉCLARÉE, et le test vérifie les deux sens : une route
 * déclarée porte bien `@HttpCode(HttpStatus.OK)`, et une déclaration qui ne
 * correspond plus à rien est refusée.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..');

/**
 * Les routes `POST` qui ne produisent AUCUNE écriture.
 *
 * ⚠ Chaque entrée a été mesurée, pas supposée : zéro `create`, `update`,
 * `delete`, `createMany` ou `updateMany` sur le chemin du service.
 */
const SANS_ECRITURE: { fichier: string; route: string; motif: string }[] = [
  {
    fichier: 'accounts/accounts.controller.ts',
    route: "expected-students/import/apercu",
    motif: 'lit le fichier et NOMME les lignes qui partiraient — elle n’écrit rien',
  },
  {
    fichier: 'reminders/reminders.controller.ts',
    route: 'preview',
    motif: 'interprète un gabarit avec des variables d’exemple',
  },
];

/**
 * ⚠ DETTE DÉCLARÉE, DATÉE — 22/09/2026.
 *
 * `POST /offline-licensing/entitlements` n'écrit rien non plus, et rend 201.
 * Elle N'EST PAS corrigée, et le motif n'est pas technique : **l'application
 * mobile l'appelle**, et un client qui teste `statusCode == 201` casserait sur
 * un APK déjà installé, qu'on ne peut pas mettre à jour.
 *
 * ⚠ C'est l'invariant I7 appliqué au CODE DE RÉPONSE plutôt qu'à un champ :
 * une réponse ne retire pas ce qu'un client déployé lit. La corriger demande de
 * vérifier d'abord ce que le mobile en fait — ce qui relève de la session qui
 * tient ce dépôt.
 */
const DETTE_MOBILE = [{ fichier: 'offline-licensing/offline-licensing.controller.ts', route: 'entitlements' }];

/** Les décorateurs qui suivent immédiatement un `@Post('…')`, jusqu'à la méthode. */
function decorateursDe(source: string, route: string): string {
  const i = source.indexOf(`@Post('${route}')`);
  if (i < 0) return '';
  const reste = source.slice(i);
  // La fenêtre s'arrête à la signature de la méthode (une ligne qui n'est ni
  // un décorateur, ni un commentaire, ni vide).
  const lignes = reste.split('\n').slice(1);
  const fenetre: string[] = [];
  for (const l of lignes) {
    const t = l.trim();
    if (t === '' || t.startsWith('@') || t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) {
      fenetre.push(l);
      continue;
    }
    break;
  }
  return fenetre.join('\n');
}

describe("L'instrument : il trouve les décorateurs d'une route", () => {
  it('témoin de PRÉSENCE : il voit une route déclarée', () => {
    const src = readFileSync(join(SRC, SANS_ECRITURE[0].fichier), 'utf8');
    expect(decorateursDe(src, SANS_ECRITURE[0].route)).toContain('@RequiresFunctions');
  });

  it('témoin d’ABSENCE : il ne déborde pas sur la route SUIVANTE', () => {
    // La confusion plausible : une fenêtre trop large attraperait le
    // `@HttpCode` de la route d'à côté, et le garde passerait vert à tort.
    const src = readFileSync(join(SRC, 'reminders/reminders.controller.ts'), 'utf8');
    const fen = decorateursDe(src, 'preview');
    expect(fen).not.toContain("@Post('run')");
  });

  it('témoin d’ABSENCE : une route inexistante ne rend rien', () => {
    const src = readFileSync(join(SRC, 'reminders/reminders.controller.ts'), 'utf8');
    expect(decorateursDe(src, 'route-qui-nexiste-pas')).toBe('');
  });
});

describe("⚠ L'OBLIGATION : POST sans écriture → 200", () => {
  for (const { fichier, route, motif } of SANS_ECRITURE) {
    it(`POST ${route} rend 200 (${motif})`, () => {
      const src = readFileSync(join(SRC, fichier), 'utf8');
      const fen = decorateursDe(src, route);
      expect(fen, `la route POST '${route}' est introuvable dans ${fichier}`).not.toBe('');
      expect(
        fen,
        `POST ${route} n’écrit rien et rendrait « 201 Created ».\n` +
          'Ajoutez `@HttpCode(HttpStatus.OK)` — ou, si la route s’est mise à ' +
          'ÉCRIRE, retirez-la de SANS_ECRITURE en disant ce qu’elle crée.',
      ).toMatch(/@HttpCode\(HttpStatus\.OK\)/);
    });
  }

  it('⚠ la dette mobile est TOUJOURS là — sinon la déclaration est périmée', () => {
    // Une dette qui ne se rappelle pas d'elle-même est un oubli en attente :
    // le jour où quelqu'un corrige cette route, cette ligne devient fausse et
    // ce test le dit.
    for (const { fichier, route } of DETTE_MOBILE) {
      const fen = decorateursDe(readFileSync(join(SRC, fichier), 'utf8'), route);
      expect(
        fen,
        `POST ${route} porte désormais un @HttpCode : la dette est résolue, ` +
          'retirez-la de DETTE_MOBILE.',
      ).not.toMatch(/@HttpCode/);
    }
  });
});
