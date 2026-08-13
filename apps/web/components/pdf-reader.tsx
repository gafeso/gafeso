'use client';

// Lecteur PDF — pdf.js (rendu en canvas), défilement continu VIRTUALISÉ.
// Remplace le visualiseur natif du navigateur (décision 2026-07-10) : une
// bibliothèque de thèses veut une lecture en ligne SANS
// téléchargement trivial. Le rendu canvas n'expose aucun bouton de
// téléchargement, il n'y a PAS de couche texte sélectionnable (pas de
// copier-coller — la recherche surligne via un calque dessiné par-dessus,
// voir plus bas), et le clic droit est neutralisé.
//
// HONNÊTETÉ (assumée, cf. docs/architecture-securite-offline.md §1
// « proportionnalité, pas inviolabilité ») : ce n'est PAS un DRM. L'URL signée
// transite par le navigateur (TTL court côté API) et la capture d'écran
// reste possible. L'objectif est d'empêcher le téléchargement d'un simple
// clic ; le verrou cryptographique, c'est le DRM Readium LCP (phase 3).
//
// Le fichier est téléchargé UNE FOIS en mémoire (fetch → ArrayBuffer) dès le
// montage, pendant la courte fenêtre de validité de l'URL signée (5 min) :
// pdf.js ne refait ensuite AUCUNE requête vers MinIO — une session de
// lecture peut durer des heures sans renouvellement d'URL, c'est le modèle
// voulu (pas de requêtes Range qui expireraient en cours de session).
//
// FLUIDITÉ (documents de plusieurs centaines de pages) : les pages sont des
// blocs de hauteur connue dans un conteneur défilant ; seules les pages
// VISIBLES ± 2 voisines ont un canvas rendu (les autres sont des
// emplacements vides) — voir visibleRange/activeRange.

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
// Imports de TYPES uniquement (effacés à la compilation) : le module pdf.js
// lui-même est chargé nativement au runtime — voir loadPdfJs().
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { Input } from '@/components/ui';

type PdfJs = typeof import('pdfjs-dist');

// Ressources pdf.js servies depuis public/pdfjs/ (auto-hébergées — pas de
// CDN), copiées de node_modules par scripts/copy-pdfjs-assets.mjs (hooks
// predev/prebuild — voir ce script pour la raison de NE PAS bundler
// pdfjs-dist via webpack : build et exécution cassés avec Next 14).
const PDFJS_BASE = '/pdfjs';

let pdfjsPromise: Promise<PdfJs> | null = null;

/** Charge pdf.js par import ESM natif du navigateur, hors bundler (une fois). */
function loadPdfJs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    const moduleUrl = `${PDFJS_BASE}/pdf.min.mjs`;
    // webpackIgnore : laisse l'import() au navigateur, webpack n'y touche pas.
    pdfjsPromise = import(/* webpackIgnore: true */ moduleUrl).then((pdfjs: PdfJs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}/pdf.worker.min.mjs`;
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
const DEFAULT_ZOOM_INDEX = 2; // 100 %
const PAGE_GAP = 16; // espace vertical entre pages (px CSS)
const NEIGHBOR_PAGES = 2; // pages pré-rendues de part et d'autre du visible

/** Largeur d'affichage d'une page : bornée pour rester lisible sur grand écran. */
function pageCssWidth(containerWidth: number, zoom: number): number {
  return Math.min(Math.max(containerWidth - 32, 280), 900) * zoom;
}

/** Taille de base d'une page (viewport pdf.js à l'échelle 1). */
interface PageSize {
  width: number;
  height: number;
}

/** Rectangle en ESPACE PDF (origine en bas à gauche) : [x1, y1, x2, y2]. */
type PdfRect = [number, number, number, number];

/** Une occurrence de recherche : sa page et ses rectangles à surligner. */
interface SearchMatch {
  page: number;
  rects: PdfRect[];
}

/** Texte d'une page prêt pour la recherche (extrait une seule fois). */
interface PageText {
  /** Texte concaténé, plié (minuscules sans accents) — les index y sont alignés sur `bounds`. */
  folded: string;
  bounds: {
    start: number;
    end: number;
    item: { x: number; y: number; width: number; height: number; length: number };
  }[];
}

/**
 * Pliage caractère PAR caractère (minuscules, accents retirés) : préserve les
 * index — indispensable pour retrouver les rectangles des occurrences.
 */
function foldText(text: string): string {
  let out = '';
  for (const ch of text) {
    const folded = ch.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    out += folded.length === 1 ? folded : ch.toLowerCase();
  }
  return out;
}

export function PdfReader({ url, title }: { url: string; title: string }) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  // Taille par défaut (celle de la page 1) + tailles réelles mesurées au
  // rendu — la plupart des documents sont uniformes, les écarts sont rares.
  const [defaultSize, setDefaultSize] = useState<PageSize | null>(null);
  const [measuredSizes, setMeasuredSizes] = useState<Record<number, PageSize>>({});

  // Saisie du numéro de page (champ contrôlé, synchronisé sur le défilement).
  const [pageDraft, setPageDraft] = useState('1');
  const [pageDraftFocused, setPageDraftFocused] = useState(false);

  // Recherche plein texte.
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [currentMatch, setCurrentMatch] = useState(-1);
  const [searchedQuery, setSearchedQuery] = useState('');
  const textCache = useRef<Map<number, PageText>>(new Map());

  const containerRef = useRef<HTMLDivElement>(null);

  // ── Chargement : pdf.js (natif) + le document en mémoire, en parallèle ──
  useEffect(() => {
    let cancelled = false;
    let loadedDoc: PDFDocumentProxy | null = null;
    const controller = new AbortController();

    Promise.all([
      loadPdfJs(),
      fetch(url, { signal: controller.signal }).then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      }),
    ])
      .then(async ([pdfjs, buffer]) => {
        const loaded = await pdfjs.getDocument({
          data: new Uint8Array(buffer),
          // Ressources à la demande du worker (polices CJK, JPEG2000/JBIG2
          // des PDF scannés, profils ICC) — voir copy-pdfjs-assets.mjs.
          cMapUrl: `${PDFJS_BASE}/cmaps/`,
          cMapPacked: true,
          standardFontDataUrl: `${PDFJS_BASE}/standard_fonts/`,
          wasmUrl: `${PDFJS_BASE}/wasm/`,
          iccUrl: `${PDFJS_BASE}/iccs/`,
        }).promise;
        if (cancelled) {
          void loaded.loadingTask.destroy();
          return;
        }
        const first = await loaded.getPage(1);
        const base = first.getViewport({ scale: 1 });
        if (cancelled) {
          void loaded.loadingTask.destroy();
          return;
        }
        loadedDoc = loaded;
        setDefaultSize({ width: base.width, height: base.height });
        setDoc(loaded);
        setNumPages(loaded.numPages);
      })
      .catch((err: Error) => {
        if (!cancelled && err.name !== 'AbortError') {
          setError(
            'Le document n’a pas pu être chargé. Retournez à la fiche et relancez la lecture.',
          );
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
      if (loadedDoc) void loadedDoc.loadingTask.destroy();
    };
  }, [url]);

  // ── Dimensions du conteneur, suivies en continu ──
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const measure = () => {
      setContainerWidth(element.clientWidth);
      setContainerHeight(element.clientHeight);
    };
    // Mesure immédiate + repli sur l'événement resize : certains
    // environnements (navigateur de preview headless) ne délivrent pas
    // l'entrée initiale du ResizeObserver — constaté en testant.
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  // ── Géométrie : hauteur CSS et position de chaque page (virtualisation) ──
  const zoom = ZOOM_LEVELS[zoomIndex];
  const cssWidth = containerWidth > 0 ? pageCssWidth(containerWidth, zoom) : 0;

  const sizeOf = useCallback(
    (page: number): PageSize => measuredSizes[page] ?? defaultSize ?? { width: 1, height: 1.4 },
    [measuredSizes, defaultSize],
  );

  // Identité STABLE (l'effet de rendu de PdfPage en dépend) : une fonction
  // recréée à chaque rendu du parent relancerait/annulerait les rendus en
  // boucle — pages jamais peintes, constaté en testant.
  const reportSize = useCallback((page: number, measured: PageSize) => {
    setMeasuredSizes((prev) => {
      const known = prev[page];
      if (known?.width === measured.width && known?.height === measured.height) return prev;
      return { ...prev, [page]: measured };
    });
  }, []);

  /** offsets[n-1] = position du HAUT de la page n dans le conteneur. */
  const { offsets, totalHeight } = useMemo(() => {
    const tops: number[] = [];
    let y = PAGE_GAP;
    for (let n = 1; n <= numPages; n++) {
      tops.push(y);
      const size = sizeOf(n);
      y += (cssWidth / size.width) * size.height + PAGE_GAP;
    }
    return { offsets: tops, totalHeight: y };
  }, [numPages, cssWidth, sizeOf]);

  /** Première/dernière pages visibles + page « courante » (tiers haut de l'écran). */
  const { firstVisible, lastVisible, currentPage } = useMemo(() => {
    if (numPages === 0 || cssWidth === 0) {
      return { firstVisible: 1, lastVisible: 1, currentPage: 1 };
    }
    const viewTop = scrollTop;
    const viewBottom = scrollTop + containerHeight;
    const anchor = scrollTop + containerHeight * 0.3;
    let first = numPages;
    let last = 1;
    let current = 1;
    for (let n = 1; n <= numPages; n++) {
      const top = offsets[n - 1];
      const size = sizeOf(n);
      const bottom = top + (cssWidth / size.width) * size.height;
      if (bottom >= viewTop && top <= viewBottom) {
        first = Math.min(first, n);
        last = Math.max(last, n);
      }
      if (top <= anchor) current = n;
    }
    return {
      firstVisible: Math.min(first, last),
      lastVisible: last,
      currentPage: current,
    };
  }, [numPages, cssWidth, scrollTop, containerHeight, offsets, sizeOf]);

  // Le champ page suit le défilement tant qu'il n'est pas en cours d'édition.
  useEffect(() => {
    if (!pageDraftFocused) setPageDraft(String(currentPage));
  }, [currentPage, pageDraftFocused]);

  const jumpToPage = useCallback(
    (page: number) => {
      const target = Math.min(Math.max(1, page), numPages || 1);
      const top = offsets[target - 1] - PAGE_GAP;
      containerRef.current?.scrollTo({ top });
      // Synchronisation immédiate de l'état : la virtualisation cible la bonne
      // fenêtre sans attendre l'événement scroll du frame suivant.
      setScrollTop(top);
    },
    [numPages, offsets],
  );

  // ── Navigation clavier ← / → ──
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // Ne pas voler les flèches à un champ de saisie (page, recherche).
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      if (event.key === 'ArrowLeft') jumpToPage(currentPage - 1);
      if (event.key === 'ArrowRight') jumpToPage(currentPage + 1);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentPage, jumpToPage]);

  // ── Recherche plein texte ──
  const getPageText = useCallback(
    async (pdfDoc: PDFDocumentProxy, page: number): Promise<PageText> => {
      const cached = textCache.current.get(page);
      if (cached) return cached;
      const pdfPage = await pdfDoc.getPage(page);
      const content = await pdfPage.getTextContent();
      let folded = '';
      const bounds: PageText['bounds'] = [];
      for (const raw of content.items) {
        const item = raw as {
          str?: string;
          transform?: number[];
          width?: number;
          height?: number;
        };
        if (!item.str || !item.transform) continue;
        const start = folded.length;
        folded += foldText(item.str);
        bounds.push({
          start,
          end: folded.length,
          item: {
            x: item.transform[4],
            y: item.transform[5],
            width: item.width ?? 0,
            height: item.height ?? (Math.abs(item.transform[3]) || 10),
            length: item.str.length,
          },
        });
        folded += ' '; // séparateur entre items (les PDF coupent les lignes en morceaux)
      }
      const text: PageText = { folded, bounds };
      textCache.current.set(page, text);
      return text;
    },
    [],
  );

  /** Rectangles PDF d'une occurrence [start, end) — largeur au prorata des caractères. */
  function rectsForRange(text: PageText, start: number, end: number): PdfRect[] {
    const rects: PdfRect[] = [];
    for (const bound of text.bounds) {
      if (bound.end <= start || bound.start >= end) continue;
      const { item } = bound;
      if (item.length === 0 || item.width === 0) continue;
      const from = Math.max(start, bound.start) - bound.start;
      const to = Math.min(end, bound.end) - bound.start;
      const x1 = item.x + (from / item.length) * item.width;
      const x2 = item.x + (to / item.length) * item.width;
      rects.push([x1, item.y, x2, item.y + item.height]);
    }
    return rects;
  }

  const runSearch = useCallback(async () => {
    if (!doc) return;
    const needle = foldText(query.trim());
    setSearchedQuery(query.trim());
    if (!needle) {
      setMatches([]);
      setCurrentMatch(-1);
      return;
    }
    setSearching(true);
    try {
      const found: SearchMatch[] = [];
      // Extraction page par page (mise en cache) : quelques secondes au
      // premier passage sur un gros document, instantané ensuite.
      for (let page = 1; page <= doc.numPages; page++) {
        const text = await getPageText(doc, page);
        let index = 0;
        while ((index = text.folded.indexOf(needle, index)) !== -1) {
          found.push({ page, rects: rectsForRange(text, index, index + needle.length) });
          index += needle.length;
        }
      }
      setMatches(found);
      setCurrentMatch(found.length > 0 ? 0 : -1);
      if (found.length > 0) jumpToPage(found[0].page);
    } finally {
      setSearching(false);
    }
  }, [doc, query, getPageText, jumpToPage]);

  const gotoMatch = useCallback(
    (index: number) => {
      if (matches.length === 0) return;
      const wrapped = (index + matches.length) % matches.length;
      setCurrentMatch(wrapped);
      jumpToPage(matches[wrapped].page);
    },
    [matches, jumpToPage],
  );

  // Occurrences par page (pour les calques), avec leur rang global.
  const matchesByPage = useMemo(() => {
    const map = new Map<number, { rects: PdfRect[]; globalIndex: number }[]>();
    matches.forEach((match, globalIndex) => {
      const list = map.get(match.page) ?? [];
      list.push({ rects: match.rects, globalIndex });
      map.set(match.page, list);
    });
    return map;
  }, [matches]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <p role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      </div>
    );
  }

  const activeFirst = Math.max(1, firstVisible - NEIGHBOR_PAGES);
  const activeLast = Math.min(numPages, lastVisible + NEIGHBOR_PAGES);

  return (
    <div
      className="flex h-full flex-col"
      role="region"
      aria-label={`Lecture : ${title}`}
      // Dissuasion du « Enregistrer sous » : pas de menu contextuel dans le
      // lecteur (pages rendues en canvas).
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="flex min-h-11 shrink-0 flex-wrap items-center justify-center gap-x-4 gap-y-1 border-b border-line bg-white px-4 py-1 text-sm">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => jumpToPage(currentPage - 1)}
            disabled={currentPage <= 1}
            className="rounded px-2 py-1 font-semibold text-ink hover:bg-line/60 disabled:opacity-40"
            aria-label="Page précédente"
          >
            ←
          </button>
          <span className="flex items-center gap-1 tabular-nums text-muted">
            <input
              value={pageDraft}
              onChange={(e) => setPageDraft(e.target.value.replace(/\D/g, ''))}
              onFocus={(e) => {
                setPageDraftFocused(true);
                e.target.select();
              }}
              onBlur={() => setPageDraftFocused(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const page = Number(pageDraft);
                  if (page >= 1) jumpToPage(page);
                  (e.target as HTMLInputElement).blur();
                }
              }}
              className="w-12 rounded border border-line px-1 py-0.5 text-center text-sm"
              aria-label="Numéro de page (Entrée pour y aller)"
              inputMode="numeric"
            />
            / {numPages || '…'}
          </span>
          <button
            type="button"
            onClick={() => jumpToPage(currentPage + 1)}
            disabled={numPages > 0 && currentPage >= numPages}
            className="rounded px-2 py-1 font-semibold text-ink hover:bg-line/60 disabled:opacity-40"
            aria-label="Page suivante"
          >
            →
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setZoomIndex((i) => Math.max(0, i - 1))}
            disabled={zoomIndex === 0}
            className="rounded px-2 py-1 font-semibold text-ink hover:bg-line/60 disabled:opacity-40"
            aria-label="Réduire"
          >
            −
          </button>
          <span className="w-12 text-center tabular-nums text-muted">
            {Math.round(zoom * 100)} %
          </span>
          <button
            type="button"
            onClick={() => setZoomIndex((i) => Math.min(ZOOM_LEVELS.length - 1, i + 1))}
            disabled={zoomIndex === ZOOM_LEVELS.length - 1}
            className="rounded px-2 py-1 font-semibold text-ink hover:bg-line/60 disabled:opacity-40"
            aria-label="Agrandir"
          >
            +
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="w-48">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  // Même requête déjà cherchée → occurrence suivante.
                  if (query.trim() === searchedQuery && matches.length > 0) gotoMatch(currentMatch + 1);
                  else void runSearch();
                }
              }}
              placeholder="Rechercher dans le document"
              aria-label="Rechercher dans le document"
              className="py-1"
            />
          </div>
          {searching ? (
            <span className="text-xs text-muted">Recherche…</span>
          ) : (
            searchedQuery && (
              <span className="tabular-nums text-xs text-muted" aria-live="polite">
                {matches.length === 0
                  ? 'Aucun résultat'
                  : `${currentMatch + 1} / ${matches.length}`}
              </span>
            )
          )}
          <button
            type="button"
            onClick={() => gotoMatch(currentMatch - 1)}
            disabled={matches.length === 0}
            className="rounded px-1.5 py-1 font-semibold text-ink hover:bg-line/60 disabled:opacity-40"
            aria-label="Résultat précédent"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => gotoMatch(currentMatch + 1)}
            disabled={matches.length === 0}
            className="rounded px-1.5 py-1 font-semibold text-ink hover:bg-line/60 disabled:opacity-40"
            aria-label="Résultat suivant"
          >
            ›
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
        className="min-h-0 flex-1 overflow-auto bg-slate-700"
      >
        {!doc && (
          <p className="mt-12 text-center text-sm text-slate-300">Chargement du document…</p>
        )}
        {doc && cssWidth > 0 && (
          <div className="relative mx-auto" style={{ height: totalHeight, width: cssWidth }}>
            {Array.from({ length: numPages }, (_, i) => i + 1).map((page) => {
              const size = sizeOf(page);
              const height = (cssWidth / size.width) * size.height;
              const active = page >= activeFirst && page <= activeLast;
              return (
                <div
                  key={page}
                  className="absolute left-0 bg-white shadow-xl"
                  style={{ top: offsets[page - 1], width: cssWidth, height }}
                  data-page={page}
                >
                  {active ? (
                    <PdfPage
                      doc={doc}
                      page={page}
                      cssWidth={cssWidth}
                      baseSize={size}
                      onMeasured={reportSize}
                      highlights={matchesByPage.get(page) ?? []}
                      currentMatch={currentMatch}
                    />
                  ) : (
                    // Emplacement vide : la page sera rendue en approchant.
                    <Fragment />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Une page rendue : canvas + calque de surlignage de la recherche.
 * Le calque est fait de <div> semi-transparents SANS texte, pointer-events
 * none — il ne réintroduit ni sélection ni copie (contrairement à la couche
 * texte de pdf.js, volontairement absente).
 */
function PdfPage({
  doc,
  page,
  cssWidth,
  baseSize,
  onMeasured,
  highlights,
  currentMatch,
}: {
  doc: PDFDocumentProxy;
  page: number;
  cssWidth: number;
  baseSize: PageSize;
  onMeasured: (page: number, size: PageSize) => void;
  highlights: { rects: PdfRect[]; globalIndex: number }[];
  currentMatch: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let renderTask: RenderTask | null = null;
    setRendered(false);

    void doc.getPage(page).then((pdfPage) => {
      if (cancelled) return;
      const base = pdfPage.getViewport({ scale: 1 });
      onMeasured(page, { width: base.width, height: base.height });
      const devicePixelRatio = window.devicePixelRatio || 1;
      const viewport = pdfPage.getViewport({
        scale: (cssWidth / base.width) * devicePixelRatio,
      });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      // intent 'print' : rendu identique pour un canvas statique, mais SANS
      // cadencement sur requestAnimationFrame (l'intent 'display' y suspend
      // le rendu — onglet en arrière-plan = pages jamais peintes, constaté).
      renderTask = pdfPage.render({ canvas, viewport, intent: 'print' });
      renderTask.promise.then(
        () => {
          if (!cancelled) setRendered(true);
        },
        // L'annulation (défilement rapide) rejette avec
        // RenderingCancelledException — attendu, pas une erreur.
        () => undefined,
      );
    });

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [doc, page, cssWidth, onMeasured]);

  // Espace PDF (origine en bas à gauche) → CSS (origine en haut à gauche).
  const scale = cssWidth / baseSize.width;
  const toCss = (rect: PdfRect) => ({
    left: rect[0] * scale,
    top: (baseSize.height - rect[3]) * scale,
    width: (rect[2] - rect[0]) * scale,
    height: (rect[3] - rect[1]) * scale,
  });

  return (
    <div className="relative h-full w-full select-none">
      <canvas ref={canvasRef} className="h-full w-full" aria-label={`Page ${page}`} />
      {!rendered && (
        <span className="absolute left-1/2 top-8 -translate-x-1/2 text-xs text-muted">
          Page {page}…
        </span>
      )}
      {/* Calque de surlignage : dessiné PAR-DESSUS le canvas, aucun texte. */}
      {rendered && highlights.length > 0 && (
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          {highlights.flatMap(({ rects, globalIndex }) =>
            rects.map((rect, i) => {
              const css = toCss(rect);
              return (
                <div
                  key={`${globalIndex}-${i}`}
                  className={
                    globalIndex === currentMatch
                      ? 'absolute rounded-sm bg-orange-400/60'
                      : 'absolute rounded-sm bg-yellow-300/50'
                  }
                  style={{
                    left: css.left,
                    top: css.top,
                    width: Math.max(css.width, 2),
                    height: Math.max(css.height, 2),
                  }}
                />
              );
            }),
          )}
        </div>
      )}
    </div>
  );
}
