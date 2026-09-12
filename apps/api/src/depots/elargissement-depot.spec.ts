import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  FONCTIONS,
  ROLES_SYSTEME,
  TOUTES_LES_FONCTIONS,
  functionsForLegacyRole,
} from '../auth/functions';
import { UserRole } from '@prisma/client';
import { DepotsService } from './depots.service';

/**
 * ⚠ CE QUE L'ÉTUDIANT GAGNE, EXACTEMENT — et rien d'autre.
 *
 * C'est le PREMIER élargissement de droits accordé depuis le découpage des
 * permissions, et le motif d'`etablissement.gerer` a déjà été payé une fois :
 * une fonction qui ouvrait plus que ce que son nom disait. Ce fichier vérifie
 * qu'on ne le refait pas en petit.
 *
 * La vérification porte dans les DEUX sens, parce qu'un seul ne suffit pas :
 *  · le rôle Étudiant ne contient QUE cette fonction ;
 *  · les routes qui la réclament sont EXACTEMENT les routes étudiantes, et
 *    elles sont comptées.
 *
 * Vérifier seulement le premier laisserait une route de plus s'accrocher à la
 * fonction plus tard ; vérifier seulement le second laisserait le rôle gagner
 * une fonction voisine au même commit.
 */

const SOURCE_CONTROLEUR = readFileSync(join(__dirname, 'depots.controller.ts'), 'utf8');

/** Les routes du contrôleur, avec la fonction qu'elles exigent. */
function routesEtLeursFonctions(): { route: string; fonction: string }[] {
  const sortie: { route: string; fonction: string }[] = [];
  const motif =
    /@(Get|Post|Patch|Delete)\(([^)]*)\)\s*\n\s*@RequiresFunctions\(FONCTIONS\.(\w+)\)/g;
  for (const m of SOURCE_CONTROLEUR.matchAll(motif)) {
    sortie.push({ route: `${m[1]} ${m[2].replace(/['"]/g, '') || '/'}`, fonction: m[3] });
  }
  return sortie;
}

/**
 * ⚠ « AUCUNE ROUTE N'ÉCHAPPE À L'INVENTAIRE » N'EST PAS TESTÉ ICI, et j'ai
 * failli l'y écrire. `auth/gardes-declarees.spec.ts` le porte DÉJÀ pour toute
 * l'API : toute route d'un contrôleur gardé déclare une fonction, ou figure
 * dans une des quatre catégories motivées. Il a refusé mon push quand
 * `GET /depots/:id/document` est arrivée sans garde — avant que mon doublon
 * n'existe.
 *
 * Deux inventaires pour une seule propriété divergent : celui qu'on tient
 * finit par contredire celui qu'on oublie. Le local a donc été retiré.
 *
 * Ce fichier garde ce qui lui est propre : la SURFACE de l'élargissement
 * `depot.deposer`, c'est-à-dire quelles routes une seule fonction ouvre.
 */

describe("L'instrument : le relevé des routes du contrôleur", () => {
  it('⚠ il en trouve EXACTEMENT treize — une quatorzième force à relire ceci', () => {
    // ⚠ TÉMOIN QUI COMPTE. « Au moins une » confirmerait que le relevé tourne ;
    // seul un compte exact signale la route ajoutée demain sous une fonction
    // qu'on n'aura pas relue.
    // ⚠ PASSÉ DE 8 À 9 le 12 septembre 2026 : le téléversement du document
    // (`POST /depots/:id/document`) s'ajoute aux routes de l'étudiant. Le
    // compte a fait son office — il a fallu revenir ici et constater que la
    // route neuve est bien AUTO-PORTÉE comme les trois autres.
    //
    // ⚠ PUIS DE 9 À 11, le même jour, et CELLE-LÀ A DEMANDÉ UN ARBITRAGE :
    // `GET /depots/directeurs` n'est PAS auto-portée. Elle rend des données sur
    // D'AUTRES personnes, ce qu'aucune des quatre autres routes étudiantes ne
    // faisait. Retenue quand même, pour une raison qui se vérifie plus bas et
    // dans `qui-peut-diriger.spec.ts` : elle ne rend que l'identifiant et le
    // nom affichable de gens qui portent `depot.valider` — exactement ce qu'il
    // faut pour adresser son mémoire à quelqu'un, et rien qui ressemble à un
    // annuaire. La seconde, `PATCH /depots/:id/directeur`, est auto-portée
    // comme les autres.
    //
    // ⚠ PUIS DE 11 À 13 : les deux SORTIES de l'état `soumis`. Le compte a
    // encore fait son office — il a fallu revenir ici et constater que
    // `:id/retirer` est AUTO-PORTÉE (le déposant, son propre dépôt) et que
    // `:id/reattribuer` ne l'est pas : elle est sous `catalogue.gerer`, la
    // fonction qui ouvre déjà le circuit au bibliothécaire. Surtout PAS sous
    // `depot.valider` — résoudre un blocage par le droit qui manque serait
    // tourner en rond.
    expect(routesEtLeursFonctions().length).toBe(13);
  });
});

describe('⚠ Ce que le rôle ÉTUDIANT porte, et rien de plus', () => {
  it('sa liste de fonctions est exactement `depot.deposer`', () => {
    const etudiant = ROLES_SYSTEME.find((r) => r.name === 'Étudiant');
    expect(etudiant?.functions).toEqual([FONCTIONS.DEPOT_DEPOSER]);
  });

  it('et le repli sur le rôle système hérité dit la même chose', () => {
    // `functionsForLegacyRole` est le chemin qu'emprunte un compte sans rôle
    // dynamique assigné : il doit accorder la même chose, ni plus ni moins.
    expect(functionsForLegacyRole(UserRole.STUDENT)).toEqual([FONCTIONS.DEPOT_DEPOSER]);
  });

  it('⚠ AUCUN autre rôle métier ne gagne une fonction de dépôt', () => {
    // Le motif d'`etablissement.gerer` : l'élargissement se cache derrière une
    // ligne d'apparence anodine. Ces trois rôles-là ne doivent porter AUCUNE
    // fonction `depot.*` — ni maintenant, ni au prochain ajout.
    for (const nom of ['Bibliothécaire', 'Gestionnaire', 'Acquisitions']) {
      const role = ROLES_SYSTEME.find((r) => r.name === nom);
      expect(role, nom).toBeTruthy();
      expect(role!.functions.filter((f) => f.startsWith('depot.')), nom).toEqual([]);
    }
  });

  it('⚠ `depot.valider` n’est portée par aucun rôle SAUF l’Administrateur, qui a tout', () => {
    // Elle est destinée à un rôle DYNAMIQUE « Enseignant », créé par l'école
    // qui en a l'usage. Une école qui n'en veut pas ne le crée pas.
    //
    // ⚠ L'ADMINISTRATEUR LA PORTE, ET C'EST INOFFENSIF — mais il fallait le
    // vérifier plutôt que le supposer. Son rôle est `TOUTES_LES_FONCTIONS` PAR
    // IDENTITÉ : toute fonction neuve lui échoit, celle-ci comme les autres. Ce
    // qui la rend sans effet est l'AUTO-PORTAGE : `aValider` filtre sur
    // `directorId === lui`, donc un administrateur ne voit que les dépôts dont
    // il est lui-même le directeur désigné. La fonction ne lui ouvre rien
    // au-delà de ses propres encadrements.
    const administrateur = ROLES_SYSTEME.find((r) => r.name === 'Administrateur');
    expect(administrateur!.functions).toBe(TOUTES_LES_FONCTIONS);

    for (const role of ROLES_SYSTEME.filter((r) => r.name !== 'Administrateur')) {
      expect(role.functions, role.name).not.toContain(FONCTIONS.DEPOT_VALIDER);
    }
  });
});

describe('⚠ Ce que `depot.deposer` OUVRE, exactement', () => {
  it('sept routes, et ce sont les sept routes de l’étudiant', () => {
    const ouvertes = routesEtLeursFonctions()
      .filter((r) => r.fonction === 'DEPOT_DEPOSER')
      .map((r) => r.route)
      .sort();

    expect(ouvertes).toEqual([
      'Get directeurs',
      'Get mes-depots',
      'Patch :id/directeur',
      'Post /',
      'Post :id/document',
      'Post :id/retirer',
      'Post :id/soumettre',
    ]);
  });

  it('⚠ la RÉATTRIBUTION n’est PAS sous `depot.valider` — sinon on tourne en rond', () => {
    // ⚠ CONTRAINTE EXPLICITE, ET ELLE N'ÉTAIT COUVERTE PAR RIEN : un contrôle
    // négatif qui faisait passer cette route sous `depot.valider` ne cassait
    // aucun test.
    //
    // Le motif : cette route existe pour DÉBLOQUER un dépôt dont le directeur
    // a perdu `depot.valider`. La placer sous ce même droit reviendrait à
    // exiger, pour réparer le blocage, exactement la fonction qui manque.
    //
    // Elle est sous `catalogue.gerer` — la fonction qui ouvre DÉJÀ le circuit
    // au bibliothécaire (`a-cataloguer`, `:id/notice`). Même personne, même
    // écran, aucune fonction nouvelle.
    const reattribution = routesEtLeursFonctions().find(
      (r) => r.route === 'Post :id/reattribuer',
    );
    expect(reattribution, 'la route de réattribution a disparu').toBeTruthy();
    expect(reattribution!.fonction).not.toBe('DEPOT_VALIDER');
    expect(reattribution!.fonction).toBe('CATALOGUE_GERER');
  });

  it('aucune route de DÉCISION ne s’ouvre à l’étudiant', () => {
    // Valider, refuser, cataloguer, rattacher : rien de tout cela.
    const ouvertes = routesEtLeursFonctions().filter((r) => r.fonction === 'DEPOT_DEPOSER');
    for (const mot of ['valider', 'refuser', 'notice', 'a-cataloguer', 'a-valider']) {
  expect(ouvertes.map((r) => r.route).join(' '), mot).not.toContain(mot);
    }
  });
});

describe('⚠ AUTO-PORTAGE de l’étudiant — propriété testée, pas intention', () => {
  function service(depot: Record<string, unknown>) {
    const db = {
      deposit: {
        findUnique: vi.fn(async () => depot),
        findMany: vi.fn(async () => [depot]),
      },
      user: { findUnique: vi.fn(async () => ({ id: 'x', email: 'x@exemple.bf' })) },
    } as never;
    return {
      svc: new DepotsService(
        { sendDepositSubmitted: vi.fn() } as never,
        { putObject: vi.fn(), deleteObject: vi.fn() } as never,
        { ingestPdf: vi.fn() } as never,
      ),
      db,
    };
  }

  it('« mes dépôts » filtre sur le DÉPOSANT', async () => {
    const { svc, db } = service({ id: 'd1', depositorId: 'moi' });
    await svc.mesDepots(db, 'moi');

    const where = (db as unknown as { deposit: { findMany: ReturnType<typeof vi.fn> } })
      .deposit.findMany.mock.calls[0][0].where;
    expect(where).toEqual({ depositorId: 'moi' });
  });

  it('⚠ soumettre le dépôt d’un AUTRE rend « introuvable », pas « interdit »', async () => {
    // Même raisonnement que pour le directeur, et la symétrie compte : un 403
    // dirait à un étudiant qu'un dépôt existe sous cet identifiant et qu'il
    // appartient à quelqu'un d'autre. Sans la symétrie, un des deux chemins
    // fuirait ce que l'autre protège.
    const { svc, db } = service({ id: 'd1', depositorId: 'un-autre', status: 'brouillon' });
    await expect(svc.soumettre(db, 'd1', 'moi')).rejects.toThrow(/introuvable/i);
  });
});
