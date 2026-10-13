import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * ⭐⭐ UN ÉTAT VIDE N'EST PAS UNE FAUTE — et il donne TOUJOURS une sortie.
 *
 * ## 🔴 CE QU'IL RÉPARE, constaté par Jean sur la démonstration rc12
 *
 * `/mes-consultations` et `/mes-documents-hors-ligne`, vus avec un compte
 * étudiant sans historique, affichaient leur état vide dans un encadré
 * **rose/rouge** : il se lisait comme une ERREUR. L'étudiant n'avait rien fait
 * de mal — il n'avait simplement rien encore lu.
 *
 * ⚠ **Et mon premier relevé a cherché la mauvaise forme.** Je cherchais
 * `tone="error"` : zéro trouvaille utile. Le ton employé était
 * `tone="warning"`, dont la table rend `bg-ocre/10` — l'ocre de marque à 10 %,
 * c'est-à-dire un rose pâle. « Un motif syntaxique ne voit que la forme qu'on a
 * imaginée », et j'avais imaginé la mauvaise.
 *
 * ⚠ **Pire : `ocre` est la couleur SECONDAIRE DU TENANT**, alimentée par
 * `TenantSettings`. Un état vide peint avec elle change de couleur d'une école à
 * l'autre — et peut tomber sur un rouge franc. Raison de plus pour qu'il
 * n'emploie aucune couleur de marque.
 *
 * ## ⭐ LES DEUX MOITIÉS, et la seconde est celle qu'on oublie
 *
 * | | |
 * |---|---|
 * | **dire** ce qui se passe | « rien ici », pas « erreur » |
 * | ⭐ **une SORTIE** | un geste possible, toujours — sinon l'écran est une impasse |
 *
 * ⚠ `actions` n'est pas optionnel, et c'est voulu : « une non-réponse qui
 * n'informe pas » et « un vide sans sortie » sont le même défaut vu de deux
 * côtés. `etats-vides-neutres.spec.tsx` refuse un état vide sans action.
 *
 * ## ⚠ CE QU'IL N'EST PAS
 *
 * Il ne remplace PAS `Alert` : les vraies erreurs gardent le rouge et leur
 * `role="alert"`. **Le rouge reste réservé aux fautes** — c'est sa valeur, et
 * elle s'use si on le dépense sur un état normal. « Le bruit use ce qui doit
 * être lu le jour où il compte. »
 */
export function EtatVide({
  phrase,
  detail,
  actions,
  children,
  className = '',
}: {
  /** Ce qui se passe, dit simplement. Jamais « erreur », jamais « échec ». */
  phrase: string;
  /** La règle ou le motif, quand l'absence a une raison qu'on peut dire. */
  detail?: string;
  /** ⚠ Au moins une sortie. Un vide sans geste possible est une impasse. */
  actions: ReadonlyArray<{ readonly libelle: string; readonly href: string }>;
  /** Pour ce qui ne tient pas dans un lien — un QR, par exemple. */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      /*
       * ⚠ AUCUN `role="alert"`. C'est la moitié invisible du défaut : `Alert`
       * en pose un pour le ton `error`, et un lecteur d'écran annonçait donc
       * « alerte » sur une étagère vide.
       */
      className={`rounded-md border border-line bg-paper px-4 py-3 ${className}`}
    >
      <p className="text-sm text-ink">{phrase}</p>
      {detail ? <p className="mt-1 text-xs text-muted">{detail}</p> : null}
      {children}
      <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
        {actions.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="inline-flex min-h-11 items-center text-sm font-semibold text-ocre hover:underline"
          >
            {a.libelle}
          </Link>
        ))}
      </p>
    </div>
  );
}
