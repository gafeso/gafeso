import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import { CouvertureV3 } from '@/components/couverture-v3';
import { QrCode } from '@/components/qr-code';
import { LIBELLES } from '@/lib/libelles';
import { fetchTenantHome, noticePublique } from '@/lib/server-api';
import { adresseDuQr } from '@/lib/url-publique';

const T = LIBELLES.affiche;

/**
 * L'AFFICHE A4 D'UNE NOTICE — une page, sans menu ni pied, lisible en N&B.
 *
 * ## ⚠ POURQUOI ELLE N'EST PAS SOUS `/opac/[id]/affiche`
 *
 * Le lot demande « sans menu ni pied ». Dans l'App Router, **un layout imbriqué
 * ne peut pas RETIRER son parent** : tout ce qui vit sous `app/opac/` hérite de
 * `app/opac/layout.tsx`, donc du lien d'évitement et de l'en-tête. L'affiche
 * vit donc à la racine, où le seul gabarit est `app/layout.tsx` — qui ne porte
 * que le thème.
 *
 * ⚠ ET ELLE A DONC FALLU ENTRER DANS `PUBLIC_PREFIXES` du middleware. Sans
 * cela, elle rendait **307 vers /login** — exactement ce qui est arrivé aux
 * pages légales le 9 octobre, et pour la même raison : tout ce qui n'est pas
 * déclaré public traverse la garde d'authentification. Mesuré sans cookie, pas
 * supposé.
 *
 * ## ⭐ RENDUE AU SERVEUR, DONC IMPRIMABLE SANS JAVASCRIPT
 *
 * L'adresse publique vient du `Host` de la requête — la même convention que
 * `OaiController.baseUrl()` côté API. Un QR calculé au serveur est là dès le
 * premier octet : on peut imprimer une page qui n'a pas fini de s'hydrater, et
 * c'est le cas normal sur un poste de bibliothèque.
 *
 * ## ⚠ LISIBLE EN NOIR ET BLANC — et ce n'est pas qu'une couleur de texte
 *
 * Les navigateurs n'impriment PAS les fonds par défaut. La couverture composée
 * EST un fond : elle peut donc disparaître à l'impression. L'affiche est
 * construite pour que rien d'essentiel n'en dépende — titre, auteur, type,
 * année, QR et adresse sont du TEXTE et un tracé noir. La couverture est un
 * ornement, et son absence ne retire aucune information.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const { etat, notice } = await noticePublique(id);
  if (etat !== 'existe') return {};
  const n = notice as { title?: string };
  // ⚠ `absolute` : sans lui, le gabarit racine ajoute le nom de l'école, et le
  // titre d'un onglet d'affiche n'a pas à le répéter — il est DANS l'affiche.
  return { title: { absolute: `${T.scannez} — ${n.title ?? ''}`.trim() } };
}

interface Notice {
  id: string;
  title: string;
  titleComplement: string | null;
  author: string | null;
  recordType: string;
  category: string | null;
  publishYear: number | null;
  /**
   * ⚠ L'ADRESSE CANONIQUE, servie depuis le 11 octobre 2026 — et c'est pour
   * une AFFICHE qu'elle compte le plus : imprimée depuis une adresse interne,
   * l'affiche encodait cette adresse-là. `null` sans `APP_URL` configuré, et on
   * retombe alors sur l'hôte de la requête, qui est tout ce qu'on connaît.
   */
  publicUrl: string | null;
  /**
   * ⭐ Les deux clés de la couverture v3, RÉSOLUES par le serveur — jamais
   * `null`, jamais hors liste. Mesuré servi sur `/opac/records/:id`.
   */
  coverTemplate: string;
  coverDomain: string;
}

export default async function AffichePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ etat, notice }, home] = await Promise.all([noticePublique(id), fetchTenantHome()]);

  /*
   * ⚠ LES TROIS ÉTATS, comme la fiche — et pour la même raison : répondre 404
   * sur une panne déclarerait disparu ce qu'on n'a pas pu joindre, et le ferait
   * savoir aux moteurs. Ici, `indisponible` ne peut RIEN afficher d'utile — une
   * affiche sans titre ni adresse n'est pas une affiche —, donc on ne rend pas
   * la page ; mais on ne ment pas en 404 non plus.
   */
  if (etat === 'introuvable') notFound();
  if (etat !== 'existe' || !notice) {
    return (
      <main className="mx-auto max-w-[210mm] p-10">
        <p className="text-sm">{T.indisponible}</p>
      </main>
    );
  }

  const n = notice as Notice;
  const h = await headers();
  const hote = h.get('x-forwarded-host') ?? h.get('host') ?? '';
  const proto = h.get('x-forwarded-proto') ?? (hote.startsWith('localhost') ? 'http' : 'https');
  const url = adresseDuQr(n.id, n.publicUrl, `${proto}://${hote}`);
  const type = LIBELLES.typesDeNotice[n.recordType] ?? n.recordType;

  return (
    <main
      /* A4 : 210 × 297 mm. `@page` est posé dans le style ci-dessous — Tailwind
         ne sait pas écrire de règle `@page`. */
      className="mx-auto flex min-h-screen max-w-[210mm] flex-col justify-between bg-white p-[14mm] text-ink print:min-h-0"
    >
      {/* eslint-disable-next-line react/no-danger -- règle @page, sans donnée */}
      <style
        dangerouslySetInnerHTML={{
          __html:
            '@page{size:A4;margin:0}' +
            /* ⚠ UNE SEULE PAGE : sans cela, un titre long pousse le QR sur une
               seconde feuille, et on colle une affiche amputée. */
            '@media print{html,body{margin:0;padding:0}main{page-break-after:avoid}}',
        }}
      />

      <header className="border-b-2 border-ink pb-3">
        <p className="font-serif text-2xl font-bold leading-tight">{home?.name ?? ''}</p>
        <p className="mt-0.5 text-sm uppercase tracking-widest">{T.sousTitre}</p>
      </header>

      <section className="flex flex-1 items-center gap-[10mm] py-[8mm]">
        {/*
          ⭐ COUVERTURE v3. Les deux clés viennent résolues de l'API.

          ⚠ Et ICI le type MONTE sur la couverture, là où la fiche le lui
          refuse : cette affiche l'imprime en texte juste à côté (« OUVRAGE ·
          2026 »), donc la couverture le DOUBLE au lieu de le porter seule. La
          borne est la même qu'ailleurs — `aria-hidden` ne peut dire que ce qui
          est déjà dit.
        */}
        <CouvertureV3
          coverTemplate={n.coverTemplate}
          coverDomain={n.coverDomain}
          type={type}
          titre={n.title}
          auteur={n.author}
          annee={n.publishYear}
          etablissement={home?.name ?? null}
          largeur={150}
          className="shrink-0"
        />
        <div className="min-w-0">
          <h1 className="font-serif text-3xl font-bold leading-tight">{n.title}</h1>
          {n.titleComplement && <p className="mt-1 text-lg">{n.titleComplement}</p>}
          {/* ⚠ AUCUN CHAMP INVENTÉ, comme la couverture : un auteur absent
              disparaît, il ne devient pas « Auteur inconnu ». */}
          {n.author && <p className="mt-3 text-xl">{n.author}</p>}
          <p className="mt-3 text-base uppercase tracking-wide">
            {type}
            {n.publishYear !== null && <span> · {n.publishYear}</span>}
          </p>
        </div>
      </section>

      <section className="flex items-center gap-[10mm] border-t-2 border-ink pt-[6mm]">
        <QrCode
          valeur={url}
          taille={210}
          className="shrink-0"
          etiquette={LIBELLES.etiquettes.qrEtiquette(url)}
        />
        <div className="min-w-0">
          <p className="font-serif text-2xl font-bold leading-snug">{T.scannez}</p>
          {/* ⚠ L'ADRESSE EN CLAIR, et c'est la pièce qui rattrape le reste :
              l'URL est dérivée du `Host` de la requête, donc une affiche
              imprimée depuis une adresse interne encoderait celle-là. Un humain
              le voit ici, avant de coller l'affiche dans un couloir. */}
        </div>
      </section>

      {/* ⚠ `print:hidden` : ces commandes sont de l'écran, pas de l'affiche. */}
      <div className="mt-[8mm] flex flex-wrap items-center gap-4 print:hidden">
        <a
          href={`/opac/${n.id}`}
          className="text-sm underline"
        >
          {T.retour}
        </a>
        <p className="text-xs text-muted">{T.aideImpression}</p>
      </div>
    </main>
  );
}
