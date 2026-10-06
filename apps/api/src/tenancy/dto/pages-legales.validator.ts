import {
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { CLES_PAGES, MAX_BLOCS, MAX_LONGUEUR_BLOC } from '../pages-legales';

/**
 * REFUSE plutôt que de laisser le normaliseur TRONQUER.
 *
 * ⚠ LA RAISON EST ÉCRITE À CÔTÉ, DANS CE MÊME DOSSIER, et elle valait déjà pour
 * le bandeau d'accueil : « les normaliseurs tronquent en silence, ce qui est le
 * bon comportement en LECTURE mais un faux silencieux en ÉCRITURE ».
 *
 * `normaliserPagesLegales` coupe à 40 blocs et 40 000 caractères — exactement ce
 * qu'il faut faire d'une colonne `Json` qu'on relit, et exactement ce qu'il ne
 * faut PAS faire d'un formulaire : une bibliothécaire qui collerait des mentions
 * de 45 000 caractères verrait « enregistré », et son texte serait coupé au
 * milieu d'une phrase. Sur un document JURIDIQUE, une troncature silencieuse
 * n'est pas une gêne d'affichage.
 *
 * ⚠ Et la limite est NOMMÉE dans le refus : un refus qui ne dit pas le plafond
 * laisse quelqu'un retirer du texte au hasard.
 */
export function raisonDeRefusDesPagesLegales(valeur: unknown): string | null {
  if (!valeur || typeof valeur !== 'object' || Array.isArray(valeur)) return null; // @IsObject s'en charge
  const v = valeur as Record<string, unknown>;

  // ⚠ Les clés INCONNUES sont refusées, pas ignorées. La normalisation les
  // écarterait sans rien dire — et « confidentialité » mal orthographié
  // donnerait une page enregistrée nulle part.
  const inconnues = Object.keys(v).filter((k) => !(CLES_PAGES as readonly string[]).includes(k));
  if (inconnues.length > 0) {
    return `Page légale inconnue : ${inconnues.join(', ')}. Attendu : ${CLES_PAGES.join(' ou ')}.`;
  }

  for (const cle of CLES_PAGES) {
    const page = v[cle];
    if (page === undefined || page === null) continue; // page non fournie : cas normal
    if (typeof page !== 'object' || Array.isArray(page)) {
      return `La page « ${cle} » attend un objet { blocs, publieeLe }.`;
    }
    const p = page as Record<string, unknown>;

    if (p.publieeLe !== undefined && p.publieeLe !== null) {
      if (typeof p.publieeLe !== 'string' || Number.isNaN(new Date(p.publieeLe).getTime())) {
        return `La date de publication de « ${cle} » n’est pas une date valide (ISO 8601 attendu).`;
      }
    }

    const blocs = p.blocs;
    if (blocs === undefined || blocs === null) continue;
    if (typeof blocs !== 'object' || Array.isArray(blocs)) {
      return `Les blocs de « ${cle} » attendent un objet { identifiant: texte }.`;
    }
    const entrees = Object.entries(blocs as Record<string, unknown>);
    if (entrees.length > MAX_BLOCS) {
      return `La page « ${cle} » accepte au maximum ${MAX_BLOCS} blocs (${entrees.length} reçus).`;
    }
    for (const [id, texte] of entrees) {
      if (typeof texte !== 'string') {
        return `Le bloc « ${id} » de « ${cle} » doit être du texte.`;
      }
      if (texte.length > MAX_LONGUEUR_BLOC) {
        return (
          `Le bloc « ${id} » de « ${cle} » dépasse ${MAX_LONGUEUR_BLOC} caractères ` +
          `(${texte.length} reçus). Il serait COUPÉ en silence — découpez-le en plusieurs blocs.`
        );
      }
      if (id.trim().length === 0) {
        return `Un bloc de « ${cle} » n’a pas d’identifiant : il serait écarté sans rien dire.`;
      }
    }
  }
  return null;
}

@ValidatorConstraint({ name: 'PagesLegalesValides', async: false })
export class PagesLegalesValides implements ValidatorConstraintInterface {
  validate(valeur: unknown): boolean {
    return raisonDeRefusDesPagesLegales(valeur) === null;
  }

  defaultMessage(args: ValidationArguments): string {
    return raisonDeRefusDesPagesLegales(args.value) ?? 'pagesLegales invalide.';
  }
}
