/**
 * UN ÉCRAN QUI DIT CE QUI N'EST PAS ENCORE LÀ — jamais un écran vide.
 *
 * Décision de Jean du 8 octobre 2026, pour l'espace lecteur d'une bibliothèque
 * numérique : « Avant ça, un écran qui le dit ; jamais un écran vide. »
 *
 * ⚠ CE N'EST PAS UN VIDE QUI INVITE À AGIR, et c'est la différence qui compte :
 * il ne propose aucun geste, parce qu'il n'y a rien à faire. Un bouton
 * « réessayer » ou « créer » ici inviterait à réparer un problème qui n'existe
 * pas chez le lecteur.
 *
 * ⚠ ET IL DONNE UNE SORTIE. Une information sans issue ne sert à rien : la
 * seconde phrase dit où le document se trouve en attendant. C'est la règle du
 * dépôt — quand on ne peut pas rendre la phrase vraie, on lui donne une sortie.
 *
 * ⚠ ENFIN, IL DATE SA PROPRE PÉREMPTION. « Pas encore » est la forme que ce
 * dépôt traque : un avertissement exact devient un mensonge quand sa condition
 * disparaît. C'est pourquoi le garde `espace-lecteur-pas-encore.spec.ts` échoue
 * le jour où l'API expose la route correspondante.
 */
export function SectionPasEncore({
  titre,
  pasEncore,
  sortie,
}: {
  titre: string;
  pasEncore: string;
  sortie: string;
}) {
  return (
    <section className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="font-serif text-2xl font-bold text-ink">{titre}</h1>
      <div className="mt-4 rounded-lg border border-line bg-paper px-5 py-5">
        <p className="text-sm font-semibold text-ink">{pasEncore}</p>
        <p className="mt-2 text-sm text-muted">{sortie}</p>
      </div>
    </section>
  );
}
