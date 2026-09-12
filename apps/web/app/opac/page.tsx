'use client';

import { FormEvent, Suspense, useCallback, useEffect, useState } from 'react';
import { ID_CONTENU } from '@/components/lien-evitement';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/session';
import { Badge, Button, Card, Input, Select } from '@/components/ui';
import { ContributorsSummary } from '@/components/contributors-summary';
import { LIBELLES } from '@/lib/libelles';

interface Hit {
  id: string;
  title: string;
  author: string | null;
  contributorList?: { name: string; role: string; authorId?: string | null }[];
  // ⚠ OPTIONNELS : /opac/parcourir ne rend ni catégorie, ni langue, ni
  // contributeurs. Les déclarer obligatoires ferait mentir le type sur la
  // moitié des réponses que cet écran reçoit.
  category?: string | null;
  language?: string;
  publishYear: number | null;
}

interface SearchResponse {
  hits: Hit[];
  totalHits: number;
  page: number;
  totalPages: number;
  /** Absentes en mode parcours : la base ne calcule pas de facettes. */
  facets?: {
    category?: Record<string, number>;
    recordType?: Record<string, number>;
  };
  /**
   * Valeurs demandées qui n'existent NULLE PART dans ce catalogue, par champ.
   *
   * ⚠ ABSENT quand tout est connu — y compris à zéro résultat. C'est ce qui
   * sépare « aucune thèse d'arts » (une vraie réponse) de « le type demandé
   * n'existe pas » (une URL périmée). Contrat de l'API, 10 septembre 2026.
   */
  filtresInconnus?: Record<string, string[]>;
}

/**
 * Nom lisible d'un champ de filtre. Repli sur la clé brute : l'API peut
 * nommer demain un champ que cet écran ne connaît pas, et écrire `publishYear`
 * reste moins faux que taire la ligne.
 */
function nomDuChamp(champ: string): string {
  const table: Record<string, string> = LIBELLES.opac.champs;
  return table[champ] ?? champ;
}

/** Résultats par page. Le maximum accepté par l'API est 100. */
const PAR_PAGE_RECHERCHE = 20;

const TYPE_LABELS: Record<string, string> = {
  memoire: 'Mémoires',
  these: 'Thèses',
  publication: 'Publications',
  ouvrage: 'Ouvrages',
};

function OpacSearch() {
  const params = useSearchParams();
  const router = useRouter();
  // La requête ACTIVE est portée par l'URL (?q=) : c'est elle qui est
  // partageable et qui pilote la recherche — cliquer un auteur navigue vers
  // /opac?q=<nom>, ce qui relance la recherche sur cet auteur.
  const urlQ = params.get('q') ?? '';
  const urlDans = params.get('dans') ?? 'tout';
  const [q, setQ] = useState(urlQ); // texte du champ (contrôlé)
  const [dans, setDans] = useState(urlDans); // mode de recherche (contrôlé)
  const [category, setCategory] = useState<string | null>(params.get('category'));
  const [recordType, setRecordType] = useState<string | null>(params.get('recordType'));
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  /**
   * Mode PARCOURS : la liste des documents numériques, servie par
   * /opac/parcourir (filtre `avecFichier`, lu en base).
   *
   * ⚠ C'est un mode, pas un filtre de recherche. /opac/search ne peut pas
   * porter ce filtre — il se lit en base, le moteur n'en sait rien, et le
   * post-filtrer rendrait totalHits et les compteurs faux. Lancer une
   * recherche QUITTE donc le parcours : le formulaire pousse une URL sans
   * `numeriques`, et l'écran repasse en recherche. C'est explicite à l'écran,
   * pas silencieux — la pastille de parcours disparaît avec le mode.
   */
  const parcours = params.get('numeriques') === '1';
  const [pageParcours, setPageParcours] = useState(1);
  /**
   * Page de la RECHERCHE — distincte de celle du parcours : les deux modes ne
   * partagent ni leur route ni leur totalité, et un compteur commun ferait
   * demander la page 7 d'un résultat qui en compte deux.
   *
   * ⚠ Paginer n'était sûr qu'une fois l'ordre vérifié STABLE. Mesuré le
   * 11 septembre 2026 sur /opac/search, en parcourant toutes les pages : 25 sur
   * 25 distinctes sur une requête plein texte, 148 sur 148 sur un filtre, et la
   * même page demandée deux fois rend le même ordre. C'est ce contrôle qui
   * manquait au catalogue professionnel, où le tri sans départage masquait
   * 20 notices.
   */
  const [pageRecherche, setPageRecherche] = useState(1);

  const search = useCallback(
    async (query: string, mode: string, cat: string | null, type: string | null, page: number) => {
      setError(null);
      try {
        const qs = new URLSearchParams();
        if (query) qs.set('q', query);
        if (mode && mode !== 'tout') qs.set('dans', mode);
        if (cat) qs.set('category', cat);
        if (type) qs.set('recordType', type);
        qs.set('page', String(page));
        qs.set('limit', String(PAR_PAGE_RECHERCHE));
        const data = await api<SearchResponse>(
          `/opac/search?${qs.toString()}`,
          {},
          getToken(),
        );
        setResult(data);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Recherche indisponible.');
      }
    },
    [],
  );

  const parcourir = useCallback(async (page: number) => {
    setError(null);
    try {
      const data = await api<SearchResponse>(
        `/opac/parcourir?avecFichier=true&page=${page}`,
        {},
        getToken(),
      );
      setResult(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Parcours indisponible.');
    }
  }, []);

  // Recale le champ quand l'URL change (ex. clic sur un lien auteur).
  useEffect(() => {
    setQ(urlQ);
    setDans(urlDans);
  }, [urlQ, urlDans]);

  // Mode « auteur » : on redirige vers l'index des auteurs (comme PMB) plutôt
  // que de chercher dans les notices.
  useEffect(() => {
    if (urlDans === 'auteur') {
      router.replace(urlQ ? `/opac/auteurs?q=${encodeURIComponent(urlQ)}` : '/opac/auteurs');
    }
  }, [urlDans, urlQ, router]);

  // Recherche à chaque changement de la requête active (URL) ou d'une facette.
  useEffect(() => {
    if (urlDans === 'auteur') return; // redirigé ci-dessus
    if (parcours) {
      void parcourir(pageParcours);
      return;
    }
    void search(urlQ, urlDans, category, recordType, pageRecherche);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlQ, urlDans, category, recordType, parcours, pageParcours, pageRecherche]);

  // ⚠ TOUT CHANGEMENT DE CRITÈRE RAMÈNE EN PAGE 1. Sans cela, affiner une
  // recherche depuis la page 7 demanderait la page 7 d'un résultat qui en
  // compte deux : une liste vide sur une recherche qui trouve.
  useEffect(() => {
    setPageRecherche(1);
  }, [urlQ, urlDans, category, recordType]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    // Mode auteur → index des auteurs. Sinon, requête + mode poussés dans l'URL.
    if (dans === 'auteur') {
      router.push(q ? `/opac/auteurs?q=${encodeURIComponent(q)}` : '/opac/auteurs');
      return;
    }
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (dans !== 'tout') qs.set('dans', dans);
    const url = qs.toString() ? `/opac?${qs}` : '/opac';
    // Même requête active : relancer directement (l'URL ne changerait pas).
    if (q === urlQ && dans === urlDans) {
      void search(q, dans, category, recordType, 1);
    } else {
      router.push(url);
    }
  }

  const facets = result?.facets?.category ?? {};
  const typeFacets = result?.facets?.recordType ?? {};

  /** Les valeurs signalées par l'API, aplaties en lignes affichables. */
  const inconnus: [string, string][] = Object.entries(result?.filtresInconnus ?? {}).flatMap(
    ([champ, valeurs]) => valeurs.map((v): [string, string] => [champ, v]),
  );

  /**
   * ⚠ Construits depuis L'ÉTAT, jamais depuis la distribution de facettes.
   * À zéro résultat le moteur ne rend aucune facette : les pastilles du haut
   * de page disparaissent exactement quand il faudrait pouvoir les décocher.
   * L'écran devenait un cul-de-sac dont on ne sortait qu'en éditant l'URL.
   *
   * Et on ne propose QUE les filtres que cet écran possède : afficher un
   * bouton pour un champ qu'il ne pilote pas donnerait une case inerte.
   */
  //
  // ⚠ `recordType` peut porter PLUSIEURS valeurs (`these,memoire,licence…`,
  // forme envoyée par les groupes de la page d'accueil). Une pastille par
  // valeur, donc : une pastille unique afficherait la liste brute séparée par
  // des virgules, et surtout retirer le groupe entier serait la seule action
  // possible là où l'API, elle, nomme les valeurs une à une.
  const typesActifs = recordType ? recordType.split(',').filter(Boolean) : [];
  const filtresActifs: { champ: string; valeur: string; libelle: string; retirer: () => void }[] = [
    ...(category
      ? [
          {
            champ: 'category',
            valeur: category,
            libelle: category,
            retirer: () => setCategory(null),
          },
        ]
      : []),
    ...typesActifs.map((t) => ({
      champ: 'recordType',
      valeur: t,
      libelle: TYPE_LABELS[t] ?? t,
      retirer: () => {
        const reste = typesActifs.filter((autre) => autre !== t);
        setRecordType(reste.length > 0 ? reste.join(',') : null);
      },
    })),
  ];

  return (
    <main id={ID_CONTENU} className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="font-serif text-3xl font-bold">Catalogue</h1>

      <form onSubmit={onSubmit} className="mt-4 flex flex-wrap gap-2">
        <div className="w-40 shrink-0">
          <Select value={dans} onChange={(e) => setDans(e.target.value)} aria-label="Champ de recherche">
            <option value="tout">Tout</option>
            <option value="titre">Titre</option>
            <option value="auteur">Auteur</option>
            <option value="categorie">Domaine</option>
          </Select>
        </div>
        <div className="min-w-[12rem] flex-1">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={
              dans === 'titre'
                ? 'Mot du titre…'
                : dans === 'auteur'
                  ? 'Nom d’auteur…'
                  : dans === 'categorie'
                    ? 'Nom de domaine…'
                    : 'Titre, auteur, ISBN…'
            }
            aria-label="Recherche dans le catalogue"
          />
        </div>
        <Button type="submit">Rechercher</Button>
      </form>

      {parcours && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-ocre/40 bg-ocre/10 px-3 py-1 text-sm font-semibold text-ocre">
            {LIBELLES.opac.parcoursNumeriques}
          </span>
          {/* La sortie. Un lien, pas un bouton : il rend l'URL de la recherche
              normale, donc il marche aussi sans JavaScript. */}
          <Link href="/opac" className="text-sm text-muted underline underline-offset-2">
            {LIBELLES.opac.parcoursQuitter}
          </Link>
        </div>
      )}

      {Object.keys(facets).length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            Domaines
          </span>
          {Object.entries(facets).map(([name, count]) => (
            <button
              key={name}
              onClick={() => setCategory(category === name ? null : name)}
              className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                category === name
                  ? 'border-ocre bg-ocre/15 font-semibold text-ocre'
                  : 'border-line bg-white text-muted hover:border-ocre/50'
              }`}
            >
              {name} · {count}
            </button>
          ))}
        </div>
      )}

      {Object.keys(typeFacets).length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            Types
          </span>
          {Object.entries(typeFacets).map(([name, count]) => (
            <button
              key={name}
              onClick={() => setRecordType(recordType === name ? null : name)}
              className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                recordType === name
                  ? 'border-ink bg-ink/10 font-semibold text-ink'
                  : 'border-line bg-white text-muted hover:border-ink/40'
              }`}
            >
              {TYPE_LABELS[name] ?? name} · {count}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-6 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      {/* ⚠ TANT QU'ON NE SAIT PAS, ON LE DIT. L'écran restait muet entre la
          saisie et la réponse : ni compte, ni liste, ni mot. En local ce
          silence dure 20 ms et ne se voit pas ; avec 1,5 s de latence, mesuré
          le 11 septembre 2026, le lecteur regarde un formulaire sans savoir si
          quelque chose se passe. C'est la même règle que partout ailleurs, et
          c'est l'écran le plus public du produit. */}
      {!result && !error && <p className="mt-6 text-sm text-muted">{LIBELLES.commun.chargement}</p>}

      {result && result.totalHits === 0 && (
        <div className="mt-6 rounded-md border border-line bg-sand/40 px-4 py-3">
          {parcours ? (
            <>
              <p className="font-semibold">{LIBELLES.opac.aucunResultat}</p>
              {/* ⚠ Pas « aucune notice ne correspond » : rien n'a été cherché.
                  Un parcours vide dit que le FONDS n'en contient pas, ce qui
                  est un fait sur le catalogue, pas sur la requête. */}
              <p className="mt-1 text-sm text-muted">
                {LIBELLES.opac.aucunDocumentNumerique}
              </p>
            </>
          ) : inconnus.length > 0 ? (
            <>
              <p className="font-semibold">
                {LIBELLES.opac.filtreInconnuTitre(inconnus.length)}
              </p>
              <ul className="mt-1 text-sm">
                {inconnus.map(([champ, valeur]) => (
                  <li key={`${champ}-${valeur}`}>
                    {LIBELLES.opac.filtreInconnuLigne(nomDuChamp(champ), valeur)}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-sm text-muted">{LIBELLES.opac.filtreInconnuTexte}</p>
            </>
          ) : (
            <>
              <p className="font-semibold">{LIBELLES.opac.aucunResultat}</p>
              <p className="mt-1 text-sm text-muted">
                {LIBELLES.opac.aucuneNoticeNeCorrespond}
              </p>
            </>
          )}

          {filtresActifs.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                {LIBELLES.opac.filtresActifs}
              </span>
              {filtresActifs.map(({ champ, valeur, libelle, retirer }) => (
                <button
                  key={`${champ}-${valeur}`}
                  onClick={retirer}
                  aria-label={LIBELLES.opac.retirerFiltre(nomDuChamp(champ), libelle)}
                  className="rounded-full border border-line bg-white px-3 py-1 text-sm text-muted hover:border-ocre/50"
                >
                  {nomDuChamp(champ)} · {libelle} ✕
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {result && result.totalHits > 0 && (
        <>
          <p className="mt-6 text-sm text-muted">
            {result.totalHits} résultat{result.totalHits > 1 ? 's' : ''}
          </p>
          <div className="mt-3 flex flex-col gap-3">
            {result.hits.map((hit) => (
              <Card key={hit.id} className="transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-serif text-lg font-bold">
                      <Link href={`/opac/${hit.id}`} className="hover:text-ocre">
                        {hit.title}
                      </Link>
                    </h2>
                    <p className="mt-0.5 text-sm">
                      <ContributorsSummary
                        contributors={hit.contributorList}
                        fallbackAuthor={hit.author}
                        linkAuthors
                      />
                      {hit.publishYear ? (
                        <span className="text-muted"> · {hit.publishYear}</span>
                      ) : null}
                    </p>
                  </div>
                  {hit.category && <Badge tone="ocre">{hit.category}</Badge>}
                </div>
              </Card>
            ))}
          </div>

          {/* ⚠ La recherche pagine depuis le 11 septembre 2026 — backlog n° 6.
              Elle s'arrêtait à la première page sans le dire, sur l'écran que
              voient les étudiants : `totalPages` était dans la réponse et n'était
              pas affiché. Paginer n'était sûr qu'après avoir vérifié l'ordre
              stable, ce que le catalogue professionnel avait appris à ses
              dépens. */}
          {!parcours && result.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-3">
              <Button
                variant="ghost"
                className="min-h-11"
                disabled={result.page <= 1}
                onClick={() => setPageRecherche((n) => Math.max(1, n - 1))}
              >
                {LIBELLES.opac.pagePrecedente}
              </Button>
              <span className="text-sm text-muted">
                {LIBELLES.opac.pageSur(result.page, result.totalPages)}
              </span>
              <Button
                variant="ghost"
                className="min-h-11"
                disabled={result.page >= result.totalPages}
                onClick={() => setPageRecherche((n) => n + 1)}
              >
                {LIBELLES.opac.pageSuivante}
              </Button>
            </div>
          )}

          {/* Le parcours a sa propre pagination : autre route, autre totalité.
              Sans ces boutons, un parcours de 154 documents s'arrêterait à 20
              sans dire qu'il en reste. */}
          {parcours && result.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-3">
              <Button
                variant="ghost"
                disabled={result.page <= 1}
                onClick={() => setPageParcours((p) => Math.max(1, p - 1))}
              >
                {LIBELLES.opac.pagePrecedente}
              </Button>
              <span className="text-sm text-muted">
                {LIBELLES.opac.pageSur(result.page, result.totalPages)}
              </span>
              <Button
                variant="ghost"
                disabled={result.page >= result.totalPages}
                onClick={() => setPageParcours((p) => p + 1)}
              >
                {LIBELLES.opac.pageSuivante}
              </Button>
            </div>
          )}
        </>
      )}
    </main>
  );
}

export default function OpacPage() {
  return (
    <Suspense>
      <OpacSearch />
    </Suspense>
  );
}
