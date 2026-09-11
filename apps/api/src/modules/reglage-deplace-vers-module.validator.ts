import {
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/**
 * Refuse un réglage ABSORBÉ par le registre de modules, en nommant sa route.
 *
 * ⚠ POURQUOI NOMMER PLUTÔT QUE REFUSER SÈCHEMENT. Le `ValidationPipe` tourne en
 * `forbidNonWhitelisted` : retirer le champ suffirait à produire un 400, mais
 * son message serait « property enabled should not exist ». Une règle
 * conditionnelle se LIT ; elle ne se découvre pas par un refus muet.
 *
 * ⚠ ET POURQUOI CE VALIDATEUR EXISTE EN PLUS DE `ReglageDeplace` (tenancy) :
 * celui-là nomme une route d'authentification, celui-ci nomme le registre. Deux
 * messages différents, deux destinations différentes — les fusionner
 * obligerait à passer la destination en paramètre, et un paramètre de message
 * finit par être oublié. C'est la duplication la moins coûteuse des deux.
 */
@ValidatorConstraint({ name: 'ReglageDeplaceVersModule', async: false })
export class ReglageDeplaceVersModule implements ValidatorConstraintInterface {
  validate(): boolean {
    return false; // présent = refusé, aucune valeur n'est acceptable
  }

  defaultMessage(args: ValidationArguments): string {
    return (
      `Le réglage « ${args.property} » ne se modifie plus ici : l'activation des ` +
      'rappels est désormais un MODULE, sur PATCH /modules/rappels, et demande ' +
      'la fonction « modules.gerer ». Éteindre un module retire des écrans à ' +
      'toute l’école — ce n’est pas un réglage, c’est une décision de périmètre.'
    );
  }
}
