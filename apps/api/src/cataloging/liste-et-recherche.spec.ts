import { describe, expect, it, vi } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CatalogingService } from './cataloging.service';
import { ListRecordsDto as ListRecordsDtoClass } from './dto/list-records.dto';
import type { ListRecordsDto } from './dto/list-records.dto';
import { MESSAGE_TRI_INVALIDE, TRIS_DISPONIBLES } from './tri-du-catalogue';

/**
 * `/cataloging/records` — la recherche plein texte et le départage.
 *
 * Le besoin remonté par le front : le DTO ne portait que `category`, `page` et
 * `limit`. Aucun moyen de chercher une notice dont on connaît le titre.
 */
const service = new CatalogingService(
  { indexRecord: vi.fn(), removeRecord: vi.fn() } as never,
  {} as never,
  { syncFromRecord: vi.fn() } as never,
);

interface Appel {
  where?: Record<string, unknown>;
  orderBy?: unknown;
  skip?: number;
  take?: number;
}

function fauxDb(ids: string[] = ['rec-1', 'rec-2']) {
  const findMany = vi.fn(async (_args: Appel) => [] as unknown[]);
  const count = vi.fn(async (_args: Appel) => 0);
  // La recherche pré-résout les identifiants en SQL brut, comme la recherche de
  // comptes : la doublure doit donc répondre à cette requête-là.
  const queryRawUnsafe = vi.fn(async (_sql: string, _param?: string) =>
    ids.map((id) => ({ id })),
  );
  return {
    db: { biblioRecord: { findMany, count }, $queryRawUnsafe: queryRawUnsafe } as never,
    findMany,
    count,
    queryRawUnsafe,
  };
}

const lister = async (query: ListRecordsDto, ids?: string[]) => {
  const { db, findMany, count, queryRawUnsafe } = fauxDb(ids);
  await service.listRecords(db, query);
  return {
    page: findMany.mock.calls[0][0],
    comptage: count.mock.calls[0][0],
    sql: queryRawUnsafe.mock.calls[0]?.[0] as string | undefined,
    terme: queryRawUnsafe.mock.calls[0]?.[1] as string | undefined,
    nbRequetesBrutes: queryRawUnsafe.mock.calls.length,
  };
};

describe('listRecords — recherche plein texte, insensible aux accents', () => {
  it('cherche sur titre, complément de titre, auteur, ISBN et éditeur', async () => {
    const { sql } = await lister({ q: 'Ouagadougou' });
    for (const colonne of ['title', 'title_complement', 'author', 'isbn', 'publisher']) {
      expect(sql, colonne).toContain(`"${colonne}"`);
    }
    expect(sql).not.toContain('"summary"'); // du bruit sur une liste d'administration
  });

  it('⚠ REPLIE LES ACCENTS, des deux côtés de la comparaison', async () => {
    // Le défaut mesuré : « région » rendait 42 notices, « region » ZÉRO. Il
    // faut replier la COLONNE et le TERME — replier un seul côté ne rapproche
    // rien.
    const { sql, terme } = await lister({ q: 'Région' });
    expect(sql).toContain('translate(lower(');
    expect(terme).toBe('%region%');
  });

  it('⚠ la table n’est PAS qualifiée par un schéma', async () => {
    // Le client tenant porte `?schema=tenant_<slug>` : son `search_path` vise
    // déjà la bonne école, et le SQL brut emprunte la même connexion. Qualifier
    // en dur, ou omettre la qualification alors que le client ne la porte pas,
    // ferait taper dans `public` — donc fuiter des notices entre écoles.
    const { sql } = await lister({ q: 'droit' });
    expect(sql).toContain('FROM "biblio_records"');
    expect(sql).not.toMatch(/tenant_\w+\."biblio_records"/);
    expect(sql).not.toContain('public."biblio_records"');
  });

  it('les identifiants pré-résolus deviennent le filtre Prisma', async () => {
    const { page } = await lister({ q: 'droit' }, ['a', 'b', 'c']);
    expect(page.where?.id).toEqual({ in: ['a', 'b', 'c'] });
  });

  it('⚠ LE MÊME `where` EST PASSÉ AU COMPTAGE ET À LA PAGE', async () => {
    // L'invariant du lot d'origine, inchangé : deux `where` divergents rendent
    // un `total` qui ne correspond pas aux lignes, donc un nombre de pages
    // inatteignable, sans qu'aucune erreur ne soit levée.
    const { page, comptage } = await lister({ q: 'droit', category: 'Droit' });
    expect(comptage.where).toEqual(page.where);
  });

  it('la recherche s’AJOUTE à la catégorie, elle ne la remplace pas', async () => {
    const { page } = await lister({ q: 'droit', category: 'Sciences' });
    expect(page.where?.category).toBeDefined();
    expect(page.where?.id).toBeDefined();
  });

  it('un `q` vide ou en blancs ne déclenche AUCUNE requête brute', async () => {
    // Et non « déclenche une requête qui ne filtre rien » : une recherche vide
    // ne doit pas coûter un balayage de table.
    for (const q of ['', '   ', undefined]) {
      const { page, nbRequetesBrutes } = await lister({ q });
      expect(nbRequetesBrutes, `q = ${JSON.stringify(q)}`).toBe(0);
      expect(page.where?.id).toBeUndefined();
    }
  });

  it('les espaces de bord sont retirés', async () => {
    const { terme } = await lister({ q: '  Zoungrana  ' });
    expect(terme).toBe('%zoungrana%');
  });

  it('la liste reste départagée quand on cherche', async () => {
    const { page } = await lister({ q: 'droit' });
    expect(page.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
  });
});

describe('listRecords — le tri', () => {
  it('trie par défaut sur la date de création, décroissant', async () => {
    const { page } = await lister({});
    expect(page.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
  });

  it('honore `sort` et `order`', async () => {
    const { page } = await lister({ sort: 'recordType', order: 'asc' });
    expect(page.orderBy).toEqual([{ recordType: 'asc' }, { id: 'asc' }]);
  });

  it('le tri n’entre PAS dans le `where` — il ne change pas le total', async () => {
    // Une erreur facile : construire le tri dans la clause de filtrage. Le
    // `total` cesserait alors de correspondre aux lignes.
    const { page, comptage } = await lister({ sort: 'publishYear' });
    expect(comptage.where).toEqual(page.where);
    expect(JSON.stringify(comptage)).not.toContain('publishYear');
  });
});

describe('ListRecordsDto — le refus du tri alphabétique s’explique', () => {
  const valider = async (brut: Record<string, unknown>) => {
    const dto = plainToInstance(ListRecordsDtoClass, brut);
    return validate(dto as object);
  };

  it('accepte les trois tris exposés', async () => {
    for (const sort of TRIS_DISPONIBLES) {
      expect(await valider({ sort }), sort).toHaveLength(0);
    }
  });

  it('⚠ ACCEPTE `title` et `author` depuis la collation française', async () => {
    // Ils étaient refusés parce que la base classait mal les accents. La
    // collation `fr-x-icu` est posée (backlog n° 14), donc le motif du refus
    // n'existe plus — et un refus dont le motif est faux fait renoncer à
    // quelque chose pour une raison qui n'existe pas.
    expect(await valider({ sort: 'title' })).toHaveLength(0);
    expect(await valider({ sort: 'author' })).toHaveLength(0);
  });

  it('un tri inconnu reste refusé, en listant ce qui est accepté', async () => {
    const erreurs = await valider({ sort: 'nimportequoi' });
    expect(erreurs).toHaveLength(1);
    const message = Object.values(erreurs[0].constraints ?? {}).join(' ');
    expect(message).toBe(MESSAGE_TRI_INVALIDE);
    expect(message).toContain('title');
  });

  it('refuse un sens de tri inventé', async () => {
    expect(await valider({ order: 'aleatoire' })).toHaveLength(1);
  });
});
