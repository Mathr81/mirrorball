export interface ClockObservation {
  /** `progress_ms` brut renvoyé par Spotify. */
  progressMs: number;
  isPlaying: boolean;
  /** `performance.now()` au moment de la réception de la réponse. */
  receivedAt: number;
  /** Round-trip time mesuré autour de l'appel, en ms. */
  rttMs: number;
}

const SNAP_THRESHOLD_MS = 750;
const CONVERGED_THRESHOLD_MS = 30;
const MAX_RATE_ADJUST = 0.05;
const RATE_DRIFT_DIVISOR = 2000;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Horloge virtuelle qui alimente `currentTime` du composant am-lyrics —
 * jamais la valeur brute du polling. Toute la logique de dérive/convergence
 * vit ici, pure et testable en temps simulé (le pilotage réel se fait via
 * `tick()` appelé en `requestAnimationFrame` par le hook React).
 */
export class VirtualClock {
  private timeMs = 0;
  private rate = 1;
  private playing = false;
  private lastTickAt: number | null = null;
  /** Dérive constatée à la dernière observation — exposée pour le panneau de debug uniquement. */
  private lastDriftMs = 0;

  getTimeMs(): number {
    return this.timeMs;
  }

  getRate(): number {
    return this.rate;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  getLastDriftMs(): number {
    return this.lastDriftMs;
  }

  /** À appeler à chaque frame avec `performance.now()`. N'avance que si en lecture. */
  tick(nowMs: number): void {
    if (this.lastTickAt === null) {
      this.lastTickAt = nowMs;
      return;
    }
    const dtMs = nowMs - this.lastTickAt;
    this.lastTickAt = nowMs;
    if (this.playing && dtMs > 0) {
      this.timeMs += dtMs * this.rate;
    }
  }

  /** Changement de morceau : reset complet, pas de convergence progressive. */
  resetForTrack(initialProgressMs: number, isPlaying: boolean): void {
    this.timeMs = initialProgressMs;
    this.rate = 1;
    this.playing = isPlaying;
    this.lastTickAt = null;
    this.lastDriftMs = 0;
  }

  /**
   * Nouvelle observation de polling. `nowMs` doit être `performance.now()`
   * au moment où l'observation est appliquée (peut être postérieur à
   * `receivedAt` si l'appelant traite la réponse avec un peu de retard).
   */
  observe(obs: ClockObservation, nowMs: number): void {
    this.playing = obs.isPlaying;

    const observedMs = obs.progressMs + (nowMs - obs.receivedAt) + obs.rttMs / 2;
    const driftMs = observedMs - this.timeMs;
    this.lastDriftMs = driftMs;

    if (Math.abs(driftMs) > SNAP_THRESHOLD_MS) {
      // Seek, changement de morceau ou reprise après pause : saut immédiat, jamais progressif.
      this.timeMs = observedMs;
      this.rate = 1;
      return;
    }

    if (!this.playing) {
      // Gelée : elle ne se remet pas à zéro, et la convergence de rate n'a pas de sens à l'arrêt.
      this.rate = 1;
      return;
    }

    if (Math.abs(driftMs) < CONVERGED_THRESHOLD_MS) {
      this.rate = 1;
      return;
    }

    this.rate = 1 + clamp(driftMs / RATE_DRIFT_DIVISOR, -MAX_RATE_ADJUST, MAX_RATE_ADJUST);
  }
}
