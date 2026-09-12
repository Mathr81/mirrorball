import { KpoeInstanceHealth } from './instance-health.js';
import { toSearchParams, type KpoeQueryParams } from './query-cascade.js';
import type { KpoeErrorResponse, KpoeResponse } from './types.js';

const TIMEOUT_MS = 12_000;
/** Constaté : 2 requêtes / 10 s côté amont. Marge de sécurité au-delà. */
const MIN_SPACING_MS = 5_500;
/** Deux échecs transport consécutifs avant de considérer le circuit ouvert. */
const CIRCUIT_FAILURE_THRESHOLD = 2;
const CIRCUIT_OPEN_MS = 10 * 60 * 1000;

export type KpoeOutcome = 'syllable' | 'line' | 'not_found' | 'waf' | 'error';

export interface KpoeQueryOutcome {
  response: KpoeResponse | null;
  outcome: KpoeOutcome;
  ms: number;
}

export interface KpoeClientHealth {
  available: boolean;
  circuitOpen: boolean;
  queueDepth: number;
  instances: ReturnType<KpoeInstanceHealth['snapshot']>;
}

function isWaf(status: number, bodyText: string): boolean {
  return status === 429 && (bodyText.includes('error-1015') || bodyText.includes('"error_code":1015') || bodyText.includes('error_code": 1015'));
}

/**
 * Sérialise tous les appels sortants vers KPoe derrière une seule file
 * d'attente (≥5,5 s entre deux requêtes), partagée pour tous les appelants —
 * le rate limit amont est par IP, pas par utilisateur (docs/kpoe-findings.md §2).
 */
export class KpoeClient {
  private readonly health = new KpoeInstanceHealth();
  private queue: Promise<void> = Promise.resolve();
  private queueDepth = 0;
  private lastRequestAt = 0;
  private consecutiveTransportFailures = 0;
  private circuitOpenUntil = 0;

  constructor(private readonly userAgent: string) {}

  getHealth(): KpoeClientHealth {
    const now = Date.now();
    return {
      available: this.health.getPrimary() !== null,
      circuitOpen: now < this.circuitOpenUntil,
      queueDepth: this.queueDepth,
      instances: this.health.snapshot(),
    };
  }

  /** Exécute la cascade fournie, s'arrête au premier succès. Renvoie aussi le temps total passé en file. */
  async runCascade(attempts: KpoeQueryParams[]): Promise<{ result: KpoeQueryOutcome | null; queuedMs: number }> {
    let queuedMs = 0;
    let last: KpoeQueryOutcome | null = null;
    for (const params of attempts) {
      const { result, queuedMs: waited } = await this.scheduled(() => this.queryOnce(params));
      queuedMs += waited;
      last = result;
      if (result.outcome === 'syllable' || result.outcome === 'line') {
        return { result, queuedMs };
      }
      if (result.outcome === 'waf' || result.outcome === 'error') {
        // Panne infra ou bannissement : inutile d'épuiser le reste de la cascade.
        return { result, queuedMs };
      }
      // 'not_found' → on tente l'étape suivante de la cascade, s'il y en a une.
    }
    return { result: last, queuedMs };
  }

  private scheduled<T>(fn: () => Promise<T>): Promise<{ result: T; queuedMs: number }> {
    const enqueuedAt = Date.now();
    this.queueDepth++;
    const run = this.queue.then(async () => {
      const now = Date.now();
      const since = now - this.lastRequestAt;
      if (since < MIN_SPACING_MS) {
        await new Promise((r) => setTimeout(r, MIN_SPACING_MS - since));
      }
      this.lastRequestAt = Date.now();
      const queuedMs = this.lastRequestAt - enqueuedAt;
      const result = await fn();
      this.queueDepth--;
      return { result, queuedMs };
    });
    // Chaîne la suite de la file sur cette requête (succès ou échec), sans propager l'erreur au-delà.
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async queryOnce(params: KpoeQueryParams): Promise<KpoeQueryOutcome> {
    const now = Date.now();
    if (now < this.circuitOpenUntil) {
      return { response: null, outcome: 'waf', ms: 0 };
    }

    const base = this.health.getPrimary();
    if (!base) {
      return { response: null, outcome: 'error', ms: 0 };
    }

    const url = new URL('/v2/lyrics/get', base);
    url.search = toSearchParams(params).toString();

    const started = performance.now();
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: ctl.signal,
        headers: { accept: 'application/json', 'user-agent': this.userAgent },
      });
      const bodyText = await res.text();
      const ms = Math.round(performance.now() - started);

      if (res.status === 200) {
        this.health.recordSuccess(base, ms);
        this.consecutiveTransportFailures = 0;
        const parsed = JSON.parse(bodyText) as KpoeResponse;
        return { response: parsed, outcome: parsed.type === 'Word' ? 'syllable' : 'line', ms };
      }

      if (res.status === 404) {
        this.health.recordSuccess(base, ms);
        this.consecutiveTransportFailures = 0;
        return { response: null, outcome: 'not_found', ms };
      }

      if (isWaf(res.status, bodyText)) {
        this.openCircuit();
        this.health.recordFailure(base, 'waf-1015');
        return { response: null, outcome: 'waf', ms };
      }

      if (res.status === 429) {
        // 429 applicatif « soft » (pas de bannissement WAF) : pas d'ouverture de circuit,
        // juste un échec de cette tentative — la prochaine passera par le respect du spacing.
        return { response: null, outcome: 'error', ms };
      }

      this.recordTransportFailure(base, `http-${res.status}`);
      return { response: null, outcome: 'error', ms };
    } catch (err) {
      const ms = Math.round(performance.now() - started);
      this.recordTransportFailure(base, err instanceof Error ? err.message : String(err));
      return { response: null, outcome: 'error', ms };
    } finally {
      clearTimeout(timer);
    }
  }

  private recordTransportFailure(base: string, reason: string): void {
    this.health.recordFailure(base, reason);
    this.consecutiveTransportFailures++;
    if (this.consecutiveTransportFailures >= CIRCUIT_FAILURE_THRESHOLD) {
      this.openCircuit();
    }
  }

  private openCircuit(): void {
    this.circuitOpenUntil = Date.now() + CIRCUIT_OPEN_MS;
  }

  /** Réponse type d'échec applicatif, pour typer les erreurs KPoe côté appelant si besoin. */
  static isKpoeError(body: unknown): body is KpoeErrorResponse {
    return typeof body === 'object' && body !== null && 'error' in body;
  }
}
