/**
 * Cache mémoire à durée de vie courte, pour les réponses PUBLIQUES qu'on ne
 * peut pas laisser recalculer à chaque visite.
 *
 * POURQUOI PAS REDIS. Le conteneur tourne, mais aucun client ne s'y connecte
 * (ni `ioredis` ni `bullmq` dans apps/api) : l'utiliser demanderait une
 * dépendance nouvelle. Pour quatre entiers rafraîchis chaque minute, un cache
 * de processus suffit.
 *
 * ⚠ CE QU'IL N'EST PAS. Il vit DANS le processus : deux instances d'API ont
 * chacune le sien, et un redémarrage le vide. C'est acceptable ici — le pire
 * cas est un comptage de plus — et ce ne le serait pas pour un compteur qui
 * doit être partagé ou survivre.
 *
 * ⚠ IL EST BORNÉ, ET IL DOIT L'ÊTRE. Une entrée périmée n'est retirée que si sa
 * clé est redemandée : sans plafond, un cache dont la clé porte des paramètres
 * d'URL (page, limite…) grandit indéfiniment sur une route PUBLIQUE — il suffit
 * d'itérer `?page=1..100000`. Ce n'était pas un défaut tant que la clé se
 * limitait au slug et à deux valeurs ; ça le devient dès qu'une route paginée
 * s'en sert. D'où le plafond, et l'éviction.
 */
export class CacheMemoireTTL<T> {
  private readonly entrees = new Map<string, { promesse: Promise<T>; expireA: number }>();

  constructor(
    private readonly ttlMs: number,
    /** Horloge injectable : les tests avancent le temps sans attendre. */
    private readonly maintenant: () => number = () => Date.now(),
    /** Plafond d'entrées. Au-delà, on purge le périmé puis on évince le plus ancien. */
    private readonly maxEntrees = 500,
  ) {}

  /** Nombre d'entrées retenues — exposé pour que le plafond soit vérifiable. */
  get taille(): number {
    return this.entrees.size;
  }

  /**
   * Fait de la place AVANT d'insérer : d'abord le périmé (gratuit et sans
   * perte), et seulement si cela ne suffit pas, la plus ancienne entrée — Map
   * conserve l'ordre d'insertion, sa première clé est donc la plus vieille.
   */
  private faireDeLaPlace(): void {
    if (this.entrees.size < this.maxEntrees) return;
    const t = this.maintenant();
    for (const [cle, e] of this.entrees) {
      if (e.expireA <= t) this.entrees.delete(cle);
    }
    while (this.entrees.size >= this.maxEntrees) {
      const plusAncienne = this.entrees.keys().next().value as string | undefined;
      if (plusAncienne === undefined) break;
      this.entrees.delete(plusAncienne);
    }
  }

  async valeur(cle: string, calcul: () => Promise<T>): Promise<T> {
    const existante = this.entrees.get(cle);
    if (existante && existante.expireA > this.maintenant()) {
      return existante.promesse;
    }

    // On mémorise la PROMESSE, pas la valeur : dix visites simultanées sur un
    // cache froid déclenchent alors UN seul comptage, pas dix.
    const promesse = calcul();
    this.faireDeLaPlace();
    this.entrees.set(cle, { promesse, expireA: this.maintenant() + this.ttlMs });

    // ⚠ UN ÉCHEC NE SE MET PAS EN CACHE. Sans cette ligne, une panne d'une
    // seconde serait rejouée à l'identique pendant toute la durée de vie, et
    // l'incident durerait une minute au lieu d'un instant.
    promesse.catch(() => {
      if (this.entrees.get(cle)?.promesse === promesse) {
        this.entrees.delete(cle);
      }
    });

    return promesse;
  }
}
