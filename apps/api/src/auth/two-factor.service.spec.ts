import { describe, expect, it, vi, afterEach } from 'vitest';
import { authenticator } from 'otplib';
import { createHash } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { TwoFactorService } from './two-factor.service';

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
const makeMail = () => ({ available: false, sendTwoFactorCode: vi.fn() });

/** DB tenant simulée, avec état mutable (pour rejeu / consommation). */
function makeDb(initial: Record<string, unknown>) {
  const state: Record<string, unknown> = {
    id: 'u1',
    email: 'a@x.fr',
    role: 'ADMIN',
    password: null,
    totpSecret: null,
    totpEnabledAt: null,
    totpLastStep: null,
    backupCodes: null,
    emailOtpHash: null,
    emailOtpExpiresAt: null,
    emailOtpAttempts: null,
    ...initial,
  };
  return {
    user: {
      findUnique: vi.fn(async () => ({ ...state })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(state, data);
        return { ...state };
      }),
    },
    _state: () => state,
  };
}

afterEach(() => {
  authenticator.options = { window: 1 };
});

function service() {
  return new TwoFactorService(makeMail() as any);
}

describe('TwoFactorService — TOTP', () => {
  it('accepte un code TOTP valide et le consomme (anti-rejeu)', async () => {
    const secret = authenticator.generateSecret();
    const db = makeDb({ totpSecret: secret, totpEnabledAt: new Date() });
    const code = authenticator.generate(secret);

    expect(await service().verify(db as any, 'u1', code)).toBe(true);
    // Le pas de temps a été mémorisé.
    expect(db._state().totpLastStep).toBeTypeOf('number');
    // REJEU du même code → refusé.
    expect(await service().verify(db as any, 'u1', code)).toBe(false);
  });

  it('refuse un code TOTP faux', async () => {
    const secret = authenticator.generateSecret();
    const db = makeDb({ totpSecret: secret, totpEnabledAt: new Date() });
    const wrong = authenticator.generate(secret) === '000000' ? '111111' : '000000';
    expect(await service().verify(db as any, 'u1', wrong)).toBe(false);
  });

  it('tolère la fenêtre ±1 pas (code de la fenêtre précédente accepté)', async () => {
    const secret = authenticator.generateSecret();
    // Génère un code pour le pas de temps PRÉCÉDENT (30 s plus tôt).
    authenticator.options = { window: 1, epoch: Date.now() - 30_000 };
    const prevCode = authenticator.generate(secret);
    authenticator.options = { window: 1 }; // retour au présent

    const db = makeDb({ totpSecret: secret, totpEnabledAt: new Date() });
    expect(await service().verify(db as any, 'u1', prevCode)).toBe(true);
  });
});

describe('TwoFactorService — codes de secours', () => {
  it('accepte un code de secours UNE seule fois puis le retire', async () => {
    const plain = 'ABCDE-FGHIJ';
    const db = makeDb({
      totpSecret: authenticator.generateSecret(),
      totpEnabledAt: new Date(),
      backupCodes: [sha256(plain), sha256('KLMNP-QRSTU')],
    });
    // 1re utilisation (casse/espaces tolérés) → OK.
    expect(await service().verify(db as any, 'u1', ' abcde-fghij ')).toBe(true);
    expect((db._state().backupCodes as string[]).length).toBe(1); // consommé
    // 2e utilisation du même code → refusé.
    expect(await service().verify(db as any, 'u1', 'ABCDE-FGHIJ')).toBe(false);
  });
});

describe('TwoFactorService — activation', () => {
  it('enable exige un code valide et renvoie des codes de secours', async () => {
    const secret = authenticator.generateSecret();
    const db = makeDb({ totpSecret: secret });
    const { backupCodes } = await service().enable(db as any, 'u1', authenticator.generate(secret));
    expect(backupCodes).toHaveLength(8);
    expect(db._state().totpEnabledAt).toBeInstanceOf(Date);
    // Les codes stockés sont HACHÉS (jamais en clair).
    expect(db._state().backupCodes).not.toContain(backupCodes[0]);
  });

  it('enable refuse un code invalide', async () => {
    const secret = authenticator.generateSecret();
    const db = makeDb({ totpSecret: secret });
    await expect(service().enable(db as any, 'u1', '000000')).rejects.toThrow();
  });
});

describe('TwoFactorService — régénération des codes de secours', () => {
  it('bon mot de passe → nouveaux codes (hachés), les anciens sont remplacés', async () => {
    const pw = await bcrypt.hash('MonPass1', 4);
    const db = makeDb({
      totpSecret: authenticator.generateSecret(),
      totpEnabledAt: new Date(),
      password: pw,
      backupCodes: [sha256('OLD00-OLD11')],
    });
    const codes = await service().regenerateBackupCodes(db as any, 'u1', 'MonPass1');
    expect(codes).toHaveLength(8);
    const stored = db._state().backupCodes as string[];
    expect(stored).not.toContain(sha256('OLD00-OLD11')); // anciens invalidés
    expect(stored).not.toContain(codes[0]); // stockés hachés, jamais en clair
    expect(stored).toContain(sha256(codes[0]));
  });

  it('mauvais mot de passe → refus, codes inchangés', async () => {
    const pw = await bcrypt.hash('MonPass1', 4);
    const db = makeDb({
      totpSecret: authenticator.generateSecret(),
      totpEnabledAt: new Date(),
      password: pw,
      backupCodes: [sha256('OLD00-OLD11')],
    });
    await expect(
      service().regenerateBackupCodes(db as any, 'u1', 'mauvais'),
    ).rejects.toThrow();
    expect(db._state().backupCodes).toEqual([sha256('OLD00-OLD11')]);
  });
});
