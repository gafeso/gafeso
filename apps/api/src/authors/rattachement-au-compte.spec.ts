import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AuthorsService } from './authors.service';

/**
 * LE RATTACHEMENT D'UNE FICHE D'AUTORITÉ À UN COMPTE — P6-3.
 *
 * ⚠ POURQUOI CE FICHIER EXISTE. `Author.userId` a été posée en P6-1 « pour que
 * Mes encadrements soit calculable ». Mesuré le 12 septembre 2026 sur les deux
 * écoles de développement : **zéro** fiche rattachée, et **aucune écriture** de
 * ce champ dans tout `apps/api`. L'écran aurait répondu « votre compte n'est
 * relié à aucune fiche » à tout le monde, pour toujours.
 *
 * C'est « une méthode câblée à rien » prise par l'autre bout : une COLONNE sans
 * écrivain. Un inventaire de routes ne la voit pas — elle n'est dans aucune —,
 * un inventaire de colonnes non plus — elle existe bien. Seule la question
 * « QUI écrit ceci ? » la trouve.
 */

function service(fiche: unknown, compte: unknown = null, dejaRattachee: unknown = null) {
  const update = vi.fn(async (a: { where: unknown; data: unknown }) => ({
    ...(a.data as object),
    displayName: 'Zongo, Pauline',
  }));
  const findUniqueAuthor = vi.fn(async (a: { where: { id?: string; userId?: string } }) =>
    a.where.userId !== undefined ? dejaRattachee : fiche,
  );
  const db = {
    author: { findUnique: findUniqueAuthor, update },
    user: { findUnique: vi.fn(async () => compte) },
  } as never;
  return { svc: new AuthorsService(), db, update, findUniqueAuthor };
}

const FICHE = { id: 'a1', displayName: 'Zongo, Pauline' };
const COMPTE = { id: 'u1', firstName: 'Pauline', lastName: 'Zongo' };

describe('⚠ LA COLONNE A ENFIN UN ÉCRIVAIN', () => {
  it('rattache la fiche au compte', async () => {
    const { svc, db, update } = service(FICHE, COMPTE);
    await svc.rattacherAuCompte(db, 'a1', 'u1');
    expect(update.mock.calls[0][0]).toEqual({ where: { id: 'a1' }, data: { userId: 'u1' } });
  });

  it('⚠ et le DÉTACHEMENT existe : ce qui se pose doit se défaire', async () => {
    // Un rattachement erroné attribue à quelqu'un les encadrements d'un
    // homonyme, et l'écran qui en découle sert un dossier de promotion.
    const { svc, db, update } = service(FICHE);
    await svc.rattacherAuCompte(db, 'a1', null);
    expect(update.mock.calls[0][0]).toEqual({ where: { id: 'a1' }, data: { userId: null } });
  });

  it('⚠ détacher n’interroge PAS les comptes — `null` n’est pas un identifiant', async () => {
    const { svc, db } = service(FICHE);
    await svc.rattacherAuCompte(db, 'a1', null);
    const users = (db as unknown as { user: { findUnique: ReturnType<typeof vi.fn> } }).user;
    expect(users.findUnique).not.toHaveBeenCalled();
  });

  it('une fiche inexistante est « introuvable »', async () => {
    const { svc, db } = service(null);
    await expect(svc.rattacherAuCompte(db, 'a-fantome', 'u1')).rejects.toThrow(NotFoundException);
  });

  it('⚠ un compte d’une AUTRE école ne se trouve pas — l’isolation tient au SCHÉMA', async () => {
    // Le compte est cherché dans le client de l'école. Un identifiant venu
    // d'ailleurs ne s'y trouve pas : l'isolation ne repose donc sur aucune
    // vérification qu'on pourrait oublier d'écrire.
    const { svc, db } = service(FICHE, null);
    await expect(svc.rattacherAuCompte(db, 'a1', 'u-ailleurs')).rejects.toThrow(
      /n’existe pas dans cet établissement/i,
    );
  });

  it('⚠ UN COMPTE, UNE FICHE — et le refus NOMME celle qui est déjà rattachée', async () => {
    // Sans le nom, la personne cherche une erreur de saisie là où il y a un
    // rattachement à défaire.
    const { svc, db } = service(FICHE, COMPTE, { id: 'a2', displayName: 'Zongo, P.' });
    await expect(svc.rattacherAuCompte(db, 'a1', 'u1')).rejects.toThrow(/« Zongo, P. »/);
  });

  it('rattacher la MÊME fiche au MÊME compte est idempotent, pas un conflit', async () => {
    const { svc, db, update } = service(FICHE, COMPTE, { id: 'a1', displayName: 'Zongo, Pauline' });
    await expect(svc.rattacherAuCompte(db, 'a1', 'u1')).resolves.toBeTruthy();
    expect(update).toHaveBeenCalled();
  });
});

describe('⚠ LE GARDE : `Author.userId` ne doit jamais redevenir une colonne sans écrivain', () => {
  const SERVICE = readFileSync(join(__dirname, 'authors.service.ts'), 'utf8');
  const CONTROLEUR = readFileSync(join(__dirname, 'authors-admin.controller.ts'), 'utf8');

  it('⚠ le service porte EXACTEMENT une écriture de `userId`, et c’est celle-ci', () => {
    // ⚠ TÉMOIN QUI COMPTE. « Au moins une » confirmerait que le relevé tourne ;
    // seul un compte exact signale une seconde écriture ajoutée ailleurs — par
    // exemple un rattachement automatique par NOM, qui rattacherait les
    // homonymes en silence.
    const ecritures = [...SERVICE.matchAll(/data:\s*\{[^}]*userId/g)];
    expect(ecritures.length).toBe(2); // le rattachement et le détachement
  });

  it('⚠ et une ROUTE l’expose — sinon la méthode serait câblée à rien', () => {
    // La faute symétrique, et elle a déjà été commise dans ce dépôt le
    // 11 septembre : une méthode de service écrite, correcte, documentée, et
    // reliée à aucune route.
    expect(CONTROLEUR).toContain("@Patch(':id/compte')");
    expect(CONTROLEUR).toContain('this.authors.rattacherAuCompte(');
  });

  it('⚠ le rattachement est TRACÉ — il décide de qui signe une pièce de dossier', () => {
    expect(CONTROLEUR).toContain('AUDIT_ACTIONS.AUTHOR_ACCOUNT_LINK');
  });
});

describe('⚠ LA FICHE D’AUTORITÉ : trois champs servis que personne ne pouvait remplir', () => {
  // ⚠ TROISIÈME COLONNE SANS ÉCRIVAIN du 12 septembre 2026, après
  // `Author.userId` et `embargoUntil` — et celle-ci était SERVIE : `GET
  // /authors/:id` rend `bio`, `birthYear` et `deathYear` depuis toujours.
  // L'écran d'une fiche d'autorité affichait trois cases vides à jamais, et
  // c'est précisément ce qu'un fichier d'autorités existe pour porter.

  function service(auteur: Record<string, unknown>) {
    const update = vi.fn(async (a: { where: unknown; data: Record<string, unknown> }) => a);
    const db = {
      author: { findUnique: vi.fn(async () => auteur), update },
      recordContributor: { findMany: vi.fn(async () => []), updateMany: vi.fn(async () => ({})) },
    } as never;
    return { svc: new AuthorsService(), db, update };
  }

  const FICHE_NUE = { id: 'a1', displayName: 'Zongo, Pauline', bio: null, birthYear: null, deathYear: null };

  it('les trois champs atteignent la charge d’écriture', async () => {
    const { svc, db, update } = service(FICHE_NUE);
    await svc.rename(db, 'a1', 'Zongo, Pauline', {
      bio: '  Juriste, spécialiste du foncier rural.  ',
      birthYear: 1948,
      deathYear: 2019,
    });
    expect(update.mock.calls[0][0].data).toMatchObject({
      bio: 'Juriste, spécialiste du foncier rural.',
      birthYear: 1948,
      deathYear: 2019,
    });
  });

  it('⚠ `null` EFFACE, un champ ABSENT laisse — les deux sont nécessaires', async () => {
    // Sans la distinction, une date entrée par erreur ne se corrige plus.
    const { svc, db, update } = service({ ...FICHE_NUE, birthYear: 1948 });
    await svc.rename(db, 'a1', 'Zongo, Pauline', { birthYear: null });
    expect(update.mock.calls[0][0].data.birthYear).toBeNull();

    await svc.rename(db, 'a1', 'Zongo, Pauline', {});
    expect(update.mock.calls[1][0].data.birthYear).toBeUndefined();
  });

  it('une notice biographique vide vaut EFFACEMENT, pas chaîne vide', async () => {
    const { svc, db, update } = service(FICHE_NUE);
    await svc.rename(db, 'a1', 'Zongo, Pauline', { bio: '   ' });
    expect(update.mock.calls[0][0].data.bio).toBeNull();
  });

  it('⚠ décès AVANT naissance est refusé', async () => {
    const { svc, db } = service(FICHE_NUE);
    await expect(
      svc.rename(db, 'a1', 'Zongo, Pauline', { birthYear: 2019, deathYear: 1948 }),
    ).rejects.toThrow(/précède l’année de naissance/);
  });

  it('⚠ et la règle porte sur l’ÉTAT FINAL, pas sur le corps de la requête', async () => {
    // Un PATCH qui ne pose QUE le décès doit être confronté à la naissance déjà
    // en base — sinon la règle ne vaut que pour les fiches saisies d'un coup, et
    // une fiche « morte avant d'être née » entre par le chemin partiel.
    const { svc, db } = service({ ...FICHE_NUE, birthYear: 2019 });
    await expect(
      svc.rename(db, 'a1', 'Zongo, Pauline', { deathYear: 1948 }),
    ).rejects.toThrow(/précède l’année de naissance/);
  });

  it('⚠ TOUT champ du DTO est TRANSMIS par le contrôleur — l’autre porte', () => {
    // ⚠ CE CAS EXISTE PARCE QU'UN CONTRÔLE NÉGATIF NE TOMBAIT PAS. Retirer les
    // trois champs de l'appel du contrôleur laissait la suite verte : le
    // service était éprouvé, la TRANSMISSION ne l'était pas. Un champ déclaré,
    // validé, accepté — et jeté avant d'atteindre le service. La saisie
    // réussirait, et rien ne serait écrit.
    //
    // L'invariant plutôt que les trois cas : le quatrième champ ajouté demain
    // est couvert sans que personne y pense.
    const dto = readFileSync(join(__dirname, 'dto', 'authors-admin.dto.ts'), 'utf8');
    const controleur = readFileSync(join(__dirname, 'authors-admin.controller.ts'), 'utf8');

    const bloc = dto.slice(dto.indexOf('export class RenameAuthorDto'));
    const champs = [...bloc.slice(0, bloc.indexOf('\n}')).matchAll(/^\s{2}(\w+)[!?]?\s*:/gm)].map(
      (m) => m[1],
    );
    expect(champs.sort(), 'le relevé du DTO ne trouve rien').toEqual([
      'bio',
      'birthYear',
      'deathYear',
      'displayName',
    ]);
    for (const c of champs) {
      expect(controleur, `${c} est déclaré au DTO mais le contrôleur ne le transmet pas`).toContain(
        `dto.${c}`,
      );
    }
  });

  it('la même année pour les deux est acceptée', async () => {
    // Naître et mourir la même année est rare, pas impossible.
    const { svc, db } = service(FICHE_NUE);
    await expect(
      svc.rename(db, 'a1', 'Zongo, Pauline', { birthYear: 1948, deathYear: 1948 }),
    ).resolves.toBeTruthy();
  });
});
