import Link from 'next/link';

import { fetchTenantHome } from '@/lib/server-api';
import { LIBELLES } from '@/lib/libelles';

/**
 * ⭐⭐ LE PIED DE PAGE COMMUN — et avant lui, il n'y avait AUCUN chemin vers les
 * pages légales depuis une page autre que l'accueil.
 *
 * ## 🔴 CE QU'IL RÉPARE, mesuré le 15 octobre 2026
 *
 * `/opac` rendait 200 avec son en-tête, et **zéro `<footer>`, zéro lien légal**.
 * Les mentions légales et la politique de confidentialité n'étaient donc
 * atteignables que depuis la page d'accueil — c'est-à-dire pas depuis le
 * catalogue, pas depuis une notice, pas depuis l'espace lecteur.
 *
 * ⚠ Et ce n'est pas une commodité de navigation : ces deux pages sont la seule
 * classe d'écrans de ce produit dont le PUBLIC EST LE DEHORS. Des mentions
 * légales qu'on ne peut atteindre d'aucune page ne sont pas des mentions
 * légales.
 *
 * ## ⚠ POURQUOI UN COMPOSANT SERVEUR
 *
 * Il doit savoir si chaque page légale est PUBLIÉE — l'API ne sert que celles
 * qui le sont (`pourLePublic`), et un lien vers une page non publiée mène à un
 * 404 que nous aurions fabriqué. `fetchTenantHome()` porte déjà l'information
 * et vit derrière un cache étiqueté par hôte : le pied ne coûte donc aucune
 * requête de plus.
 *
 * Un pied CLIENT aurait demandé un appel par page, et un état de chargement
 * pendant lequel les liens n'existent pas — « une non-réponse écrite comme un
 * fait », appliquée à une absence de lien.
 *
 * ## ⚠ CE QU'IL NE REPRODUIT PAS
 *
 * Le pied riche de la page d'accueil (contacts, horaires, services) reste chez
 * elle : il vit de `content`, qu'une page de catalogue n'a pas, et le recopier
 * ici ferait deux pieds à tenir d'accord. Celui-ci porte le strict nécessaire —
 * le nom de l'établissement, le retour au catalogue, et ce que la loi demande.
 */
export async function PiedCommun() {
  const home = await fetchTenantHome();
  const legales = home?.pagesLegales;

  return (
    <footer className="mt-12 border-t border-line bg-paper">
      {/*
        ⚠ `aria-label` ET NON un titre visible : ce repère n'a pas d'équivalent
        à l'écran, donc il ne double rien — c'est la borne de CLAUDE.md, et il
        passe par les libellés comme tout texte annoncé.
      */}
      <nav
        aria-label={LIBELLES.piedCommun.repere}
        className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-6 text-xs text-muted"
      >
        <span>{home?.name ?? LIBELLES.piedCommun.etablissement}</span>
        <Link href="/opac" className="hover:text-ink hover:underline">
          {LIBELLES.piedCommun.catalogue}
        </Link>
        {/*
          ⚠ UN LIEN N'APPARAÎT QUE SI LA PAGE EST PUBLIÉE. Le proposer avant
          mènerait à un 404 que nous aurions fabriqué — et un 404 sur une adresse
          que nous affichons nous-mêmes se lit comme une panne, pas comme un
          choix.
        */}
        {legales?.mentions.publieeLe && (
          <Link href="/mentions-legales" className="hover:text-ink hover:underline">
            {LIBELLES.pagesLegales.mentions}
          </Link>
        )}
        {legales?.confidentialite.publieeLe && (
          <Link href="/confidentialite" className="hover:text-ink hover:underline">
            {LIBELLES.pagesLegales.confidentialite}
          </Link>
        )}
      </nav>
    </footer>
  );
}
