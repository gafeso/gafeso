import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AccountsService } from './accounts.service';

function p2002() {
  return new Prisma.PrismaClientKnownRequestError('duplicate', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

// ── Mocks ────────────────────────────────────────────────────
/**
 * ⚠ LA DOUBLURE REND MAINTENANT UNE ISSUE, comme le service réel.
 *
 * Elle rendait `undefined` — plus permissive que `MailService`, donc aveugle
 * là où il décide. C'est le même défaut que le `select` de l'entrepôt OAI et
 * que la doublure du plafond de recherche : depuis le 12 septembre 2026,
 * `MailService` rend un `MailOutcome` et ne jette plus pour une panne SMTP.
 */
function makeMail(available = true) {
  const issue = available
    ? { sent: true as const }
    : { sent: false as const, reason: 'smtp_absent' as const };
  return {
    available,
    sendSetPasswordLink: vi.fn().mockResolvedValue(issue),
    notifyManagerPendingAccount: vi.fn().mockResolvedValue(issue),
  };
}

function makeConfig() {
  return { get: vi.fn().mockReturnValue('http://localhost:3000') };
}

/**
 * Construit un faux client Prisma tenant. Les delegates renvoient des valeurs
 * par défaut ; $transaction exécute le callback avec ce même client.
 */
function makeDb(overrides: Record<string, unknown> = {}) {
  const db: any = {
    user: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([{ email: 'manager@zinda.bf' }]),
      create: vi.fn(async ({ data }: any) => ({ id: 'user-1', ...data })),
      update: vi.fn(async ({ where, data }: any) => ({ id: where.id, email: 'awa@zinda.bf', ...data })),
      delete: vi.fn().mockResolvedValue({}),
    },
    expectedStudent: {
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
      upsert: vi.fn().mockResolvedValue({}),
    },
    passwordToken: {
      create: vi.fn(async ({ data }: any) => ({ id: 'token-1', ...data })),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    enrollment: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn(async ({ data }: any) => ({ id: 'enr-1', ...data })),
    },
    // La classe déclarée à l'inscription est RÉSOLUE contre les classes
    // réelles : elle produit une inscription, pas une étiquette libre.
    schoolClass: {
      findUnique: vi.fn(async ({ where }: any) =>
        where.name === 'L1_DROIT' ? { id: 'class-1', name: 'L1_DROIT' } : null,
      ),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
  db.$transaction = vi.fn(async (cb: any) => cb(db));
  return Object.assign(db, overrides);
}

function makeRoles() {
  return {
    buildAssignmentPatch: vi.fn(async (_db: any, roleId: string | null) =>
      roleId === null ? { roleId: null } : { roleId },
    ),
  };
}

function makePatrons() {
  return { deletePatron: vi.fn().mockResolvedValue({ deleted: true }) };
}

function makeService(
  mail = makeMail(),
  config = makeConfig(),
  roles = makeRoles(),
  patrons = makePatrons(),
) {
  return {
    service: new AccountsService(mail as any, config as any, roles as any, patrons as any),
    mail,
    config,
    roles,
    patrons,
  };
}

const baseDto = {
  matricule: 'ETU-2026-0142',
  email: 'awa.traore@ecole.bf',
  firstName: 'Awa',
  lastName: 'Traoré',
  className: 'L1_DROIT',
};

// ── Tests ────────────────────────────────────────────────────
describe('AccountsService — création de compte (2 chemins)', () => {
  let mail: ReturnType<typeof makeMail>;
  let service: AccountsService;

  beforeEach(() => {
    ({ service, mail } = makeService());
  });

  it('CHEMIN 1 — matricule + email connus → compte ACTIVE, lien envoyé, entrée réclamée', async () => {
    const db = makeDb();
    db.expectedStudent.findUnique.mockResolvedValue({
      id: 'es-1',
      matricule: baseDto.matricule,
      email: 'AWA.TRAORE@ECOLE.BF', // casse différente : doit matcher quand même
      firstName: 'Awa',
      lastName: 'Traoré',
      className: 'L1_DROIT',
      claimed: false,
    });

    const result = await service.register(db, { ...baseDto });

    expect(result.autoActivated).toBe(true);
    expect(result.status).toBe('ACTIVE');

    // Compte créé en ACTIVE avec date d'activation
    const createArg = db.user.create.mock.calls[0][0].data;
    expect(createArg.status).toBe('ACTIVE');
    expect(createArg.activatedAt).toBeInstanceOf(Date);
    expect(createArg.email).toBe('awa.traore@ecole.bf'); // normalisé en minuscules

    // Entrée attendue marquée comme réclamée
    expect(db.expectedStudent.update).toHaveBeenCalledWith({
      where: { id: 'es-1' },
      data: { claimed: true },
    });

    // Token créé (24h) + lien envoyé, PAS de mot de passe en clair
    const tokenArg = db.passwordToken.create.mock.calls[0][0].data;
    expect(tokenArg.token).toMatch(/^[a-f0-9]{64}$/);
    expect(tokenArg.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(mail.sendSetPasswordLink).toHaveBeenCalledTimes(1);
    const [, sentUrl] = mail.sendSetPasswordLink.mock.calls[0];
    expect(sentUrl).toContain('/definir-mot-de-passe?token=');
    expect(mail.notifyManagerPendingAccount).not.toHaveBeenCalled();
  });

  it('CHEMIN 2 — inconnu de la liste → compte PENDING, gestionnaire notifié, aucun token', async () => {
    const db = makeDb(); // expectedStudent.findUnique → null

    const result = await service.register(db, { ...baseDto });

    expect(result.autoActivated).toBe(false);
    expect(result.status).toBe('PENDING');

    const createArg = db.user.create.mock.calls[0][0].data;
    expect(createArg.status).toBe('PENDING');
    expect(createArg.activatedAt).toBeNull();

    expect(db.passwordToken.create).not.toHaveBeenCalled();
    expect(mail.sendSetPasswordLink).not.toHaveBeenCalled();
    // Les gestionnaires ACTIFS de l'école sont notifiés (lus en base)
    expect(mail.notifyManagerPendingAccount).toHaveBeenCalledWith(
      ['manager@zinda.bf'],
      'awa.traore@ecole.bf',
      'ETU-2026-0142',
    );
  });

  it('une panne SMTP ne fait pas échouer la création du compte', async () => {
    const db = makeDb();
    db.expectedStudent.findUnique.mockResolvedValue({
      id: 'es-1',
      matricule: baseDto.matricule,
      email: baseDto.email,
      claimed: false,
    });
    mail.sendSetPasswordLink.mockRejectedValue(new Error('SMTP down'));

    const result = await service.register(db, { ...baseDto });

    expect(result.status).toBe('ACTIVE'); // le compte est créé malgré la panne
    expect(db.passwordToken.create).toHaveBeenCalledTimes(1);
  });

  it('CHEMIN 2 bis — matricule connu mais email différent → PENDING (pas de match)', async () => {
    const db = makeDb();
    db.expectedStudent.findUnique.mockResolvedValue({
      id: 'es-2',
      matricule: baseDto.matricule,
      email: 'quelquun.dautre@ecole.bf',
      firstName: 'Autre',
      lastName: 'Personne',
      className: 'L1_DROIT',
      claimed: false,
    });

    const result = await service.register(db, { ...baseDto });

    expect(result.status).toBe('PENDING');
    expect(db.expectedStudent.update).not.toHaveBeenCalled();
    expect(mail.notifyManagerPendingAccount).toHaveBeenCalledTimes(1);
  });

  // ── Sort de l'email : l'interface doit pouvoir dire la vérité (bloc 5) ──
  it('remonte { sent: true } quand l’email part', async () => {
    const db = makeDb();
    db.expectedStudent.findUnique.mockResolvedValue({
      id: 'es-1', matricule: baseDto.matricule, email: baseDto.email, claimed: false,
    });
    const result = await service.register(db, { ...baseDto });
    expect(result.mail).toEqual({ sent: true });
  });

  it('SANS SMTP : le compte est créé, et l’absence d’envoi est DITE', async () => {
    // Le compte doit être créé quand même — le produit fonctionne sans mail,
    // il est seulement moins pratique. Mais l'appelant doit le savoir pour
    // proposer le lien à l'administrateur.
    const { service: svc, mail: m } = makeService(makeMail(false));
    const db = makeDb();
    db.expectedStudent.findUnique.mockResolvedValue({
      id: 'es-1', matricule: baseDto.matricule, email: baseDto.email, claimed: false,
    });

    const result = await svc.register(db, { ...baseDto });

    expect(result.status).toBe('ACTIVE');
    // ⚠ L'ANCIENNE ASSERTION ÉTAIT `not.toHaveBeenCalled()`, et elle portait une
    // vraie propriété : ne pas tenter un envoi qu'on sait impossible. Elle la
    // portait au MAUVAIS NIVEAU. `sendSetPasswordSafely` consultait
    // `mail.available` avant d'appeler ; depuis que `MailService` rend une
    // issue, c'est LUI qui court-circuite — `send()` sort sur
    // `!this.transporter` sans ouvrir de connexion. La garantie « aucune
    // tentative réseau » est donc intacte, un cran plus bas, et ce qui compte
    // pour l'appelant est l'ISSUE.
    expect(result.mail).toEqual({ sent: false, reason: 'smtp_absent' });
  });

  it('PANNE SMTP : le compte est créé et l’échec est remonté, pas avalé', async () => {
    const db = makeDb();
    db.expectedStudent.findUnique.mockResolvedValue({
      id: 'es-1', matricule: baseDto.matricule, email: baseDto.email, claimed: false,
    });
    // `MailService` ne JETTE plus : il rend l'issue. (Le filet `try` de
    // `sendSetPasswordSafely` couvre encore l'inattendu — éprouvé plus bas.)
    mail.sendSetPasswordLink.mockResolvedValue({
      sent: false, reason: 'smtp_error', detail: 'certificate mismatch',
    });

    const result = await service.register(db, { ...baseDto });

    expect(result.status).toBe('ACTIVE');
    // Auparavant l'échec était journalisé puis PERDU : l'interface annonçait
    // « un email a été envoyé » sans le savoir.
    expect(result.mail).toMatchObject({ sent: false, reason: 'smtp_error' });
    expect((result.mail as { detail?: string }).detail).toContain('certificate mismatch');
  });

  // ── Repli : récupérer le lien encore valide (bloc 5) ──
  it('passwordLink renvoie le lien du jeton valide le plus récent', async () => {
    const db = makeDb();
    db.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'awa@zinda.bf' });
    db.passwordToken.findFirst = vi.fn().mockResolvedValue({
      token: 'a'.repeat(64),
      expiresAt: new Date(Date.now() + 3600_000),
    });

    const result = await service.passwordLink(db, 'user-1');

    expect(result.url).toBe(`http://localhost:3000/definir-mot-de-passe?token=${'a'.repeat(64)}`);
    expect(result.email).toBe('awa@zinda.bf');
    // Seuls les jetons NON consommés et NON expirés sont éligibles.
    const where = db.passwordToken.findFirst.mock.calls[0][0].where;
    expect(where.used).toBe(false);
    expect(where.expiresAt.gt).toBeInstanceOf(Date);
  });

  it('passwordLink : 404 explicite si aucun lien valide', async () => {
    const db = makeDb();
    db.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'awa@zinda.bf' });
    db.passwordToken.findFirst = vi.fn().mockResolvedValue(null);

    await expect(service.passwordLink(db, 'user-1')).rejects.toThrow(NotFoundException);
  });

  // ── Source de vérité unique de la classe (bloc 1) ──
  it('inscrire crée l’INSCRIPTION et le reflet dans la même transaction', async () => {
    const db = makeDb();

    await service.register(db, { ...baseDto });

    // L'inscription est créée, rattachée à la VRAIE classe (par id, pas par nom).
    expect(db.enrollment.create).toHaveBeenCalledTimes(1);
    const enrolArg = (db.enrollment.create as any).mock.calls[0][0].data;
    expect(enrolArg.classId).toBe('class-1');
    expect(enrolArg.academicYear).toMatch(/^\d{4}-\d{4}$/);

    // Et `class_name` reflète le nom canonique de cette même classe : les deux
    // écritures sont dans la même transaction, elles ne peuvent pas diverger.
    const createArg = (db.user.create as any).mock.calls[0][0].data;
    expect(createArg.className).toBe('L1_DROIT');
  });

  it('refuse une classe inconnue plutôt que de la recopier en texte libre', async () => {
    const db = makeDb();

    await expect(
      service.register(db, { ...baseDto, className: 'CLASSE_QUI_NEXISTE_PAS' }),
    ).rejects.toThrow(/inconnue/i);

    // Rien n'est écrit : ni compte, ni inscription. Recopier ce nom aurait
    // produit un compte dont aucune règle d'accès ne peut jamais matcher.
    expect(db.user.create).not.toHaveBeenCalled();
    expect(db.enrollment.create).not.toHaveBeenCalled();
  });

  it('listAccounts renvoie les comptes filtrés + le compteur par statut', async () => {
    const db = makeDb();
    db.user.count = vi.fn().mockResolvedValue(2);
    db.user.findMany = vi.fn().mockResolvedValue([
      { id: 'u1', status: 'PENDING', email: 'a@x.bf' },
      { id: 'u2', status: 'PENDING', email: 'b@x.bf' },
    ]);
    db.user.groupBy = vi.fn().mockResolvedValue([
      { status: 'PENDING', _count: { _all: 2 } },
      { status: 'ACTIVE', _count: { _all: 5 } },
    ]);

    const result = await service.listAccounts(db, { status: 'PENDING' as any });

    expect(result.total).toBe(2);
    expect(result.counts).toEqual({ PENDING: 2, ACTIVE: 5 });
    expect(db.user.findMany.mock.calls[0][0].where.status).toBe('PENDING');
  });

  it('createStaff crée un compte ACTIVE et envoie le lien de mot de passe', async () => {
    const db = makeDb();
    db.user.findUnique = vi.fn().mockResolvedValue(null);
    const result = await service.createStaff(db, {
      email: 'Salif.O@exemple.bf',
      firstName: 'Salif',
      lastName: 'Ouédraogo',
      role: 'LIBRARIAN' as any,
    });
    const createArg = db.user.create.mock.calls[0][0].data;
    expect(createArg.email).toBe('salif.o@exemple.bf'); // normalisé
    expect(createArg.role).toBe('LIBRARIAN');
    expect(createArg.status).toBe('ACTIVE');
    expect(db.passwordToken.create).toHaveBeenCalledTimes(1);
    expect(mail.sendSetPasswordLink).toHaveBeenCalledTimes(1);
    expect((result as any).password).toBeUndefined();
  });

  it('createStaff refuse un email déjà pris', async () => {
    const db = makeDb();
    db.user.findUnique = vi.fn().mockResolvedValue({ id: 'x' });
    await expect(
      service.createStaff(db, {
        email: 'x@exemple.bf',
        firstName: 'X',
        lastName: 'Y',
        role: 'MANAGER' as any,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('setStatus met à jour le statut (suspension)', async () => {
    const db = makeDb();
    db.user.findUnique = vi.fn().mockResolvedValue({ id: 'u1', status: 'ACTIVE' });
    const result = await service.setStatus(db, 'u1', 'SUSPENDED' as any);
    expect(result.status).toBe('SUSPENDED');
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { status: 'SUSPENDED' },
    });
  });

  it('refuse un doublon (email ou matricule déjà utilisé)', async () => {
    const db = makeDb();
    db.user.findFirst.mockResolvedValue({ id: 'existing' });

    await expect(service.register(db, { ...baseDto })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(db.user.create).not.toHaveBeenCalled();
  });
});

describe('AccountsService — inscription personnel/autre (sans matricule)', () => {
  it('toujours PENDING : jamais d’auto-activation, aucun token, gestionnaires notifiés', async () => {
    const { service, mail } = makeService();
    const db = makeDb();
    // Même si la liste pré-chargée contient des entrées, sans matricule elle
    // n'est jamais consultée.
    db.expectedStudent.findUnique.mockResolvedValue({
      id: 'es-1',
      email: 'boukary.sana@exemple.bf',
      claimed: false,
    });

    const result = await service.register(db, {
      email: 'Boukary.Sana@exemple.bf',
      firstName: 'Boukary',
      lastName: 'Sana',
    });

    expect(result.autoActivated).toBe(false);
    expect(result.status).toBe('PENDING');
    expect(db.expectedStudent.findUnique).not.toHaveBeenCalled();
    const createArg = db.user.create.mock.calls[0][0].data;
    expect(createArg.matricule).toBeNull();
    expect(createArg.className).toBeNull();
    expect(createArg.role).toBe('STUDENT'); // enum neutre : aucune fonction
    expect(db.passwordToken.create).not.toHaveBeenCalled();
    expect(mail.notifyManagerPendingAccount).toHaveBeenCalledWith(
      ['manager@zinda.bf'],
      'boukary.sana@exemple.bf',
      null,
    );
  });

  it('matricule fourni sans classe → 400', async () => {
    const { service } = makeService();
    const db = makeDb();
    await expect(
      service.register(db, {
        matricule: 'ETU-1',
        email: 'x@exemple.bf',
        firstName: 'X',
        lastName: 'Y',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.user.create).not.toHaveBeenCalled();
  });
});

describe('AccountsService — activation avec rôle (étape C)', () => {
  it('roleId fourni : le rôle est posé dans la même mise à jour que l’activation', async () => {
    const { service, roles } = makeService();
    const db = makeDb();
    db.user.findUnique.mockResolvedValue({ id: 'user-9', status: 'PENDING' });

    await service.activateAccount(db, 'user-9', 'role-doc');

    expect(roles.buildAssignmentPatch).toHaveBeenCalledWith(db, 'role-doc');
    const updateArg = db.user.update.mock.calls[0][0].data;
    expect(updateArg.status).toBe('ACTIVE');
    expect(updateArg.roleId).toBe('role-doc');
  });

  it('rôle introuvable → 404, le compte n’est PAS activé', async () => {
    const { service, roles } = makeService();
    roles.buildAssignmentPatch.mockRejectedValue(new NotFoundException('Rôle introuvable.'));
    const db = makeDb();
    db.user.findUnique.mockResolvedValue({ id: 'user-9', status: 'PENDING' });

    await expect(
      service.activateAccount(db, 'user-9', 'ghost'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('sans roleId : activation simple, aucun rôle touché', async () => {
    const { service, roles } = makeService();
    const db = makeDb();
    db.user.findUnique.mockResolvedValue({ id: 'user-9', status: 'PENDING' });

    await service.activateAccount(db, 'user-9');

    expect(roles.buildAssignmentPatch).not.toHaveBeenCalled();
    expect(db.user.update.mock.calls[0][0].data.roleId).toBeUndefined();
  });
});

describe('AccountsService — activation manuelle (gestionnaire)', () => {
  let mail: ReturnType<typeof makeMail>;
  let service: AccountsService;

  beforeEach(() => {
    ({ service, mail } = makeService());
  });

  it('active un compte PENDING et envoie le lien de mot de passe', async () => {
    const db = makeDb();
    db.user.findUnique.mockResolvedValue({
      id: 'user-9',
      email: 'awa.traore@ecole.bf',
      status: 'PENDING',
    });

    const result = await service.activateAccount(db, 'user-9');

    expect(result.status).toBe('ACTIVE');
    const updateArg = db.user.update.mock.calls[0][0].data;
    expect(updateArg.status).toBe('ACTIVE');
    expect(updateArg.activatedAt).toBeInstanceOf(Date);
    expect(db.passwordToken.create).toHaveBeenCalledTimes(1);
    expect(mail.sendSetPasswordLink).toHaveBeenCalledTimes(1);
  });

  it('échoue si le compte est introuvable', async () => {
    const db = makeDb(); // findUnique → null
    await expect(service.activateAccount(db, 'nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('refuse d’activer un compte déjà ACTIVE', async () => {
    const db = makeDb();
    db.user.findUnique.mockResolvedValue({ id: 'u', email: 'x@y.z', status: 'ACTIVE' });
    await expect(service.activateAccount(db, 'u')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('AccountsService — définition du mot de passe', () => {
  let service: AccountsService;

  beforeEach(() => {
    ({ service } = makeService());
  });

  it('hache le mot de passe et invalide le token (usage unique)', async () => {
    const db = makeDb();
    db.passwordToken.findUnique.mockResolvedValue({
      id: 'token-9',
      userId: 'user-9',
      token: 'abc',
      used: false,
      expiresAt: new Date(Date.now() + 3600 * 1000),
      user: { id: 'user-9' },
    });

    const result = await service.setPassword(db, 'abc', 'SuperSecret1');

    expect(result.userId).toBe('user-9');

    // Mot de passe stocké HACHÉ (jamais en clair)
    const pwdArg = db.user.update.mock.calls[0][0].data.password;
    expect(pwdArg).not.toBe('SuperSecret1');
    expect(await bcrypt.compare('SuperSecret1', pwdArg)).toBe(true);

    // Token marqué comme utilisé
    expect(db.passwordToken.update).toHaveBeenCalledWith({
      where: { id: 'token-9' },
      data: { used: true },
    });
  });

  it('rejette un token expiré', async () => {
    const db = makeDb();
    db.passwordToken.findUnique.mockResolvedValue({
      id: 't',
      userId: 'u',
      token: 'abc',
      used: false,
      expiresAt: new Date(Date.now() - 1000), // expiré
      user: { id: 'u' },
    });
    await expect(service.setPassword(db, 'abc', 'SuperSecret1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('rejette un token déjà utilisé', async () => {
    const db = makeDb();
    db.passwordToken.findUnique.mockResolvedValue({
      id: 't',
      userId: 'u',
      token: 'abc',
      used: true,
      expiresAt: new Date(Date.now() + 3600 * 1000),
      user: { id: 'u' },
    });
    await expect(service.setPassword(db, 'abc', 'SuperSecret1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejette un token inconnu', async () => {
    const db = makeDb(); // findUnique → null
    await expect(service.setPassword(db, 'ghost', 'SuperSecret1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('AccountsService — import CSV', () => {
  let service: AccountsService;

  beforeEach(() => {
    ({ service } = makeService());
  });

  it('importe les lignes valides et ignore les incomplètes', async () => {
    const db = makeDb();
    const csv = [
      'matricule,email,firstName,lastName,className',
      'ETU-1,a@ecole.bf,Awa,Traoré,L1_DROIT',
      'ETU-2,b@ecole.bf,Boubacar,Diallo,L1_DROIT',
      'ETU-3,,SansEmail,X,L1_DROIT', // incomplet → ignoré
    ].join('\n');

    const result = await service.importExpectedStudents(db, csv);

    expect(result.imported).toBe(2);
    expect(result.skipped).toBe(1);
    expect(db.expectedStudent.upsert).toHaveBeenCalledTimes(2);
    // email normalisé en minuscules
    expect(db.expectedStudent.upsert.mock.calls[0][0].create.email).toBe('a@ecole.bf');
    // erreur détaillée : ligne 4 (en-tête=1), champ email manquant
    expect(result.errors).toEqual([
      {
        line: 4,
        matricule: 'ETU-3',
        reason: 'champ(s) requis manquant(s) : email',
      },
    ]);
  });

  it('accepte les en-têtes en français (nom, prenom, classe)', async () => {
    const db = makeDb();
    const csv = ['matricule,email,prenom,nom,classe', 'ETU-9,c@ecole.bf,Fatou,Sow,M2_MEDECINE'].join(
      '\n',
    );

    const result = await service.importExpectedStudents(db, csv);

    expect(result.imported).toBe(1);
    const createArg = db.expectedStudent.upsert.mock.calls[0][0].create;
    expect(createArg.firstName).toBe('Fatou');
    expect(createArg.lastName).toBe('Sow');
    expect(createArg.className).toBe('M2_MEDECINE');
  });

  it('une ligne au nombre de colonnes incorrect est ignorée, pas fatale (relax_column_count)', async () => {
    const db = makeDb();
    const csv = [
      'matricule,email,firstName,lastName,className',
      'ETU-1,a@ecole.bf,Awa,Traoré,L1_DROIT',
      'ligne_completement_malformee', // colonnes en moins : sans relax_column_count, csv-parse lève
      'ETU-2,b@ecole.bf,Boubacar,Diallo,L1_DROIT',
    ].join('\n');

    const result = await service.importExpectedStudents(db, csv);

    expect(result.imported).toBe(2);
    expect(result.skipped).toBe(1);
    expect(result.errors[0].line).toBe(3);
  });

  it('rejette un email invalide avec son motif, sans bloquer les autres lignes', async () => {
    const db = makeDb();
    const csv = [
      'matricule,email,firstName,lastName,className',
      'ETU-1,pas-un-email,Awa,Traoré,L1_DROIT',
      'ETU-2,ok@ecole.bf,Boubacar,Diallo,L1_DROIT',
    ].join('\n');

    const result = await service.importExpectedStudents(db, csv);

    expect(result.imported).toBe(1);
    expect(result.errors).toEqual([
      { line: 2, matricule: 'ETU-1', reason: 'email invalide : « pas-un-email »' },
    ]);
  });

  it('détecte un doublon de matricule DANS le fichier (la 1re occurrence est conservée)', async () => {
    const db = makeDb();
    const csv = [
      'matricule,email,firstName,lastName,className',
      'ETU-1,a@ecole.bf,Awa,Traoré,L1_DROIT',
      'ETU-1,autre@ecole.bf,Autre,Personne,M2_MEDECINE',
    ].join('\n');

    const result = await service.importExpectedStudents(db, csv);

    expect(result.imported).toBe(1);
    expect(db.expectedStudent.upsert).toHaveBeenCalledTimes(1);
    // la valeur conservée est la PREMIÈRE (a@ecole.bf), pas l'écrasement silencieux
    expect(db.expectedStudent.upsert.mock.calls[0][0].create.email).toBe('a@ecole.bf');
    expect(result.errors[0].reason).toContain('en double');
  });

  it('CSV globalement illisible → 400 explicite (pas de 500)', async () => {
    const db = makeDb();
    // Guillemet ouvrant non fermé sur une ligne de données → csv-parse lève.
    const csv = 'matricule,email,firstName,lastName,className\n"ETU-1,a@ecole.bf,Awa';
    await expect(service.importExpectedStudents(db, csv)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('AccountsService — modification', () => {
  it('compte introuvable → 404', async () => {
    const { service } = makeService();
    const db = makeDb();
    await expect(service.update(db, 'ghost', { firstName: 'X' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('modifie prénom/nom/email', async () => {
    const { service } = makeService();
    const db = makeDb();
    db.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'old@exemple.bf' });
    db.user.update = vi.fn(async ({ data }: any) => ({ id: 'user-1', ...data }));

    const result = await service.update(db, 'user-1', {
      firstName: 'Awa',
      lastName: 'Traoré',
      email: 'AWA@EXEMPLE.BF',
    });

    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        firstName: 'Awa',
        lastName: 'Traoré',
        email: 'awa@exemple.bf', // normalisé en minuscules
      },
      select: expect.any(Object),
    });
    expect(result.email).toBe('awa@exemple.bf');
  });

  it('n’écrit JAMAIS la classe : elle dérive de l’inscription', async () => {
    // Régression du bug vécu : ce chemin écrivait `class_name` en texte libre
    // sans toucher aux inscriptions. Un compte pouvait afficher « L1_DROIT »
    // alors que l'inscription réelle était « M2_MEDECINE » — et l'accès était
    // refusé sans explication, les règles comparant `class_name`.
    const { service } = makeService();
    const db = makeDb();
    db.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'old@exemple.bf' });
    db.user.update = vi.fn(async ({ data }: any) => ({ id: 'user-1', ...data }));

    // `className` n'existe plus dans UpdateAccountDto ; même forcé, il est ignoré.
    await service.update(db, 'user-1', { className: 'L1_DROIT' } as never);

    const [[call]] = (db.user.update as any).mock.calls;
    expect(call.data).not.toHaveProperty('className');
  });

  it('email déjà utilisé par un autre compte → 409 (pas de 500 brut)', async () => {
    const { service } = makeService();
    const db = makeDb();
    db.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'old@exemple.bf' });
    db.user.update = vi.fn().mockRejectedValue(p2002());

    await expect(
      service.update(db, 'user-1', { email: 'deja-pris@exemple.bf' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('roleId délègue à RolesService.buildAssignmentPatch (même logique que l’assignation dédiée)', async () => {
    const { service, roles } = makeService();
    const db = makeDb();
    db.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'x@exemple.bf' });
    db.user.update = vi.fn(async ({ data }: any) => ({ id: 'user-1', ...data }));
    (roles.buildAssignmentPatch as any).mockResolvedValue({ roleId: 'role-9', role: 'MANAGER' });

    const result = await service.update(db, 'user-1', { roleId: 'role-9' });

    expect(roles.buildAssignmentPatch).toHaveBeenCalledWith(db, 'role-9');
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { roleId: 'role-9', role: 'MANAGER' },
      select: expect.any(Object),
    });
    expect(result.roleId).toBe('role-9');
  });

  it('champs absents du DTO restent inchangés (patch partiel)', async () => {
    const { service, roles } = makeService();
    const db = makeDb();
    db.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'x@exemple.bf' });
    db.user.update = vi.fn(async ({ data }: any) => ({ id: 'user-1', ...data }));

    await service.update(db, 'user-1', { firstName: 'Seulement' });

    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { firstName: 'Seulement' },
      select: expect.any(Object),
    });
    expect(roles.buildAssignmentPatch).not.toHaveBeenCalled();
  });
});

describe('AccountsService — suppression définitive', () => {
  it('compte introuvable → 404', async () => {
    const { service } = makeService();
    const db = makeDb();
    await expect(service.remove(db, 'ghost')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('supprime un compte de test sans adhérent lié (cascade tokens + inscriptions)', async () => {
    const { service, patrons } = makeService();
    const db = makeDb();
    db.user.findUnique.mockResolvedValue({ id: 'user-1', patron: null });

    const result = await service.remove(db, 'user-1');

    expect(result).toEqual({ deleted: true });
    expect(patrons.deletePatron).not.toHaveBeenCalled();
    expect(db.passwordToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    expect(db.enrollment.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    expect(db.user.delete).toHaveBeenCalledWith({ where: { id: 'user-1' } });
  });

  it('adhérent lié sans prêt en cours : supprimé avec le compte', async () => {
    const { service, patrons } = makeService();
    const db = makeDb();
    db.user.findUnique.mockResolvedValue({ id: 'user-1', patron: { id: 'patron-1' } });

    const result = await service.remove(db, 'user-1');

    expect(patrons.deletePatron).toHaveBeenCalledWith(db, 'patron-1');
    expect(result).toEqual({ deleted: true });
    expect(db.user.delete).toHaveBeenCalled();
  });

  it('adhérent avec prêt en cours : refuse proprement, ne supprime rien (pas de crash)', async () => {
    const { service, patrons } = makeService();
    patrons.deletePatron.mockRejectedValue(
      new ConflictException('Impossible de supprimer : prêts en cours ou réservations actives.'),
    );
    const db = makeDb();
    db.user.findUnique.mockResolvedValue({ id: 'user-1', patron: { id: 'patron-1' } });

    await expect(service.remove(db, 'user-1')).rejects.toBeInstanceOf(ConflictException);

    // Rien d'autre n'a été touché : abandon net avant le reste de la cascade.
    expect(db.passwordToken.deleteMany).not.toHaveBeenCalled();
    expect(db.enrollment.deleteMany).not.toHaveBeenCalled();
    expect(db.user.delete).not.toHaveBeenCalled();
  });
});
