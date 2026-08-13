// Page d'accueil PUBLIQUE du tenant — vitrine institutionnelle rendue en SSR
// (spec docs/spec-accueil-tenant.md). Server Component : le contenu, le thème
// et la constellation sont récupérés côté serveur (résolution par Host) et
// rendus dans le HTML servi — pas de flash de thème, indexable, rapide.
//
// Chaque section est OPTIONNELLE : une liste vide n'affiche rien. Les libellés
// de section sont génériques (aucun texte propre à une école en dur). Les
// liens sont relatifs → domaine du tenant courant.

import type { Metadata } from 'next';
import { fetchConstellation, fetchTenantHome, toHomeTheme } from '@/lib/server-api';
import { homeThemeStyle } from '@/lib/home-theme';
import { HomeHeader } from '@/components/home/home-header';
import { ConstellationSection } from '@/components/constellation';
import styles from './home.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const home = await fetchTenantHome();
  const name = home?.content.identity.fullName || home?.name || 'Bibliothèque';
  return { title: name, description: home?.content.identity.lead || undefined };
}

const STATUS_CLASS: Record<string, string> = {
  live: styles.statusLive,
  maint: styles.statusMaint,
  off: styles.statusOff,
};

// Défense en profondeur : l'API assainit déjà les URLs du contenu
// (home-content.ts → safeUrl), mais on revalide le schéma AU RENDU. La page est
// publique et servie en SSR : un href `javascript:`/`data:` serait un XSS
// stocké. Seuls http/https passent ; toute autre valeur devient un lien inerte.
function safeHref(url: string): string {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? url : '';
  } catch {
    return '';
  }
}

export default async function HomePage() {
  const home = await fetchTenantHome();

  // Domaine inconnu / API indisponible : repli sobre, sans contenu d'école.
  if (!home) {
    return (
      <main style={{ maxWidth: 640, margin: '0 auto', padding: '96px 24px', textAlign: 'center' }}>
        <h1 style={{ fontFamily: 'Charter, Georgia, serif' }}>Bibliothèque</h1>
        <p style={{ color: '#5E6B78', marginTop: 12 }}>
          Le catalogue est accessible ci-dessous.
        </p>
        <a
          href="/opac"
          style={{
            display: 'inline-block',
            marginTop: 20,
            padding: '10px 20px',
            background: '#0F2B46',
            color: '#fff',
            borderRadius: 2,
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          Ouvrir le catalogue
        </a>
      </main>
    );
  }

  const constellation = await fetchConstellation();
  const domains = constellation.domains;
  const { content, latticeEnabled } = home;
  const { identity } = content;
  const themeStyle = homeThemeStyle(toHomeTheme(home));

  // Ancres de navigation : seulement les sections réellement présentes.
  const hasEspaces = content.espaces.length > 0;
  const hasServices = content.services.length > 0;
  const hasSavoirs = domains.length > 0;
  const hasHours = content.hours.lines.length > 0 || content.hours.note.length > 0;
  const hasResources = content.resources.length > 0;
  const hasHorairesSection = hasHours || hasResources;

  const navItems = [
    hasEspaces && { href: '#espaces', label: 'Espaces' },
    hasServices && { href: '#services', label: 'Services' },
    hasSavoirs && { href: '#savoirs', label: 'Catalogue' },
    hasHorairesSection && { href: '#horaires', label: 'Horaires' },
    { href: '#contact', label: 'Contact' },
  ].filter(Boolean) as { href: string; label: string }[];

  const Lattice = () => (latticeEnabled ? <div className={styles.latticeBg} /> : null);

  return (
    <div className={styles.vitrine} style={themeStyle} id="top">
      <HomeHeader
        brandMark={identity.brandMark}
        logoUrl={identity.logoUrl}
        acronym={identity.acronym}
        subtitle={identity.subtitle}
        navItems={navItems}
      />
      {latticeEnabled && <div className={styles.latticeStrip} />}

      <main>
        {/* ---------- HERO ---------- */}
        <section className={styles.hero}>
          <Lattice />
          <div className={`${styles.wrap} ${styles.heroInner}`}>
            <div>
              {identity.tagline && <div className={styles.eyebrow}>{identity.tagline}</div>}
              <h1>
                {identity.heroTitle}
                {identity.heroTitleAccent && (
                  <>
                    {identity.heroTitle && <br />}
                    <em>{identity.heroTitleAccent}</em>
                  </>
                )}
              </h1>
              {identity.lead && <p className={styles.lead}>{identity.lead}</p>}

              {/* Recherche : formulaire GET natif → page OPAC (aucun JS). */}
              <form className={styles.searchCard} action="/opac" method="get">
                <input
                  type="text"
                  name="q"
                  placeholder="Que cherchez-vous aujourd'hui ? — titre, auteur, sujet…"
                  aria-label="Rechercher dans le catalogue"
                />
                <button type="submit">Rechercher</button>
              </form>
              {identity.searchHint && (
                <div className={styles.searchHint}>
                  {identity.searchHint}{' '}
                  <a href="/opac">Ouvrir le catalogue</a>
                </div>
              )}

              <div className={styles.heroCta}>
                <a href="/inscription" className={`${styles.btn} ${styles.btnClay}`}>
                  Créer un compte lecteur
                </a>
                {hasEspaces && (
                  <a href="#espaces" className={`${styles.btn} ${styles.btnGhost}`}>
                    Découvrir les espaces
                  </a>
                )}
              </div>
            </div>

            <div className={styles.heroFrame}>
              {identity.heroImageUrl && (
                <img
                  className={styles.heroPhoto}
                  src={identity.heroImageUrl}
                  alt={identity.heroImageCaption || ''}
                />
              )}
              <Lattice />
              {(identity.heroImageKicker || identity.heroImageCaption) && (
                <div className={styles.caption}>
                  {identity.heroImageKicker && (
                    <div className={styles.mono}>{identity.heroImageKicker}</div>
                  )}
                  {identity.heroImageCaption && (
                    <div className={styles.title}>{identity.heroImageCaption}</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ---------- STATS ---------- */}
        {content.stats.length > 0 && (
          <div className={styles.stats}>
            <div className={styles.wrap} style={{ '--cols': content.stats.length } as React.CSSProperties}>
              {content.stats.map((stat, i) => (
                <div key={i} className={styles.stat}>
                  <div className={styles.num}>{stat.value}</div>
                  <div className={styles.label}>{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ---------- ESPACES ---------- */}
        {hasEspaces && (
          <section id="espaces" className={styles.section}>
            <div className={styles.wrap}>
              <div className={styles.sectionHead}>
                <div>
                  <div className={styles.eyebrow}>Sur place</div>
                  <h2>Nos espaces</h2>
                </div>
              </div>
              <div className={styles.gridEspaces}>
                {content.espaces.map((espace, i) => (
                  <div key={i} className={styles.cardEspace}>
                    <Lattice />
                    {espace.icon && <div className={styles.icon}>{espace.icon}</div>}
                    <h3>{espace.title}</h3>
                    {espace.tag && <div className={styles.cap}>{espace.tag}</div>}
                    {espace.description && <p>{espace.description}</p>}
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ---------- SERVICES ---------- */}
        {hasServices && (
          <section id="services" className={`${styles.section} ${styles.servicesBand}`}>
            <div className={styles.wrap}>
              <div className={styles.sectionHead}>
                <div>
                  <div className={styles.eyebrow}>Ce que nous faisons</div>
                  <h2 style={{ color: 'var(--surface)' }}>Services aux usagers</h2>
                </div>
              </div>
            </div>
            <div className={styles.wrap}>
              <div
                className={styles.gridServices}
                style={{ '--cols': Math.min(content.services.length, 5) } as React.CSSProperties}
              >
                {content.services.map((service, i) => (
                  <div key={i} className={styles.serviceItem}>
                    <div className={styles.num}>{String(i + 1).padStart(2, '0')}</div>
                    <h4>{service}</h4>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ---------- CONSTELLATION DES SAVOIRS (animée, dynamique) ---------- */}
        {hasSavoirs && (
          <ConstellationSection
            id="savoirs"
            domains={domains}
            totalRecords={constellation.totalRecords}
            tenantName={home.name}
          />
        )}

        {/* ---------- HORAIRES + ACCÈS ---------- */}
        {hasHorairesSection && (
          <section id="horaires" className={styles.section}>
            <div className={`${styles.wrap} ${styles.twoCol}`}>
              {hasHours && (
                <div className={styles.panel}>
                  <h3>Horaires d&apos;ouverture</h3>
                  <table className={styles.hours}>
                    <tbody>
                      {content.hours.lines.map((line, i) => (
                        <tr key={i}>
                          <td>{line.label}</td>
                          <td>{line.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {content.hours.note && <div className={styles.note}>{content.hours.note}</div>}
                </div>
              )}

              {hasResources && (
                <div className={styles.panel}>
                  <h3>Accès aux ressources</h3>
                  {content.resources.map((resource, i) => {
                    const inner = (
                      <>
                        <div>
                          <div className={styles.name}>{resource.name}</div>
                          {resource.description && (
                            <div className={styles.desc}>{resource.description}</div>
                          )}
                        </div>
                        {resource.statusLabel && (
                          <span className={`${styles.status} ${STATUS_CLASS[resource.status] ?? ''}`}>
                            {resource.statusLabel}
                          </span>
                        )}
                      </>
                    );
                    const href = safeHref(resource.url);
                    return href ? (
                      <a
                        key={i}
                        className={styles.resourceRow}
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {inner}
                      </a>
                    ) : (
                      <div key={i} className={styles.resourceRow}>
                        {inner}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      {/* ---------- FOOTER ---------- */}
      <footer id="contact" className={styles.footer}>
        <div className={styles.wrap}>
          <div className={styles.footGrid}>
            <div>
              <div className={styles.brand} style={{ marginBottom: 18 }}>
                <div className={styles.brandMark} style={{ background: 'var(--highlight)', color: 'var(--text)' }}>
                  {identity.logoUrl ? (
                    <img src={identity.logoUrl} alt={identity.acronym} />
                  ) : (
                    identity.brandMark || identity.acronym.slice(0, 2)
                  )}
                </div>
                {identity.acronym && (
                  <div className={styles.brandText}>
                    <div className={styles.top}>{identity.acronym}</div>
                  </div>
                )}
              </div>
              {content.contact.description && <p>{content.contact.description}</p>}
              {content.contact.partnerNote && (
                <p className={styles.partnerNote}>{content.contact.partnerNote}</p>
              )}
            </div>

            {content.contact.address && (
              <div>
                <h5>Campus</h5>
                <p>{content.contact.address}</p>
              </div>
            )}

            <div>
              <h5>Contact</h5>
              {content.contact.email && (
                <a className={styles.flink} href={`mailto:${content.contact.email}`}>
                  {content.contact.email}
                </a>
              )}
              {content.contact.phones && (
                <a className={styles.flink} href={`tel:${content.contact.phones.replace(/\s|\/.*/g, '')}`}>
                  {content.contact.phones}
                </a>
              )}
              {content.contact.socials
                .filter((social) => safeHref(social.url))
                .map((social, i) => (
                  <a
                    key={i}
                    className={styles.flink}
                    href={safeHref(social.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {social.label}
                  </a>
                ))}
            </div>

            <div>
              <h5>Ressources</h5>
              <a className={styles.flink} href="/opac">
                Catalogue OPAC
              </a>
              {content.resources
                .filter((r) => safeHref(r.url))
                .map((resource, i) => (
                  <a
                    key={i}
                    className={styles.flink}
                    href={safeHref(resource.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {resource.name}
                  </a>
                ))}
            </div>
          </div>
          <div className={styles.footBottom}>
            <div>{content.contact.copyright || home.name}</div>
          </div>
        </div>
      </footer>
    </div>
  );
}
