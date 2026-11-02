/**
 * ⭐⭐ LA LÉGENDE D'UN QR DIT CE QUE LE QR PORTE — confrontée à sa CIBLE.
 *
 * ## 🔴 LE DÉFAUT, trouvé par Jean au navigateur le 2 novembre 2026
 *
 * Le bloc « Partager » affichait, sous son code :
 *
 * > « Adresse de cette page »
 *
 * Et le code portait `…/opac/resoudre/oai%3A<école>%3A<uuid>` — le RÉSOLVEUR
 * pérenne. L'adresse de cette page, elle, est `…/opac/<uuid>`.
 *
 * ⚠ **Une légende qui décrit autre chose que ce qu'elle légende est un faux
 * silencieux.** Rien ne la démentait : l'adresse est affichée juste à côté, et
 * elle a l'air d'être celle qu'on lit dans la barre du navigateur.
 *
 * ## ⭐ CE QUE CETTE ÉPREUVE MESURE, et pourquoi ce n'est pas un test de texte
 *
 * Elle ne vérifie pas qu'un libellé vaut telle chaîne — ça, « un test qui
 * restate la constante » le ferait, et il aurait suivi la dégradation sans
 * broncher. Elle lit **les deux moitiés dans le DOM rendu** — la légende
 * affichée ET la cible que le QR encode — et elle les CONFRONTE.
 *
 * ⚠ La cible est identifiée depuis le `path` du SVG, pas depuis le prop : un
 * repli ajouté n'importe où dans la chaîne serait vu ici.
 *
 * ## ⚠ ET IL Y A DEUX CAS, parce que le bloc RETOMBE
 *
 * Sans `APP_URL`, l'API ne sert pas `publicUrl` et le code porte alors
 * l'adresse de cette page. Une légende figée sur « pérenne » serait fausse dans
 * ce cas-là — c'est pourquoi elle est DÉRIVÉE de la cible, et pourquoi cette
 * épreuve couvre les deux sens.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { BlocPartage } from '@/components/bloc-partage';
import { LIBELLES } from '@/lib/libelles';
import { matriceQr, traceDesModules } from '@/lib/qr';
import { estFormePerenne } from '@/lib/url-publique';

const ID = '9de9b299-cde5-4acc-9e76-0e800ad94281';
const ORIGINE = 'https://biblio.univ-exemple.bf';
const COURTE = `${ORIGINE}/opac/${ID}`;
const PERENNE = `${ORIGINE}/opac/resoudre/oai%3Aexemple%3A${ID}`;
const T = LIBELLES.partage;

/**
 * ⚠ LA CIBLE, LUE DEPUIS LE TRACÉ DESSINÉ. On cherche laquelle des candidates
 * produit exactement cette matrice — c'est un garde d'EFFET.
 */
function cibleDuQr(candidates: string[]): string | null {
  const d = document.querySelector('svg path')?.getAttribute('d');
  if (!d) return null;
  for (const c of candidates) if (traceDesModules(matriceQr(c)) === d) return c;
  return null;
}

/** La légende réellement affichée, parmi les deux que le produit connaît. */
function legendeAffichee(): string | null {
  for (const l of [T.adressePerenne, T.adresseDeCettePage]) {
    if (screen.queryByText(l)) return l;
  }
  return null;
}

async function monter(publicUrl: string | null) {
  // ⚠ L'origine décide du repli : on la fixe, sinon jsdom rend `localhost`.
  vi.stubGlobal('location', { ...window.location, origin: ORIGINE });
  render(<BlocPartage recordId={ID} publicUrl={publicUrl} />);
  // ⚠ On attend une ancre qui DOIT être là : le QR est posé dans un effet.
  await screen.findByRole('img', { name: /Code QR/i });
}

describe('⭐⭐ la légende et la cible du QR se confrontent', () => {
  it('⭐ publicUrl servi : le QR porte le RÉSOLVEUR, et la légende le dit', async () => {
    await monter(PERENNE);

    const cible = cibleDuQr([PERENNE, COURTE]);
    const legende = legendeAffichee();

    expect(cible, 'aucune candidate ne produit le tracé dessiné').toBe(PERENNE);
    expect(legende, 'aucune des deux légendes connues n’est affichée').not.toBeNull();

    /*
     * ⭐⭐ LA CONFRONTATION : la légende doit parler de la forme que la cible a
     * RÉELLEMENT. C'est ce que le défaut du 2 novembre violait — cible
     * pérenne, légende « de cette page ».
     */
    expect(estFormePerenne(cible as string)).toBe(true);
    expect(legende).toBe(T.adressePerenne);
    expect(legende).not.toBe(T.adresseDeCettePage);
  });

  /*
   * ⚠ LE SECOND SENS, et il n'est pas décoratif : sans `APP_URL`, le code porte
   * bien l'adresse de cette page, et c'est alors l'AUTRE légende qui est vraie.
   * Sans ce cas, une légende figée sur « pérenne » passerait.
   */
  it('⚠ sans publicUrl : le QR porte l’adresse de la page, et la légende le dit', async () => {
    await monter(null);

    const cible = cibleDuQr([PERENNE, COURTE]);
    const legende = legendeAffichee();

    expect(cible).toBe(COURTE);
    expect(estFormePerenne(cible as string)).toBe(false);
    expect(legende).toBe(T.adresseDeCettePage);
    expect(legende).not.toBe(T.adressePerenne);
  });
});

/**
 * ⚠ CE QUE LES DEUX TEXTES DOIVENT DIRE — assertions sur leur CONTENU,
 * séparées de leur emploi : « un test qui restate la constante ne voit pas
 * qu'elle est devenue inutile ».
 */
describe('les deux légendes portent leur propriété', () => {
  it('celle du résolveur dit la PROPRIÉTÉ qui justifie la forme', () => {
    expect(T.adressePerenne).toMatch(/pérenne/i);
    // ⚠ ce qui compte n'est pas le mot « pérenne », c'est ce qu'il PROMET :
    // survivre à un déménagement. Sans ça, le texte n'explique rien.
    expect(T.adressePerenne).toMatch(/survit|domaine|hébergeur/i);
    expect(T.adressePerenne).not.toMatch(/cette page/i);
  });

  /*
   * ⚠ MON ASSERTION A ÉTÉ TROP STRICTE D'ABORD : elle bannissait le MOT
   * « pérenne » du repli, alors que le repli a de bonnes raisons de le NOMMER —
   * pour dire qu'il en manque une. Ce qu'il ne doit pas faire, c'est la
   * PROMETTRE. Une assertion sur un mot interdit là où la propriété est une
   * promesse : le test refusait un texte juste.
   */
  it('celle du repli nomme CETTE page, et ne PROMET pas la pérennité', () => {
    expect(T.adresseDeCettePage).toMatch(/cette page/i);
    // elle ne dit pas que le code MÈNE à une adresse pérenne…
    expect(T.adresseDeCettePage).not.toMatch(/mène à l’adresse pérenne/i);
    // …elle dit qu'il en MANQUE une
    expect(T.adresseDeCettePage).toMatch(/faute d|sans|pas d’adresse pérenne/i);
  });
});
