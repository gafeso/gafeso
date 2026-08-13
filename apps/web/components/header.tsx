'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { clearSession, getUser, SessionUser } from '@/lib/session';
import { Button } from '@/components/ui';

const NAV = [
  { href: '/', label: 'Accueil' },
  { href: '/opac', label: 'Catalogue' },
];

// Entrées réservées au personnel (le rôle est revérifié côté page et API)
const STAFF_NAV = [
  { href: '/guichet', label: 'Guichet', roles: ['LIBRARIAN', 'ADMIN'] },
  { href: '/admin', label: 'Administration', roles: ['MANAGER', 'ADMIN'] },
];

export function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    setUser(getUser());
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

  return (
    <header className="border-b-2 border-ink bg-white">
      <div className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-2">
        {/* Logo horizontal (assets/marque). Le fichier porte SA PROPRE marge :
            c'est la zone de respiration exigée par USAGE.md, on ne la recadre
            pas — la boîte est donc plus haute que le logo qu'elle contient.
            `h-11` la dimensionne pour que le nom dépasse les 80 px de large en
            deçà desquels USAGE.md le donne pour illisible ; `py-2` compense la
            hauteur ainsi gagnée pour que l'en-tête ne grandisse pas. */}
        <Link href="/" className="shrink-0">
          <img src="/marque/gafeso_horizontal.svg" alt="Gafeso" className="h-11 w-auto" />
        </Link>
        <nav className="flex gap-1">
          {[
            ...NAV,
            ...STAFF_NAV.filter((item) => user && item.roles.includes(user.role)),
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                (item.href === '/' ? pathname === '/' : pathname.startsWith(item.href))
                  ? 'bg-ink text-white'
                  : 'text-muted hover:bg-line/60 hover:text-ink'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          {user ? (
            <>
              <Link
                href="/mes-prets"
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  pathname.startsWith('/mes-prets')
                    ? 'bg-ink text-white'
                    : 'text-muted hover:bg-line/60 hover:text-ink'
                }`}
                title="Mes prêts et réservations"
              >
                Mes prêts
              </Link>
              <Link
                href="/profil"
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  pathname.startsWith('/profil')
                    ? 'bg-ink text-white'
                    : 'text-muted hover:bg-line/60 hover:text-ink'
                }`}
                title="Mon compte (informations, mot de passe, sécurité)"
              >
                Mon compte
              </Link>
              <Button variant="ghost" onClick={logout}>
                Se déconnecter
              </Button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-md px-3 py-1.5 text-sm font-semibold text-ink hover:bg-line/60"
              >
                Se connecter
              </Link>
              <Link
                href="/inscription"
                className="rounded-md bg-ocre px-3 py-1.5 text-sm font-semibold text-white hover:bg-ocre/90"
              >
                Créer un compte
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
