'use client';

// En-tête de la page d'accueil vitrine. Client uniquement pour deux raisons :
// le menu mobile repliable et le lien d'authentification (dépend du cookie de
// session, lu côté navigateur). Le reste de la page est rendu en SSR.
//
// Les liens sont RELATIFS (/opac, /login, /inscription) : ils pointent
// automatiquement vers le domaine du tenant courant — aucune URL en dur.

import { useEffect, useState } from 'react';
import { getUser } from '@/lib/session';
import styles from '@/app/home.module.css';

interface NavItem {
  href: string;
  label: string;
}

export function HomeHeader({
  brandMark,
  logoUrl,
  acronym,
  subtitle,
  navItems,
}: {
  brandMark: string;
  logoUrl: string | null;
  acronym: string;
  subtitle: string;
  navItems: NavItem[];
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [firstName, setFirstName] = useState<string | null>(null);

  useEffect(() => {
    setFirstName(getUser()?.firstName ?? null);
  }, []);

  return (
    <header className={styles.header}>
      <div className={`${styles.wrap} ${styles.navRow}`}>
        <a href="#top" className={styles.brand}>
          <div className={styles.brandMark}>
            {logoUrl ? <img src={logoUrl} alt={acronym} /> : brandMark || acronym.slice(0, 2)}
          </div>
          <div className={styles.brandText}>
            {acronym && <div className={styles.top}>{acronym}</div>}
            {subtitle && <div className={styles.sub}>{subtitle}</div>}
          </div>
        </a>

        {navItems.length > 0 && (
          <nav
            className={styles.navLinks}
            style={
              menuOpen
                ? {
                    display: 'flex',
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    background: 'var(--surface)',
                    flexDirection: 'column',
                    padding: '20px 32px',
                    gap: 18,
                    borderBottom: '1px solid var(--line)',
                  }
                : undefined
            }
          >
            {navItems.map((item) => (
              <a key={item.href} href={item.href} onClick={() => setMenuOpen(false)}>
                {item.label}
              </a>
            ))}
          </nav>
        )}

        <div className={styles.navActions}>
          {firstName ? (
            <a href="/guichet" className={`${styles.btn} ${styles.btnGhost}`}>
              {firstName}
            </a>
          ) : (
            <a href="/login" className={`${styles.btn} ${styles.btnGhost}`}>
              Se connecter
            </a>
          )}
          <a href="/opac" className={`${styles.btn} ${styles.btnPrimary}`}>
            Ouvrir le catalogue
          </a>
          {navItems.length > 0 && (
            <button
              type="button"
              className={styles.menuToggle}
              aria-label="Menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              ☰
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
