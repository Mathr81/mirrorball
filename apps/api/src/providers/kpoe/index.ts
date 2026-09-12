import type { Provider, ProviderQuery, ProviderResult } from '../provider.js';
import { KpoeClient, type KpoeClientHealth, type KpoeOutcome } from './client.js';
import { buildKpoeCascade } from './query-cascade.js';
import { kpoeToIr } from './to-ir.js';

/** Panne infra (transport HS ou bannissement WAF) — distincte d'un simple « pas de paroles ». */
export class KpoeProviderError extends Error {
  constructor(
    readonly outcome: Extract<KpoeOutcome, 'waf' | 'error'>,
    readonly ms: number,
  ) {
    super(`kpoe: ${outcome}`);
  }
}

export class KpoeProvider implements Provider<KpoeClientHealth> {
  readonly name = 'kpoe' as const;
  private readonly client: KpoeClient;

  constructor(userAgent: string) {
    this.client = new KpoeClient(userAgent);
  }

  async fetch(query: ProviderQuery): Promise<ProviderResult | null> {
    const attempts = buildKpoeCascade(query);
    if (attempts.length === 0) return null;

    const started = performance.now();
    const { result, queuedMs } = await this.client.runCascade(attempts);
    const ms = Math.round(performance.now() - started);

    if (!result) return null;
    if (result.outcome === 'waf' || result.outcome === 'error') {
      throw new KpoeProviderError(result.outcome, ms);
    }
    if (!result.response) return null; // not_found

    return { doc: kpoeToIr(result.response), ms, queuedMs };
  }

  health(): KpoeClientHealth {
    return this.client.getHealth();
  }
}

export { KPOE_BASE_URLS } from './instance-health.js';
export { buildKpoeCascade } from './query-cascade.js';
export { kpoeToIr } from './to-ir.js';
