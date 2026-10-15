import { render, screen, waitFor } from '@testing-library/react';
import { useCallback } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { FormulaireCharge, useFormulaireCharge } from '@/components/formulaire-charge';
import { LIBELLES } from '@/lib/libelles';

/**
 * ⭐⭐ CE QU'ON ÉPROUVE N'EST PAS « un chargement s'affiche » — c'est que le
 * CORPS DU FORMULAIRE N'EST JAMAIS APPELÉ avant les données.
 *
 * ⚠ La différence n'est pas théorique. Un écran peut parfaitement afficher
 * « Chargement… » EN PLUS d'un formulaire déjà monté plus bas ; c'était le cas
 * d'`/admin/accueil`, qui portait ses deux libellés de chargement et rendait
 * quand même ses vingt-deux champs. Une assertion sur le texte de chargement
 * serait restée VERTE sur le défaut qu'on corrige.
 *
 * On compte donc les APPELS de la fonction de rendu. C'est un témoin d'effet,
 * pas de forme : aucune écriture ne peut l'obtenir autrement.
 */
const MOTIF = 'Les champs attendent les données : enregistrer trop tôt écraserait tout.';

function Ecran({
  charger,
  corps,
}: {
  charger: () => Promise<{ nom: string }>;
  corps: (d: { nom: string }) => void;
}) {
  // ⚠ STABLE : rendue neuve à chaque rendu, elle relancerait l'effet en boucle.
  const stable = useCallback(charger, [charger]);
  const { etat, recharger } = useFormulaireCharge(stable);
  return (
    <FormulaireCharge
      etat={etat}
      titre={<h1>Paramètres</h1>}
      motif={MOTIF}
      recharger={recharger}
    >
      {(d) => {
        corps(d);
        return (
          <form>
            <label htmlFor="nom">Nom</label>
            <input id="nom" defaultValue={d.nom} />
            <button type="submit">Enregistrer</button>
          </form>
        );
      }}
    </FormulaireCharge>
  );
}

/** Une réponse qu'on résout À LA MAIN : sans elle, les deux temps se confondent. */
function brancherEnAttente() {
  let resoudre!: (v: { nom: string }) => void;
  let rejeter!: (e: unknown) => void;
  const promesse = new Promise<{ nom: string }>((ok, ko) => {
    resoudre = ok;
    rejeter = ko;
  });
  return { charger: () => promesse, resoudre, rejeter };
}

describe('formulaire chargé', () => {
  it('⚠ AVANT les données : aucun champ, aucun bouton, et le CORPS n’est pas appelé', async () => {
    const { charger, resoudre } = brancherEnAttente();
    const corps = vi.fn();
    render(<Ecran charger={charger} corps={corps} />);

    // ⚠ L'ANCRE D'ABORD : une assertion d'absence précédée d'une attente qui se
    // résout aussitôt ne mesure rien. On attend ce qui DOIT être là.
    expect(await screen.findByRole('heading', { name: 'Paramètres' })).toBeTruthy();

    expect(corps).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Enregistrer' })).toBeNull();
    expect(screen.getByText(LIBELLES.formulaireCharge.chargement)).toBeTruthy();
    expect(screen.getByText(MOTIF)).toBeTruthy();

    resoudre({ nom: 'Université d’Exemple' });

    // APRÈS : rempli ET actif.
    const champ = (await screen.findByLabelText('Nom')) as HTMLInputElement;
    expect(champ.value).toBe('Université d’Exemple');
    const bouton = screen.getByRole('button', { name: 'Enregistrer' }) as HTMLButtonElement;
    expect(bouton.disabled).toBe(false);
    expect(corps).toHaveBeenCalledTimes(1);
  });

  it('⚠ l’échec a une SORTIE — et le corps reste non appelé', async () => {
    const { charger, rejeter } = brancherEnAttente();
    const corps = vi.fn();
    render(<Ecran charger={charger} corps={corps} />);
    await screen.findByRole('heading', { name: 'Paramètres' });

    rejeter(new Error('réseau'));

    const alerte = await screen.findByRole('alert');
    expect(alerte.textContent).toBe(LIBELLES.formulaireCharge.echec);
    expect(screen.getByRole('button', { name: LIBELLES.formulaireCharge.reessayer }).tagName).toBe(
      'BUTTON',
    );
    expect(corps).not.toHaveBeenCalled();
    // ⚠ TÉMOIN D'ABSENCE : un échec ne doit pas laisser un formulaire derrière lui.
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('⚠ le chargement n’est PAS une alerte — le rouge se dépense sur les fautes', async () => {
    const { charger } = brancherEnAttente();
    render(<Ecran charger={charger} corps={() => {}} />);
    await screen.findByRole('heading', { name: 'Paramètres' });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('⚠ le TITRE reste affiché dans les trois phases : sans lui, l’écran se lit cassé', async () => {
    const { charger, rejeter } = brancherEnAttente();
    render(<Ecran charger={charger} corps={() => {}} />);
    expect(await screen.findByRole('heading', { name: 'Paramètres' })).toBeTruthy();
    rejeter(new Error('réseau'));
    await screen.findByRole('alert');
    expect(screen.getByRole('heading', { name: 'Paramètres' })).toBeTruthy();
  });

  it('⚠ un message d’API est RELAYÉ tel quel, jamais remplacé par le générique', async () => {
    const { charger, rejeter } = brancherEnAttente();
    render(<Ecran charger={charger} corps={() => {}} />);
    await screen.findByRole('heading', { name: 'Paramètres' });
    const { ApiError } = await import('@/lib/api');
    rejeter(new ApiError(403, 'Votre rôle ne permet pas de voir ces réglages.'));
    const alerte = await screen.findByRole('alert');
    expect(alerte.textContent).toBe('Votre rôle ne permet pas de voir ces réglages.');
  });
});

describe('les textes partagés', () => {
  it('⚠ le recours NOMME un geste — « réessayez plus tard » est une attente, pas une sortie', () => {
    expect(LIBELLES.formulaireCharge.reessayer).toMatch(/réessayer/i);
    expect(LIBELLES.formulaireCharge.echec).not.toMatch(/plus tard/i);
  });
});
