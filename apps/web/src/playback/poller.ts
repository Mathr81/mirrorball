import { pollCurrentlyPlaying, PollError, type PollResult } from './spotify-api.js';

const DEFAULT_INTERVAL_MS = 3000;
const MAX_BACKOFF_MS = 60_000;

export interface PlaybackPollerOptions {
  getAccessToken: () => Promise<string | undefined>;
  onResult: (result: PollResult) => void;
  onError: (err: PollError) => void;
  intervalMs?: number;
  /** Injectable pour les tests — par défaut `document`. */
  doc?: Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'>;
}

/**
 * Boucle de polling. Respecte `Retry-After` sur 429 avec un backoff
 * exponentiel par-dessus (au cas où l'en-tête serait absent ou trop court),
 * et suspend complètement le polling quand l'onglet est caché — reprise
 * immédiate au retour.
 */
export class PlaybackPoller {
  private readonly doc: Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'>;
  private readonly intervalMs: number;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stopped = true;
  private consecutive429 = 0;

  constructor(private readonly options: PlaybackPollerOptions) {
    this.doc = options.doc ?? document;
    this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.doc.addEventListener('visibilitychange', this.handleVisibility);
    if (!this.doc.hidden) this.scheduleNext(0);
  }

  stop(): void {
    this.stopped = true;
    this.doc.removeEventListener('visibilitychange', this.handleVisibility);
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  /** Force un poll immédiat (ex. juste après un seek), sans attendre le prochain créneau. */
  pollNow(): void {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.scheduleNext(0);
  }

  private handleVisibility = (): void => {
    if (this.doc.hidden) {
      if (this.timer) clearTimeout(this.timer);
    } else if (!this.stopped) {
      this.scheduleNext(0);
    }
  };

  private scheduleNext(delayMs: number): void {
    if (this.stopped || this.doc.hidden) return;
    this.timer = setTimeout(() => void this.tick(), delayMs);
  }

  private async tick(): Promise<void> {
    const token = await this.options.getAccessToken();
    if (!token) {
      this.scheduleNext(this.intervalMs);
      return;
    }

    try {
      const result = await pollCurrentlyPlaying(token);
      this.consecutive429 = 0;
      this.options.onResult(result);
      this.scheduleNext(this.intervalMs);
    } catch (err) {
      if (!(err instanceof PollError)) {
        this.scheduleNext(this.intervalMs);
        return;
      }
      this.options.onError(err);
      if (err.kind === 'rate_limited') {
        this.consecutive429++;
        const backoff = Math.min(this.intervalMs * 2 ** this.consecutive429, MAX_BACKOFF_MS);
        this.scheduleNext(Math.max(err.retryAfterMs ?? 0, backoff));
      } else {
        this.consecutive429 = 0;
        this.scheduleNext(this.intervalMs);
      }
    }
  }
}
