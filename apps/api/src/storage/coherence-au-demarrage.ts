/**
 * ⭐⭐ LE STOCKAGE NE PEUT PAS ÊTRE VIDE QUAND LA BASE PORTE DES DOCUMENTS.
 *
 * 🔴 LE DÉFAUT QUE CE GARDE EMPÊCHE, et il est silencieux : le compose de
 * production est passé de MinIO à Garage. Une instance EXISTANTE qui fait
 * `up -d` sans avoir migré démarre sur un Garage VIDE. Ses documents sont
 * intacts — ils dorment dans l'ancien volume MinIO — mais l'application ne les
 * voit plus : chaque fiche promet un fichier, chaque lecture rend une erreur de
 * stockage, et RIEN ne dit que la cause est une migration non faite.
 *
 * ⚠ Et c'est exactement la famille que ce dépôt traque : tout fonctionne, les
 * tests passent, l'API répond 200 sur ses routes de santé. Le défaut ne se
 * manifeste qu'au premier lecteur qui ouvre un document — c'est-à-dire chez le
 * client, un jour où personne ne regarde.
 *
 * ⭐ DEPLOY.md décrit la migration en six temps. Un document ne retient
 * personne : il faut un REFUS sur le chemin du geste.
 *
 * ⚠ LA DÉCISION EST PURE ET SÉPARÉE DE SA MESURE. `decisionDeCoherence` ne
 * touche ni la base ni le stockage : elle reçoit deux nombres. C'est ce qui la
 * rend éprouvable sans monter une pile — et c'est la leçon des fonctions pures
 * du module de stockage, qui s'éprouvent sans doublure.
 */

export type DecisionDeCoherence =
  | { demarre: true }
  | { demarre: false; documents: number; message: string };

/** Le nom de la variable d'échappement, pour que le message la cite lui-même. */
export const ECHAPPEMENT = 'STORAGE_SKIP_COHERENCE_CHECK';

export function decisionDeCoherence(faits: {
  /** Copies numériques comptées EN BASE, toutes écoles confondues. */
  documentsEnBase: number;
  /**
   * Objets présents dans le bucket des copies — `null` si le bucket est
   * ABSENT ou illisible.
   *
   * ⚠ Absent et vide se traitent PAREIL, et c'est voulu : les deux veulent
   * dire « l'application ne trouvera aucun document ». Les distinguer ici
   * inviterait à créer le bucket pour faire taire le garde, ce qui ne
   * restituerait aucun fichier.
   */
  objetsDansLeStockage: number | null;
  /** La variable d'échappement, telle que l'environnement la porte. */
  echappement?: string;
}): DecisionDeCoherence {
  // ⚠ L'ÉCHAPPEMENT EST EXPLICITE, et il ne vaut que pour la valeur exacte
  // `oui-je-sais-ce-que-je-fais`. Un drapeau qui basculerait sur n'importe
  // quelle valeur non vide ferait qu'un `=0` ou un `=false` le DÉSACTIVE —
  // c'est le piège qu'on a mesuré sur STORAGE_PUBLIC_BUCKET_IN_PATH.
  if (faits.echappement === 'oui-je-sais-ce-que-je-fais') return { demarre: true };

  // Une installation NEUVE n'a aucun document : rien à perdre, rien à dire.
  if (faits.documentsEnBase === 0) return { demarre: true };
  const objets = faits.objetsDansLeStockage;
  if (objets !== null && objets > 0) return { demarre: true };

  const n = faits.documentsEnBase;
  return {
    demarre: false,
    documents: n,
    message:
      `STOCKAGE VIDE ALORS QUE ${n} DOCUMENT${n > 1 ? 'S' : ''} NUMÉRIQUE${
        n > 1 ? 'S' : ''
      } EXISTE${n > 1 ? 'NT' : ''} EN BASE.\n` +
      '\n' +
      (objets === null
        ? "Le bucket des copies numériques est ABSENT ou illisible.\n"
        : 'Le bucket des copies numériques est VIDE.\n') +
      '\n' +
      "Si vous venez de passer de MinIO à Garage, vos fichiers ne sont PAS\n" +
      "perdus : ils sont dans l'ancien volume MinIO, intact. Il reste à les\n" +
      'copier — lancez la migration : DEPLOY.md, « Migration de MinIO vers\n' +
      'Garage — pour une instance EXISTANTE », six étapes.\n' +
      '\n' +
      "⚠ L'API refuse de démarrer plutôt que de servir un catalogue dont\n" +
      'chaque fiche promet un fichier que personne ne peut ouvrir.\n' +
      '\n' +
      `Pour une maintenance où ce refus gêne : ${ECHAPPEMENT}=oui-je-sais-ce-que-je-fais\n` +
      "— jamais par défaut, et jamais sur une instance qui sert des lecteurs.",
  };
}
