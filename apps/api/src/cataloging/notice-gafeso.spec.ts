import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CLASSEMENT_NOTICE, CHAMPS_NOYAU } from './notice-gafeso';

/**
 * La déclaration de la notice Gafeso doit rester COLLÉE au schéma.
 *
 * Sans ce test, la déclaration serait un commentaire de plus : vraie le jour
 * où elle est écrite, fausse au premier ajout de colonne. Une règle énoncée se
 * contourne, une règle testée se défend.
 */
const RACINE = join(__dirname, '..', '..', '..', '..');
const SCHEMA = readFileSync(join(RACINE, 'apps/api/prisma/schema.prisma'), 'utf-8');

function champsDuModele(nom: string): string[] {
  const bloc = SCHEMA.split(`model ${nom} {`)[1]?.split('\n}')[0];
  if (!bloc) throw new Error(`modèle ${nom} introuvable`);
  return bloc
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('//') && !l.startsWith('@@'))
    .map((l) => l.split(/\s+/)[0])
    .filter((n) => /^[a-z][A-Za-z0-9]*$/.test(n));
}

const duSchema = champsDuModele('BiblioRecord');
const classes = Object.values(CLASSEMENT_NOTICE).flat();

describe('notice Gafeso — la déclaration colle au schéma', () => {
  it('le schéma est bien lu (témoin positif)', () => {
    expect(duSchema.length).toBeGreaterThan(15);
    expect(duSchema).toContain('marcData');
  });

  it('⚠ AUCUN champ du modèle n’est laissé sans couche', () => {
    // Le garde-fou du défaut de tête : une colonne ajoutée part automatiquement
    // vers tous les clients. Elle ne peut plus l'être sans être classée ici.
    const orphelins = duSchema.filter((c) => !classes.includes(c));
    expect(orphelins, 'champs du schéma non classés').toEqual([]);
  });

  it('la déclaration n’invente aucun champ', () => {
    const inventes = classes.filter((c) => !duSchema.includes(c));
    expect(inventes, 'champs déclarés qui n’existent pas au schéma').toEqual([]);
  });

  it('chaque champ n’appartient qu’à UNE couche', () => {
    const vus = new Map<string, number>();
    for (const c of classes) vus.set(c, (vus.get(c) ?? 0) + 1);
    expect([...vus.entries()].filter(([, n]) => n > 1)).toEqual([]);
  });

  it('⚠ l’identifiant est dans le noyau et il y reste (I1)', () => {
    expect(CHAMPS_NOYAU).toContain('id');
  });

  it('le noyau ne contient AUCUN champ de profil (I2)', () => {
    // Le noyau porte aujourd'hui des champs qui n'y appartiennent pas —
    // publicationCity, defenseUniversity, defensePlace. Ils sont classés en
    // profil ICI, alors qu'ils sont encore des colonnes du modèle : c'est
    // exactement ce que P3 aura à extraire. Ce test verrouille le classement,
    // pas le schéma.
    for (const champ of ['isbn', 'publisher', 'publicationCity', 'defenseUniversity', 'defensePlace']) {
      expect(CHAMPS_NOYAU as readonly string[]).not.toContain(champ);
    }
  });
});
