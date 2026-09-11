import {
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { MAX_HERO_SLIDES, urlDeContenuValide } from '../home-content';

/**
 * Raison de refus du bandeau, ou null si la liste est acceptable.
 *
 * Fonction PURE, et c'est nécessaire : class-validator réutilise UNE instance
 * de contrainte pour toutes les requêtes. Mémoriser le message sur `this`
 * ferait fuiter la raison d'une requête dans la réponse d'une autre, sous
 * charge — un défaut qui ne se voit jamais en développement.
 */
export function raisonDeRefusDuBandeau(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null; // @IsObject s'en charge
  const identity = (value as Record<string, unknown>).identity;
  if (!identity || typeof identity !== 'object') return null;
  const brut = (identity as Record<string, unknown>).heroSlides;
  // Absent = l'établissement n'a pas de bandeau à liste. Cas NORMAL, et c'est
  // celui de toutes les écoles configurées avant ce champ.
  if (brut === undefined || brut === null) return null;

  if (!Array.isArray(brut)) {
    return 'Le bandeau d’accueil attend une liste de diapositives.';
  }
  if (brut.length > MAX_HERO_SLIDES) {
    // La limite est NOMMÉE : un refus qui ne dit pas le plafond laisse
    // l'utilisateur retirer des diapositives au hasard.
    return `Le bandeau d’accueil accepte au maximum ${MAX_HERO_SLIDES} diapositives (${brut.length} reçues).`;
  }
  const rang = brut.findIndex((d) => {
    const o = d && typeof d === 'object' ? (d as Record<string, unknown>) : {};
    return !urlDeContenuValide(o.imageUrl);
  });
  if (rang !== -1) {
    // Refus plutôt que disparition silencieuse : la normalisation écarterait
    // cette diapositive sans rien dire, et l'établissement croirait l'avoir
    // enregistrée.
    return `La diapositive n° ${rang + 1} du bandeau n’a pas d’image utilisable : une diapositive sans image n’existe pas.`;
  }
  return null;
}

@ValidatorConstraint({ name: 'bandeauAccueilValide', async: false })
export class BandeauAccueilValide implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return raisonDeRefusDuBandeau(value) === null;
  }

  defaultMessage(args: ValidationArguments): string {
    return raisonDeRefusDuBandeau(args.value) ?? 'Bandeau d’accueil invalide.';
  }
}
