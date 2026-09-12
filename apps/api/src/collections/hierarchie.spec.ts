import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  hauteurDuSousArbre,
  profondeurDe,
  PROFONDEUR_MAX,
  refusDeDeplacement,
} from './hierarchie';

/**
 * LA HIÉRARCHIE DES COLLECTIONS — P6-1.
 *
 * Trois propriétés, et elles ne vivent pas au même endroit :
 *  · « pas de cycle » et « profondeur ≤ 3 » sont garanties EN BASE par un
 *    trigger (un `CHECK` ne peut pas être récursif) — éprouvées par
 *    `hierarchie-en-base.spec.ts`, qui exige une base vivante ;
 *  · la HAUTEUR DU SOUS-ARBRE déplacé ne peut pas l'être : le trigger valide
 *    la ligne écrite, pas les descendants qui ne sont pas écrits. C'est cette
 *    troisième-là qui vit ici.
 */

/** Faculté → Département → Thèses, plus une seconde racine. */
const ARBRE = [
  { id: 'fac', parentId: null, tenantId: 't1' },
  { id: 'dep', parentId: 'fac', tenantId: 't1' },
  { id: 'typ', parentId: 'dep', tenantId: 't1' },
  { id: 'autre', parentId: null, tenantId: 't1' },
];

describe('Profondeur et hauteur', () => {
  it('une racine est à la profondeur 1, une feuille de trois niveaux à 3', () => {
    expect(profondeurDe(ARBRE, 'fac')).toBe(1);
    expect(profondeurDe(ARBRE, 'dep')).toBe(2);
    expect(profondeurDe(ARBRE, 'typ')).toBe(3);
  });

  it('la hauteur d’une feuille est 1, celle de la racine est 3', () => {
    expect(hauteurDuSousArbre(ARBRE, 'typ')).toBe(1);
    expect(hauteurDuSousArbre(ARBRE, 'dep')).toBe(2);
    expect(hauteurDuSousArbre(ARBRE, 'fac')).toBe(3);
  });

  it('⚠ ne PEND PAS sur une donnée cyclique — le garde ne suppose pas la base saine', () => {
    // Le trigger rend un cycle impossible EN BASE. Cette fonction est un
    // garde-fou : un garde-fou qui peut boucler à l'infini sur une donnée
    // reprise d'ailleurs ne protège rien, il fait tomber le processus.
    const cyclique = [
      { id: 'a', parentId: 'b' },
      { id: 'b', parentId: 'a' },
    ];
    expect(hauteurDuSousArbre(cyclique, 'a')).toBeLessThanOrEqual(3);
    expect(profondeurDe(cyclique, 'a')).toBeLessThanOrEqual(3);
  });
});

describe('⚠ Le déplacement d’un SOUS-ARBRE — ce que le trigger ne voit pas', () => {
  it('déplacer une feuille sous une racine : accepté', () => {
    expect(refusDeDeplacement(ARBRE, 'typ', 'autre')).toBeNull();
  });

  it('⚠ déplacer une BRANCHE de deux niveaux sous un niveau 2 : REFUSÉ', () => {
    // `dep` porte `typ`. Le mettre sous `typ`… serait un cycle. Le mettre sous
    // un niveau 2 le porterait à 3 et son enfant à 4 : aucune ligne écrite ne
    // viole la règle à son propre niveau, et c'est précisément l'angle mort du
    // trigger. Sans ce contrôle, la base accepterait l'écriture.
    const arbre = [...ARBRE, { id: 'dep2', parentId: 'autre' }];
    expect(refusDeDeplacement(arbre, 'dep', 'dep2')).toMatch(/3 niveaux/);
  });

  it('une collection ne peut pas être sa propre parente', () => {
    expect(refusDeDeplacement(ARBRE, 'fac', 'fac')).toMatch(/propre parente/);
  });

  it('⚠ un parent qui est un DESCENDANT est refusé — c’est le cycle', () => {
    expect(refusDeDeplacement(ARBRE, 'fac', 'typ')).toMatch(/ancêtre/);
  });

  it('un parent inexistant est refusé, et le dit', () => {
    expect(refusDeDeplacement(ARBRE, 'typ', 'fantome')).toMatch(/n’existe pas/);
  });

  it('⚠ un parent d’une AUTRE école est refusé, et le refus NOMME la cause', () => {
    // Ce n'est pas une fuite aujourd'hui — l'accès se décide par collection.
    // Mais un arbre incohérent qu'on peut construire finira construit, et le
    // jour où quelqu'un ajoutera l'héritage sans relire la décision qui
    // l'interdit, il DEVIENDRA une fuite.
    //
    // ⚠ Le message compte autant que le refus : un 400 muet enverrait chercher
    // une faute de saisie dans un identifiant parfaitement valide.
    const deuxEcoles = [...ARBRE, { id: 'ecoleB', parentId: null, tenantId: 't2' }];
    expect(refusDeDeplacement(deuxEcoles, 'typ', 'ecoleB')).toMatch(/autre établissement/);
  });

  it('une collection PARTAGÉE reste un parent acceptable — elle n’est à personne', () => {
    // `tenantId: null` = commerciale ou externe. C'est ainsi qu'une école
    // rattache ses collections à un fonds auquel elle est abonnée ; l'interdit
    // ne porte que sur DEUX écoles nommées.
    const avecPartagee = [...ARBRE, { id: 'partagee', parentId: null, tenantId: null }];
    expect(refusDeDeplacement(avecPartagee, 'typ', 'partagee')).toBeNull();
    expect(refusDeDeplacement(avecPartagee, 'partagee', 'autre')).toBeNull();
  });

  it('remonter en racine (`null`) est TOUJOURS permis', () => {
    // Aucune règle ne peut être violée en remontant : la profondeur diminue.
    for (const id of ['fac', 'dep', 'typ']) {
      expect(refusDeDeplacement(ARBRE, id, null), id).toBeNull();
    }
  });
});

describe('⚠ La borne est écrite à DEUX endroits — ils doivent s’accorder', () => {
  /**
   * ⚠ SANS CE TEST, LA DIVERGENCE EST SILENCIEUSE. `PROFONDEUR_MAX` vit dans le
   * TypeScript ; le trigger porte son propre `3` dans le SQL de la migration.
   * Deux sources qui disent la même chose aujourd'hui — et c'est exactement la
   * configuration où une divergence naît le jour où l'une change, sans que rien
   * ne le dise (leçon « deux sources qui s'accordent par coïncidence »).
   *
   * Ce test relit le SQL. Il n'est pas beau ; il est le seul lien mécanique
   * entre les deux.
   */
  const sqlMigration = (() => {
    const racine = join(__dirname, '..', '..', 'prisma', 'migrations');
    const dossier = readdirSync(racine).find((d) => d.endsWith('_collections_hierarchie'));
    expect(dossier, 'la migration collections_hierarchie doit exister').toBeTruthy();
    return readFileSync(join(racine, dossier as string, 'migration.sql'), 'utf8');
  })();

  it('le trigger borne à la MÊME valeur que le code', () => {
    const borne = /IF profondeur > (\d+) THEN/.exec(sqlMigration)?.[1];
    expect(borne, 'la borne du trigger doit être lisible dans le SQL').toBeTruthy();
    expect(Number(borne)).toBe(PROFONDEUR_MAX);
  });

  it('⚠ le SQL dit POURQUOI ce n’est pas un CHECK — sinon quelqu’un le simplifiera', () => {
    // Exigence explicite du brief. Un trigger sans son motif se fait remplacer
    // par une contrainte qui ne peut pas exprimer la règle, et la garantie
    // disparaît en silence.
    expect(sqlMigration).toMatch(/POURQUOI UN TRIGGER ET NON UN `?CHECK/);
    expect(sqlMigration).toMatch(/ni sous-requête ni CTE récursive/);
  });

  it('le trigger couvre l’INSERT et la mise à jour du parent', () => {
    // Un trigger posé sur le seul INSERT laisserait créer un cycle par UPDATE.
    expect(sqlMigration).toMatch(/BEFORE INSERT OR UPDATE OF parent_id ON/);
  });

  it('la migration rattrape les écoles DÉJÀ provisionnées pour `authors.user_id`', () => {
    // `LIKE ... INCLUDING ALL` ne s'exécute qu'à la création : sans la boucle,
    // les écoles existantes n'auraient pas la colonne, et P6-2 comme P6-3
    // tomberaient sur « column does not exist ».
    // ⚠ Deux antislashs dans la regex = UN antislash littéral dans le SQL
    // (`tenant\_%` échappe le souligné pour `LIKE`). Ma première écriture en
    // mettait quatre, donc en cherchait deux : le test échouait sur sa propre
    // citation, pas sur le SQL.
    expect(sqlMigration).toMatch(/nspname LIKE 'tenant\\_%'/);
    expect(sqlMigration).toMatch(/ALTER TABLE %I\.authors ADD COLUMN IF NOT EXISTS user_id/);
  });
});
