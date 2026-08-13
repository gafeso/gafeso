import { describe, expect, it } from 'vitest';
import { normalizeObjectKey, rewriteToPublicOrigin } from './storage.service';

describe('rewriteToPublicOrigin', () => {
  it('remplace le schéma/hôte/port interne par l’hôte public, en HTTPS', () => {
    const signed =
      'http://minio:9000/digital-copies/rec-1/these.pdf' +
      '?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=abc123&X-Amz-Expires=900';

    const rewritten = rewriteToPublicOrigin(signed, 'https://storage.bibliotheque.exemple.bf');

    expect(rewritten).toBe(
      'https://storage.bibliotheque.exemple.bf/digital-copies/rec-1/these.pdf' +
        '?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=abc123&X-Amz-Expires=900',
    );
  });

  it('conserve le chemin ET la totalité de la query string de signature', () => {
    const signed =
      'http://minio:9000/digital-copies/91f5/1783550226722-test.pdf' +
      '?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD' +
      '&X-Amz-Credential=gafeso%2F20260709%2Fus-east-1%2Fs3%2Faws4_request' +
      '&X-Amz-Date=20260709T000000Z&X-Amz-Expires=7200&X-Amz-SignedHeaders=host' +
      '&X-Amz-Signature=deadbeef' +
      '&response-content-disposition=inline%3B%20filename%3D%22test.pdf%22';

    const rewritten = rewriteToPublicOrigin(signed, 'https://storage.bibliotheque.exemple.bf');
    const rewrittenUrl = new URL(rewritten);
    const signedUrl = new URL(signed);

    expect(rewrittenUrl.pathname).toBe(signedUrl.pathname);
    expect(rewrittenUrl.search).toBe(signedUrl.search);
    expect(rewrittenUrl.protocol).toBe('https:');
    expect(rewrittenUrl.host).toBe('storage.bibliotheque.exemple.bf');
  });

  it('reste inoffensif en dev (hôte public = hôte interne, ex. localhost:9000)', () => {
    const signed = 'http://localhost:9000/covers/rec-1.jpg?X-Amz-Signature=xyz';
    const rewritten = rewriteToPublicOrigin(signed, 'http://localhost:9000');
    expect(rewritten).toBe(signed);
  });

  it('gère un hôte public avec port explicite', () => {
    const signed = 'http://minio:9000/digital-copies/x?X-Amz-Signature=abc';
    const rewritten = rewriteToPublicOrigin(signed, 'https://storage.example.org:8443');
    expect(rewritten).toBe('https://storage.example.org:8443/digital-copies/x?X-Amz-Signature=abc');
  });

  it("ne double PAS le bucket même si MINIO_PUBLIC_URL porte un chemin par erreur de configuration", () => {
    // Hypothèse de cause envisagée pour le bug « digital-copies/digital-copies »
    // en production : écartée ici, la fonction ne réécrit que schéma/hôte/port,
    // jamais le chemin de MINIO_PUBLIC_URL.
    const signed = 'http://minio:9000/digital-copies/rec-1/fichier.pdf?X-Amz-Signature=abc';
    const rewritten = rewriteToPublicOrigin(
      signed,
      'https://storage.bibliotheque.exemple.bf/digital-copies',
    );
    expect(rewritten).toBe(
      'https://storage.bibliotheque.exemple.bf/digital-copies/rec-1/fichier.pdf?X-Amz-Signature=abc',
    );
  });
});

describe('normalizeObjectKey', () => {
  it('laisse une clé normale inchangée', () => {
    expect(normalizeObjectKey('digital-copies', 'rec-1/1783554370533-these.pdf')).toBe(
      'rec-1/1783554370533-these.pdf',
    );
  });

  it('retire un préfixe accidentel du nom de bucket (bug reproduit en production)', () => {
    // Cause exacte du fichier réel cassé en production : objectKey stocké
    // en base avec le nom du bucket en préfixe. Avec forcePathStyle, Bucket
    // + Key non normalisée donnait "/digital-copies/digital-copies/...".
    expect(
      normalizeObjectKey('digital-copies', 'digital-copies/4a4859f4/1783554370533-199.pdf'),
    ).toBe('4a4859f4/1783554370533-199.pdf');
  });

  it('ne retire pas un segment qui ressemble au bucket sans être un préfixe exact', () => {
    // "digital-copies-archive/..." ne doit pas être tronqué en "archive/..."
    expect(normalizeObjectKey('digital-copies', 'digital-copies-archive/x.pdf')).toBe(
      'digital-copies-archive/x.pdf',
    );
  });

  it('ne retire le préfixe qu’une seule fois (pas de retrait récursif)', () => {
    expect(
      normalizeObjectKey(
        'digital-copies',
        'digital-copies/digital-copies/rec-1/fichier.pdf',
      ),
    ).toBe('digital-copies/rec-1/fichier.pdf');
  });
});
