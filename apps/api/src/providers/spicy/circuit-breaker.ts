/**
 * Disjoncteur transport pour Spicy Lyrics — distinct du retry doux sur
 * `result.httpStatus === 503` (file d'attente applicative, cf. client.ts).
 * Reprend tel quel docs/spicy-lyrics-api.md §7 : codes déclencheurs,
 * seuil de 2 échecs, paliers 120→300→900→1800s + jitter 0.5×–1.5×,
 * redescente au premier palier après 1h de calme, sonde autorisée toutes
 * les 30s même circuit ouvert.
 */
export const TRANSPORT_FAILURE_STATUSES: ReadonlySet<number> = new Set([403, 408, 425, 429, 500, 502, 503, 504]);

const TIER_SECONDS = [120, 300, 900, 1800];
const FAILURE_THRESHOLD = 2;
const CALM_RESET_MS = 60 * 60 * 1000;
const PROBE_INTERVAL_MS = 30_000;

export class SpicyCircuitBreaker {
  private openUntil = 0;
  private tier = -1;
  private consecutiveFailures = 0;
  private lastFailureAt = 0;
  private lastProbeAt = 0;

  constructor(private readonly random: () => number = Math.random) {}

  isOpen(now = Date.now()): boolean {
    return now < this.openUntil;
  }

  /** Une requête sonde passe même circuit ouvert, au plus une fois par 30s. */
  canProbe(now = Date.now()): boolean {
    if (!this.isOpen(now)) return true;
    if (now - this.lastProbeAt >= PROBE_INTERVAL_MS) {
      this.lastProbeAt = now;
      return true;
    }
    return false;
  }

  recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.openUntil = 0;
  }

  recordFailure(retryAfterSec?: number, now = Date.now()): void {
    if (this.lastFailureAt !== 0 && now - this.lastFailureAt > CALM_RESET_MS) {
      this.tier = -1;
      this.consecutiveFailures = 0;
    }
    this.consecutiveFailures++;
    this.lastFailureAt = now;

    if (this.consecutiveFailures < FAILURE_THRESHOLD) return;

    this.tier = Math.min(this.tier + 1, TIER_SECONDS.length - 1);
    const base = TIER_SECONDS[this.tier]! * 1000;
    const jitterFactor = 0.5 + this.random(); // 0.5x – 1.5x
    const waitMs = Math.max(base * jitterFactor, (retryAfterSec ?? 0) * 1000);
    this.openUntil = now + waitMs;
  }
}
