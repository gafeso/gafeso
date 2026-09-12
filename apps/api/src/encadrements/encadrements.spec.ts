import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { EncadrementsService, ROLE_DIRECTEUR } from './encadrements.service';
import { CONTRIBUTOR_ROLES } from '../cataloging/contributor-roles';
import { FONCTIONS } from '../auth/functions';

/**
 * « MES ENCADREMENTS » — P6-3, versant données.
 *
 * ⚠ DEUX PROPRIÉTÉS PORTENT CE LOT, et les deux sont écrites en assertions
 * plutôt qu'en intentions :
 *
 * **1. L'AUTO-PORTAGE.** C'est lui qui décide qu'aucune fonction nouvelle n'est
 * exigée : la route ne rend que des données sur l'appelant, et il n'existe
 * aucun chemin pour lui en faire rendre d'autres. Le jour où cette propriété
 * tombe, la décision de permission tombe avec elle — donc elle se teste, et le
 * test dit pourquoi.
 *
 * **2. TROIS ÉTATS, PAS DEUX.** « Aucun encadrement » et « votre compte n'est
 * relié à aucune fiche d'auteur » sont deux choses. Un enseignant qui a dirigé
 * quinze thèses mais dont le compte n'est pas rattaché lirait « vous n'avez
 * encadré aucun mémoire » sur l'écran qui sert à monter son dossier de
 * promotion — et il n'a aucun moyen de le corriger lui-même.
 */

const FICHE = { id: 'a-zongo', displayName: 'Zongo, Moussa' };

function notice(n: {
  id: string;
  title: string;
  annee?: number | null;
  type?: string;
  etudiant?: string | null;
}) {
  return {
    record: {
      id: n.id,
      title: n.title,
      recordType: n.type ?? 'these',
      publishYear: n.annee ?? 2024,
      defenseUniversity: 'Université Joseph Ki-Zerbo',
      contributors: n.etudiant === null ? [] : [{ name: n.etudiant ?? 'Traoré, Awa' }],
    },
  };
}

/**
 * ⚠ LES DOUBLURES DÉCLARENT LEUR ARGUMENT, sinon `mock.calls[0]` est typé `[]`
 * et les assertions sur le `where` transmis ne compilent pas — alors que la
 * suite, elle, passerait. Une suite verte ne dit rien des types.
 */
interface AppelPrisma {
  where?: unknown;
  orderBy?: Record<string, unknown>[];
  skip?: number;
  take?: number;
}

function service(fiche: typeof FICHE | null, lignes: ReturnType<typeof notice>[] = []) {
  const findUniqueAuthor = vi.fn(async (_a: AppelPrisma) => fiche);
  const findMany = vi.fn(async (_a: AppelPrisma) => lignes);
  const count = vi.fn(async (_a: AppelPrisma) => lignes.length);
  const db = {
    author: { findUnique: findUniqueAuthor },
    recordContributor: { findMany, count },
  } as never;
  return { svc: new EncadrementsService(), db, findUniqueAuthor, findMany, count };
}

describe('⚠ AUTO-PORTAGE — la propriété qui décide de la permission', () => {
  it('la fiche est cherchée par l’identifiant de L’APPELANT, jamais par un nom', async () => {
    // ⚠ PAR `userId`, PAS PAR NOM. Chercher par nom rattacherait les homonymes,
    // et un homonyme dans un dossier de promotion est une faute qu'on ne
    // rattrape pas. `Author.userId` est UNIQUE depuis P6-1 : une personne, une
    // fiche.
    const { svc, db, findUniqueAuthor } = service(FICHE);
    await svc.mesEncadrements(db, 'u-moi');
    expect(findUniqueAuthor.mock.calls[0][0].where).toEqual({ userId: 'u-moi' });
  });

  it('⚠ les contributions sont filtrées sur SA fiche ET sur le rôle de directeur', async () => {
    const { svc, db, findMany, count } = service(FICHE, [notice({ id: 'r1', title: 'A' })]);
    await svc.mesEncadrements(db, 'u-moi');

    const attendu = { authorId: 'a-zongo', role: ROLE_DIRECTEUR };
    expect(findMany.mock.calls[0][0].where).toEqual(attendu);
    // ⚠ LE MÊME `where` SERT AU COMPTAGE : deux `where` divergents donnent un
    // `total` qui ne correspond pas aux lignes rendues, et l'écran affiche un
    // nombre de pages qu'il ne peut pas atteindre.
    expect(count.mock.calls[0][0].where).toEqual(attendu);
  });

  it('la fonction existe au catalogue et porte le nom attendu', () => {
    expect(FONCTIONS.ENCADREMENTS_VOIR).toBe('encadrements.voir');
  });

  it('⚠ le rôle filtré est bien celui du vocabulaire, pas une chaîne écrite à côté', () => {
    // Un `role: 'DIRECTEUR'` recopié de mémoire rendrait une liste vide sans
    // qu'aucune erreur ne soit levée — l'écran dirait « aucun encadrement » à
    // tout le monde, pour toujours.
    expect(CONTRIBUTOR_ROLES as readonly string[]).toContain(ROLE_DIRECTEUR);
  });

  it('⚠ AUCUN chemin ne permet de demander les encadrements d’un AUTRE', () => {
    // L'invariant, pas les cas : le contrôleur ne lit l'identité QUE du jeton.
    // S'il gagnait un jour un `@Param('userId')` ou un `@Query('directeur')`,
    // la route cesserait d'être auto-portée — et la décision de ne réclamer
    // aucune fonction, prise SUR cette propriété, deviendrait fausse en
    // silence.
    // ⚠ LE MOTIF ÉQUILIBRE LES PARENTHÈSES. La première écriture était
    // `\(([^)]*)\)` : elle s'arrêtait au premier `)` rencontré, donc sur
    // `this.db(tenant`, et ne voyait JAMAIS `user.sub`. Un instrument qui
    // cherche un motif dans du code doit savoir qu'il y a des appels
    // imbriqués — sinon il conclut sur un fragment.
    const source = readFileSync(join(__dirname, 'encadrements.controller.ts'), 'utf8');
    const appels = [
      ...source.matchAll(/this\.encadrements\.\w+\(((?:[^()]|\([^()]*\))*)\)/g),
    ].map((m) => m[1]);
    expect(appels.length, 'deux appels attendus : la liste et l’export').toBe(2);
    for (const args of appels) {
      expect(args, args).toContain('user.sub');
    }
    expect(source).not.toMatch(/@Param\(/);
    expect(source).not.toMatch(/userId|directeurId|encadrantId/);
  });
});

describe('⚠ LA FONCTION — `encadrements.voir`, décision de Jean', () => {
  const SOURCE = readFileSync(join(__dirname, 'encadrements.controller.ts'), 'utf8');

  it('⚠ elle est exigée AU NIVEAU DU CONTRÔLEUR, pas route par route', () => {
    // ⚠ L'INVARIANT PLUTÔT QUE LES CAS. Posée sur le contrôleur, elle couvre la
    // troisième route écrite demain par quelqu'un qui n'aura pas lu ceci.
    // Posée route par route, elle serait juste aujourd'hui et oubliée une fois.
    const enTete = SOURCE.slice(0, SOURCE.indexOf('export class'));
    expect(enTete).toContain('@RequiresFunctions(FONCTIONS.ENCADREMENTS_VOIR)');
    expect(enTete).toContain('@UseGuards(JwtAuthGuard, FunctionsGuard)');
  });

  it('⚠ et AUCUNE route ne la redéclare plus étroitement ni plus largement', () => {
    // Un `@RequiresFunctions` sur une méthode REMPLACE celui de la classe. Une
    // route qui en porterait un autre sortirait de la garantie sans que la
    // ligne d'en-tête cesse d'être vraie — « qu'est-ce qui reste écrit sans
    // plus être vrai ? ».
    const corps = SOURCE.slice(SOURCE.indexOf('export class'));
    expect(corps).not.toContain('@RequiresFunctions');
  });
});

describe('⚠ TROIS ÉTATS, et le troisième est celui qui coûte', () => {
  it('compte NON RELIÉ : `ficheLiee: false`, et pas « aucun encadrement »', async () => {
    const { svc, db, findMany } = service(null);
    const r = await svc.mesEncadrements(db, 'u-sans-fiche');

    expect(r.ficheLiee).toBe(false);
    expect(r.total).toBe(0);
    expect(r.encadrements).toEqual([]);
    // ⚠ Et on n'interroge même pas les contributions : sans fiche, la question
    // n'a pas de sens. Une requête sur `authorId: undefined` rendrait TOUTES
    // les contributions de l'école.
    expect(findMany).not.toHaveBeenCalled();
  });

  it('compte relié SANS encadrement : `ficheLiee: true`, total 0', async () => {
    const { svc, db } = service(FICHE, []);
    const r = await svc.mesEncadrements(db, 'u-moi');

    expect(r.ficheLiee).toBe(true);
    expect(r.nomDeLaFiche).toBe('Zongo, Moussa');
    expect(r.total).toBe(0);
  });

  it('compte relié AVEC encadrements : la liste, et l’étudiant est l’auteur principal', async () => {
    const { svc, db } = service(FICHE, [
      notice({ id: 'r1', title: 'Le droit foncier rural', annee: 2025, etudiant: 'Traoré, Awa' }),
    ]);
    const r = await svc.mesEncadrements(db, 'u-moi');

    expect(r.ficheLiee).toBe(true);
    expect(r.encadrements).toEqual([
      {
        recordId: 'r1',
        titre: 'Le droit foncier rural',
        type: 'these',
        annee: 2025,
        etudiant: 'Traoré, Awa',
        universiteDeSoutenance: 'Université Joseph Ki-Zerbo',
      },
    ]);
  });

  it('une notice SANS auteur principal rend `etudiant: null`, pas une chaîne vide', async () => {
    // `null` dit « la notice n'en porte pas » ; `''` se lit comme un nom vide,
    // et s'affiche comme une ligne dont l'étudiant a disparu.
    const { svc, db } = service(FICHE, [notice({ id: 'r1', title: 'A', etudiant: null })]);
    const r = await svc.mesEncadrements(db, 'u-moi');
    expect(r.encadrements[0].etudiant).toBeNull();
  });
});

describe('⚠ La pagination — et le contrat qui l’annonce', () => {
  it('`totalPages` vaut 1 sur une liste vide, jamais 0', async () => {
    // « Page 1 sur 0 » est une phrase qu'aucun écran ne sait afficher.
    const { svc, db } = service(FICHE, []);
    expect((await svc.mesEncadrements(db, 'u-moi')).totalPages).toBe(1);
  });

  it('⚠ l’ordre DÉPARTAGE : l’année seule laisse des ex æquo', async () => {
    // Sans départage, deux pages voisines se recouvrent en en sautant d'autres,
    // et rien ne le signale. C'est l'invariant de `pagination-departagee`.
    const { svc, db, findMany } = service(FICHE, []);
    await svc.mesEncadrements(db, 'u-moi', { page: 2, limit: 10 });

    const appel = findMany.mock.calls[0][0];
    expect(appel.skip).toBe(10);
    expect(appel.orderBy?.at(-1)).toEqual({ id: 'asc' });
  });
});

describe('⚠ L’EXPORT — la pièce du dossier', () => {
  it('porte le BOM et les six en-têtes attendus', async () => {
    const { svc, db } = service(FICHE, [notice({ id: 'r1', title: 'A' })]);
    const csv = await svc.mesEncadrementsCsv(db, 'u-moi');

    expect(csv.charCodeAt(0)).toBe(0xfeff); // sans lui, Excel mange les accents
    expect(csv.slice(1).split('\r\n')[0]).toBe(
      'Année;Étudiant;Titre;Type;Établissement de soutenance;Identifiant',
    );
  });

  it('⚠ il n’est PAS paginé — une pièce tronquée sans le dire serait un faux', async () => {
    const { svc, db, findMany } = service(FICHE, [notice({ id: 'r1', title: 'A' })]);
    await svc.mesEncadrementsCsv(db, 'u-moi');

    const appel = findMany.mock.calls[0][0];
    expect(appel.skip).toBeUndefined();
    expect(appel.take).toBeUndefined();
  });

  it('⚠ compte NON RELIÉ : le fichier DIT pourquoi, il n’est pas vide', async () => {
    // Un CSV à en-têtes seules se lit « cette personne n'a rien encadré » —
    // précisément ce qu'on ne sait pas. Et il part dans un dossier.
    const { svc, db } = service(null);
    const csv = await svc.mesEncadrementsCsv(db, 'u-sans-fiche');

    expect(csv).toMatch(/reli[ée] à aucune fiche/i);
    expect(csv).not.toContain('Établissement de soutenance');
  });

  it('un titre contenant le séparateur est échappé, pas coupé en deux colonnes', async () => {
    const { svc, db } = service(FICHE, [
      notice({ id: 'r1', title: 'Droit foncier ; le cas du Burkina' }),
    ]);
    const csv = await svc.mesEncadrementsCsv(db, 'u-moi');
    expect(csv).toContain('"Droit foncier ; le cas du Burkina"');
  });
});
