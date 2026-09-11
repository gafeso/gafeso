// Sections DIFFÉRÉES de la page d'accueil — backlog n° 13.
//
// ⚠ POURQUOI ELLES SONT SORTIES DE `page.tsx`. Mesuré le 11 septembre 2026 avec
// 1,5 s de latence par appel : la page rendait son PREMIER OCTET à 3,137 s pour
// un total de 3,139 s. Rien ne s'écoulait — le visiteur regardait du blanc du
// début à la fin, sur la page qui doit lui dire « c'est votre bibliothèque ».
//
// Chacune fait son propre appel et vit dans sa frontière `Suspense` : le reste
// de la page part dès que `fetchTenantHome` a répondu, soit UN aller-retour au
// lieu de deux. Plancher mesuré : 1,53 s contre 3,14.
//
// ⚠ CE PLANCHER EST STRUCTUREL et ce lot ne cherche pas à descendre plus bas :
// `fetchTenantHome` commande l'affichage (nom de l'école, bandeau, repli sobre
// d'un domaine inconnu). S'en affranchir échangerait du blanc contre un
// squelette sans marque — décision prise, et c'est non.

import { Suspense } from 'react';
import { fetchChiffres, fetchConstellation, fetchNouveautes } from '@/lib/server-api';
import { formaterNombre, tuilesSignificatives } from '@/lib/chiffres';
import { ConstellationSection } from '@/components/constellation';
import { LIBELLES } from '@/lib/libelles';
import styles from './home.module.css';

/**
 * ⚠ LES REPLIS NE SE VALENT PAS, et le choix est délibéré.
 *
 * La constellation rend TOUJOURS quelque chose — la répartition, ou le message
 * « catalogue momentanément indisponible » : son repli annonce donc une section
 * qui viendra, et dire qu'on charge est juste.
 *
 * Les acquisitions et les chiffres, eux, DISPARAISSENT quand il n'y a rien à
 * montrer. Un squelette qui s'efface promettrait un contenu qui n'existe pas et
 * ferait sauter la page — c'est « annoncer ce qu'on n'a pas », la faute que
 * cette page passe son temps à éviter. Leur repli est donc vide.
 */
function ReplisConstellation() {
  return (
    <section id="savoirs" className={styles.section}>
      <div className={styles.wrap} style={{ textAlign: 'center' }}>
        <p className={styles.lead}>{LIBELLES.commun.chargement}</p>
      </div>
    </section>
  );
}

async function Acquisitions() {
  const nouveautes = await fetchNouveautes();
  if (!nouveautes || nouveautes.length === 0) return null;
  return (
    <>
  {/* ---------- À DÉCOUVRIR DANS LE CATALOGUE ----------
      ⚠ Pas « Dernières acquisitions » : le tri servi reflète l'ordre
      d'écriture en base, pas une acquisition (précision du lot backend).
      Section absente tant qu'il n'y a rien à montrer : pas de grille
      vide, pas de cadre. Et la grille ne RÉSERVE pas six places — moins
      de six notices affiche ce qu'il y a, sans trous. */}
  
    <section id="acquisitions" className={styles.section}>
      <div className={styles.wrap}>
        <div className={styles.sectionHead}>
          <h2>{LIBELLES.acquisitions.titre}</h2>
          <a className={styles.flink} href="/opac">
            {LIBELLES.acquisitions.voirTout}
          </a>
        </div>
        <div className={styles.grilleAcquisitions}>
          {nouveautes.map((notice) => (
            <a key={notice.id} href={`/opac/${notice.id}`} className={styles.fiche}>
              {/* ⚠ Sous la ligne de flottaison : chargement différé, et
                  DIMENSIONS déclarées — sans elles la page saute quand
                  les couvertures arrivent, ce qui fait cliquer à côté. */}
              {notice.coverUrl ? (
                <img
                  className={styles.ficheCouverture}
                  src={notice.coverUrl}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  decoding="async"
                  width={160}
                  height={220}
                />
              ) : (
                /* Repli LISIBLE, jamais un cadre vide : le titre tient
                   lieu de couverture, ce qui reste une information. */
                <span className={styles.ficheSansCouverture} aria-hidden="true">
                  {notice.title}
                </span>
              )}
              <span className={styles.ficheTexte}>
                <b>{notice.title}</b>
                <span className={styles.ficheMeta}>
                  {LIBELLES.acquisitions.auteurEtAnnee(notice.author, notice.publishYear)}
                </span>
                <span className={styles.fichePuce}>{notice.recordType}</span>
              </span>
            </a>
          ))}
        </div>
      </div>
    </section>
    </>
  );
}

async function Constellation({ tenantName }: { tenantName: string }) {
  const constellation = await fetchConstellation();
  // Trois états distincts, jamais confondus : `null` = l'API n'a pas répondu,
  // liste vide = le catalogue est réellement vide, liste peuplée = on affiche.
  const catalogueInconnu = constellation === null;
  const domains = constellation ? constellation.domains : [];
  const hasSavoirs = domains.length > 0;
  const home = { name: tenantName };
  return (
    <>
  {/* ---------- CONSTELLATION DES SAVOIRS (animée, dynamique) ---------- */}
  {hasSavoirs && constellation && (
    <ConstellationSection
      id="savoirs"
      domains={domains}
      totalRecords={constellation.totalRecords}
      tenantName={home.name}
    />
  )}

  {/* L'API n'a pas répondu : on le DIT. Ne rien afficher présenterait la
      page comme complète, et un visiteur en conclurait que la
      bibliothèque n'a pas de catalogue. Le lien reste actionnable — la
      recherche peut fonctionner alors que cette seule route a échoué. */}
  {catalogueInconnu && (
    <section id="savoirs" className={styles.section}>
      <div className={styles.wrap} style={{ textAlign: 'center' }}>
        <h2>{LIBELLES.accueil.catalogueIndisponibleTitre}</h2>
        <p className={styles.lead} style={{ margin: '8px auto 0' }}>
          {LIBELLES.accueil.catalogueIndisponibleTexte}
        </p>
        <div style={{ marginTop: 20 }}>
          <a href="/opac" className={`${styles.btn} ${styles.btnPrimary}`}>
            {LIBELLES.accueil.ouvrirCatalogue}
          </a>
        </div>
      </div>
    </section>
  )}
    </>
  );
}

async function Chiffres() {
  const chiffres = await fetchChiffres();
  if (tuilesSignificatives(chiffres).length === 0) return null;
  return (
    <>
  {/* ---------- CHIFFRES DU FONDS ----------
      Une tuile n'apparaît que si son chiffre est significatif, et si
      AUCUNE ne l'est, la section entière disparaît. Une bibliothèque qui
      démarre montre deux tuiles au lieu de quatre — elle ne montre pas
      « 12 documents » devant un comité. */}
  
    <section className={styles.chiffres} aria-label={LIBELLES.chiffres.documents}>
      {tuilesSignificatives(chiffres).map((tuile) => (
        <div key={tuile.cle} className={styles.chiffre}>
          <b>{formaterNombre(tuile.valeur)}</b>
          <span>{LIBELLES.chiffres[tuile.cle]}</span>
        </div>
      ))}
    </section>
    </>
  );
}

export function SectionAcquisitions() {
  return (
    <Suspense fallback={null}>
      <Acquisitions />
    </Suspense>
  );
}

export function SectionConstellation({ tenantName }: { tenantName: string }) {
  return (
    <Suspense fallback={<ReplisConstellation />}>
      <Constellation tenantName={tenantName} />
    </Suspense>
  );
}

export function SectionChiffres() {
  return (
    <Suspense fallback={null}>
      <Chiffres />
    </Suspense>
  );
}
