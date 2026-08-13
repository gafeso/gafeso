'use client';

// Constellation des savoirs — section animée de la page d'accueil vitrine.
// SVG orbital : hub central au nom de l'école, un nœud par domaine du
// catalogue, liaisons et anneaux animés (classes bc-* définies dans
// globals.css, désactivées si prefers-reduced-motion).
//
// Données passées en PROPS depuis le rendu serveur (lib/server-api →
// fetchConstellation) : catégories réelles du tenant ayant ≥1 ressource, avec
// compteur. Rendu déterministe (étoiles pseudo-aléatoires stables, géométrie
// dérivée des props) → l'HTML SSR correspond à l'hydratation, aucun flash.
//
// Thème : toutes les couleurs proviennent des variables CSS du tenant
// (--primary-dark, --accent, --highlight, --surface…), héritées du conteneur
// vitrine. Aucune couleur de marque en dur.
//
// Responsive / lisibilité : sur mobile (≤560px) ou quand l'orbite serait trop
// dense (beaucoup de domaines), on bascule sur une grille de cercles — pas de
// chevauchement. Chaque domaine reste un lien accessible dans les deux cas.

import styles from '@/app/home.module.css';

interface Domain {
  category: string;
  count: number;
}

// Pictogrammes par domaine (tracés SVG) — la couleur vient du thème.
const ICONS: Record<string, string> = {
  book: 'M2 4h7a3 3 0 0 1 3 3v13a3 3 0 0 0-3-3H2zM22 4h-7a3 3 0 0 0-3 3v13a3 3 0 0 1 3-3h7z',
  droit: 'M12 3v18M8 21h8M5 7h14M5 7l-2.5 5a3 3 0 0 0 5.5 0L5.5 7M18.5 7 16 12a3 3 0 0 0 5.5 0L19 7',
  medecine: 'M12 6v12M6 12h12M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  informatique: 'm16 18 6-6-6-6M8 6l-6 6 6 6',
  sciences: 'M9 3v6l-5 10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2L15 9V3M8 3h8M7 15h10',
  histoire: 'M3 21h18M5 21v-11M9.5 21v-11M14.5 21v-11M19 21v-11M3 10l9-6 9 6z',
  economie: 'M3 21h18M7 17v-6M12 17V7M17 17v-9M14 8l3-3 3 3',
  arts: 'M18 3l3 3-9.5 9.5-4.5 1.5 1.5-4.5zM15 6l3 3',
  langues: 'M7.9 20A9 9 0 1 0 4 16.1L2 22zM8 10h8M8 14h5',
  philosophie:
    'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.9.7 1.5 1.7 1.5 2.6h4c0-.9.6-1.9 1.5-2.6A6 6 0 0 0 12 3z',
  litterature:
    'M20.2 4.8a4.5 4.5 0 0 0-6.4 0L4 14.6V20h5.4l9.8-9.8a4.5 4.5 0 0 0 1-5.4zM15 9l-8 8',
};

// Palette de nœuds puisée dans le THÈME (variété sans couleur de marque en
// dur). Chaque domaine reçoit une couleur du cycle selon son rang.
const NODE_VARS = ['var(--highlight)', 'var(--accent)', 'var(--accent-soft)', 'var(--surface)'];

function iconFor(category: string): string {
  return ICONS[category.toLowerCase()] ?? ICONS.book;
}
function colorFor(index: number): string {
  return NODE_VARS[index % NODE_VARS.length];
}

// Étoiles de fond — pseudo-aléatoire DÉTERMINISTE (aucun écart SSR/client).
function makeStars(count: number) {
  const out: { x: number; y: number; r: number; o: number }[] = [];
  for (let i = 0; i < count; i++) {
    const h = (i * 2654435761) % 4294967296;
    out.push({
      x: (h % 1000) * 0.8,
      y: ((h >> 10) % 1000) * 0.8,
      r: 0.6 + ((h >> 20) % 10) / 12,
      o: 0.15 + ((h >> 24) % 10) / 25,
    });
  }
  return out;
}

const STARS = makeStars(70);
const CENTER = 400;
const ORBIT = 285;
// Au-delà, même en rétrécissant les nœuds l'orbite devient illisible : on
// force la grille (même sur desktop).
const ORBIT_MAX = 14;

/**
 * Rayon MAXIMAL d'un nœud garantissant l'absence de chevauchement sur
 * l'orbite : borné par l'espacement angulaire (≈ 80 % du demi-pas) et par un
 * plafond visuel. Ainsi la constellation reste propre de 3 à ORBIT_MAX
 * domaines, sans repli — le rayon s'adapte au nombre.
 */
function nodeRadiusCap(count: number): number {
  return Math.min(76, ((Math.PI * ORBIT) / Math.max(count, 1)) * 0.8);
}

function href(category: string): string {
  return `/opac?category=${encodeURIComponent(category)}`;
}
function label(category: string, count: number): string {
  return `${category} — ${count} ressource${count > 1 ? 's' : ''}`;
}

/** Repli accessible : grille de cercles (mobile, ou trop de domaines). */
function DomainGrid({ domains, always }: { domains: Domain[]; always?: boolean }) {
  return (
    <div className={always ? styles.savoirsGridAlways : styles.savoirsGrid}>
      {domains.map((domain, i) => (
        <a
          key={domain.category}
          href={href(domain.category)}
          className={styles.domainCircle}
          aria-label={label(domain.category, domain.count)}
        >
          <span className={styles.disc} style={{ borderColor: colorFor(i) }} aria-hidden="true">
            {domain.count}
          </span>
          <span className={styles.dname}>{domain.category}</span>
          <span className={styles.dcount} aria-hidden="true">
            {domain.count} ressource{domain.count > 1 ? 's' : ''}
          </span>
        </a>
      ))}
    </div>
  );
}

export function ConstellationSection({
  id,
  domains,
  totalRecords,
  tenantName,
}: {
  id?: string;
  domains: Domain[];
  totalRecords: number;
  tenantName: string;
}) {
  const max = Math.max(...domains.map((d) => d.count), 1);
  const crowded = domains.length > ORBIT_MAX;
  // Rayon adapté au nombre de domaines (pas de chevauchement, voir plus haut).
  const rCap = nodeRadiusCap(domains.length);

  return (
    <section
      id={id}
      aria-labelledby="constellation-title"
      className={`${styles.section}`}
      style={{
        // Ciel sombre THÉMÉ : dégradé primary-dark → text, assombri par un
        // voile neutre pour garantir le contraste des étoiles quel que soit
        // le thème (le voile n'est pas une couleur de marque).
        background:
          'linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.66)), radial-gradient(ellipse at 50% 38%, var(--primary-dark), var(--text))',
      }}
    >
      <div className={styles.wrap} style={{ textAlign: 'center' }}>
        <div className={styles.eyebrow} style={{ color: 'var(--highlight)', justifyContent: 'center' }}>
          Explorer le catalogue
        </div>
        <h2 id="constellation-title" style={{ color: 'var(--surface)' }}>
          Constellation des savoirs
        </h2>
        <p style={{ color: 'color-mix(in srgb, var(--surface) 70%, transparent)', marginTop: 8 }}>
          {totalRecords > 0 ? `${totalRecords} ressources · ` : ''}cliquez sur un domaine pour
          explorer le catalogue.
        </p>

        {crowded ? (
          // Trop de domaines pour une orbite lisible : grille à toutes largeurs.
          <DomainGrid domains={domains} always />
        ) : (
          <>
            {/* Vue large : constellation animée */}
            <svg
              viewBox="0 0 800 800"
              role="group"
              aria-label="Domaines de la bibliothèque"
              className={styles.savoirsSvg}
              style={{ margin: '8px auto 0', width: '100%', maxWidth: 720 }}
            >
              <defs>
                <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
                  <feGaussianBlur stdDeviation="5" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="glow-strong" x="-60%" y="-60%" width="220%" height="220%">
                  <feGaussianBlur stdDeviation="10" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Ciel étoilé */}
              {STARS.map((s, i) => (
                <circle
                  key={i}
                  cx={s.x}
                  cy={s.y}
                  r={s.r}
                  opacity={s.o}
                  className="bc-star"
                  style={
                    { fill: 'var(--surface)', '--star-o': s.o, animationDelay: `${(i % 13) * 0.31}s` } as React.CSSProperties
                  }
                />
              ))}

              {/* Liaisons centre → domaines */}
              {domains.map((domain, i) => {
                const angle = -Math.PI / 2 + (i * 2 * Math.PI) / domains.length;
                const x = CENTER + ORBIT * Math.cos(angle);
                const y = CENTER + ORBIT * Math.sin(angle);
                return (
                  <g key={domain.category}>
                    <line
                      x1={CENTER}
                      y1={CENTER}
                      x2={x}
                      y2={y}
                      strokeWidth="2.5"
                      opacity="0.5"
                      filter="url(#glow)"
                      style={{ stroke: colorFor(i) }}
                    />
                    <line
                      x1={CENTER}
                      y1={CENTER}
                      x2={x}
                      y2={y}
                      strokeWidth="1"
                      opacity="0.85"
                      className="bc-flow"
                      style={{ stroke: 'var(--surface)', animationDelay: `${i * -0.4}s` }}
                    />
                  </g>
                );
              })}

              {/* Hub central */}
              <g filter="url(#glow-strong)">
                <circle cx={CENTER} cy={CENTER} r="106" opacity="0.92" style={{ fill: 'var(--text)' }} />
                <circle cx={CENTER} cy={CENTER} r="106" fill="none" strokeWidth="3.5" style={{ stroke: 'var(--highlight)' }} />
              </g>
              <circle
                cx={CENTER}
                cy={CENTER}
                r="106"
                fill="none"
                strokeWidth="1.5"
                className="bc-hub"
                style={{ stroke: 'var(--accent-soft)' }}
              />
              <path
                d={ICONS.book}
                transform={`translate(${CENTER - 21}, ${CENTER - 68}) scale(1.75)`}
                fill="none"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ stroke: 'var(--surface)' }}
              />
              <text x={CENTER} y={CENTER + 6} textAnchor="middle" fontSize="24" fontWeight="700" letterSpacing="2" style={{ fill: 'var(--surface)' }}>
                BIBLIOTHÈQUE
              </text>
              <text x={CENTER} y={CENTER + 32} textAnchor="middle" fontSize="12.5" fontWeight="600" style={{ fill: 'var(--highlight)' }}>
                {tenantName}
              </text>
              <text x={CENTER} y={CENTER + 56} textAnchor="middle" fontSize="12" style={{ fill: 'color-mix(in srgb, var(--surface) 65%, transparent)' }}>
                {totalRecords} ressources
              </text>

              {/* Nœuds de domaine — liens accessibles */}
              {domains.map((domain, i) => {
                const angle = -Math.PI / 2 + (i * 2 * Math.PI) / domains.length;
                const x = CENTER + ORBIT * Math.cos(angle);
                const y = CENTER + ORBIT * Math.sin(angle);
                const color = colorFor(i);
                // Taille ∝ nombre de ressources, plafonnée par rCap (anti-chevauchement).
                const r = rCap * (0.72 + 0.28 * (domain.count / max));
                return (
                  <a
                    key={domain.category}
                    href={href(domain.category)}
                    className="constellation-node"
                    aria-label={label(domain.category, domain.count)}
                  >
                    <g>
                      <circle cx={x} cy={y} r={r} opacity="0.92" style={{ fill: 'var(--text)' }} />
                      <circle cx={x} cy={y} r={r} fill="none" strokeWidth="2.5" filter="url(#glow)" style={{ stroke: color }} />
                      <circle
                        cx={x}
                        cy={y}
                        r={r}
                        fill="none"
                        strokeWidth="0.9"
                        opacity="0.7"
                        className="bc-ring"
                        style={{ stroke: 'var(--surface)', animationDelay: `${i * 0.45}s` }}
                      />
                      <path
                        d={iconFor(domain.category)}
                        transform={`translate(${x - 15}, ${y - r + 16}) scale(1.25)`}
                        fill="none"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ stroke: color }}
                      />
                      <text x={x} y={y + r - 34} textAnchor="middle" fontSize="16" fontWeight="700" style={{ fill: 'var(--surface)', textTransform: 'capitalize' }}>
                        {domain.category}
                      </text>
                      <text x={x} y={y + r - 16} textAnchor="middle" fontSize="12" style={{ fill: color }}>
                        {domain.count} ressource{domain.count > 1 ? 's' : ''}
                      </text>
                    </g>
                  </a>
                );
              })}
            </svg>

            {/* Vue mobile : grille de cercles (même données, mêmes liens) */}
            <DomainGrid domains={domains} />
          </>
        )}

        <div style={{ marginTop: 28 }}>
          <a href="/opac" className={`${styles.btn} ${styles.btnPrimary}`}>
            Catalogue complet →
          </a>
        </div>
      </div>
    </section>
  );
}
