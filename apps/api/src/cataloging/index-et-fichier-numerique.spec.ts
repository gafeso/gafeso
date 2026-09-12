import { describe, expect, it, vi } from 'vitest';
import { DigitalCopyService } from './digital-copy.service';
import { buildRecordSearchDoc } from '../search/search.service';

/**
 * BACKLOG N°9, RENDU VÉRIFIABLE — « supprimer un fichier numérique ne réindexe
 * pas ».
 *
 * ## Ce que dit le point n°9, et pourquoi ce n'est pas encore un défaut
 *
 * `DigitalCopyService.remove()` supprime la ligne `digital_copies` et les
 * objets de stockage, puis s'arrête : aucune réindexation. Ce n'est PAS un
 * défaut aujourd'hui, et l'ordre des mots compte — **rien dans le document
 * indexé ne dépend de l'existence du fichier**, donc rien ne se périme.
 *
 * ⚠ LA DISSYMÉTRIE AVEC LE TÉLÉVERSEMENT N'EST PAS UN OUBLI, contrairement à ce
 * que la formulation du backlog laissait croire. Le téléversement réindexe
 * parce qu'il **pré-remplit des champs indexés** — titre, auteur, résumé,
 * éditeur, extraits du PDF. Il ne réindexe pas « parce qu'un fichier est
 * apparu ». La suppression, elle, ne touche aucun champ indexé. Les deux
 * comportements sont donc justes pour la même raison.
 *
 * ## Pourquoi un test, et pas la note qui existait déjà
 *
 * Le point n°9 portait cette prémisse en prose, dans un fichier de backlog. Une
 * règle énoncée se contourne ; et une affirmation sur du code, écrite ailleurs
 * que dans du code, finit fausse sans que personne l'apprenne. Le jour où un
 * drapeau « a un fichier » entre dans l'index, le filtre annoncera
 * « numérique » une notice dont la bibliothécaire vient de retirer le fichier —
 * et personne ne verra la différence avant qu'un lecteur ne clique.
 *
 * Ce test est l'invariant correspondant, dans les DEUX sens.
 */

/**
 * Les champs RÉELLEMENT produits pour l'index. Pris sur la sortie de
 * `buildRecordSearchDoc`, pas sur le type `RecordSearchDoc` : un champ produit
 * sans être déclaré serait indexé quand même.
 */
const CHAMPS_INDEXES = [
  'author',
  'category',
  'contributorList',
  'contributors',
  'coverUrl',
  'defenseUniversity',
  'id',
  'isbn',
  'keywords',
  'language',
  'publishYear',
  'recordType',
  'summary',
  'title',
  'titleComplement',
];

/**
 * Ceux de ces champs qui DÉPENDENT de l'existence d'un fichier numérique.
 *
 * ⚠ VIDE AUJOURD'HUI, ET C'EST TOUT CE QUI TIENT LE POINT N°9. Si vous ajoutez
 * ici un champ (`avecFichier`, `hasDigitalCopy`, un compteur de pages…), le
 * test ci-dessous exigera que `remove()` réindexe — et il aura raison.
 */
const CHAMPS_QUI_DEPENDENT_DU_FICHIER: string[] = [];

function doc() {
  return buildRecordSearchDoc({
    id: 'rec-1',
    title: 'Le droit foncier rural',
    author: 'Ouédraogo, Salif',
    isbn: null,
    category: 'droit',
    language: 'fr',
    publishYear: 2021,
    recordType: 'book',
    coverUrl: null,
  });
}

function serviceEtDoublures(avecCopie = true) {
  const search = { indexRecords: vi.fn().mockResolvedValue(undefined) };
  const storage = { deleteObject: vi.fn().mockResolvedValue(undefined) };
  const db = {
    digitalCopy: {
      findUnique: vi.fn(async () =>
        avecCopie ? { recordId: 'rec-1', objectKey: 'o/1', encObjectKey: 'o/1.enc' } : null,
      ),
      delete: vi.fn().mockResolvedValue({}),
    },
  };
  const service = new DigitalCopyService(
    storage as never,
    {} as never,
    search as never,
    {} as never,
    {} as never,
  );
  return { service, search, storage, db: db as never };
}

describe('Le document indexé, et ce qu’il doit à un fichier', () => {
  it('les champs produits pour l’index sont EXACTEMENT ceux déclarés ici', () => {
    // ⚠ TÉMOIN QUI COMPTE. Un test « le document contient bien un titre »
    // confirmerait que la fonction tourne ; seul un ensemble exact signale le
    // champ ajouté par quelqu'un qui n'a jamais entendu parler du point n°9 —
    // et c'est précisément cette personne que ce test protège.
    expect(Object.keys(doc()).sort()).toEqual(CHAMPS_INDEXES);
    expect(CHAMPS_INDEXES.length).toBe(15);
  });

  it('les champs dépendant du fichier sont bien des champs indexés', () => {
    // Garde de l'instrument : une liste qui nommerait un champ inexistant
    // rendrait l'invariant ci-dessous inapplicable en silence.
    for (const champ of CHAMPS_QUI_DEPENDENT_DU_FICHIER) {
      expect(CHAMPS_INDEXES, champ).toContain(champ);
    }
  });
});

describe('⚠ L’INVARIANT DU POINT N°9, dans les deux sens', () => {
  it('aucun champ indexé ne dépend du fichier ⟹ remove() n’a pas à réindexer', async () => {
    const { service, search, db } = serviceEtDoublures();

    await service.remove(db, 'rec-1');

    if (CHAMPS_QUI_DEPENDENT_DU_FICHIER.length === 0) {
      // Caractérisation, pas préférence : on enregistre que la suppression ne
      // réindexe pas, et ce test dit POURQUOI c'est acceptable. Le jour où
      // quelqu'un ajoutera la réindexation, ce test tombera — et la bonne
      // réaction sera de clore le point n°9, pas de retirer l'appel.
      expect(search.indexRecords).not.toHaveBeenCalled();
    } else {
      // L'autre branche de l'invariant. Elle est écrite et exécutable dès
      // aujourd'hui : elle n'attend pas qu'on pense à l'écrire le jour où le
      // champ arrivera — c'est-à-dire le jour où on n'y pensera pas.
      expect(
        search.indexRecords,
        `l'index porte ${CHAMPS_QUI_DEPENDENT_DU_FICHIER.join(', ')}, ` +
          'donc retirer un fichier périme le document : remove() DOIT réindexer',
      ).toHaveBeenCalledTimes(1);
    }
  });

  it('la suppression retire quand même la ligne ET les deux objets de stockage', async () => {
    // Le reste du comportement de `remove()`, pour que le test ci-dessus ne
    // soit pas la seule chose qui le décrive — un test qui ne vérifie qu'une
    // absence ne dit rien de ce qui a lieu.
    const { service, search, storage, db } = serviceEtDoublures();

    expect(await service.remove(db, 'rec-1')).toEqual({ deleted: true });
    expect(storage.deleteObject).toHaveBeenCalledTimes(2); // clair + chiffré
    expect(search.indexRecords).not.toHaveBeenCalled();
  });

  it('sans exemplaire numérique, elle refuse au lieu de rendre un succès vide', async () => {
    const { service, db } = serviceEtDoublures(false);
    await expect(service.remove(db, 'rec-1')).rejects.toThrow(/Aucun exemplaire numérique/);
  });
});
