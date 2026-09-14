import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { lienVersOrigine, Provenance } from './provenance';

export type TenantDb = PrismaClient;

/**
 * LA PROVENANCE D'UNE NOTICE — P7-3, la fédération de recherche.
 *
 * ⚠ SERVICE À PART, ET SANS DÉPENDANCE. `OpacService` en a besoin ;
 * `MoissonnageService`, lui, tire `CatalogingService`, un contrôleur et un
 * planificateur. Faire dépendre l'OPAC de tout cela pour une jointure de deux
 * tables serait payer un couplage entier pour une question de deux lignes.
 *
 * Il ne prend aucune dépendance de constructeur : la base lui est PASSÉE, comme
 * partout ailleurs dans les services tenant.
 */
@Injectable()
export class ProvenanceService {
  /**
   * LA PROVENANCE DE PLUSIEURS NOTICES, EN UNE REQUÊTE.
   *
   * ⚠ EN LOT, ET C'EST LA RAISON DE SA FORME. Une page de résultats de recherche
   * porte vingt notices ; une provenance par notice ferait vingt requêtes pour
   * afficher un écran. L'appelant demande les identifiants qu'il a, et reçoit
   * seulement ceux qui viennent d'ailleurs.
   *
   * ⚠ LES NOTICES LOCALES NE SONT PAS DANS LE RÉSULTAT, et leur absence est la
   * réponse — pas un `null` par notice. Le contraire ferait porter à l'écran une
   * liste de « pas de provenance » aussi longue que ses résultats.
   */
  async provenances(db: TenantDb, recordIds: string[]): Promise<Record<string, Provenance>> {
    if (recordIds.length === 0) return {};

    const lignes = await db.harvestedRecord.findMany({
      where: { recordId: { in: recordIds } },
      include: { source: { select: { id: true, name: true } } },
    });
    if (lignes.length === 0) return {};

    // Le lien vit dans le Dublin Core conservé à l'ingestion (I3) : on ne le
    // fabrique pas, on le relit.
    const notices = await db.biblioRecord.findMany({
      where: { id: { in: lignes.map((l) => l.recordId!).filter(Boolean) } },
      select: { id: true, marcData: true },
    });
    const parId = new Map(notices.map((n) => [n.id, n.marcData]));

    const sortie: Record<string, Provenance> = {};
    for (const ligne of lignes) {
      if (!ligne.recordId) continue;
      sortie[ligne.recordId] = {
        source: ligne.source,
        oaiIdentifier: ligne.oaiIdentifier,
        lien: lienVersOrigine(parId.get(ligne.recordId)),
      };
    }
    return sortie;
  }

  /** La provenance d'UNE notice, ou `null` si elle est locale. */
  async provenance(db: TenantDb, recordId: string): Promise<Provenance | null> {
    return (await this.provenances(db, [recordId]))[recordId] ?? null;
  }
}
