'use client';

// « Mon dépôt » — P6-2, moitié front. Dette n° 24, levée par cet écran.
//
// ⚠ CET ÉCRAN EXISTE POUR QU'ON N'AIT PAS À REDÉPOSER. L'API le dit dans la
// description de sa propre route : « un étudiant qui dépose et n'entend plus
// rien redéposera ». Le suivi n'est donc pas un confort — c'est ce qui empêche
// les doublons, et un doublon de thèse, personne ne sait lequel est le bon.

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/session';
import { useMyFunctions } from '@/lib/functions';
import { LIBELLES } from '@/lib/libelles';
import { Alert, Badge, Button, Card, Input, Select } from '@/components/ui';
import { Header } from '@/components/header';
import { ID_CONTENU, LienDEvitement } from '@/components/lien-evitement';

/** Les types que l'API accepte — vocabulaire académique, validé côté serveur. */
const TYPES = [
  { valeur: 'memoire', libelle: 'Mémoire' },
  { valeur: 'these', libelle: 'Thèse' },
  { valeur: 'licence', libelle: 'Mémoire de licence' },
  { valeur: 'master', libelle: 'Mémoire de master' },
  { valeur: 'these_unique', libelle: 'Thèse unique' },
];

interface Depot {
  id: string;
  status: string;
  /** ⚠ Ne se pose qu'à la CRÉATION : aucune route ne le modifie ensuite. */
  directorId: string | null;
  title: string;
  authorName: string;
  documentType: string;
  year: number | null;
  fileName: string | null;
  fileSize: number | null;
  refusalReason: string | null;
  submittedAt: string | null;
  decidedAt: string | null;
  createdAt: string;
}

/**
 * Un directeur désignable — `GET /depots/directeurs`.
 *
 * ⚠ CE N'EST PAS L'ANNUAIRE DES COMPTES, et l'API le dit : un identifiant, un
 * nom, rien d'autre. Ni courriel, ni matricule, ni rôle.
 */
interface Directeur {
  id: string;
  nom: string;
}

/** Issue de la notification au directeur — rendue par l'API, jamais supposée. */
interface Soumission {
  depot: Depot;
  notification?: { sent: boolean };
}

const dateFr = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(iso));

export default function MonDepotPage() {
  const { functions } = useMyFunctions();
  const peutDeposer = functions?.includes('depot.deposer');

  /** ⚠ `null` TANT QU'ON NE SAIT PAS : un « aucun dépôt » prématuré fait redéposer. */
  const [depots, setDepots] = useState<Depot[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [avis, setAvis] = useState<{ ton: 'success' | 'warning'; texte: string } | null>(null);
  const [formOuvert, setFormOuvert] = useState(false);
  const [form, setForm] = useState({ title: '', authorName: '', documentType: 'memoire', year: '' });
  const [enCours, setEnCours] = useState<string | null>(null);
  /** Le dépôt dont on confirme le retrait. `null` = aucune confirmation ouverte. */
  const [retraitConfirme, setRetraitConfirme] = useState<string | null>(null);
  /**
   * ⚠ `null` TANT QU'ON NE SAIT PAS. Trois états, pas deux : afficher « aucun
   * directeur déclaré » pendant le chargement enverrait l'étudiant réclamer à
   * sa bibliothèque quelque chose qui existe déjà — un vide qui INVITE À AGIR,
   * et le geste, lui, aurait lieu.
   */
  const [directeurs, setDirecteurs] = useState<Directeur[] | null>(null);

  const charger = useCallback(async () => {
    try {
      setDepots(await api<Depot[]>('/depots/mes-depots', {}, getToken()));
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Chargement impossible.');
    }
  }, []);

  useEffect(() => {
    if (!peutDeposer) return;
    void charger();
  }, [peutDeposer, charger]);

  useEffect(() => {
    if (!peutDeposer) return;
    // Une panne de cette liste ne doit pas se lire « personne ne peut diriger » :
    // on la laisse INCONNUE, et le mur ne s'affiche donc pas.
    api<Directeur[]>('/depots/directeurs', {}, getToken())
      .then(setDirecteurs)
      .catch(() => setDirecteurs(null));
  }, [peutDeposer]);

  async function designer(id: string, directorId: string) {
    setErreur(null);
    setEnCours(id);
    try {
      // ⚠ On RELIT au lieu de poser l'état soi-même : une désignation qui
      // s'affiche avant que le serveur l'ait acceptée est un succès écrit, pas
      // mesuré. Le refus le plus probable est réel — le dépôt n'est plus un
      // brouillon parce qu'on l'a soumis dans un autre onglet.
      await api(
        `/depots/${id}/directeur`,
        { method: 'PATCH', body: JSON.stringify({ directorId }) },
        getToken(),
      );
      await charger();
      setAvis({ ton: 'success', texte: LIBELLES.monDepot.directeurChange });
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Désignation impossible.');
    } finally {
      setEnCours(null);
    }
  }

  async function creer(event: FormEvent) {
    event.preventDefault();
    setErreur(null);
    try {
      await api(
        '/depots',
        {
          method: 'POST',
          body: JSON.stringify({
            title: form.title.trim(),
            authorName: form.authorName.trim(),
            documentType: form.documentType,
            ...(form.year.trim() ? { year: Number(form.year) } : {}),
          }),
        },
        getToken(),
      );
      setFormOuvert(false);
      setForm({ title: '', authorName: '', documentType: 'memoire', year: '' });
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Création impossible.');
    }
  }

  async function televerser(id: string, fichier: File) {
    setErreur(null);
    setEnCours(id);
    try {
      const corps = new FormData();
      corps.append('file', fichier);
      // ⚠ `fetch` BRUT, PAS LE CLIENT `api`. Trouvé en recette le 12 septembre
      // 2026, et aucun test ne pouvait le voir : le client impose
      // `Content-Type: application/json`, ce qui empêche le navigateur de poser
      // la frontière multipart. L'API recevait alors le corps multipart annoncé
      // comme du JSON et répondait « "------WebK"... is not valid JSON » —
      // message affiché tel quel à l'étudiant, sur le seul geste qui compte.
      //
      // Les quatre autres téléversements du dépôt le font déjà ainsi, avec le
      // même commentaire. J'ai écrit le cinquième sans lire les quatre autres.
      const reponse = await fetch(`/api/depots/${id}/document`, {
        method: 'POST',
        credentials: 'same-origin', // auth par le cookie httpOnly bc_token
        body: corps,
      });
      if (!reponse.ok) {
        const detail = (await reponse.json().catch(() => ({}))) as { message?: string };
        throw new ApiError(reponse.status, detail.message ?? LIBELLES.monDepot.echecDocument);
      }
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Envoi du document impossible.');
    } finally {
      setEnCours(null);
    }
  }

  /**
   * ⚠ LA SORTIE D'UN DÉPÔT SOUMIS. C'est son dépôt : il ne doit dépendre de
   * personne pour en reprendre la main. Le directeur est prévenu, et l'issue de
   * cet envoi est LUE — jamais supposée.
   */
  async function retirer(id: string) {
    setErreur(null);
    setEnCours(id);
    try {
      const res = await api<Soumission>(
        `/depots/${id}/retirer`,
        { method: 'POST' },
        getToken(),
      );
      setRetraitConfirme(null);
      // Le retrait a ABOUTI : un échec d'envoi ne doit pas le faire douter.
      setAvis(
        res.notification?.sent === false
          ? { ton: 'warning', texte: LIBELLES.monDepot.retireNonPrevenu }
          : { ton: 'success', texte: LIBELLES.monDepot.retireEtPrevenu },
      );
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : LIBELLES.monDepot.retirerEchec);
    } finally {
      setEnCours(null);
    }
  }

  async function soumettre(id: string) {
    setErreur(null);
    setAvis(null);
    setEnCours(id);
    try {
      const res = await api<Soumission>(`/depots/${id}/soumettre`, { method: 'POST' }, getToken());
      /*
        ⚠ L'ENVOI PEUT ÉCHOUER SANS QUE LA SOUMISSION ÉCHOUE, et l'API rend
        l'issue exprès pour que l'écran puisse le dire. Annoncer « soumis » tout
        court laisserait l'étudiant attendre la réponse d'un directeur qui n'a
        jamais été prévenu — un faux qui ne trompe pas seulement, il immobilise.
      */
      setAvis(
        res.notification?.sent === false
          ? { ton: 'warning', texte: LIBELLES.monDepot.soumisNonPrevenu }
          : { ton: 'success', texte: LIBELLES.monDepot.soumisEtPrevenu },
      );
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Soumission impossible.');
    } finally {
      setEnCours(null);
    }
  }

  if (functions && !peutDeposer) {
    return (
      <>
        <LienDEvitement />
        <Header />
      <main id={ID_CONTENU} className="mx-auto max-w-3xl px-6 py-8">
        <p className="rounded-md border border-line bg-paper px-3 py-2 text-sm text-muted">
          {LIBELLES.refusDeDroit.depot}
        </p>
      </main>
      </>
    );
  }

  return (
    <>
      {/*
        ⚠ L'EN-TÊTE N'EST PAS DÉCORATIVE ICI. Cet écran vit HORS de la coque du
        personnel : sans elle, un étudiant qui arrive sur son dépôt n'a plus
        aucun chemin vers le catalogue ni vers ses prêts. C'est `/mes-prets` qui
        donne la forme — même espace, même structure.
      */}
      <LienDEvitement />
      <Header />
    <main id={ID_CONTENU} className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="font-serif text-3xl font-bold">{LIBELLES.monDepot.titre}</h1>
      <p className="mt-1 text-sm text-muted">{LIBELLES.monDepot.introduction}</p>

      {erreur && (
        <Alert tone="error" className="mt-4">
          {erreur}
        </Alert>
      )}
      {avis && (
        <Alert tone={avis.ton === 'success' ? 'success' : 'warning'} className="mt-4">
          {avis.texte}
        </Alert>
      )}

      {!formOuvert && (
        <Button className="mt-5 min-h-11" onClick={() => setFormOuvert(true)}>
          {LIBELLES.monDepot.nouveau}
        </Button>
      )}

      {formOuvert && (
        <Card className="mt-5">
          <form onSubmit={creer} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {LIBELLES.monDepot.champTitre}
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {LIBELLES.monDepot.champAuteur}
              <Input
                value={form.authorName}
                onChange={(e) => setForm({ ...form, authorName: e.target.value })}
                required
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {LIBELLES.monDepot.champType}
              <Select
                value={form.documentType}
                onChange={(e) => setForm({ ...form, documentType: e.target.value })}
              >
                {TYPES.map((t) => (
                  <option key={t.valeur} value={t.valeur}>
                    {t.libelle}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {LIBELLES.monDepot.champAnnee}
              <Input
                type="number"
                value={form.year}
                onChange={(e) => setForm({ ...form, year: e.target.value })}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" className="min-h-11">
                {LIBELLES.monDepot.creer}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="min-h-11"
                onClick={() => setFormOuvert(false)}
              >
                {LIBELLES.monDepot.annuler}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {depots === null && (
        <p className="mt-5 text-sm text-muted">{LIBELLES.monDepot.chargement}</p>
      )}
      {depots?.length === 0 && (
        <p className="mt-5 text-sm text-muted">{LIBELLES.monDepot.aucun}</p>
      )}

      <div className="mt-5 flex flex-col gap-3">
        {depots?.map((d) => {
          const brouillon = d.status === 'brouillon';
          const soumis = d.status === 'soumis';
          return (
            <Card key={d.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">{d.title}</div>
                  <div className="text-sm text-muted">
                    {d.authorName}
                    {d.year ? ` · ${d.year}` : ''} ·{' '}
                    {TYPES.find((t) => t.valeur === d.documentType)?.libelle ?? d.documentType}
                  </div>
                  <div className="mt-1 text-sm text-muted">
                    {d.fileName ? `${LIBELLES.monDepot.fichier} : ${d.fileName}` : LIBELLES.monDepot.aucunFichier}
                  </div>
                </div>
                <Badge tone={d.status === 'refuse' ? 'ocre' : d.status === 'valide' ? 'green' : 'neutral'}>
                  {LIBELLES.monDepot.etats[d.status] ?? d.status}
                </Badge>
              </div>

              {/*
                ⚠ LE MOTIF D'UN REFUS NE S'EFFACE JAMAIS. Sans lui, l'étudiant
                redépose la même chose — et la suite dit ce qu'il FAUT faire,
                parce qu'un refus sans issue laisse devant une porte close.
              */}
              {d.status === 'refuse' && (
                <div className="mt-3 rounded-md border border-line bg-paper px-3 py-2 text-sm">
                  <div className="font-semibold">{LIBELLES.monDepot.motifDuRefus}</div>
                  <p className="mt-1">{d.refusalReason}</p>
                  <p className="mt-2 text-muted">{LIBELLES.monDepot.refusSuite}</p>
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-3">
                {brouillon ? (
                  <>
                    <label className="inline-flex min-h-11 cursor-pointer items-center rounded-md border border-line px-3 text-sm font-medium">
                      {d.fileName
                        ? LIBELLES.monDepot.remplacerFichier
                        : LIBELLES.monDepot.choisirFichier}
                      <input
                        type="file"
                        accept=".pdf,.epub"
                        className="sr-only"
                        disabled={enCours === d.id}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void televerser(d.id, f);
                        }}
                      />
                    </label>
                    <Button
                      className="min-h-11"
                      disabled={!d.fileName || !d.directorId || enCours === d.id}
                      onClick={() => void soumettre(d.id)}
                    >
                      {LIBELLES.monDepot.soumettre}
                    </Button>
                  </>
                ) : (
                  /*
                    ⚠ DIT POURQUOI, pas seulement que c'est impossible. Un bouton
                    grisé sans raison se lit comme une panne ; la phrase dit que
                    le document est parti avec le dépôt.
                  */
                  <p className="text-sm text-muted">{LIBELLES.monDepot.fichierFige}</p>
                )}
              </div>

              {/*
                ⚠ LE MUR EST DEVENU UNE COMMANDE, le 12 septembre 2026. La
                recette avait mesuré un circuit infranchissable : la soumission
                exige un directeur, `directorId` ne se posait qu'à la création,
                et aucune route ne listait les directeurs. Le backend a livré
                les deux — `GET /depots/directeurs` et
                `PATCH /depots/:id/directeur`. L'écran ne dit donc plus « c'est
                fermé », il ouvre.

                ⚠ TROIS ÉTATS, PAS DEUX, et c'est ce qui décide de tout ce bloc :
                  · liste INCONNUE (en vol, ou en panne) → on n'affirme rien ;
                  · liste VIDE → personne ne porte `depot.valider` dans cette
                    école : là seulement, le mur est encore vrai ;
                  · liste PLEINE → le menu, y compris pour CHANGER un directeur
                    déjà désigné — l'API l'autorise tant que c'est un brouillon.
              */}
              {brouillon && (
                <div className="mt-3">
                  {directeurs === null ? (
                    <p className="text-sm text-muted">
                      {LIBELLES.monDepot.chargementDirecteurs}
                    </p>
                  ) : directeurs.length === 0 ? (
                    <p className="text-sm text-heading">{LIBELLES.monDepot.sansDirecteur}</p>
                  ) : (
                    <label className="block text-sm">
                      <span className="text-muted">{LIBELLES.monDepot.choisirDirecteur}</span>
                      <Select
                        className="mt-1"
                        value={d.directorId ?? ''}
                        disabled={enCours === d.id}
                        onChange={(e) => {
                          const choisi = e.target.value;
                          if (choisi && choisi !== d.directorId) void designer(d.id, choisi);
                        }}
                      >
                        <option value="">{LIBELLES.monDepot.aucunChoixDirecteur}</option>
                        {directeurs.map((dir) => (
                          <option key={dir.id} value={dir.id}>
                            {dir.nom}
                          </option>
                        ))}
                      </Select>
                    </label>
                  )}
                  {/*
                    ⚠ Un bouton gris sans raison se lit comme une panne. Cette
                    phrase ne s'affiche QUE quand le geste est possible — sinon
                    c'est le mur ci-dessus qui parle, et il dit autre chose.
                  */}
                  {!d.directorId && directeurs !== null && directeurs.length > 0 && (
                    <p className="mt-2 text-sm text-heading">
                      {LIBELLES.monDepot.sansDirecteurDesigne}
                    </p>
                  )}
                </div>
              )}
              {!brouillon && d.directorId && directeurs?.length ? (
                <p className="mt-2 text-sm text-muted">
                  {LIBELLES.monDepot.directeurDesigne(
                    directeurs.find((x) => x.id === d.directorId)?.nom ?? '—',
                  )}
                </p>
              ) : null}
              {/*
                ⚠ LA SORTIE D'UN DÉPÔT SOUMIS, arbitrée le 12 septembre 2026.
                « Soumis » était le seul état dont la sortie dépendait de
                quelqu'un d'autre : un directeur qui perdait la fonction bloquait
                le dépôt pour toujours, et l'écran disait « en attente de votre
                directeur » indéfiniment — ce qui était exact.
              */}
              {soumis && (
                <div className="mt-3">
                  {retraitConfirme === d.id ? (
                    <Card className="border-line !p-3">
                      <p className="text-sm">{LIBELLES.monDepot.retirerConfirmation}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          className="min-h-11"
                          disabled={enCours === d.id}
                          onClick={() => void retirer(d.id)}
                        >
                          {LIBELLES.monDepot.retirerConfirmer}
                        </Button>
                        <Button
                          variant="ghost"
                          className="min-h-11"
                          disabled={enCours === d.id}
                          onClick={() => setRetraitConfirme(null)}
                        >
                          {LIBELLES.monDepot.annuler}
                        </Button>
                      </div>
                    </Card>
                  ) : (
                    <Button
                      variant="ghost"
                      className="min-h-11"
                      onClick={() => setRetraitConfirme(d.id)}
                    >
                      {LIBELLES.monDepot.retirer}
                    </Button>
                  )}
                </div>
              )}

              <div className="mt-2 text-xs text-muted">
                Créé le {dateFr(d.createdAt)}
                {d.submittedAt && ` · soumis le ${dateFr(d.submittedAt)}`}
                {d.decidedAt && ` · décidé le ${dateFr(d.decidedAt)}`}
              </div>
            </Card>
          );
        })}
      </div>
    </main>
    </>
  );
}
