'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { clearSession } from '@/lib/session';
import { ongletDe } from '@/lib/navigation';
import { LIBELLES } from '@/lib/libelles';
import { MenuCompte } from '@/components/menu-compte';
import { useCompteCourant } from '@/lib/entrees-de-compte';

// Barre publique : accueil et catalogue, pour tout le monde.
const NAV = [
  { href: '/', label: 'Accueil' },
  { href: '/opac', label: 'Catalogue' },
];

/**
 * @param fonctions déjà connues de l'appelant (la coque du personnel les a
 *   chargées) — évite un second appel à /auth/me/functions sur chaque écran
 *   du back-office. Omis sur les pages publiques : l'en-tête les charge alors
 *   lui-même, et seulement s'il y a une session.
 */
export function Header({ fonctions }: { fonctions?: string[] | null } = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const [menuOuvert, setMenuOuvert] = useState(false);

  // ⚠ UNE SEULE SOURCE POUR LES DEUX EN-TÊTES. Ce composant et celui de la
  // vitrine décrivaient séparément ce qu'un compte connecté offre — et ils ont
  // divergé dès la première modification : le menu de compte est arrivé ici le
  // 15 septembre, pendant que la vitrine gardait un lien portant le PRÉNOM et
  // menant à `/guichet`, pour tout le monde, étudiants compris.
  const { user, entrees: compte, lienPro: destinationPro, etablissement } =
    useCompteCourant(fonctions);

  // …et le lien est masqué quand on y est déjà : la barre d'onglets est juste
  // en dessous.
  const dansEspacePro = pathname.startsWith('/admin') || ongletDe(pathname) !== undefined;
  const lienPro = !dansEspacePro && destinationPro !== null;

  // Une seule liste, rendue à deux endroits : en ligne sur grand écran, dans le
  // panneau replié sur mobile. Dupliquer le balisage laisserait fatalement les
  // deux versions diverger.
  const principales = [
    ...NAV,
    // « Espace professionnel » et non « Administration » : depuis la refonte,
    // Administration est une PIÈCE de cet espace (le paramétrage), pas
    // l'espace lui-même.
    ...(lienPro ? [{ href: destinationPro, label: LIBELLES.entete.espaceProfessionnel }] : []),
  ];

  async function logout() {
    // Efface le cookie httpOnly côté serveur (le JS ne peut pas y toucher),
    // puis le profil d'affichage local.
    //
    // ⚠ ON LIT L'ISSUE. Le `catch` était vide — « best-effort, on nettoie l'UI
    // quoi qu'il arrive » — et l'interface disait « déconnecté » que l'appel
    // ait abouti ou non, pendant que le cookie de session du serveur survivait
    // 24 heures. Sur l'ordinateur partagé d'une salle de lecture, c'est la
    // personne suivante qui hérite de la session.
    //
    // On nettoie toujours l'affichage — elle a demandé à partir —, mais
    // l'écran de connexion DIT que la fermeture n'est pas confirmée, et donne
    // le geste. C'est la règle du dépôt : quand on ne peut pas rendre la
    // phrase vraie, on lui donne une SORTIE.
    let confirmee = true;
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      confirmee = false;
    }
    clearSession();
    router.push(confirmee ? '/login' : '/login?deconnexion=incomplete');
  }

  /** Les deux entrées publiques quand personne n'est connecté. */
  const sansSession = [
    { href: '/login', label: 'Se connecter' },
    { href: '/inscription', label: 'Créer un compte', accent: true },
  ];

  // `min-h-11` = 44 px : la cible tactile minimale recommandée. Les entrées
  // faisaient 32 px, ce qui se rate au doigt — mesuré à 375 px.
  function classesLien(item: { href: string; accent?: boolean }, pleineLargeur = false) {
    const courant =
      item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
    const forme = `inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium transition-colors ${
      pleineLargeur ? 'w-full' : ''
    }`;
    if (item.accent) return `${forme} bg-ocre font-semibold text-white hover:bg-ocre/90`;
    return `${forme} ${courant ? 'bg-ink text-white' : 'text-muted hover:bg-line/60 hover:text-ink'}`;
  }

  const lien = (item: (typeof principales)[number] & { title?: string; accent?: boolean }, pleine = false) => (
    <Link
      key={item.href}
      href={item.href}
      title={item.title}
      className={classesLien(item, pleine)}
      onClick={() => setMenuOuvert(false)}
    >
      {item.label}
    </Link>
  );

  // ⚠ NE S'IMPRIME PAS. Mesuré le 15 septembre 2026 en recettant le rapport
  // annuel : à l'impression, la page emportait DEUX barres de navigation, deux
  // en-têtes, dix liens et le bouton du menu. Ce n'est pas un document qu'une
  // directrice remet à son université — c'est une capture d'écran de logiciel.
  //
  // La règle est générale et pas propre au rapport : imprimer un écran, c'est
  // vouloir son CONTENU. Aucun écran n'a besoin de ses menus sur le papier.
  return (
    <header className="border-b-2 border-ink bg-white print:hidden">
      {/* Une SEULE ligne à toutes les largeurs. Le repli en `flex-wrap` tenait
          la barre dans l'écran mais l'étalait sur trois lignes à 375 px, soit
          110 px avant même le contenu. Sous `md`, tout passe dans un panneau. */}
      <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-2 sm:px-6">
        {/* Logo horizontal (assets/marque). Le fichier porte SA PROPRE marge :
            c'est la zone de respiration exigée par USAGE.md, on ne la recadre
            pas — la boîte est donc plus haute que le logo qu'elle contient.
            `h-11` la dimensionne pour que le nom dépasse les 80 px de large en
            deçà desquels USAGE.md le donne pour illisible. */}
        <Link href="/" className="shrink-0" onClick={() => setMenuOuvert(false)}>
          <img src="/marque/gafeso_horizontal.svg" alt="Gafeso" className="h-11 w-auto" />
        </Link>

        <nav
          aria-label={LIBELLES.accessibilite.navPrincipale}
          className="hidden gap-1 md:flex"
        >
          {principales.map((i) => lien(i))}
        </nav>

        <div className="ml-auto hidden items-center gap-2 md:flex">
          {/* ⚠ UN SEUL REPÈRE À LA PLACE DE SIX. Les écrans de la personne
              vivent derrière le prénom ; la barre ne porte plus que le métier.
              Sur les pages publiques sans session, les deux portes d'entrée
              restent en clair — les replier derrière un menu cacherait
              précisément ce qu'un visiteur cherche. */}
          {user ? (
            <MenuCompte
              prenom={user.firstName}
              nom={user.lastName}
              etablissement={etablissement}
              entrees={compte}
              onDeconnexion={logout}
            />
          ) : (
            sansSession.map((i) => lien(i))
          )}
        </div>

        <button
          type="button"
          className="ml-auto inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-xl text-ink hover:bg-line/60 md:hidden"
          aria-label={LIBELLES.entete.menu}
          aria-expanded={menuOuvert}
          aria-controls="menu-principal"
          onClick={() => setMenuOuvert((v) => !v)}
        >
          ☰
        </button>
      </div>

      {menuOuvert && (
        <nav
          id="menu-principal"
          aria-label={LIBELLES.accessibilite.navDepliee}
          className="flex flex-col gap-1 border-t border-line px-4 py-2 md:hidden"
        >
          {principales.map((i) => lien(i, true))}
          {/* ⚠ SOUS `md`, PAS DE MENU DANS UN MENU. Le panneau replié EST déjà
              le menu ; y nicher un second niveau ajouterait un geste pour rien
              sur l'écran où la place manque le plus. Les entrées de personne y
              restent donc à plat, sous un intertitre qui dit à qui elles
              appartiennent. */}
          {user && (
            <>
              <p className="mt-2 border-t border-line px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted">
                {user.firstName} {user.lastName}
              </p>
              {compte.map((i) => lien(i, true))}
            </>
          )}
          {!user && sansSession.map((i) => lien(i, true))}
          {user && (
            // Bouton nu plutôt que <Button> : la classe `justify-center` de
            // components/ui.tsx gagnait sur un `justify-start` passé en prop
            // (même spécificité, ordre de feuille), et l'entrée se retrouvait
            // centrée au milieu de voisines alignées à gauche. Ici elle porte
            // exactement les mêmes classes que les liens du panneau.
            <button
              type="button"
              onClick={logout}
              className="inline-flex min-h-11 w-full items-center rounded-md px-3 text-sm font-medium text-muted transition-colors hover:bg-line/60 hover:text-ink"
            >
              Se déconnecter
            </button>
          )}
        </nav>
      )}
    </header>
  );
}
