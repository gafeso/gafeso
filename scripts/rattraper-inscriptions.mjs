#!/usr/bin/env node
/**
 * RATTRAPAGE — une inscription pour chaque compte qui porte déjà une classe.
 *
 * ⚠ POURQUOI IL EXISTE. `AccountsService` écrit `users.class_name` ET
 * l'inscription dans la MÊME transaction, et son commentaire l'affirme : « les
 * deux ne peuvent pas diverger ». Elles ont divergé, parce qu'un SECOND
 * écrivain existe — `seed-demo.mjs` écrivait la classe directement, sans
 * inscription. L'écran des classes lit `_count.enrollments` et affichait donc
 * « 0 étudiant » pour des classes qui en portaient vingt.
 *
 * Le seed est corrigé pour le neuf ; ce script répare l'existant, sur une base
 * qu'on ne veut pas réensemencer entièrement.
 *
 * ⚠ CE QU'IL FAIT ET CE QU'IL NE FAIT PAS.
 *  · PUREMENT ADDITIF : il ne modifie ni ne supprime aucune ligne.
 *  · IDEMPOTENT, et c'est VÉRIFIÉ en le lançant deux fois, jamais en le
 *    relisant (voir la leçon du 16 septembre dans CLAUDE.md).
 *  · Il n'invente aucune classe. Un compte dont la `class_name` ne correspond
 *    à aucune `school_classes` est SIGNALÉ, jamais rattrapé — créer la classe
 *    serait une décision de métier, et le produit la refuse lui-même.
 *  · Il ne suppose RIEN du fonds : zéro compte, zéro classe, zéro inscription
 *    sont des états normaux, dits et non devinés.
 *
 * ⚠ L'ANNÉE ACADÉMIQUE VIENT DU PRODUIT, elle n'est pas recopiée : sa règle a
 * déjà été fausse une fois (calcul sur l'année civile, juste de septembre à
 * décembre seulement).
 *
 *   node scripts/rattraper-inscriptions.mjs --ecoles=gafeso-univ
 *   node scripts/rattraper-inscriptions.mjs --ecoles=gafeso-univ --appliquer
 *
 * `DATABASE_URL` est lue dans l'ENVIRONNEMENT (le conteneur `api` la porte) ;
 * en développement, le `.env` de la racine est chargé s'il est là. Sans
 * `--ecoles`, toutes les écoles provisionnées sont parcourues.
 *
 * Sans `--appliquer`, il ne fait que COMPTER : un script qui écrit par défaut
 * est un script qu'on lance par mégarde.
 */
import { loadEnvIfPresent } from './lib/load-env.mjs';
import { assurerLesInscriptions } from './lib/inscriptions.mjs';
import { ouvrirEcole, listerLesEcoles, regleDuProduit, RACINE } from './lib/base-tenant.mjs';
import { join } from 'node:path';

loadEnvIfPresent(join(RACINE, '.env'));

const args = process.argv.slice(2);
const appliquer = args.includes('--appliquer');
const demandees = (args.find((a) => a.startsWith('--ecoles='))?.slice(9) ?? '')
  .split(',').map((s) => s.trim()).filter(Boolean);

const { currentAcademicYear } = await regleDuProduit(join('enrollment', 'academic-year.js'));
const annee = currentAcademicYear();
console.log(`Année académique du produit : ${annee}${appliquer ? '' : '   (LECTURE SEULE — ajoutez --appliquer)'}`);

const presentes = await listerLesEcoles();
// ⚠ UNE ÉCOLE NOMMÉE QUI N'EXISTE PAS EST UNE ERREUR, jamais un silence :
// sans ce contrôle, une faute de frappe rendait « rien à faire » et on croyait
// le travail fait.
const inconnues = demandees.filter((s) => !presentes.includes(s));
if (inconnues.length) {
  console.error(`⚠ École(s) inconnue(s) : ${inconnues.join(', ')}`);
  console.error(`  Écoles présentes : ${presentes.join(', ') || '(aucune)'}`);
  process.exit(2);
}
const slugs = demandees.length ? demandees : presentes;
if (!slugs.length) { console.error('⚠ Aucune école provisionnée dans cette base.'); process.exit(2); }

let creees = 0;
for (const slug of slugs) {
  const db = await ouvrirEcole(slug);
  try {
    const comptes = await db.user.count({ where: { className: { not: null } } });
    const avant = await db.enrollment.count();

    if (!appliquer) {
      const classes = new Set((await db.schoolClass.findMany({ select: { name: true } })).map((c) => c.name));
      const deja = new Set(
        (await db.enrollment.findMany({ where: { academicYear: annee }, select: { userId: true } }))
          .map((e) => e.userId),
      );
      const restants = (await db.user.findMany({
        where: { className: { not: null } },
        select: { id: true, email: true, className: true },
      })).filter((u) => !deja.has(u.id));
      const inconnue = restants.filter((u) => !classes.has(u.className));
      console.log(`\n── ${slug} : ${comptes} compte(s) à classe, ${avant} inscription(s), ${restants.length - inconnue.length} à créer`);
      for (const u of inconnue) console.log(`   ⚠ classe inconnue, NON rattrapé : ${u.email} → « ${u.className} »`);
      continue;
    }

    const { prevues, creees: n, sansClasse } = await assurerLesInscriptions(db, annee);
    console.log(`\n── ${slug} : ${comptes} compte(s) à classe, ${avant} inscription(s), ${prevues} à créer`);
    for (const m of sansClasse) console.log(`   ⚠ classe inconnue, NON rattrapé : ${m}`);
    console.log(`   ✓ ${n} inscription(s) apparue(s) (attendu ${prevues})`);
    if (n !== prevues) {
      console.error('   ⚠ ÉCART entre le prévu et l’apparu — relisez avant de continuer.');
      process.exitCode = 1;
    }
    creees += n;
  } finally {
    await db.$disconnect();
  }
}
console.log(`\n${appliquer ? `${creees} inscription(s) créée(s).` : 'Rien écrit (mode lecture).'}`);
