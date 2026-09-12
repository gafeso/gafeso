// Page d'accueil PUBLIQUE du tenant — vitrine institutionnelle rendue en SSR
// (spec docs/spec-accueil-tenant.md). Server Component : le contenu, le thème
// et la constellation sont récupérés côté serveur (résolution par Host) et
// rendus dans le HTML servi — pas de flash de thème, indexable, rapide.
//
// Chaque section est OPTIONNELLE : une liste vide n'affiche rien. Les libellés
// de section sont génériques (aucun texte propre à une école en dur). Les
// liens sont relatifs → domaine du tenant courant.

import type { Metadata } from 'next';
import {
  fetchChiffres,
  fetchConstellation,
  fetchNouveautes,
  fetchTenantHome,
  toHomeTheme,
} from '@/lib/server-api';
import { homeThemeStyle } from '@/lib/home-theme';
import { HomeHeader } from '@/components/home/home-header';
import { ID_CONTENU, LienDEvitement } from '@/components/lien-evitement';
import { HeroBandeau } from '@/components/home/hero-bandeau';
import { bornerDiapositives } from '@/lib/hero-slides';
import { GROUPES_DE_TYPES } from '@/lib/record-types';
import { formaterNombre, tuilesSignificatives } from '@/lib/chiffres';
import {
  SectionAcquisitions,
  SectionChiffres,
  SectionConstellation,
} from './sections-differees';
import styles from './home.module.css';
import { LIBELLES } from '@/lib/libelles';

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
      <main id={ID_CONTENU} style={{ maxWidth: 640, margin: '0 auto', padding: '96px 24px', textAlign: 'center' }}>
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

  // ⚠ LES TROIS APPELS ONT QUITTÉ CETTE FONCTION — backlog n° 13. Ils étaient
  // en série (6,25 s), puis en parallèle (3,14 s) ; ils sont maintenant DANS
  // leurs sections, derrière des frontières `Suspense`. La page ne les attend
  // plus : premier octet à 1,53 s au lieu de 3,14.
  //
  // ⚠ `fetchTenantHome` reste seul et AVANT : le repli sobre ci-dessus dépend
  // de sa réponse, et c'est lui qui porte le nom de l'école et le bandeau.
  // C'est le plancher de ce lot, structurel et assumé.
  const { content, latticeEnabled } = home;
  const { identity } = content;
  const themeStyle = homeThemeStyle(toHomeTheme(home));

  // Ancres de navigation : seulement les sections réellement présentes.
  const hasEspaces = content.espaces.length > 0;
  const hasServices = content.services.length > 0;
  const hasHours = content.hours.lines.length > 0 || content.hours.note.length > 0;
  const hasResources = content.resources.length > 0;
  const hasHorairesSection = hasHours || hasResources;

  const navItems = [
    hasEspaces && { href: '#espaces', label: 'Espaces' },
    hasServices && { href: '#services', label: 'Services' },
    // ⚠ TOUJOURS AFFICHÉE. Elle dépendait de la constellation : le menu
    // attendait un troisième appel pour savoir s'il montrait « Catalogue ».
    // Faire dépendre la navigation d'une donnée qui ne la concerne pas est ce
    // qui empêchait de diffuser la page tôt. La section existe toujours, sous
    // une forme ou une autre — répartition, ou message d'indisponibilité.
    { href: '#savoirs', label: 'Catalogue' },
    hasHorairesSection && { href: '#horaires', label: 'Horaires' },
    { href: '#contact', label: 'Contact' },
  ].filter(Boolean) as { href: string; label: string }[];

  const Lattice = () => (latticeEnabled ? <div className={styles.latticeBg} /> : null);

  return (
    <div className={styles.vitrine} style={themeStyle} id="top">
      {/* ⚠ Premier élément focalisable : avant l'en-tête, jamais après. */}
      <LienDEvitement />
      <HomeHeader
        brandMark={identity.brandMark}
        logoUrl={identity.logoUrl}
        acronym={identity.acronym}
        subtitle={identity.subtitle}
        navItems={navItems}
      />
      {latticeEnabled && <div className={styles.latticeStrip} />}

      <main id={ID_CONTENU}>
        {/* ---------- BANDEAU PLEINE LARGEUR ----------
            Texte par-dessus l'image, flèches et points. Le moteur est celui du
            lot précédent : sur mobile UNE seule image est montée, jamais
            masquée en CSS. Ne pas contourner `HeroBandeau` pour « simplifier ».
            ⚠ `home.heroSlides` : la liste EFFECTIVE, servie à la racine.
            Surtout pas `content.identity.heroSlides`, qui porte le stocké. */}
        <HeroBandeau
          plein
          diapositives={bornerDiapositives(home.heroSlides)}
          lattice={latticeEnabled}
          // Défaut du PRODUIT quand l'établissement n'a rien saisi. Affiché,
              // jamais enregistré : voir LIBELLES.defauts.
              accroche={identity.lead || LIBELLES.defauts.presentation}
          actions={
            <>
              <a href="#recherche" className={`${styles.btn} ${styles.btnClay}`}>
                {LIBELLES.accueil.rechercherDocument}
              </a>
              <a href="/inscription" className={`${styles.btn} ${styles.btnSurContraste}`}>
                {LIBELLES.accueil.creerCompte}
              </a>
            </>
          }
        />

        {/* Sans diapositive, le bandeau ne rend RIEN — la page doit rester
            cohérente sans lui. On rappelle donc ici le titre de
            l'établissement, qui vivait dans le bandeau avant la refonte. */}
        {bornerDiapositives(home.heroSlides).length === 0 &&
          (identity.heroTitle || identity.lead) && (
            <section className={styles.section}>
              <div className={styles.wrap}>
                {identity.tagline && <div className={styles.eyebrow}>{identity.tagline}</div>}
                <h1>
                  {identity.heroTitle || LIBELLES.defauts.accroche}
                  {identity.heroTitleAccent && (
                    <>
                      <br />
                      <em>{identity.heroTitleAccent}</em>
                    </>
                  )}
                </h1>
                <p className={styles.lead}>{identity.lead || LIBELLES.defauts.presentation}</p>
              </div>
            </section>
          )}

        {/* ---------- QUATRE PILIERS ---------- */}
        <section className={styles.piliers} aria-label={LIBELLES.piliers[0].titre}>
          <div className={`${styles.wrap} ${styles.piliersGrille}`}>
            {LIBELLES.piliers.map((pilier) => (
              <div key={pilier.titre} className={styles.pilier}>
                <b>{pilier.titre}</b>
                <span>{pilier.texte}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ---------- RECHERCHE ----------
            Formulaire GET natif vers l'OPAC : aucun JS, donc utilisable même
            si l'hydratation échoue. Le filtre part en `recordType`, le nom que
            l'OPAC attend déjà. */}
        <section id="recherche" className={styles.section}>
          <div className={styles.wrap}>
            <div className={styles.sectionHead}>
              <h2>{LIBELLES.recherche.titre}</h2>
              <p>{LIBELLES.recherche.sousTitre}</p>
            </div>
            <form className={styles.rechercheCarte} action="/opac" method="get">
              <input
                type="text"
                name="q"
                placeholder={LIBELLES.recherche.placeholder}
                aria-label={LIBELLES.recherche.champAccessible}
              />
              {/* Regroupements de la maquette, rendus possibles par le
                  recordType MULTIPLE livré le 10 septembre. « Périodiques »
                  reste absent, et c'est mesuré : aucun recordType ne
                  correspond, et un filtre qui ne filtre pas est un contrôle
                  sans effet. « Documents numériques » n'est pas ici non plus,
                  mais pour une autre raison — voir le lien de parcours sous le
                  formulaire. */}
              <select name="recordType" aria-label={LIBELLES.recherche.filtreAccessible}>
                <option value="">{LIBELLES.recherche.tousLesTypes}</option>
                {GROUPES_DE_TYPES.map((g) => (
                  <option key={g.cle} value={g.types.join(',')}>
                    {LIBELLES.recherche.groupes[g.cle]}
                  </option>
                ))}
              </select>
              <button type="submit">{LIBELLES.recherche.bouton}</button>
            </form>
            {/* ⚠ Un PARCOURS, pas une option du menu ci-dessus.
                Le filtre « a un fichier » se lit en base ; /opac/search ne
                peut pas le porter sans que ses totaux deviennent faux, et
                l'API l'a donc sorti sur /opac/parcourir. Le glisser dans le
                menu promettrait une recherche restreinte aux documents
                numériques — que rien ne sait servir. Lien natif : il marche
                sans JavaScript, comme le formulaire. */}
            <p className={styles.rechercheParcours}>
              <a href="/opac?numeriques=1">{LIBELLES.opac.parcourirNumeriques} →</a>
            </p>
            {/* Indice de saisie : celui de l'établissement, ou le défaut du
                produit. Affiché, jamais enregistré. */}
            <p className={styles.searchHint}>
              {identity.searchHint || LIBELLES.defauts.indiceRecherche}
            </p>
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

        {/* ⚠ DIFFÉRÉES — backlog n° 13. Ces deux sections faisaient attendre
            la page entière : premier octet à 3,137 s pour un total de 3,139 s,
            c'est-à-dire du blanc du début à la fin. Elles font désormais leur
            propre appel derrière une frontière `Suspense`, et le reste de la
            page part dès que `fetchTenantHome` a répondu. Voir
            app/sections-differees.tsx. */}
        <SectionAcquisitions />
        <SectionConstellation tenantName={home.name} />

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

        <SectionChiffres />

      {/* ---------- FOOTER ---------- */}
      <footer id="contact" className={styles.footer}>
        <div className={styles.wrap}>
          <div className={styles.footGrid}>
            <div>
              <div className={styles.brand} style={{ marginBottom: 18 }}>
                {/* Même cascade qu'en en-tête — et surtout le MÊME repli :
                    la démonstration montrait deux pastilles de couleurs
                    différentes selon l'écran, ce qui se lisait comme deux
                    logos concurrents. */}
                {identity.logoUrl ? (
                  <div
                    className={styles.brandMark}
                    style={{ background: 'var(--highlight)', color: 'var(--text)' }}
                  >
                    <img src={identity.logoUrl} alt={identity.acronym} />
                  </div>
                ) : identity.brandMark || identity.acronym ? (
                  <div
                    className={styles.brandMark}
                    style={{ background: 'var(--highlight)', color: 'var(--text)' }}
                  >
                    {identity.brandMark || identity.acronym.slice(0, 2)}
                  </div>
                ) : (
                  <div className={`${styles.brandMark} ${styles.brandMarkGafeso}`}>
                    <img src="/marque/gafeso_icone_simplifiee.svg" alt="Gafeso" />
                  </div>
                )}
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

            {/* ⚠ Chaque lien est conditionné à l'EXISTENCE de sa destination.
                « Constellation » et « Horaires » pointent vers des ancres de
                cette page : si la section ne se rend pas, l'ancre n'existe pas
                et le lien mènerait nulle part. La maquette proposait aussi
                « Application mobile », « À propos de Gafeso », « Mentions
                légales » et « Politique de confidentialité » : aucune de ces
                pages n'existe, aucun de ces liens n'est affiché. */}
            <div>
              {/*
                ⚠ h2, PAS h5. Les colonnes du pied venaient après un h3 : un
                niveau sauté (3 → 5), donc une personne qui navigue de titre en
                titre entend un trou. Elles sont les groupes de premier rang DU
                PIED, pas des sous-sections de ce qui précède — h2 dit ce
                qu'elles sont, h5 disait une profondeur qui n'existe pas.
                La taille reste celle d'avant : c'est une classe qui la porte,
                pas le niveau du titre.
              */}
              <h2 className={styles.titreDePied}>{LIBELLES.pied.bibliotheque}</h2>
              <a className={styles.flink} href="/opac">
                {LIBELLES.pied.catalogue}
              </a>
              {/* ⚠ Comme l'ancre de l'en-tête : toujours affichée. Elle
                  dépendait de la constellation, donc d'un appel que la page
                  n'attend plus — et un lien de pied qui apparaîtrait une
                  seconde après le reste se lirait comme un défaut. */}
              <a className={styles.flink} href="#savoirs">
                {LIBELLES.pied.constellation}
              </a>
              {content.hours.lines.length > 0 && (
                <a className={styles.flink} href="#horaires">
                  {LIBELLES.pied.horaires}
                </a>
              )}
            </div>

            <div>
              <h2 className={styles.titreDePied}>{LIBELLES.pied.services}</h2>
              <a className={styles.flink} href="/inscription">
                {LIBELLES.pied.creerCompte}
              </a>
              <a className={styles.flink} href="#contact">
                {LIBELLES.pied.contact}
              </a>
            </div>

            {content.contact.address && (
              <div>
                <h2 className={styles.titreDePied}>{LIBELLES.pied.campus}</h2>
                <p>{content.contact.address}</p>
              </div>
            )}

            {/* Conditionnée comme « Campus » juste au-dessus. Sans cela, un
                établissement qui n'a renseigné ni courriel, ni téléphone, ni
                réseau affichait un titre CONTACT surmontant le vide — ce qui
                se lit comme une page cassée, pas comme une information
                absente. */}
            {(content.contact.email ||
              content.contact.phones ||
              content.contact.socials.some((social) => safeHref(social.url))) && (
            <div>
              <h2 className={styles.titreDePied}>{LIBELLES.pied.contact}</h2>
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
            )}

            {/* « Catalogue OPAC » a disparu d'ici : le même lien est
                désormais sous LA BIBLIOTHÈQUE, et un pied de page qui répète
                sa propre entrée fait douter qu'il s'agisse de la même. La
                colonne ne subsiste donc que pour les ressources EXTERNES de
                l'établissement — et seulement s'il en a. */}
            {content.resources.some((r) => safeHref(r.url)) && (
              <div>
                <h2 className={styles.titreDePied}>{LIBELLES.pied.ressources}</h2>
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
            )}
          </div>
          {/* Le copyright est celui de l'ÉTABLISSEMENT ; Gafeso ne signe
              qu'en dessous, discrètement. C'est sa vitrine, pas la nôtre. */}
          <div className={styles.footBottom}>
            <div>{content.contact.copyright || home.name}</div>
            <div className={styles.signatureGafeso}>{LIBELLES.pied.signature}</div>
          </div>
        </div>
      </footer>
    </div>
  );
}
