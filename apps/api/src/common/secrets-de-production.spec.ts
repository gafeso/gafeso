/**
 * LE REFUS DES SECRETS FAIBLES — et l'obligation qui l'empêche de vieillir.
 *
 * ⚠ Il couvrait DEUX secrets sur six. La liste est désormais déclarée, et ce
 * fichier refuse qu'un secret de `.env.prod.example` lui échappe : c'est le seul
 * moment où quelqu'un se posera la question.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MARQUEURS_DEXEMPLE,
  SECRETS_DE_PRODUCTION,
  motifDeRefus,
  refusDesSecrets,
} from './secrets-de-production';

const RACINE = join(__dirname, '..', '..', '..', '..');

/** Les variables de `.env.prod.example` qui ont l'allure d'un secret. */
function secretsDeLExemple(): string[] {
  const src = readFileSync(join(RACINE, '.env.prod.example'), 'utf-8');
  return [...src.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)]
    .map((m) => m[1])
    // ⚠ `PASS` ET NON `PASSWORD` : mon premier motif cherchait `PASSWORD`, et il
    // ne voyait donc pas `SMTP_PASS`. Un secret que cette obligation ne voit pas
    // est un secret que personne ne classe — c'est l'instrument qui aurait rendu
    // l'obligation creuse, pas la liste.
    .filter((v) => /SECRET|PASS|KEY|KEK|TOKEN/.test(v))
    // ⚠ Les clés PUBLIQUES et les URL n'en sont pas : une clé publique est faite
    // pour être lue, et `DATABASE_URL` porte le mot de passe déjà contrôlé par
    // POSTGRES_PASSWORD — le contraindre deux fois ferait refuser une URL
    // légitime pour une raison déjà dite.
    .filter((v) => !/PUBLIC|_URL$/.test(v));
}

describe("L'instrument, avant ce qu'il mesure", () => {
  it('⚠ il trouve des secrets dans l’exemple — sinon l’obligation est vide', () => {
    expect(secretsDeLExemple().length).toBeGreaterThan(3);
  });

  it('⚠ TÉMOIN NOMMÉ : il voit `SMTP_PASS`, qu’il a failli manquer', () => {
    // Le motif cherchait `PASSWORD` : `SMTP_PASS` lui échappait. Ce cas est le
    // seul qui empêche la régression — un relevé qui ne voit pas une variable
    // rend une obligation VERTE sur une population amputée.
    expect(secretsDeLExemple()).toContain('SMTP_PASS');
  });

  it('témoin d’ABSENCE : il ne compte pas une clé PUBLIQUE ni une URL', () => {
    // La confusion plausible : `OFFLINE_LICENSE_PUBLIC_KEY` contient « KEY » et
    // n'est pas un secret — la contraindre ferait refuser une valeur juste.
    const v = secretsDeLExemple();
    expect(v.filter((x) => x.includes('PUBLIC'))).toEqual([]);
    expect(v.filter((x) => x.endsWith('_URL'))).toEqual([]);
  });
});

describe('⚠ L’OBLIGATION : tout secret de l’exemple est déclaré, ou exclu avec son motif', () => {
  /**
   * Secrets de `.env.prod.example` délibérément HORS de la liste de refus.
   *
   * ⚠ Chacun porte son motif, et le test refuse une exclusion devenue périmée.
   */
  const EXCLUS: Record<string, string> = {
    OFFLINE_LICENSE_PRIVATE_KEY:
      'contrôlée par `OfflineKeysService`, qui vérifie le TYPE de clé (ed25519) ' +
      'et refuse de démarrer sans elle. Une longueur minimale ne dirait rien ' +
      'd’une clé PEM — c’est sa forme qui compte, pas sa taille.',
    SMTP_PASS:
      'optionnel par construction : sans SMTP, le produit RAPPORTE qu’il n’a pas ' +
      'pu envoyer plutôt que de prétendre l’avoir fait. Le refuser interdirait ' +
      'une installation sans courriel, qui est un cas légitime.',
  };

  it('aucun secret de l’exemple n’est oublié', () => {
    const declares = new Set(SECRETS_DE_PRODUCTION.map((s) => s.variable));
    const orphelins = secretsDeLExemple().filter(
      (v) => !declares.has(v) && !(v in EXCLUS),
    );
    expect(
      orphelins,
      'Secret(s) de `.env.prod.example` que rien ne contrôle au démarrage.\n' +
        'DEUX ISSUES :\n' +
        '  · il doit être fort → ajoutez-le à SECRETS_DE_PRODUCTION, avec son ENJEU ;\n' +
        '  · il est contrôlé ailleurs ou optionnel → EXCLUS, avec son motif.\n' +
        '⚠ Ne le laissez pas : copier l’exemple tel quel ferait du marqueur ' +
        '« À REMPLIR » la clé réelle, publiée dans notre dépôt.',
    ).toEqual([]);
  });

  it('⚠ une exclusion PÉRIMÉE est refusée', () => {
    const presents = new Set(secretsDeLExemple());
    expect(
      Object.keys(EXCLUS).filter((v) => !presents.has(v)),
      'Exclusion(s) qui ne correspondent plus à une variable de l’exemple.',
    ).toEqual([]);
  });

  it('chaque secret déclaré porte un ENJEU qui dit ce qu’un attaquant obtient', () => {
    for (const s of SECRETS_DE_PRODUCTION) {
      expect(s.enjeu.length, s.variable).toBeGreaterThan(30);
      expect(s.minimum, s.variable).toBeGreaterThanOrEqual(16);
    }
  });
});

describe('⭐ LE REFUS MORD — sur chaque forme de faiblesse', () => {
  const JWT = SECRETS_DE_PRODUCTION.find((s) => s.variable === 'JWT_SECRET')!;

  it('une valeur VIDE est refusée', () => {
    expect(motifDeRefus(JWT, '')).toMatch(/VIDE/);
    expect(motifDeRefus(JWT, undefined)).toMatch(/VIDE/);
  });

  it('⭐ un MARQUEUR d’exemple est refusé — le pire cas', () => {
    // C'est la valeur qu'une copie de `.env.prod.example` produit, et elle est
    // PUBLIÉE : pire qu'une valeur faible, parce qu'elle n'est pas à devigner.
    for (const m of MARQUEURS_DEXEMPLE) {
      const valeur = `${m}${'x'.repeat(60)}`;
      expect(motifDeRefus(JWT, valeur), `« ${m} » doit être refusé`).toMatch(/EXEMPLE/);
    }
  });

  it('une valeur trop COURTE est refusée, avec sa longueur', () => {
    const m = motifDeRefus(JWT, 'abc');
    expect(m).toMatch(/3 caractères/);
    expect(m).toMatch(/32 au minimum/);
  });

  it('⚠ et le message dit ce qu’un attaquant OBTIENT', () => {
    // Un refus qui dit « trop court » fait rallonger la chaîne. Un refus qui dit
    // « signer une session de n’importe quel compte » fait comprendre pourquoi.
    expect(motifDeRefus(JWT, 'abc')).toMatch(/signer une session/);
  });

  it('témoin POSITIF : une valeur forte passe', () => {
    // Sans ce cas, tout ce qui précède serait satisfait par un refus universel —
    // et aucune instance ne démarrerait.
    expect(motifDeRefus(JWT, 'K7-x'.repeat(12))).toBeNull();
  });

  it('⚠ `ADMIN_API_KEY` VIDE est autorisée — désactiver est un choix', () => {
    const admin = SECRETS_DE_PRODUCTION.find((s) => s.variable === 'ADMIN_API_KEY')!;
    expect(admin.videAutorise).toBe(true);
    expect(motifDeRefus(admin, '')).toBeNull();
    // Mais une valeur PRÉSENTE et faible reste refusée.
    expect(motifDeRefus(admin, 'dev_admin_key_local')).toMatch(/EXEMPLE/);
  });

  it('⭐ `refusDesSecrets` rend TOUS les motifs, jamais le premier', () => {
    // Un opérateur qui corrige, relance, obtient un second refus, corrige,
    // relance… abandonne au troisième passage. Dire les six d'un coup est la
    // différence entre une procédure et une épreuve.
    const tout = refusDesSecrets(() => 'change_me');
    // ⚠ Le message va sur `expect`, pas sur `toBe` : `toBe` ne prend qu'un
    // argument, et `tsc` l'a dit — pas vitest, qui transpile sans broncher.
    expect(tout.length, 'chaque secret faible doit produire SON motif').toBe(
      SECRETS_DE_PRODUCTION.length,
    );
  });

  it('témoin POSITIF global : six valeurs fortes ne produisent AUCUN refus', () => {
    expect(refusDesSecrets(() => 'Z'.repeat(64))).toEqual([]);
  });
});
