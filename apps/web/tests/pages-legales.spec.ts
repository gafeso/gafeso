/**
 * LES PAGES LÉGALES — rédigées par l'ÉTABLISSEMENT, et jamais publiées
 * incomplètes.
 *
 * Décision de Jean, 8 octobre 2026 : sur l'instance de l'UO, l'éditeur et le
 * responsable du traitement, c'est **L'UO — pas ResurgiTech**. Et : *« le modèle
 * par défaut ne doit rien affirmer que l'établissement n'a pas vérifié — pas de
 * durée de conservation inventée, pas de délégué nommé. »*
 *
 * ⚠ CE QUE CE FICHIER DÉFEND EN PREMIER : **aucun bloc `a-remplir` n'arrive
 * pré-rempli**, et **une page dont un bloc obligatoire manque n'est pas
 * publiable**. Une page publique portant « Durée de conservation : [à
 * compléter] » sur le site d'une université serait pire que son absence.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LIBELLES } from '@/lib/libelles';
import {
  MODELES,
  type ClePageLegale,
  champsManquants,
  estPubliable,
  texteDuBloc,
} from '@/lib/pages-legales';

const CLES = Object.keys(MODELES) as ClePageLegale[];
const TOUS = CLES.flatMap((c) => MODELES[c]);

describe('le modèle n’affirme rien que l’établissement n’ait vérifié', () => {
  it('⚠ témoin de COMPTE : le modèle a bien des blocs des DEUX natures', () => {
    // Sans lui, un modèle vidé rendrait toutes les assertions « tous les blocs
    // satisfont P » vraies sur l'ensemble vide.
    expect(TOUS.length).toBeGreaterThan(8);
    expect(TOUS.filter((b) => b.nature === 'a-remplir').length).toBeGreaterThan(4);
    expect(TOUS.filter((b) => b.nature === 'mesure').length).toBeGreaterThan(1);
  });

  it('⚠ AUCUN bloc « à remplir » n’arrive pré-rempli', () => {
    // C'est la décision, mot pour mot : des champs à remplir, dits comme tels.
    const prerempli = TOUS.filter((b) => b.nature === 'a-remplir' && b.propose.trim() !== '');
    expect(
      prerempli.map((b) => b.id),
      'Un bloc « à remplir » pré-rempli ferait publier un texte que personne n’a vérifié.',
    ).toEqual([]);
  });

  it('⚠ aucun bloc n’invente une DURÉE ni ne NOMME un délégué', () => {
    // Les deux exemples que Jean a nommés, éprouvés sur le modèle entier.
    for (const bloc of TOUS) {
      expect(bloc.propose, `${bloc.id} invente une durée`).not.toMatch(
        /\b\d+\s*(an|ans|mois|jour|jours)\b/i,
      );
      expect(bloc.propose, `${bloc.id} nomme un délégué`).not.toMatch(/délégué.{0,40}:\s*\S/i);
    }
  });

  it('⚠ RESURGITECH n’apparaît QUE comme éditeur du LOGICIEL', () => {
    const mentions = TOUS.filter((b) => /resurgitech/i.test(b.propose));
    expect(mentions.map((b) => b.id), 'une seule mention, et c’est le bloc « logiciel »').toEqual([
      'logiciel',
    ]);
    const bloc = mentions[0];
    // Elle dit que l'éditeur du logiciel n'est PAS l'éditeur du site.
    expect(bloc.propose).toMatch(/logiciel/i);
    expect(bloc.propose).toMatch(/n’est pas l’éditeur de ce site|pas l’éditeur de ce site/i);
  });

  it('⚠ chaque bloc « mesure » nomme la MESURE qui l’a produit', () => {
    // Un bloc pré-rempli reste une PROPOSITION : ce qui le distingue d'une
    // invention est qu'on peut dire d'où il vient.
    for (const bloc of TOUS.filter((b) => b.nature === 'mesure')) {
      expect(bloc.aide, `${bloc.id} : d’où vient ce texte ?`).toMatch(/mesure/i);
    }
  });

  it('⚠ et chaque bloc « à remplir » dit à l’éditeur ce qu’on attend', () => {
    for (const bloc of TOUS.filter((b) => b.nature === 'a-remplir')) {
      expect(bloc.aide.length, `${bloc.id} : une aide vide est un champ qu’on ne remplira pas`).toBeGreaterThan(40);
    }
  });
});

describe('une page incomplète NE SE PUBLIE PAS', () => {
  it('une page vide n’est publiable sur aucune des deux clés', () => {
    for (const cle of CLES) {
      const vide = { blocs: {}, publieeLe: null };
      expect(estPubliable(cle, vide)).toBe(false);
      expect(champsManquants(cle, vide).length).toBeGreaterThan(0);
    }
  });

  it('⚠ un SEUL bloc obligatoire vide suffit à refuser', () => {
    for (const cle of CLES) {
      const obligatoires = MODELES[cle].filter((b) => b.nature === 'a-remplir');
      const blocs = Object.fromEntries(obligatoires.slice(1).map((b) => [b.id, 'rempli']));
      expect(estPubliable(cle, { blocs, publieeLe: null })).toBe(false);
      expect(champsManquants(cle, { blocs, publieeLe: null }).map((b) => b.id)).toEqual([
        obligatoires[0].id,
      ]);
    }
  });

  it('⚠ et un bloc rempli d’ESPACES ne compte pas comme rempli', () => {
    for (const cle of CLES) {
      const blocs = Object.fromEntries(
        MODELES[cle].filter((b) => b.nature === 'a-remplir').map((b) => [b.id, '   \n  ']),
      );
      expect(estPubliable(cle, { blocs, publieeLe: null })).toBe(false);
    }
  });

  it('toutes les obligations remplies : la page devient publiable', () => {
    for (const cle of CLES) {
      const blocs = Object.fromEntries(
        MODELES[cle].filter((b) => b.nature === 'a-remplir').map((b) => [b.id, 'texte de l’école']),
      );
      expect(estPubliable(cle, { blocs, publieeLe: null })).toBe(true);
    }
  });
});

describe('le texte affiché vient de l’école, et sinon de la proposition', () => {
  it('ce que l’école écrit l’emporte sur la proposition', () => {
    const bloc = MODELES.mentions.find((b) => b.id === 'logiciel')!;
    expect(texteDuBloc(bloc, { blocs: { logiciel: 'le nôtre' }, publieeLe: null })).toBe('le nôtre');
    expect(texteDuBloc(bloc, { blocs: {}, publieeLe: null })).toBe(bloc.propose);
  });
});

describe('⚠⚠ ON N’ÉCRIT JAMAIS SANS AVOIR LU', () => {
  /*
   * LA GARANTIE LA PLUS IMPORTANTE DE CET ÉCRAN, et elle n'avait AUCUN test
   * avant le 9 octobre 2026 — trouvée par une recette qui a montré « Cannot GET
   * /tenancy/settings » : l'écran ne chargeait rien, et il offrait pourtant
   * d'enregistrer.
   *
   * `PATCH /tenancy/settings` fait un REMPLACEMENT COMPLET de `pagesLegales`.
   * Enregistrer sans avoir lu l'état courant l'ÉCRASE — y compris une page
   * PUBLIÉE que personne ne voulait retirer.
   *
   * ⭐ C'est « une fonction qui ne peut pas accomplir son office ne doit pas
   * sortir comme si elle l'avait accompli », appliqué à une ÉCRITURE : l'office
   * est « modifier », et modifier sans avoir lu est écraser.
   */
  it('le refus EXISTE, et il explique le DANGER — pas la panne', () => {
    const t = LIBELLES.pagesLegales.refusEnregistrerSansLecture;
    // Il doit dire ce qu'on perdrait, sinon il se lit comme une panne qu'on
    // contourne en réessayant — et réessayer est précisément le geste qui
    // détruirait.
    expect(t).toMatch(/remplacerait|écraserait/i);
    expect(t).toMatch(/publiée/i);
    expect(t).toMatch(/rechargez/i);
  });

  it('⚠ et l’écran lit la route qui rend les BROUILLONS, pas la publique', () => {
    /*
     * ⚠ LA BORNE EST PARTIE AVEC SA CAUSE. Ce cas exigeait que l'écran DISE
     * qu'un brouillon ne se relit pas — vrai jusqu'à rc8, où
     * `GET /tenancy/settings` a commencé à les rendre. Le garder aurait exigé un
     * texte devenu FAUX, c'est-à-dire exactement le défaut que ce dépôt traque.
     *
     * ⭐ Ce qu'il GARDE désormais est la propriété qui reste : l'éditeur lit la
     * route RÉSERVÉE (brouillons compris), jamais la route PUBLIQUE qui les
     * filtre. S'y fier ferait enregistrer un remplacement complet sans avoir vu
     * ce qu'on écrase — et c'est écrit dans la description de la route elle-même.
     */
    const src = readFileSync(resolve(process.cwd(), 'app/admin/pages-legales/page.tsx'), 'utf-8');
    const code = src.split('\n').filter((l) => !/^\s*(\*|\/\/)/.test(l)).join('\n');
    expect(code).toMatch(/'\/tenancy\/settings'/);
    expect(code).not.toMatch(/api<[^>]*>\(\s*'\/tenancy\/home'/);
  });

  it('⚠ l’écran LIT une route qui existe', () => {
    // ⚠ Le défaut d'origine : l'écran appelait `GET /tenancy/settings`, qui
    // N'EXISTE PAS — et mes 14 cas doublaient `api()`, donc aucun ne pouvait me
    // démentir. « Une doublure est une hypothèse, et un test vert ne confirme
    // que moi. » Ce cas lit la SOURCE de l'écran et refuse la route fantôme.
    const src = readFileSync(resolve(process.cwd(), 'app/admin/pages-legales/page.tsx'), 'utf-8');
    const code = src.split('\n').filter((l) => !/^\s*(\*|\/\/)/.test(l)).join('\n');
    // ⚠ INVERSÉ en rc8 : la route existe, et c'est elle qu'il faut.
    expect(code).toMatch(/'\/tenancy\/settings'/);
  });

  /**
   * ⚠ CE CAS A ÉTÉ DÉPLACÉ, ET PROMU — voir `pages-legales-ecran.spec.tsx`.
   *
   * Il lisait la source et épinglait le littéral `if (!pages)`, avec cette
   * borne écrite à côté :
   *
   * > « On lit la source : un test de rendu ne peut pas prouver qu'aucune
   * >   requête ne part. »
   *
   * ⚠ IL PEUT — il suffit de COMPTER les requêtes de la doublure. La borne
   * n'était pas infermable, elle n'avait pas été essayée : « une borne se
   * DÉCLARE quand on ne peut pas la fermer, pas quand on n'a pas essayé ».
   *
   * Et le garde de source avait le défaut de sa famille : élargir la garde en
   * `!pages || version === null` — la MÊME garantie, étendue à la version
   * qu'exige rc9 — l'a fait crier sur un code plus juste que celui qu'il
   * défendait. Un garde qui épingle un littéral punit celui qui améliore.
   *
   * Ce qui le remplace mesure l'EFFET, et sur les DEUX couches : l'éditeur
   * n'est pas rendu sans lecture (donc aucun bouton), et la garde refuse quand
   * le contenu est lu sans version. Aucun PATCH ne part dans les deux cas, et
   * c'est COMPTÉ.
   */
});

describe('la PROPRIÉTÉ des textes, pas leur emploi', () => {
  it('⚠ le refus NOMME la fonction et son destinataire', () => {
    expect(LIBELLES.refusDeDroit.pagesLegales).toContain('etablissement.apparence');
    expect(LIBELLES.refusDeDroit.pagesLegales).toMatch(/administrateur/i);
    expect(LIBELLES.refusDeDroit.pagesLegales).toMatch(/demandez|contactez/i);
  });

  it('⚠ le refus de publication NOMME ce qui manque, il ne dit pas « complétez »', () => {
    const texte = LIBELLES.pagesLegales.refusPublication(['Hébergeur', 'Durée de conservation']);
    expect(texte).toContain('Hébergeur');
    expect(texte).toContain('Durée de conservation');
  });

  it('⚠ et le motif dit POURQUOI on refuse — l’engagement, pas la forme', () => {
    expect(LIBELLES.pagesLegales.refusMotif).toMatch(/engage/i);
    expect(LIBELLES.pagesLegales.refusMotif).toMatch(/lien n’apparaît pas|pas publiée/i);
  });
});
