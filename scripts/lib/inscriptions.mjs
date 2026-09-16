/**
 * L'INSCRIPTION QUI ACCOMPAGNE LA CLASSE — une seule implémentation.
 *
 * ⚠ POURQUOI CE FICHIER EXISTE PLUTÔT QUE DEUX COPIES. Deux écrivains ont
 * besoin de cette règle : le seed de démonstration (au moment où il crée des
 * comptes) et le rattrapage (sur une base qu'on ne réensemence pas). Deux
 * tableaux qui se ressemblent finissent par diverger — et ici la divergence
 * reproduirait exactement le défaut qu'on répare.
 *
 * ⚠ L'ANNÉE ACADÉMIQUE N'EST PAS ICI. Elle appartient au produit
 * (`apps/api/src/enrollment/academic-year.ts`), sa règle a déjà été fausse une
 * fois, et elle se passe en ARGUMENT — ce module ne la devine jamais.
 */

/**
 * Crée l'inscription manquante de chaque compte qui porte une classe.
 *
 * Purement ADDITIF et IDEMPOTENT. Un compte dont la `className` ne correspond
 * à aucune classe est RENDU dans `sansClasse`, jamais rattrapé : créer la
 * classe serait une décision de métier, et le produit la refuse lui-même
 * (« Classe « X » inconnue : cette règle ne correspondrait à aucun étudiant »).
 *
 * @returns {Promise<{prevues:number, creees:number, sansClasse:string[]}>}
 */
export async function assurerLesInscriptions(db, academicYear) {
  if (!academicYear) throw new Error('assurerLesInscriptions : academicYear est obligatoire.');

  // RECENSEMENT par IDENTIFIANTS, pas par compte : le contrôle final se
  // confronte à ce qui existait, jamais à sa propre empreinte.
  const avant = new Set((await db.enrollment.findMany({ select: { id: true } })).map((e) => e.id));

  const classes = new Map(
    (await db.schoolClass.findMany({ select: { id: true, name: true } })).map((c) => [c.name, c.id]),
  );
  const comptes = await db.user.findMany({
    where: { className: { not: null } },
    select: { id: true, email: true, className: true },
  });
  const deja = new Set(
    (await db.enrollment.findMany({ where: { academicYear }, select: { userId: true } })).map((e) => e.userId),
  );

  const aCreer = [];
  const sansClasse = [];
  for (const u of comptes) {
    if (deja.has(u.id)) continue;
    const classId = classes.get(u.className);
    if (!classId) { sansClasse.push(`${u.email} → « ${u.className} »`); continue; }
    aCreer.push({ userId: u.id, classId, academicYear });
  }

  if (aCreer.length) await db.enrollment.createMany({ data: aCreer, skipDuplicates: true });

  // CONTRÔLE PAR DIFFÉRENCE D'ENSEMBLES : ce qui est APPARU.
  const apres = await db.enrollment.findMany({ select: { id: true } });
  const creees = apres.filter((e) => !avant.has(e.id)).length;
  return { prevues: aCreer.length, creees, sansClasse };
}
