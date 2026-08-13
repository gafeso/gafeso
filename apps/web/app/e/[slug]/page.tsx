import Link from 'next/link';
import { fetchTenantHome } from '@/lib/server-api';

/**
 * Page d'atterrissage du QR d'établissement.
 *
 * C'EST LA RAISON D'ÊTRE DU FORMAT `https`. Devant une affiche en amphi, la
 * majorité des téléphones n'a PAS l'application installée. Un QR portant un
 * schéma applicatif (`gafeso://…`) n'y produit rigoureusement rien : ni page,
 * ni message, ni explication — l'appareil photo reconnaît un code et ne sait
 * qu'en faire. Une URL, elle, ouvre toujours quelque chose. Cette page est ce
 * quelque chose : elle nomme l'établissement, dit quoi installer, et laisse
 * consulter le catalogue tout de suite pour ceux qui n'installeront rien.
 *
 * Elle est publique et sans état : on ne sait pas, et on n'a pas à savoir, si
 * le visiteur est inscrit.
 */
export const dynamic = 'force-dynamic';

export default async function EnrollmentLanding({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // Le nom vient du domaine courant, pas du slug de l'URL : c'est le Host qui
  // fait autorité sur l'établissement. Le slug reste affiché tel quel, car
  // c'est lui que le lecteur devra parfois recopier à la main.
  const home = await fetchTenantHome();
  // `??` ne suffit PAS : une vitrine non renseignée rend `fullName: ''`, une
  // chaîne vide qui traverse `??` sans déclencher le repli. La page affichait
  // alors un titre VIDE — sans erreur, sans trace, et précisément sur l'écran
  // dont le seul rôle est de dire au lecteur où il est. Constaté sur l'app.
  const nom =
    [home?.content?.identity?.fullName, home?.name].find((v) => v && v.trim()) ??
    'Bibliothèque';

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 px-6 py-16">
      <header className="text-center">
        <p className="text-sm uppercase tracking-widest text-muted">Bibliothèque numérique</p>
        <h1 className="mt-2 font-serif text-3xl font-bold">{nom}</h1>
      </header>

      <section className="rounded-lg border border-line p-6">
        <h2 className="font-serif text-lg font-bold">Lire hors connexion</h2>
        <p className="mt-2 text-sm text-muted">
          L’application Gafeso vous permet d’emporter les documents auxquels votre
          établissement vous donne accès et de les lire sans réseau.
        </p>
        <p className="mt-4 text-sm">
          À l’installation, saisissez le code d’école&nbsp;:{' '}
          <strong className="font-mono">{slug}</strong>
        </p>
      </section>

      <section className="rounded-lg border border-line p-6">
        <h2 className="font-serif text-lg font-bold">Sans installer l’application</h2>
        <p className="mt-2 text-sm text-muted">
          Le catalogue est consultable directement depuis ce navigateur.
        </p>
        <Link href="/opac" className="mt-4 inline-block text-sm font-semibold underline">
          Ouvrir le catalogue →
        </Link>
      </section>

      <footer className="text-center text-xs text-muted">
        <Link href="/login" className="underline">
          J’ai déjà un compte
        </Link>
      </footer>
    </main>
  );
}
