/**
 * ⭐⭐ LE SCAN PAR NIVEAU — et c'est le SERVEUR qui décide de ce qui part.
 *
 * L'application mobile ne filtre RIEN et ne lit aucun rôle pour choisir quoi
 * afficher : un champ absent n'est pas affiché, une action absente n'a pas de
 * bouton. C'est la seule architecture dans laquelle un champ réservé ne peut
 * pas atteindre le mauvais compte — parce qu'il ne quitte jamais le serveur.
 *
 * ⚠ UN CHAMP RÉSERVÉ EST **ABSENT**, PAS `null`. La différence n'est pas
 * cosmétique :
 *   · `null` DIT qu'il existe quelque chose à cet endroit, et invite à
 *     l'afficher comme un vide — un emprunteur « inconnu » plutôt qu'un
 *     emprunteur qu'on n'a pas le droit de voir ;
 *   · `null` se sérialise, se journalise et finit dans un cache, là où une clé
 *     absente ne laisse aucune trace ;
 *   · et une épreuve sur `=== null` passe aussi quand le champ a été oublié,
 *     tandis qu'une épreuve sur `in` ne peut pas se tromper.
 *
 * ⚠ `niveau` EST INDICATIF. L'application ne s'en sert pas pour décider d'un
 * affichage — un cas le vérifie. Il est là pour que l'app puisse DIRE au
 * lecteur pourquoi sa carte est courte, pas pour piloter quoi que ce soit.
 *
 * Contrat arrêté avec la session mobile le 13 octobre 2026 ; l'application est
 * déjà écrite contre cette forme, donc le serveur peut la servir sans qu'une
 * nouvelle version de l'app soit publiée.
 */

/** Les trois niveaux, du moins au plus informé. */
export const NIVEAUX_DE_SCAN = ['visiteur', 'etudiant', 'bibliothecaire'] as const;
export type NiveauDeScan = (typeof NIVEAUX_DE_SCAN)[number];

/** Un exemplaire, tel que le scan le voit. */
export type ExemplaireScanne = {
  id: string;
  codeBarre: string;
  statut: string;
  emplacement: string | null;
  cote: string | null;
  /** Le prêt en cours, s'il y en a un. */
  pret: { echeance: Date; emprunteur: string | null } | null;
};

/**
 * ⚠ UNE UNION DISCRIMINÉE, et non un objet à champs optionnels.
 *
 * Avec des champs optionnels, rien n'empêche d'écrire `emprunteur` sur une
 * réponse de visiteur : le type l'accepterait. Ici le compilateur refuse —
 * `emprunteur` n'EXISTE pas sur la variante visiteur. C'est la leçon du
 * booléen qui refusait pour deux raisons, appliquée à une DIVULGATION.
 */
export type ReponseDeScan =
  | {
      niveau: 'visiteur';
      record: unknown;
      /** Une PHRASE, jamais un compteur : le serveur a l'heure de référence. */
      disponibilite: string;
      actions: string[];
    }
  | {
      niveau: 'etudiant';
      record: unknown;
      disponibilite: string;
      emplacement: string;
      actions: string[];
    }
  | {
      niveau: 'bibliothecaire';
      record: unknown;
      disponibilite: string;
      emplacement: string;
      exemplaire: { codeBarre: string; statut: string };
      emprunteur?: { nom: string; echeance: string };
      actions: string[];
    };

const LIBELLES_STATUT: Record<string, string> = {
  AVAILABLE: 'Disponible',
  CHECKED_OUT: 'En prêt',
  ON_HOLD: 'Mis de côté',
  LOST: 'Perdu',
  DAMAGED: 'Abîmé',
  WITHDRAWN: 'Retiré',
};

/**
 * La disponibilité, EN PHRASE.
 *
 * ⚠ Le mobile ne recompose pas ce texte, et c'est voulu : une phrase composée
 * côté application figerait UNE formulation, dans UNE langue, pour toutes les
 * installations. Et le serveur est le seul à connaître l'heure de référence.
 */
export function phraseDeDisponibilite(exemplaires: ExemplaireScanne[]): string {
  if (exemplaires.length === 0) return 'Aucun exemplaire physique';
  const libres = exemplaires.filter((e) => e.statut === 'AVAILABLE').length;
  if (libres === 0) {
    return exemplaires.length === 1
      ? 'Le seul exemplaire est indisponible'
      : `Aucun des ${exemplaires.length} exemplaires n’est disponible`;
  }
  if (libres === exemplaires.length) {
    return libres === 1 ? '1 exemplaire disponible' : `${libres} exemplaires disponibles`;
  }
  return `${libres} exemplaire${libres > 1 ? 's' : ''} sur ${exemplaires.length} disponible${
    libres > 1 ? 's' : ''
  }`;
}

/** L'emplacement, en phrase, à partir de ce que l'exemplaire porte VRAIMENT. */
export function phraseDEmplacement(e: ExemplaireScanne | null): string {
  if (!e) return 'Emplacement non renseigné';
  const bouts = [e.emplacement, e.cote ? `Cote ${e.cote}` : null].filter(Boolean);
  return bouts.length ? bouts.join(' · ') : 'Emplacement non renseigné';
}

/**
 * L'échéance, EN PHRASE, calculée contre l'heure de référence du serveur.
 *
 * ⚠ Le retard se dit, il ne se déduit pas d'une date brute : un client qui
 * compare à SON horloge se trompe de fuseau, et un client en cache se trompe
 * de jour.
 */
export function phraseDEcheance(echeance: Date, maintenant: Date): string {
  const jour = 24 * 60 * 60 * 1000;
  const debut = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const ecart = Math.round((debut(echeance) - debut(maintenant)) / jour);
  const date = echeance.toISOString().slice(0, 10);
  if (ecart < 0) {
    const j = Math.abs(ecart);
    return `En retard de ${j} jour${j > 1 ? 's' : ''} (échéance ${date})`;
  }
  if (ecart === 0) return `À rendre aujourd’hui (${date})`;
  if (ecart === 1) return `À rendre demain (${date})`;
  return `À rendre le ${date}`;
}

/**
 * ⭐ LES ACTIONS NE SE DEVINENT PAS : on ne liste QUE celles dont la route
 * existe.
 *
 * La session mobile l'a écrit noir sur blanc : « tant qu'elles manquent, le
 * serveur ne doit pas lister ces actions — sans quoi l'application affichera un
 * message disant que le geste n'est pas encore disponible, ce qui est exact et
 * inutile ». Un bouton qui explique qu'il ne marche pas est un bouton sans
 * effet, et ce dépôt les refuse.
 *
 * `lire` est le seul chemin réellement branché aujourd'hui.
 */
export function actionsDisponibles(
  niveau: NiveauDeScan,
  faits: { lectureEnLigne: boolean },
): string[] {
  const actions: string[] = [];
  // ⚠ Un visiteur n'a aucun accès en ligne : la lecture se décide par le
  // contrôle d'accès, jamais par le niveau de scan.
  if (niveau !== 'visiteur' && faits.lectureEnLigne) actions.push('lire');
  return actions;
}

/**
 * Compose la réponse. Chaque niveau construit son objet ENTIER : il n'y a pas
 * de champ posé puis retiré, donc pas de chemin par lequel un champ réservé
 * pourrait survivre à un oubli.
 */
export function reponseDeScan(entree: {
  niveau: NiveauDeScan;
  record: unknown;
  exemplaires: ExemplaireScanne[];
  /** L'exemplaire scanné, quand le code-barres a pu être rattaché. */
  exemplaire: ExemplaireScanne | null;
  lectureEnLigne: boolean;
  maintenant: Date;
}): ReponseDeScan {
  const { niveau, record, exemplaires, exemplaire, maintenant } = entree;
  const disponibilite = phraseDeDisponibilite(exemplaires);
  const actions = actionsDisponibles(niveau, { lectureEnLigne: entree.lectureEnLigne });

  if (niveau === 'visiteur') {
    // ⚠ NI emplacement, NI exemplaire, NI emprunteur. Un visiteur apprend
    // qu'un document existe et s'il est disponible — rien de l'intérieur du
    // bâtiment, rien de qui l'a emprunté.
    return { niveau, record, disponibilite, actions };
  }
  if (niveau === 'etudiant') {
    // ⚠ L'emplacement OUI — c'est ce qui l'envoie au bon rayon. Le code-barres
    // de l'exemplaire et l'emprunteur NON : le premier sert les gestes de
    // guichet, le second est une donnée personnelle.
    return {
      niveau,
      record,
      disponibilite,
      emplacement: phraseDEmplacement(exemplaire ?? exemplaires[0] ?? null),
      actions,
    };
  }
  const vise = exemplaire ?? exemplaires[0] ?? null;
  const base = {
    niveau,
    record,
    disponibilite,
    emplacement: phraseDEmplacement(vise),
    exemplaire: {
      codeBarre: vise?.codeBarre ?? '',
      statut: LIBELLES_STATUT[vise?.statut ?? ''] ?? vise?.statut ?? 'Inconnu',
    },
    actions,
  } as const;
  // ⚠ `emprunteur` n'est AJOUTÉ que s'il y a un prêt ET un nom. Pas de clé à
  // `null` : une clé absente ne se journalise pas, ne se met pas en cache, et
  // ne s'affiche pas comme un vide.
  //
  // ⚠ ET JAMAIS L'IDENTIFIANT, LE COURRIEL NI LE TÉLÉPHONE : le nom et
  // l'échéance suffisent au geste de guichet. Tout le reste est une
  // divulgation sans usage.
  if (vise?.pret && vise.pret.emprunteur) {
    return {
      ...base,
      emprunteur: {
        nom: vise.pret.emprunteur,
        echeance: phraseDEcheance(vise.pret.echeance, maintenant),
      },
    };
  }
  return { ...base };
}
