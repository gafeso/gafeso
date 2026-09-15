'use client';

// « Dépôts à cataloguer » — l'écran du BIBLIOTHÉCAIRE, dernier maillon du
// circuit de dépôt. 12 septembre 2026.
//
// ⚠ SANS LUI, UN DÉPÔT VALIDÉ N'ENTRE JAMAIS AU CATALOGUE. L'étudiant dépose,
// le directeur valide, et le document reste dans une table que rien n'expose :
// le circuit s'arrêtait à un pas de son but.
//
// ⚠ LA NOTICE NE SE CRÉE PAS ICI, et c'est une décision de l'API, pas un
// raccourci. `POST /cataloging/records` porte ses invariants — un auteur
// principal, trois mots-clés — que le formulaire de dépôt ne fournit pas.
// Créer la notice depuis le dépôt demanderait un troisième chemin d'écriture
// aux règles plus souples, c'est-à-dire une porte ouverte sur ces invariants.
// D'où DEUX temps, et l'écran doit les rendre lisibles : sans ça, « Rattacher
// une notice » se lit comme « créer », et son absence d'effet comme une panne.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/session';
import { useMyFunctions } from '@/lib/functions';
import { LIBELLES } from '@/lib/libelles';
import { Alert, Badge, Button, Card, Input } from '@/components/ui';

const T = LIBELLES.aCataloguer;

interface Depot {
  id: string;
  title: string;
  authorName: string;
  documentType: string;
  year: number | null;
  fileName: string | null;
  decidedAt: string | null;
}

interface Notice {
  id: string;
  title: string;
  author: string | null;
  publishYear: number | null;
}

const dateFr = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(iso));

export default function DepotsACataloguerPage() {
  const { functions } = useMyFunctions();
  const peutCataloguer = functions?.includes('catalogue.gerer');

  /** ⚠ `null` TANT QU'ON NE SAIT PAS : un « aucun dépôt » prématuré fait partir. */
  const [depots, setDepots] = useState<Depot[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [avis, setAvis] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);

  /** Le dépôt dont on cherche la notice, et l'état de cette recherche. */
  const [rattachement, setRattachement] = useState<string | null>(null);
  const [requete, setRequete] = useState('');
  /** ⚠ `null` = pas encore cherché OU recherche en vol. Jamais « aucun résultat ». */
  const [resultats, setResultats] = useState<Notice[] | null>(null);
  const [recherche, setRecherche] = useState(false);

  const charger = useCallback(async () => {
    setErreur(null);
    try {
      setDepots(await api<Depot[]>('/depots/a-cataloguer', {}, getToken()));
    } catch {
      // ⚠ On ne retombe PAS sur une liste vide : une panne s'écrirait alors
      // « aucun dépôt n'attend », et le bibliothécaire s'en irait.
      setDepots(null);
      setErreur(T.echec);
    }
  }, []);

  useEffect(() => {
    if (peutCataloguer) void charger();
  }, [peutCataloguer, charger]);

  async function lire(id: string) {
    setErreur(null);
    // ⚠ L'ONGLET S'OUVRE AU CLIC, PAS APRÈS L'ATTENTE. Signalé par la session
    // backend le 15 septembre 2026. Un `window.open` placé APRÈS un `await` a
    // perdu le contexte du geste utilisateur — c'est précisément le motif que
    // les bloqueurs de fenêtres surgissantes visent. Selon le navigateur il
    // passe ou il est refusé, et s'il est refusé le clic ne produit RIEN : ni
    // document, ni message.
    //
    // ⚠ ET PAS `noopener` DANS LES OPTIONS, contrairement à la forme d'abord
    // proposée. La spécification fait rendre `null` à `window.open` quand
    // `noopener` est demandé — c'est son office, puisque le lien entre les deux
    // fenêtres est coupé dans les deux sens. Le correctif aurait donc pris la
    // branche « bloqué » À TOUS LES COUPS, et n'aurait jamais ouvert de
    // document. On garde la poignée, et on coupe le lien nous-mêmes avec
    // `opener = null` : même propriété de sécurité, poignée conservée.
    //
    // ⚠ Non vérifié dans le volet de navigateur de développement, qui refuse
    // TOUTES les fenêtres surgissantes, même depuis un vrai clic : la mesure y
    // rend `null` dans les deux cas et ne discrimine donc rien.
    const onglet = window.open('', '_blank');
    if (!onglet) {
      setErreur(T.fenetreBloquee);
      return;
    }
    onglet.opener = null;
    try {
      const res = await api<{ url: string }>(`/depots/${id}/document`, {}, getToken());
      // L'URL est signée et vit 5 minutes : on l'ouvre, on ne la garde pas.
      onglet.location = res.url;
    } catch (err) {
      // ⚠ On referme l'onglet vide : le laisser ouvert ferait croire que quelque
      // chose s'est passé, et le message d'erreur est sur l'autre écran.
      onglet.close();
      setErreur(err instanceof ApiError ? err.message : T.echecLecture);
    }
  }


  async function chercher() {
    if (requete.trim() === '') return;
    setRecherche(true);
    setResultats(null);
    try {
      const qs = new URLSearchParams({ limit: '10', page: '1', q: requete.trim() });
      const res = await api<{ records: Notice[] }>(
        `/cataloging/records?${qs}`,
        {},
        getToken(),
      );
      setResultats(res.records);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : T.echec);
      setResultats(null);
    } finally {
      setRecherche(false);
    }
  }

  async function rattacher(depotId: string, notice: Notice) {
    setErreur(null);
    setEnCours(depotId);
    try {
      await api(
        `/depots/${depotId}/notice`,
        { method: 'POST', body: JSON.stringify({ recordId: notice.id }) },
        getToken(),
      );
      setRattachement(null);
      setResultats(null);
      setRequete('');
      // ⚠ On RELIT : le dépôt doit avoir QUITTÉ la liste, et c'est la liste qui
      // le prouve — pas ce qu'on croit avoir fait.
      await charger();
      setAvis(T.rattachee(notice.title));
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : T.echec);
    } finally {
      setEnCours(null);
    }
  }

  if (functions && !peutCataloguer) {
    return <Alert tone="error">{LIBELLES.refusDeDroit.aCataloguer}</Alert>;
  }

  return (
    <div>
      <h1 className="font-serif text-3xl font-bold">{T.titre}</h1>
      <p className="mt-1 text-sm text-muted">{T.introduction}</p>

      {erreur && (
        <Alert tone="error" className="mt-4">
          {erreur}
        </Alert>
      )}
      {avis && (
        <Alert tone="success" className="mt-4">
          {avis}
        </Alert>
      )}

      {/* ⚠ Ni « aucun dépôt » ni la liste tant que la réponse n'est pas là. */}
      {!depots && !erreur && <p className="mt-6 text-sm text-muted">{T.chargement}</p>}
      {depots?.length === 0 && <p className="mt-6 text-sm text-muted">{T.aucun}</p>}

      <div className="mt-5 flex flex-col gap-3">
        {depots?.map((d) => (
          <Card key={d.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium text-ink">{d.title}</p>
                <p className="mt-0.5 text-sm text-muted">
                  {d.authorName}
                  {d.year ? ` · ${d.year}` : ''} · {LIBELLES.typesDeDepot[d.documentType] ?? d.documentType}
                </p>
              </div>
              {d.decidedAt && <Badge>{T.valideLe(dateFr(d.decidedAt))}</Badge>}
            </div>

            {/*
              ⚠ LES DEUX TEMPS, DITS AVANT LE GESTE. Sans cette phrase,
              « Rattacher une notice » se lit comme « créer la notice », et le
              bibliothécaire cherche un formulaire qui n'existe pas ici.
            */}
            <p className="mt-3 text-sm text-muted">{T.marcheASuivre}</p>

            <div className="mt-3 flex flex-wrap gap-2">
              {d.fileName ? (
                <Button variant="ghost" className="min-h-11" onClick={() => void lire(d.id)}>
                  {T.lire}
                </Button>
              ) : (
                <p className="text-sm text-muted">{T.sansDocument}</p>
              )}
              <Link
                href="/admin/catalogue"
                className="inline-flex min-h-11 items-center rounded-md px-4 py-2 text-sm font-semibold text-ink hover:bg-line/60"
              >
                {T.allerCataloguer}
              </Link>
              {rattachement !== d.id && (
                <Button
                  className="min-h-11"
                  onClick={() => {
                    setRattachement(d.id);
                    setResultats(null);
                    setRequete('');
                  }}
                >
                  {T.rattacher}
                </Button>
              )}
            </div>

            {rattachement === d.id && (
              <Card className="mt-3 !p-3">
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  {T.chercherNotice}
                  <div className="flex flex-wrap gap-2">
                    <Input
                      className="flex-1"
                      value={requete}
                      onChange={(e) => setRequete(e.target.value)}
                      placeholder={d.title}
                    />
                    <Button
                      className="min-h-11"
                      disabled={requete.trim() === '' || recherche}
                      onClick={() => void chercher()}
                    >
                      {T.chercher}
                    </Button>
                  </div>
                </label>

                {/* ⚠ « Aucune notice » ne s'affirme qu'APRÈS une réponse. */}
                {recherche && <p className="mt-2 text-sm text-muted">{T.rechercheEnCours}</p>}
                {resultats?.length === 0 && (
                  <p className="mt-2 text-sm text-muted">{T.aucunResultat}</p>
                )}

                <div className="mt-2 flex flex-col gap-2">
                  {resultats?.map((n) => (
                    <div
                      key={n.id}
                      className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-2"
                    >
                      <span className="text-sm">
                        {n.title}
                        {n.author ? ` · ${n.author}` : ''}
                        {n.publishYear ? ` · ${n.publishYear}` : ''}
                      </span>
                      <Button
                        variant="ghost"
                        className="min-h-11"
                        disabled={enCours === d.id}
                        onClick={() => void rattacher(d.id, n)}
                      >
                        {T.choisirCetteNotice}
                      </Button>
                    </div>
                  ))}
                </div>

                <Button
                  variant="ghost"
                  className="mt-2 min-h-11"
                  disabled={enCours === d.id}
                  onClick={() => setRattachement(null)}
                >
                  {T.annuler}
                </Button>
              </Card>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
