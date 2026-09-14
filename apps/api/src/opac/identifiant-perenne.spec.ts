import { describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import {
  analyserIdentifiant,
  construireIdentifiant,
  localisationOai,
} from './identifiant-perenne';
import { OpacController } from './opac.controller';

/**
 * ⚠ L'IDENTIFIANT DIT *QUOI*, POUR TOUJOURS. L'URL DIT *OÙ*, AUJOURD'HUI.
 *
 * C'est la distinction que P7-2 existe pour tenir, et c'est elle qui empêche un
 * catalogue de perdre la moitié de ses liens après un déménagement de serveur.
 */

describe('⚠ Les deux contraintes du brief, tenues par la FORME', () => {
  it('il ne porte AUCUN domaine — donc il survit à un changement de domaine', () => {
    const id = construireIdentifiant('zinda', 'b1e7-uuid');
    expect(id).toBe('oai:zinda:b1e7-uuid');
    expect(id).not.toMatch(/https?:|\.bf|\.org|\./);
  });

  it('⚠ il ne porte que `BiblioRecord.id` — ni titre, ni collection, ni type', () => {
    // « Il ne change JAMAIS, même si la notice change de collection ou de
    // titre » : la seule façon de le garantir est de n'y mettre que ce qui ne
    // change pas. `BiblioRecord.id` est le docId des licences hors-ligne déjà
    // signées (I1) — il ne bouge pas, par construction.
    expect(construireIdentifiant('zinda', 'x')).toBe('oai:zinda:x');
  });

  it('la construction et l’analyse font l’aller-retour', () => {
    expect(analyserIdentifiant(construireIdentifiant('horizon', 'abc'))).toEqual({
      slug: 'horizon',
      id: 'abc',
    });
  });

  it('⚠ TÉMOIN D’ABSENCE — les formes voisines sont refusées', () => {
    // Un analyseur qui accepte tout serait indiscernable d'un analyseur juste,
    // et plus rassurant. La confusion PLAUSIBLE est celle d'un identifiant
    // tronqué ou d'un autre schéma.
    for (const mauvais of ['oai:zinda', 'zinda:abc', 'oai::abc', 'oai:zinda:', 'urn:zinda:abc', '']) {
      expect(analyserIdentifiant(mauvais), mauvais).toBeNull();
    }
  });
});

describe('⚠ La LOCALISATION est bâtie sur l’origine de l’entrepôt', () => {
  it('elle mène au résolveur, sur l’origine que le moissonneur vient d’employer', () => {
    expect(localisationOai('https://api.exemple.bf/oai', 'zinda', 'abc')).toBe(
      'https://api.exemple.bf/opac/resoudre/oai%3Azinda%3Aabc',
    );
  });

  it('⚠ elle rend `null` sur une origine illisible — pas une adresse fabriquée', () => {
    // Un lien mort publié à l'extérieur est archivé par des tiers : il ne se
    // reprend pas. Mieux vaut ne rien publier.
    expect(localisationOai('pas une url', 'zinda', 'abc')).toBeNull();
  });
});

describe('⚠ La résolution : trois refus, et ils ne se disent pas pareil', () => {
  // ⚠ LA DOUBLURE DÉCLARE SES ARGUMENTS, et ce n'est pas un détail de typage.
  // Sans cela `recordDetail.mock.calls[0][1]` est un accès hors d'un tuple
  // vide : vitest transpile et s'en moque, `tsc` refuse — et l'assertion sur
  // CE QU'ON PASSE au service ne serait pas vérifiée. Payé une fois ce soir sur
  // le moteur de moissonnage.
  function controleur(
    recordDetail = vi.fn(async (_db: unknown, _id: string, _member: boolean) => ({ id: 'abc' })),
  ) {
    const ctrl = new OpacController(
      { recordDetail } as never,
      { forTenant: vi.fn(() => ({})) } as never,
      { verify: vi.fn(() => ({ sub: 'u1', tenant: 'zinda' })) } as never,
      {} as never,
      {} as never,
      {} as never,
      { provenances: async () => ({}) } as never,
    );
    return { ctrl, recordDetail };
  }

  const tenant = { id: 't1', slug: 'zinda', name: 'Zinda' };

  it('une forme illisible dit CE QUI EST ATTENDU', async () => {
    const { ctrl } = controleur();
    await expect(ctrl.resoudre(tenant, 'n’importe quoi')).rejects.toThrow(/oai:<école>/);
  });

  it('⚠ un identifiant d’une AUTRE école dit « introuvable ici », jamais « il existe ailleurs »', async () => {
    // Le second dirait à n'importe qui ce que porte le catalogue d'un autre
    // établissement — sur une route publique, sans session.
    const { ctrl, recordDetail } = controleur();
    const promesse = ctrl.resoudre(tenant, 'oai:horizon:abc');
    await expect(promesse).rejects.toBeInstanceOf(NotFoundException);
    await expect(promesse).rejects.not.toThrow(/horizon|existe|autre établissement/i);
    // Et surtout : rien n'a été demandé à la base.
    expect(recordDetail).not.toHaveBeenCalled();
  });

  it('un identifiant de CETTE école est résolu par le même contrat que `records/:id`', async () => {
    const { ctrl, recordDetail } = controleur();
    await ctrl.resoudre(tenant, 'oai:zinda:abc');
    expect(recordDetail).toHaveBeenCalledTimes(1);
    expect(recordDetail.mock.calls[0][1]).toBe('abc');
  });
});
