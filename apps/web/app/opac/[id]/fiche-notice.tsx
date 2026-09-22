'use client';

import { useEffect, useState } from 'react';
import { dateLisible, lireEmbargo } from '@/lib/embargo';
import { LIBELLES } from '@/lib/libelles';

/** Les textes de la réservation, côté LECTEUR. */
const T = LIBELLES.reservations;
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { getToken, getUser } from '@/lib/session';
import { Alert, Badge, Button, Card } from '@/components/ui';
import { LockIcon, MemberLock } from '@/components/member-lock';
import { ID_CONTENU } from '@/components/lien-evitement';
import { formatTitle } from '@/lib/titles';
import { splitContributors } from '@/components/contributors-editor';
import { AuthorNames } from '@/components/contributors-summary';

interface Item {
  id: string;
  barcode: string;
  callNumber: string | null;
  location: string | null;
  status: string;
}

interface RecordDetail {
  id: string;
  title: string;
  titleComplement: string | null;
  author: string | null;
  contributors: { name: string; role: string; position: number; authorId: string | null }[];
  isbn: string | null;
  publishYear: number | null;
  /**
   * ⚠ SERVI PAR LE CONTRAT DE NOTICE PUBLIQUE, et son commentaire dit
   * pourquoi : « une notice dont le fichier refuse SANS DIRE POURQUOI serait
   * exactement le faux silencieux que ce dépôt passe son temps à corriger ».
   * Le front ne le déclarait pas, donc personne ne le montrait — la date était
   * servie à vide depuis le premier jour.
   */
  embargoUntil: string | null;
  language: string;
  category: string | null;
  publisher: string | null;
  publicationCity: string | null;
  defenseUniversity: string | null;
  defensePlace: string | null;
  summary: string | null;
  keywords: string[];
  items: Item[];
  availability: { totalItems: number; available: number; borrowable: boolean } | null;
  digitalCopy: { fileFormat: 'PDF' | 'EPUB' } | null;
  membersOnly: boolean;
}

type RecordAccessStatus = { granted: true } | { granted: false; message: string };

const STATUS_LABELS: Record<string, string> = {
  AVAILABLE: 'Disponible',
  CHECKED_OUT: 'Emprunté',
  ON_HOLD: 'Réservé',
  IN_TRANSIT: 'En transit',
  DAMAGED: 'Abîmé',
  LOST: 'Perdu',
  WITHDRAWN: 'Retiré',
};

/**
 * @param initial notice rendue CÔTÉ SERVEUR, vue publique. Elle n'est pas une
 *        optimisation : sans elle, le HTML servi ne contenait que l'en-tête, et
 *        la page la plus importante d'un catalogue était vide pour les moteurs.
 *
 * ⚠ Elle vient d'un appel ANONYME. Le composant rappelle quand même l'API au
 * montage : c'est là que la session du lecteur s'applique, et que la vue
 * s'enrichit de ce que le contrôle d'accès lui accorde. `initial` est donc un
 * PLANCHER — jamais le mot de la fin.
 */
export function FicheNotice({ initial = null }: { initial?: RecordDetail | null }) {
  const { id } = useParams<{ id: string }>();
  const [record, setRecord] = useState<RecordDetail | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [access, setAccess] = useState<RecordAccessStatus | null>(null);
  const [connected, setConnected] = useState(false);
  const [holdMsg, setHoldMsg] = useState<string | null>(null);
  const [holdError, setHoldError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);

  useEffect(() => {
    setConnected(!!getUser());
  }, []);

  async function placeHold() {
    setHoldError(null);
    setHoldMsg(null);
    setPlacing(true);
    try {
      // ⚠ `pickupDays` ET `nonPrevenus` SONT SERVIS, et n'étaient pas même
      // déclarés ici. Le guichet a été branché sur `nonPrevenus` le
      // 14 septembre ; le côté LECTEUR — la seule personne qui perd quelque
      // chose — est resté muet un jour de plus. Une moitié livrée n'est pas une
      // correction : le côté qui RAPPORTE attend le côté qui LIT.
      const res = await api<{
        readyForPickup: boolean;
        queuePosition: number;
        pickupDays?: number;
        nonPrevenus?: { holdId: string; titre: string; motif: string }[];
      }>('/reader/holds', { method: 'POST', body: JSON.stringify({ recordId: id }) }, getToken());

      if (!res.readyForPickup) {
        setHoldMsg(`Réservation enregistrée — vous êtes en position ${res.queuePosition} dans la file.`);
        return;
      }

      // ⚠ TROIS ÉTATS, PAS DEUX : sans délai servi, on n'invente pas d'échéance.
      const base =
        typeof res.pickupDays === 'number'
          ? T.misDeCoteAvecDelai(res.pickupDays)
          : T.misDeCoteSansDelai;
      // ⚠ Toute entrée concerne CETTE réservation : c'est celle qu'on vient de
      // poser, et l'API ne notifie qu'elle dans ce chemin.
      const prevenu = (res.nonPrevenus?.length ?? 0) === 0;
      setHoldMsg(prevenu ? base : `${base} ${T.confirmationNonEnvoyee}`);
    } catch (err) {
      setHoldError(err instanceof ApiError ? err.message : 'Réservation impossible.');
    } finally {
      setPlacing(false);
    }
  }

  useEffect(() => {
    api<RecordDetail>(`/opac/records/${id}`, {}, getToken())
      .then(setRecord)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Notice indisponible.'),
      );
  }, [id]);

  // L'accès (classe/abonnement) n'a de sens qu'une fois membre et pour un
  // document numérique existant — le bouton reste verrouillé tant qu'on ne
  // sait pas. La vérification serveur (brique 4) reste faite à nouveau à
  // l'ouverture de la lecture : ceci ne pilote que l'état visuel du bouton.
  useEffect(() => {
    if (!record || record.membersOnly || !record.digitalCopy) return;
    api<RecordAccessStatus>(`/collections/me/records/${id}/access`, {}, getToken())
      .then(setAccess)
      .catch(() => setAccess({ granted: false, message: 'Accès indisponible pour le moment.' }));
  }, [record, id]);

  if (error) {
    return (
      <main id={ID_CONTENU} className="mx-auto max-w-3xl px-6 py-8">
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
        {/* ⚠ Sans ce lien, « Notice introuvable » est un cul-de-sac : la fiche
            ne rend QUE l'alerte, et le seul recours est le bouton Précédent.
            Un identifiant périmé dans un lien partagé mène donc à une page
            dont on ne sort pas — le même défaut que le catalogue vide, en
            plus petit. Constaté le 10 septembre 2026, passe sans cookie. */}
        <Link href="/opac" className="mt-4 inline-block text-sm text-muted hover:text-ink">
          ← Retour au catalogue
        </Link>
      </main>
    );
  }
  if (!record) return null;

  return (
    <main id={ID_CONTENU} className="mx-auto max-w-3xl px-6 py-8">
      <Link href="/opac" className="text-sm text-muted hover:text-ink">
        ← Retour au catalogue
      </Link>

      <div className="mt-4 flex items-start justify-between gap-4">
        <h1 className="font-serif text-3xl font-bold">
          {formatTitle(record.title, record.titleComplement)}
        </h1>
        {record.membersOnly ? (
          <MemberLock hint="Disponibilité réservée aux membres" />
        ) : record.availability?.borrowable ? (
          <Badge tone="green">{LIBELLES.ficheNotice.badgeDisponible}</Badge>
        ) : record.availability?.totalItems === 0 ? (
          /*
            ⚠ TROISIÈME ÉTAT, et il n'est pas cosmétique. « Indisponible » sur
            une notice purement numérique CONTREDIT le bloc de lecture en ligne
            qui s'affiche vingt lignes plus bas. Le corps de la fiche distingue
            déjà les deux cas — `totalItems === 0` d'un côté, « tous sortis » de
            l'autre — et le badge les collapsait.
          */
          <Badge>{LIBELLES.ficheNotice.badgeSansExemplaire}</Badge>
        ) : (
          <Badge>{LIBELLES.ficheNotice.badgeIndisponible}</Badge>
        )}
      </div>

      {/*
        ⚠ DIT INDÉPENDAMMENT DU REFUS DE LECTURE, et c'est délibéré. Le message
        d'accès (`access.message`) ne s'affiche que pour un lecteur CONNECTÉ et
        sur une notice qui porte un fichier ; l'embargo, lui, est un fait de la
        notice. Un visiteur, ou un lecteur devant une notice sans fichier, doit
        pouvoir comprendre pourquoi ce document n'est pas encore lisible.

        ⚠ Et il ne contredit pas le refus : les deux disent la même date, et le
        refus reste à l'endroit du GESTE, où il sert.
      */}
      {(() => {
        const embargo = lireEmbargo(record.embargoUntil);
        if (embargo.etat !== 'en-cours') return null;
        return (
          <p className="mt-3 rounded-lg border border-line bg-paper px-4 py-3 text-sm">
            <span className="font-semibold text-ink">
              {LIBELLES.embargo.enCours(dateLisible(embargo.jusquAu))}
            </span>{' '}
            <span className="text-muted">{LIBELLES.embargo.enCoursSuite}</span>
          </p>
        );
      })()}

      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
        {(() => {
          const { authors, directors } = splitContributors(record.contributors);
          // Repli sur l'ancien champ pour les notices pas encore migrées.
          const authorRefs = authors.length > 0 ? authors : record.author ? [{ name: record.author }] : [];
          return (
            <>
              <dt className="font-semibold">{authorRefs.length > 1 ? 'Auteurs' : 'Auteur'}</dt>
              {/* Noms cliquables → fiche d'autorité (repli recherche par nom). */}
              <dd>{authorRefs.length > 0 ? <AuthorNames authors={authorRefs} link /> : '—'}</dd>
              {directors.length > 0 && (
                <>
                  <dt className="font-semibold">Directeur de mémoire / de thèse</dt>
                  <dd>
                    <AuthorNames authors={directors} link />
                  </dd>
                </>
              )}
            </>
          );
        })()}
        <dt className="font-semibold">Année</dt>
        <dd>{record.publishYear ?? '—'}</dd>
        <dt className="font-semibold">ISBN</dt>
        <dd>{record.isbn ?? '—'}</dd>
        <dt className="font-semibold">Langue</dt>
        <dd>{record.language}</dd>
        <dt className="font-semibold">Domaine</dt>
        <dd>{record.category ?? '—'}</dd>
        {/* Champs pilotés par la présence de données : édition pour les
            ouvrages, soutenance pour les thèses/mémoires (§2.3). */}
        {record.publisher && (
          <>
            <dt className="font-semibold">Éditeur</dt>
            <dd>{record.publisher}</dd>
          </>
        )}
        {record.publicationCity && (
          <>
            <dt className="font-semibold">Ville d’édition</dt>
            <dd>{record.publicationCity}</dd>
          </>
        )}
        {record.defenseUniversity && (
          <>
            <dt className="font-semibold">Université de soutenance</dt>
            <dd>{record.defenseUniversity}</dd>
          </>
        )}
        {record.defensePlace && (
          <>
            <dt className="font-semibold">Lieu de soutenance</dt>
            <dd>{record.defensePlace}</dd>
          </>
        )}
      </dl>

      {record.summary && (
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted">{record.summary}</p>
      )}

      {record.keywords?.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {record.keywords.map((keyword) => (
            <span
              key={keyword}
              className="rounded-full bg-line/60 px-2.5 py-1 text-xs font-medium"
            >
              {keyword}
            </span>
          ))}
        </div>
      )}

      {record.membersOnly ? (
        <>
          <h2 className="mt-8 flex items-center gap-2 font-serif text-xl font-bold">
            Exemplaires &amp; disponibilité
            <MemberLock hint="Exemplaires et disponibilité réservés aux membres" />
          </h2>
          <div className="mt-3 flex items-center gap-3 rounded-lg border border-dashed border-ocre/50 bg-ocre/5 px-4 py-4 text-sm text-muted">
            <LockIcon className="h-5 w-5 shrink-0 text-ocre" />
            <p>
              La disponibilité et les exemplaires sont réservés aux membres.{' '}
              <Link href="/login" className="font-semibold text-ocre underline">
                Connectez-vous
              </Link>{' '}
              ou{' '}
              <Link href="/inscription" className="font-semibold text-ocre underline">
                créez un compte
              </Link>{' '}
              pour y accéder.
            </p>
          </div>
        </>
      ) : (
        <>
          <h2 className="mt-8 font-serif text-xl font-bold">
            Exemplaires ({record.availability?.available}/
            {record.availability?.totalItems} disponibles)
          </h2>
          <div className="mt-3 flex flex-col gap-2">
            {record.items.length === 0 && (
              <p className="text-sm text-muted">Aucun exemplaire physique.</p>
            )}
            {record.items.map((item) => (
              <Card key={item.id} className="flex items-center justify-between !p-4">
                <div className="text-sm">
                  <span className="font-mono font-semibold">{item.barcode}</span>
                  {item.callNumber && (
                    <span className="ml-3 text-muted">{item.callNumber}</span>
                  )}
                  {item.location && (
                    <span className="ml-3 text-muted">{item.location}</span>
                  )}
                </div>
                <Badge tone={item.status === 'AVAILABLE' ? 'green' : 'neutral'}>
                  {STATUS_LABELS[item.status] ?? item.status}
                </Badge>
              </Card>
            ))}
          </div>

          {/*
            ⚠ RÉSERVER EXIGE UN EXEMPLAIRE, et pas seulement « rien d'empruntable ».
            Décision du 15 septembre 2026. La condition précédente —
            `!borrowable` — était vraie aussi quand il n'y a AUCUN exemplaire :
            un document purement numérique proposait donc une réservation.

            ⚠ Une file d'attente sur un fichier n'a pas de sens, et surtout : une
            file qui ne peut jamais se vider est un FAUX DISPOSITIF. Le lecteur
            croit avoir une place, et il n'en a pas. Mesuré : 139 notices sur 480
            sont dans ce cas — 20 avec une copie numérique, 119 sans rien.
          */}
          {record.availability && record.availability.totalItems === 0 && (
            <p className="mt-4 text-sm text-muted">{LIBELLES.ficheNotice.sansExemplaire}</p>
          )}
          {record.availability &&
            record.availability.totalItems > 0 &&
            !record.availability.borrowable && (
            <div className="mt-4">
              {holdMsg && <Alert tone="success">{holdMsg}</Alert>}
              {holdError && <Alert tone="error">{holdError}</Alert>}
              {!holdMsg &&
                (connected ? (
                  <Button onClick={placeHold} disabled={placing}>
                    {placing ? 'Réservation…' : 'Réserver ce document'}
                  </Button>
                ) : (
                  <p className="text-sm text-muted">
                    Aucun exemplaire disponible.{' '}
                    <Link href="/login" className="font-semibold text-ocre underline">
                      Connectez-vous
                    </Link>{' '}
                    pour le réserver.
                  </p>
                ))}
            </div>
          )}
        </>
      )}

      <h2 className="mt-8 flex items-center gap-2 font-serif text-xl font-bold">
        Lecture en ligne
        {record.membersOnly && (
          <MemberLock hint="Lecture en ligne réservée aux membres" />
        )}
      </h2>
      {record.membersOnly ? (
        <p className="mt-2 text-sm text-muted">
          Si une version numérique existe pour ce document, elle est réservée aux
          membres.{' '}
          <Link href="/login" className="font-semibold text-ocre underline">
            Connectez-vous
          </Link>{' '}
          ou{' '}
          <Link href="/inscription" className="font-semibold text-ocre underline">
            créez un compte
          </Link>
          .
        </p>
      ) : record.digitalCopy && access?.granted ? (
        <Link
          href={`/opac/${record.id}/lire`}
          className="mt-2 inline-flex items-center gap-2 rounded-md bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:bg-ink/90"
        >
          Lire en ligne
          <span className="rounded bg-white/20 px-1.5 py-0.5 text-xs uppercase">
            {record.digitalCopy.fileFormat}
          </span>
        </Link>
      ) : record.digitalCopy && access && !access.granted ? (
        <div className="mt-2 flex items-center gap-3 rounded-lg border border-dashed border-ocre/50 bg-ocre/5 px-4 py-4 text-sm text-muted">
          <LockIcon className="h-5 w-5 shrink-0 text-ocre" />
          {/* ⚠ PAS DE BOUTON GRISÉ ICI, ET C'EST UNE RÈGLE DÉJÀ TRANCHÉE SUR CET
              ÉCRAN. Un `<p>` maquillé en bouton — mêmes formes, grisé, avec
              `aria-disabled="true"` — se lisait comme une panne au-dessus de la
              phrase qui, elle, dit ce qui EST. Et l'`aria-disabled` sur un
              paragraphe ne dit rien à personne : ce n'est pas focalisable, donc
              jamais atteint au clavier.
              Reste ce qui informe : le refus, et sous quelle forme le document
              existe. */}
          <div>
            <p className="font-semibold text-ink">{access.message}</p>
            <p className="mt-1 text-xs text-muted">
              {LIBELLES.lectureRefusee.formatExistant(record.digitalCopy.fileFormat)}
            </p>
          </div>
        </div>
      ) : record.digitalCopy ? (
        <p className="mt-2 text-sm text-muted">Vérification de l’accès…</p>
      ) : (
        <p className="mt-2 text-sm text-muted">
          Pas de version numérique disponible pour ce document.
        </p>
      )}
    </main>
  );
}
