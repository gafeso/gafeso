/**
 * LES TOURS DE BCRYPT SONT LES MÊMES PARTOUT.
 *
 * Trois services hachent des mots de passe — `AuthService`, `AccountsService`,
 * `AdminService` — et chacun porte SA constante, faute de module commun. L'un
 * des commentaires le dit déjà : « aligné sur AccountsService ».
 *
 * ⚠ C'est une chaîne recopiée trois fois, et son mode de panne est silencieux :
 * le jour où l'on durcit la politique, deux services la durciraient et le
 * troisième continuerait de hacher plus faible. Rien ne casserait — les hachés
 * restent valides quel que soit le coût inscrit dedans — et personne ne
 * saurait que les comptes de plateforme sont moins protégés que les autres.
 *
 * On ne peut pas supprimer la copie sans un module partagé ; on peut la faire
 * ÉCHOUER quand elle divergera.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..');

/** Tous les fichiers de service qui déclarent un nombre de tours bcrypt. */
function declarations(): { fichier: string; nom: string; tours: number }[] {
  const trouves: { fichier: string; nom: string; tours: number }[] = [];
  const parcourir = (rel: string) => {
    for (const e of readdirSync(join(SRC, rel), { withFileTypes: true })) {
      const chemin = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) parcourir(chemin);
      else if (e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts')) {
        const src = readFileSync(join(SRC, chemin), 'utf8');
        for (const m of src.matchAll(/const\s+(BCRYPT_ROUNDS[A-Z_]*)\s*=\s*(\d+)/g)) {
          trouves.push({ fichier: chemin, nom: m[1], tours: Number(m[2]) });
        }
      }
    }
  };
  parcourir('');
  return trouves;
}

const TOUTES = declarations();

describe("L'instrument, avant ce qu'il mesure", () => {
  it('⚠ il en trouve — sinon « toutes égales » est vrai sur l’ensemble vide', () => {
    expect(TOUTES.length).toBeGreaterThan(1);
  });

  it('témoin de PRÉSENCE : il voit les trois services que je SAIS porteurs', () => {
    const fichiers = TOUTES.map((d) => d.fichier);
    expect(fichiers).toContain('auth/auth.service.ts');
    expect(fichiers).toContain('accounts/accounts.service.ts');
    expect(fichiers).toContain('admin/admin.service.ts');
  });

  it('⚠ témoin d’ABSENCE : il ne compte pas un nombre quelconque', () => {
    // La confusion plausible : une regex trop large attraperait `const TTL = 24`
    // et ferait diverger le relevé sur des valeurs qui n'ont rien à voir.
    const noms = new Set(TOUTES.map((d) => d.nom));
    for (const n of noms) expect(n).toMatch(/^BCRYPT_ROUNDS/);
  });
});

describe('⚠ L’INVARIANT : une seule valeur, partout', () => {
  it('tous les services hachent avec le même nombre de tours', () => {
    const valeurs = [...new Set(TOUTES.map((d) => d.tours))];
    expect(
      valeurs,
      'Les tours de bcrypt DIVERGENT :\n' +
        TOUTES.map((d) => `  · ${d.fichier} → ${d.nom} = ${d.tours}`).join('\n') +
        '\n\n⚠ Rien ne casse quand ils divergent : les hachés restent valides ' +
        'quel que soit le coût inscrit dedans. C’est précisément pourquoi il ' +
        'faut un test — le jour où l’on durcit la politique, un service oublié ' +
        'continuerait de hacher plus faible, en silence.',
    ).toHaveLength(1);
  });

  it('⚠ et cette valeur n’est pas ridicule', () => {
    // Un `= 4` passerait l'invariant ci-dessus s'il était posé partout.
    // L'égalité ne dit rien de la force.
    expect(TOUTES[0].tours, 'moins de 10 tours est trop faible en 2026').toBeGreaterThanOrEqual(10);
  });

  // ⚠ Le COMPTE : un quatrième service qui hache convoque quelqu'un.
  it('je SAIS combien de services hachent', () => {
    expect(
      TOUTES.length,
      'Un service de plus (ou de moins) hache des mots de passe. Ce n’est pas ' +
        'un échec : c’est une convocation. Porte-t-il la même valeur ?',
    ).toBe(3);
  });
});
