/**
 * LES DEUX PIÈCES PARTAGÉES D'UNE RECETTE AU NAVIGATEUR : le REFUS, et la
 * CONNEXION.
 *
 * ## ⚠ POURQUOI UN MODULE, ET PAS UN COPIER-COLLER
 *
 * Extrait de `scripts/captures-sans-rayon.mjs` le 9 octobre 2026, quand un
 * second script de recette en a eu besoin. Deux raisons, et la première
 * suffirait :
 *
 * · **le refus protège un MOT DE PASSE.** Deux implémentations d'une même
 *   garantie de sécurité finissent par diverger, et c'est celle qu'on a oublié
 *   de corriger qui laissera passer le geste. Ce dépôt a déjà payé ce motif sur
 *   un booléen d'URL, qui ne protégeait rien d'aussi cher.
 * · **le contrôle négatif se partage avec la fonction.** `autotesterHote` vit
 *   ici : les deux scripts héritent donc de la preuve que le garde SAIT refuser,
 *   au lieu que chacun la refasse à moitié.
 *
 * ## ⚠ CE MODULE N'A AUCUN EFFET DE BORD, ET C'EST LA RAISON DE SON EXISTENCE
 *
 * ## ⚠ CE MODULE SORT, SES DEUX APPELANTS NON — et c'est VOULU
 *
 * `scripts/lib/` est dans la liste blanche de publication ; les deux scripts
 * de recette sont déclarés INTERNES. On publie donc une dépendance sans ses
 * appelants, et ce dépôt sait que « une dépendance sans son appelant est un
 * état que rien ne produit volontairement » — c'est le signe qui a désigné,
 * le 16 septembre 2026, quatre scripts d'exploitation absents du conteneur de
 * production.
 *
 * ⚠ LA DIFFÉRENCE EST MESURABLE, et c'est pour ça que ce paragraphe existe :
 * là-bas, un EXPLOITANT avait besoin des scripts manquants, et `DEPLOY.md` les
 * nommait — l'incohérence désignait un vrai trou. Ici personne dehors n'a de
 * geste à faire avec eux : l'un pilote un navigateur sur une base de
 * développement, l'autre ÉCRIT dans les pages légales. Ce qui sort est un
 * module lisible, sans secret, qui montre comment on refuse un hôte non local
 * et comment on ouvre une session par le formulaire.
 *
 * Écrit ici pour que l'asymétrie soit une DÉCISION et non un oubli : le
 * prochain qui la croisera trouvera le motif avec elle.
 *
 * Importer directement `captures-sans-rayon.mjs` aurait EXÉCUTÉ sa capture
 * entière au chargement — son garde, son autotest et sa boucle sont au premier
 * niveau. Un module partagé ne fait donc que déclarer : rien ne tourne à
 * l'import.
 */

/**
 * ⚠⚠ LE GARDE QUI REFUSE TOUT CE QUI N'EST PAS LOCAL.
 *
 * Un script de recette SE CONNECTE avec un mot de passe et CAPTURE des écrans.
 * Pointé sur une instance EN SERVICE, il enverrait ce secret à un serveur qui
 * n'est pas le nôtre et photographierait les données d'un client. C'est le
 * geste que ce dépôt interdit sans exception — et l'interdit ne se contourne
 * presque jamais par un geste qu'on sait interdit : il se contourne par un
 * `WEB_URL` qu'on a modifié pour autre chose et qu'on a oublié de remettre.
 *
 * ⚠ UNE LISTE BLANCHE, PAS UNE LISTE D'EXCLUSIONS. Refuser « demo.gafeso.org »
 * laisserait passer toute autre instance, et une liste d'exclusions ne pose
 * jamais la question au bon moment. Ici un hôte NEUF est refusé par défaut :
 * c'est la bonne direction d'échec — le pire qui arrive est qu'il faille
 * élargir la liste en connaissance de cause.
 *
 * ⚠ La liste vit DANS la fonction. Un garde qu'on veut « avant tout » doit ne
 * dépendre de rien : une déclaration de fonction est hissée, un `const` du
 * module ne l'est pas, et le garde s'exécute avant eux.
 */
export function hoteAutorise(url) {
  const HOTES_AUTORISES = ['localhost', '127.0.0.1', '[::1]', '::1'];
  let hote;
  try {
    hote = new URL(url).hostname;
  } catch {
    return { autorise: false, raison: `URL illisible : ${url}` };
  }
  if (!HOTES_AUTORISES.includes(hote)) {
    return {
      autorise: false,
      raison:
        `REFUS — « ${hote} » n’est pas une machine locale.\n` +
        `  Ce script SE CONNECTE avec un mot de passe et CAPTURE des écrans : pointé\n` +
        `  ailleurs que sur un développement local, il enverrait un secret à une\n` +
        `  instance qui n’est pas la nôtre et photographierait les données d’un client.\n` +
        `  Hôtes autorisés : ${HOTES_AUTORISES.join(', ')}.`,
    };
  }
  return { autorise: true, raison: null };
}

/**
 * ⚠ LE CONTRÔLE NÉGATIF VIT DANS L'OUTIL, pas à côté.
 *
 * Un garde qui n'a jamais refusé est un garde dont on ignore s'il SAIT refuser.
 * Celui-ci s'éprouve dans les DEUX sens : accepter les hôtes locaux, refuser
 * une instance en service — et refuser les formes qui RESSEMBLENT à un hôte
 * local sans en être un, qui sont la confusion plausible.
 *
 * ⚠ Il n'atteint JAMAIS le réseau : `hoteAutorise` est une fonction pure sur
 * une chaîne. Éprouver un refus ne demande pas de tenter la connexion refusée.
 */
export function autotesterHote(journal = console.log) {
  const cas = [
    ['http://localhost:3005', true],
    ['http://127.0.0.1:3005', true],
    ['http://[::1]:3005', true],
    ['https://demo.gafeso.org', false],
    // ⚠ La confusion PLAUSIBLE : un hôte qui CONTIENT « localhost » ou le nom
    // de l'instance, sans en être. Un témoin d'absence sur un nom inventé ne
    // prouverait rien — personne ne l'écrirait.
    ['https://demo.gafeso.org.localhost.evil.test', false],
    ['http://localhost.evil.test', false],
    ['http://127.0.0.1.evil.test', false],
    ['https://10.0.0.5', false],
    ['pas une url', false],
  ];
  let rate = 0;
  for (const [url, attendu] of cas) {
    const { autorise } = hoteAutorise(url);
    const ok = autorise === attendu;
    if (!ok) rate++;
    journal(
      `  ${ok ? '✓' : '✗'} ${url} → ${autorise ? 'accepté' : 'refusé'}` +
        ` (attendu ${attendu ? 'accepté' : 'refusé'})`,
    );
  }
  journal(`\n  ${cas.length - rate}/${cas.length} corrects.`);
  return rate;
}

/**
 * SE CONNECTER PAR LE FORMULAIRE, comme une personne.
 *
 * ⚠ LE MOT DE PASSE VIENT DE L'ENVIRONNEMENT, et il n'est écrit NULLE PART —
 * ni ici, ni dans les relevés, ni dans la sortie. La règle de ce dépôt est que
 * la documentation d'une procédure montre la VARIABLE, jamais la VALEUR, et un
 * script est une documentation qui s'exécute.
 *
 * ⚠ ET CE N'EST PAS UNE SESSION FABRIQUÉE : on remplit le formulaire du produit
 * et on laisse l'API poser son cookie. Aucun jeton n'est signé à la main, aucun
 * secret d'infrastructure n'est lu — c'est le « chemin normal » que l'interdit
 * du 7 septembre 2026 désigne comme la seule voie.
 *
 * Rend une CHAÎNE de motif en cas d'échec, `null` en cas de succès : une
 * capture de l'écran de connexion prise pour l'écran demandé serait pire que
 * son absence.
 */
export async function connecter(contexte, email, base) {
  const motDePasse = process.env.RECETTE_PASSWORD;
  if (!motDePasse) {
    return (
      'RECETTE_PASSWORD absent de l’environnement — et les comptes doivent exister :\n' +
      '    node scripts/dev/comptes-de-recette.mjs   (script du backend)'
    );
  }
  const page = await contexte.newPage();
  try {
    await page.goto(`${base}/login`, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.getByLabel(/courriel|email/i).fill(email);
    await page.getByLabel(/mot de passe/i).fill(motDePasse);
    await page.getByRole('button', { name: /se connecter/i }).click();
    // ⚠ On attend une PREUVE de session, pas un délai : quitter /login ne
    // survient qu'après une authentification acceptée. Un `waitForTimeout`
    // aurait rendu le script vert sur un échec de connexion.
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20_000 });
    return null;
  } catch (e) {
    return `connexion refusée pour ${email} : ${String(e).split('\n')[0].slice(0, 90)}`;
  } finally {
    await page.close();
  }
}

/**
 * Les deux destinations d'une passe de recette — décision du 9 octobre 2026.
 *
 * · les IMAGES hors du dépôt (`~/gafeso-captures/<AAAA-MM-JJ>/<sujet>/`) : une
 *   image décrit un ÉTAT, donc elle périme, et le compte des fichiers exclus de
 *   la publication convoquait quelqu'un à chaque passe ;
 * · les RELEVÉS DE TEXTE suivis (`docs/captures/<sujet>/`) : c'est par eux
 *   qu'on compare deux passes par différence, et une image ne se cherche pas
 *   au grep.
 */
export function destinations(sujet, resolve) {
  const aujourdhui = new Date().toISOString().slice(0, 10);
  return {
    images: resolve(process.env.HOME ?? '.', 'gafeso-captures', aujourdhui, sujet),
    releves: resolve('docs/captures', sujet),
    date: aujourdhui,
  };
}
