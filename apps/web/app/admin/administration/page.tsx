'use client';

/**
 * ADMINISTRATION — un index à RUBRIQUES, et pas une barre latérale de plus.
 *
 * ⚠ CE QU'ELLE REMPLACE. Le titre de la barre latérale reprenait le libellé de
 * l'onglet actif : sur cet onglet, « Administration » s'affichait deux fois,
 * l'une sous l'autre. Si un sous-menu répète le nom de son parent, il y a un
 * niveau de trop — et le paramétrage est justement le cas où une barre
 * latérale sert le moins : sept entrées muettes qu'on parcourt en devinant.
 *
 * ⚠ LA FORME VIENT DE KOHA, vérifiée dans son gabarit source `admin-home.tt`
 * plutôt que dans sa documentation : deux colonnes, aucune barre latérale, un
 * titre par rubrique, et des liens DÉCRITS. Un paramétrage se cherche par ce
 * qu'on veut obtenir, pas par le nom que le logiciel a donné à son écran.
 *
 * ⚠ CE QU'ON NE SUIT PAS : chez Koha, Administration n'est pas un onglet de
 * premier niveau — on y arrive par « More ». Sortir le paramétrage de la barre
 * de travail irait au-delà de ce qui a été décidé.
 *
 * ⚠ ET ELLE NE DÉCIDE RIEN DE SON CÔTÉ : les rubriques sont les GROUPES de
 * l'onglet, les entrées sont filtrées par `ongletsVisibles` — les mêmes droits
 * et les mêmes modules que la barre. Une page d'index qui referait le filtre à
 * sa façon finirait par proposer un écran que l'API refuse.
 */

import Link from 'next/link';
import { useMyFunctions } from '@/lib/functions';
import { useModulesActifs } from '@/lib/modules-actifs';
import { ongletsVisibles, type EntreeNav } from '@/lib/navigation';
import { LIBELLES } from '@/lib/libelles';

const T = LIBELLES.administration;

/** Les entrées visibles d'`administration`, regroupées dans l'ordre déclaré. */
function rubriques(fonctions: string[], modules: string[] | null) {
  const onglet = ongletsVisibles(fonctions, modules).find((o) => o.id === 'administration');
  const groupes: { titre: string; entrees: EntreeNav[] }[] = [];
  for (const entree of onglet?.entrees ?? []) {
    const titre = entree.groupe ?? '';
    const dernier = groupes[groupes.length - 1];
    if (dernier && dernier.titre === titre) dernier.entrees.push(entree);
    else groupes.push({ titre, entrees: [entree] });
  }
  return groupes;
}

export default function AdministrationPage() {
  const { functions } = useMyFunctions();
  const { modulesActifs } = useModulesActifs();

  // ⚠ `functions` à `null` = PAS ENCORE SU. On n'affiche alors ni rubriques ni
  // « aucun réglage » : un vide qui invite à demander des droits, montré avant
  // la réponse, envoie quelqu'un réclamer ce qu'il possède déjà.
  const groupes = functions ? rubriques(functions, modulesActifs) : null;

  return (
    <div>
      <h1 className="font-serif text-2xl font-bold">{T.titre}</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted">{T.intro}</p>

      {groupes && groupes.length === 0 && (
        <p className="mt-6 max-w-xl text-sm text-muted">{T.aucuneRubrique}</p>
      )}

      {groupes && groupes.length > 0 && (
        <div className="mt-7 grid gap-x-10 gap-y-7 sm:grid-cols-2">
          {groupes.map((groupe) => (
            <section key={groupe.titre || 'sans-groupe'}>
              {groupe.titre && (
                <h2 className="font-serif text-lg font-bold text-ink">{groupe.titre}</h2>
              )}
              <dl className="mt-2">
                {groupe.entrees.map((entree) => (
                  <div key={entree.href} className="mt-3 first:mt-1">
                    <dt>
                      <Link
                        href={entree.href}
                        className="text-sm font-semibold text-ink underline-offset-2 hover:underline"
                      >
                        {entree.libelle}
                      </Link>
                    </dt>
                    {/* ⚠ La description est ce qui distingue cette page d'une
                        liste de liens. Sans elle, on a déplacé la barre
                        latérale, pas remplacé un niveau. */}
                    {entree.description && (
                      <dd className="mt-0.5 text-xs text-muted">{entree.description}</dd>
                    )}
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
