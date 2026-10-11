/**
 * 🔴 UNE ÉCOLE PORTE LES MÊMES CONTRAINTES D'INDEX QUE LE GABARIT — garde vivant.
 *
 * ## ⭐ LE TROU QUE CE FICHIER FERME, et il n'était pas du bruit
 *
 * `derive-des-schemas-en-base.spec.ts` compare `information_schema.columns` —
 * **table et colonne**. Il ne regarde AUCUN index. Une contrainte unique
 * présente dans le gabarit et absente d'une école était donc invisible, et
 * c'est exactement la divergence qui coûte : **deux code-barres identiques
 * acceptés dans une école, refusés dans une autre**, sans que rien ne le dise.
 *
 * ⚠ Ce n'était pas « un garde trop bruyant » : **le garde n'a jamais regardé**.
 * Et la seule raison pour laquelle on pouvait affirmer qu'il n'y avait aucune
 * divergence le 26 septembre 2026 est qu'une requête avait été écrite à la
 * main, une fois. Rien ne le vérifiait le lendemain.
 *
 * ## 🔴 LA FORME FAUTIVE, ET ELLE EST IMMÉDIATEMENT À PORTÉE DE MAIN
 *
 * **Comparer les NOMS d'index.** `pg_indexes.indexname` est là, la requête fait
 * une ligne — et elle produirait **quinze faux positifs le premier jour** :
 * `items_barcode_key` dans `public`, `items_barcode_idx` dans les écoles. Deux
 * chemins de création (`db push` pour le gabarit, la DDL de provisioning pour
 * les écoles) nomment différemment la MÊME contrainte.
 *
 * Un détecteur qui signale quinze fois du code correct se fait désactiver dans
 * la semaine — par une exception, par une liste de tolérances, ou simplement en
 * cessant d'être lu. Et il ne sert plus le jour où une vraie contrainte manque.
 *
 * ⭐ **Ce qu'on compare est donc `(table, colonnes, unicité)`. Jamais un nom.**
 * Le nom d'un index n'est pas une propriété du produit : la propriété est
 * « cette combinaison de colonnes est unique ici aussi ».
 *
 * ## ⚠ CE QUI EST EXCLU, ET POURQUOI — mesuré, pas supposé
 *
 * · **Les clés primaires** (`indisprimary`) : elles viennent du `LIKE …
 *   INCLUDING ALL` et ne peuvent pas diverger sans que la table elle-même
 *   diverge — ce que le garde des colonnes voit déjà.
 * · **Les index partiels** (`indpred IS NOT NULL`) : leur prédicat se compare
 *   mal par du texte, et un `WHERE` équivalent peut s'écrire de deux façons.
 *   ⚠ Et l'exclusion n'a **aucun angle mort aujourd'hui**, ce qui a été MESURÉ
 *   plutôt que déclaré : les deux index partiels du gabarit portent sur
 *   `public.collections`, une table PARTAGÉE qui n'est pas dans
 *   `TENANT_TABLES` — zéro index partiel sur une table d'école.
 *   Le témoin ci-dessous le REVÉRIFIE, pour que l'exclusion cesse d'être sûre
 *   le jour où quelqu'un en ajoute un.
 *
 * Discipline de recette : `lecture-seule`.
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MESSAGE_BASE_INJOIGNABLE, ecolesMesurees } from '../common/base-injoignable';
import { TENANT_TABLES } from './tenant-schema';

const VIVANT = process.env.PG_LIVE === '1';

const prisma = new PrismaClient();

/** Une contrainte d'index, décrite par ce qu'elle FAIT — jamais par son nom. */
interface Contrainte {
  table: string;
  colonnes: string;
  unique: boolean;
}

function cle(c: Contrainte): string {
  return `${c.table}(${c.colonnes})${c.unique ? ' UNIQUE' : ''}`;
}

/**
 * ⭐ LA COMPARAISON, PURE ET EXPORTABLE — c'est elle que les témoins
 * synthétiques traversent.
 *
 * ⚠ Un témoin posé sur une requête SQL n'éprouve que cette requête. Celui-ci
 * doit passer par la LOGIQUE qui décide, sinon il ne mesure pas l'instrument
 * mais sa dernière ligne.
 */
export function manquantesDansLEcole(
  gabarit: Contrainte[],
  ecole: Contrainte[],
  tablesPresentes: Set<string>,
): string[] {
  const presentes = new Set(ecole.map(cle));
  return gabarit
    .filter((c) => tablesPresentes.has(c.table) && !presentes.has(cle(c)))
    .map(cle)
    .sort();
}

const CONTRAINTES = `
  SELECT c.relname AS table,
         (SELECT string_agg(a.attname, ',' ORDER BY a.attname)
            FROM unnest(i.indkey) WITH ORDINALITY AS k(att, ord)
            JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.att) AS colonnes,
         i.indisunique AS unique
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = $1
     AND NOT i.indisprimary
     AND i.indpred IS NULL
     AND c.relname = ANY($2::text[])`;

describe.runIf(VIVANT)('🔴 Les index d’une école contre ceux du gabarit', () => {
  let joignable = false;
  let ecoles: string[] = [];
  let gabarit: Contrainte[] = [];
  let partielsSurTableDEcole = -1;

  beforeAll(async () => {
    try {
      ecoles = (
        await prisma.$queryRawUnsafe<{ nspname: string }[]>(
          `SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant_%' ORDER BY 1`,
        )
      ).map((r) => r.nspname);
      console.log(
        ecolesMesurees(
          'index-des-ecoles',
          ecoles.map((s) => s.replace('tenant_', '')),
        ),
      );
      gabarit = await prisma.$queryRawUnsafe<Contrainte[]>(CONTRAINTES, 'public', [
        ...TENANT_TABLES,
      ]);
      const [p] = await prisma.$queryRawUnsafe<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM pg_index i
           JOIN pg_class c ON c.oid = i.indrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND i.indpred IS NOT NULL
            AND c.relname = ANY($1::text[])`,
        [...TENANT_TABLES],
      );
      partielsSurTableDEcole = p.n;
      joignable = true;
    } catch {
      joignable = false;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('⚠ TÉMOIN DE COMPTE : le gabarit porte 53 contraintes d’index', () => {
    expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
    // « Au moins une » confirmerait que la requête tourne. Un compte EXACT
    // convoque quelqu'un le jour où une contrainte entre ou sort du gabarit —
    // et c'est précisément ce jour-là qu'il faut vérifier qu'elle est arrivée
    // dans les écoles existantes, que le `LIKE … INCLUDING ALL` ne rattrape pas.
    expect(
      gabarit.length,
      'Le gabarit a changé de contraintes d’index. Ce n’est pas un échec : ' +
        'c’est une convocation. Une contrainte AJOUTÉE au gabarit n’arrive PAS ' +
        'toute seule dans les écoles déjà provisionnées — il faut la migration ' +
        'qui la pose. Vérifiez-le, puis mettez ce compte à jour.',
    ).toBe(53);
    expect(ecoles.length, 'aucune école : le garde ne mesure rien').toBeGreaterThan(0);
  });

  it('⚠ l’exclusion des index PARTIELS n’a aucun angle mort', () => {
    expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
    // Les index partiels sont exclus parce que leur prédicat se compare mal.
    // L'exclusion est SÛRE tant qu'aucun ne porte sur une table d'école — et
    // c'est ce fait-là, pas la décision, qui doit être revérifié.
    expect(
      partielsSurTableDEcole,
      'Un index PARTIEL est apparu sur une table d’école dans le gabarit. ' +
        'L’exclusion de ce garde cesse donc d’être sans conséquence : ce ' +
        'nouvel index n’est comparé par RIEN. Deux issues — comparez aussi le ' +
        'prédicat (`pg_get_expr`), ou déclarez cet index ici avec son motif.',
    ).toBe(0);
  });

  it('🔴 AUCUNE école ne manque une contrainte du gabarit', async () => {
    expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
    const fautifs: string[] = [];
    let examinees = 0;
    for (const schema of ecoles) {
      const ecole = await prisma.$queryRawUnsafe<Contrainte[]>(CONTRAINTES, schema, [
        ...TENANT_TABLES,
      ]);
      const tables = new Set(
        (
          await prisma.$queryRawUnsafe<{ table_name: string }[]>(
            `SELECT table_name FROM information_schema.tables WHERE table_schema = $1`,
            schema,
          )
        ).map((t) => t.table_name),
      );
      examinees += ecole.length;
      for (const m of manquantesDansLEcole(gabarit, ecole, tables)) {
        fautifs.push(`${schema.replace('tenant_', '')} : ${m}`);
      }
    }
    // ⚠ Un relevé qui ne lit RIEN rendrait « aucune divergence » — le vert le
    // plus rassurant et le plus creux qui soit.
    expect(examinees, 'aucun index lu : le garde ne mesure rien').toBeGreaterThan(50);
    expect(
      fautifs,
      'Des écoles n’ont PAS les contraintes d’index du gabarit :\n' +
        fautifs.map((f) => `  · ${f}`).join('\n') +
        '\n\nUne contrainte UNIQUE absente laisse entrer dans cette école ce que ' +
        'les autres refusent — deux code-barres identiques, deux adhérents sur ' +
        'le même matricule. Posez-la par une migration, jamais à la main sur ' +
        'une seule école.',
    ).toEqual([]);
  });

  // ── Les témoins SYNTHÉTIQUES ────────────────────────────────────────────
  //
  // ⚠ Ils ne viennent PAS de ce que l'instrument mesure : un témoin tiré du
  // schéma réel confirmerait ce qu'on croit déjà savoir. Ceux-ci sont
  // fabriqués, et leur réponse est connue PAR CONSTRUCTION.

  it('⭐ TÉMOIN DE PRÉSENCE : une contrainte absente de l’école est SIGNALÉE', () => {
    const gab: Contrainte[] = [
      { table: 'items', colonnes: 'barcode', unique: true },
      { table: 'users', colonnes: 'email', unique: true },
    ];
    const ecole: Contrainte[] = [{ table: 'users', colonnes: 'email', unique: true }];
    expect(manquantesDansLEcole(gab, ecole, new Set(['items', 'users']))).toEqual([
      'items(barcode) UNIQUE',
    ]);
  });

  it('⭐ TÉMOIN D’ABSENCE : des NOMS différents ne sont PAS une divergence', () => {
    // C'est la confusion PLAUSIBLE, et la seule qui compte ici : `items_barcode_key`
    // contre `items_barcode_idx`. La structure ne porte aucun nom — ce témoin
    // vérifie donc que la comparaison ne peut pas en dépendre, même par accident.
    const gab: Contrainte[] = [{ table: 'items', colonnes: 'barcode', unique: true }];
    const ecole: Contrainte[] = [{ table: 'items', colonnes: 'barcode', unique: true }];
    expect(manquantesDansLEcole(gab, ecole, new Set(['items']))).toEqual([]);
  });

  it('⭐ TÉMOIN D’ABSENCE : une unicité PERDUE est bien une divergence', () => {
    // Mêmes colonnes, unicité différente — le cas qui coûte, et celui qu'une
    // comparaison sur les seules colonnes manquerait.
    const gab: Contrainte[] = [{ table: 'items', colonnes: 'barcode', unique: true }];
    const ecole: Contrainte[] = [{ table: 'items', colonnes: 'barcode', unique: false }];
    expect(manquantesDansLEcole(gab, ecole, new Set(['items']))).toEqual([
      'items(barcode) UNIQUE',
    ]);
  });

  it('⚠ une table ABSENTE de l’école n’est pas reprochée ici', () => {
    // C'est le garde des COLONNES qui voit une table manquante, et son message
    // dit quoi faire. Le reprocher ici produirait deux alertes pour un défaut,
    // dont une qui envoie au mauvais endroit.
    const gab: Contrainte[] = [{ table: 'depots', colonnes: 'status', unique: false }];
    expect(manquantesDansLEcole(gab, [], new Set())).toEqual([]);
  });
});
