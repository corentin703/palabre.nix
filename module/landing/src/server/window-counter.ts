/** Compteur par clé (une IP) sur une fenêtre de temps fixe. */
export class WindowCounter {
  private readonly entries = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Compte un événement et retourne le total de la fenêtre en cours (1 pour le premier). */
  increment(key: string): number {
    const now = this.now();
    const entry = this.entries.get(key);
    if (!entry || now > entry.resetAt) {
      this.entries.set(key, { count: 1, resetAt: now + this.windowMs });
      return 1;
    }
    entry.count += 1;
    return entry.count;
  }

  /** Total de la fenêtre en cours, sans rien compter. */
  peek(key: string): number {
    const entry = this.entries.get(key);
    return !entry || this.now() > entry.resetAt ? 0 : entry.count;
  }

  reset(key: string): void {
    this.entries.delete(key);
  }
}

/**
 * Au plus `max` événements par clé et par fenêtre. Anti-abus minimal : un salon PlugNMeet
 * consomme de vraies ressources (salle LiveKit). Ce n'est pas une protection contre un attaquant
 * distribué, juste un frein au spam trivial.
 */
export class RateLimiter {
  private readonly counter: WindowCounter;

  constructor(
    windowMs: number,
    private readonly max: number,
    now?: () => number,
  ) {
    this.counter = new WindowCounter(windowMs, now);
  }

  /** Compte un événement ; vrai s'il dépasse la limite. */
  hit(key: string): boolean {
    return this.counter.increment(key) > this.max;
  }
}
