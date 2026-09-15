'use client';

// « Dépôts à valider » — l'écran du DIRECTEUR. 12 septembre 2026.
//
// ⚠ POURQUOI IL EXISTE, ET COMMENT IL A ÉTÉ TROUVÉ. La recette du circuit de
// dépôt, sur des sessions réelles, a montré que le mur du matin était tombé
// — un étudiant peut désormais désigner son directeur et soumettre — et que le
// circuit restait infranchissable UN CRAN PLUS LOIN : trois routes servaient le
// directeur, aucun écran ne les ouvrait.
//
// ⚠ Aucun garde ne pouvait le dire. `couverture-des-roles` ne lit que
// `ROLES_SYSTEME` ; `depot.valider` n'est portée que par un rôle DYNAMIQUE,
// donc hors de sa portée par construction. C'est la recette qui l'a vu.

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/session';
import { useMyFunctions } from '@/lib/functions';
import { LIBELLES } from '@/lib/libelles';
import { Alert, Badge, Button, Card } from '@/components/ui';
import { Header } from '@/components/header';
import { ID_CONTENU, LienDEvitement } from '@/components/lien-evitement';
import { EcranModuleEteint } from '@/components/ecran-module-eteint';
import { useModulesActifs } from '@/lib/modules-actifs';
import { moduleDeLaRoute } from '@/lib/navigation';

const T = LIBELLES.depotsAValider;

/** Ce qui est RÉELLEMENT arrivé au courriel du déposant — rendu par l'API. */
type MailOutcome = { sent: true } | { sent: false; reason: string };

/** La réponse de `valider` / `refuser` depuis le 12 septembre 2026. */
interface Decision {
  depot: { id: string; status: string };
  notification?: MailOutcome;
}

interface Depot {
  id: string;
  status: string;
  title: string;
  authorName: string;
  documentType: string;
  year: number | null;
  fileName: string | null;
  submittedAt: string | null;
}

const dateFr = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(iso));

export default function DepotsAValiderPage() {
  // ⚠ NI ENTRÉE, NI BOUTON, NI ÉCRAN ATTEIGNABLE PAR SON ADRESSE — la règle
  // normative de P4, appliquée ICI parce que cet écran vit HORS de la coque du
  // personnel : la garde d'adresse d'`AdminShell` ne le couvre pas. Mesuré le
  // 14 septembre 2026 : module `depot` éteint, cette adresse s'affichait
  // normalement et appelait des routes que l'API refuse.
  //
  // Le module est demandé à `moduleDeLaRoute`, PAS écrit en dur : une seule
  // source dit quelle route dépend de quel module, et elle vit dans
  // lib/navigation.ts avec le reste.
  const { modulesActifs } = useModulesActifs();
  const moduleRequis = moduleDeLaRoute('/depots-a-valider');
  const { functions } = useMyFunctions();
  const peutValider = functions?.includes('depot.valider');

  /** ⚠ `null` TANT QU'ON NE SAIT PAS : un « aucun dépôt » prématuré fait partir. */
  const [depots, setDepots] = useState<Depot[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [avis, setAvis] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  /** Le dépôt dont on rédige le refus, et son motif. */
  const [refus, setRefus] = useState<{ id: string; motif: string } | null>(null);

  const charger = useCallback(async () => {
    setErreur(null);
    try {
      setDepots(await api<Depot[]>('/depots/a-valider', {}, getToken()));
    } catch {
      // ⚠ On ne retombe PAS sur une liste vide : une panne s'écrirait alors
      // « aucun dépôt n'attend votre décision », et le directeur s'en irait.
      setDepots(null);
      setErreur(T.echec);
    }
  }, []);

  useEffect(() => {
    if (peutValider) void charger();
  }, [peutValider, charger]);

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


  async function decider(id: string, geste: 'valider' | 'refuser', motif?: string) {
    setErreur(null);
    setEnCours(id);
    try {
      // ⚠ LES DEUX CHEMINS SONT ÉCRITS EN CLAIR, et c'est le garde des routes
      // qui l'a exigé : `/depots/${id}/${geste}` se normalise en
      // `/depots/*/*`, invérifiable — donc exactement la forme par laquelle un
      // renommage de route passerait sans que rien ne le dise. Première fois
      // que ce garde reprend du code neuf.
      // ⚠ L'ISSUE DE LA NOTIFICATION EST LUE, JAMAIS SUPPOSÉE. Le backend a
      // livré l'envoi au déposant le 12 septembre 2026 ; sans lire son sort,
      // l'écran ferait croire au directeur que son étudiant est prévenu.
      const res =
        geste === 'valider'
          ? await api<Decision>(`/depots/${id}/valider`, { method: 'POST' }, getToken())
          : await api<Decision>(
              `/depots/${id}/refuser`,
              { method: 'POST', body: JSON.stringify({ motif }) },
              getToken(),
            );
      setRefus(null);
      // ⚠ On RELIT : la liste fait foi, pas ce qu'on croit avoir fait.
      await charger();
      // Le sort du courriel se dit APRÈS ce qui persiste, et il vient de l'API.
      const suite = geste === 'valider' ? T.validerSuite : T.refuseSuite;
      const courriel =
        res.notification?.sent === false ? T.deposantNonPrevenu : T.deposantPrevenu;
      setAvis(`${suite} ${courriel}`);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : T.echec);
    } finally {
      setEnCours(null);
    }
  }

  // ⚠ AVANT LE REFUS DE DROIT, et l'ordre compte. Module éteint, la raison
  // n'est pas que cette personne manque d'une fonction : c'est que le circuit
  // est fermé pour tout l'établissement. Dire « vous n'avez pas le droit »
  // enverrait quelqu'un réclamer une permission qui ne changerait rien.
  //
  // `null` laisse passer : on ne refuse pas sur une information qu'on n'a pas.
  if (moduleRequis && modulesActifs && !modulesActifs.includes(moduleRequis)) {
    return <EcranModuleEteint />;
  }

  if (functions && !peutValider) {
    return (
      <>
        <LienDEvitement />
        <Header />
        <main id={ID_CONTENU} className="mx-auto max-w-3xl px-6 py-8">
          <p className="rounded-md border border-line bg-paper px-3 py-2 text-sm text-muted">
            {LIBELLES.refusDeDroit.depotsAValider}
          </p>
        </main>
      </>
    );
  }


  return (
    <>
      <LienDEvitement />
      <Header />
      <main id={ID_CONTENU} className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="text-2xl font-semibold text-ink">{T.titre}</h1>
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
                {d.submittedAt && <Badge>{T.soumisLe(dateFr(d.submittedAt))}</Badge>}
              </div>

              {/*
                ⚠ LIRE AVANT DE DÉCIDER, et le bouton vient en premier. L'API le
                dit dans sa propre description : sans cette route, le circuit
                demandait à un directeur de valider un contenu qu'il ne pouvait
                pas lire.
              */}
              <div className="mt-3 flex flex-wrap gap-2">
                {d.fileName ? (
                  <Button variant="ghost" className="min-h-11" onClick={() => void lire(d.id)}>
                    {T.lire}
                  </Button>
                ) : (
                  <p className="text-sm text-muted">{T.sansDocument}</p>
                )}
              </div>

              {refus?.id === d.id ? (
                <Card className="mt-3 border-red-200 !p-3">
                  <label className="flex flex-col gap-1.5 text-sm font-medium">
                    {T.champMotif}
                    <textarea
                      className="min-h-24 rounded-md border border-line px-3 py-2 text-sm"
                      value={refus.motif}
                      maxLength={2000}
                      onChange={(e) => setRefus({ id: d.id, motif: e.target.value })}
                    />
                  </label>
                  {/* ⚠ La règle CONDITIONNELLE se lit à l'écran, elle ne se
                      découvre pas par un refus de l'API. */}
                  <p className="mt-1 text-xs text-muted">{T.motifAide}</p>
                  {refus.motif.trim() === '' && (
                    <p className="mt-2 text-sm text-heading">{T.motifObligatoire}</p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      className="min-h-11"
                      disabled={refus.motif.trim() === '' || enCours === d.id}
                      onClick={() => void decider(d.id, 'refuser', refus.motif.trim())}
                    >
                      {T.refuserConfirmer}
                    </Button>
                    <Button
                      variant="ghost"
                      className="min-h-11"
                      disabled={enCours === d.id}
                      onClick={() => setRefus(null)}
                    >
                      {T.annuler}
                    </Button>
                  </div>
                </Card>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    className="min-h-11"
                    disabled={enCours === d.id}
                    onClick={() => void decider(d.id, 'valider')}
                  >
                    {T.valider}
                  </Button>
                  <Button
                    variant="ghost"
                    className="min-h-11"
                    disabled={enCours === d.id}
                    onClick={() => setRefus({ id: d.id, motif: '' })}
                  >
                    {T.refuser}
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      </main>
    </>
  );
}
