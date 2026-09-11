import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_RECORD_TYPE, DEFENSE_RECORD_TYPES } from './description-profiles';
import {
  COLONNES_COLLATIONNEES,
  COLONNES_COLLATIONNEES_PUBLIC,
} from '../tenancy/collation-francaise';
import {
  construireOrderBy,
  MESSAGE_TRI_INVALIDE,
  TRI_PAR_DEFAUT,
  TRIS_DISPONIBLES,
  TRIS_REFUSES,
} from './tri-du-catalogue';

/**
 * L'INVARIANT DU LOT : aucun tri exposé ne dépend de la collation.
 *
 * Il est écrit en test et non en commentaire, parce qu'un commentaire est lu
 * par qui le cherche. Ce qu'on veut empêcher est précis : que quelqu'un ajoute
 * `title` à la liste blanche un jour où le défaut de collation aura été oublié.
 */

/**
 * Colonnes TEXTE exposées au tri SANS être collationnées, avec leur
 * justification.
 *
 * ⚠ LA RÈGLE A CHANGÉ DE FORME LE 11 SEPTEMBRE 2026, et c'est un gain. Elle
 * était : « aucune colonne texte n'est exposée au tri » — une liste noire, dont
 * le motif (la base classe mal les accents) est devenu FAUX quand la collation
 * `fr-x-icu` a été posée. Elle est maintenant : **une colonne texte exposée au
 * tri doit être COLLATIONNÉE**, ou figurer ici avec sa raison. La condition est
 * testable, et elle restera vraie pour la colonne qu'on exposera demain.
 *
 * ⚠ `recordType` est le seul cas : chaîne LIBRE (défaut `'book'`, pas
 * d'énumération), non collationnée parce que ses valeurs sont un vocabulaire
 * ASCII minuscules — l'ordre des octets y coïncide avec l'ordre attendu. Le
 * test du vocabulaire du CODE le vérifie ; il ne peut rien garantir des valeurs
 * qu'un import produira. Limite assumée.
 */
const TRIS_TEXTE_NON_COLLATIONNES: Record<string, string> = {
  recordType: 'vocabulaire contrôlé, ASCII minuscules — ordre des octets = ordre attendu',
};

function colonnesTexteDeLaNotice(): Set<string> {
  const schema = readFileSync(join(__dirname, '../../prisma/schema.prisma'), 'utf-8');
  const modele = schema.slice(schema.indexOf('model BiblioRecord'));
  const corps = modele.slice(0, modele.indexOf('\n}'));
  const texte = new Set<string>();
  for (const ligne of corps.split('\n')) {
    // `champ  String` ou `champ  String?` — on ignore les relations et les
    // scalaires non textuels.
    //
    // ⚠ Le `(?=\s|$)` n'est pas une précaution : `title` et `author` ne portent
    // AUCUN attribut Prisma, leur ligne s'arrête juste après `String`. Une
    // version exigeant un espace de fin les manquait tous les deux — et le
    // relevé aurait alors conclu « aucune colonne texte exposée au tri »,
    // c'est-à-dire l'inverse de ce qu'il vérifie. C'est le témoin positif
    // ci-dessous qui l'a montré.
    const m = /^\s{2}(\w+)\s+String\??(?=\s|$)/.exec(ligne);
    if (m) texte.add(m[1]);
  }
  return texte;
}

describe('tri du catalogue — l’invariant de collation', () => {
  const colonnesTexte = colonnesTexteDeLaNotice();

  it('le relevé lit bien le schéma (témoin positif)', () => {
    // Sans ce témoin, un schéma mal découpé rendrait un ensemble VIDE et
    // l'invariant ci-dessous passerait au vert sans rien vérifier.
    expect(colonnesTexte.has('title')).toBe(true);
    expect(colonnesTexte.has('author')).toBe(true);
    expect(colonnesTexte.has('recordType')).toBe(true);
    expect(colonnesTexte.has('publishYear')).toBe(false); // Int, pas String
  });

  it('⚠ TOUTE colonne texte exposée au tri est COLLATIONNÉE, ou justifiée', () => {
    // C'est la règle qui remplace l'interdit. Exposer `title` au tri n'est
    // légitime QUE parce que `fr-x-icu` est posée dessus — et ce test est ce
    // qui relie les deux : retirer `title` de `COLONNES_COLLATIONNEES` le fait
    // tomber, au lieu de laisser un tri qui classe mal en silence.
    const collationnees = new Set(
      [...COLONNES_COLLATIONNEES, ...COLONNES_COLLATIONNEES_PUBLIC].map((c) => c.colonne),
    );
    const versSnake = (s: string) => s.replace(/[A-Z]/g, (l) => `_${l.toLowerCase()}`);
    const fautifs = TRIS_DISPONIBLES.filter(
      (t) =>
        colonnesTexte.has(t) &&
        !collationnees.has(versSnake(t)) &&
        !(t in TRIS_TEXTE_NON_COLLATIONNES),
    );
    expect(fautifs, 'colonnes texte triables ni collationnées ni justifiées').toEqual([]);
  });

  it('témoin : `title` et `author` SONT bien collationnées', () => {
    // Sans ce témoin, une conversion camelCase→snake_case cassée rendrait
    // l'ensemble vide et le test ci-dessus passerait sans rien vérifier.
    const collationnees = new Set(COLONNES_COLLATIONNEES.map((c) => c.colonne));
    expect(collationnees.has('title')).toBe(true);
    expect(collationnees.has('author')).toBe(true);
  });

  it('les colonnes non exposées le sont pour un motif qui N’EST PLUS la collation', () => {
    for (const refuse of Object.keys(TRIS_REFUSES)) {
      expect(TRIS_DISPONIBLES).not.toContain(refuse);
    }
    // ⚠ Le motif a changé, et le test l'exige : « la base classe mal les
    // accents » était vrai jusqu'au 11 septembre 2026 et ne l'est plus. Un
    // refus dont le motif est faux est un défaut — il fait renoncer à quelque
    // chose pour une raison qui n'existe pas.
    for (const motif of Object.values(TRIS_REFUSES)) {
      expect(motif).not.toMatch(/collation|accent/i);
      expect(motif).toMatch(/aucun écran/);
    }
    // Et le message d'erreur ne porte plus l'ancien motif.
    expect(MESSAGE_TRI_INVALIDE).not.toMatch(/accentu/);
    expect(MESSAGE_TRI_INVALIDE).toContain('Valeurs acceptées');
  });

  it('le vocabulaire de `recordType` écrit dans le code est en ASCII minuscules', () => {
    // La condition sous laquelle le tri sur `recordType` est juste. Ajouter
    // « Thèse » au vocabulaire ferait tomber ce test.
    //
    // ⚠ La liste est IMPORTÉE, plus lue par expression régulière dans le
    // service. La première version la cherchait dans le texte source de
    // `cataloging.service.ts` — parce qu'elle y était privée. Elle a déménagé
    // dans `description-profiles.ts` au lot P3-2, et le test est tombé : un
    // relevé textuel dépend de l'endroit où vit la déclaration, un import ne
    // dépend que de son nom.
    const valeurs: readonly string[] = [...DEFENSE_RECORD_TYPES, DEFAULT_RECORD_TYPE];
    expect(valeurs.length).toBeGreaterThan(0); // témoin : la liste n'est pas vide
    for (const v of valeurs) expect(v, v).toMatch(/^[a-z_]+$/);
  });
});

describe('tri du catalogue — ce que construireOrderBy rend', () => {
  it('trie par défaut sur la date de création, décroissant', () => {
    expect(construireOrderBy()).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    expect(TRI_PAR_DEFAUT).toBe('createdAt');
  });

  it('honore la colonne et le sens demandés', () => {
    expect(construireOrderBy('recordType', 'asc')).toEqual([
      { recordType: 'asc' },
      { id: 'asc' },
    ]);
  });

  it('⚠ TOUTE colonne nullable met ses vides EN DERNIER, dans les DEUX sens', () => {
    // Sinon la liste s'ouvre sur les notices dont on ignore la valeur :
    // Postgres place les NULL en tête d'un tri décroissant.
    //
    // ⚠ EXHAUSTIF SUR LES COLONNES NULLABLES, et non sur `publishYear` seule.
    // La version précédente ne couvrait que l'année : retirer `author` du
    // réglage ne faisait tomber AUCUN test, alors que `author` est
    // `String?` — les notices sans auteur auraient ouvert la liste. Troisième
    // fois aujourd'hui qu'une mutation muette révèle un test manquant plutôt
    // qu'un chemin mort.
    for (const tri of ['publishYear', 'author'] as const) {
      for (const sens of ['asc', 'desc'] as const) {
        expect(construireOrderBy(tri, sens)[0], `${tri} ${sens}`).toEqual({
          [tri]: { sort: sens, nulls: 'last' },
        });
      }
    }
  });

  it('témoin : une colonne NON nullable ne porte pas ce réglage', () => {
    // `title` est `String` (non nullable) : lui poser `nulls: 'last'` serait du
    // bruit, et ce témoin empêche d'étendre le réglage à tout par confort.
    expect(construireOrderBy('title', 'asc')[0]).toEqual({ title: 'asc' });
  });
});
