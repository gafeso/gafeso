'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/session';
import { Alert, Button, Card, Select } from '@/components/ui';
import { LIBELLES } from '@/lib/libelles';

const T = LIBELLES.rapportAnnuel;

/**
 * ⚠ LA FORME DU CONTRAT EST UNE UNION DISCRIMINÉE, ET ON LA GARDE TELLE QUELLE.
 *
 * L'API rend `{ etat: 'calcule', valeurs } | { etat: 'non_calculable', motif }`,
 * et son commentaire dit pourquoi : « un `valeurs?: T` se lit sans y penser, et
 * "absent" se confondrait avec "vide" ». La recopier en champs optionnels ici
 * annulerait exactement la garantie qu'elle porte — le compilateur cesserait
 * d'obliger l'écran à traiter les deux cas.
 */
type Bloc<T> = { etat: 'calcule'; valeurs: T } | { etat: 'non_calculable'; motif: string };

/** Une ligne de répartition. `nombre` nul ⇒ `masque` dit POURQUOI. */
interface LigneRepartition {
  libelle: string;
  nombre: number | null;
  masque?: string;
}

interface RapportAnnuel {
  etablissement: string;
  annee: number;
  periode: { debut: string; fin: string; libelle: string };
  reserves: string[];
  fonds: Bloc<{
    documents: number;
    exemplaires: number;
    documentsNumeriques: number;
    cataloguesDansLAnnee: number;
    parCategorie: LigneRepartition[];
  }>;
  lecteurs: Bloc<{
    inscrits: number;
    actifsDansLAnnee: number;
    parCategorie: LigneRepartition[];
  }>;
  circulation: Bloc<{
    prets: number;
    retours: number;
    pretsEnRetardAuTerme: number;
    tauxDeRotation: number | null;
  }>;
  numerique: Bloc<{ lecturesEnLigne: number; telechargements: number; lecturesHorsLigne: number }>;
  depot: Bloc<{ deposes: number; soumis: number; valides: number; refuses: number; catalogues: number }>;
  diffusion: Bloc<never>;
}

const nombre = (n: number) => n.toLocaleString('fr-FR');


/**
 * Les années proposées, la plus récente en tête.
 *
 * ⚠ L'ANNÉE EN COURS EST OFFERTE, et le DÉFAUT reste l'année écoulée. Les deux
 * décisions sont liées :
 *
 * · le défaut suit le contrat de l'API — un rapport annuel se produit en
 *   janvier POUR l'année qui vient de finir ;
 * · mais l'interdire serait faux : on veut légitimement voir où on en est en
 *   cours d'année, et l'API l'accepte. La refuser au sélecteur n'empêcherait
 *   rien — l'adresse suffit — et rendrait l'avertissement INATTEIGNABLE.
 *
 * ⚠ Première écriture : le sélecteur s'arrêtait à l'année écoulée, et
 * l'avertissement « chiffres partiels » ne pouvait donc jamais s'afficher. Un
 * texte que le produit ne peut pas atteindre est une illusion de garantie.
 */
function anneesPossibles(): number[] {
  const enCours = new Date().getUTCFullYear();
  const liste: number[] = [];
  for (let a = enCours; a >= Math.max(2000, enCours - 10); a--) liste.push(a);
  return liste;
}

/**
 * Un bloc du rapport — ou son ABSENCE, nommée.
 *
 * ⚠ UNE ABSENCE N'EST PAS UNE PANNE, et la forme doit le dire. Le motif
 * s'affiche en information, pas en alerte : un bloc non calculable est une
 * limite assumée du logiciel, pas un incident. Le peindre en rouge
 * qualifierait d'anomalie une honnêteté, et apprendrait à lire les rouges
 * comme du décor.
 *
 * ⚠ ET IL NE PROPOSE PAS DE RÉESSAYER. Le chiffre n'existe pas ; suggérer un
 * nouvel essai enverrait chercher une panne là où il y a une borne.
 */
function BlocDuRapport<T>({
  titre,
  bloc,
  children,
}: {
  titre: string;
  bloc: Bloc<T>;
  children: (valeurs: T) => React.ReactNode;
}) {
  return (
    <section className="mt-6 break-inside-avoid">
      <h2 className="font-serif text-xl font-bold">{titre}</h2>
      {bloc.etat === 'non_calculable' ? (
        <div className="mt-2 rounded-md border border-line bg-paper px-4 py-3">
          <p className="text-sm font-semibold text-muted">{T.blocAbsentTitre}</p>
          <p className="mt-1 text-sm text-muted">
            {T.blocAbsentPrefixe} {bloc.motif}
          </p>
        </div>
      ) : (
        <div className="mt-2">{children(bloc.valeurs)}</div>
      )}
    </section>
  );
}

/** Un chiffre et son libellé. */
function Chiffre({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <div className="rounded-md border border-line px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-muted">{libelle}</p>
      <p className="mt-0.5 font-serif text-2xl font-bold">{valeur}</p>
    </div>
  );
}

/**
 * Une répartition.
 *
 * ⚠ UNE LIGNE MASQUÉE RESTE, ET ELLE DIT POURQUOI. La retirer ferait
 * disparaître le groupe du rapport, et un lecteur en conclurait qu'il n'existe
 * pas — ou que son effectif est nul. C'est exactement le faux que le seuil
 * existe pour éviter : une absence muette se lit comme un zéro.
 */
function Repartition({ lignes }: { lignes: LigneRepartition[] }) {
  if (lignes.length === 0) return null;
  return (
    <div className="mt-4 overflow-x-auto">
      <p className="text-sm font-semibold">{T.repartitionTitre}</p>
      <table className="mt-2 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
            <th className="py-1.5 pr-4 font-medium">{T.colonneGroupe}</th>
            <th className="py-1.5 font-medium">{T.colonneNombre}</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((l) => (
            <tr key={l.libelle} className="border-b border-line/60">
              <td className="py-1.5 pr-4">{l.libelle}</td>
              <td className="py-1.5">
                {l.nombre === null ? (
                  <span className="text-muted">{l.masque}</span>
                ) : (
                  nombre(l.nombre)
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function RapportAnnuelPage() {
  const [annee, setAnnee] = useState<number>(new Date().getUTCFullYear() - 1);
  /** ⚠ `null` TANT QU'ON NE SAIT PAS : un rapport vide se lirait comme un bilan nul. */
  const [rapport, setRapport] = useState<RapportAnnuel | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async (a: number) => {
    setErreur(null);
    setRapport(null);
    try {
      setRapport(await api<RapportAnnuel>(`/stats/rapport-annuel?annee=${a}`, {}, getToken()));
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : T.chargement);
    }
  }, []);

  useEffect(() => {
    void charger(annee);
  }, [charger, annee]);

  // ⚠ PAS DE `<main>` ICI : la coque du personnel en fournit un, avec la cible
  // du lien d'évitement. En ajouter un second donnait DEUX repères principaux —
  // le garde des invariants l'a dit avant moi, et c'est ce pour quoi il existe.
  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-4 print:hidden">
        <div>
          <h1 className="font-serif text-3xl font-bold">{T.titre}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">{T.introduction}</p>
        </div>
        <div className="flex items-end gap-2">
          <label className="text-sm font-medium">
            {T.choisirAnnee}
            <Select
              className="mt-1"
              value={String(annee)}
              onChange={(e) => setAnnee(Number(e.target.value))}
            >
              {anneesPossibles().map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </Select>
          </label>
          <Button variant="ghost" onClick={() => window.print()}>
            {T.imprimer}
          </Button>
        </div>
      </div>

      {erreur && (
        <Alert tone="error" className="mt-4">
          {erreur}
        </Alert>
      )}

      {!rapport && !erreur && <p className="mt-6 text-sm text-muted">{T.chargement}</p>}

      {rapport && (
        <article className="mt-6">
          <header>
            <h2 className="font-serif text-2xl font-bold">{rapport.etablissement}</h2>
            <p className="text-sm text-muted">
              {T.periode(rapport.periode.libelle)}
            </p>
          </header>

          {/*
            ⚠ L'ANNÉE EN COURS SE SIGNALE, et avant les réserves : c'est une
            limite sur CE rapport-ci, pas une limite du logiciel. Sans elle,
            dix mois d'activité se présentent comme un bilan de douze — un faux
            que ce document peut produire sans qu'aucun de ses blocs soit en
            cause, dans une page qui sert à demander un budget.
          */}
          {rapport.annee === new Date().getUTCFullYear() && (
            <p className="mt-4 rounded-md border border-line bg-paper px-4 py-3 text-sm font-semibold">
              {/*
                ⚠ LA DATE DU JOUR, PAS `periode.fin`. Première écriture : elle
                affichait « chiffres arrêtés au 2026-12-31 » — la fin de la
                période demandée, donc une date FUTURE, qui contredisait
                exactement ce que la phrase prétend dire. Un avertissement qui
                se trompe de date est pire que pas d'avertissement : il donne
                une précision fausse à qui la lit sans la vérifier.
              */}
              {T.anneeEnCours(
                new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }),
              )}
            </p>
          )}

          {/*
            ⚠ LES RÉSERVES EN TÊTE, ET C'EST LE CONTRAT QUI LE DEMANDE : « ce que
            le rapport NE PEUT PAS dire, en tête plutôt qu'en note de bas ». Les
            reléguer en pied de page rendrait le document plus flatteur et moins
            vrai — et c'est un document qui sert à décider d'un budget.
          */}
          {rapport.reserves.length > 0 && (
            <section className="mt-5 rounded-md border border-line bg-paper px-4 py-3">
              <h3 className="text-sm font-semibold">{T.reservesTitre}</h3>
              <p className="mt-0.5 text-xs text-muted">{T.reservesIntroduction}</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
                {rapport.reserves.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </section>
          )}

          <BlocDuRapport titre={T.blocs.fonds} bloc={rapport.fonds}>
            {(v) => (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Chiffre libelle={T.champs.documents} valeur={nombre(v.documents)} />
                  <Chiffre libelle={T.champs.exemplaires} valeur={nombre(v.exemplaires)} />
                  <Chiffre libelle={T.champs.documentsNumeriques} valeur={nombre(v.documentsNumeriques)} />
                  <Chiffre libelle={T.champs.cataloguesDansLAnnee} valeur={nombre(v.cataloguesDansLAnnee)} />
                </div>
                <Repartition lignes={v.parCategorie} />
              </>
            )}
          </BlocDuRapport>

          <BlocDuRapport titre={T.blocs.lecteurs} bloc={rapport.lecteurs}>
            {(v) => (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Chiffre libelle={T.champs.inscrits} valeur={nombre(v.inscrits)} />
                  <Chiffre libelle={T.champs.actifsDansLAnnee} valeur={nombre(v.actifsDansLAnnee)} />
                </div>
                <Repartition lignes={v.parCategorie} />
              </>
            )}
          </BlocDuRapport>

          <BlocDuRapport titre={T.blocs.circulation} bloc={rapport.circulation}>
            {(v) => (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Chiffre libelle={T.champs.prets} valeur={nombre(v.prets)} />
                <Chiffre libelle={T.champs.retours} valeur={nombre(v.retours)} />
                <Chiffre libelle={T.champs.pretsEnRetardAuTerme} valeur={nombre(v.pretsEnRetardAuTerme)} />
                {/*
                  ⚠ `null` N'EST PAS ZÉRO. Un taux de rotation nul se lirait
                  « personne n'emprunte » ; ici il veut dire « aucun exemplaire,
                  donc la division n'a pas de sens ». On le DIT.
                */}
                <Chiffre
                  libelle={T.champs.tauxDeRotation}
                  valeur={v.tauxDeRotation === null ? T.tauxIndisponible : v.tauxDeRotation.toFixed(2)}
                />
              </div>
            )}
          </BlocDuRapport>

          <BlocDuRapport titre={T.blocs.numerique} bloc={rapport.numerique}>
            {(v) => (
              <div className="grid gap-3 sm:grid-cols-3">
                <Chiffre libelle={T.champs.lecturesEnLigne} valeur={nombre(v.lecturesEnLigne)} />
                <Chiffre libelle={T.champs.telechargements} valeur={nombre(v.telechargements)} />
                <Chiffre libelle={T.champs.lecturesHorsLigne} valeur={nombre(v.lecturesHorsLigne)} />
              </div>
            )}
          </BlocDuRapport>

          <BlocDuRapport titre={T.blocs.depot} bloc={rapport.depot}>
            {(v) => (
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <Chiffre libelle={T.champs.deposes} valeur={nombre(v.deposes)} />
                <Chiffre libelle={T.champs.soumis} valeur={nombre(v.soumis)} />
                <Chiffre libelle={T.champs.valides} valeur={nombre(v.valides)} />
                <Chiffre libelle={T.champs.refuses} valeur={nombre(v.refuses)} />
                <Chiffre libelle={T.champs.catalogues} valeur={nombre(v.catalogues)} />
              </div>
            )}
          </BlocDuRapport>

          <BlocDuRapport titre={T.blocs.diffusion} bloc={rapport.diffusion}>
            {() => null}
          </BlocDuRapport>
        </article>
      )}
    </div>
  );
}
