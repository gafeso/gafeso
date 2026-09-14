import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ValidationPipe } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { AuthorsListDto } from '../authors/dto/authors-admin.dto';
import { ListRecordsDto } from '../cataloging/dto/list-records.dto';
import { ListPatronsDto, PatronLoansDto } from '../patrons/dto/patron.dto';
import { AuditQueryDto } from '../audit/dto/audit-query.dto';
import { ReminderLogQueryDto } from '../reminders/dto/reminder-log-query.dto';
import { ListAccountsDto } from '../accounts/dto/list-accounts.dto';
import { AuthorsIndexDto } from '../opac/dto/authors-index.dto';
import { ParcourirDto } from '../opac/dto/parcourir.dto';
import { OpacSearchDto } from '../opac/dto/opac-search.dto';
import { ReaderLoansQueryDto } from '../reader/dto/reader-loans-query.dto';
import { MesEncadrementsDto } from '../encadrements/dto/mes-encadrements.dto';
import { PaginationMoissonnageDto } from '../moissonnage/dto/source.dto';

/**
 * UNE RÉPONSE QUI ANNONCE UN PARCOURS DOIT L'ACCEPTER.
 *
 * ## D'où vient ce test
 *
 * `GET /authors` rendait `total`, `page` et `totalPages`, et REFUSAIT le
 * paramètre : `?page=2` → `400 property page should not exist`, parce que le
 * DTO ne le déclarait pas et que le pipe global porte
 * `forbidNonWhitelisted: true`. Le service, lui, paginait depuis toujours.
 *
 * ⚠ CE DÉFAUT NE LÈVE AUCUNE ERREUR ET NE SE VOIT PAS SUR UN PETIT FONDS. La
 * réponse est bien formée, elle est seulement INCOMPLÈTE en silence : l'écran
 * des auteurs montrait 200 fiches sur 278 dans l'école de démonstration, sans
 * compteur et sans un mot. Il a fallu un fonds de 8 000 notices pour qu'on aille
 * regarder — et le défaut tenait à deux cent soixante-dix-huit auteurs.
 *
 * ⚠ ET LA PREMIÈRE CORRECTION DU FRONT A ÉTÉ PIRE QUE LE DÉFAUT : croyant la
 * route paginée puisqu'elle annonce `totalPages`, l'écran a envoyé `page=1` et
 * affiché *property page should not exist* à la place de la liste. Une réponse
 * qui décrit un parcours inexistant n'induit pas seulement en erreur : elle
 * INVITE à un geste qui casse.
 *
 * ## Ce que ce test porte, et ce qu'il ne porte pas
 *
 * Il porte l'INVARIANT, pas le cas. Un test « le DTO des auteurs accepte page »
 * aurait couvert ce qu'on savait déjà ce soir ; celui-ci couvre la onzième
 * route paginée, écrite demain par quelqu'un qui n'aura jamais entendu parler
 * de cette histoire.
 */

/**
 * Pour chaque service qui ANNONCE un parcours (sa réponse porte `totalPages`),
 * le DTO de la route qui l'expose et le nom du paramètre de page.
 *
 * ⚠ `reader` utilise `historyPage` et non `page`, et c'est légitime : sa
 * réponse porte plusieurs listes, dont une seule est paginée. Le nom du
 * paramètre n'est donc pas l'invariant — l'invariant est qu'il EXISTE et qu'il
 * soit accepté.
 */
const PARCOURS_ANNONCES: { service: string; dto: new () => object; parametre: string }[] = [
  { service: 'cataloging/cataloging.service.ts', dto: ListRecordsDto, parametre: 'page' },
  { service: 'patrons/patrons.service.ts', dto: ListPatronsDto, parametre: 'page' },
  { service: 'patrons/patrons.service.ts', dto: PatronLoansDto, parametre: 'page' },
  { service: 'audit/audit.service.ts', dto: AuditQueryDto, parametre: 'page' },
  { service: 'reminders/reminders.service.ts', dto: ReminderLogQueryDto, parametre: 'page' },
  { service: 'authors/authors.service.ts', dto: AuthorsListDto, parametre: 'page' },
  { service: 'accounts/accounts.service.ts', dto: ListAccountsDto, parametre: 'page' },
  { service: 'opac/opac.service.ts', dto: AuthorsIndexDto, parametre: 'page' },
  { service: 'opac/opac.service.ts', dto: ParcourirDto, parametre: 'page' },
  { service: 'opac/opac.service.ts', dto: OpacSearchDto, parametre: 'page' },
  { service: 'reader/reader.service.ts', dto: ReaderLoansQueryDto, parametre: 'historyPage' },
  { service: 'encadrements/encadrements.service.ts', dto: MesEncadrementsDto, parametre: 'page' },
  // ⚠ DEUX PARCOURS DE PLUS (P7-1) : les comptes rendus d'une source et ses
  // collisions. Le compte a fait son office — il a obligé à vérifier que le
  // DTO accepte bien `page`, c'est-à-dire que ces routes n'annoncent pas un
  // parcours qu'elles refuseraient, comme `/authors` l'a fait.
  { service: 'moissonnage/moissonnage.service.ts', dto: PaginationMoissonnageDto, parametre: 'page' },
];

/**
 * Fichiers qui rendent `totalPages` sans exposer de route — exceptions
 * MOTIVÉES, et le test ci-dessous refuse celles qui deviendraient périmées.
 */
const SANS_ROUTE: Record<string, string> = {
  'search/search-engine.ts': 'le contrat du moteur, pas une réponse HTTP',
  'search/meilisearch.engine.ts': 'adaptateur de moteur',
  'search/elasticsearch.engine.ts': 'adaptateur de moteur',
};

/** Le pipe RÉEL de l'application — c'est lui qui refusait `page`. */
const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });

/**
 * Retire les commentaires avant de chercher.
 *
 * ⚠ SANS ÇA, L'INSTRUMENT SE TROMPE, ET IL S'EST TROMPÉ SUR SES DEUX PREMIERS
 * FICHIERS. Les commentaires écrits ce soir dans `authors-admin.dto.ts` et
 * `authors-admin.controller.ts` EXPLIQUENT le défaut, donc ils citent
 * `totalPages` — et le relevé les a signalés comme des parcours non déclarés.
 * Un détecteur qui signale du code correct se fait désactiver, et ne sert plus
 * le jour où il a raison : on corrige l'instrument, on n'ajoute pas d'exception.
 */
function sansCommentaires(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');
}

function fichiersAnnoncantUnParcours(): string[] {
  const racine = join(__dirname, '..');
  const trouves: string[] = [];
  const parcourir = (dossier: string, prefixe: string) => {
    for (const e of readdirSync(dossier, { withFileTypes: true })) {
      const chemin = join(dossier, e.name);
      if (e.isDirectory()) {
        parcourir(chemin, `${prefixe}${e.name}/`);
      } else if (e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts')) {
        if (sansCommentaires(readFileSync(chemin, 'utf8')).includes('totalPages')) {
          trouves.push(prefixe + e.name);
        }
      }
    }
  };
  parcourir(racine, '');
  return trouves.sort();
}

describe("L'instrument : le relevé des parcours annoncés", () => {
  it('il trouve EXACTEMENT les fichiers déclarés — ni plus, ni moins', () => {
    const trouves = fichiersAnnoncantUnParcours();
    const declares = new Set([
      ...PARCOURS_ANNONCES.map((p) => p.service),
      ...Object.keys(SANS_ROUTE),
    ]);

    // ⚠ TÉMOIN QUI COMPTE, DANS LES DEUX SENS. Un fichier nouveau portant
    // `totalPages` force une entrée ici — c'est le seul moment où quelqu'un
    // se posera la question. Et une entrée périmée est signalée aussi : une
    // exception qu'on ne relit jamais finit par couvrir autre chose.
    expect([...trouves].filter((f) => !declares.has(f)), 'parcours non déclaré').toEqual([]);
    expect(
      [...declares].filter((d) => !trouves.includes(d)).sort(),
      'déclaré mais ne rend plus totalPages',
    ).toEqual([]);
    // Je SAIS combien il y en a : 9 services de routes + 3 fichiers du moteur.
    //
    // ⚠ C'ÉTAIT 12 JUSQU'AU 12 SEPTEMBRE 2026, ET CE TEST A SIGNALÉ LA
    // DIFFÉRENCE. `search.service.ts` figurait parmi les exceptions motivées ;
    // le lot du backlog n°18 a supprimé le résultat vide qu'il fabriquait
    // (`totalPages: 0`), donc il ne rend plus de parcours du tout. L'exception
    // est devenue périmée le jour même, et le second sens de l'assertion l'a
    // dit — une exception qu'on ne relit jamais finit par couvrir autre chose.
    //
    // ⚠ PUIS 12 LE MÊME JOUR : `encadrements/encadrements.service.ts` (P6-3)
    // annonce un parcours. Le témoin a fait son office — il a fallu revenir ici
    // et DÉCLARER la route, c'est-à-dire vérifier qu'elle accepte bien `page`.
    // C'est exactement ce que ce fichier existe pour obliger.
    //
    // ⚠ PUIS 13 : `moissonnage/moissonnage.service.ts` (P7-1) annonce DEUX
    // parcours — les comptes rendus d'une source et ses collisions — servis par
    // un seul DTO, donc un seul fichier au relevé. Même office : il a fallu
    // revenir vérifier que ce DTO accepte `page`.
    expect(trouves.length).toBe(13);
  });

  it('⚠ il ne compte PAS un `totalPages` cité dans un commentaire', () => {
    // Les deux fichiers du soir sont le témoin, et ils sont nommés : leurs
    // commentaires expliquent le défaut, donc ils citent le mot. Ils ne
    // portent AUCUN parcours.
    const trouves = fichiersAnnoncantUnParcours();
    expect(trouves).not.toContain('authors/dto/authors-admin.dto.ts');
    expect(trouves).not.toContain('authors/authors-admin.controller.ts');

    // Et le contrôle dans l'autre sens, sur une entrée fabriquée : sans le
    // retrait des commentaires, les deux lignes ci-dessous seraient trouvées.
    expect(sansCommentaires('// totalPages ici').includes('totalPages')).toBe(false);
    expect(sansCommentaires('/* totalPages\n   sur deux lignes */').includes('totalPages')).toBe(false);
    expect(sansCommentaires('const x = { totalPages: 3 };').includes('totalPages')).toBe(true);
    // ⚠ Une URL ne doit pas être prise pour un commentaire de ligne.
    expect(sansCommentaires("const u = 'http://x/y'; const t = { totalPages: 1 };")).toContain('totalPages');
  });

  it('le relevé voit bien le cas qui a motivé ce test', () => {
    // Témoin positif nommé : `authors.service.ts` est le fichier fautif de
    // l'histoire. Un relevé qui ne le verrait pas rendrait un vert rassurant
    // sur le cas le plus grave.
    expect(fichiersAnnoncantUnParcours()).toContain('authors/authors.service.ts');
  });
});

describe("⚠ L'INVARIANT : le paramètre de page est ACCEPTÉ par le pipe réel", () => {
  for (const { service, dto, parametre } of PARCOURS_ANNONCES) {
    it(`${dto.name} (${service}) accepte « ${parametre} »`, async () => {
      const valide = await pipe.transform(
        { [parametre]: '2' },
        { type: 'query', metatype: dto },
      );
      // Accepté ET converti : un DTO qui laisserait passer la chaîne « 2 »
      // rendrait `skip: NaN` côté Prisma.
      expect((valide as Record<string, unknown>)[parametre]).toBe(2);
    });
  }

  it('« accepter » ne veut pas dire « ignorer » : une page absurde est refusée', async () => {
    // Sans ce cas, un DTO qui déclarerait `page?: unknown` sans validation
    // passerait l'invariant tout en cassant la requête en base.
    for (const page of ['0', '-1', 'abc']) {
      await expect(
        pipe.transform({ page }, { type: 'query', metatype: ListRecordsDto }),
        page,
      ).rejects.toThrow();
    }
  });
});
