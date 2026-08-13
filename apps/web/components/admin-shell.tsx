'use client';

// Coque de l'espace back-office (personnel). Garde : tout rôle non-étudiant.
// La barre latérale n'affiche que les sections permises au rôle ; chaque
// page revérifie, et l'API reste seule autorité.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getUser } from '@/lib/session';
import { useMyFunctions } from '@/lib/functions';
import { Header } from '@/components/header';

// Fonction requise pour VOIR l'entrée de nav (l'API reste seule autorité sur
// l'action elle-même — chaque page revérifie via ses propres appels API).
const ADMIN_NAV = [
  { href: '/admin/comptes', label: 'Comptes', fonction: 'comptes.voir' },
  { href: '/admin/import-etudiants', label: 'Import étudiants', fonction: 'etudiants.importer' },
  { href: '/admin/classes', label: 'Classes', fonction: 'classes.gerer' },
  { href: '/admin/catalogue', label: 'Catalogue', fonction: 'catalogue.gerer' },
  { href: '/admin/recolement', label: 'Récolement', fonction: 'catalogue.gerer' },
  { href: '/admin/auteurs', label: 'Auteurs', fonction: 'catalogue.gerer' },
  { href: '/admin/categories', label: 'Catégories', fonction: 'catalogue.gerer' },
  { href: '/admin/collections', label: 'Collections', fonction: 'collections.gerer' },
  { href: '/admin/roles', label: 'Rôles', fonction: 'roles.gerer' },
  { href: '/admin/statistiques', label: 'Statistiques', fonction: 'etablissement.gerer' },
  { href: '/admin/interoperabilite', label: 'Interopérabilité', fonction: 'etablissement.gerer' },
  { href: '/admin/parametres', label: 'Établissement', fonction: 'etablissement.gerer' },
  { href: '/admin/accueil', label: 'Page d’accueil', fonction: 'etablissement.gerer' },
  { href: '/admin/rappels', label: 'Rappels envoyés', fonction: 'etablissement.gerer' },
  { href: '/admin/journal', label: 'Journal d’audit', fonction: 'etablissement.gerer' },
];

const STAFF_ROLES = ['MANAGER', 'LIBRARIAN', 'ACQUISITIONS', 'ADMIN'];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [role, setRole] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const { functions } = useMyFunctions();

  useEffect(() => {
    setRole(getUser()?.role ?? null);
    setReady(true);
  }, []);

  if (!ready) {
    return <Header />;
  }

  if (!role || !STAFF_ROLES.includes(role)) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-3xl px-6 py-8">
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
            Cet espace est réservé au personnel de la bibliothèque.
          </p>
        </main>
      </>
    );
  }

  // Le temps que /auth/me/functions réponde, la nav reste vide plutôt que de
  // montrer (même brièvement) des sections auxquelles l'utilisateur n'a pas
  // droit — l'API bloquerait l'action de toute façon, mais autant ne pas
  // l'exposer.
  const nav = functions
    ? ADMIN_NAV.filter((item) => functions.includes(item.fonction))
    : [];

  return (
    <>
      <Header />
      <div className="mx-auto flex max-w-5xl gap-8 px-6 py-8">
        <aside className="w-44 shrink-0">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted">
            Administration
          </p>
          <nav className="flex flex-col gap-1">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  pathname.startsWith(item.href)
                    ? 'bg-ink text-white'
                    : 'text-muted hover:bg-line/60 hover:text-ink'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </>
  );
}
