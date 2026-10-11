import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  adresseCourteDeLaNotice,
  adressePubliqueDeLaNotice,
} from '../opac/identifiant-perenne';

/**
 * 🔴 LES ÉTIQUETTES ENCODENT L'ADRESSE COURTE — `/opac/<id>`, jamais la pérenne.
 *
 * ## ⚠ CE QUI REND CE GARDE NÉCESSAIRE, et il est né d'un ACCIDENT
 *
 * `adressePubliqueDeLaNotice(appUrl, domaine, id)` rend la forme courte **quand
 * on ne lui passe pas de slug**. Le service d'étiquettes ne le passait pas — il
 * était donc juste par accident, et le 11 octobre 2026, au moment de basculer
 * `publicUrl` sur la forme pérenne, rien n'aurait empêché quelqu'un d'ajouter le
 * slug ici « pour être cohérent ».
 *
 * **Ce geste est naturel, il paraît être un alignement, et il n'échouerait
 * nulle part** : la planche se génère, le QR s'imprime, et personne ne sait que
 * ses modules ont rétréci de 8 % — jusqu'au jour où une bibliothécaire n'arrive
 * plus à scanner une étiquette collée dans un livre manipulé depuis deux ans.
 *
 * ## ⭐ LA MESURE QUI DÉCIDE, et elle a été prise AVANT la bascule
 *
 * Le QR d'étiquette est un carré **FIXE de 13 mm**. Allonger l'adresse ne
 * l'agrandit pas : elle monte en version.
 *
 * | L'adresse | Longueur | Version | Module |
 * |---|---|---|---|
 * | `/opac/<uuid>` | 59 car | v4 | 0,317 mm |
 * | `/opac/resoudre/oai:<école>:<uuid>` | 79 car | v5 | 0,289 mm |
 * | école au nom LONG | 116 car | v7 | 0,245 mm |
 *
 * ⚠ **Et la lisibilité à ces tailles n'est mesurée par personne** — il faudrait
 * une planche imprimée et un appareil photo. On ne paie donc pas le
 * rétrécissement : les DEUX adresses résolvent la même notice, et `/opac/<id>`
 * est servie pour toujours.
 *
 * ⚠ **NE PAS CONFONDRE avec `LARGEUR_MODULE_MIN_MM`** (0,25 mm) : celui-là borne
 * le module du CODE 128, qui dépend de la longueur du CODE-BARRES. Deux
 * grandeurs en mm/module, du même ordre, et ce ne sont pas les mêmes — voir
 * `qr-a-cote-du-code-barres.spec.ts`.
 */

const SERVICE = readFileSync(join(__dirname, 'labels.service.ts'), 'utf-8');
const PDF = readFileSync(join(__dirname, 'label-pdf.ts'), 'utf-8');

const APP = 'https://gafeso.org';
const DOMAINE = 'bib.uo.bf';
const ID = '3f2a9c1e-7b40-4d8a-9e21-1c5b6d7e8f90';

describe('🔴 l’étiquette encode l’adresse COURTE', () => {
  it('⭐ par l’EFFET : la forme courte est `/opac/<id>`, et elle n’a pas de segment de résolution', () => {
    const courte = adresseCourteDeLaNotice(APP, DOMAINE, ID);
    expect(courte).toBe(`https://${DOMAINE}/opac/${ID}`);
    expect(courte, 'aucun segment de résolution sur une étiquette').not.toContain('/resoudre/');
    expect(courte, 'et aucun identifiant pérenne encodé').not.toContain('oai');
  });

  it('⚠ TÉMOIN D’ABSENCE : la forme PÉRENNE, elle, est bien plus longue — sinon ce garde ne garde rien', () => {
    // Sans ce cas, un `adresseCourteDeLaNotice` qui rendrait la forme pérenne
    // serait indiscernable d'un garde juste : les deux passeraient le cas
    // ci-dessus si la pérenne contenait aussi `/opac/`.
    const perenne = adressePubliqueDeLaNotice(APP, DOMAINE, ID, 'uo') as string;
    const courte = adresseCourteDeLaNotice(APP, DOMAINE, ID) as string;
    expect(perenne, 'la pérenne porte le segment de résolution').toContain('/resoudre/');
    expect(
      perenne.length - courte.length,
      'l’écart de longueur est la raison d’être de ce garde : il doit être réel',
    ).toBeGreaterThan(15);
  });

  it('🔴 le SERVICE d’étiquettes appelle la forme COURTE, et jamais la pérenne', () => {
    expect(SERVICE.length, 'témoin : le fichier a bien été LU').toBeGreaterThan(1000);

    const courts = SERVICE.split('\n').filter((l) => /adresseCourteDeLaNotice\(/.test(l));
    const perennes = SERVICE.split('\n').filter((l) =>
      /adressePubliqueDeLaNotice\(/.test(l),
    );
    // ⚠ TÉMOIN DE COMPTE : un motif qui ne trouve rien rendrait ce cas vert sur
    // l'ensemble vide. Un appel de plus demain convoque quelqu'un ici.
    expect(courts.length, 'le relevé doit voir l’appel à la forme courte').toBe(1);
    expect(
      perennes,
      'LE SERVICE D’ÉTIQUETTES NE DOIT PAS APPELER L’ADRESSE PÉRENNE. À 13 mm, ' +
        'elle fait monter le QR d’une version et rétrécit ses modules de 8 %, ' +
        'sans aucune mesure de lisibilité. Les affiches et les PDF, eux, ' +
        'utilisent `publicUrl` — et c’est leur place : ils rendent quatre fois ' +
        'plus de millimètres par module.',
    ).toEqual([]);
  });

  it('🔴 et le GÉNÉRATEUR de planche lit `shortUrl`, pas `publicUrl`', () => {
    // Le nom du champ EST le contrat au point d'usage : `LabelData.shortUrl`
    // dit, à qui écrit une planche, laquelle des deux adresses il manipule.
    expect(PDF.length, 'témoin : le fichier a bien été LU').toBeGreaterThan(1000);
    expect(PDF, 'le générateur doit lire `shortUrl`').toContain('shortUrl');
    expect(
      PDF.includes('publicUrl'),
      'le générateur de planche ne doit PAS connaître `publicUrl` : un champ ' +
        'dont le nom ne dit pas la contrainte se fait réaffecter par quelqu’un ' +
        'qui veut « être cohérent ».',
    ).toBe(false);
  });
});
