import { NextResponse } from 'next/server';
import { apiUrl } from '@/lib/server-api';

/**
 * Descripteur de connexion, servi par le DOMAINE DE L'ÉTABLISSEMENT.
 *
 * L'application mobile scanne `https://<domaine>/e/<slug>` puis vient chercher
 * ici l'adresse publique de l'API. C'est ce détour qui permet au QR de ne pas
 * porter cette adresse : une affiche imprimée est un objet physique qui survit
 * à la configuration, et graver l'API dedans condamnerait tout le papier du
 * bâtiment le jour d'une migration de serveur.
 *
 * Il DOIT être servi par l'origine que le QR fait ouvrir : au moment où
 * l'application vient le lire, l'origine scannée est la seule chose qu'elle
 * connaisse. Le servir sur le domaine de l'API supposerait résolu le problème
 * qu'il est censé résoudre.
 *
 * Le contenu vient de l'API (`GET /tenancy/descriptor`), qui résout
 * l'établissement depuis le Host — cette route n'est qu'un relais d'origine.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const host = request.headers.get('host') ?? '';
  try {
    const res = await fetch(`${apiUrl()}/tenancy/descriptor`, {
      // Le Host porte l'identité de l'établissement : sans lui l'API ne peut
      // pas savoir de quelle école il s'agit.
      headers: { host, 'x-forwarded-host': host },
      cache: 'no-store',
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: 'Descripteur indisponible pour ce domaine.' },
        { status: res.status === 400 ? 404 : 502 },
      );
    }
    return NextResponse.json(await res.json(), {
      headers: {
        'Content-Type': 'application/json',
        // Court, mais non nul : ce document change lors d'une migration
        // d'infrastructure, et c'est précisément le moment où un cache long
        // ferait échouer les inscriptions sans qu'on comprenne pourquoi.
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch {
    return NextResponse.json({ error: 'API injoignable.' }, { status: 502 });
  }
}
