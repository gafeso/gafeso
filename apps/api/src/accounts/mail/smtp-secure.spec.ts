import { describe, expect, it } from 'vitest';
import { resolveSmtpSecure } from './mail.service';

describe('resolveSmtpSecure — TLS implicite ou STARTTLS', () => {
  it('déduit du port quand la valeur est absente', () => {
    expect(resolveSmtpSecure(undefined, 465)).toBe(true); // TLS implicite
    expect(resolveSmtpSecure(undefined, 587)).toBe(false); // STARTTLS
    expect(resolveSmtpSecure(undefined, 25)).toBe(false);
    expect(resolveSmtpSecure(undefined, 2525)).toBe(false);
  });

  it('déduit aussi quand la valeur est vide (défaut des fichiers .env)', () => {
    expect(resolveSmtpSecure('', 465)).toBe(true);
    expect(resolveSmtpSecure('', 587)).toBe(false);
  });

  it('RÉGRESSION : 587 ne doit PAS être en TLS implicite par défaut', () => {
    // C'était le défaut historique (SMTP_SECURE=true) : sur 587, le serveur
    // attend du clair puis STARTTLS. La poignée de main échouait, aucun mail
    // ne partait — alors que le port répondait et que l'interface annonçait
    // « email envoyé ».
    expect(resolveSmtpSecure(undefined, 587)).toBe(false);
  });

  it('une valeur explicite reste prioritaire (serveurs exotiques)', () => {
    expect(resolveSmtpSecure('true', 587)).toBe(true);
    expect(resolveSmtpSecure('false', 465)).toBe(false);
  });

  it('ignore une valeur non reconnue et retombe sur la déduction', () => {
    expect(resolveSmtpSecure('oui', 465)).toBe(true);
    expect(resolveSmtpSecure('1', 587)).toBe(false);
  });
});
