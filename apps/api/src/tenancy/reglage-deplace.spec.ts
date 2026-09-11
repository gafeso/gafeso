import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateTenantSettingsDto } from './dto/update-tenant-settings.dto';

/**
 * LE REFUS DE `require2fa` SUR LA ROUTE D'APPARENCE — ÉPROUVÉ, PAS DÉDUIT.
 *
 * ⚠ POURQUOI CE TEST EXISTE. Ce dépôt a déjà payé une fois le piège exact que
 * cette construction frôle : un `@Validate(...)` posé sur un champ
 * `@IsOptional()` ne se déclenche PAS quand le champ est absent —
 * class-validator saute tous les validateurs d'une propriété absente. La
 * première victime (`CarteIdentifiable` sur `patrons`) existait et ne gardait
 * rien, précisément dans le seul cas pour lequel elle avait été écrite.
 *
 * Ici la combinaison est juste — on VEUT que le refus ne se déclenche que si le
 * champ est envoyé — mais « juste selon mon raisonnement » n'est pas une
 * preuve. Les deux cas sont donc exercés pour de vrai.
 */
const valider = (brut: Record<string, unknown>) =>
  validate(plainToInstance(UpdateTenantSettingsDto, brut) as object);

describe('réglage déplacé — PATCH /tenancy/settings', () => {
  it('⚠ REFUSE `require2fa`, dans les deux sens', async () => {
    for (const valeur of [true, false]) {
      const erreurs = await valider({ require2fa: valeur });
      expect(erreurs, `require2fa: ${valeur}`).toHaveLength(1);
      expect(erreurs[0].property).toBe('require2fa');
    }
  });

  it('le message NOMME la nouvelle route et la fonction requise', async () => {
    const erreurs = await valider({ require2fa: false });
    const message = Object.values(erreurs[0].constraints ?? {}).join(' ');
    expect(message).toContain('PATCH /auth/policy');
    expect(message).toContain('securite.authentification');
  });

  it('⚠ n’empêche PAS un réglage d’apparence légitime', async () => {
    // Le contrôle qui rattrape un refus trop large : si le validateur se
    // déclenchait sur une propriété absente, toute modification de couleur
    // serait refusée — et l'écran d'apparence entier tomberait.
    expect(await valider({ primaryColor: '#0F2B46' })).toHaveLength(0);
    expect(await valider({ latticeEnabled: true })).toHaveLength(0);
    expect(await valider({})).toHaveLength(0);
  });

  it('refuse `require2fa` même accompagné d’un réglage légitime', async () => {
    // Le cas réel d'une régression : un formulaire qui renvoie tout son état.
    const erreurs = await valider({ primaryColor: '#0F2B46', require2fa: false });
    expect(erreurs.map((e) => e.property)).toEqual(['require2fa']);
  });
});
