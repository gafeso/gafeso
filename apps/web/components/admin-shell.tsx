'use client';

// Coque de l'espace professionnel : barre d'onglets par métier + barre
// latérale contextuelle. Découpage repris de
// docs/maquettes/maquette-navigation-v2.html — les métiers en haut, « Outils »
// pour les opérations ponctuelles, « Administration » pour le seul paramétrage.
//
// La STRUCTURE vit dans lib/navigation.ts, pas ici : elle doit pouvoir être
// examinée par un test sans rendre de DOM. Ce fichier n'est que son affichage.
//
// Une seule vérité pour le filtrage : la FONCTION. L'ancienne coque mélangeait
// deux mécanismes — une liste de rôles pour l'accès, des fonctions pour les
// entrées — au point qu'un bibliothécaire avait l'accès sans jamais voir le
// lien. L'accès est désormais exactement « cette personne a-t-elle au moins
// une entrée ? ». L'API reste seule autorité sur les actions.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMyFunctions } from '@/lib/functions';
import { useModulesActifs } from '@/lib/modules-actifs';
import { moduleDeLaRoute, ongletDe, ongletsVisibles } from '@/lib/navigation';
import { EcranModuleEteint } from '@/components/ecran-module-eteint';
import { Header } from '@/components/header';
import { LIBELLES } from '@/lib/libelles';
import { ID_CONTENU, LienDEvitement } from '@/components/lien-evitement';

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { functions } = useMyFunctions();
  const { modulesActifs } = useModulesActifs();

  // ⚠ AUCUNE ENTRÉE tant que /auth/me/functions n'a pas répondu : en montrer,
  // même brièvement, qui ne seraient pas permises, serait pire que d'attendre.
  //
  // ⚠ MAIS LE CONTENU, LUI, S'AFFICHE. Rendre seulement l'en-tête laissait une
  // page réduite à « ☰ » — pas de titre, pas d'écran, rien — pendant tout le
  // temps de la réponse. Mesuré le 11 septembre 2026 avec 1,5 s de latence :
  // chaque navigation du personnel montrait une page vide, alors que chaque
  // écran sait déjà dire qu'il charge. Un menu qu'on ne connaît pas encore
  // n'est pas une raison de cacher l'écran qu'on a demandé.
  if (!functions) {
    return (
      <>
        <LienDEvitement />
        <Header fonctions={null} />
        <main id={ID_CONTENU} className="mx-auto max-w-5xl px-6 py-8">
          {children}
        </main>
      </>
    );
  }

  // ⚠ P4-3. Le menu se filtre sur l'ÉTAT RÉEL des modules, jamais sur une
  // supposition. `null` laisse passer : masquer sur une information qu'on n'a
  // pas encore ferait clignoter le menu, et disparaître des écrans auxquels la
  // personne a droit. Ce filtrage est une politesse — la garantie est que
  // l'API refuse les routes d'un module inactif, en le nommant.
  const onglets = ongletsVisibles(functions, modulesActifs);

  // ⚠ L'ADRESSE TAPÉE DIRECTEMENT EST REFUSÉE, pas seulement l'entrée retirée.
  // La règle normative de P4 exige « ni entrée de menu, ni bouton, ni écran
  // atteignable par son adresse » — et mesuré en recette, l'écran d'un module
  // éteint s'affichait encore normalement, en annonçant un entrepôt qui répond
  // 403. Cacher l'entrée sans refuser l'adresse laisse une interface qui ment.
  //
  // `modulesActifs === null` laisse passer, comme pour le menu : on ne refuse
  // pas sur une information qu'on n'a pas encore. La garantie reste l'API.
  const moduleRequis = moduleDeLaRoute(pathname);
  if (moduleRequis && modulesActifs && !modulesActifs.includes(moduleRequis)) {
    return <EcranModuleEteint fonctions={functions} />;
  }


  if (onglets.length === 0) {
    return (
      <>
        <LienDEvitement />
        <Header fonctions={functions} />
        <main id={ID_CONTENU} className="mx-auto max-w-3xl px-6 py-8">
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
            Cet espace est réservé au personnel de la bibliothèque.
          </p>
        </main>
      </>
    );
  }

  const courant = ongletDe(pathname) ?? onglets[0];
  const actif = onglets.find((o) => o.id === courant.id) ?? onglets[0];

  // Sous-groupes (« § » de la maquette) dans l'ordre d'apparition.
  const groupes: { titre?: string; entrees: typeof actif.entrees }[] = [];
  for (const entree of actif.entrees) {
    const dernier = groupes[groupes.length - 1];
    if (dernier && dernier.titre === entree.groupe) dernier.entrees.push(entree);
    else groupes.push({ titre: entree.groupe, entrees: [entree] });
  }

  return (
    <>
      <LienDEvitement />
      <Header fonctions={functions} />

      {/* Barre d'onglets. `flex-wrap` plutôt qu'un défilement horizontal : sur
          un écran étroit les onglets passent à la ligne et restent tous
          atteignables, sans geste de balayage à deviner. */}
      <div className="border-b border-line bg-paper/60">
        <nav
          aria-label="Sections"
          className="mx-auto flex max-w-5xl flex-wrap gap-1 px-4 py-2 sm:px-6"
        >
          {onglets.map((onglet) => {
            const estActif = onglet.id === actif.id;
            return (
              <Link
                key={onglet.id}
                href={onglet.entrees[0].href}
                aria-current={estActif ? 'page' : undefined}
                // min-h-11 = 44 px, la cible tactile minimale recommandée.
                // Les onglets faisaient 32 px : mesuré à 375 px, ça se rate.
                className={`inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium transition-colors ${
                  estActif
                    ? 'bg-ink text-white'
                    : 'text-muted hover:bg-line/60 hover:text-ink'
                }`}
              >
                {onglet.libelle}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 md:flex-row md:gap-8 md:py-8">
        {/* Un onglet à une seule entrée n'a pas besoin d'une barre latérale
            qui répète son propre nom. */}
        {actif.entrees.length > 1 && (
          <aside className="w-full shrink-0 md:w-52">
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">
              {actif.libelle}
            </p>
            {/* ⚠ Trois `nav` dans cette coque, et deux s'annonçaient
                « navigation » à l'identique. Un nom par barre, sinon le repère
                ne repère rien. */}
            <nav
              aria-label={LIBELLES.accessibilite.navDeLaSection(actif.libelle)}
              className="flex flex-col gap-1"
            >
              {groupes.map((groupe, i) => (
                <div key={groupe.titre ?? `g${i}`} className="flex flex-col gap-1">
                  {groupe.titre && (
                    <p className="mt-2 px-3 text-xs font-semibold uppercase tracking-wide text-muted/80">
                      {groupe.titre}
                    </p>
                  )}
                  {groupe.entrees.map((entree) => {
                    const courante =
                      pathname === entree.href || pathname.startsWith(`${entree.href}/`);
                    return (
                      <Link
                        key={entree.href}
                        href={entree.href}
                        aria-current={courante ? 'page' : undefined}
                        className={`inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium transition-colors ${
                          courante
                            ? 'bg-ink text-white'
                            : 'text-muted hover:bg-line/60 hover:text-ink'
                        }`}
                      >
                        {entree.libelle}
                      </Link>
                    );
                  })}
                </div>
              ))}
            </nav>
          </aside>
        )}
        {/*
          ⚠ `<main>` MANQUAIT ICI, ET SEULEMENT ICI. Les trois branches dégradées
          de ce fichier en portent un depuis toujours ; la branche NOMINALE —
          celle que tout le monde voit — rendait un `<div>`. Les chemins d'erreur
          étaient donc mieux accessibles que le chemin normal, et rien ne le
          disait parce qu'aucun relevé n'avait jamais été fait.
        */}
        <main id={ID_CONTENU} className="min-w-0 flex-1">
          {children}
        </main>
      </div>
    </>
  );
}
