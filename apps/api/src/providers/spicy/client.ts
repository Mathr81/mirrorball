import { SpicyCircuitBreaker, TRANSPORT_FAILURE_STATUSES } from './circuit-breaker.js';

const QUERY_URL = 'https://api.spicylyrics.org/query';
// Constatée dans docs/spicy-lyrics-api.md — non versionnée côté API, peut se périmer.
const CLIENT_VERSION = '6.3.12';

export interface SpicyRpcQuery {
  operationId?: string;
  operation: 'lyrics' | 'createSession' | 'refreshSession' | 'ping' | 'pingConfig';
  variables: Record<string, unknown>;
}

export interface SpicyRpcResult {
  httpStatus: number;
  data: unknown;
  format?: 'json' | 'text';
}

/** Échec transport (réseau, ou code parmi ceux du disjoncteur §7) — distinct d'un httpStatus applicatif. */
export class SpicyTransportError extends Error {
  constructor(readonly status: number) {
    super(`spicy: transport error (status ${status})`);
  }
}

export interface SpicyClientHealth {
  circuitOpen: boolean;
}

/**
 * Client RPC batché `/query`. Choix délibéré, conforme à l'instruction du
 * projet : on n'envoie PAS l'Origin/Referer/User-Agent du client officiel
 * Spotify que l'API attend probablement en pratique (docs/spicy-lyrics-api.md
 * §2 et §8) — on s'identifie honnêtement. Conséquence assumée : l'API peut
 * rejeter ou limiter davantage un client qui ne se présente pas comme prévu ;
 * l'orchestrateur traite ça comme une panne de provider normale et dégrade
 * vers KPoe/LRCLIB (jamais d'erreur remontée à l'UI).
 */
export class SpicyClient {
  private readonly breaker = new SpicyCircuitBreaker();

  constructor(
    private readonly userAgent: string,
    private readonly appOrigin: string,
  ) {}

  getHealth(): SpicyClientHealth {
    return { circuitOpen: this.breaker.isOpen() };
  }

  async call(queries: SpicyRpcQuery[], webAuthToken?: string): Promise<SpicyRpcResult[]> {
    const now = Date.now();
    if (this.breaker.isOpen(now) && !this.breaker.canProbe(now)) {
      throw new SpicyTransportError(0);
    }

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: '*/*',
      'spicylyrics-version': CLIENT_VERSION,
      'x-mode': '2',
      'user-agent': this.userAgent,
      origin: this.appOrigin,
      referer: this.appOrigin,
    };
    if (webAuthToken) headers['spicylyrics-webauth'] = `Bearer ${webAuthToken}`;

    const body = JSON.stringify({ queries, client: { version: CLIENT_VERSION } });

    let res: Response;
    try {
      res = await fetch(QUERY_URL, { method: 'POST', headers, body });
    } catch {
      this.breaker.recordFailure();
      throw new SpicyTransportError(0);
    }

    if (TRANSPORT_FAILURE_STATUSES.has(res.status)) {
      const retryAfterHeader = res.headers.get('retry-after');
      const retryAfter = retryAfterHeader !== null ? Number(retryAfterHeader) : undefined;
      this.breaker.recordFailure(Number.isFinite(retryAfter) ? retryAfter : undefined);
      throw new SpicyTransportError(res.status);
    }

    this.breaker.recordSuccess();
    const envelope = (await res.json()) as { queries: Array<{ operationId?: string; result: SpicyRpcResult }> };
    return envelope.queries.map((q) => q.result);
  }

  /**
   * Une seule query, avec retry doux sur `result.httpStatus === 503`
   * (mise en file côté serveur, pas une panne transport — ne touche pas au
   * disjoncteur). Plafond 10s, backoff ×1.5 depuis 2s.
   */
  async callSingleWithSoftRetry(query: SpicyRpcQuery, webAuthToken?: string): Promise<SpicyRpcResult> {
    let waitMs = 2000;
    for (let attempt = 0; attempt < 5; attempt++) {
      const [result] = await this.call([query], webAuthToken);
      if (!result || result.httpStatus !== 503) return result ?? { httpStatus: 502, data: null };
      await new Promise((r) => setTimeout(r, waitMs));
      waitMs = Math.min(waitMs * 1.5, 10_000);
    }
    return { httpStatus: 503, data: null };
  }
}
