import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { MESSAGE_BASE_INJOIGNABLE } from '../common/base-injoignable';
import { DEFENSE_RECORD_TYPES } from './description-profiles';
import { ETATS_DEPOT } from '../depots/etats';

/**
 * ⚠ LE TAMIS — le fonds relu à travers les RÈGLES DU PRODUIT.
 *
 * *Backlog n°27, posé le 15 septembre 2026.*
 *
 * Le seed, les scripts de rattrapage, les imports en masse et les fixtures
 * écrivent **directement par Prisma**. Ils ne passent donc ni par les DTO, ni
 * par les validations de service, ni par les règles que l'API s'impose à
 * elle-même. Ce qu'ils produisent n'est pas garanti acceptable par nos propres
 * routes — **et rien ne le dit, puisque rien ne le relit.**
 *
 * > ⭐ Un fonds de démonstration qui contient ce que le produit rejette ne
 * > démontre pas le produit.
 *
 * ⚠ ET ÇA NE SE DÉCOUVRE PAS EN DÉVELOPPANT : une donnée de test incohérente
 * se voit en codant, un fonds de démonstration se voit DEVANT UN CLIENT, sur
 * l'écran qu'on a choisi de montrer parce qu'on le croyait sûr. Le
 * 15 septembre 2026, une recette à l'œil a trouvé des dépôts « validés » et
 * « catalogués » SANS document — un état que `soumettre` refuse de produire.
 * Ce fichier le dit d'un coup, et pour toutes les écoles.
 *
 * ⚠ IL NE REJOUE PAS LES RÈGLES : IL LES IMPORTE. `DEFENSE_RECORD_TYPES`,
 * `ETATS_DEPOT` viennent du code du produit. Une règle recopiée ici
 * diverge — et un tamis qui compare une copie à une copie ne tamise rien.
 *
 *   PG_LIVE=1 npx dotenv -e ../../.env -- vitest run src/cataloging/fonds-conforme-en-base.spec.ts
 */

const prisma = new PrismaClient();

describe.runIf(process.env.PG_LIVE === '1')('Le fonds passe les règles du produit', () => {
  let joignable = false;
  let ecoles: string[] = [];

  beforeAll(async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      joignable = true;
      const provisionnees = await prisma.$queryRaw<{ slug: string }[]>`
        SELECT replace(table_schema, 'tenant_', '') AS slug
        FROM information_schema.tables
        WHERE table_name = 'biblio_records' AND table_schema LIKE 'tenant\\_%'`;
      ecoles = provisionnees.map((p) => p.slug);
    } catch {
      joignable = false;
    }
  }, 30_000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('⚠ le tamis voit au moins une école — sinon il ne mesure rien', () => {
    expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
    expect(ecoles.length, 'aucune école provisionnée : ce tamis ne tamise rien').toBeGreaterThan(0);
  });

  it('⚠ UN DÉPÔT NON-BROUILLON PORTE UN DOCUMENT — `soumettre` l’exige', async () => {
    expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
    const fautifs: string[] = [];
    let examines = 0;
    for (const slug of ecoles) {
      const depots = await prisma.$queryRawUnsafe<
        { id: string; status: string; title: string; file_key: string | null }[]
      >(`SELECT id, status, title, file_key FROM "tenant_${slug}".deposits`);
      for (const d of depots) {
        examines++;
        if (d.status !== ETATS_DEPOT[0] && !d.file_key) {
          fautifs.push(`${slug} · « ${d.title} » (${d.status}) sans document`);
        }
      }
    }
    expect(
      fautifs,
      'Des dépôts sont dans un état que le produit REFUSE de produire.\n' +
        fautifs.map((f) => `  · ${f}`).join('\n') +
        '\n\n`DepotsService.soumettre` exige `fileKey` — « Téléversez le document ' +
        'avant de soumettre ». L’écran affiche alors, sur la même carte, « le ' +
        'document n’est plus remplaçable » ET « aucun document joint ».\n' +
        '⚠ L’écran n’est PAS fautif : il décrit fidèlement un état qui n’aurait ' +
        'jamais dû exister. Cherchez l’écrivain qui a contourné le service.',
    ).toEqual([]);
    expect(examines, 'aucun dépôt examiné : le tamis ne mesure rien').toBeGreaterThan(0);
  }, 60_000);

  it('⚠ UN DÉPÔT DÉCIDÉ PORTE SA DATE ET SON DÉCIDEUR', async () => {
    expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
    const fautifs: string[] = [];
    for (const slug of ecoles) {
      const d = await prisma.$queryRawUnsafe<{ title: string; status: string }[]>(
        `SELECT title, status FROM "tenant_${slug}".deposits
         WHERE status IN ('valide', 'refuse') AND (decided_at IS NULL OR decided_by_id IS NULL)`,
      );
      fautifs.push(...d.map((x) => `${slug} · « ${x.title} » (${x.status})`));
    }
    expect(fautifs, 'un dépôt décidé sans date ni décideur : la décision est intraçable').toEqual([]);
  }, 60_000);

  it('⚠ LE CHAMP DÉNORMALISÉ `author` VAUT LE NOM DE L’AUTEUR PRINCIPAL', async () => {
    // `AuthorsService` maintient `biblio_records.author` = nom du premier
    // AUTEUR_PRINCIPAL, et PROPAGE au renommage d'une fiche d'autorité. Une
    // divergence donne deux noms pour la même notice selon l'écran — la liste
    // lit le champ dénormalisé, la fiche lit les contributeurs.
    expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
    const fautifs: string[] = [];
    let examinees = 0;
    for (const slug of ecoles) {
      const [r] = await prisma.$queryRawUnsafe<{ total: number; divergentes: number }[]>(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE r.author IS DISTINCT FROM (
                  SELECT c.name FROM "tenant_${slug}".record_contributors c
                  WHERE c.record_id = r.id AND c.role = 'AUTEUR_PRINCIPAL'
                  ORDER BY c.position LIMIT 1))::int AS divergentes
         FROM "tenant_${slug}".biblio_records r`,
      );
      examinees += r.total;
      if (r.divergentes > 0) fautifs.push(`${slug} : ${r.divergentes} notice(s) sur ${r.total} dont \`author\` ne vaut pas l’auteur principal`);
    }
    expect(examinees, 'aucune notice examinée : le tamis ne mesure rien ici').toBeGreaterThan(0);
    expect(
      fautifs,
      'Le champ dénormalisé `author` diverge de sa source :\n' +
        fautifs.map((f) => `  · ${f}`).join('\n') +
        '\n\n⚠ La même notice porte alors deux noms selon l’écran : la liste ' +
        'lit `author`, la fiche lit les contributeurs.',
    ).toEqual([]);
  }, 60_000);

  it('⚠ UN COMPTE QUI PORTE UNE CLASSE A SON INSCRIPTION', async () => {
    // `AccountsService` écrit `users.class_name` ET l'inscription dans la MÊME
    // transaction, et son commentaire l'affirme : « Reflet de l'inscription
    // créée juste après […] les deux ne peuvent pas diverger. »
    //
    // ⚠ CE QUE LA DIVERGENCE COÛTE : l'écran des classes affiche
    // `_count.enrollments`. Une classe dont les étudiants portent `class_name`
    // sans inscription s'affiche « 0 étudiant » — alors que le contrôle
    // d'accès, lui, lit `class_name` et fonctionne. Deux écrans, deux vérités.
    expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
    const fautifs: string[] = [];
    let examines = 0;
    for (const slug of ecoles) {
      const [r] = await prisma.$queryRawUnsafe<{ total: number; sans: number }[]>(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE NOT EXISTS (
                  SELECT 1 FROM "tenant_${slug}".enrollments e WHERE e.user_id = u.id))::int AS sans
         FROM "tenant_${slug}".users u WHERE u.class_name IS NOT NULL`,
      );
      examines += r.total;
      if (r.sans > 0) fautifs.push(`${slug} : ${r.sans} compte(s) sur ${r.total} portent une classe sans inscription`);
    }
    expect(examines, 'aucun compte à classe : le tamis ne mesure rien ici').toBeGreaterThan(0);

    // ⚠ CETTE RÈGLE A PORTÉ UNE DETTE, ET LA DETTE EST TOMBÉE — 16/09/2026.
    //
    // `zinda` avait 61 comptes à classe et ZÉRO inscription : `seed-demo.mjs`
    // écrivait `users.class_name` directement. L’écran `/admin/classes` lit
    // `_count.enrollments` et affichait « 0 étudiant » pour les huit classes,
    // dont trois en portaient 21, 20 et 20.
    //
    // Réparé en deux temps : le seed crée désormais l’inscription avec la
    // classe, et `scripts/rattraper-inscriptions.mjs` a rattrapé l’existant
    // (additif, idempotent, année académique IMPORTÉE du produit).
    //
    // ⚠ C’est le garde lui-même qui a exigé cette ligne : la dette déclarée
    // s’est REFUSÉE dès qu’elle est devenue fausse. Une dette qui ne se
    // rappelle qu’en s’aggravant laisserait passer sa propre résolution.
    expect(
      fautifs,
      'Des comptes portent une classe sans inscription :\n' +
        fautifs.map((f) => `  · ${f}`).join('\n') +
        '\n\n⚠ L’écran des classes comptera 0 étudiant pour ces classes.',
    ).toEqual([]);
  }, 60_000);

  it('⚠ UNE NOTICE RÉSERVÉE N’EST PAS AUSSI DANS LE FONDS OUVERT', async () => {
    // ⚠ LES RÈGLES D'ACCÈS SONT UN **OU** : la plus LARGE gagne, et c'est la
    // plus discrète. Une notice qui appartient à la fois à une collection
    // réservée à une classe et au fonds par défaut (ouvert à tous) est LISIBLE
    // PAR TOUS — pendant que la règle restrictive reste affichée, intacte et
    // rassurante.
    //
    // Mesuré le 16/09/2026 sur l'école de démonstration : 155 documents
    // numériques sur 155 dans le fonds ouvert, dont 28 aussi réservés. AUCUNE
    // restriction de classe n'avait d'effet sur la lecture.
    //
    // La cause était `DigitalCopyService.upload`, qui rattachait TOUT document
    // téléversé au fonds par défaut. Il épargne désormais ce qui est déjà
    // réservé — et cette règle-ci mesure l'ÉTAT, là où le test du service
    // mesure la DÉCISION.
    expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
    const fautifs: string[] = [];
    let examinees = 0;
    for (const slug of ecoles) {
      const lignes = await prisma.$queryRawUnsafe<{ titre: string; reservee: string }[]>(
        `SELECT r.title AS titre, cr.name AS reservee
         FROM public.collection_titles ouvert
         JOIN public.collections socle ON socle.id = ouvert.collection_id AND socle.is_default
         JOIN public.tenants t ON t.id = socle.tenant_id AND t.slug = $1
         JOIN public.collection_titles res ON res.record_id = ouvert.record_id
         JOIN public.collections cr ON cr.id = res.collection_id
              AND cr.tenant_id = t.id AND NOT cr.is_default
         JOIN public.access_rules ar ON ar.collection_id = cr.id AND ar.tenant_id = t.id
              AND (ar.class_name IS NOT NULL OR ar.subscription_tier IS NOT NULL)
         JOIN "tenant_${slug}".biblio_records r ON r.id = ouvert.record_id
         GROUP BY r.title, cr.name`,
        slug,
      );
      const [n] = await prisma.$queryRawUnsafe<{ total: number }[]>(
        `SELECT count(*)::int AS total FROM public.collection_titles ct
         JOIN public.collections c ON c.id = ct.collection_id AND c.is_default
         JOIN public.tenants t ON t.id = c.tenant_id AND t.slug = $1`,
        slug,
      );
      examinees += n.total;
      fautifs.push(...lignes.map((l) => `${slug} · « ${l.titre} » réservée par « ${l.reservee} »`));
    }
    expect(examinees, 'aucune notice dans un fonds par défaut : le tamis ne mesure rien ici').toBeGreaterThan(0);
    expect(
      fautifs.slice(0, 10),
      `Des notices RÉSERVÉES sont aussi dans le fonds ouvert (${fautifs.length} au total) :\n` +
        fautifs.slice(0, 10).map((f) => `  · ${f}`).join('\n') +
        '\n\n⚠ Les règles d’accès sont un OU : la plus large gagne. La règle ' +
        'restrictive reste AFFICHÉE et n’interdit plus rien — personne n’a de ' +
        'raison de la relire.\n' +
        '⚠ LA CORRECTION FAUTIVE que ce défaut appelle : retirer la RÈGLE du ' +
        'fonds ouvert. Elle couvre les centaines d’autres notices qui doivent ' +
        'rester lisibles par tous — la supprimer fermerait le fonds entier au ' +
        'lieu d’en réserver quelques-unes. C’est le rattachement qu’on retire, ' +
        'pas la règle.',
    ).toEqual([]);
  }, 60_000);

  it('⚠ UNE RÈGLE D’ACCÈS NOMME UNE CLASSE QUI EXISTE', async () => {
    // `AccessControlService` REFUSE une règle dont la classe est inconnue, et
    // son message le dit : « cette règle ne correspondrait à aucun étudiant ».
    // ⚠ Une règle qui nomme une classe disparue N'OUVRE RIEN et RESTE LISIBLE
    // dans la liste — c'est « un élargissement qui laisse la restriction
    // visible » à l'envers : une autorisation devenue décorative.
    expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
    const fautifs: string[] = [];
    let examinees = 0;
    for (const slug of ecoles) {
      const lignes = await prisma.$queryRawUnsafe<{ cls: string; coll: string }[]>(
        `SELECT r.class_name AS cls, c.name AS coll
         FROM public.access_rules r
         JOIN public.collections c ON c.id = r.collection_id
         WHERE r.tenant_id = (SELECT id FROM public.tenants WHERE slug = '${slug}')
           AND r.class_name IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM "tenant_${slug}".school_classes k WHERE k.name = r.class_name)`,
      );
      const [n] = await prisma.$queryRawUnsafe<{ total: number }[]>(
        `SELECT count(*)::int AS total FROM public.access_rules
         WHERE tenant_id = (SELECT id FROM public.tenants WHERE slug = '${slug}') AND class_name IS NOT NULL`,
      );
      examinees += n.total;
      fautifs.push(...lignes.map((l) => `${slug} · « ${l.coll} » ouverte à la classe « ${l.cls} », qui n’existe pas`));
    }
    expect(examinees, 'aucune règle par classe : le tamis ne mesure rien ici').toBeGreaterThan(0);
    expect(
      fautifs,
      'Des règles d’accès nomment une classe inexistante :\n' +
        fautifs.map((f) => `  · ${f}`).join('\n') +
        '\n\n⚠ La règle n’ouvre à personne, et elle reste LISIBLE dans la ' +
        'liste : l’administrateur croit avoir donné un accès qu’il n’a pas donné.',
    ).toEqual([]);
  }, 60_000);

  it('⚠ UNE RÉSERVATION EN ATTENTE N’EXISTE QUE SI AUCUN EXEMPLAIRE N’EST LIBRE', async () => {
    // `CirculationService.placeHold` met la réservation à AVAILABLE
    // IMMÉDIATEMENT s'il trouve un exemplaire disponible ; PENDING n'est
    // produit que dans le cas contraire. Une réservation en attente sur une
    // notice qui a un exemplaire libre est donc un état que le produit ne
    // produit jamais — et qui immobilise un lecteur devant une étagère où le
    // livre se trouve.
    //
    // ⚠ CETTE RÈGLE VIENT D'UN SCRIPT QUE J'AI ÉCRIT, le 16 septembre 2026.
    // `creer-activite-de-reservation.mjs` choisissait ses notices parmi les
    // prêts ouverts sans regarder les autres exemplaires : il était conforme
    // par CHANCE, et je ne l'ai su qu'en le mesurant après coup. La règle est
    // ici pour que la chance ne soit plus nécessaire.
    expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
    const fautifs: string[] = [];
    let examinees = 0;
    for (const slug of ecoles) {
      const lignes = await prisma.$queryRawUnsafe<{ titre: string }[]>(
        `SELECT r.title AS titre
         FROM "tenant_${slug}".holds h
         JOIN "tenant_${slug}".biblio_records r ON r.id = h.record_id
         WHERE h.status = 'PENDING'
           AND EXISTS (SELECT 1 FROM "tenant_${slug}".items i
                       WHERE i.record_id = h.record_id AND i.status = 'AVAILABLE')`,
      );
      const [n] = await prisma.$queryRawUnsafe<{ total: number }[]>(
        `SELECT count(*)::int AS total FROM "tenant_${slug}".holds WHERE status = 'PENDING'`,
      );
      examinees += n.total;
      fautifs.push(...lignes.map((l) => `${slug} · « ${l.titre} »`));
    }
    expect(examinees, 'aucune réservation en attente : le tamis ne mesure rien ici').toBeGreaterThan(0);

    // ⚠ DETTE DÉCLARÉE, DATÉE, REFUSÉE DANS LES DEUX SENS — 16/09/2026.
    // Sur `horizon`, les 257 réservations en attente sont TOUTES sur une
    // notice dont un exemplaire est libre : `seed-echelle.mjs` écrit `holds`
    // directement. Sixième état issu de ce seul fichier.
    // `zinda` est PROPRE : ses trois files portent sur des notices dont aucun
    // exemplaire n'est disponible.
    // ✅ RÉSOLUE le 22/09/2026 : le seed suit `placeHoldForPatron` — file
    // d'attente SEULEMENT si aucun exemplaire n'est libre, mise de côté
    // immédiate sinon (avec échéance, et l'exemplaire qui passe à ON_HOLD).
    //
    // ⚠ 257 → 0, mais 114 conversions seulement : remettre les 820
    // exemplaires prêtés en CHECKED_OUT a rendu LÉGITIMES les autres files.
    // Deux dettes du même écrivain, dont l'une masquait l'ampleur de l'autre.
    const DETTE_ATTENTE = 0;
    const compte = fautifs.length;
    expect(
      compte,
      `Le compte des réservations en attente fautives a changé (${compte} au lieu de ` +
        `${DETTE_ATTENTE}) : relisez, puis mettez DETTE_ATTENTE à jour ou retirez-la.`,
    ).toBe(DETTE_ATTENTE);

    expect(
      fautifs.filter((f) => !f.startsWith('horizon ·')),
      'Des réservations sont EN ATTENTE alors qu’un exemplaire est libre :\n' +
        fautifs.map((f) => `  · ${f}`).join('\n') +
        '\n\n⚠ `placeHold` aurait mis la réservation de côté immédiatement. ' +
        'Le lecteur attend un document qui est sur l’étagère.',
    ).toEqual([]);
  }, 60_000);

  it('⚠ UNE MISE DE CÔTÉ DISPONIBLE PORTE SON ÉCHÉANCE', async () => {
    // ⚠ `HoldsService.expireLesMisesDeCote` sélectionne
    // `{ status: AVAILABLE, expiryDate: { lt: now } }`. Une réservation
    // disponible SANS échéance n'est donc jamais reprise : elle immobilise
    // l'exemplaire pour toujours, et le lecteur suivant ne le voit jamais
    // revenir. C'est un rattrapage dont la clé ne trouve pas ses lignes.
    expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
    const fautifs: string[] = [];
    let examinees = 0;
    for (const slug of ecoles) {
      const [r] = await prisma.$queryRawUnsafe<{ total: number; dispo: number; sans: number }[]>(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE status = 'AVAILABLE')::int AS dispo,
                count(*) FILTER (WHERE status = 'AVAILABLE' AND expiry_date IS NULL)::int AS sans
         FROM "tenant_${slug}".holds`,
      );
      examinees += r.total;
      if (r.sans > 0) fautifs.push(`${slug} : ${r.sans} mise(s) de côté disponible(s) sur ${r.dispo} sans échéance`);
    }
    expect(examinees, 'aucune mise de côté : le tamis ne mesure rien ici').toBeGreaterThan(0);

    // ⚠ DETTE DÉCLARÉE, DATÉE, ET QUI SE REFUSE DANS LES DEUX SENS — 15/09/2026.
    //
    // Sur `horizon`, les 43 mises de côté DISPONIBLES et les 257 en attente
    // n'ont aucune échéance : le seed d'échelle écrit `holds` directement.
    // Cinquième état que le produit refuserait de produire, issu du même
    // fichier — voir « nos seeds sont un second produit » dans CLAUDE.md.
    //
    // ⚠ ET LA BORNE DE CETTE RÈGLE, mesurée : `zinda` ne porte AUCUNE mise de
    // côté disponible (une seule, expirée). Cette règle n'éprouve donc RIEN
    // sur l'école de démonstration — elle est verte parce qu'il n'y a rien à
    // regarder, pas parce que tout va bien. Le témoin ci-dessus compte les
    // mises de côté TOUTES statuts confondus, sans quoi il serait lui-même un
    // signal d'attente sur la grandeur mesurée.
    // ✅ RÉSOLUE le 22/09/2026 : `seed-echelle.mjs` pose l'échéance comme le
    // produit (`maintenant + HOLD_PICKUP_DAYS`), et conforme ce qu'il avait
    // déjà écrit. 43 → 0.
    const DETTE_ECHEANCES: string[] = [];
    expect(
      DETTE_ECHEANCES.filter((d) => !fautifs.includes(d)),
      'Une dette déclarée ne correspond plus à la base : retirez-la de ' +
        'DETTE_ECHEANCES — elle est résolue, ou elle a changé de compte.',
    ).toEqual([]);

    expect(
      fautifs.filter((f) => !DETTE_ECHEANCES.includes(f)),
      'Des mises de côté DISPONIBLES n’ont pas d’échéance :\n' +
        fautifs.map((f) => `  · ${f}`).join('\n') +
        '\n\n⚠ Le balayage horaire ne peut PAS les reprendre — sa clé exige ' +
        'une échéance. L’exemplaire reste immobilisé indéfiniment.',
    ).toEqual([]);
  }, 60_000);

  it('⚠ UNE LICENCE HORS-LIGNE EXPIRE APRÈS SON ÉMISSION', async () => {
    // `OfflineLicensesService` calcule `expiresAt = issuedAt + ttl`. Une
    // licence dont l'expiration précède l'émission est refusée par l'appareil
    // au premier contrôle — le lecteur a téléchargé un document qu'il ne peut
    // pas ouvrir, et rien côté serveur ne le dit.
    expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
    const fautifs: string[] = [];
    let examinees = 0;
    for (const slug of ecoles) {
      const lignes = await prisma.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM "tenant_${slug}".offline_licenses WHERE expires_at <= issued_at`,
      );
      const [n] = await prisma.$queryRawUnsafe<{ total: number }[]>(
        `SELECT count(*)::int AS total FROM "tenant_${slug}".offline_licenses`,
      );
      examinees += n.total;
      fautifs.push(...lignes.map((l) => `${slug} · licence ${l.id}`));
    }
    expect(examinees, 'aucune licence : le tamis ne mesure rien ici').toBeGreaterThan(0);
    expect(
      fautifs,
      'Des licences hors-ligne expirent avant d’être émises :\n' +
        fautifs.map((f) => `  · ${f}`).join('\n') +
        '\n\n⚠ L’appareil refuse au premier contrôle, et le serveur ne le ' +
        'sait pas : le lecteur a un document qu’il ne peut pas ouvrir.',
    ).toEqual([]);
  }, 60_000);

  it('⚠ UN DÉPÔT REFUSÉ PORTE SON MOTIF', async () => {
    // `DepotsService.refuser` REFUSE un motif vide, et le commentaire dit
    // pourquoi : « un refus sans motif est un refus qu'on ne peut pas
    // corriger — l'étudiant saurait que c'est non, sans savoir quoi reprendre. »
    expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
    const fautifs: string[] = [];
    for (const slug of ecoles) {
      const lignes = await prisma.$queryRawUnsafe<{ id: string; titre: string }[]>(
        `SELECT id, title AS titre FROM "tenant_${slug}".deposits
         WHERE status = 'refuse' AND (refusal_reason IS NULL OR btrim(refusal_reason) = '')`,
      );
      fautifs.push(...lignes.map((l) => `${slug} · dépôt ${l.id} — « ${l.titre} »`));
    }
    expect(
      fautifs,
      'Des dépôts sont REFUSÉS sans motif :\n' +
        fautifs.map((f) => `  · ${f}`).join('\n') +
        '\n\n⚠ L’étudiant voit que c’est non, et ne sait pas quoi reprendre. ' +
        'C’est un refus dont le produit a fait un cul-de-sac.',
    ).toEqual([]);
  }, 60_000);

  it('⚠ TOUT EXEMPLAIRE PORTE UN CODE-BARRES NON VIDE', async () => {
    // `CatalogingService` REFUSE « Code-barres vide ». La contrainte de base
    // porte l'UNICITÉ, jamais la non-vacuité : un écrivain direct passe.
    // Un exemplaire sans code-barres ne se scanne pas — il est invisible au
    // guichet et à l'inventaire, tout en comptant dans le fonds.
    expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
    const fautifs: string[] = [];
    let examines = 0;
    for (const slug of ecoles) {
      const [r] = await prisma.$queryRawUnsafe<{ total: number; vides: number }[]>(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE barcode IS NULL OR btrim(barcode) = '')::int AS vides
         FROM "tenant_${slug}".items`,
      );
      examines += r.total;
      if (r.vides > 0) fautifs.push(`${slug} : ${r.vides} exemplaire(s) sur ${r.total} sans code-barres`);
    }
    expect(examines, 'aucun exemplaire examiné : le tamis ne mesure rien ici').toBeGreaterThan(0);
    expect(
      fautifs,
      'Des exemplaires n’ont pas de code-barres :\n' +
        fautifs.map((f) => `  · ${f}`).join('\n') +
        '\n\n⚠ Ils ne se scannent pas : invisibles au guichet et à ' +
        'l’inventaire, et comptés dans le fonds.',
    ).toEqual([]);
  }, 60_000);

  it('⚠ UNE SESSION D’INVENTAIRE LOCALISÉE PORTE SA LOCALISATION', async () => {
    // `InventoryService` REFUSE « Une localisation est requise pour un
    // périmètre localisé ». Sans elle, le calcul des manquants porte sur un
    // périmètre VIDE — et marquer les manquants CHANGE le catalogue.
    expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
    const fautifs: string[] = [];
    for (const slug of ecoles) {
      const lignes = await prisma.$queryRawUnsafe<{ id: string; name: string; status: string }[]>(
        `SELECT id, name, status FROM "tenant_${slug}".inventory_sessions
         WHERE scope = 'LOCATION' AND (location IS NULL OR btrim(location) = '')`,
      );
      fautifs.push(...lignes.map((l) => `${slug} · session « ${l.name} » (${l.status})`));
    }
    expect(
      fautifs,
      'Des sessions d’inventaire LOCALISÉES n’ont pas de localisation :\n' +
        fautifs.map((f) => `  · ${f}`).join('\n') +
        '\n\n⚠ Le périmètre est vide, donc TOUT le fonds compte comme ' +
        'manquant — et marquer les manquants change le catalogue.',
    ).toEqual([]);
  }, 60_000);

  it('⚠ UN COMPTE ACTIF PORTE SA DATE D’ACTIVATION', async () => {
    // `AccountsService` pose `status: ACTIVE` et `activatedAt` dans la MÊME
    // écriture, aux trois endroits qui activent. Un compte actif sans date
    // n'est jamais passé par le chemin d'activation : il n'a donc reçu aucun
    // lien de définition de mot de passe — le seul chemin vers son compte.
    expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
    const fautifs: string[] = [];
    let examines = 0;
    for (const slug of ecoles) {
      const [r] = await prisma.$queryRawUnsafe<{ total: number; sans: number }[]>(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE activated_at IS NULL)::int AS sans
         FROM "tenant_${slug}".users WHERE status = 'ACTIVE'`,
      );
      examines += r.total;
      if (r.sans > 0) fautifs.push(`${slug} : ${r.sans} compte(s) actif(s) sur ${r.total} sans date d’activation`);
    }
    expect(examines, 'aucun compte actif : le tamis ne mesure rien ici').toBeGreaterThan(0);

    // ⚠ DETTE DÉCLARÉE, DATÉE, ET QUI SE REFUSE DANS LES DEUX SENS — 15/09/2026.
    //
    // Sur `horizon`, 412 des 413 comptes actifs n'ont aucune date
    // d'activation. Cause mesurée : `scripts/seed-echelle.mjs:351` pose
    // `status: 'ACTIVE'` sans `activatedAt`, là où `AccountsService` écrit les
    // deux ensemble aux TROIS endroits qui activent.
    //
    // ⚠ Sans conséquence ICI, et pour une raison écrite dans le seed lui-même :
    // ces comptes n'ont pas de mot de passe et ne servent pas à se connecter.
    // Mais c'est le quatrième état que le produit refuserait de produire, et
    // le troisième venant du MÊME fichier — voir « nos seeds sont un second
    // produit » dans CLAUDE.md.
    //
    // ⚠ `zinda` est PROPRE : 66 comptes actifs, 66 dates d'activation.
    // ✅ RÉSOLUE le 22/09/2026 : le seed pose `activatedAt` avec `status`,
    // comme `AccountsService.activate`. Les 412 existants ont reçu leur date
    // de CRÉATION — la seule borne que la base connaisse avec certitude.
    const DETTE_ACTIVATION: string[] = [];
    expect(
      DETTE_ACTIVATION.filter((d) => !fautifs.includes(d)),
      'Une dette déclarée ne correspond plus à la base : retirez-la de ' +
        'DETTE_ACTIVATION — elle est résolue, ou elle a changé de compte.',
    ).toEqual([]);

    expect(
      fautifs.filter((f) => !DETTE_ACTIVATION.includes(f)),
      'Des comptes ACTIFS n’ont pas de date d’activation :\n' +
        fautifs.map((f) => `  · ${f}`).join('\n') +
        '\n\n⚠ Ils ne sont pas passés par le chemin d’activation, donc ' +
        'aucun lien « définir mon mot de passe » n’a été émis.',
    ).toEqual([]);
  }, 60_000);

  it('⚠ UN PRÊT OUVERT LAISSE SON EXEMPLAIRE EN CHECKED_OUT', async () => {
    // `CirculationService.checkout` pose CHECKED_OUT et crée le prêt dans la
    // MÊME transaction ; le retour remet AVAILABLE. Un exemplaire disponible
    // alors qu'un prêt est encore ouvert se présente au guichet comme
    // empruntable — et le scan suivant échouera sans que personne comprenne.
    expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
    const fautifs: string[] = [];
    let examines = 0;
    for (const slug of ecoles) {
      const lignes = await prisma.$queryRawUnsafe<{ id: string; status: string }[]>(
        `SELECT c.id, i.status::text AS status
         FROM "tenant_${slug}".checkouts c
         JOIN "tenant_${slug}".items i ON i.id = c.item_id
         WHERE c.return_date IS NULL AND i.status <> 'CHECKED_OUT'`,
      );
      const [n] = await prisma.$queryRawUnsafe<{ total: number }[]>(
        `SELECT count(*)::int AS total FROM "tenant_${slug}".checkouts WHERE return_date IS NULL`,
      );
      examines += n.total;
      fautifs.push(...lignes.map((l) => `${slug} · prêt ${l.id} — exemplaire ${l.status}`));
    }
    expect(examines, 'aucun prêt ouvert : le tamis ne mesure rien ici').toBeGreaterThan(0);

    // ⚠ DETTE DÉCLARÉE, DATÉE, ET QUI SE REFUSE QUAND ELLE CHANGE — 15/09/2026.
    //
    // Le tamis a trouvé ceci à sa première exécution : sur `horizon`, les 820
    // prêts ouverts laissent TOUS leur exemplaire en AVAILABLE. Cause mesurée :
    // `scripts/seed-echelle.mjs:292` écrit les prêts par `checkout.createMany`
    // et ne touche jamais `item.status` — le produit, lui, pose les deux dans
    // la MÊME transaction (`circulation.service.ts:157`).
    //
    // ⚠ Ce n'est PAS l'école de démonstration : `zinda` passe (55 prêts
    // ouverts, 55 exemplaires sortis, aucun écart). C'est le fonds de mesure à
    // l'échelle, et il n'est montré à personne.
    //
    // La ligne se refuse le jour où le compte change — résolu ou aggravé.
    // ✅ RÉSOLUE le 22/09/2026 : le seed sort l'exemplaire du fonds
    // disponible, comme `CirculationService.checkout` le fait dans la même
    // transaction. 820 → 0.
    const DETTE_PRETS: string[] = [];
    const resumePrets = ecoles
      .map((slug) => {
        const n = fautifs.filter((f) => f.startsWith(`${slug} ·`)).length;
        return n > 0 ? `${slug} : ${n} prêt(s) ouvert(s) sur exemplaire AVAILABLE` : null;
      })
      .filter((r): r is string => r !== null);
    expect(
      DETTE_PRETS.filter((d) => !resumePrets.includes(d)),
      'Une dette déclarée ne correspond plus à la base : retirez-la de ' +
        'DETTE_PRETS — elle est résolue, ou elle a changé de compte.',
    ).toEqual([]);

    expect(
      resumePrets.filter((r) => !DETTE_PRETS.includes(r)),
      'Des prêts OUVERTS laissent leur exemplaire hors de CHECKED_OUT :\n' +
        fautifs.map((f) => `  · ${f}`).join('\n') +
        '\n\n⚠ L’exemplaire se présente comme empruntable au guichet ; le ' +
        'scan suivant échouera en 409 sans que personne comprenne pourquoi.',
    ).toEqual([]);
  }, 60_000);

  it('⚠ UN RETOUR NE PRÉCÈDE JAMAIS SON PRÊT', async () => {
    // Aucune règle serveur ne l'écrit — c'est le TEMPS qui l'impose. Une date
    // antidatée par un seed ou un rattrapage produit une durée de prêt
    // négative, qui entre telle quelle dans le rapport annuel.
    expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
    const fautifs: string[] = [];
    for (const slug of ecoles) {
      const lignes = await prisma.$queryRawUnsafe<{ id: string; d: string }[]>(
        `SELECT id, (return_date - checkout_date)::text AS d
         FROM "tenant_${slug}".checkouts
         WHERE return_date IS NOT NULL AND return_date < checkout_date`,
      );
      fautifs.push(...lignes.map((l) => `${slug} · prêt ${l.id} rendu ${l.d} avant d’être pris`));
    }
    expect(
      fautifs,
      'Des prêts sont rendus AVANT d’avoir été pris :\n' +
        fautifs.map((f) => `  · ${f}`).join('\n') +
        '\n\n⚠ La durée de prêt est négative, et elle entre telle quelle ' +
        'dans les moyennes du rapport annuel.',
    ).toEqual([]);
  }, 60_000);

  it('⚠ CHAQUE ÉCOLE A EXACTEMENT UNE COLLECTION SOCLE', async () => {
    // `access-control` traite `isDefault` comme LA collection socle — celle
    // qu'on ne supprime pas. Zéro socle et rien ne protège ; deux socles et
    // le produit en désigne une arbitrairement.
    expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
    const fautifs: string[] = [];
    for (const slug of ecoles) {
      const [r] = await prisma.$queryRawUnsafe<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM public.collections
         WHERE is_default = true AND tenant_id = (SELECT id FROM public.tenants WHERE slug = '${slug}')`,
      );
      if (r.n !== 1) fautifs.push(`${slug} : ${r.n} collection(s) socle`);
    }
    expect(
      fautifs,
      'Des écoles n’ont pas EXACTEMENT une collection socle :\n' +
        fautifs.map((f) => `  · ${f}`).join('\n') +
        '\n\nZéro : rien ne porte le fonds par défaut. Deux : le produit en ' +
        'désigne une arbitrairement, et l’autre est supprimable par erreur.',
    ).toEqual([]);
  }, 60_000);

  it('⚠ TOUTE NOTICE PORTE UN AUTEUR PRINCIPAL — règle serveur, cahier §4.2', async () => {
    // `requirePrincipalAuthor` REFUSE une notice sans contributeur
    // `AUTEUR_PRINCIPAL`. Un import en masse ou un seed qui écrit par Prisma
    // peut en produire : la notice s'affiche alors sans auteur, et l'export
    // Dublin Core rend un `<dc:creator>` vide.
    expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
    const fautifs: string[] = [];
    let examinees = 0;
    for (const slug of ecoles) {
      const [r] = await prisma.$queryRawUnsafe<{ total: number; sans: number }[]>(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE NOT EXISTS (
                  SELECT 1 FROM "tenant_${slug}".record_contributors c
                  WHERE c.record_id = r.id AND c.role = 'AUTEUR_PRINCIPAL'))::int AS sans
         FROM "tenant_${slug}".biblio_records r`,
      );
      examinees += r.total;
      if (r.sans > 0) fautifs.push(`${slug} : ${r.sans} notice(s) sur ${r.total} sans auteur principal`);
    }
    expect(examinees, 'aucune notice examinée : le tamis ne mesure rien').toBeGreaterThan(0);
    expect(
      fautifs,
      'Des notices n’ont AUCUN auteur principal :\n' +
        fautifs.map((f) => `  · ${f}`).join('\n') +
        '\n\n`requirePrincipalAuthor` les refuserait à la création. Elles ' +
        's’affichent sans auteur, et l’export Dublin Core rend un `dc:creator` vide.',
    ).toEqual([]);
  }, 60_000);

  it('⚠ SEUL UN COMPTE ÉTUDIANT PORTE UNE CLASSE', async () => {
    // `EnrollmentService` REFUSE d'inscrire un compte non-STUDENT dans une
    // classe. Une classe posée sur un compte de personnel lui donnerait les
    // collections de cette classe — le contrôle d'accès lit `className` sans
    // regarder le rôle.
    expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
    const fautifs: string[] = [];
    for (const slug of ecoles) {
      const lignes = await prisma.$queryRawUnsafe<{ email: string; role: string; class_name: string }[]>(
        `SELECT email, role::text AS role, class_name
         FROM "tenant_${slug}".users
         WHERE class_name IS NOT NULL AND role <> 'STUDENT'`,
      );
      fautifs.push(...lignes.map((l) => `${slug} · ${l.email} (${l.role}) en « ${l.class_name} »`));
    }
    expect(
      fautifs,
      'Des comptes NON étudiants portent une classe :\n' +
        fautifs.map((f) => `  · ${f}`).join('\n') +
        '\n\n⚠ Ce n’est pas cosmétique : la décision d’accès lit `className` ' +
        'sans regarder le rôle. Un membre du personnel hérite donc des ' +
        'collections réservées à cette classe.',
    ).toEqual([]);
  }, 60_000);

  it('⚠ UNE THÈSE OU UN MÉMOIRE PORTE SON DIRECTEUR ET SON UNIVERSITÉ', async () => {
    // `cataloging.service` REFUSE la création sans ces deux champs. Une notice
    // écrite par Prisma peut les manquer — et l'export ETD-MS rend alors du
    // Dublin Core déguisé, dont la seule valeur propre est justement la
    // distinction `advisor` / `creator`.
    expect(joignable, MESSAGE_BASE_INJOIGNABLE).toBe(true);
    const types = (DEFENSE_RECORD_TYPES as readonly string[]).map((t) => `'${t}'`).join(', ');
    const resume: string[] = [];
    for (const slug of ecoles) {
      const [r] = await prisma.$queryRawUnsafe<{ total: number; sans_univ: number; sans_dir: number }[]>(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE coalesce(trim(defense_university), '') = '')::int AS sans_univ,
                count(*) FILTER (WHERE NOT EXISTS (
                  SELECT 1 FROM "tenant_${slug}".record_contributors c
                  WHERE c.record_id = r.id AND c.role = 'DIRECTEUR_MEMOIRE'))::int AS sans_dir
         FROM "tenant_${slug}".biblio_records r
         WHERE r.record_type IN (${types})`,
      );
      if (r.sans_univ > 0 || r.sans_dir > 0) {
        resume.push(
          `${slug} : sur ${r.total} travaux académiques, ${r.sans_univ} sans université ` +
            `et ${r.sans_dir} sans directeur`,
        );
      }
    }
    // ⚠ UNE DETTE DÉCLARÉE, DATÉE, ET QUI SE REFUSE QUAND ELLE EST RÉSOLUE.
    //
    // Le tamis a trouvé ceci à sa PREMIÈRE exécution : `horizon` — le fonds de
    // MESURE à l'échelle, semé par `seed-echelle.mjs` — porte 3 549 travaux
    // académiques sans aucun directeur. Son export ETD-MS rendrait donc du
    // Dublin Core déguisé, sur la totalité de son fonds académique.
    //
    // ⚠ Ce n'est PAS l'école de démonstration : `zinda` passe. La dette est
    // donc suivie plutôt que corrigée à la hâte avant un déploiement — une
    // mutation de 3 549 lignes ne se lance pas dans la même heure qu'une mise
    // en ligne.
    //
    // ⚠ ET LA LIGNE SE REFUSE LE JOUR OÙ ELLE DEVIENT FAUSSE : si `horizon`
    // est réparé, l'exception ne correspond plus et ce test échoue en le
    // disant. Une dette qui ne se rappelle pas d'elle-même est un oubli en
    // attente.
    // ✅ RÉSOLUE le 22/09/2026 : le seed rattache un contributeur de rôle
    // `DIRECTEUR_MEMOIRE` à chaque thèse et mémoire, comme
    // `requireDefenseFields` l'exige. 3 549 → 0.
    const DETTE_CONNUE: string[] = [];
    const restant = resume.filter((r) => !DETTE_CONNUE.includes(r));
    const perimees = DETTE_CONNUE.filter((d) => !resume.includes(d));
    expect(
      perimees,
      'Une dette déclarée ne correspond plus à la base : retirez-la de ' +
        'DETTE_CONNUE — elle est résolue, ou elle a changé de forme.',
    ).toEqual([]);

    expect(
      restant,
      'Des travaux académiques ne passeraient pas `cataloging.service` :\n' +
        restant.map((x) => `  · ${x}`).join('\n') +
        '\n\n⚠ Ce n’est pas cosmétique : sans `advisor` ni `grantor`, l’export ' +
        'ETD-MS rend du Dublin Core déguisé — et cette distinction est sa seule ' +
        'valeur propre.',
    ).toEqual([]);
  }, 60_000);
});
