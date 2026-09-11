import { describe, expect, it, vi } from 'vitest';
import { ValidationPipe } from '@nestjs/common';
import { ClientCacheKeyMiddleware } from './client-cache-key.middleware';
import { NouveautesDto } from '../opac/dto/nouveautes.dto';
import { OpacSearchDto } from '../opac/dto/opac-search.dto';
import { AuthorsIndexDto } from '../opac/dto/authors-index.dto';

/** Le pipe RÉEL de main.ts — mêmes options, sinon le test ne prouve rien. */
const pipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
});
const valide = (dto: unknown, value: unknown) =>
  pipe.transform(value, { type: 'query', metatype: dto as never });

/**
 * Le motif du REFUS, tel que le client le reçoit.
 *
 * `BadRequestException.message` vaut « Bad Request Exception » : le détail vit
 * dans la charge utile de la réponse. Assertion portée là, sinon le test
 * passerait au vert sur n'importe quel refus — y compris le mauvais.
 */
async function motifDuRefus(dto: unknown, value: unknown): Promise<string> {
  try {
    await valide(dto, value);
    return '';
  } catch (e) {
    const reponse = (e as { getResponse?: () => unknown }).getResponse?.();
    return JSON.stringify(reponse ?? (e as Error).message);
  }
}

function passeParLeMiddleware(query: Record<string, unknown>) {
  const req = { query } as never;
  const suivant = vi.fn();
  new ClientCacheKeyMiddleware().use(req, {} as never, suivant);
  expect(suivant).toHaveBeenCalledOnce();
  return query;
}

describe('paramètres de transport — le défaut qu’on corrige', () => {
  it('⚠ sans le middleware, `__host` fait échouer la validation', async () => {
    // C'est exactement le blocage remonté : /opac/nouveautes refusait par une
    // 400 le paramètre que le front ajoute à TOUT appel serveur.
    expect(await motifDuRefus(NouveautesDto, { limit: '6', __host: 'buc.exemple.bf' }))
      .toContain('__host');
  });

  it('avec le middleware, la même requête passe', async () => {
    const query = passeParLeMiddleware({ limit: '6', __host: 'buc.exemple.bf' });
    await expect(valide(NouveautesDto, query)).resolves.toEqual({ limit: 6 });
  });
});

describe('paramètres de transport — c’est un MOTIF, pas une route', () => {
  // Seize routes portent un @Query() typé. Le corriger DTO par DTO aurait
  // laissé le défaut revenir à la prochaine route écrite.
  const cas: [string, unknown, Record<string, unknown>][] = [
    ['/opac/nouveautes', NouveautesDto, { limit: '6' }],
    ['/opac/search', OpacSearchDto, { q: 'droit', page: '1' }],
    ['/opac/authors', AuthorsIndexDto, {}],
  ];

  for (const [route, dto, params] of cas) {
    it(`${route} accepte __host après le middleware`, async () => {
      const query = passeParLeMiddleware({ ...params, __host: 'buc.exemple.bf' });
      expect(query).not.toHaveProperty('__host');
      await expect(valide(dto, query)).resolves.toBeDefined();
    });
  }
});

describe('paramètres de transport — la validation N’EST PAS assouplie', () => {
  it('un paramètre inconnu qui n’est pas de transport est TOUJOURS refusé', async () => {
    // La garantie du lot : on retire un non-paramètre, on ne cesse pas de
    // contrôler les paramètres. Sans ce test, « tolérer __host » pourrait
    // devenir « tolérer n'importe quoi » sans que personne ne le voie.
    const query = passeParLeMiddleware({ limit: '6', limite: '9' });
    expect(query).toHaveProperty('limite');
    expect(await motifDuRefus(NouveautesDto, query)).toContain('limite');
  });

  it('les vraies bornes du DTO tiennent toujours', async () => {
    const query = passeParLeMiddleware({ limit: '999', __host: 'x' });
    await expect(valide(NouveautesDto, query)).rejects.toThrow();
  });

  it('seul `__host` est retiré, les autres paramètres sont intacts', async () => {
    const query = passeParLeMiddleware({
      limit: '6',
      avecFichier: '1',
      __host: 'buc.exemple.bf',
    });
    expect(query).toEqual({ limit: '6', avecFichier: '1' });
  });

  it('une requête sans `__host` traverse sans dommage', async () => {
    const query = passeParLeMiddleware({ limit: '6' });
    expect(query).toEqual({ limit: '6' });
  });
});
