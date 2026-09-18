/**
 * TOUT LIEN INTERNE MÈNE À UN ÉCRAN QUI EXISTE.
 *
 * ⚠ CE QUE CE GARDE EXISTE POUR EMPÊCHER, ET C'EST ARRIVÉ. Le 16 septembre
 * 2026, en recettant le MOMENT 2 bis de la démonstration — « Mes encadrements »,
 * l'écran que le script appelle différenciant —, les QUATRE titres pointaient
 * vers `/catalogue/<id>`. Cette adresse n'existe pas : `app/catalogue/` n'a
 * jamais existé, la fiche publique est `/opac/<id>`. Un enseignant qui cliquait
 * le mémoire qu'il avait dirigé obtenait « page could not be found ».
 *
 * ⚠ AUCUN TEST NE POUVAIT LE VOIR, et ce n'est pas un oubli : un test rend un
 * `href`, il ne le SUIT pas. Le lien était présent, bien formé, accessible, et
 * il ne menait nulle part. C'est « une route peut être correcte et n'avoir aucun
 * chemin vers son argument » retourné — ici c'est la PORTE qui existe et l'écran
 * qui manque.
 *
 * ── LE SCÉNARIO DE SA VIOLATION, parce qu'il est raisonnable ────────────────
 * On écrit `/catalogue/${id}` parce que l'écran professionnel s'appelle
 * `/admin/catalogue`, que le mot « catalogue » est celui du domaine, et que
 * personne ne clique ses propres liens en développant. Le jour où quelqu'un
 * renomme un dossier de `app/`, tous les liens qui le nommaient deviennent
 * faux **en silence** : rien ne casse, rien ne rougit, la page s'affiche.
 *
 * ── ⚠ SA BORNE, MESURÉE ─────────────────────────────────────────────────────
 * Il ne voit que les `href` LITTÉRAUX (79 au 16 septembre 2026). Un `href={x}`
 * où `x` vient d'une variable lui échappe — c'est la limite de tout garde qui
 * lit la source, et elle est écrite ici plutôt que découverte : « un garde qui
 * lit la source ne suit pas les variables ». Les `router.push()` ne sont pas
 * couverts non plus.
 */

import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Les écrans que `app/` porte réellement, paramètres normalisés en `*`. */
export function ecransExistants(racine = resolve(process.cwd(), 'app')): Set<string> {
  const trouves = new Set<string>();
  const parcourir = (dossier: string, chemin: string) => {
    const entrees = readdirSync(dossier);
    if (entrees.includes('page.tsx') || entrees.includes('route.ts')) {
      trouves.add(chemin === '' ? '/' : chemin);
    }
    for (const e of entrees) {
      const complet = join(dossier, e);
      if (!statSync(complet).isDirectory()) continue;
      // `(groupe)` ne crée pas de segment d'URL ; `[id]` en crée un, variable.
      const segment = /^\(.*\)$/.test(e) ? '' : `/${e.replace(/^\[\.\.\.?|\[|\]$/g, '').replace(/^.*$/, /^\[/.test(e) ? '*' : e)}`;
      parcourir(complet, chemin + segment);
    }
  };
  parcourir(racine, '');
  return trouves;
}

/** Les liens internes écrits en clair dans la source. */
export function liensInternes(dossiers = ['app', 'components', 'lib']): { fichier: string; href: string }[] {
  const brut = execFileSync(
    'grep',
    ['-rnE', 'href=(\\{`|")/', ...dossiers, '--include=*.tsx', '--include=*.ts'],
    { cwd: process.cwd(), encoding: 'utf-8' },
  );
  const trouves: { fichier: string; href: string }[] = [];
  for (const ligne of brut.split('\n')) {
    if (!ligne) continue;
    const fichier = ligne.slice(0, ligne.indexOf(':'));
    for (const m of ligne.matchAll(/href=(?:\{`|")(\/[^"`]*)/g)) {
      trouves.push({ fichier, href: m[1] });
    }
  }
  return trouves;
}

/** `/opac/${id}?x=1` → `/opac/*`. */
export function normaliser(href: string): string {
  const sansRequete = href.split('?')[0].split('#')[0];
  const avecEtoiles = sansRequete.replace(/\$\{[^}]*\}/g, '*');
  return avecEtoiles.length > 1 ? avecEtoiles.replace(/\/$/, '') : '/';
}

function inconnus(): string[] {
  const ecrans = ecransExistants();
  return liensInternes()
    .map((l) => ({ ...l, cible: normaliser(l.href) }))
    // `/api/...` est la réécriture vers l'API, gardée par routes-connues-de-l-api.
    .filter((l) => !l.cible.startsWith('/api'))
    .filter((l) => !ecrans.has(l.cible))
    .map((l) => `${l.fichier} → ${l.href}`)
    .sort();
}

describe('l’instrument, avant ce qu’il mesure', () => {
  it('témoin de COMPTE — il a bien lu les écrans et les liens', () => {
    // 50 écrans et 79 liens le 16 septembre 2026. Les bornes sont larges : ce
    // témoin garde le fait qu'on LIT, pas un nombre.
    expect(ecransExistants().size).toBeGreaterThan(40);
    expect(liensInternes().length).toBeGreaterThan(50);
  });

  it('témoin de PRÉSENCE — les écrans connus sont bien reconnus', () => {
    const ecrans = ecransExistants();
    expect(ecrans.has('/opac/*')).toBe(true);
    expect(ecrans.has('/admin/catalogue/*')).toBe(true);
    expect(ecrans.has('/mes-encadrements')).toBe(true);
    // ⚠ Et celui qui a produit le défaut n'existe PAS — c'est le cœur du cas.
    expect(ecrans.has('/catalogue/*')).toBe(false);
  });

  it('témoin d’ABSENCE — la normalisation ne confond pas un paramètre avec un segment', () => {
    // La confusion PLAUSIBLE : un gabarit qui interpole doit devenir `*`, et une
    // requête ne doit pas devenir un segment.
    expect(normaliser('/opac/${e.recordId}')).toBe('/opac/*');
    expect(normaliser('/opac?q=droit')).toBe('/opac');
    expect(normaliser('/admin/adherents/${id}#prets')).toBe('/admin/adherents/*');
    expect(normaliser('/')).toBe('/');
  });
});

describe('les liens internes du front', () => {
  it('mènent tous à un écran qui existe', () => {
    expect(
      inconnus(),
      'Ces liens pointent vers une adresse qu’aucun fichier de `app/` ne sert : ' +
        'le clic rend un 404. Corrigez le lien (la fiche publique est `/opac/:id`, ' +
        'la professionnelle `/admin/catalogue/:id`), ou créez l’écran. ⚠ Un href ' +
        'est RENDU par les tests, il n’est jamais SUIVI — rien d’autre ne voit ça.',
    ).toEqual([]);
  });
});
