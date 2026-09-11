import {
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/**
 * Refuse un réglage qui a DÉMÉNAGÉ, en nommant sa nouvelle route.
 *
 * ⚠ POURQUOI UN VALIDATEUR ET PAS UNE SIMPLE SUPPRESSION DU CHAMP. Le
 * `ValidationPipe` global tourne en `forbidNonWhitelisted` : retirer
 * `require2fa` du DTO suffirait à produire un 400. Mais son message serait
 * « property require2fa should not exist » — la bibliothécaire, ou le front,
 * partirait chercher ce qu'il a mal fait alors que le réglage existe toujours,
 * ailleurs. Une règle conditionnelle se LIT ; elle ne se découvre pas par un
 * refus muet.
 *
 * ⚠ ET LE PIÈGE DE `@IsOptional()`, déjà payé une fois dans ce dépôt :
 * class-validator saute TOUS les validateurs d'une propriété ABSENTE. C'est
 * exactement ce qu'on veut ici — le champ absent est le cas normal, et le
 * refus ne doit se déclencher que s'il est envoyé. La combinaison est donc
 * juste, à l'inverse du cas où la contrainte portait sur un AUTRE champ que
 * celui qu'elle décorait.
 */
@ValidatorConstraint({ name: 'ReglageDeplace', async: false })
export class ReglageDeplace implements ValidatorConstraintInterface {
  validate(): boolean {
    // Présent = refusé. Il n'existe aucune valeur acceptable.
    return false;
  }

  defaultMessage(args: ValidationArguments): string {
    return (
      `Le réglage « ${args.property} » ne se modifie plus ici : il relève ` +
      'désormais de la politique d’authentification de l’établissement, sur ' +
      'PATCH /auth/policy, et demande la fonction « securite.authentification ». ' +
      'Il était jusqu’ici modifiable avec les couleurs et le logo, ce qui ' +
      'permettait de lever la double authentification sans droit de sécurité.'
    );
  }
}
