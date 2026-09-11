import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_DESCRIPTION_PROFILE,
  DEFENSE_RECORD_TYPES,
  DESCRIPTION_PROFILES,
} from './description-profiles';
import { CHAMPS_PAR_PROFIL, profilPourTypeDeNotice } from './profil-de-notice';
import { CHAMPS_NOYAU } from './notice-gafeso';

describe('profil de notice — la déduction', () => {
  it('tout type de SOUTENANCE donne le profil académique', () => {
    // Exhaustif : le domaine est fini et déclaré.
    expect(DEFENSE_RECORD_TYPES.length).toBeGreaterThan(0); // témoin
    for (const type of DEFENSE_RECORD_TYPES) {
      expect(profilPourTypeDeNotice(type), type).toBe('academique');
    }
  });

  it('les autres types donnent le profil bibliographique', () => {
    // 'publication' figure ici DÉLIBÉRÉMENT : voir le compte rendu du lot — le
    // classement des articles et rapports est une question de bibliothèque, pas
    // de code, et rien ne la tranche aujourd'hui.
    for (const type of ['book', 'ouvrage', 'publication', 'periodique', 'inconnu']) {
      expect(profilPourTypeDeNotice(type), type).toBe('bibliographique');
    }
    expect(DEFAULT_DESCRIPTION_PROFILE).toBe('bibliographique');
  });

  it('les espaces de bord ne changent pas le profil', () => {
    expect(profilPourTypeDeNotice('  these  ')).toBe('academique');
  });
});

describe('profil de notice — l’appartenance des champs', () => {
  it('chaque profil déclaré a des champs, et aucun n’est vide', () => {
    for (const profil of DESCRIPTION_PROFILES) {
      expect(CHAMPS_PAR_PROFIL[profil], profil).toBeDefined();
      expect(CHAMPS_PAR_PROFIL[profil].length, profil).toBeGreaterThan(0);
    }
  });

  it('⚠ un champ n’appartient qu’à UN SEUL profil', () => {
    // Un champ dans deux profils rendrait la question « ce champ se saisit-il ? »
    // dépendante d'un ordre de lecture. C'est la même forme que la permission
    // cible à deux origines : la ligne paraît anodine, le choix devient
    // impossible.
    const vus = new Map<string, string>();
    const doubles: string[] = [];
    for (const profil of DESCRIPTION_PROFILES) {
      for (const champ of CHAMPS_PAR_PROFIL[profil]) {
        const deja = vus.get(champ);
        if (deja) doubles.push(`${champ} : ${deja} + ${profil}`);
        else vus.set(champ, profil);
      }
    }
    expect(doubles, 'champs présents dans deux profils').toEqual([]);
  });

  it('⚠ AUCUN champ de profil n’est dans le NOYAU (invariant I2)', () => {
    const dansLesDeux = Object.values(CHAMPS_PAR_PROFIL)
      .flat()
      .filter((c) => (CHAMPS_NOYAU as readonly string[]).includes(c));
    expect(dansLesDeux, 'champs à la fois noyau et profil').toEqual([]);
  });

  it('tout champ de profil existe réellement dans le schéma', () => {
    const schema = readFileSync(join(__dirname, '../../prisma/schema.prisma'), 'utf-8');
    const modele = schema.slice(schema.indexOf('model BiblioRecord'));
    const corps = modele.slice(0, modele.indexOf('\n}'));
    const colonnes = new Set(
      corps
        .split('\n')
        .map((l) => /^\s{2}(\w+)\s+\w/.exec(l)?.[1])
        .filter((c): c is string => Boolean(c)),
    );
    expect(colonnes.has('defenseUniversity')).toBe(true); // témoin positif
    for (const champ of Object.values(CHAMPS_PAR_PROFIL).flat()) {
      expect(colonnes.has(champ), champ).toBe(true);
    }
  });
});

/**
 * ⚠ LE GARDE QUI EMPÊCHE LA DÉRIVE.
 *
 * `profile` est STOCKÉ tout en étant DÉDUCTIBLE de `recordType`. C'est la forme
 * exacte de la dérive silencieuse à deux sources — celle de `author` face à
 * `contributors`, celle du nom de l'adhérent face à celui de son compte. Une
 * écriture qui poserait le type sans le profil laisserait la notice classée
 * selon son type PRÉCÉDENT, sans qu'aucune erreur ne se lève et sans qu'aucune
 * réponse ait l'air fausse.
 *
 * Le garde est donc sur la SOURCE : toute charge d'écriture de `biblioRecord`
 * qui pose `recordType` pose aussi `profile`.
 */
describe('profil de notice — aucune écriture ne pose le type sans le profil', () => {
  const FICHIERS = [
    'cataloging/cataloging.service.ts',
    'cataloging/digital-copy.service.ts',
    'categories/categories.service.ts',
    'authors/authors.service.ts',
  ];

  /** Extrait les charges d'écriture de `biblioRecord`, par équilibrage d'accolades. */
  function chargesDEcriture(): { fichier: string; corps: string }[] {
    const charges: { fichier: string; corps: string }[] = [];
    for (const fichier of FICHIERS) {
      const source = readFileSync(join(__dirname, '..', fichier), 'utf-8');
      const motif = /biblioRecord\.(create|update|upsert|createMany)\(/g;
      for (let m = motif.exec(source); m; m = motif.exec(source)) {
        let profondeur = 0;
        let i = m.index + m[0].length - 1;
        const debut = i;
        do {
          if (source[i] === '(') profondeur++;
          else if (source[i] === ')') profondeur--;
          i++;
        } while (profondeur > 0 && i < source.length);
        // ⚠ LES COMMENTAIRES SONT RETIRÉS AVANT TOUTE COMPARAISON. Un
        // commentaire mentionnant « profile » suffirait sinon à faire passer
        // une charge qui ne le pose pas — l'instrument se laisserait berner par
        // le texte qui l'explique.
        const corps = source
          .slice(debut, i)
          .split('\n')
          .filter((l) => !l.trim().startsWith('//'))
          .join('\n');
        charges.push({ fichier, corps });
      }
    }
    return charges;
  }

  /**
   * ⚠ POURQUOI CE MOTIF ET PAS `champ:`. `createRecord` écrit `recordType,` en
   * PROPRIÉTÉ ABRÉGÉE. Une première version cherchant `recordType:` ne la
   * voyait pas — le garde aurait donc laissé passer exactement la forme la plus
   * courte d'écriture, celle qu'on emploie quand la variable porte déjà le bon
   * nom. C'est le témoin positif ci-dessous qui l'a montré : il annonçait 3
   * charges portant le type, le relevé n'en trouvait que 2.
   */
  const pose = (corps: string, champ: string) =>
    new RegExp(`\\b${champ}\\s*[:,}]`).test(corps);

  const charges = chargesDEcriture();

  it('le relevé voit bien les écritures (témoin positif)', () => {
    // Sans ce témoin, un équilibrage d'accolades cassé rendrait une liste vide
    // et le garde ci-dessous passerait au vert sans rien regarder.
    expect(charges.length).toBeGreaterThanOrEqual(4);
    expect(charges.filter((c) => pose(c.corps, 'recordType')).length).toBe(3);
  });

  it('⚠ TOUTE écriture qui pose `recordType` pose aussi `profile`', () => {
    const fautives = charges
      .filter((c) => pose(c.corps, 'recordType') && !pose(c.corps, 'profile'))
      .map((c) => `${c.fichier} → ${c.corps.slice(0, 80).replace(/\s+/g, ' ')}…`);
    expect(fautives, 'écritures posant le type sans le profil').toEqual([]);
  });
});

/**
 * ⚠ LE VOCABULAIRE EST DANS LE SQL AUSSI — QUATRIÈME ENDROIT.
 *
 * La migration `20260911140000_profil_deduit_du_type` reclasse l'existant. Elle
 * ne peut pas IMPORTER `DEFENSE_RECORD_TYPES` : c'est du SQL, elle la recopie.
 * C'est exactement la classe de défaut du §2 du relevé — un même vocabulaire en
 * plusieurs endroits qui ne se parlent pas, et dont la divergence est
 * silencieuse : une valeur ajoutée en TypeScript classerait les notices neuves
 * en académique tandis que la migration laisserait les anciennes
 * bibliographiques, sans qu'aucune erreur ne se lève.
 *
 * Ce test est le seul lien entre les deux.
 */
describe('profil de notice — le SQL de migration dit la même chose que le code', () => {
  const sql = readFileSync(
    join(
      __dirname,
      '../../prisma/migrations/20260911140000_profil_deduit_du_type/migration.sql',
    ),
    'utf-8',
  );

  it('la migration existe et contient bien une liste de types (témoin positif)', () => {
    // Sans ce témoin, un fichier renommé ou une liste introuvable rendrait un
    // ensemble vide, et la comparaison ci-dessous passerait au vert en
    // comparant rien à rien.
    expect(sql).toContain('record_type IN (');
    expect(sql.match(/record_type IN \(([^)]+)\)/g)?.length).toBe(2); // SET + WHERE
  });

  it('⚠ les types de soutenance du SQL sont EXACTEMENT ceux du code', () => {
    const listes = [...sql.matchAll(/record_type IN \(([^)]+)\)/g)].map((m) =>
      [...m[1].matchAll(/'([^']+)'/g)].map((v) => v[1]).sort(),
    );
    const attendu = [...DEFENSE_RECORD_TYPES].sort();
    // Les DEUX occurrences (le SET et le WHERE) sont comparées : un WHERE
    // divergent du SET rendrait la migration non idempotente — elle
    // réécrirait les mêmes lignes à chaque exécution.
    for (const liste of listes) {
      expect(liste).toEqual(attendu);
    }
  });
});
