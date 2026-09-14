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
  it('⚠ il en trouve EXACTEMENT quatorze — une quinzième force à relire ceci', () => {
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
    //
    // ⚠ PUIS DE 13 À 14 : `GET /depots/soumis`, la liste du personnel — et
    // elle est arrivée parce que la réattribution était INUTILISABLE sans
    // elle. Aucune route ne donnait l'identifiant d'un dépôt soumis à qui
    // n'en est pas le directeur : `a-valider` est auto-portée, `a-cataloguer`
    // ne rend que les validés, `mes-depots` est celle du déposant. Une route
    // sans moyen d'atteindre son argument.
    //
    // ⚠ Même fonction que la réattribution, et c'est une PROPRIÉTÉ, pas une
    // commodité — elle est éprouvée plus bas : une liste qui montre ce qu'on
    // peut réattribuer ne doit pas vivre derrière un autre droit que la
    // réattribution elle-même, sinon l'un des deux est inutile à qui a l'autre.
    expect(routesEtLeursFonctions().length).toBe(14);
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

  it('⚠ la LISTE DES SOUMIS porte la MÊME fonction que la réattribution', () => {
    // ⚠ CE N'EST PAS UNE COMMODITÉ. Une liste qui existe pour rendre la
    // réattribution atteignable et qui vivrait derrière un AUTRE droit rendrait
    // l'un des deux inutile à qui détient l'autre : voir sans pouvoir agir, ou
    // pouvoir agir sans savoir sur quoi. C'est le défaut qu'on vient de payer,
    // en plus petit.
    const routes = routesEtLeursFonctions();
    const liste = routes.find((r) => r.route === 'Get soumis');
    const reattribution = routes.find((r) => r.route === 'Post :id/reattribuer');
    expect(liste, 'la liste des dépôts soumis a disparu').toBeTruthy();
    expect(liste!.fonction).toBe(reattribution!.fonction);
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

describe('⚠ LA LISTE DES SOUMIS NE PERMET NI DE VALIDER NI DE REFUSER', () => {
  /**
   * ⚠ PROPRIÉTÉ EXIGÉE, ET ÉPROUVÉE PLUTÔT QUE SUPPOSÉE. La liste donne au
   * bibliothécaire l'identifiant de N'IMPORTE QUEL dépôt soumis — y compris
   * ceux dont il n'est pas le directeur. Si `valider` s'était contentée de la
   * fonction `depot.valider`, un administrateur (qui les porte TOUTES) aurait
   * pu décider à la place du directeur désigné, muni d'un identifiant que cette
   * liste vient de lui donner.
   *
   * La garantie ne tient pas à l'absence de bouton : elle tient au SERVICE.
   * C'est là qu'on la mesure.
   */
  function serviceAvec(depot: Record<string, unknown> | null) {
    const db = {
      deposit: {
        findUnique: vi.fn(async () => depot),
        findMany: vi.fn(async () => (depot ? [depot] : [])),
      },
      user: {
        findMany: vi.fn(async () => []),
        findUnique: vi.fn(async () => ({ id: 'etudiant', email: 'e@exemple.bf' })),
      },
    } as never;
    const svc = new DepotsService(
      {
        sendDepositSubmitted: vi.fn(),
        sendDepositApproved: vi.fn(async () => ({ etat: 'envoye' })),
        sendDepositRejected: vi.fn(async () => ({ etat: 'envoye' })),
      } as never,
      { putObject: vi.fn(), deleteObject: vi.fn() } as never,
      { ingestPdf: vi.fn() } as never,
    );
    return { svc, db };
  }

  const SOUMIS = {
    id: 'd1',
    status: 'soumis',
    directorId: 'le-directeur',
    depositorId: 'etudiant',
    submittedAt: new Date('2026-06-10T00:00:00Z'),
  };

  it('⚠ VALIDER avec l’identifiant lu dans la liste rend « introuvable »', async () => {
    const { svc, db } = serviceAvec(SOUMIS);
    await expect(svc.valider(db, 'd1', 'le-bibliothecaire')).rejects.toThrow(/introuvable/i);
  });

  it('⚠ REFUSER de même — et « introuvable », pas « interdit »', async () => {
    // La symétrie tient : un 403 confirmerait à qui n'est pas le directeur que
    // ce dépôt existe et qu'il est dirigé par quelqu'un d'autre.
    const { svc, db } = serviceAvec(SOUMIS);
    await expect(svc.refuser(db, 'd1', 'le-bibliothecaire', 'motif')).rejects.toThrow(
      /introuvable/i,
    );
  });

  it('le directeur désigné, lui, passe — sinon le test précédent ne prouverait rien', async () => {
    // ⚠ TÉMOIN D'ABSENCE ET TÉMOIN DE PRÉSENCE. Sans celui-ci, les deux refus
    // ci-dessus seraient satisfaits par une méthode qui refuse TOUT LE MONDE,
    // y compris celui qui doit passer.
    const { svc, db } = serviceAvec(SOUMIS);
    (db as never as { deposit: { update: ReturnType<typeof vi.fn> } }).deposit.update = vi.fn(
      async () => ({ ...SOUMIS, status: 'valide' }),
    );
    await expect(svc.valider(db, 'd1', 'le-directeur')).resolves.toBeTruthy();
  });
});

describe('⚠ L’ANCIENNETÉ : « il y a 94 jours », jamais une date à soustraire', () => {
  function db(depots: Record<string, unknown>[]) {
    return {
      deposit: { findMany: vi.fn(async () => depots) },
      // ⚠ `user.findMany` sert DEUX appels : les noms des directeurs désignés,
      // et les candidats désignables. La doublure rend la même ligne aux deux —
      // ce qui suffit ici, où l'on mesure l'ancienneté et le tri.
      user: { findMany: vi.fn(async () => [{ id: 'dir', firstName: 'Awa', lastName: 'Traoré' }]) },
    } as never;
  }
  const svc = () =>
    new DepotsService(
      { sendDepositSubmitted: vi.fn() } as never,
      { putObject: vi.fn() } as never,
      { ingestPdf: vi.fn() } as never,
    );

  it('compte les jours entiers écoulés depuis la soumission', async () => {
    const base = db([
      { id: 'd1', title: 'T', submittedAt: new Date('2026-06-10T08:00:00Z'), directorId: 'dir' },
    ]);
    const { depots: [ligne] } = await svc().soumis(base, new Date('2026-09-12T08:00:00Z'));
    expect(ligne.joursDepuisSoumission).toBe(94);
    // Et le NOM du directeur, pas son identifiant : une liste d'UUID ne se lit pas.
    expect(ligne.directeur).toBe('Awa Traoré');
  });

  it('⚠ `null` quand la date manque — JAMAIS zéro, qui voudrait dire « aujourd’hui »', async () => {
    // Cas réel depuis que le retrait efface `submittedAt` : un dépôt resoumis
    // sans date ne doit pas se présenter comme le plus récent de la liste.
    const base = db([{ id: 'd2', title: 'T', submittedAt: null, directorId: null }]);
    const { depots: [ligne] } = await svc().soumis(base, new Date('2026-09-12T08:00:00Z'));
    expect(ligne.joursDepuisSoumission).toBeNull();
    expect(ligne.directeur).toBeNull();
  });

  it('⚠ le plus ANCIEN d’abord — celui qui attend depuis trois mois, pas le dernier arrivé', async () => {
    const base = db([]);
    await svc().soumis(base, new Date());
    const appel = (base as never as { deposit: { findMany: ReturnType<typeof vi.fn> } }).deposit
      .findMany.mock.calls[0][0];
    expect(appel.where).toEqual({ status: 'soumis' });
    expect(appel.orderBy[0]).toEqual({ submittedAt: 'asc' });
  });
});

describe('⚠ LA LISTE PORTE ELLE-MÊME SES DIRECTEURS DÉSIGNABLES', () => {
  /**
   * ⚠ TROISIÈME OCCURRENCE EN DEUX JOURS DE « une route sans chemin vers son
   * argument », et celle-ci était dans MA correction de la deuxième.
   *
   * `POST :id/reattribuer` prend DEUX arguments : le dépôt, et le nouveau
   * directeur. `GET /depots/soumis` donnait le premier — le second vivait
   * derrière `GET /depots/directeurs`, sous `depot.deposer`, que le
   * bibliothécaire n'a pas.
   *
   * ⚠ ÉLARGIR `depot.deposer` AURAIT ÉTÉ LA MAUVAISE RÉPONSE : cette fonction
   * donne le droit de DÉPOSER. On aurait accordé un droit d'ÉCRITURE pour
   * résoudre un problème de LECTURE, à quelqu'un dont ce n'est pas le métier.
   */
  function base(candidats: Record<string, unknown>[]) {
    const user = {
      findMany: vi.fn(async ({ where }: { where?: unknown }) =>
        // ⚠ La doublure DISTINGUE les deux appels : celui qui cherche les noms
        // des directeurs désignés passe un `where` sur `id`, celui des
        // candidats passe le `OR` du module `directeurs`. Sans cette
        // distinction, le test passerait quelle que soit la requête émise.
        where && 'id' in (where as object) ? [] : candidats,
      ),
    };
    return { db: { deposit: { findMany: vi.fn(async () => []) }, user } as never, user };
  }

  const CANDIDAT = {
    id: 'u1',
    firstName: 'Awa',
    lastName: 'Traoré',
    status: 'ACTIVE',
    role: UserRole.ADMIN,
    roleId: null,
    customRole: null,
  };

  const svc = () =>
    new DepotsService(
      { sendDepositSubmitted: vi.fn() } as never,
      { putObject: vi.fn() } as never,
      { ingestPdf: vi.fn() } as never,
    );

  it('la réponse porte les directeurs, à côté des dépôts', async () => {
    const { db } = base([CANDIDAT]);
    const r = await svc().soumis(db, new Date());
    expect(r.depots).toEqual([]);
    // ⚠ Le NOM et l'identifiant, rien d'autre : ce n'est pas un annuaire.
    expect(r.directeurs).toEqual([{ id: 'u1', nom: 'Awa Traoré' }]);
  });

  it('⚠ et elle emploie le MÊME filtre que `GET /depots/directeurs`', async () => {
    // Deux listes de directeurs qui divergeraient finiraient par proposer ici
    // quelqu'un que la réattribution refuse ensuite — « un bouton qui mène à un
    // mur », le défaut qu'on vient de payer trois fois.
    const { db, user } = base([CANDIDAT]);
    const parDeuxChemins = await Promise.all([
      svc().soumis(db, new Date()),
      svc().directeursDesignables(db),
    ]);
    expect(parDeuxChemins[0].directeurs).toEqual(parDeuxChemins[1]);
    // Le `where` des deux appels de candidats est le même objet de critères.
    const appels = user.findMany.mock.calls
      .map((c) => c[0]?.where as Record<string, unknown> | undefined)
      .filter((w): w is Record<string, unknown> => !!w && !('id' in w));
    expect(appels.length).toBe(2);
    expect(appels[0]).toEqual(appels[1]);
  });

  it('⚠ un compte qui ne peut PAS diriger n’est pas proposé', async () => {
    // Témoin d'absence : sans lui, une liste qui rend tout le monde serait
    // indiscernable d'une liste juste — et plus rassurante, puisqu'elle ne
    // serait jamais vide.
    const { db } = base([{ ...CANDIDAT, status: 'SUSPENDED' }]);
    expect((await svc().soumis(db, new Date())).directeurs).toEqual([]);
  });
});
