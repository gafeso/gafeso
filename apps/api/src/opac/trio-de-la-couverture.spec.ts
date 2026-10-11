/**
 * 🔴 LES QUATRE CHAMPS DE LA COUVERTURE, SUR TOUTE ROUTE QUI EN SERT UNE.
 *
 * ## Ce que ce garde existe pour empêcher
 *
 * La couverture composée (`docs/specification-couverture-composee.md`) se
 * dessine à partir de **quatre** valeurs : le titre, l'auteur, le domaine et
 * l'année. Le domaine décide de la TEINTE.
 *
 * Six routes servent des notices à un écran qui dessine des couvertures. Au
 * 11 octobre 2026, **trois les portaient toutes, trois n'en portaient pas** :
 *
 * | Route | état avant |
 * |---|---|
 * | `/opac/search` | ✅ |
 * | `/opac/records/:id` | ✅ |
 * | `/offline/my-documents` | ✅ |
 * | `/opac/parcourir` | 🔴 `category` manquant |
 * | `/opac/nouveautes` | 🔴 `category` manquant — **la page d'accueil** |
 * | `/reader/hors-ligne` | 🔴 les TROIS manquants |
 *
 * ⚠ **Chaque route était correcte isolément.** La faute était dans l'ÉCART :
 * un même document recevait une couverture d'une couleur sur la fiche et d'une
 * autre sur l'accueil. Personne ne relit six routes ensemble.
 *
 * ## ⭐ CE QUE CE GARDE VÉRIFIE, ET CE QU'IL NE PEUT PAS
 *
 * Il affirme que la projection de vitrine est **écrite une seule fois** et
 * qu'elle porte les quatre champs. C'est une propriété de FORME, et elle a sa
 * borne : une route qui construirait sa propre projection à la main lui serait
 * invisible. Le témoin de compte ci-dessous est ce qui la rattrape — il
 * convoque dès qu'une copie apparaît.
 *
 * ⚠ La borne est écrite parce qu'elle a été MESURÉE, pas supposée : c'est
 * exactement ce qui vient d'arriver, deux copies identiques qui ont divergé.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SELECT_VITRINE } from './opac.service';

const CHAMPS_DE_LA_COUVERTURE = ['title', 'author', 'category', 'publishYear'] as const;

const SERVICE = readFileSync(join(__dirname, 'opac.service.ts'), 'utf-8');
const LECTEUR = readFileSync(
  join(__dirname, '../reader/reader.controller.ts'),
  'utf-8',
);

describe('🔴 Le trio de la couverture, sur toutes les routes qui en servent une', () => {
  it('⭐ la projection de VITRINE porte les quatre champs', () => {
    for (const champ of CHAMPS_DE_LA_COUVERTURE) {
      expect(
        (SELECT_VITRINE as Record<string, unknown>)[champ],
        `\`${champ}\` manque à SELECT_VITRINE. La couverture composée en a ` +
          'besoin — et `category` décide de la TEINTE, donc un document ' +
          'changerait de couleur selon l’écran.',
      ).toBe(true);
    }
  });

  it('⚠ TÉMOIN DE COMPTE : la projection de vitrine est écrite UNE SEULE FOIS', () => {
    // `nouveautes` et `parcourir` la portaient toutes les deux, à l'identique,
    // et `category` n'a été ajouté qu'à l'une des trois routes du catalogue.
    // Ce compte convoque dès qu'une copie réapparaît.
    const usages = SERVICE.match(/select: SELECT_VITRINE/g) ?? [];
    expect(
      usages.length,
      'Le nombre de routes employant SELECT_VITRINE a changé. Ce n’est pas un ' +
        'échec : c’est une convocation. Une route de vitrine NEUVE doit ' +
        'l’employer — et si elle écrit sa propre projection, elle divergera ' +
        'exactement comme les deux précédentes.',
    ).toBe(2);

    // ⚠ Et AUCUNE projection recopiée ne doit subsister : le motif cherche la
    // signature des anciennes copies — `coverUrl` suivi du `digitalCopy` lu.
    const copies = SERVICE.match(/coverUrl: true,[\s\S]{0,200}?digitalCopy: \{ select: \{ encStatus: true \} \},/g) ?? [];
    expect(
      copies.filter((c) => !c.includes('category: true')).length,
      'Une projection de vitrine recopiée SANS `category` subsiste dans ' +
        'opac.service.ts. C’est la forme exacte du défaut du 11 octobre.',
    ).toBe(0);
  });

  it('🔴 `/reader/hors-ligne` sert le trio — c’est l’étagère du lecteur', () => {
    // L'écran où la couverture sert le plus : on y cherche un document qu'on a
    // DÉJÀ pris, donc on le reconnaît avant de le lire.
    const bloc = LECTEUR.slice(LECTEUR.indexOf("@Get('hors-ligne')"));
    const corps = bloc.slice(0, bloc.indexOf('\n  }\n'));
    for (const champ of ['auteur', 'domaine', 'annee']) {
      expect(
        corps.includes(`${champ}:`),
        `\`${champ}\` manque à la charge de /reader/hors-ligne.`,
      ).toBe(true);
    }
    // ⚠ Et l'auteur vient du CONTRIBUTEUR, pas de la colonne dénormalisée —
    // deux règles pour un même nom finiraient par diverger.
    expect(
      corps.includes('AUTEUR_PRINCIPAL'),
      'l’auteur doit venir du contributeur principal, comme sur les autres routes',
    ).toBe(true);
  });

  it('⭐ TÉMOIN D’ABSENCE : le relevé sait dire NON', () => {
    // Sans ce cas, un motif qui ne trouverait JAMAIS rien rendrait les deux
    // assertions ci-dessus vertes sur une population vide — et leur vert serait
    // honnête. On lui soumet une projection fautive FABRIQUÉE.
    const fautive = `
      select: {
        coverUrl: true,
        digitalCopy: { select: { encStatus: true } },
      },`;
    const copies = fautive.match(/coverUrl: true,[\s\S]{0,200}?digitalCopy: \{ select: \{ encStatus: true \} \},/g) ?? [];
    expect(copies.length, 'le motif doit RECONNAÎTRE une projection recopiée').toBe(1);
    expect(copies[0]?.includes('category: true')).toBe(false);
  });
});
