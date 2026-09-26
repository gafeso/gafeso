/**
 * LA CARTE DES ÉCRANS — engendrée, jamais écrite à la main.
 *
 * ⚠ POURQUOI ENGENDRÉE. Une déclaration en prose sur un artefact qu'on ne
 * compile pas SERA fausse : ce dépôt l'a payé sur le registre des modules, qui
 * nommait des écrans inexistants dans la boîte de confirmation que voit un
 * administrateur. Cette carte parle de 47 écrans ; tenue à la main, elle
 * mentirait avant la fin du mois.
 *
 * Elle est donc DÉDUITE de trois sources qui, elles, sont exécutées :
 *  · le système de fichiers — `app/**\/page.tsx`, c'est-à-dire ce qui existe ;
 *  · `lib/navigation.ts` — qui voit quoi, sous quelle fonction, quel module ;
 *  · `ROUTES_HORS_MENU` — les écrans atteints autrement que par la barre.
 *
 * ⚠ ET CE TEST NE SE CONTENTE PAS D'ENGENDRER : il REFUSE quand le document
 * ne correspond plus. Un écran ajouté demain fait échouer la suite avec la
 * commande à lancer. C'est la forme de `colonnes-ecrivables` — une obligation,
 * jamais un balayage.
 *
 *   MAJ_CARTE=1 npx vitest run tests/carte-des-ecrans.spec.ts
 */

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { NAVIGATION_PERSONNEL, ROUTES_HORS_MENU } from '@/lib/navigation';

const RACINE = resolve(__dirname, '..');
const DOC = resolve(RACINE, '..', '..', 'docs', 'carte-des-ecrans.md');

/**
 * Les écrans que la barre ne porte pas, avec ce qu'ils SONT.
 *
 * ⚠ Une obligation, pas une commodité : un écran neuf hors menu n'est dans
 * aucune liste, et le test échoue en disant les deux issues — l'inscrire à la
 * navigation, ou le déclarer ici avec sa nature.
 */
const HORS_BARRE: Record<string, { pour: string; quoi: string }> = {
  '/': { pour: 'tout le monde', quoi: 'la vitrine de l’établissement' },
  '/opac': { pour: 'tout le monde', quoi: 'le catalogue public, facettes et recherche' },
  '/opac/[id]': { pour: 'tout le monde', quoi: 'la fiche d’une notice ; la lecture et la réservation exigent un compte' },
  '/opac/[id]/lire': { pour: 'membre AYANT DROIT', quoi: 'le lecteur en ligne (PDF ou EPUB), sans téléchargement' },
  '/opac/auteurs': { pour: 'tout le monde', quoi: 'l’index des auteurs' },
  '/opac/auteurs/[id]': { pour: 'tout le monde', quoi: 'la fiche d’un auteur et ses documents' },
  '/e/[slug]': { pour: 'tout le monde', quoi: 'la page d’inscription par QR d’un établissement' },
  '/login': { pour: 'tout le monde', quoi: 'connexion, avec double authentification si l’école l’exige' },
  '/inscription': { pour: 'tout le monde', quoi: 'création d’un compte lecteur' },
  '/definir-mot-de-passe': { pour: 'porteur du lien reçu', quoi: 'choix du mot de passe, lien à usage unique' },
  '/profil': { pour: 'tout compte', quoi: 'mon compte : informations, mot de passe, double authentification' },
  '/mes-prets': { pour: 'tout compte', quoi: 'mes prêts, mes réservations, mon historique' },
  '/mon-depot': { pour: 'depot.deposer', quoi: 'déposer son mémoire ou sa thèse et suivre son avancement' },
  '/mes-encadrements': { pour: 'encadrements.voir', quoi: 'les mémoires et thèses qu’on a dirigés, déjà catalogués' },
  '/admin': { pour: 'personnel', quoi: 'porte d’entrée : redirige vers la première section accessible' },
  '/admin/adherents/[id]': { pour: 'adherents.gerer', quoi: 'fiche d’un adhérent : prêts, amendes, réservations' },
  '/admin/catalogue/[id]': { pour: 'catalogue.gerer', quoi: 'fiche d’une notice : exemplaires, copie numérique, métadonnées' },
  '/admin/collections/[id]': { pour: 'collections.gerer', quoi: 'une collection : son contenu et ses règles d’accès' },
  '/admin/moissonnage/[id]': { pour: 'outils.catalogue', quoi: 'un entrepôt moissonné et ses comptes rendus de récolte' },
  '/admin/recolement/[id]': { pour: 'outils.catalogue', quoi: 'une session de récolement en cours' },
  // ⚠ CETTE LIGNE A ÉTÉ FAUSSE, et je l'ai signalée au backend comme un défaut
  // avant de lire le fichier. Elle disait « écran SANS PORTE, à vérifier ».
  // `/admin/parametres` ne se contente pas de n'avoir aucune entrée : il
  // REDIRIGE, et son propre fichier dit pourquoi — l'adresse a circulé
  // (signets, notes, peut-être un courriel à une école), et un 404 dirait au
  // lecteur qu'il s'est trompé alors que c'est nous qui avons déplacé.
  // « Pas d'entrée de menu » ne veut pas dire « pas de raison d'être ».
  '/admin/parametres': {
    pour: 'quiconque avait l’ancienne adresse',
    quoi: 'redirige vers « Identité » — l’écran a été scindé en Identité et Règles de prêt, et l’ancienne adresse reste vivante exprès',
  },
};

function ecransSurLeDisque(): string[] {
  const vus: string[] = [];
  const parcourir = (dossier: string) => {
    for (const nom of readdirSync(dossier)) {
      const chemin = join(dossier, nom);
      if (statSync(chemin).isDirectory()) parcourir(chemin);
      else if (nom === 'page.tsx') {
        const route = '/' + relative(join(RACINE, 'app'), dossier).replace(/\\/g, '/');
        vus.push(route === '/.' ? '/' : route);
      }
    }
  };
  parcourir(join(RACINE, 'app'));
  return vus.sort();
}

function carte(): string {
  const l: string[] = [];
  l.push('# La carte des écrans');
  l.push('');
  l.push('> ⚠ **Document ENGENDRÉ — ne le corrigez pas à la main.**');
  l.push('> Depuis `apps/web` : `MAJ_CARTE=1 npx vitest run tests/carte-des-ecrans.spec.ts`');
  l.push('>');
  l.push('> ⚠ *Sans `-w` : dans vitest, `-w` veut dire `--watch` — la commande');
  l.push('> ne rendrait jamais la main au lieu de régénérer et de sortir.*');
  l.push('>');
  l.push('> Il est déduit du système de fichiers et de `lib/navigation.ts`. Un écran');
  l.push('> ajouté sans être classé fait échouer la suite : c’est une obligation, pas');
  l.push('> un balayage.');
  l.push('');
  l.push('## 1 · Les écrans du MÉTIER — la barre du personnel');
  l.push('');
  l.push('Chaque entrée n’apparaît que pour qui détient la fonction, **et** si son');
  l.push('module est actif. Éteindre le module retire l’entrée du menu **et** fait');
  l.push('refuser la route par l’API.');
  l.push('');
  for (const onglet of NAVIGATION_PERSONNEL) {
    l.push(`### Onglet « ${onglet.libelle} »` + (onglet.pageDeRubriques ? ` — index à rubriques : \`${onglet.pageDeRubriques}\`` : ''));
    l.push('');
    l.push('| Écran | Adresse | Fonction exigée | Module | Ce qu’on y fait |');
    l.push('|---|---|---|---|---|');
    for (const e of onglet.entrees) {
      l.push(
        `| ${e.libelle}${e.groupe ? ` *(${e.groupe})*` : ''} | \`${e.href}\` | \`${e.fonctions.join('` ou `')}\` | ${e.module ? `\`${e.module}\` — **disparaît si éteint**` : 'noyau' } | ${e.description ?? '—'} |`,
      );
    }
    l.push('');
  }
  l.push('## 2 · Les écrans HORS de la barre');
  l.push('');
  l.push('| Adresse | Pour qui | Ce qu’on y fait |');
  l.push('|---|---|---|');
  for (const [route, d] of Object.entries(HORS_BARRE).sort()) {
    const mod = (ROUTES_HORS_MENU as Record<string, string>)[route];
    l.push(`| \`${route}\` | ${d.pour}${mod ? ` · module \`${mod}\`` : ''} | ${d.quoi} |`);
  }
  l.push('');
  return l.join('\n');
}

describe('la carte des écrans', () => {
  it('⚠ tout écran du disque est classé — dans la barre, ou déclaré hors barre', () => {
    const dansLaBarre = new Set(NAVIGATION_PERSONNEL.flatMap((o) => o.entrees.map((e) => e.href)));
    const rubriques = new Set(NAVIGATION_PERSONNEL.map((o) => o.pageDeRubriques).filter(Boolean) as string[]);
    const inclassables = ecransSurLeDisque().filter(
      (r) => !dansLaBarre.has(r) && !rubriques.has(r) && !HORS_BARRE[r],
    );
    expect(
      inclassables,
      'Un écran existe et n’est nulle part dans la carte. DEUX ISSUES : ' +
        'inscrivez-le à `lib/navigation.ts` s’il relève du métier, ou déclarez-le ' +
        'dans HORS_BARRE avec POUR QUI il est et CE QU’ON Y FAIT. ⚠ Un écran que ' +
        'personne ne sait décrire est un écran que personne ne trouve.',
    ).toEqual([]);
  });

  it('⚠ une déclaration hors barre PÉRIMÉE est refusée', () => {
    const surLeDisque = new Set(ecransSurLeDisque());
    const perimees = Object.keys(HORS_BARRE).filter((r) => !surLeDisque.has(r));
    expect(perimees, 'Ces écrans n’existent plus : retirez leur ligne.').toEqual([]);
  });

  it('⚠ témoin de COMPTE : la carte couvre bien tous les écrans', () => {
    // Un compte, pas une présence : il convoque quelqu'un le jour où un écran
    // s'ajoute, et c'est ce jour-là qu'on décide s'il a une porte.
    // ⚠ 48 depuis le 22 septembre 2026 : `/admin/regles-de-circulation`
    // (dette n° 15). Il a une porte — et c'est ce témoin qui a posé la question
    // au bon moment.
    //
    // ⚠ Sa porte a CHANGÉ le 26 septembre 2026 : onglet Administration,
    // fonction `etablissement.regles`, plus aucun module. Le compte n'a pas
    // bougé — il ne pouvait pas : un écran déplacé reste un écran. C'est la
    // limite du témoin de compte, et elle est écrite ici plutôt que découverte
    // ailleurs : il convoque quand un écran s'AJOUTE, jamais quand sa porte se
    // déplace. Ce qui garde la porte est la carte engendrée juste en dessous.
    expect(ecransSurLeDisque().length).toBe(48);
  });

  it('le document sur disque est à jour', () => {
    const attendu = carte();
    if (process.env.MAJ_CARTE === '1') {
      writeFileSync(DOC, attendu);
      return;
    }
    let actuel = '';
    try {
      actuel = readFileSync(DOC, 'utf-8');
    } catch {
      /* absent : le message ci-dessous dira quoi faire */
    }
    expect(
      actuel,
      'La carte des écrans ne correspond plus à la navigation. Régénérez-la :\n' +
        '  MAJ_CARTE=1 npx vitest run tests/carte-des-ecrans.spec.ts\n' +
        '⚠ Ne la corrigez pas à la main : elle serait fausse au prochain écran.',
    ).toBe(attendu);
  });
});
