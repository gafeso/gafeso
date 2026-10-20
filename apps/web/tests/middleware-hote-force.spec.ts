import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '../middleware';

/**
 * ⭐ REFUS D'UN HOST FORGÉ — posé le 19 octobre 2026, étendu le 20 octobre
 * 2026 pour accepter un domaine d'établissement déclaré en base (table
 * `domains`), pas seulement `APP_URL`. Voir le commentaire au-dessus de
 * `hoteValide()` et `middleware()`.
 *
 * ⚠ TÉMOIN NÉGATIF requis par ce dépôt : sans la vérification, ces tests
 * tombent — vérifié en retirant temporairement le bloc
 * `if (hoteSansPort && !(await hoteValide(...)))`.
 */
describe('middleware — un Host qui ne correspond pas à APP_URL est refusé, sauf si l’API le reconnaît', () => {
  const requete = (host: string) => new NextRequest(`http://${host}/`, { headers: { host } });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('⚠ Host FORGÉ, inconnu de l’API : refusé (400), sans jamais atteindre web', async () => {
    process.env.APP_URL = 'http://public.audit.test';
    const fetchSimule = vi.fn().mockResolvedValue(new Response(null, { status: 400 }));
    vi.stubGlobal('fetch', fetchSimule);
    const res = await middleware(requete('ecole-victime.exemple.test'));
    expect(res?.status).toBe(400);
    expect(fetchSimule).toHaveBeenCalledOnce();
  });

  it('Host égal à APP_URL : laissé passer SANS interroger l’API (chemin rapide)', async () => {
    process.env.APP_URL = 'http://public.audit.test';
    const fetchSimule = vi.fn();
    vi.stubGlobal('fetch', fetchSimule);
    const res = await middleware(requete('public.audit.test'));
    expect(res?.status).not.toBe(400);
    expect(fetchSimule).not.toHaveBeenCalled();
  });

  it('Host égal à APP_URL, avec un port explicite : laissé passer', async () => {
    process.env.APP_URL = 'http://public.audit.test';
    const fetchSimule = vi.fn();
    vi.stubGlobal('fetch', fetchSimule);
    const res = await middleware(requete('public.audit.test:3000'));
    expect(res?.status).not.toBe(400);
    expect(fetchSimule).not.toHaveBeenCalled();
  });

  it('⭐ Host différent de APP_URL, mais DÉCLARÉ en base (table domains) : laissé passer', async () => {
    process.env.APP_URL = 'http://public.audit.test';
    const fetchSimule = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchSimule);
    const res = await middleware(requete('ecole-partenaire.exemple.bf'));
    expect(res?.status).not.toBe(400);
    expect(fetchSimule).toHaveBeenCalledOnce();
    const [, options] = fetchSimule.mock.calls[0];
    expect((options?.headers as Record<string, string>)?.['x-forwarded-host']).toBe(
      'ecole-partenaire.exemple.bf',
    );
  });

  it('⚠ API injoignable (panne) sur un Host différent de APP_URL : refusé — on ne laisse PAS passer une panne', async () => {
    process.env.APP_URL = 'http://public.audit.test';
    const fetchSimule = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    vi.stubGlobal('fetch', fetchSimule);
    const res = await middleware(requete('ecole-partenaire.exemple.bf'));
    expect(res?.status).toBe(400);
  });
});
