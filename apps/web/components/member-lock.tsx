'use client';

// Cadenas « réservé aux membres » : bulle au survol OU au clic, avec liens
// vers la connexion et la création de compte.

import Link from 'next/link';
import { useState } from 'react';

export function LockIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

export function MemberLock({
  hint = 'Contenu réservé aux membres',
  className = '',
}: {
  hint?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <span
      className={`relative inline-flex ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-label={`${hint} — options de connexion`}
        // Le clic OUVRE toujours (jamais de bascule : le survol ayant déjà
        // ouvert la bulle, un clic-bascule la refermerait aussitôt).
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center rounded-full bg-ocre/15 p-1.5 text-ocre transition-colors hover:bg-ocre/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ocre"
      >
        <LockIcon />
      </button>

      {open && (
        <span
          role="tooltip"
          className="absolute left-1/2 top-full z-20 mt-2 w-64 -translate-x-1/2 rounded-lg bg-ink px-4 py-3 text-xs leading-relaxed text-white shadow-xl"
        >
          <span className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-ink" />
          {hint}.{' '}
          <Link href="/login" className="font-semibold text-ocre underline hover:text-white">
            Connectez-vous
          </Link>{' '}
          ou{' '}
          <Link
            href="/inscription"
            className="font-semibold text-ocre underline hover:text-white"
          >
            créez un compte
          </Link>
          .
        </span>
      )}
    </span>
  );
}
