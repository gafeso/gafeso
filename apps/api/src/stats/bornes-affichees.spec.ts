import { describe, expect, it, vi } from 'vitest';
import { StatsService } from './stats.service';

/**
 * ⚠ CE QU'UN EXPORT AFFIRME SUR LA PÉRIODE QU'IL COUVRE.
 *
 * *Posé le 15 septembre 2026, en clôturant P8.*
 *
 * Le contrat est juste et documenté : `to` est la « Fin de période EXCLUE ».
 * C'était l'ÉTIQUETTE qui mentait — l'en-tête imprimait « 2026-01-01 →
 * 2027-01-01 », une plage que le fichier n'a pas mesurée.
 *
 * ⚠ Et un export est ARCHIVÉ. Un faux d'un jour dans un écran se corrige au
 * rechargement suivant ; dans un fichier remis, il survit à sa cause.
 */
describe('Export d’activité — l’en-tête dit la période réellement mesurée', () => {
  function service() {
    // Toutes les sections rendent du vide : ce fichier n'éprouve QUE l'en-tête.
    const svc = new StatsService({ forTenant: () => ({}) } as never);
    vi.spyOn(svc, 'datasetCsv').mockResolvedValue({ filename: 'x', csv: '' } as never);
    return svc;
  }

  const periode = (from: string, to: string) => ({
    from: new Date(from),
    to: new Date(to),
    granularity: 'day' as const,
  });

  it('⚠ elle NOMME la convention, au lieu de laisser lire une plage inclusive', async () => {
    const csv = await service().reportCsv('zinda', 't1', periode('2026-01-01', '2027-01-01'));
    expect(csv).toContain('du 2026-01-01 inclus au 2027-01-01 exclu');
    // ⚠ LE CONTRÔLE QUI COMPTE : la forme d'origine ne doit plus exister. Sans
    // lui, quelqu'un la réécrira dans six mois avec les mêmes bonnes raisons —
    // elle est plus courte et elle se lit bien.
    expect(csv, 'la flèche nue laissait lire une plage inclusive').not.toMatch(
      /2026-01-01\s*→\s*2027-01-01/,
    );
  });

  it('⚠ elle reste vraie quand la borne haute est « maintenant »', async () => {
    // Le tableau de bord appelle avec `to = maintenant` par défaut. Retrancher
    // un jour pour « corriger » l'affichage aurait été faux ici — tout ce qui
    // précède l'instant courant EST compté. Dire la convention marche dans les
    // deux cas ; soustraire, dans un seul.
    const csv = await service().reportCsv('zinda', 't1', periode('2026-08-16', '2026-09-15T14:30:00Z'));
    expect(csv).toContain('du 2026-08-16 inclus au 2026-09-15 exclu');
  });
});
