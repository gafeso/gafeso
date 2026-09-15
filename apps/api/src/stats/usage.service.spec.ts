import { describe, expect, it, vi } from 'vitest';
import { USAGE_LECTURE, USAGE_TELECHARGEMENT, UsageService } from './usage.service';

/**
 * ⚠ CE QU'ON COMPTE, ET CE QU'ON NE COMPTE JAMAIS.
 *
 * *P8-1, 15 septembre 2026.*
 *
 * Deux propriétés sont éprouvées ici, et la seconde est la plus importante :
 * la ligne écrite ne porte AUCUN identifiant d'utilisateur, et l'échec du
 * comptage ne remonte JAMAIS à l'appelant.
 */
describe('UsageService — compter sans jamais gêner', () => {
  const faux = (create = vi.fn().mockResolvedValue({})) => ({
    db: { usageEvent: { create } } as never,
    create,
  });

  it('écrit une ligne, avec le document et le type', async () => {
    const { db, create } = faux();
    expect(await new UsageService().enregistrer(db, 'rec-1', USAGE_LECTURE)).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toEqual({ data: { recordId: 'rec-1', kind: 'LECTURE' } });
  });

  it('⚠ AUCUNE DONNÉE PERSONNELLE dans la charge écrite', async () => {
    // ⚠ Une assertion sur la FORME de la charge, et pas sur l'intention. Le
    // jour où quelqu'un ajoutera `userId` « pour dédupliquer », ce test
    // tombera — c'est le seul endroit qui s'en souviendra.
    const { db, create } = faux();
    await new UsageService().enregistrer(db, 'rec-1', USAGE_TELECHARGEMENT);
    const charge = create.mock.calls[0][0].data as Record<string, unknown>;
    expect(Object.keys(charge).sort()).toEqual(['kind', 'recordId']);
    for (const interdit of ['userId', 'patronId', 'ip', 'email', 'deviceId', 'sessionId']) {
      expect(charge, interdit).not.toHaveProperty(interdit);
    }
  });

  it('⚠ un échec d’écriture NE REMONTE PAS — lire passe avant compter', async () => {
    // Perdre une ligne de statistiques ne doit jamais empêcher quelqu'un de
    // lire sa thèse. Le contrôle porte sur ce que l'appelant OBSERVE : pas de
    // rejet, et un `false` qui le dit.
    const { db } = faux(vi.fn().mockRejectedValue(new Error('base injoignable')));
    await expect(new UsageService().enregistrer(db, 'rec-1', USAGE_LECTURE)).resolves.toBe(false);
  });

  it('⚠ le vocabulaire est fermé à DEUX valeurs, et la notice n’en fait pas partie', () => {
    // La consultation d'une fiche n'est pas collectée : une écriture par
    // affichage, robots d'indexation compris. Ce témoin de COMPTE oblige à
    // revenir ici le jour où quelqu'un en ajoute une troisième.
    expect([USAGE_LECTURE, USAGE_TELECHARGEMENT]).toEqual(['LECTURE', 'TELECHARGEMENT']);
  });
});
