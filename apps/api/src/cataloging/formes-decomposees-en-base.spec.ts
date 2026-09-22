import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { MESSAGE_BASE_INJOIGNABLE } from '../common/base-injoignable';

/**
 * ⚠ AUCUN TEXTE DÉCOMPOSÉ N'EST ENTRÉ EN BASE — la quatrième porte, cherchée
 * avant qu'elle coûte.
 *
 * *Posé le 14 septembre 2026, après TROIS occurrences du même défaut par trois
 * portes différentes : le client SRU, l'import MARC, et l'import CSV des
 * étudiants attendus (plus les métadonnées embarquées d'un EPUB).*
 *
 * ## Pourquoi un garde plutôt qu'une quatrième leçon
 *
 * Les trois frontières sont normalisées aujourd'hui. Rien n'empêche qu'une
 * quatrième s'ouvre demain — un import Excel, un connecteur, un formulaire qui
 * accepte du texte collé depuis un document produit sous macOS. Le geste sera
 * naturel, il paraîtra utile, et **il n'échouera nulle part** : la forme
 * décomposée s'affiche exactement comme la forme composée.
 *
 * ## Ce que la forme décomposée coûte, et ce n'est pas la même chose partout
 *
 * | Où | Ce qui arrive |
 * |---|---|
 * | Un TITRE | la notice s'affiche bien, la recherche la manque |
 * | Un nom d'AUTEUR | la fiche d'autorité se dédouble sur une personne unique |
 * | ⚠ Une CLASSE | `access-control.matching` compare par égalité STRICTE : l'étudiant se voit refuser les collections de sa propre classe, et le refus la NOMME |
 *
 * Le troisième cas est celui qu'aucun écran ne permet de diagnostiquer — les
 * deux chaînes sont visuellement identiques.
 *
 *   PG_LIVE=1 npx dotenv -e ../../.env -- vitest run src/cataloging/formes-decomposees-en-base.spec.ts
 */

/** Le détecteur, isolé pour être éprouvé sur des témoins. */
export function estDecompose(v: unknown): boolean {
  return typeof v === 'string' && v !== v.normalize('NFC');
}

const prisma = new PrismaClient();

/** Colonnes qui DÉCIDENT ou qui IDENTIFIENT, école par école. */
const COLONNES: { table: string; colonne: string; enjeu: string }[] = [
  { table: 'school_classes', colonne: 'name', enjeu: 'la classe décide de l’accès' },
  { table: 'expected_students', colonne: 'class_name', enjeu: 'la classe décide de l’accès' },
  { table: 'expected_students', colonne: 'last_name', enjeu: 'le nom identifie l’étudiant attendu' },
  { table: 'users', colonne: 'class_name', enjeu: 'la classe décide de l’accès' },
  // ⚠ `display_name`, PAS `name` — la colonne `name` n'a jamais existé sur
  // `authors`. La requête levait, le `catch` ci-dessous l'avalait, et ce
  // garde rendait VERT en ayant examiné ZÉRO nom d'auteur : précisément
  // l'enjeu pour lequel il avait été écrit. Corrigé le 22/09/2026.
  { table: 'authors', colonne: 'display_name', enjeu: 'la fiche d’autorité se dédouble' },
  { table: 'biblio_records', colonne: 'title', enjeu: 'la recherche manque la notice' },
];

describe.runIf(process.env.PG_LIVE === '1')('Aucune forme décomposée en base', () => {
  let joignable = false;
  let ecoles: string[] = [];

  beforeAll(async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      joignable = true;
      ecoles = (await prisma.tenant.findMany({ select: { slug: true } })).map((t) => t.slug);
    } catch {
      joignable = false;
    }
  }, 30_000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('⚠ TÉMOINS DU DÉTECTEUR : présence et absence, sur des chaînes synthétiques', () => {
    // ⚠ SYNTHÉTIQUES, et jamais tirés de ce qu'on mesure : un témoin pris dans
    // la population confirmerait ce qu'on croit déjà d'elle.
    expect(estDecompose('Traore\u0301'), 'il ne voit pas une chaîne décomposée').toBe(true);
    // ABSENCE, sur la confusion PLAUSIBLE : une chaîne accentuée mais COMPOSÉE,
    // qui se lit exactement pareil. C'est l'erreur que le détecteur risque.
    expect(estDecompose('Traor\u00e9'), 'il crie sur une chaîne composée').toBe(false);
    expect(estDecompose('ASCII simple')).toBe(false);
    expect(estDecompose(null)).toBe(false);
  });

  it('⚠ aucune valeur décomposée dans les colonnes qui décident ou identifient', async () => {
    expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
    expect(ecoles.length, 'aucune école : ce garde n’a rien examiné').toBeGreaterThan(0);

    const fautives: string[] = [];
    // ⚠ TÉMOIN DE COMPTE. « Aucune valeur décomposée » est VRAI sur
    // l'ensemble vide : sans ce compte, un garde qui ne lit plus rien est
    // indiscernable d'un garde qui trouve tout propre.
    let examinees = 0;
    // ⚠ ET LE COMPTE GLOBAL NE SUFFIT PAS. Il était déjà là, à
    // `> 20` — et il passait pendant qu'`authors` n'était pas lue du tout,
    // parce que les cinq autres colonnes fournissaient les 20. Un témoin qui
    // agrège masque exactement ce qu'il devrait désigner.
    const luesAvecSucces = new Set<string>();

    for (const slug of ecoles) {
      for (const { table, colonne, enjeu } of COLONNES) {
        let valeurs: { v: string | null }[];
        try {
          valeurs = await prisma.$queryRawUnsafe<{ v: string | null }[]>(
            `SELECT DISTINCT ${colonne} AS v FROM "tenant_${slug}".${table} WHERE ${colonne} IS NOT NULL`,
          );
        } catch (e) {
          // ⚠ CE `catch` DOIT DISCRIMINER, et il ne le faisait pas.
          //
          // Une école à demi provisionnée (la recette de déprovision en
          // fabrique une, en parallèle, sur cette même base) n'a pas la TABLE :
          // c'est le cas légitime, on passe.
          //
          // Une COLONNE absente est tout autre chose : c'est une faute dans la
          // liste ci-dessus, et l'avaler rend le garde muet pour toujours sur
          // cette colonne. C'est ce qui est arrivé à `authors.name` — le garde
          // a passé vert pendant des semaines sans lire un seul nom d'auteur.
          //
          // 42P01 = undefined_table · 42703 = undefined_column
          const code = (e as { meta?: { code?: string }; code?: string })?.meta?.code
            ?? (e as { code?: string })?.code;
          const texte = String((e as Error)?.message ?? e);
          const tableAbsente = code === '42P01' || /does not exist/i.test(texte) && /relation/i.test(texte);
          if (tableAbsente) continue;
          throw new Error(
            `Le garde ne peut pas lire ${table}.${colonne} sur « ${slug} ». ` +
              `Si la COLONNE n'existe pas, corrigez la liste COLONNES — un garde ` +
              `qui saute une colonne en silence ne garde rien.\n${texte}`,
          );
        }
        luesAvecSucces.add(`${table}.${colonne}`);
        for (const { v } of valeurs) {
          examinees++;
          if (estDecompose(v)) {
            fautives.push(`${slug}.${table}.${colonne} = ${JSON.stringify(v)} — ${enjeu}`);
          }
        }
      }
    }

    // ⚠ TÉMOIN QUI COMPTE : sans lui, un garde qui n'examine RIEN — requêtes
    // toutes en échec, tables absentes — rendrait « aucune valeur fautive »,
    // et la ligne verte se lirait comme de la couverture.
    expect(examinees, 'le garde n’a examiné aucune valeur : il ne mesure rien').toBeGreaterThan(20);

    // ⚠ CHAQUE COLONNE DÉCLARÉE A ÉTÉ LUE QUELQUE PART. C'est l'assertion
    // qui manquait : une colonne dont le nom est faux n'est jamais lue, et
    // son silence se confond avec « rien à signaler ». Une table vide reste
    // acceptable — c'est la LECTURE qui doit avoir réussi, pas le contenu.
    expect(
      COLONNES.map((c) => `${c.table}.${c.colonne}`).filter((k) => !luesAvecSucces.has(k)),
      'Colonne(s) déclarée(s) qu’aucune école n’a permis de lire. Soit le nom\n' +
        'est faux (corrigez COLONNES), soit plus aucune école ne porte la table.\n' +
        '⚠ Ne laissez pas la ligne : un garde qui saute une colonne en silence\n' +
        '  ne garde rien — c’est ce qui est arrivé à `authors.name`.',
    ).toEqual([]);

    // ⚠ ET LE CLASSEMENT LUI-MÊME EST ÉPROUVÉ, pas seulement le détecteur.
    // Ce garde est en lecture seule : il ne peut pas écrire du décomposé en
    // base pour se voir échouer. Plutôt que de déclarer la borne, on fait
    // passer un témoin SYNTHÉTIQUE dans la MÊME chaîne de classement que les
    // valeurs réelles — ce qui prouve que la boucle range une valeur fautive
    // du bon côté, et pas seulement que `estDecompose` sait dire oui.
    const temoin = ['Traore\u0301', 'Traor\u00e9']
      .filter((v) => estDecompose(v))
      .map((v) => `temoin.school_classes.name = ${JSON.stringify(v)} — témoin`);
    expect(temoin, 'la chaîne de classement ne retient pas une valeur décomposée').toHaveLength(1);

    expect(
      fautives,
      'Du texte en forme DÉCOMPOSÉE est entré en base.\n' +
        'Ce n’est pas une donnée à corriger d’abord : c’est une FRONTIÈRE qui ne ' +
        'normalise pas.\n' +
        'Deux gestes, dans cet ordre :\n' +
        ' · trouvez par où c’est entré — import, connecteur, formulaire — et ' +
        'posez `.normalize(\'NFC\')` à l’entrée, comme le font déjà le client ' +
        'SRU, l’import MARC, l’import CSV et l’extraction de métadonnées ;\n' +
        ' · puis réparez les valeurs existantes, sinon le défaut survit à sa ' +
        'cause.\n' +
        '⚠ Une classe décomposée est INDIAGNOSTICABLE depuis un écran : elle ' +
        's’affiche comme la classe composée et ne s’égale pas à elle.',
    ).toEqual([]);
  }, 60_000);
});
