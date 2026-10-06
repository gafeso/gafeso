/**
 * LES SECRETS DE PRODUCTION — refus de démarrer sur une valeur FAIBLE ou CONNUE.
 *
 * ## Pourquoi une liste déclarée et pas quatre `if`
 *
 * Le refus existait depuis longtemps, et il couvrait DEUX secrets sur six :
 * `JWT_SECRET` et `ADMIN_API_KEY`. `MEILI_MASTER_KEY`, `MINIO_ROOT_PASSWORD` et
 * `POSTGRES_PASSWORD` n'étaient vérifiés que pour leur ABSENCE — une valeur
 * faible passait.
 *
 * ⚠ ET LE PIRE CAS N'EST PAS « FAIBLE », C'EST « CONNU ». `.env.prod.example`
 * porte des marqueurs « À REMPLIR — openssl rand … ». Copié tel quel, ce
 * marqueur DEVIENT la clé : un secret publié dans notre propre dépôt, que
 * n'importe qui peut lire. MinIO sert les couvertures sur un domaine PUBLIC, et
 * Meilisearch indexe tout le catalogue.
 *
 * ## La forme : une OBLIGATION, pas un balayage
 *
 * Chaque secret de production est déclaré ici avec sa longueur minimale et son
 * office. Un secret NEUF ajouté à `.env.prod.example` et absent de cette liste
 * fait échouer `secrets-de-production.spec.ts` : c'est le seul moment où
 * quelqu'un se posera la question.
 *
 * ⚠ Le refus est en PRODUCTION seulement. En développement, `.env` porte des
 * valeurs courtes et partagées, et c'est voulu : les refuser rendrait le dépôt
 * inutilisable pour qui l'essaie.
 */

/** Marqueurs qui trahissent une valeur d'exemple recopiée. */
export const MARQUEURS_DEXEMPLE = [
  'change_me',
  'À REMPLIR',
  'A REMPLIR',
  'dev_',
  'example',
  'changeme',
] as const;

export interface SecretDeclare {
  variable: string;
  /** Longueur minimale, en caractères. */
  minimum: number;
  /** Ce qu'un attaquant obtiendrait avec cette valeur. Sert au message. */
  enjeu: string;
  /** `true` quand la variable peut être VIDE pour désactiver la fonction. */
  videAutorise?: boolean;
  /**
   * 🔴 D'OÙ LA VALEUR EST RÉELLEMENT LUE DANS LE CONTENEUR, quand ce n'est pas
   * `variable`.
   *
   * ⚠ POURQUOI CE CHAMP EXISTE, et il a coûté un démarrage de PRODUCTION
   * (6 octobre 2026, mesuré par Jean sur la démonstration) :
   *
   *     REFUS DE DÉMARRER — POSTGRES_PASSWORD est VIDE.
   *
   * Or `.env.prod` la portait, 43 caractères. **Le conteneur `api` ne reçoit
   * pas cette variable** : le compose de production ne lui passe que
   * `DATABASE_URL`, COMPOSÉE depuis `POSTGRES_PASSWORD`. Le contrôle vérifiait
   * donc une variable ABSENTE DU CONTENEUR QU'IL PROTÈGE — il refusait de
   * démarrer sur une configuration parfaitement valide.
   *
   * ⭐ Ce champ oblige à distinguer **ce que l'opérateur ÉDITE** de **ce que le
   * processus LIT**. Les confondre marche tant que les deux coïncident — en
   * développement, les deux existent — et c'est « deux sources qui s'accordent
   * par coïncidence » appliqué à un NOM DE VARIABLE.
   */
  portePar?: { variable: string; extraire: (brut: string) => string | null };
}

/**
 * Le mot de passe d'une URL de connexion PostgreSQL.
 *
 * ⚠ On passe par `URL`, jamais par une expression régulière : un mot de passe
 * peut contenir `@`, `:` et `/` percent-encodés, et `URL` les décode. Un
 * découpage à la main jugerait une chaîne tronquée — donc trop courte — et
 * refuserait un mot de passe FORT.
 */
export function motDePasseDeLUrl(brut: string): string | null {
  try {
    return decodeURIComponent(new URL(brut).password);
  } catch {
    return null;
  }
}

export const SECRETS_DE_PRODUCTION: SecretDeclare[] = [
  {
    variable: 'JWT_SECRET',
    minimum: 32,
    enjeu: 'signer une session de n’importe quel compte de n’importe quelle école',
  },
  {
    variable: 'ADMIN_API_KEY',
    minimum: 24,
    enjeu: 'provisionner des écoles et lire l’état de la plateforme',
    // ⚠ Vide = routes de plateforme désactivées. C'est un choix légitime pour
    // une instance mono-établissement qui n'en a pas besoin.
    videAutorise: true,
  },
  {
    variable: 'POSTGRES_PASSWORD',
    minimum: 24,
    enjeu: 'lire et écrire TOUTE la base, toutes écoles confondues',
    // 🔴 Le conteneur `api` ne reçoit PAS `POSTGRES_PASSWORD` — mesuré sur la
    // démonstration le 6 octobre 2026. On juge donc le mot de passe que
    // `DATABASE_URL` PORTE, et on nomme quand même `POSTGRES_PASSWORD` dans le
    // refus : c'est ce que l'opérateur édite.
    portePar: { variable: 'DATABASE_URL', extraire: motDePasseDeLUrl },
  },
  {
    variable: 'MEILI_MASTER_KEY',
    minimum: 24,
    enjeu: 'lire et modifier l’index de recherche — donc tout le catalogue',
  },
  {
    variable: 'MINIO_ROOT_PASSWORD',
    minimum: 16,
    enjeu:
      'lire et remplacer les fichiers déposés, couvertures et documents — et ' +
      'MinIO sert les couvertures sur un domaine PUBLIC',
  },
  {
    variable: 'OFFLINE_CONTENT_KEK',
    minimum: 40,
    enjeu:
      'déchiffrer TOUS les documents protégés de toutes les écoles (32 octets ' +
      'en base64 font 44 caractères)',
  },
];

/** Un secret est-il faible, connu, ou absent ? Rend le motif, ou `null`. */
export function motifDeRefus(s: SecretDeclare, valeur: string | undefined): string | null {
  // ⚠ Le refus nomme ce que l'opérateur ÉDITE, et dit où le processus l'a LU
  // quand les deux diffèrent. Sans la seconde moitié, « POSTGRES_PASSWORD est
  // VIDE » envoie chercher dans un fichier où la valeur est bien présente — ce
  // qui est exactement ce qui s'est passé le 6 octobre.
  const ou = s.portePar ? ` (lu dans ${s.portePar.variable}, que le conteneur reçoit)` : '';
  const v = (valeur ?? '').trim();
  if (v === '') {
    return s.videAutorise
      ? null
      : `${s.variable}${ou} est VIDE. Un attaquant qui l’obtient peut ${s.enjeu}.`;
  }
  const marqueur = MARQUEURS_DEXEMPLE.find((m) => v.toLowerCase().includes(m.toLowerCase()));
  if (marqueur) {
    return (
      `${s.variable}${ou} porte « ${marqueur} » — c’est une valeur d’EXEMPLE, publiée ` +
      `dans notre propre dépôt. Quiconque la lit peut ${s.enjeu}.`
    );
  }
  if (v.length < s.minimum) {
    return (
      `${s.variable}${ou} fait ${v.length} caractères, ${s.minimum} au minimum. ` +
      `Un attaquant qui la devine peut ${s.enjeu}.`
    );
  }
  return null;
}

/**
 * Tous les motifs de refus, dans l'ordre de la déclaration.
 *
 * ⚠ ELLE REND LA LISTE ENTIÈRE, jamais le premier refus. Un opérateur qui
 * corrige un secret, relance, obtient un second refus, corrige, relance… abandonne
 * au troisième passage. Dire les six d'un coup est la différence entre une
 * procédure et une épreuve.
 */
/**
 * La valeur que le PROCESSUS lit — pas celle que l'opérateur croit avoir posée.
 *
 * ⚠ Quand `portePar` est déclaré et que la variable PORTEUSE est absente, on
 * rend `undefined` : le refus dira « VIDE », ce qui est juste — le conteneur n'a
 * effectivement rien.
 *
 * ⚠ ET ON NE RETOMBE PAS sur `variable`, c'est le point. Un repli vers le nom de
 * l'opérateur ferait PASSER le contrôle en développement (où les deux existent)
 * et le ferait ÉCHOUER en production (où seule l'URL existe) — c'est exactement
 * la divergence qui a coûté un démarrage, et un repli l'aurait rendue invisible.
 */
export function valeurEffective(
  s: SecretDeclare,
  lire: (v: string) => string | undefined,
): string | undefined {
  if (!s.portePar) return lire(s.variable);
  const brut = lire(s.portePar.variable);
  if (brut === undefined || brut.trim() === '') return undefined;
  return s.portePar.extraire(brut) ?? undefined;
}

export function refusDesSecrets(lire: (v: string) => string | undefined): string[] {
  return SECRETS_DE_PRODUCTION.map((s) => motifDeRefus(s, valeurEffective(s, lire))).filter(
    (m): m is string => m !== null,
  );
}
