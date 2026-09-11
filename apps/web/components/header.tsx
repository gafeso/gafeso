'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { clearSession, getUser, SessionUser } from '@/lib/session';
import { useMyFunctions } from '@/lib/functions';
import { ongletDe, premiereEntreeAccessible } from '@/lib/navigation';
import { Button } from '@/components/ui';
import { LIBELLES } from '@/lib/libelles';

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
  const [user, setUser] = useState<SessionUser | null>(null);
  const [menuOuvert, setMenuOuvert] = useState(false);
  const propres = useMyFunctions();
  const effectives = fonctions !== undefined ? fonctions : propres.functions;

  // Porte d'entrée vers l'espace professionnel. Conditionnée à « cette
  // personne a-t-elle au moins une entrée ? » plutôt qu'à une liste de rôles :
  // c'est ce qui corrige l'ancienne incohérence, où un bibliothécaire avait
  // accès à la coque d'administration sans jamais en voir le lien.
  // …et masquée quand on y est déjà : la barre d'onglets est juste en dessous.
  const dansEspacePro = pathname.startsWith('/admin') || ongletDe(pathname) !== undefined;
  const lienPro =
    !dansEspacePro && effectives ? premiereEntreeAccessible(effectives) !== null : false;

  useEffect(() => {
    setUser(getUser());
    // Le panneau ne doit pas rester ouvert par-dessus la page d'arrivée.
    setMenuOuvert(false);
  }, [pathname]);

  async function logout() {
    // Efface le cookie httpOnly côté serveur (le JS ne peut pas y toucher),
    // puis le profil d'affichage local.
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      /* déconnexion best-effort : on nettoie l'UI quoi qu'il arrive */
    }
    clearSession();
    router.push('/login');
  }

  // Une seule liste, rendue à deux endroits : en ligne sur grand écran, dans le
  // panneau replié sur mobile. Dupliquer le balisage laisserait fatalement les
  // deux versions diverger.
  const principales = [
    ...NAV,
    // « Espace professionnel » et non « Administration » : depuis la refonte,
    // Administration est une PIÈCE de cet espace (le paramétrage), pas
    // l'espace lui-même.
    ...(lienPro ? [{ href: '/admin', label: LIBELLES.entete.espaceProfessionnel }] : []),
  ];
  const compte = user
    ? [
        { href: '/mes-prets', label: 'Mes prêts', title: 'Mes prêts et réservations' },
        { href: '/profil', label: 'Mon compte', title: 'Mon compte (informations, mot de passe, sécurité)' },
      ]
    : [
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

  return (
    <header className="border-b-2 border-ink bg-white">
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

        <nav className="hidden gap-1 md:flex">{principales.map((i) => lien(i))}</nav>

        <div className="ml-auto hidden items-center gap-2 md:flex">
          {compte.map((i) => lien(i))}
          {user && (
            <Button variant="ghost" className="min-h-11" onClick={logout}>
              Se déconnecter
            </Button>
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
          className="flex flex-col gap-1 border-t border-line px-4 py-2 md:hidden"
        >
          {principales.map((i) => lien(i, true))}
          {compte.map((i) => lien(i, true))}
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
