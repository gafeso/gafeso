/**
 * LA DURÉE DE MISE DE CÔTÉ — servie depuis toujours, éditable nulle part.
 *
 * ⚠ CE QUE CE LOT CORRIGE. `holdPickupDays` était DÉCLARÉ dans le type de
 * `circulation-policy-settings.tsx` et lu par personne : le miroir exact d'« une
 * colonne servie que personne ne montre ». Ce qu'il gouverne n'est pas un
 * détail — c'est le délai au bout duquel une réservation disponible repart à la
 * personne suivante, c'est-à-dire la moitié « établissement » du silence que le
 * dépôt a déjà corrigé côté lecteur (l'échéance affichée sur « Mes
 * réservations », 12 septembre 2026). Le lecteur voyait la date ; personne ne
 * pouvait la choisir.
 *
 * ⚠ ET L'INTRODUCTION DE L'ÉCRAN ANNONÇAIT QUATRE GRANDEURS QU'IL NE PORTE PAS.
 * Mesuré le 16 septembre : « durée d'un prêt, plafond d'emprunts, amende
 * journalière, par catégorie et par type » vivent sur `CirculationRule`, dont
 * les quatre routes `/circulation/rules` ne sont appelées par AUCUN écran
 * (backlog n° 46). Le texte a été REMPLACÉ, pas complété — ajouter la vérité à
 * côté du faux laisse le lecteur croire la première phrase.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CirculationPolicySettings } from '@/components/circulation-policy-settings';
import { LIBELLES } from '@/lib/libelles';
import { fermerSession, ouvrirSession } from './aide-session';

const T = LIBELLES.reglesDePret;

const POLITIQUE = {
  onlineRenewalEnabled: true,
  onlineRenewalMax: 2,
  onlineRenewalDays: 14,
  onlineRenewalRefuseOverdue: true,
  holdPickupDays: 5,
};

let envois: { url: string; corps: unknown }[] = [];

beforeEach(() => {
  envois = [];
  ouvrirSession();
  vi.stubGlobal('fetch', (entree: RequestInfo | URL, init?: RequestInit) => {
    const url = String(entree);
    if (!url.includes('/circulation-policy')) {
      // Un repli discret ferait passer un oubli de doublure pour un défaut du
      // produit. On échoue là où c'est vrai.
      return Promise.reject(new Error(`requête non couverte — ${url}`));
    }
    if (init?.method === 'PATCH') {
      envois.push({ url, corps: JSON.parse(String(init.body)) });
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response);
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(POLITIQUE),
    } as Response);
  });
});

afterEach(() => {
  fermerSession();
  vi.unstubAllGlobals();
});

describe('Règles de prêt — la durée de mise de côté', () => {
  it('la valeur SERVIE est affichée, pas un défaut d’écran', async () => {
    render(<CirculationPolicySettings />);
    const champ = (await screen.findByLabelText(new RegExp(T.miseDeCoteTitre.slice(0, 30)))) as HTMLInputElement;
    // 5 vient de l'API. Un écran qui afficherait 7 (le défaut du serveur)
    // montrerait une valeur que l'établissement n'a pas choisie.
    expect(champ.value).toBe('5');
  });

  it('elle part dans l’enregistrement — sinon le champ est décoratif', async () => {
    render(<CirculationPolicySettings />);
    const champ = (await screen.findByLabelText(new RegExp(T.miseDeCoteTitre.slice(0, 30)))) as HTMLInputElement;
    fireEvent.change(champ, { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer/ }));
    await waitFor(() => expect(envois).toHaveLength(1));
    expect((envois[0].corps as Record<string, unknown>).holdPickupDays).toBe(12);
  });

  it('l’aide dit ce qui se passe quand le délai EXPIRE', async () => {
    render(<CirculationPolicySettings />);
    expect(await screen.findByText(T.miseDeCoteAide)).toBeTruthy();
  });
});

describe('L’introduction ne décrit que ce que l’écran porte', () => {
  // Un test qui restate la constante suivrait sa dégradation sans broncher :
  // ce qu'on affirme ici, c'est la PROPRIÉTÉ du texte.
  it('elle ne promet plus les grandeurs qui vivent sur CirculationRule', () => {
    expect(T.introduction).not.toMatch(/durée d’un prêt|plafond d’emprunts|amende/i);
    expect(T.introduction).not.toMatch(/catégorie d’adhérent|type de document/i);
  });

  it('⚠ et elle ne date pas sa propre péremption', () => {
    // « pas encore », « bientôt » : un libellé qui annonce un état du produit
    // survit à sa cause. Celui-ci décrit ce que l'écran FAIT.
    expect(T.introduction).not.toMatch(/pas encore|bientôt|prochainement|à venir/i);
  });

  it('elle nomme les deux choses qui sont réellement ici', () => {
    expect(T.introduction).toMatch(/renouvellement en ligne/i);
    expect(T.introduction).toMatch(/mise de côté|réservation/i);
  });
});
