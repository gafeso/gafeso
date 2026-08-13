'use client';

// Lecteur EPUB — react-reader (epub.js). Choisi plutôt que Thorium Web
// (@edrlab/thorium-web) car ce dernier exige React 19 + Next 16 (incompatible
// avec ce projet en React 18 / Next 14) et ne couvre de toute façon pas le PDF.
// react-reader accepte directement une URL de fichier .epub (pas de manifeste
// Readium à générer côté serveur) et couvre déjà navigation, table des
// matières et thème.
//
// Remplit tout son conteneur (h-full) : c'est la page appelante qui fixe la
// hauteur disponible sous son propre en-tête.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Rendition } from 'epubjs';
import { IReactReaderStyle, ReactReader, ReactReaderStyle } from 'react-reader';

// Variante sombre : ne touche qu'aux couleurs, jamais aux propriétés de mise
// en page (position/taille) du thème par défaut du paquet.
const darkReaderTheme: IReactReaderStyle = {
  ...ReactReaderStyle,
  readerArea: { ...ReactReaderStyle.readerArea, backgroundColor: '#1a1a2e', transition: 'none' },
  titleArea: { ...ReactReaderStyle.titleArea, color: '#9aa0b4' },
  arrow: { ...ReactReaderStyle.arrow, color: '#777' },
  arrowHover: { ...ReactReaderStyle.arrowHover, color: '#aaa' },
  tocArea: { ...ReactReaderStyle.tocArea, background: '#20202f' },
  tocAreaButton: {
    ...ReactReaderStyle.tocAreaButton,
    color: '#ddd',
    borderBottom: '1px solid #33334a',
  },
  tocButtonExpanded: { ...ReactReaderStyle.tocButtonExpanded, background: '#2a2a3d' },
  loadingView: { ...ReactReaderStyle.loadingView, color: '#ccc' },
  errorView: { ...ReactReaderStyle.errorView, color: '#ff6b6b' },
};

function locationStorageKey(recordId: string): string {
  return `bc-epub-location-${recordId}`;
}

export function EpubReader({ url, recordId }: { url: string; recordId: string }) {
  const [location, setLocation] = useState<string | number | null>(null);
  const [night, setNight] = useState(false);
  const renditionRef = useRef<Rendition | null>(null);

  // Reprend la lecture où l'utilisateur s'était arrêté (persistance locale —
  // pas de données à conserver côté serveur pour un simple signet de lecture).
  useEffect(() => {
    const saved = window.localStorage.getItem(locationStorageKey(recordId));
    if (saved) setLocation(saved);
  }, [recordId]);

  const onLocationChanged = useCallback(
    (value: string) => {
      setLocation(value);
      window.localStorage.setItem(locationStorageKey(recordId), value);
    },
    [recordId],
  );

  const getRendition = useCallback((rendition: Rendition) => {
    renditionRef.current = rendition;
    rendition.themes.register('night', {
      body: { background: '#1a1a2e', color: '#dcdce6' },
      a: { color: '#8ab4f8 !important' },
    });
    rendition.themes.select('night'); // état initial synchronisé au montage
  }, []);

  function toggleNight() {
    const next = !night;
    setNight(next);
    renditionRef.current?.themes.select(next ? 'night' : 'default'); // 'default' = thème vide intégré à epub.js
  }

  return (
    <div className="relative h-full">
      <button
        type="button"
        onClick={toggleNight}
        aria-pressed={night}
        className={`absolute right-3 top-3 z-10 rounded-full px-3 py-1.5 text-sm font-semibold shadow-md transition-colors ${
          night
            ? 'bg-white/10 text-white hover:bg-white/20'
            : 'bg-white text-ink hover:bg-line/60'
        }`}
      >
        {night ? '☀️ Jour' : '🌙 Nuit'}
      </button>
      <ReactReader
        url={url}
        // Force le type EPUB explicitement : la détection automatique
        // d'epub.js devine le format depuis l'extension de l'URL, mais notre
        // URL signée MinIO porte un paramètre response-content-disposition
        // contenant lui-même « ....epub » — une seconde occurrence qui la
        // fait échouer (elle tente alors d'ouvrir l'URL comme un DOSSIER
        // décompressé et va chercher META-INF/container.xml en relatif,
        // 403). On connaît déjà le format via l'API : pas besoin de sniffing.
        epubInitOptions={{ openAs: 'epub' }}
        location={location}
        locationChanged={onLocationChanged}
        getRendition={getRendition}
        showToc
        readerStyles={night ? darkReaderTheme : ReactReaderStyle}
      />
    </div>
  );
}
