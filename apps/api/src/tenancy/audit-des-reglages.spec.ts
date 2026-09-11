import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * TOUT CHAMP ÉCRIT PAR `PATCH /tenancy/settings` LAISSE UNE TRACE.
 *
 * ⚠ POURQUOI CE TEST PLUTÔT QU'UNE RELECTURE. La route écrit six champs et son
 * journal n'en traçait que trois : `require2fa` — le réglage qui IMPOSE la
 * double authentification aux comptes privilégiés de l'école — et
 * `latticeEnabled` ne laissaient aucune trace. Désactiver la 2FA était donc
 * sans auteur, sans date et sans action consultable.
 *
 * Une permission mal placée se resserre, et le défaut disparaît. Une absence de
 * trace ne se rattrape JAMAIS : les changements déjà survenus resteront
 * invisibles pour toujours. C'est ce qui fait de ce test un garde-fou et non un
 * confort — il porte l'invariant « le journal suit le DTO », pas les six cas
 * connus d'aujourd'hui.
 */

/**
 * Ce que chaque champ du DTO laisse comme trace. La clé est le champ, la valeur
 * la clé de métadonnée (ou le nom de l'action) qui le consigne.
 *
 * ⚠ Ajouter un champ au DTO SANS l'inscrire ici fait échouer le test. C'est
 * voulu : c'est le seul moment où quelqu'un se demandera si son nouveau réglage
 * mérite une trace.
 */
const TRACE_ATTENDUE: Record<string, string> = {
  primaryColor: 'changedColors',
  secondaryColor: 'changedColors',
  themeTokens: 'changedTheme',
  latticeEnabled: 'changedLattice',
  homepageContent: 'changedHomepage',
};

/**
 * Les champs encore DÉCLARÉS par le DTO mais REFUSÉS — ils ont déménagé.
 *
 * Ils n'ont pas de trace à vérifier ici : cette route ne les écrit plus. Ce
 * qu'on vérifie d'eux, c'est que le refus NOMME leur nouvelle route.
 */
const CHAMPS_DEPLACES: Record<string, string> = {
  require2fa: 'PATCH /auth/policy',
};

const DTO = readFileSync(
  join(__dirname, 'dto/update-tenant-settings.dto.ts'),
  'utf-8',
);
const CONTROLEUR = readFileSync(join(__dirname, 'tenancy.controller.ts'), 'utf-8');

/** Les champs réellement déclarés par le DTO. */
function champsDuDto(): string[] {
  const corps = DTO.slice(DTO.indexOf('export class UpdateTenantSettingsDto'));
  return [...corps.matchAll(/^\s{2}(\w+)\?:/gm)].map((m) => m[1]);
}

describe('audit des réglages de l’école', () => {
  const champs = champsDuDto();

  it('le relevé lit bien le DTO (témoin de compte)', () => {
    // Six champs aujourd'hui. Un compte exact, et non « au moins un » : c'est
    // ce qui signale un champ ajouté dont personne n'aurait parlé.
    expect(champs.length).toBe(6);
    expect(champs).toContain('require2fa'); // le champ qui a motivé le lot
  });

  it('⚠ CHAQUE champ du DTO est SOIT tracé, SOIT déclaré déplacé', () => {
    const orphelins = champs.filter(
      (c) => !(c in TRACE_ATTENDUE) && !(c in CHAMPS_DEPLACES),
    );
    expect(orphelins, 'champs sans trace ni déplacement déclaré').toEqual([]);
  });

  it('⚠ un champ DÉPLACÉ est refusé, et le refus NOMME sa nouvelle route', () => {
    // Un 400 muet enverrait la bibliothécaire chercher ce qu'elle a mal fait,
    // alors que le réglage existe toujours — ailleurs.
    const validateur = readFileSync(
      join(__dirname, 'dto/reglage-deplace.validator.ts'),
      'utf-8',
    );
    for (const [champ, route] of Object.entries(CHAMPS_DEPLACES)) {
      expect(DTO, champ).toContain('@Validate(ReglageDeplace)');
      expect(validateur, `${champ} → ${route}`).toContain(route);
    }
    // Et le service ne doit plus l'écrire du tout.
    const service = readFileSync(join(__dirname, 'tenancy.service.ts'), 'utf-8');
    for (const champ of Object.keys(CHAMPS_DEPLACES)) {
      expect(service, `${champ} encore écrit par le service`).not.toContain(
        `dto.${champ}`,
      );
    }
  });

  it('⚠ CHAQUE trace déclarée est réellement consignée par le contrôleur', () => {
    // La déclaration ci-dessus ne vaut rien si le contrôleur ne l'écrit pas :
    // ce serait un relevé qui se vérifie lui-même.
    const manquantes = [...new Set(Object.values(TRACE_ATTENDUE))].filter(
      (cle) => !CONTROLEUR.includes(`${cle}:`),
    );
    expect(manquantes, 'traces déclarées mais absentes du contrôleur').toEqual([]);
  });

  it('le réglage de SÉCURITÉ est tracé LÀ OÙ IL EST MAINTENANT ÉCRIT', () => {
    // Consigné sous « Modification de la page d'accueil », un changement de
    // politique de 2FA serait introuvable : le journal se consulte par action.
    const auth = readFileSync(join(__dirname, '../auth/auth.controller.ts'), 'utf-8');
    expect(auth).toContain('AUDIT_ACTIONS.TENANT_2FA_POLICY_UPDATE');
    // La VALEUR et pas seulement le fait : savoir que la politique a bougé ne
    // dit pas dans quel sens, et c'est le sens qui compte.
    expect(auth).toContain('metadata: { require2fa: dto.require2fa }');
    // Et la route est gardée par la fonction de sécurité, pas par l'apparence.
    expect(auth).toContain('FONCTIONS.SECURITE_AUTHENTIFICATION');
    // ⚠ L'ancienne route ne doit plus le tracer, parce qu'elle ne l'écrit plus.
    expect(CONTROLEUR).not.toContain('TENANT_2FA_POLICY_UPDATE');
  });

  it('ni les traces ni les déplacements ne portent de champ disparu du DTO', () => {
    const perimees = [...Object.keys(TRACE_ATTENDUE), ...Object.keys(CHAMPS_DEPLACES)]
      .filter((c) => !champs.includes(c));
    expect(perimees, 'déclarations pour un champ qui n’existe plus').toEqual([]);
  });
});
