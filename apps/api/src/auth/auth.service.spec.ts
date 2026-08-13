import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';

const PASSWORD = 'SuperSecret1';

function makeDb(user: unknown) {
  return { user: { findUnique: vi.fn().mockResolvedValue(user) } } as any;
}

describe('AuthService — login', () => {
  let service: AuthService;
  let hash: string;

  beforeEach(async () => {
    service = new AuthService(new JwtService({ secret: 'test-secret' }));
    hash = await bcrypt.hash(PASSWORD, 4);
  });

  const activeUser = () => ({
    id: 'user-1',
    email: 'awa@zinda.bf',
    firstName: 'Awa',
    lastName: 'Traoré',
    role: 'STUDENT',
    status: 'ACTIVE',
    className: 'L1_DROIT',
    password: hash,
  });

  it('validateCredentials : renvoie l’utilisateur, email insensible à la casse', async () => {
    const db = makeDb(activeUser());
    const user = await service.validateCredentials(db, {
      email: '  AWA@ZINDA.BF ',
      password: PASSWORD,
    });
    expect(user).toMatchObject({ id: 'user-1', email: 'awa@zinda.bf', role: 'STUDENT' });
    expect(db.user.findUnique).toHaveBeenCalledWith({ where: { email: 'awa@zinda.bf' } });
  });

  it('issueSession : JWT bien formé + profil sans mot de passe, payload sub/role/tenant', async () => {
    const result = await service.issueSession(activeUser() as any, 'zinda');
    expect(result.accessToken.split('.')).toHaveLength(3);
    expect(result.user).toMatchObject({ email: 'awa@zinda.bf', role: 'STUDENT' });
    expect((result.user as any).password).toBeUndefined();
    const payload = new JwtService({ secret: 'test-secret' }).verify(result.accessToken);
    expect(payload).toMatchObject({ sub: 'user-1', role: 'STUDENT', tenant: 'zinda' });
  });

  it('mot de passe erroné → 401 (même message que compte inconnu)', async () => {
    const db = makeDb(activeUser());
    await expect(
      service.validateCredentials(db, { email: 'awa@zinda.bf', password: 'mauvais' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('compte inconnu → 401 identique', async () => {
    const db = makeDb(null);
    await expect(
      service.validateCredentials(db, { email: 'ghost@zinda.bf', password: PASSWORD }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('mot de passe jamais défini → 401 (pas de fuite)', async () => {
    const db = makeDb({ ...activeUser(), password: null });
    await expect(
      service.validateCredentials(db, { email: 'awa@zinda.bf', password: PASSWORD }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('compte PENDING → 403 explicite', async () => {
    const db = makeDb({ ...activeUser(), status: 'PENDING' });
    await expect(
      service.validateCredentials(db, { email: 'awa@zinda.bf', password: PASSWORD }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('AuthService — changePassword', () => {
  let service: AuthService;
  let hash: string;

  beforeEach(async () => {
    service = new AuthService(new JwtService({ secret: 'test-secret' }));
    hash = await bcrypt.hash(PASSWORD, 4);
  });

  /** db factory qui capture le data passé à update, avec un user courant donné. */
  function makeChangeDb(user: unknown) {
    const update = vi.fn().mockResolvedValue({});
    return {
      db: { user: { findUnique: vi.fn().mockResolvedValue(user), update } } as any,
      update,
    };
  }

  const userWithPw = () => ({ id: 'u1', password: hash, totpEnabledAt: new Date(), totpSecret: 'S' });

  it('mauvais mot de passe actuel → 401, aucune écriture', async () => {
    const { db, update } = makeChangeDb(userWithPw());
    await expect(
      service.changePassword(db, 'u1', 'mauvais-actuel', 'NouveauPass1'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(update).not.toHaveBeenCalled();
  });

  it('bon mot de passe actuel → écrit un nouveau hash (et rien d’autre : 2FA préservée)', async () => {
    const { db, update } = makeChangeDb(userWithPw());
    await service.changePassword(db, 'u1', PASSWORD, 'NouveauPass1');
    expect(update).toHaveBeenCalledTimes(1);
    const arg = update.mock.calls[0][0];
    // seule la colonne password est touchée
    expect(Object.keys(arg.data)).toEqual(['password']);
    // c'est bien un hash du nouveau mot de passe, pas l'ancien
    expect(arg.data.password).not.toBe(hash);
    expect(await bcrypt.compare('NouveauPass1', arg.data.password)).toBe(true);
  });

  it('nouveau identique à l’ancien → 400', async () => {
    const { db, update } = makeChangeDb(userWithPw());
    await expect(
      service.changePassword(db, 'u1', PASSWORD, PASSWORD),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });

  it('utilisateur sans mot de passe défini → 401', async () => {
    const { db } = makeChangeDb({ id: 'u1', password: null });
    await expect(
      service.changePassword(db, 'u1', PASSWORD, 'NouveauPass1'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
