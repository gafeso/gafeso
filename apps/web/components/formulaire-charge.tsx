'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';

import { ApiError } from '@/lib/api';
import { LIBELLES } from '@/lib/libelles';

/**
 * ⭐⭐ UN FORMULAIRE NE S'AFFICHE PAS AVANT SES DONNÉES — et ce n'est pas une
 * discipline, c'est le TYPE qui le rend impossible.
 *
 * ## 🔴 CE QU'IL RÉPARE, et la CI l'a trouvé avant nous
 *
 * `/admin/accueil` rendait son formulaire AVANT la réponse de l'API : bouton
 * « Enregistrer » actif, champs vides. Enregistrer à cet instant **effaçait la
 * page d'accueil de l'école**.
 *
 * ⚠ **Et la forme la plus répandue est PIRE que des champs vides.**
 * `/admin/etablissement` initialise ses états avec des valeurs par DÉFAUT —
 * `useState('#0F2B46')` pour la couleur primaire. Avant l'arrivée des données,
 * l'écran n'a donc pas l'air vide : il a l'air **rempli et juste**. Enregistrer
 * écrit des couleurs que personne n'a choisies, par-dessus celles de l'école.
 *
 * > ⭐ Un formulaire vide se remarque. Un formulaire rempli de défauts se
 * > remarque le jour où quelqu'un compare — c'est-à-dire jamais.
 *
 * ## ⭐ LE LEVIER : la fonction de rendu ne reçoit les données que si elles sont là
 *
 * `EtatDeChargement<T>` est une union discriminée, et `children` est une
 * FONCTION de `T`. Il n'existe donc aucune façon d'écrire le corps du
 * formulaire sans tenir les données : le compilateur ne la propose pas.
 *
 * C'est la forme de `{ publiable: false }` du volet d'usage — la branche qui ne
 * doit rien rendre **ne porte aucun champ**, donc il n'y a rien à masquer, rien
 * à oublier de masquer, et rien qu'un repli puisse transformer en défaut.
 * Surveiller un booléen `chargee` aurait marché tant que personne n'oublie ;
 * ceci marche quand quelqu'un oublie.
 *
 * ## ⚠ CE QUI RESTE AFFICHÉ PENDANT LES TROIS PHASES
 *
 * Le TITRE. Un écran qui n'affiche rien du tout se lit comme une page cassée —
 * on recharge, ou on s'en va. Le titre dit où l'on est ; le motif dit pourquoi
 * les champs ne sont pas encore là. « Une non-réponse écrite comme un fait est
 * un défaut » : ici on écrit la non-réponse COMME une non-réponse.
 *
 * ## ⚠ ET L'ERREUR A UNE SORTIE
 *
 * `recharger` n'est pas optionnel quand on passe par le crochet : un écran qui
 * annonce un échec sans proposer de réessayer est une impasse, et c'est le même
 * défaut que l'état vide sans action.
 */
export type EtatDeChargement<T> =
  | { phase: 'chargement' }
  | { phase: 'erreur'; message: string }
  | { phase: 'pret'; donnees: T };

/**
 * Charge une fois, expose l'état et un moyen de recommencer.
 *
 * ⚠ `charger` doit être stable (`useCallback`) : rendue neuve à chaque rendu,
 * elle relancerait l'effet en boucle. C'est la cinquième forme de « la doublure
 * qui rend un objet NEUF à chaque appel », et elle se manifeste ici par un
 * worker qui MEURT plutôt que par un test qui échoue.
 */
export function useFormulaireCharge<T>(
  charger: () => Promise<T>,
  /**
   * ⚠ `actif: false` ATTEND SANS APPELER — et ce n'est pas une commodité.
   *
   * Tant que les fonctions de la personne ne sont pas connues, on ignore si
   * elle a le droit de lire ces données : appeler maintenant afficherait un 403
   * à quelqu'un qui a peut-être le droit. L'alternative — ne rendre le
   * composant que plus tard — fait MONTER PUIS DÉMONTER deux sous-arbres, donc
   * deux `<h1>` successifs ; un test qui capture le premier le trouve détaché à
   * l'assertion suivante. C'est ce qui est arrivé à `parametres-scinde`, et le
   * défaut était dans mon découpage, pas dans son attente.
   */
  actif = true,
): {
  etat: EtatDeChargement<T>;
  recharger: () => void;
} {
  const [etat, setEtat] = useState<EtatDeChargement<T>>({ phase: 'chargement' });

  const lancer = useCallback(() => {
    let abandonne = false;
    setEtat({ phase: 'chargement' });
    if (!actif) return () => undefined;
    charger().then(
      (donnees) => {
        if (!abandonne) setEtat({ phase: 'pret', donnees });
      },
      (err: unknown) => {
        if (abandonne) return;
        setEtat({
          phase: 'erreur',
          message:
            err instanceof ApiError ? err.message : LIBELLES.formulaireCharge.echec,
        });
      },
    );
    return () => {
      abandonne = true;
    };
  }, [charger, actif]);

  useEffect(() => lancer(), [lancer]);

  return { etat, recharger: lancer };
}

export function FormulaireCharge<T>({
  etat,
  titre,
  motif,
  recharger,
  children,
}: {
  etat: EtatDeChargement<T>;
  /** Affiché dans les TROIS phases : sans lui, l'écran se lit comme cassé. */
  titre: ReactNode;
  /** Pourquoi les champs ne sont pas là. Propre à l'écran, car le risque l'est. */
  motif: string;
  recharger: () => void;
  /** ⭐ Ne reçoit les données que dans la phase « pret ». */
  children: (donnees: T) => ReactNode;
}) {
  /*
   * ⚠ LE TITRE EST RENDU DANS LES TROIS PHASES, « pret » COMPRISE.
   *
   * Première écriture : `if (phase === 'pret') return children(...)`. Le titre
   * disparaissait donc à l'arrivée des données, et c'est `parametres-scinde` —
   * un test que je n'avais pas écrit — qui l'a dit. Le commentaire d'en-tête
   * annonçait déjà les trois phases : le composant démentait sa propre
   * documentation, et seul un test s'en est aperçu.
   */
  return (
    <div className="flex flex-col gap-3">
      {titre}
      {etat.phase === 'pret' && children(etat.donnees)}
      {etat.phase === 'chargement' && (
        <>
          <p className="text-sm text-muted">{LIBELLES.formulaireCharge.chargement}</p>
          <p className="max-w-prose text-xs text-muted">{motif}</p>
        </>
      )}
      {etat.phase === 'erreur' && (
        <>
          {/*
            ⚠ `role="alert"` ICI et pas sur le chargement : une erreur est une
            faute, un chargement n'en est pas une. Le rouge et l'annonce se
            dépensent sur ce qui ne va pas, sinon ils s'usent.
          */}
          <p role="alert" className="text-sm text-danger">
            {etat.message}
          </p>
          <div>
            <button
              type="button"
              onClick={recharger}
              className="rounded border border-line px-3 py-1.5 text-sm"
            >
              {LIBELLES.formulaireCharge.reessayer}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
