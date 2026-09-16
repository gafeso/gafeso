'use client';

// En-tête de la page d'accueil vitrine. Client uniquement pour deux raisons :
// le menu mobile repliable et le lien d'authentification (dépend du cookie de
// session, lu côté navigateur). Le reste de la page est rendu en SSR.
//
// ⚠ ET C'EST ICI QUE LA VITRINE CONNAÎT LES SESSIONS. Quand un cookie existe,
// cet en-tête appelle `/auth/me/functions`, `/modules` et `/tenancy/current` —
// pour savoir s'il doit rendre « Espace professionnel », « Mon dépôt », et le
// nom de l'école. Sans session, aucun de ces appels ne part.
//
// Conséquence à connaître AVANT de vouloir mettre la vitrine en cache : le
// CORPS de la page est identique pour tout le monde, son EN-TÊTE non. La
// frontière est ici. Détail et alternative écartée (la séparation à deux
// adresses de Koha) : docs/DEMARRER-FRONT.md, « La vitrine connaît les
// sessions ».
//
// Les liens sont RELATIFS (/opac, /login, /inscription) : ils pointent
// automatiquement vers le domaine du tenant courant — aucune URL en dur.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { clearSession } from '@/lib/session';
import { useCompteCourant } from '@/lib/entrees-de-compte';
import { MenuCompte } from '@/components/menu-compte';
import { LIBELLES } from '@/lib/libelles';
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
  const router = useRouter();
  // ⚠ LA MÊME SOURCE QUE L'AUTRE EN-TÊTE. Cette barre décrivait de son côté ce
  // qu'un compte connecté offre, et les deux ont divergé à la première
  // modification. Une seule source, ou elles divergeront encore.
  const { user, entrees, lienPro, etablissement } = useCompteCourant();

  async function deconnexion() {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      /* déconnexion best-effort : on nettoie l'UI quoi qu'il arrive */
    }
    clearSession();
    router.push('/login');
  }

  return (
    <header className={styles.header}>
      <div className={`${styles.wrap} ${styles.navRow}`}>
        <a href="#top" className={styles.brand}>
          {/* Trois cas, jamais un aplat vide : le logo de l'établissement,
              à défaut son sigle, à défaut la maison-livre de Gafeso. */}
          {logoUrl ? (
            <div className={styles.brandMark}>
              <img src={logoUrl} alt={acronym} />
            </div>
          ) : brandMark || acronym ? (
            <div className={styles.brandMark}>{brandMark || acronym.slice(0, 2)}</div>
          ) : (
            <div className={`${styles.brandMark} ${styles.brandMarkGafeso}`}>
              <img src="/marque/gafeso_icone_simplifiee.svg" alt="Gafeso" />
            </div>
          )}
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
          {/* ⚠ UN LIEN QUI DIT CE QU'IL OUVRE, À CÔTÉ DU COMPTE ET PAS DEDANS.
              Jusqu'au 16 septembre 2026, cette place portait un lien nommé du
              PRÉNOM et menant à `/guichet`. Deux défauts dans un seul contrôle :
              un prénom se lit comme un menu de compte — personne n'y cherche
              « Guichet » —, et le lien s'affichait pour TOUT connecté, si bien
              qu'une étudiante cliquant son propre prénom lisait « cet espace est
              réservé au personnel de la bibliothèque ».
              Le premier geste après connexion doit être VISIBLE, pas découvert. */}
          {lienPro && (
            <a href={lienPro} className={`${styles.btn} ${styles.btnGhost}`}>
              {LIBELLES.entete.espaceProfessionnel}
            </a>
          )}
          {user ? (
            /* ⚠ LE MÊME COMPOSANT QUE L'AUTRE EN-TÊTE, et pour une raison de
               fond : un bouton de compte doit avoir UN seul comportement
               partout. Ici il naviguait, ailleurs il déroulait — le même
               contrôle, deux gestes. */
            <MenuCompte
              prenom={user.firstName}
              nom={user.lastName}
              etablissement={etablissement}
              entrees={entrees}
              onDeconnexion={deconnexion}
            />
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
