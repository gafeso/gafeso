import { describe, expect, it, vi } from 'vitest';
import { ValidationPipe } from '@nestjs/common';
import { PatronsService } from './patrons.service';
import { CreatePatronDto } from './dto/patron.dto';
import { raisonDeRefusDeLaCarte } from './dto/carte-identifiable.validator';
import { nomsDivergents } from './noms-divergents';

const service = new PatronsService();
const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });
async function refus(valeur: unknown): Promise<string> {
  try {
    await pipe.transform(valeur, { type: 'body', metatype: CreatePatronDto as never });
    return '';
  } catch (e) {
    const r = (e as { getResponse?: () => unknown }).getResponse?.();
    return JSON.stringify(r ?? (e as Error).message);
  }
}

describe('une carte désigne quelqu’un — un nom OU un compte lié', () => {
  it('⚠ refuse une carte anonyme : ni nom, ni compte', async () => {
    // Le défaut corrigé : CreatePatronDto n'avait AUCUN champ de nom, donc
    // inscrire un lecteur créait une carte sans identité.
    expect(raisonDeRefusDeLaCarte({ barcode: 'P-1', category: 'etudiant' })).not.toBeNull();
  });

  it('⚠ le refus NOMME ce qui manque — pas « données invalides »', async () => {
    // Une bibliothécaire qui oublie le nom doit lire ce qu'on attend d'elle.
    const message = await refus({ barcode: 'P-1', category: 'etudiant' });
    expect(message).toContain('nom');
    expect(message).toContain('compte');
    expect(message).not.toMatch(/données invalides|invalid/i);
  });

  it('un nom seul suffit — le lecteur sans adresse e-mail existe', () => {
    expect(raisonDeRefusDeLaCarte({ barcode: 'P-1', category: 'x', lastName: 'Traoré' })).toBeNull();
    expect(raisonDeRefusDeLaCarte({ barcode: 'P-1', category: 'x', firstName: 'Awa' })).toBeNull();
  });

  it('un compte lié seul suffit — le nom en sera recopié', () => {
    expect(
      raisonDeRefusDeLaCarte({ barcode: 'P-1', category: 'x', userId: 'u-1' }),
    ).toBeNull();
  });

  it('un nom fait d’espaces ne compte pas pour un nom', () => {
    expect(
      raisonDeRefusDeLaCarte({ barcode: 'P-1', category: 'x', firstName: '   ' }),
    ).not.toBeNull();
  });
});

describe('recopie au moment du lien — l’adhérent devient propriétaire', () => {
  function fauxDb(compte: { firstName: string; lastName: string } | null) {
    // ⚠ TYPÉ : c'est la CHARGE d'écriture qu'on inspecte, et un `unknown`
    // oblige à la caster à chaque assertion — donc à la retyper à la main, donc
    // à pouvoir se tromper sans que rien ne le dise.
    type ChargePatron = {
      data: { firstName?: string | null; lastName?: string | null; userId?: string | null };
    };
    const create = vi.fn(async ({ data }: ChargePatron) => data);
    return {
      db: {
        user: { findUnique: vi.fn(async () => compte) },
        patron: { create },
      } as never,
      create,
    };
  }

  it('sans nom saisi, le nom est RECOPIÉ depuis le compte', async () => {
    const { db, create } = fauxDb({ firstName: 'Awa', lastName: 'Traoré' });
    await service.createPatron(db, { barcode: 'P-1', category: 'Etudiant', userId: 'u-1' } as never);
    expect(create.mock.calls[0][0].data).toMatchObject({ firstName: 'Awa', lastName: 'Traoré' });
  });

  it('⚠ le nom SAISI prime sur celui du compte', async () => {
    // C'est le sens de « l'adhérent fait foi » : la bibliothécaire corrige.
    const { db, create } = fauxDb({ firstName: 'Awa', lastName: 'TRAORE' });
    await service.createPatron(db, {
      barcode: 'P-1', category: 'x', userId: 'u-1', lastName: 'Traoré',
    } as never);
    expect(create.mock.calls[0][0].data.lastName).toBe('Traoré');
  });

  it('sans compte lié, le nom saisi est posé tel quel', async () => {
    const { db, create } = fauxDb(null);
    await service.createPatron(db, {
      barcode: 'P-1', category: 'x', firstName: 'Awa', lastName: 'Traoré',
    } as never);
    expect(create.mock.calls[0][0].data).toMatchObject({
      firstName: 'Awa', lastName: 'Traoré', userId: null,
    });
  });
});

describe('le désaccord des noms est DIT, jamais tu', () => {
  it('aucun compte lié → rien à comparer', () => {
    expect(nomsDivergents({ firstName: 'Awa', lastName: 'Traoré' })).toBe(false);
    expect(nomsDivergents({ firstName: 'Awa', lastName: 'Traoré', user: null })).toBe(false);
  });

  it('adhérent sans nom → le compte est la seule source, pas un désaccord', () => {
    expect(
      nomsDivergents({ firstName: null, lastName: null, user: { firstName: 'Awa', lastName: 'Traoré' } }),
    ).toBe(false);
  });

  it('⚠ noms différents → signalé', () => {
    expect(
      nomsDivergents({ firstName: 'Awa', lastName: 'Traoré', user: { firstName: 'Awa', lastName: 'Ouédraogo' } }),
    ).toBe(true);
  });

  it('la CASSE seule ne déclenche pas de faux désaccord', () => {
    // Un signal qui crie pour rien finit ignoré — c'est ce qu'on veut éviter.
    expect(
      nomsDivergents({ firstName: 'awa', lastName: 'TRAORÉ', user: { firstName: 'Awa', lastName: 'Traoré' } }),
    ).toBe(false);
  });

  it('⚠ mais les ACCENTS comptent : « Traore » et « Traoré » divergent', () => {
    // Limite assumée et fixée ici : la comparaison ne déplie pas les
    // diacritiques. Une bibliothécaire qui corrige « Traore » en « Traoré »
    // verra donc un désaccord — ce qui est le comportement voulu, puisque son
    // nom fait foi et diffère bien de celui du compte.
    expect(
      nomsDivergents({ firstName: 'Awa', lastName: 'Traore', user: { firstName: 'Awa', lastName: 'Traoré' } }),
    ).toBe(true);
  });
});

describe('comptes à lier — l’élargissement est réel et borné', () => {
  /** La clause que le service passe à Prisma — c'est elle qu'on éprouve. */
  interface ClauseComptes {
    where: { status?: string; patron?: null; OR?: unknown[] };
    take?: number;
    orderBy?: unknown;
    select?: Record<string, unknown>;
  }
  function fauxDb() {
    const findMany = vi.fn(async (_args: ClauseComptes) => [] as unknown[]);
    return { db: { user: { findMany } } as never, findMany };
  }
  const clause = async (q?: string, limit?: number): Promise<ClauseComptes> => {
    const { db, findMany } = fauxDb();
    await service.comptesALier(db, { q, limit } as never);
    const appel = findMany.mock.calls[0];
    // ⚠ Pas de `!` ni de `as` : si le service n'appelait PAS `findMany`, on veut
    // un échec qui le DIT, pas un accès sur `undefined` dix lignes plus bas.
    expect(appel, 'le service doit interroger `user.findMany`').toBeDefined();
    return appel[0];
  };

  it('⚠ ne propose que des comptes ACTIFS et PAS DÉJÀ LIÉS', async () => {
    // Sans `patron: null`, la bibliothécaire choisirait un compte déjà rattaché
    // et la création échouerait sur l'unicité de userId — un refus
    // incompréhensible pour elle. On ne propose que ce qui peut aboutir.
    const a = await clause('traore');
    expect(a.where.status).toBe('ACTIVE');
    expect(a.where.patron).toBeNull();
  });

  it('⚠ n’expose QUE quatre champs — moins que lecteurs.voir', async () => {
    const a = await clause('traore');
    // ⚠ On affirme d'abord que le `select` EXISTE : sans lui, la route
    // renverrait la ligne entière, et « n'expose que quatre champs » serait
    // faux sans qu'aucune clé ne manque.
    expect(a.select, 'la requête doit porter un select explicite').toBeDefined();
    expect(Object.keys(a.select ?? {}).sort()).toEqual(['email', 'firstName', 'id', 'lastName']);
    // Ni statut, ni rôle, ni classe, ni date d'activation.
    expect(a.select).not.toHaveProperty('status');
    expect(a.select).not.toHaveProperty('role');
  });

  it('cherche nom, prénom et e-mail, insensible à la casse', async () => {
    const a = await clause('barry');
    expect((JSON.stringify(a.where.OR).match(/insensitive/g) ?? []).length).toBe(3);
  });

  it('sans terme, rend les comptes liables sans filtre de nom', async () => {
    const a = await clause(undefined);
    expect(a.where).not.toHaveProperty('OR');
    expect(a.where.patron).toBeNull();
  });

  it('la limite est bornée à 50', async () => {
    expect((await clause('x', 5000)).take).toBe(50);
    expect((await clause('x')).take).toBe(20);
  });
});
