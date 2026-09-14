/**
 * UN LIBELLÉ QUI DÉCRIT UNE CAPACITÉ DU PRODUIT DATE SA PROPRE PÉREMPTION.
 *
 * ⚠ POURQUOI CE TEST EXISTE, ET IL PORTE SUR UN SEUL TEXTE.
 *
 * Le 12 septembre 2026, un libellé exact est devenu un mensonge en quatre
 * heures : « votre établissement n'a pas encore ouvert la désignation » était
 * vrai le matin, faux l'après-midi, et serait resté affiché. La leçon tirée
 * distingue deux natures de texte :
 *
 *   · l'état d'un OBJET que le code évalue — « ce compte n'a pas la fonction »,
 *     « ce catalogue est vide ». Il se corrige tout seul, le code le recalcule ;
 *   · une capacité du PRODUIT — « Gafeso ne sait pas encore faire X ». Rien ne
 *     le recalcule. Il survit à sa cause, parce que personne ne relit un texte
 *     qui a l'air correct.
 *
 * Le balayage du soir a rendu neuf libellés portant « pas encore » / « pour
 * l'instant ». Huit décrivent l'état d'un objet. UN SEUL décrit une capacité :
 *
 *     amendes.aucunEncaissementEnregistre
 *
 * Il est nécessaire — sans lui, « constatées (cumul) » est exact et opaque, et
 * la bibliothécaire qui vient d'encaisser cherche un bogue. Mais il ne peut pas
 * être reformulé en état d'objet : la raison pour laquelle le cumul ne diminue
 * pas EST une capacité manquante du produit.
 *
 * ⚠ ON NE PEUT DONC PAS LE RENDRE INSENSIBLE AU TEMPS — on peut seulement le
 * faire TOMBER le jour où sa condition disparaît. C'est ce que fait ce fichier :
 * il lie le texte à l'absence d'une route d'encaissement côté API. Le jour où
 * elle apparaît, ce test échoue et dit quoi réécrire.
 */

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LIBELLES } from '@/lib/libelles';

const RACINE_API = resolve(process.cwd(), '..', 'api', 'src');

/** Les routes d'écriture qui ressembleraient à un encaissement. */
function routesDEncaissement(): string[] {
  try {
    return execFileSync(
      'grep',
      [
        '-rniE',
        "@(Post|Patch)\\(['\"][^'\"]*(paiement|payment|encaiss|acquitt|regler|remise)",
        RACINE_API,
        '--include=*.controller.ts',
      ],
      { encoding: 'utf-8' },
    )
      .split('\n')
      .filter(Boolean);
  } catch {
    // grep sort en 1 quand il ne trouve rien : c'est le cas NOMINAL ici.
    return [];
  }
}

describe('⚠ le texte qui dit une capacité manquante du produit', () => {
  it('l’instrument voit bien les contrôleurs de l’API', () => {
    // ⚠ TÉMOIN. Sans lui, un chemin erroné rendrait « aucune route » pour
    // toujours, et ce fichier serait vert sans jamais rien mesurer — la forme
    // de silence que ce dépôt a appris à ne pas croire.
    const controleurs = execFileSync('grep', ['-rl', '@Controller(', RACINE_API], {
      encoding: 'utf-8',
    })
      .split('\n')
      .filter(Boolean);
    expect(controleurs.length).toBeGreaterThan(20);
  });

  it('dit bien ce pour quoi il existe', () => {
    // Sa propriété : il doit nommer l'encaissement ET dire la conséquence —
    // le cumul ne diminue pas. Sans la seconde moitié il n'explique rien.
    expect(LIBELLES.amendes.aucunEncaissementEnregistre).toMatch(/encaissement/i);
    expect(LIBELLES.amendes.aucunEncaissementEnregistre).toMatch(/ne diminue pas/i);
  });

  it('⚠ TOMBE le jour où une route d’encaissement apparaît', () => {
    const routes = routesDEncaissement();
    expect(
      routes,
      routes.length === 0
        ? ''
        : [
            '',
            'Une route d’encaissement existe désormais côté API.',
            'Le libellé `amendes.aucunEncaissementEnregistre` dit que Gafeso',
            '« n’enregistre pas encore les encaissements » : cette phrase est',
            'devenue FAUSSE, et elle est affichée au guichet ET sur la fiche',
            'd’adhérent, là où l’on encaisse.',
            '',
            'Réécrivez-la — ou retirez-la si le cumul devient un solde — puis',
            'retirez ce test : il n’a plus d’objet.',
            '',
          ].join('\n'),
    ).toEqual([]);
  });
});
