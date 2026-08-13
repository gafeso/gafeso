import { describe, expect, it, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { AuthorsService } from './authors.service';
import { normalizeAuthorName } from './author-name';

describe('normalizeAuthorName', () => {
  it('insensible à la casse, aux accents et aux espaces', () => {
    expect(normalizeAuthorName('Ouédraogo  Jean')).toBe('ouedraogo jean');
    expect(normalizeAuthorName('OUEDRAOGO JEAN')).toBe('ouedraogo jean');
    expect(normalizeAuthorName('  Ouédraogo   Jean  ')).toBe('ouedraogo jean');
  });
});

/** DB tenant simulée avec un magasin authors + contributions mutable. */
function makeDb(contributions: { id: string; name: string; authorId: string | null }[]) {
  const authors: { id: string; displayName: string; normalizedName: string }[] = [];
  let seq = 0;
  return {
    authors,
    contributions,
    recordContributor: {
      findMany: vi.fn(async () => contributions.map((c) => ({ ...c }))),
      update: vi.fn(async ({ where, data }: any) => {
        const c = contributions.find((x) => x.id === where.id);
        if (c) c.authorId = data.authorId;
        return c;
      }),
    },
    author: {
      findMany: vi.fn(async () => authors.map((a) => ({ ...a }))),
      findFirst: vi.fn(async ({ where }: any) =>
        authors.find((a) => a.normalizedName === where.normalizedName) ?? null,
      ),
      create: vi.fn(async ({ data }: any) => {
        const a = { id: `a-${seq++}`, ...data };
        authors.push(a);
        return a;
      }),
    },
  } as any;
}

describe('AuthorsService — dedupeContributors', () => {
  it('regroupe les variantes d’un même nom sur une seule fiche', async () => {
    const db = makeDb([
      { id: 'c1', name: 'Ouédraogo Jean', authorId: null },
      { id: 'c2', name: 'ouedraogo jean', authorId: null },
      { id: 'c3', name: 'Sawadogo Awa', authorId: null },
    ]);
    const res = await new AuthorsService().dedupeContributors(db);
    expect(res.authorsCreated).toBe(2); // Ouedraogo + Sawadogo
    expect(res.contributionsLinked).toBe(3);
    // c1 et c2 pointent la même fiche.
    expect(db.contributions[0].authorId).toBe(db.contributions[1].authorId);
    expect(db.contributions[2].authorId).not.toBe(db.contributions[0].authorId);
  });

  it('idempotent : relance → 0 création, 0 liaison', async () => {
    const db = makeDb([
      { id: 'c1', name: 'Ouédraogo Jean', authorId: null },
      { id: 'c2', name: 'ouedraogo jean', authorId: null },
    ]);
    await new AuthorsService().dedupeContributors(db);
    const again = await new AuthorsService().dedupeContributors(db);
    expect(again.authorsCreated).toBe(0);
    expect(again.contributionsLinked).toBe(0);
  });

  it('findOrCreateByName réutilise une fiche existante (même nom normalisé)', async () => {
    const db = makeDb([]);
    const a1 = await new AuthorsService().findOrCreateByName(db, 'Ouédraogo Jean');
    const a2 = await new AuthorsService().findOrCreateByName(db, 'ouedraogo  jean');
    expect(a2.id).toBe(a1.id);
    expect(db.authors).toHaveLength(1);
  });
});

/** Mock ciblé pour merge/remove. */
function mergeDb(opts: {
  authors: Record<string, string>; // id → displayName
  contributions: { id: string; recordId: string; authorId: string }[];
}) {
  const authors = new Map(Object.entries(opts.authors));
  let contribs = opts.contributions.map((c) => ({ ...c }));
  return {
    _authors: authors,
    _contribs: () => contribs,
    author: {
      findUnique: vi.fn(async ({ where }: any) =>
        authors.has(where.id) ? { id: where.id, displayName: authors.get(where.id) } : null,
      ),
      delete: vi.fn(async ({ where }: any) => {
        authors.delete(where.id);
        return {};
      }),
    },
    recordContributor: {
      findMany: vi.fn(async ({ where }: any) =>
        contribs.filter((c) => c.authorId === where.authorId).map((c) => ({ recordId: c.recordId })),
      ),
      updateMany: vi.fn(async ({ where, data }: any) => {
        let n = 0;
        contribs = contribs.map((c) => {
          if (c.authorId === where.authorId) {
            n += 1;
            return { ...c, authorId: data.authorId ?? c.authorId };
          }
          return c;
        });
        return { count: n };
      }),
      count: vi.fn(async ({ where }: any) => contribs.filter((c) => c.authorId === where.authorId).length),
      findFirst: vi.fn(async () => ({ name: 'X' })),
    },
    biblioRecord: { update: vi.fn(async () => ({})) },
  } as any;
}

describe('AuthorsService — merge / remove', () => {
  it('fusion : les contributions basculent sur le gagnant, la perdante est supprimée', async () => {
    const db = mergeDb({
      authors: { loser: 'J. Ouedraogo', winner: 'Jean Ouedraogo' },
      contributions: [
        { id: 'c1', recordId: 'r1', authorId: 'loser' },
        { id: 'c2', recordId: 'r2', authorId: 'winner' },
      ],
    });
    const res = await new AuthorsService().merge(db, 'loser', 'winner');
    expect(res.affectedRecordIds).toEqual(['r1']);
    expect(db._contribs().every((c: any) => c.authorId === 'winner')).toBe(true);
    expect(db.author.delete).toHaveBeenCalledWith({ where: { id: 'loser' } });
    expect(db._authors.has('loser')).toBe(false);
  });

  it('fusion d’une fiche sur elle-même → refus', async () => {
    const db = mergeDb({ authors: { a: 'A' }, contributions: [] });
    await expect(new AuthorsService().merge(db, 'a', 'a')).rejects.toThrow();
  });

  it('suppression refusée si des œuvres sont rattachées', async () => {
    const db = mergeDb({
      authors: { a: 'A' },
      contributions: [{ id: 'c1', recordId: 'r1', authorId: 'a' }],
    });
    await expect(new AuthorsService().remove(db, 'a')).rejects.toBeInstanceOf(ConflictException);
  });

  it('suppression autorisée si zéro œuvre', async () => {
    const db = mergeDb({ authors: { a: 'A' }, contributions: [] });
    const res = await new AuthorsService().remove(db, 'a');
    expect(res.deleted).toBe(true);
  });
});
