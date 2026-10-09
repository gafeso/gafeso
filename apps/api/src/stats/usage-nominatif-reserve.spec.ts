/**
 * 🔴 UN BIBLIOTHÉCAIRE NE PEUT PAS OBTENIR L'HISTORIQUE D'UN LECTEUR NOMMÉ.
 *
 * *Consigne de Jean, 6 octobre 2026 : « Statistiques AGRÉGÉES seulement pour le
 * personnel. Aucune route d'administration ne restitue l'historique d'un lecteur
 * nommé. »*
 *
 * ⚠ CE GARDE PORTE SUR LA POPULATION DES APPELANTS, PAS SUR UNE PERMISSION.
 * Une permission se change : il suffit d'ajouter `lecteurs.voir` à un rôle pour
 * ouvrir une porte que personne n'avait vue. La propriété tient ici parce que la
 * SEULE méthode qui lit du nominatif — `UsageService.miennes` — n'est appelée
 * que depuis l'espace lecteur, où l'identité vient du JETON et jamais d'un
 * paramètre.
 *
 * ⭐ C'est « une propriété de sécurité se prouve par ce qu'un attaquant ne peut
 * pas faire » : on se met à la place du bibliothécaire et on cherche le chemin.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');

function tousLesFichiers(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) tousLesFichiers(p, acc);
    else if (p.endsWith('.ts')) acc.push(p);
  }
  return acc;
}

const FICHIERS = tousLesFichiers(SRC).filter((f) => !f.endsWith('.spec.ts'));

describe('l’instrument, avant ce qu’il mesure', () => {
  it('il lit bien les sources de l’API — sinon tout ce qui suit est vrai sur rien', () => {
    expect(FICHIERS.length).toBeGreaterThan(150);
    expect(FICHIERS.some((f) => f.endsWith('usage.service.ts'))).toBe(true);
  });
});

describe('🔴 le nominatif ne sort QUE vers son propriétaire', () => {
  it('⭐ `miennes` n’est appelée que depuis l’ESPACE LECTEUR', () => {
    const appelants = FICHIERS.filter(
      (f) => !f.endsWith('usage.service.ts') && /\busage\.miennes\(|\.miennes\(/.test(readFileSync(f, 'utf-8')),
    ).map((f) => f.slice(SRC.length + 1));

    // ⚠ On compare les ÉLÉMENTS, pas le compte : une erreur symétrique — un
    // appelant ajouté côté admin, un autre retiré — laisserait un compte juste.
    expect(appelants.sort()).toEqual(['reader/reader.controller.ts']);
  });

  it('⚠ et cet appelant prend l’identité du JETON, jamais d’un paramètre', () => {
    const src = readFileSync(join(SRC, 'reader', 'reader.controller.ts'), 'utf-8');
    const i = src.indexOf('.miennes(');
    expect(i, '`miennes` doit être appelée dans l’espace lecteur').toBeGreaterThan(-1);
    const appel = src.slice(i, i + 160);
    expect(appel, 'l’identité vient de `user.sub`').toContain('user.sub');
    // ⚠ Témoin d'ABSENCE sur la confusion PLAUSIBLE : un `@Param('userId')` ou
    // un `@Query('userId')` ferait de cette route un lecteur d'historique
    // d'autrui — et c'est exactement le geste qu'un écran d'administration
    // appellerait de bonne foi.
    expect(appel).not.toMatch(/Param|Query|dto\.|body\./);
  });

  it('🔴 AUCUN contrôleur du personnel ne lit `usageEvent` avec un `userId`', () => {
    const fautifs: string[] = [];
    const examines: string[] = [];
    for (const f of FICHIERS.filter((x) => x.endsWith('.controller.ts'))) {
      const rel = f.slice(SRC.length + 1);
      examines.push(rel);
      if (rel === 'reader/reader.controller.ts') continue; // l'espace du lecteur
      const src = readFileSync(f, 'utf-8');
      if (/usageEvent/.test(src)) fautifs.push(`${rel} (accès direct à usageEvent)`);
    }
    expect(examines.length, 'des contrôleurs ont bien été lus').toBeGreaterThan(15);
    expect(
      fautifs,
      'un contrôleur hors espace lecteur touche la table d’usage : le nominatif ' +
        'doit passer par UsageService, dont les agrégats ne rendent aucun nom',
    ).toEqual([]);
  });

  it('⚠ les agrégats du service ne SÉLECTIONNENT jamais `user_id`', () => {
    const src = readFileSync(join(SRC, 'stats', 'usage.service.ts'), 'utf-8');
    for (const methode of ['parDocument', 'parJour', 'parFiliere']) {
      const i = src.indexOf(`async ${methode}(`);
      expect(i, `${methode} doit exister`).toBeGreaterThan(-1);
      const fin = src.indexOf('\n  }', i);
      const corps = src.slice(i, fin);
      // `count(DISTINCT user_id)` est un COMPTE, pas une restitution : il rend un
      // nombre et ne peut nommer personne. Tout autre usage de la colonne en
      // sortie serait une fuite.
      const sorties = [...corps.matchAll(/user_id/g)].length;
      const comptes = [...corps.matchAll(/count\(DISTINCT user_id\)/g)].length;
      expect(
        sorties,
        `${methode} : user_id n’apparaît que dans un count(DISTINCT), jamais en colonne rendue`,
      ).toBe(comptes);
    }
  });
});
