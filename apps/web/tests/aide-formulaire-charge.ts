import type { Mock } from 'vitest';

/**
 * ⭐ LE CORPS DE L'ÉPREUVE PAR L'EFFET, écrit une seule fois.
 *
 * Dix écrans posent la même question — « réponse retardée → rien de
 * soumissible ? » — et dix copies de la mesure divergeraient. On factorise donc
 * le CORPS ; chaque fichier garde sa doublure (`vi.mock` est propre au fichier),
 * ses charges d'essai et ses attendus.
 *
 * ⚠ LA RÉSOLUTION SE FAIT PAR CHEMIN, et ce n'est pas un raffinement : plusieurs
 * de ces écrans lancent deux appels dans un `Promise.all`. Résoudre tout d'un
 * coup ne mesurerait que le cas nominal — celui qui ne casse jamais. Le cas qui
 * trouve quelque chose est « la première réponse est là, la seconde non ».
 */
export function enAttentePar(api: Mock) {
  const resolveurs: Record<string, (v: unknown) => void> = {};
  const refuseurs: Record<string, (e: unknown) => void> = {};
  api.mockImplementation(
    (chemin: string) =>
      new Promise((ok, ko) => {
        resolveurs[chemin] = ok as (v: unknown) => void;
        refuseurs[chemin] = ko;
      }),
  );
  return {
    /**
     * Résout l'appel dont le chemin CONTIENT ce fragment — mais l'EXACT
     * l'emporte s'il existe.
     *
     * ⚠ Sans cette préférence, `/inventory/sessions/s1` résolvait aussi
     * `/inventory/sessions/s1/report` : le rapport recevait une session, l'écran
     * levait, et le corps restait vide. Le test accusait alors l'écran d'une
     * faute qui était dans l'aide — « un fragment est un préfixe de son propre
     * sous-chemin », et c'est le genre de piège qu'un `includes` tend toujours.
     */
    resoudre(fragment: string, valeur: unknown) {
      const exact = resolveurs[fragment];
      if (exact) {
        exact(valeur);
        return;
      }
      for (const [c, ok] of Object.entries(resolveurs)) if (c.includes(fragment)) ok(valeur);
    },
    refuser(fragment: string, erreur: unknown) {
      for (const [c, ko] of Object.entries(refuseurs)) if (c.includes(fragment)) ko(erreur);
    },
    chemins: () => Object.keys(resolveurs),
  };
}

/**
 * ⚠ CE QUI ÉCRIT, pas ce qui s'affiche.
 *
 * Un bouton qui OUVRE un panneau est légitime pendant un chargement ; compter
 * tous les boutons actifs accuserait du code correct, et un garde qui accuse se
 * fait désactiver. La propriété est « rien ne peut être ENREGISTRÉ ».
 */
export const soumissibles = () =>
  [...document.querySelectorAll('button')].filter((b) => b.type === 'submit' && !b.disabled)
    .length;

/**
 * ⚠ LES CHAMPS QUI PORTENT UNE VALEUR, pas les champs tout court.
 *
 * « Aucun champ » est plus strict que la propriété : une boîte de RECHERCHE est
 * légitime pendant un chargement — elle filtre, elle n'enregistre rien. Exiger
 * son absence accuserait `/admin/auteurs`, qui est exemplaire.
 *
 * Ce qui est fautif est un champ REMPLI avant les données : c'est la forme de
 * `/admin/etablissement`, dont les couleurs partaient de `#0F2B46` et qui avait
 * donc l'air rempli ET JUSTE. Un champ vide se remarque ; un champ rempli d'un
 * défaut ne se remarque que le jour où quelqu'un compare.
 *
 * ⚠ Les cases et les boutons radio sont écartés : leur `value` vaut `'on'` par
 * défaut en HTML, qu'ils soient cochés ou non — les compter rendrait ce relevé
 * faux sur tout écran qui en porte un.
 */
export const champsRemplis = () =>
  [...document.querySelectorAll('input, textarea')].filter((c) => {
    const e = c as HTMLInputElement;
    if (e.type === 'checkbox' || e.type === 'radio') return false;
    return e.value.trim() !== '';
  }).length;

/** Laisse les effets se dérouler sans attendre un élément qui n'existera peut-être pas. */
export const souffler = (ms = 30) => new Promise((r) => setTimeout(r, ms));
