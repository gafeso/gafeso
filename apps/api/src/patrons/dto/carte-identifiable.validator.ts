import {
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/**
 * Une carte de bibliothèque désigne quelqu'un.
 *
 * LE DÉFAUT CORRIGÉ. `CreatePatronDto` ne portait aucun champ de nom : inscrire
 * un lecteur créait une carte ANONYME. Et le seul moyen d'avoir un nom — lier
 * un compte — était inutilisable par la bibliothécaire, `GET /accounts` exigeant
 * `lecteurs.voir` qu'elle n'a pas. Elle ne pouvait donc produire que des cartes
 * sans identité.
 *
 * LA RÈGLE : un nom OU un compte lié. Pas les deux obligatoirement — une carte
 * se délivre à un lecteur sans adresse e-mail, à un visiteur extérieur, à un
 * élève trop jeune pour un compte ; et inversement, lier un compte suffit,
 * puisque le nom en est recopié.
 *
 * ⚠ LE REFUS NOMME CE QUI MANQUE. « Données invalides » laisse une
 * bibliothécaire deviner ; elle doit lire ce qu'on attend d'elle.
 */
export function raisonDeRefusDeLaCarte(objet: unknown): string | null {
  const o = (objet ?? {}) as Record<string, unknown>;
  const aUnNom =
    typeof o.firstName === 'string' && o.firstName.trim().length > 0 ||
    typeof o.lastName === 'string' && o.lastName.trim().length > 0;
  const aUnCompte = typeof o.userId === 'string' && o.userId.trim().length > 0;
  if (aUnNom || aUnCompte) return null;
  return (
    'Un nom ou un compte lié est requis : renseignez au moins le nom de ' +
    'l’adhérent, ou liez un compte existant.'
  );
}

@ValidatorConstraint({ name: 'carteIdentifiable', async: false })
export class CarteIdentifiable implements ValidatorConstraintInterface {
  /**
   * ⚠ Contrainte de CLASSE : elle lit l'objet entier, pas un champ. D'où
   * l'absence d'état sur `this` — class-validator réutilise une instance pour
   * toutes les requêtes, et un message mémorisé fuiterait d'une requête à
   * l'autre sous charge.
   */
  validate(_valeur: unknown, args: ValidationArguments): boolean {
    return raisonDeRefusDeLaCarte(args.object) === null;
  }

  defaultMessage(args: ValidationArguments): string {
    return raisonDeRefusDeLaCarte(args.object) ?? 'Carte non identifiable.';
  }
}
