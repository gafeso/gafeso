/** @type {import('next').NextConfig} */
const API_URL = process.env.API_URL ?? 'http://localhost:4000';

const nextConfig = {
  // Image de production autonome (apps/web/.next/standalone) : ne copie que
  // les node_modules réellement utilisés, calculés par traçage — bien plus
  // léger qu'embarquer node_modules complet dans l'image Docker.
  output: 'standalone',
  // Désactivé : react-reader/epub.js (lecteur EPUB, voir components/epub-reader.tsx)
  // ne survit pas au montage/démontage/remontage délibéré du Strict Mode en dev
  // — sa Rendition interne reste bloquée indéfiniment (confirmé : book/archive/
  // spine s'ouvrent normalement, mais rendition.manager n'est jamais créé, la
  // queue de rendu ne se vide jamais, display() ne se résout ni n'échoue). Ça
  // n'affecte QUE le dev : React ne double-invoque pas les effets en production.
  reactStrictMode: false,
  // Le front appelle /api/* en same-origin ; Next proxifie vers l'API NestJS.
  // Ce hop remplace le Host par celui de la destination (ex. "api" en
  // production) — middleware.ts transmet donc le VRAI domaine public dans
  // x-forwarded-host, lu en priorité par TenantMiddleware côté API (voir
  // apps/api/src/tenancy/tenant.middleware.ts). En dev, ce domaine reste
  // « localhost » (Host du navigateur vers http://localhost:3000) → le
  // domaine « localhost » doit être enregistré pour l'école de dev.
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${API_URL}/:path*`,
      },
    ];
  },
};

export default nextConfig;
