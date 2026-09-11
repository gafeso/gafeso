'use client';

// Bandeau d'accueil à plusieurs diapositives.
//
// ════════════════════════════════════════════════════════════════════════════
// LA CONTRAINTE QUI COMMANDE CE FICHIER
// ════════════════════════════════════════════════════════════════════════════
// Sur mobile, les images non affichées ne doivent JAMAIS ÊTRE TÉLÉCHARGÉES.
// Le catalogue public est consulté en 3G, sur des téléphones d'entrée de gamme :
// un bandeau qui triple le poids de la page annule le travail de frugalité.
//
// D'où le mécanisme : les diapositives 2..N ne sont PAS masquées, elles ne sont
// PAS MONTÉES. `display:none` ne coûte rien à l'écran et coûte tout au réseau —
// une image masquée est dans le document, donc téléchargée. Ici la décision est
// prise AVANT que l'image n'entre dans le DOM.
//
// Ne remplacez pas ce montage conditionnel par du CSS : le test
// tests/hero-bandeau.spec.tsx compte les <img> montés, et il tombera.
// ════════════════════════════════════════════════════════════════════════════
//
// La page d'accueil est un Server Component : la largeur d'écran n'y est pas
// connue. Le choix se fait donc après hydratation (`matchMedia`), ce qui a un
// effet secondaire souhaitable — le HTML servi ne contient que la première
// image, et les suivantes sont différées même sur grand écran.
//
// ✅ MESURÉ le 10 septembre 2026, sur build de production, avec trois
// diapositives réellement stockées — requêtes comptées, pas déduites :
//   375 px  → UNE requête d'image. Les deux autres URL n'existent dans le
//             document qu'en chaînes de la charge d'hydratation : des données,
//             pas des éléments, donc rien à télécharger.
//   large   → TROIS requêtes, la première `eager`, les suivantes `lazy`.
// Les tests, eux, comptent les <img> MONTÉS : c'est le bon proxy du mécanisme,
// ce n'est pas la mesure. Les deux se complètent, aucun ne remplace l'autre.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Diapositive } from '@/lib/hero-slides';
import styles from '@/app/home.module.css';
import { LIBELLES } from '@/lib/libelles';

/** Au-delà de cette largeur, on considère qu'il y a place pour un défilement. */
const SEUIL_LARGE = '(min-width: 768px)';
const ROTATION_MS = 7000; // 6 à 8 s : assez lent pour être lu, pas pour lasser

function useMediaQuery(requete: string): boolean {
  const [correspond, setCorrespond] = useState(false);
  useEffect(() => {
    // jsdom (et de vieux navigateurs) n'implémentent pas matchMedia : sans ce
    // garde-fou le bandeau planterait au lieu de se dégrader.
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(requete);
    const suivre = () => setCorrespond(mq.matches);
    suivre();
    mq.addEventListener?.('change', suivre);
    return () => mq.removeEventListener?.('change', suivre);
  }, [requete]);
  return correspond;
}

export function HeroBandeau({
  diapositives,
  lattice = false,
  plein = false,
  accroche,
  actions,
}: {
  diapositives: Diapositive[];
  /** Motif décoratif de l'établissement, superposé au visuel (réglage thème). */
  lattice?: boolean;
  /**
   * Bandeau PLEINE LARGEUR, texte par-dessus l'image, avec flèches.
   * Sans lui, le bandeau reste le cadre encarté d'origine — les deux formes
   * partagent le même moteur, donc la même garantie d'une seule requête sur
   * mobile. C'est la raison de ne pas avoir écrit un second composant.
   */
  plein?: boolean;
  /** Phrase de l'établissement, constante d'une diapositive à l'autre. */
  accroche?: string;
  /** Boutons d'action. Affichés sur la PREMIÈRE diapositive seulement. */
  actions?: React.ReactNode;
}) {
  const large = useMediaQuery(SEUIL_LARGE);
  const moinsDAnimation = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [echecs, setEchecs] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [enPause, setEnPause] = useState(false);
  const minuterie = useRef<ReturnType<typeof setInterval> | null>(null);

  const signalerEchec = useCallback((url: string) => {
    setEchecs((prev) => (prev.includes(url) ? prev : [...prev, url]));
  }, []);

  // Sur MOBILE, seule la première diapositive est montée. Si son image échoue,
  // on n'affiche RIEN — on ne va pas chercher la suivante : ce serait une
  // seconde requête, c'est-à-dire exactement le coût que ce bandeau existe pour
  // éviter. Un bandeau absent vaut mieux qu'un bandeau qui coûte deux images.
  // Sur GRAND ÉCRAN, les diapositives suivantes sont déjà là : une image en
  // échec est simplement retirée du défilement, les autres continuent.
  const valides = diapositives.filter((d) => !echecs.includes(d.imageUrl));
  // ⚠ Sur mobile, la SEULE candidate est la première : on ne « remonte » jamais
  // la suivante. Filtrer puis prendre la tête ferait exactement cela — et
  // déclencherait la seconde requête que ce composant existe pour éviter.
  const premiereEnEchec =
    diapositives.length > 0 && echecs.includes(diapositives[0].imageUrl);
  const affichees = large
    ? valides
    : premiereEnEchec
      ? []
      : diapositives.slice(0, 1);

  const defilable = large && affichees.length > 1;
  const anime = defilable && !moinsDAnimation && !enPause;

  useEffect(() => {
    if (!anime) return;
    minuterie.current = setInterval(
      () => setIndex((i) => (i + 1) % affichees.length),
      ROTATION_MS,
    );
    return () => {
      if (minuterie.current) clearInterval(minuterie.current);
    };
  }, [anime, affichees.length]);

  // Une diapositive retirée (échec) peut laisser l'index hors des bornes.
  useEffect(() => {
    if (index >= affichees.length && affichees.length > 0) setIndex(0);
  }, [index, affichees.length]);

  // Rien à montrer ⇒ rien du tout. Pas de cadre, pas de fond, pas d'espace
  // réservé : un élément décoratif vide se lit comme un contenu qui n'a pas
  // chargé — c'est le défaut du dégradé orange, déjà payé une fois.
  if (affichees.length === 0) return null;

  const courante = affichees[Math.min(index, affichees.length - 1)];
  const aller = (delta: number) =>
    setIndex((i) => (i + delta + affichees.length) % affichees.length);

  return (
    <div
      className={plein ? styles.heroPlein : styles.heroFrame}
      onMouseEnter={() => setEnPause(true)}
      onMouseLeave={() => setEnPause(false)}
      onFocus={() => setEnPause(true)}
      onBlur={() => setEnPause(false)}
      {...(plein
        ? { 'aria-roledescription': 'carrousel', 'aria-label': LIBELLES.bandeau.region }
        : {})}
    >
      {affichees.map((d, i) => (
        <img
          key={d.imageUrl}
          className={styles.heroPhoto}
          src={d.imageUrl}
          // Images DÉCORATIVES : alt vide, aucun lien. Le texte lisible est le
          // titre et le surtitre, rendus à côté.
          alt=""
          aria-hidden="true"
          loading={i === 0 ? 'eager' : 'lazy'}
          decoding="async"
          onError={() => signalerEchec(d.imageUrl)}
          style={{ opacity: i === index ? 1 : 0, transition: 'opacity .6s ease' }}
        />
      ))}

      {lattice && <div className={styles.latticeBg} />}

      {/* ⚠ LE VOILE. Il n'est pas décoratif : c'est lui qui garantit la
          lisibilité du texte blanc, quelle que soit l'image. Son opacité sous
          le texte ne descend pas sous 0,55 — au-dessus d'une photo BLANCHE
          (pire cas), cela donne 4,76:1, soit au-dessus du seuil AA de 4,5:1.
          En dessous de 0,535 la garantie tombe : ne pas l'éclaircir « parce
          que la photo actuelle est sombre », la photo change et la garantie
          doit tenir sans elle. Mesuré, voir tests/hero-contraste.spec.ts. */}
      {plein && <div className={styles.heroVoile} aria-hidden="true" />}

      {plein ? (
        <div className={styles.heroTexte}>
          {courante.surtitre && <p className={styles.heroSurtitre}>{courante.surtitre}</p>}
          {courante.titre && <h1 className={styles.heroTitre}>{courante.titre}</h1>}
          {accroche && <p className={styles.heroAccroche}>{accroche}</p>}
          {/* Les actions n'accompagnent que la PREMIÈRE diapositive : répétées
              sur chacune, elles cessent d'être un appel et deviennent un décor. */}
          {index === 0 && actions ? <div className={styles.heroActions}>{actions}</div> : null}
        </div>
      ) : (
        (courante.titre || courante.surtitre) && (
          <div className={styles.caption}>
            {courante.surtitre && <div className={styles.mono}>{courante.surtitre}</div>}
            {courante.titre && <div className={styles.title}>{courante.titre}</div>}
          </div>
        )
      )}

      {defilable && plein && (
        <>
          <button
            type="button"
            className={`${styles.heroFleche} ${styles.heroFlecheG}`}
            aria-label={LIBELLES.bandeau.precedente}
            onClick={() => aller(-1)}
          >
            ‹
          </button>
          <button
            type="button"
            className={`${styles.heroFleche} ${styles.heroFlecheD}`}
            aria-label={LIBELLES.bandeau.suivante}
            onClick={() => aller(1)}
          >
            ›
          </button>
        </>
      )}

      {defilable && (
        <div className={styles.heroDots} role="group" aria-label={LIBELLES.bandeau.choisirImage}>
          {affichees.map((d, i) => (
            <button
              key={d.imageUrl}
              type="button"
              className={styles.heroDot}
              aria-label={LIBELLES.bandeau.imageSur(i + 1, affichees.length)}
              aria-current={i === index ? 'true' : undefined}
              data-actif={i === index ? 'oui' : undefined}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}