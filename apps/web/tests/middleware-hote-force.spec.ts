import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '../middleware';

/**
 * ⭐ REFUS D'UN HOST FORGÉ — posé le 19 octobre 2026, après avoir mesuré que
 * ce fichier recopiait aveuglément le Host reçu dans `x-forwarded-host`, sans
 * jamais le valider. Voir le commentaire au-dessus de `middleware()`.
 *
 * ⚠ TÉMOIN NÉGATIF requis par ce dépôt : sans la vérification, ce test tombe
 * — vérifié en retirant temporairement le bloc `if (attendu && ...)`.
 */
describe('middleware — un Host qui ne correspond pas à APP_URL est refusé', () => {
  const requete = (host: string) =>
    new NextRequest(`http://${host}/`, { headers: { host } });

  it('⚠ Host FORGÉ, différent de APP_URL : refusé (400)', () => {
    process.env.APP_URL = 'http://public.audit.test';
    const res = middleware(requete('ecole-victime.exemple.test'));
    expect(res?.status).toBe(400);
  });

  it('Host égal à APP_URL : laissé passer (pas de 400)', () => {
    process.env.APP_URL = 'http://public.audit.test';
    const res = middleware(requete('public.audit.test'));
    expect(res?.status).not.toBe(400);
  });

  it('Host égal à APP_URL, avec un port explicite : laissé passer', () => {
    process.env.APP_URL = 'http://public.audit.test';
    const res = middleware(requete('public.audit.test:3000'));
    expect(res?.status).not.toBe(400);
  });
});
