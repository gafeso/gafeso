import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Le relevé de la notice Gafeso doit rester COMPLET.
 *
 * `docs/p2-releve-notice.md` dit, pour chaque champ, qui le lit. Un relevé
 * incomplet est pire qu'aucun relevé : P3 s'y fiera pour décider ce qu'elle
 * extrait, et un champ absent sera extrait sans que personne sache qui le lit.
 *
 * ⚠ Ce test franchit la frontière code / documentation, délibérément. Le
 * couplage existe dans les faits : le jour où une colonne est ajoutée à
 * `BiblioRecord`, elle part vers tous les clients (voir §1 du relevé). Autant
 * que ce couplage soit vérifié plutôt que supposé.
 *
 * Même parti pris que `apps/web/tests/fonctions-connues-de-l-api.spec.ts`, qui
 * lit le catalogue de fonctions d'apps/api en lecture seule.
 */
const RACINE = join(__dirname, '..', '..', '..', '..');
const SCHEMA = readFileSync(join(RACINE, 'apps/api/prisma/schema.prisma'), 'utf-8');
const RELEVE = readFileSync(join(RACINE, 'docs/p2-releve-notice.md'), 'utf-8');

/** Champs déclarés par le modèle BiblioRecord, lus dans le schéma lui-même. */
/**
 * ⚠ Cette fonction LÈVE si le modèle est introuvable, et c'est voulu. Elle est
 * appelée à la collecte : un modèle renommé fait donc échouer le FICHIER, que
 * vitest annonce « no tests » — message pauvre, mais code de sortie 1 (vérifié).
 * Ne pas la rendre tolérante : rendre `[]` ferait passer au vert tous les tests
 * ci-dessous en ne vérifiant plus rien.
 */
function champsDuModele(nom: string): string[] {
  const bloc = SCHEMA.split(`model ${nom} {`)[1]?.split('\n}')[0];
  if (!bloc) throw new Error(`modèle ${nom} introuvable dans le schéma`);
  return bloc
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('//') && !l.startsWith('@@'))
    .map((l) => l.split(/\s+/)[0])
    .filter((n) => /^[a-z][A-Za-z0-9]*$/.test(n));
}

describe('relevé de la notice — il reste complet', () => {
  const champs = champsDuModele('BiblioRecord');

  it('le schéma est bien lu (témoin positif)', () => {
    // Sans ce témoin, un modèle renommé rendrait une liste vide, et TOUS les
    // tests ci-dessous passeraient au vert en ne vérifiant rien.
    expect(champs.length).toBeGreaterThan(15);
    expect(champs).toContain('title');
    expect(champs).toContain('marcData');
  });

  it('⚠ CHAQUE champ de BiblioRecord figure au relevé', () => {
    const absents = champs.filter((c) => !RELEVE.includes(`\`${c}\``));
    expect(absents, 'champs du schéma absents du relevé').toEqual([]);
  });

  it('le relevé nomme son angle mort, et la surface qu’il ne compare pas', () => {
    // Une borne qui n'est pas écrite est une couverture illusoire.
    expect(RELEVE).toMatch(/angle mort/i);
    expect(RELEVE).toMatch(/I7/);
    expect(RELEVE).toMatch(/member = true/);
  });

  it('le relevé porte ses témoins positifs ET son contre-témoin', () => {
    expect(RELEVE).toMatch(/témoin positif|Témoins positifs/i);
    expect(RELEVE).toMatch(/contre-témoin/i);
  });

  it('le relevé dit que la réponse est couplée au schéma, avec le compte des clés', () => {
    // C'est la trouvaille qui domine le relevé : 26 clés servies, 9 utilisées.
    expect(RELEVE).toMatch(/26 clés/);
    expect(RELEVE).toMatch(/9 utilisées|9 champs/);
  });
});

describe('relevé de la notice — les tables liées y sont aussi', () => {
  for (const modele of ['RecordContributor', 'Item', 'DigitalCopy']) {
    it(`${modele} est mentionné`, () => {
      expect(champsDuModele(modele).length).toBeGreaterThan(2);
      const attendu = { RecordContributor: 'contributors', Item: 'items', DigitalCopy: 'digitalCopy' }[
        modele
      ] as string;
      expect(RELEVE).toContain(`\`${attendu}\``);
    });
  }
});
