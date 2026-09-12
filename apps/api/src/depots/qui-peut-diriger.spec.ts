import { describe, expect, it, vi } from 'vitest';
import { AccountStatus, UserRole } from '@prisma/client';
import {
  FONCTIONS,
  ROLES_SYSTEME,
  fonctionsEffectives,
  functionsForLegacyRole,
} from '../auth/functions';
import { AuthzService } from '../auth/authz.service';
import { DepotsService } from './depots.service';
import {
  CANDIDAT_PAR_ROLE_DYNAMIQUE,
  CANDIDAT_PAR_ROLE_HERITE,
  OU_CANDIDAT_DIRECTEUR,
  ROLES_HERITES_DIRECTEURS,
  peutDirigerUnDepot,
} from './directeurs';

/**
 * ⚠ L'INVARIANT, ET IL N'Y EN A QU'UN :
 *
 *   **Le menu ne propose JAMAIS quelqu'un que la garde refusera.**
 *
 * C'est la structure « deux portes » du 12 septembre, mais cette fois les deux
 * portes sont voulues : une garde qui décide sur UNE personne, une requête qui
 * en propose PLUSIEURS. Leur divergence n'est pas un trou de sécurité — c'est
 * pire à l'usage : un étudiant choisit un nom dans une liste et se fait
 * répondre que cette personne ne peut pas diriger. Il ne peut même pas croire
 * qu'il s'est trompé, l'écran venait de le lui proposer.
 *
 * Les tests ci-dessous ne listent donc PAS les cas d'éligibilité. Ils vérifient
 * que les deux chemins rendent le MÊME verdict sur une population qui contient
 * exprès les cas tordus.
 */

/** La population d'épreuve — chaque ligne existe pour une raison. */
interface CasDEpreuve {
  quoi: string;
  id: string;
  firstName: string;
  lastName: string;
  status: AccountStatus;
  role: UserRole;
  roleId: string | null;
  /** ⚠ `string[]` et non le littéral : sinon l'union des lignes rend `never`. */
  customRole: { functions: string[] } | null;
  attendu: boolean;
}

const POPULATION: CasDEpreuve[] = [
  {
    quoi: 'administrateur sans rôle dynamique — porte tout par identité',
    id: 'u-admin',
    firstName: 'Awa',
    lastName: 'Traoré',
    status: AccountStatus.ACTIVE,
    role: UserRole.ADMIN,
    roleId: null,
    customRole: null,
    attendu: true,
  },
  {
    quoi: 'rôle dynamique « Enseignant » portant depot.valider',
    id: 'u-ens',
    firstName: 'Salif',
    lastName: 'Ouédraogo',
    status: AccountStatus.ACTIVE,
    role: UserRole.STUDENT,
    roleId: 'r-ens',
    customRole: { functions: [FONCTIONS.DEPOT_VALIDER] },
    attendu: true,
  },
  {
    quoi: '⚠ ADMIN à qui l’école a donné un rôle dynamique RESTREINT',
    // Le cas qui condamne un pré-filtre écrit `role: ADMIN` sans `roleId: null` :
    // son enum dit « tout », son rôle dynamique dit « rien ». C'est le second
    // qui gagne, et une requête qui l'oublierait le PROPOSERAIT.
    id: 'u-admin-restreint',
    firstName: 'Fatou',
    lastName: 'Sanogo',
    status: AccountStatus.ACTIVE,
    role: UserRole.ADMIN,
    roleId: 'r-lecture',
    customRole: { functions: [FONCTIONS.DOCUMENT_LIRE] },
    attendu: false,
  },
  {
    quoi: '⚠ enseignant SUSPENDU — il porte la fonction et ne doit plus diriger',
    id: 'u-suspendu',
    firstName: 'Issa',
    lastName: 'Kaboré',
    status: AccountStatus.SUSPENDED,
    role: UserRole.STUDENT,
    roleId: 'r-ens',
    customRole: { functions: [FONCTIONS.DEPOT_VALIDER] },
    attendu: false,
  },
  {
    quoi: '⚠ LE CAMARADE — un étudiant ordinaire, le défaut que ce lot ferme',
    id: 'u-camarade',
    firstName: 'Moussa',
    lastName: 'Zongo',
    status: AccountStatus.ACTIVE,
    role: UserRole.STUDENT,
    roleId: null,
    customRole: null,
    attendu: false,
  },
  {
    quoi: 'bibliothécaire — il catalogue, il ne dirige pas',
    id: 'u-biblio',
    firstName: 'Aminata',
    lastName: 'Barry',
    status: AccountStatus.ACTIVE,
    role: UserRole.LIBRARIAN,
    roleId: null,
    customRole: null,
    attendu: false,
  },
];

describe('⚠ L’INVARIANT : la liste et la garde disent la même chose', () => {
  it('la DÉCISION rend le verdict attendu sur chaque cas de la population', () => {
    for (const p of POPULATION) {
      expect(peutDirigerUnDepot(p), p.quoi).toBe(p.attendu);
    }
  });

  it('⚠ et le PRÉ-FILTRE SQL ne laisse passer que des comptes que la décision accepte', () => {
    // On applique le `where` à la main sur la population, puis on compare au
    // verdict de la décision. Le pré-filtre a le droit d'être plus ÉTROIT —
    // il ne doit jamais être plus LARGE.
    const retenus = POPULATION.filter(satisfaitLePreFiltre);
    for (const p of retenus) {
      expect(peutDirigerUnDepot(p), `pré-filtré à tort : ${p.quoi}`).toBe(true);
    }
    // ⚠ TÉMOIN QUI COMPTE. « Aucun faux positif » serait vert sur un pré-filtre
    // qui ne rend RIEN — et un menu vide est le défaut suivant, pas une
    // réussite. Deux directeurs dans cette population, exactement.
    expect(retenus.map((p) => p.id).sort()).toEqual(['u-admin', 'u-ens']);
  });

  it('⚠ les rôles hérités du pré-filtre sont CALCULÉS depuis ROLES_SYSTEME', () => {
    // Témoin de l'instrument : si quelqu'un écrivait la liste à la main, elle
    // serait vraie aujourd'hui et fausse au premier rôle système qui gagne la
    // fonction.
    const attendus = ROLES_SYSTEME.filter((r) =>
      (r.functions as readonly string[]).includes(FONCTIONS.DEPOT_VALIDER),
    ).map((r) => r.legacyRole);
    expect(ROLES_HERITES_DIRECTEURS).toEqual(attendus);
    // Et l'état de fait qu'il faut relire le jour où il change : seul
    // l'Administrateur, par identité.
    expect(ROLES_HERITES_DIRECTEURS).toEqual([UserRole.ADMIN]);
  });
});

/**
 * Le `where` de `OU_CANDIDAT_DIRECTEUR`, appliqué en mémoire.
 *
 * ⚠ IL LIT LES CONSTANTES, il ne les recopie pas. Un pré-filtre réécrit à la
 * main dans son propre test vérifie qu'on s'est recopié soi-même — c'est le
 * défaut qu'on a nommé sur les gardes qui comparent une copie à une copie.
 */
function satisfaitLePreFiltre(p: (typeof POPULATION)[number]): boolean {
  if (p.status !== OU_CANDIDAT_DIRECTEUR.status) return false;
  const parRoleDynamique =
    p.customRole?.functions.includes(
      CANDIDAT_PAR_ROLE_DYNAMIQUE.customRole.functions.has,
    ) ?? false;
  const parRoleHerite =
    p.roleId === CANDIDAT_PAR_ROLE_HERITE.roleId &&
    (CANDIDAT_PAR_ROLE_HERITE.role.in as readonly string[]).includes(p.role);
  return parRoleDynamique || parRoleHerite;
}

describe('⚠ Ce qui SORT de la liste : deux clés, jamais l’annuaire', () => {
  function service(candidats: unknown[]) {
    const findMany = vi.fn(async () => candidats);
    const db = { user: { findMany }, deposit: {} } as never;
    const svc = new DepotsService(
      { sendDepositSubmitted: vi.fn() } as never,
      {} as never,
      {} as never,
    );
    return { svc, db, findMany };
  }

  it('⚠ un compte COMPLET n’en laisse sortir que `id` et `nom`', async () => {
    // ⚠ La doublure rend le compte ENTIER — mot de passe, courriel, matricule —
    // en IGNORANT le `select`, exprès. C'est ainsi qu'on éprouve la dernière
    // défense : si la projection venait à disparaître, le `select` du service
    // ne rattraperait rien ici, et le test tomberait. Un test qui compte sur le
    // `select` de la doublure ne mesure que la doublure.
    const { svc, db } = service([
      {
        ...POPULATION[0],
        email: 'awa@exemple.bf',
        matricule: 'M-001',
        password: 'peu-importe',
        className: 'M2 Droit',
      },
    ]);

    const sortie = await svc.directeursDesignables(db);

    expect(sortie).toEqual([{ id: 'u-admin', nom: 'Awa Traoré' }]);
    expect(Object.keys(sortie[0]).sort()).toEqual(['id', 'nom']);
  });

  it('⚠ et la DÉCISION repasse sur ce que la requête a rendu', async () => {
    // Si le `where` s'élargissait un jour par accident, le camarade arriverait
    // jusqu'ici. Il ne doit pas en ressortir.
    const { svc, db } = service([POPULATION[0], POPULATION[4], POPULATION[3]]);
    const sortie = await svc.directeursDesignables(db);
    expect(sortie.map((d) => d.id)).toEqual(['u-admin']);
  });
});

describe('⚠ LA GARDE : le refus NOMME sa cause', () => {
  function service(compte: unknown) {
    const db = {
      user: { findUnique: vi.fn(async () => compte) },
      deposit: { create: vi.fn(async (a: unknown) => a) },
    } as never;
    const svc = new DepotsService(
      { sendDepositSubmitted: vi.fn() } as never,
      {} as never,
      {} as never,
    );
    return { svc, db };
  }

  const brouillon = {
    title: 'Le droit foncier rural',
    authorName: 'Zongo, Moussa',
    documentType: 'these',
  };

  it('⚠ DÉSIGNER UN CAMARADE est refusé — le défaut que ce lot ferme', async () => {
    const { svc, db } = service(POPULATION[4]);
    await expect(
      svc.creer(db, 'moi', { ...brouillon, directorId: 'u-camarade' }),
    ).rejects.toThrow(/ne peut pas diriger/i);
  });

  it('un enseignant SUSPENDU est refusé aussi', async () => {
    const { svc, db } = service(POPULATION[3]);
    await expect(
      svc.creer(db, 'moi', { ...brouillon, directorId: 'u-suspendu' }),
    ).rejects.toThrow(/ne peut pas diriger/i);
  });

  it('⚠ un compte INEXISTANT rend un autre message — les deux causes sont distinctes', async () => {
    // « Ce compte n'existe pas » envoie vérifier la personne ; « elle ne peut
    // pas diriger » envoie demander un droit à l'administrateur. Les confondre
    // ferait chercher une faute de saisie là où il n'y en a pas.
    const { svc, db } = service(null);
    await expect(
      svc.creer(db, 'moi', { ...brouillon, directorId: 'fantome' }),
    ).rejects.toThrow(/n’a pas de compte/i);
  });

  it('un directeur RÉEL passe', async () => {
    const { svc, db } = service(POPULATION[1]);
    await expect(
      svc.creer(db, 'moi', { ...brouillon, directorId: 'u-ens' }),
    ).resolves.toBeTruthy();
  });
});

describe('⚠ La règle de résolution est UNE, et les deux chemins la partagent', () => {
  it('`AuthzService` rend exactement ce que rend `fonctionsEffectives`', async () => {
    // Le motif : deux implémentations d'une même règle s'accordent aujourd'hui
    // et divergent au premier changement. Ici il n'y en a plus qu'une — ce test
    // le VÉRIFIE plutôt que de le déclarer.
    const authz = new AuthzService();
    for (const p of POPULATION) {
      const db = { user: { findUnique: vi.fn(async () => p) } } as never;
      expect(await authz.getFunctions(db, p.id), p.quoi).toEqual(fonctionsEffectives(p));
    }
  });

  it('⚠ et le repli fail-closed tient : compte absent = aucune fonction', () => {
    expect(fonctionsEffectives(null)).toEqual([]);
    expect(functionsForLegacyRole('ROLE_INVENTE')).toEqual([]);
  });
});

describe('⚠ DÉSIGNER le directeur d’un brouillon — la sortie de l’impasse', () => {
  function service(depot: Record<string, unknown>, compte: unknown) {
    const update = vi.fn(async ({ data }: { data: unknown }) => ({ ...depot, ...(data as object) }));
    const db = {
      deposit: { findUnique: vi.fn(async () => depot), update },
      user: { findUnique: vi.fn(async () => compte) },
    } as never;
    const svc = new DepotsService(
      { sendDepositSubmitted: vi.fn() } as never,
      {} as never,
      {} as never,
    );
    return { svc, db, update };
  }

  const BROUILLON = { id: 'd1', depositorId: 'moi', status: 'brouillon', directorId: null };

  it('un brouillon SANS directeur en reçoit un — sinon il ne peut plus jamais être soumis', async () => {
    // ⚠ LE DÉFAUT QUE CETTE ROUTE FERME. `directorId` est facultatif à la
    // création et ne se posait QU'À la création : un brouillon créé sans
    // directeur était un dossier définitivement bloqué — `soumettre` le refuse,
    // et rien ne pouvait le corriger.
    const { svc, db, update } = service(BROUILLON, POPULATION[1]);
    await svc.designerDirecteur(db, 'd1', 'moi', 'u-ens');
    expect(update.mock.calls[0][0].data).toEqual({ directorId: 'u-ens' });
  });

  it('⚠ et la MÊME garde s’applique : on ne désigne pas un camarade', async () => {
    const { svc, db, update } = service(BROUILLON, POPULATION[4]);
    await expect(svc.designerDirecteur(db, 'd1', 'moi', 'u-camarade')).rejects.toThrow(
      /ne peut pas diriger/i,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('⚠ un dépôt déjà SOUMIS ne change plus de directeur', async () => {
    // Le retirer des mains de quelqu'un qui l'examine, sans que rien ne le lui
    // dise, serait le faux silencieux appliqué à une personne.
    const { svc, db, update } = service(
      { ...BROUILLON, status: 'soumis', directorId: 'u-ens' },
      POPULATION[0],
    );
    await expect(svc.designerDirecteur(db, 'd1', 'moi', 'u-admin')).rejects.toThrow(
      /ne peut plus être changé/i,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('⚠ le brouillon d’un AUTRE rend « introuvable », comme partout ailleurs', async () => {
    // La symétrie compte : un 403 dirait qu'un dépôt existe sous cet
    // identifiant et appartient à quelqu'un d'autre.
    const { svc, db } = service({ ...BROUILLON, depositorId: 'un-autre' }, POPULATION[0]);
    await expect(svc.designerDirecteur(db, 'd1', 'moi', 'u-admin')).rejects.toThrow(
      /introuvable/i,
    );
  });
});

describe('⚠ LIRE LE DOCUMENT DÉPOSÉ — la lacune qui rendait la validation impossible', () => {
  // ⚠ ONZE ROUTES, AUCUNE NE SERVAIT LE FICHIER. Le circuit demandait à un
  // directeur de VALIDER UN CONTENU QU'IL NE POUVAIT PAS LIRE — et au déposant
  // de faire confiance au fichier qu'il venait d'envoyer, sans pouvoir le
  // relire. Le téléversement le stockait, le catalogage en recopiait les clés,
  // et entre les deux personne n'y avait accès.

  function service(depot: Record<string, unknown>) {
    // ⚠ La doublure DÉCLARE ses arguments, sinon `mock.calls[0]` est typé `[]`
    // et les assertions sur la clé signée et le TTL ne compilent pas — alors
    // que la suite, elle, passerait. Une suite verte ne dit rien des types.
    const getSignedDownloadUrl = vi.fn(
      async (_cle: string, _nom: string, _ttl: number) => 'https://minio.exemple.bf/signe',
    );
    const db = { deposit: { findUnique: vi.fn(async () => depot) } } as never;
    const svc = new DepotsService(
      { sendDepositSubmitted: vi.fn() } as never,
      { getSignedDownloadUrl } as never,
      {} as never,
    );
    return { svc, db, getSignedDownloadUrl };
  }

  const DEPOT = {
    id: 'd1',
    depositorId: 'etudiant',
    directorId: 'u-ens',
    status: 'soumis',
    fileKey: 'd1/memoire.pdf',
    fileName: 'memoire.pdf',
    fileFormat: 'PDF',
    encObjectKey: 'd1/memoire.enc',
  };

  it('le DÉPOSANT relit le sien', async () => {
    const { svc, db } = service(DEPOT);
    await expect(svc.urlDeLectureDuDocument(db, 'd1', 'etudiant', [])).resolves.toMatchObject({
      fileFormat: 'PDF',
    });
  });

  it('⚠ le DIRECTEUR DÉSIGNÉ y a droit — sans quoi il ne peut pas valider', async () => {
    const { svc, db } = service(DEPOT);
    await expect(svc.urlDeLectureDuDocument(db, 'd1', 'u-ens', [])).resolves.toBeTruthy();
  });

  it('le BIBLIOTHÉCAIRE y a droit par `catalogue.gerer`', async () => {
    const { svc, db } = service(DEPOT);
    await expect(
      svc.urlDeLectureDuDocument(db, 'd1', 'biblio', [FONCTIONS.CATALOGUE_GERER]),
    ).resolves.toBeTruthy();
  });

  it('⚠ un TIERS reçoit « introuvable », pas « interdit »', async () => {
    // Symétrie du reste du module : un 403 dirait qu'un dépôt existe sous cet
    // identifiant et appartient à quelqu'un d'autre.
    const { svc, db } = service(DEPOT);
    await expect(svc.urlDeLectureDuDocument(db, 'd1', 'un-autre', [])).rejects.toThrow(
      /introuvable/i,
    );
  });

  it('⚠ un directeur d’un AUTRE dépôt n’y a pas droit non plus', async () => {
    // L'auto-portage de `depot.valider` vaut aussi pour le document : porter la
    // fonction ne donne pas accès aux dépôts d'un collègue.
    const { svc, db } = service({ ...DEPOT, directorId: 'un-collegue' });
    await expect(
      svc.urlDeLectureDuDocument(db, 'd1', 'u-ens', [FONCTIONS.DEPOT_VALIDER]),
    ).rejects.toThrow(/introuvable/i);
  });

  it('⚠ c’est le fichier CLAIR qui est servi, jamais le blob chiffré', async () => {
    // Le blob AEAD segmenté n'est lisible que par le lecteur natif, avec une
    // licence : le servir ici donnerait un fichier que personne ne peut ouvrir.
    const { svc, db, getSignedDownloadUrl } = service(DEPOT);
    await svc.urlDeLectureDuDocument(db, 'd1', 'etudiant', []);
    expect(getSignedDownloadUrl.mock.calls[0][0]).toBe('d1/memoire.pdf');
  });

  it('⚠ le TTL est de cinq minutes, comme la lecture en ligne d’une notice', async () => {
    // Il borne la fenêtre pendant laquelle une URL copiée depuis l'onglet
    // Réseau reste utilisable. Le rallonger « par confort » l'élargit.
    const { svc, db, getSignedDownloadUrl } = service(DEPOT);
    const r = await svc.urlDeLectureDuDocument(db, 'd1', 'etudiant', []);
    expect(r.expiresInSeconds).toBe(300);
    expect(getSignedDownloadUrl.mock.calls[0][2]).toBe(300);
  });

  it('un dépôt SANS document le dit, au lieu de signer une clé vide', async () => {
    const { svc, db } = service({ ...DEPOT, fileKey: null });
    await expect(svc.urlDeLectureDuDocument(db, 'd1', 'etudiant', [])).rejects.toThrow(
      /n’a pas de document/i,
    );
  });
});
