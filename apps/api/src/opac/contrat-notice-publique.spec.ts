import { describe, expect, it, vi } from 'vitest';
import { OpacService } from './opac.service';

/**
 * TEST DE CARACTÉRISATION — écrit AVANT le refactor de P3-4, et il décrit ce
 * que la route rend AUJOURD'HUI, ordre des clés compris.
 *
 * POURQUOI L'ORDRE. Le filet de comparaison compare des OCTETS : deux réponses
 * portant les mêmes clés dans un ordre différent ne sont pas identiques. Et
 * l'ordre n'est pas un détail cosmétique ici — c'est la seule chose qui
 * distingue « j'ai figé le contrat » de « j'ai reconstruit un objet qui
 * ressemble ».
 *
 * ⚠ ET IL COUVRE LA BRANCHE QUE LE FILET NE VOIT PAS. Le filet ne capture que
 * la surface ANONYME (`member = false`). La vue `member = true` est justement
 * celle que protège l'invariant I7 — les APK sur des téléphones. Elle n'est
 * pas comparable en HTTP sans fabriquer une session, ce qui est interdit ;
 * elle est donc éprouvée ICI, au niveau du service, où aucun jeton n'est requis.
 */
const LIGNE = {
  id: 'rec-1',
  marcData: {},
  marcFormat: 'UNIMARC',
  profile: 'bibliographique',
  recordType: 'ouvrage',
  title: 'Titre',
  titleComplement: null,
  author: 'Kaboré, Alain',
  isbn: 'EXEMPLE-1',
  publishYear: 2024,
  language: 'fr',
  publisher: null,
  publicationCity: null,
  defenseUniversity: null,
  defensePlace: null,
  summary: null,
  coverUrl: '/demo/couvertures/05.svg',
  category: 'litterature',
  createdAt: new Date('2026-09-10T20:42:51.871Z'),
  updatedAt: new Date('2026-09-10T20:49:45.080Z'),
  contributors: [{ id: 'c1', recordId: 'rec-1', name: 'Kaboré, Alain', role: 'AUTEUR_PRINCIPAL', position: 0, authorId: null }],
  keywords: [{ keyword: { name: 'conte' } }],
  items: [{ id: 'i1', barcode: 'EX-1', status: 'AVAILABLE' }],
  digitalCopy: { fileFormat: 'PDF', objectKey: 'secret/ne-doit-pas-sortir.pdf' },
};

function service() {
  const findUnique = vi.fn(async () => structuredClone(LIGNE));
  const db = { biblioRecord: { findUnique } } as never;
  return { db, service: new OpacService({} as never, {} as never, {} as never, {} as never) };
}

/** L'ordre EXACT servi à un visiteur anonyme, relevé sur l'API en service. */
const ORDRE_ANONYME = [
  'id', 'marcData', 'marcFormat', 'profile', 'recordType', 'title',
  'titleComplement', 'author', 'isbn', 'publishYear', 'language', 'publisher',
  'publicationCity', 'defenseUniversity', 'defensePlace', 'embargoUntil', 'summary', 'coverUrl',
  'category', 'createdAt', 'updatedAt', 'contributors', 'keywords',
  'items', 'availability', 'digitalCopy', 'membersOnly',
];

describe('contrat de /opac/records/:id — la forme servie est figée', () => {
  // ⚠ PASSÉ DE 26 À 27 CLÉS le 12 septembre 2026 : `embargoUntil` (P6-4) entre
  // au contrat. Ajout DÉLIBÉRÉ et additif — un client mobile qui ignore une clé
  // inconnue n'est pas affecté, et I7 tient. La date est SERVIE parce qu'une
  // notice dont le fichier refuse sans dire pourquoi serait le faux silencieux
  // qu'on corrige partout ailleurs : le lecteur conclurait à une panne.
  it('⚠ visiteur ANONYME : 27 clés, dans CET ordre', async () => {
    const { db, service: s } = service();
    const r = await s.recordDetail(db, 'rec-1', false);
    expect(Object.keys(r)).toEqual(ORDRE_ANONYME);
  });

  it('⚠ MEMBRE : la branche que protège I7, et que le filet ne voit pas', async () => {
    const { db, service: s } = service();
    const r = await s.recordDetail(db, 'rec-1', true);
    // Même jeu de clés que l'anonyme — c'est ce qui compte pour un APK qui
    // lit les deux vues sans savoir laquelle il reçoit.
    expect(Object.keys(r).sort()).toEqual([...ORDRE_ANONYME].sort());
  });

  it('l’anonyme ne reçoit NI exemplaires NI copie numérique', async () => {
    const { db, service: s } = service();
    const r = (await s.recordDetail(db, 'rec-1', false)) as Record<string, unknown>;
    expect(r.items).toEqual([]);
    expect(r.digitalCopy).toBeNull();
    expect(r.availability).toBeNull();
    expect(r.membersOnly).toBe(true);
  });

  it('⚠ la clé objet du fichier ne sort JAMAIS, même au membre', async () => {
    // Le format seulement — jamais l'URL ni la clé objet : celles-là passent
    // par /read, avec contrôle d'accès et URL signée à expiration.
    const { db, service: s } = service();
    const r = (await s.recordDetail(db, 'rec-1', true)) as Record<string, unknown>;
    expect(JSON.stringify(r)).not.toContain('ne-doit-pas-sortir');
    expect(r.digitalCopy).toEqual({ fileFormat: 'PDF' });
  });

  it('les mots-clés sont aplatis en chaînes', async () => {
    const { db, service: s } = service();
    const r = (await s.recordDetail(db, 'rec-1', true)) as Record<string, unknown>;
    expect(r.keywords).toEqual(['conte']);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// LE GARDE-FOU — ce pour quoi le lot existe.
//
// Avant, toute colonne ajoutée à BiblioRecord partait automatiquement vers tous
// les clients, téléphones compris : `profile`, ajouté par la migration P0,
// était servi sans qu'aucune décision ne le prévoie. I7 protège contre les
// retraits ; rien ne protégeait contre les ajouts.
//
// Désormais une colonne doit être CLASSÉE — servie ou délibérément non servie —
// sinon ce test échoue. On ne peut plus élargir le contrat par inadvertance.
// ════════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CLES_DU_CONTRAT,
  COLONNES_SERVIES,
  COLONNES_LUES_NON_SERVIES,
  NON_SERVIS,
  RELATIONS_SERVIES,
  RELATION_PROJETEE,
  selectNoticePublique,
} from './contrat-notice-publique';

const SCHEMA = readFileSync(
  join(__dirname, '..', '..', 'prisma', 'schema.prisma'),
  'utf-8',
);

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

describe('contrat public — une colonne ne s’y glisse plus toute seule', () => {
  const duModele = champsDuModele('BiblioRecord');
  // `string[]` explicite : les listes sont des tuples de littéraux, et
  // `includes(champDuSchéma)` ne compile pas contre une union de littéraux.
  const classes: string[] = [
    ...COLONNES_SERVIES,
    ...RELATIONS_SERVIES,
    RELATION_PROJETEE,
    ...NON_SERVIS,
  ];

  it('le schéma est bien lu (témoin positif)', () => {
    expect(duModele.length).toBeGreaterThan(20);
    expect(duModele).toContain('marcData');
  });

  it('⚠ AUCUN champ du modèle n’échappe au classement', () => {
    // Une colonne ajoutée sans être classée fait tomber CE test — et c'est
    // tout l'objet du lot : la servir ou l'exclure devient une décision.
    const orphelins = duModele.filter((c) => !classes.includes(c));
    expect(orphelins, 'colonnes ni servies ni exclues explicitement').toEqual([]);
  });

  it('le contrat n’invente aucun champ', () => {
    const inventes = classes.filter((c) => !duModele.includes(c));
    expect(inventes, 'champs déclarés absents du modèle').toEqual([]);
  });

  it('un champ n’est pas à la fois servi et exclu', () => {
    const doubles = classes.filter((c, i) => classes.indexOf(c) !== i);
    expect(doubles).toEqual([]);
  });

  it('⚠ le `select` est DÉRIVÉ du contrat, jamais écrit deux fois', () => {
    // Deux listes à tenir d'accord finiraient par diverger, et la divergence
    // serait invisible : la route rendrait moins que le contrat annoncé.
    const select = selectNoticePublique();
    for (const colonne of COLONNES_SERVIES) expect(select).toHaveProperty(colonne);
    for (const relation of RELATIONS_SERVIES) expect(select).toHaveProperty(relation);
    expect(select).toHaveProperty(RELATION_PROJETEE);
    // ⚠ P3-3 : « exclu de la RÉPONSE » ne veut plus dire « pas LU en base ».
    // `profileData` doit être chargé — il porte les trois champs de profil —
    // sans jamais sortir. Les deux notions ont donc deux listes, et ce test
    // vérifie la bonne de chaque côté.
    const luesNonServies = new Set<string>(COLONNES_LUES_NON_SERVIES);
    for (const exclu of NON_SERVIS) {
      if (luesNonServies.has(exclu)) expect(select).toHaveProperty(exclu);
      else expect(select).not.toHaveProperty(exclu);
    }
  });

  it('⚠ une colonne LUE NON SERVIE est lue, et n’apparaît PAS dans la réponse', () => {
    // L'invariant du couple. Si `profileData` entrait dans la réponse, le
    // mobile recevrait une clé de plus et les mêmes valeurs deux fois — I7
    // cassé par un effet de bord de l'extraction, pas par une décision.
    expect(COLONNES_LUES_NON_SERVIES.length).toBeGreaterThan(0); // témoin
    for (const colonne of COLONNES_LUES_NON_SERVIES) {
      expect(selectNoticePublique()).toHaveProperty(colonne);
      expect(CLES_DU_CONTRAT, `${colonne} ne doit pas être servie`).not.toContain(colonne);
      expect(NON_SERVIS, `${colonne} doit être déclarée non servie`).toContain(colonne);
    }
  });

  it('l’ordre déclaré est celui que la route rend', async () => {
    const { db, service: s } = service();
    const r = await s.recordDetail(db, 'rec-1', false);
    expect(Object.keys(r)).toEqual(CLES_DU_CONTRAT);
  });

  it('⚠ la clé objet du fichier n’est même pas LUE en base', () => {
    // Ce qu'on ne lit pas ne peut pas fuir : le select ne demande que le format.
    const select = selectNoticePublique() as unknown as Record<string, { select?: unknown }>;
    expect(select.digitalCopy.select).toEqual({ fileFormat: true });
  });
});
