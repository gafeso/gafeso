import { LIBELLES } from './libelles';

// Registre de modules — contrat de `GET /modules`, lu dans apps/api le
// 11 septembre 2026 (P4-1, `modules.service.ts`).
//
// ⚠ L'ÉCRAN AFFICHE CE QUE L'API DÉCLARE, JAMAIS LA LISTE DE LA MAQUETTE. La
// maquette décrit une CIBLE de douze modules ; l'API en déclare huit
// aujourd'hui. Afficher les quatre autres donnerait des interrupteurs qui ne
// commandent rien — des cases inertes, et la maquette dit une intention, pas
// un état.

/** Pourquoi une ligne est verrouillée. Les codes viennent de l'API. */
export interface MotifVerrouillage {
  code: 'noyau' | 'dependance_manquante' | 'requis_par';
  /** Modules en cause — vide pour `noyau`, qui n'en nomme aucun. */
  modules: { id: string; libelle: string }[];
}

export interface ModuleEtat {
  id: string;
  libelle: string;
  description: string;
  /** Identifiants des modules dont celui-ci a besoin. */
  dependances: string[];
  /** Un module noyau ne se désactive jamais (décision 4). */
  noyau: boolean;
  actif: boolean;
  /** Verrouillé : noyau, dépendance manquante, ou un autre module en dépend. */
  verrouille: boolean;
  /**
   * ⚠ DÉPRÉCIÉ — phrase française composée par l'API. Conservé par l'API le
   * temps de la migration ; l'écran ne l'utilise PLUS.
   */
  motifVerrouillage: string | null;

  /**
   * Motif STRUCTURÉ : un code et les modules en cause, avec leurs libellés.
   *
   * ⚠ C'est la solution proposée au backlog n° 14 et livrée par l'API : la
   * règle de verrouillage reste sa propriété exclusive — le front ne la
   * recompose pas — et la PHRASE redevient du ressort de `lib/libelles.ts`,
   * donc traduisible. On ne reprend plus un texte visible venu de l'API.
   */
  motif: MotifVerrouillage | null;
  /**
   * Les écrans qui disparaissent quand ce module s'éteint — RENDUS PAR L'API.
   *
   * ⚠ J'AVAIS ÉCRIT CETTE TABLE CÔTÉ FRONT, et c'était une erreur : deux
   * sources pour la même information, qui divergeraient au premier module
   * ajouté. La liste appartient à celui qui déclare les modules. Constaté en
   * recette, le 11 septembre 2026, en lisant la réponse réelle plutôt que la
   * seule signature du service.
   *
   * Elle peut être vide : un module dont aucun écran ne dépend. L'écran le DIT
   * alors, au lieu d'afficher une liste vide qui se lirait « rien ne disparaît ».
   */
  ecrans: string[];
}

/**
 * La phrase qui dit pourquoi une ligne est verrouillée, composée ICI.
 *
 * ⚠ La RÈGLE reste à l'API — c'est elle qui décide qu'un module est verrouillé
 * et nomme ceux qui en sont cause. Le front n'en refait pas le calcul : il
 * traduit un code. Recomposer la règle créerait deux sources qui divergeraient
 * au premier module ajouté ; reprendre la phrase interdisait une seconde
 * langue. Le code structuré est la troisième voie, et c'est la bonne.
 */
export function phraseVerrouillage(motif: MotifVerrouillage | null): string | null {
  if (!motif) return null;
  const noms = motif.modules.map((m) => m.libelle).join(', ');
  switch (motif.code) {
    case 'noyau':
      return LIBELLES.modules.motifNoyau;
    case 'dependance_manquante':
      return LIBELLES.modules.motifNecessite(noms);
    case 'requis_par':
      return LIBELLES.modules.motifRequisPar(noms);
    default:
      // ⚠ Un code inconnu ne rend PAS une chaîne vide : la ligne serait
      // verrouillée sans qu'on sache pourquoi, ce qui est pire que muet. On
      // retombe sur la phrase dépréciée de l'API, qui existe encore.
      return null;
  }
}

/** Modules basculables, dans l'ordre du registre — les verrouillés restent visibles. */
export const estBasculable = (m: ModuleEtat) => !m.noyau && !m.verrouille;
