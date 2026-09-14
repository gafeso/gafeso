import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { MoissonnageService } from './moissonnage.service';
import { ClientOai } from './client-oai';

/** Doublure qui HONORE `where` : sans cela, un doublon ne serait jamais détecté. */
function base(sources: Record<string, unknown>[] = []) {
  const lignes: Record<string, unknown>[] = sources.map((s) => ({ setSpec: '', ...s }));
  const db = {
    harvestSource: {
      findFirst: vi.fn(async ({ where }: never) => {
        const w = where as Record<string, unknown>;
        return (
          lignes.find((l) => Object.entries(w).every(([k, v]) => l[k] === v)) ?? null
        );
      }),
      findUnique: vi.fn(async ({ where }: never) =>
        lignes.find((l) => l.id === (where as { id: string }).id) ?? null,
      ),
      findMany: vi.fn(async () => lignes.map((l) => ({ ...l, runs: [] }))),
      create: vi.fn(async ({ data }: never) => {
        const l = { id: `s${lignes.length + 1}`, ...(data as object) };
        lignes.push(l);
        return l;
      }),
      update: vi.fn(async ({ where, data }: never) => {
        const l = lignes.find((x) => x.id === (where as { id: string }).id)!;
        Object.assign(l, data as object);
        return l;
      }),
      delete: vi.fn(async ({ where }: never) => {
        const i = lignes.findIndex((x) => x.id === (where as { id: string }).id);
        return lignes.splice(i, 1)[0];
      }),
    },
    harvestRun: { count: vi.fn(async () => 3) },
    harvestedRecord: { count: vi.fn(async () => 41) },
  } as never;
  return { db, lignes };
}

const svc = () =>
  new MoissonnageService({ importerNoticesMoissonnees: vi.fn() } as never, {
    moissonner: vi.fn(),
  } as unknown as ClientOai);

describe('Déclarer une source', () => {
  it('normalise l’adresse avant de l’enregistrer', async () => {
    const { db, lignes } = base();
    await svc().creerSource(db, {
      name: '  Dépôt d’Exemple  ',
      baseUrl: 'https://depot.exemple.bf/oai/',
      metadataPrefix: ' oai_dc ',
    });
    expect(lignes[0]).toMatchObject({
      name: 'Dépôt d’Exemple',
      baseUrl: 'https://depot.exemple.bf/oai',
      metadataPrefix: 'oai_dc',
      // ⚠ Chaîne VIDE et non NULL : c'est ce que la contrainte d'unicité sait
      // comparer. En NULL, deux sources sans ensemble passeraient sans un mot.
      setSpec: '',
    });
  });

  it('⚠ refuse une adresse interne — et c’est le serveur qui l’appellerait', async () => {
    const { db } = base();
    await expect(
      svc().creerSource(db, {
        name: 'X',
        baseUrl: 'http://localhost:9200',
        metadataPrefix: 'oai_dc',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('⚠ le DOUBLON se DIT, il ne se fait pas dire par la base', async () => {
    // Une violation de contrainte remonterait en 500 avec un message Prisma :
    // la personne saurait qu'elle a échoué, pas pourquoi ni ce qui existe déjà.
    const { db } = base([
      {
        id: 's1',
        name: 'Déjà déclaré',
        baseUrl: 'https://depot.exemple.bf/oai',
        metadataPrefix: 'oai_dc',
        setSpec: '',
      },
    ]);
    const promesse = svc().creerSource(db, {
      // La MÊME adresse, écrite autrement : c'est la normalisation qui les
      // rapproche, et sans elle ce doublon passerait.
      name: 'Un autre nom',
      baseUrl: 'https://depot.exemple.bf/oai/',
      metadataPrefix: 'oai_dc',
    });
    await expect(promesse).rejects.toBeInstanceOf(ConflictException);
    await expect(promesse).rejects.toThrow(/Déjà déclaré/);
  });

  it('deux ENSEMBLES différents du même entrepôt ne sont pas un doublon', async () => {
    // Témoin d'absence : viser le même entrepôt avec deux ensembles est l'usage
    // normal — une faculté, puis une autre.
    const { db, lignes } = base([
      {
        id: 's1',
        name: 'Droit',
        baseUrl: 'https://depot.exemple.bf/oai',
        metadataPrefix: 'oai_dc',
        setSpec: 'col_droit',
      },
    ]);
    await svc().creerSource(db, {
      name: 'Médecine',
      baseUrl: 'https://depot.exemple.bf/oai',
      metadataPrefix: 'oai_dc',
      setSpec: 'col_med',
    });
    expect(lignes).toHaveLength(2);
  });
});

describe('⚠ Le curseur n’est pas un réglage', () => {
  it('`lastDatestamp` n’est PAS modifiable par la route de modification', async () => {
    // L'ouvrir permettrait de faire reculer le curseur à la main, donc de
    // redemander un fonds entier à un entrepôt distant par inadvertance.
    const { db, lignes } = base([
      {
        id: 's1',
        name: 'X',
        baseUrl: 'https://depot.exemple.bf/oai',
        metadataPrefix: 'oai_dc',
        lastDatestamp: '2026-09-01',
      },
    ]);
    await svc().modifierSource(db, 's1', {
      name: 'Y',
      lastDatestamp: '1970-01-01',
    } as never);
    expect(lignes[0].name).toBe('Y');
    expect(lignes[0].lastDatestamp).toBe('2026-09-01');
  });
});

describe('⚠ Supprimer une source n’efface AUCUNE notice', () => {
  it('la réponse COMPTE celles qui restent au catalogue', async () => {
    // « Supprimée » sans dire que 41 notices restent laisserait croire qu'elles
    // sont parties avec — et c'est la question que se pose la personne qui
    // vient de cliquer.
    const { db, lignes } = base([
      { id: 's1', name: 'Dépôt d’Exemple', baseUrl: 'https://x.bf/oai', metadataPrefix: 'oai_dc' },
    ]);
    const r = await svc().supprimerSource(db, 's1');
    expect(r).toEqual({
      supprimee: 'Dépôt d’Exemple',
      executionsEffacees: 3,
      noticesConservees: 41,
    });
    expect(lignes).toHaveLength(0);
  });
});
