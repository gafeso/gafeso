'use client';

// LE MENU DE COMPTE — les écrans de la PERSONNE, sortis de la barre de travail.
//
// ⚠ POURQUOI IL EXISTE. Le 15 septembre 2026, un administrateur voyait SEIZE
// repères cliquables sur `/guichet` : deux barres empilées, dont six écrans
// personnels (« Mon dépôt », « Mes prêts », « Mon compte »…) posés au milieu
// des outils du métier. Chacun de ces écrans était arrivé justifié seul ;
// aucun n'avait été pensé avec les autres. C'est le motif de ce dépôt appliqué
// à la navigation : chaque lot correct, l'ensemble faux.
//
// ⚠ LE CRITÈRE DE RANGEMENT, et il vient de Jean : si le titre commence par
// « Mon » ou « Mes », c'est la personne. Si c'est une FILE D'ATTENTE, c'est le
// métier. « Dépôts à valider » reste donc dans la barre — un directeur n'y
// consulte pas SON dépôt, il traite ceux des autres, exactement comme un
// bibliothécaire traite des retours.
//
// ⚠ ET LE BOUTON PORTE LE PRÉNOM, jamais une icône. Deux recettes de cette
// semaine ont produit un faux défaut parce que la session ouverte n'était pas
// celle qu'on croyait. Un prénom affiché supprime cette famille entière.

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { LIBELLES } from '@/lib/libelles';

export interface EntreeCompte {
  href: string;
  label: string;
  title?: string;
  /** Sépare visuellement les groupes du panneau (compte / dépôt / sortie). */
  separeAvant?: boolean;
}

function initiales(prenom: string, nom: string): string {
  return `${prenom.charAt(0)}${nom.charAt(0)}`.toUpperCase() || '?';
}

export function MenuCompte({
  prenom,
  nom,
  etablissement,
  entrees,
  onDeconnexion,
}: {
  prenom: string;
  nom: string;
  /** `null` = pas encore su : on n'écrit alors RIEN plutôt qu'un repli. */
  etablissement: string | null;
  entrees: EntreeCompte[];
  onDeconnexion: () => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const boite = useRef<HTMLDivElement>(null);
  const bouton = useRef<HTMLButtonElement>(null);
  const idPanneau = useId();

  // ⚠ DEUX FERMETURES, et la seconde est celle qu'on oublie : Échap REND LE
  // FOCUS au bouton. Sans ça, la personne au clavier se retrouve au début du
  // document, et le menu qu'elle vient de fermer n'est plus atteignable sans
  // retraverser toute la page.
  useEffect(() => {
    if (!ouvert) return;
    const auClavier = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOuvert(false);
        bouton.current?.focus();
      }
    };
    const dehors = (e: MouseEvent) => {
      if (boite.current && !boite.current.contains(e.target as Node)) setOuvert(false);
    };
    document.addEventListener('keydown', auClavier);
    document.addEventListener('mousedown', dehors);
    return () => {
      document.removeEventListener('keydown', auClavier);
      document.removeEventListener('mousedown', dehors);
    };
  }, [ouvert]);

  const T = LIBELLES.entete.compte;

  return (
    <div ref={boite} className="relative">
      <button
        ref={bouton}
        type="button"
        aria-haspopup="menu"
        aria-expanded={ouvert}
        aria-controls={idPanneau}
        aria-label={T.bouton(prenom)}
        onClick={() => setOuvert((v) => !v)}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-white px-3 text-sm font-semibold text-ink transition-colors hover:bg-line/40"
      >
        <span
          aria-hidden="true"
          className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-ink text-[11px] font-bold text-white"
        >
          {initiales(prenom, nom)}
        </span>
        {prenom}
        <span aria-hidden="true" className="text-xs text-muted">
          ▾
        </span>
      </button>

      {ouvert && (
        <div
          id={idPanneau}
          role="menu"
          aria-label={T.panneau}
          className="absolute right-0 top-[calc(100%+6px)] z-30 min-w-56 rounded-lg border border-line bg-white p-1.5 shadow-lg"
        >
          <div className="border-b border-line px-2.5 pb-2 pt-1.5">
            <p className="text-sm font-semibold text-ink">
              {prenom} {nom}
            </p>
            {/* ⚠ RIEN tant qu'on ne sait pas : pas de repli qui ressemblerait
                à un nom d'établissement. */}
            {etablissement && <p className="text-xs text-muted">{etablissement}</p>}
          </div>

          {entrees.map((e) => (
            <div key={e.href}>
              {e.separeAvant && <hr className="my-1.5 border-line" />}
              <Link
                role="menuitem"
                href={e.href}
                title={e.title}
                onClick={() => setOuvert(false)}
                className="block rounded-md px-2.5 py-2 text-sm text-heading transition-colors hover:bg-line/50"
              >
                {e.label}
              </Link>
            </div>
          ))}

          <hr className="my-1.5 border-line" />
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              setOuvert(false);
              onDeconnexion();
            }}
            className="block w-full rounded-md px-2.5 py-2 text-left text-sm text-heading transition-colors hover:bg-line/50"
          >
            {T.seDeconnecter}
          </button>
        </div>
      )}
    </div>
  );
}
