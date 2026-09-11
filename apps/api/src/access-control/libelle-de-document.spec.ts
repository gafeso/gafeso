import { describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AccessControlService } from './access-control.service';

/**
 * `GET /collections/documents/:recordId` — le libellé, et RIEN d'autre.
 *
 * ⚠ La méthode de service (`recordLabel`) EXISTAIT déjà dans l'arbre, écrite et
 * documentée, mais câblée à RIEN : ni route, ni appelant, ni test. Ce lot la
 * branche au lieu d'en écrire une seconde identique — j'avais commencé par la
 * dupliquer, et c'est le diff qui l'a montré. Une méthode sans route est
 * invisible à tout ce qui lit les routes.
 *
 * ⚠ L'invariant du lot : un écran qui a besoin d'un libellé n'a pas besoin du
 * registre. Rendre la notice entière recréerait, sous `collections.gerer`, la
 * fuite qu'on vient de fermer sous `catalogue.gerer` — `marcData`, les
 * exemplaires et le reste voyageraient vers un écran qui n'en fait rien.
 */
function fauxDb(notice: unknown) {
  const findUnique = vi.fn(async (_args: { select?: unknown }) => notice);
  return {
    prisma: { forTenant: () => ({ biblioRecord: { findUnique } }) },
    findUnique,
  };
}

const service = (notice: unknown) => {
  const { prisma, findUnique } = fauxDb(notice);
  return { svc: new AccessControlService(prisma as never), findUnique };
};

describe('libellé d’un document local', () => {
  it('rend l’identifiant et le titre', async () => {
    const { svc } = service({ id: 'rec-1', title: 'Architecture des ordinateurs' });
    expect(await svc.recordLabel('zinda', 'rec-1')).toEqual({
      id: 'rec-1',
      title: 'Architecture des ordinateurs',
    });
  });

  it('⚠ le `select` ne demande QUE ces deux colonnes', async () => {
    // Le contrôle qui compte : ce n'est pas ce que le service RETOURNE qui
    // protège, c'est ce qu'il DEMANDE. Un `include` ou un select élargi
    // ramènerait la notice entière, et la fuite se rejouerait sous une autre
    // permission.
    const { svc, findUnique } = service({ id: 'rec-1', title: 'T' });
    await svc.recordLabel('zinda', 'rec-1');
    expect(findUnique.mock.calls[0][0].select).toEqual({ id: true, title: true });
  });

  it('une notice absente est une 404, pas un libellé vide', async () => {
    // Un libellé vide serait une non-réponse écrite comme un fait : l'écran
    // afficherait un document sans titre au lieu de dire qu'il est introuvable.
    const { svc } = service(null);
    await expect(svc.recordLabel('zinda', 'inconnu')).rejects.toThrow(NotFoundException);
  });

  it('⚠ la route est gardée par `collections.gerer`, pas par le catalogue', () => {
    const source = readFileSync(join(__dirname, 'access-control.controller.ts'), 'utf-8');
    const i = source.indexOf("@Get('documents/:recordId')");
    expect(i, 'route introuvable').toBeGreaterThan(-1); // témoin
    const bloc = source.slice(i, i + 400);
    expect(bloc).toContain('FONCTIONS.COLLECTIONS_GERER');
    expect(bloc).not.toContain('CATALOGUE_GERER');
  });
});
