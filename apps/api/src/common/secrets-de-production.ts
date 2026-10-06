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
  const v = (valeur ?? '').trim();
  if (v === '') {
    return s.videAutorise
      ? null
      : `${s.variable} est VIDE. Un attaquant qui l’obtient peut ${s.enjeu}.`;
  }
  const marqueur = MARQUEURS_DEXEMPLE.find((m) => v.toLowerCase().includes(m.toLowerCase()));
  if (marqueur) {
    return (
      `${s.variable} porte « ${marqueur} » — c’est une valeur d’EXEMPLE, publiée ` +
      `dans notre propre dépôt. Quiconque la lit peut ${s.enjeu}.`
    );
  }
  if (v.length < s.minimum) {
    return (
      `${s.variable} fait ${v.length} caractères, ${s.minimum} au minimum. ` +
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
export function refusDesSecrets(lire: (v: string) => string | undefined): string[] {
  return SECRETS_DE_PRODUCTION.map((s) => motifDeRefus(s, lire(s.variable))).filter(
    (m): m is string => m !== null,
  );
}
